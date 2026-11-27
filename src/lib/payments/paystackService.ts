import crypto from 'node:crypto';
import {
  TIER_RULES,
  PLAN_PERIOD_DAYS,
  MS_PER_DAY,
  calculateProToPremiumUpgradeQuote,
} from '@/lib/tiers';
import {
  getLocalDatabase,
  isProductionRuntime,
  persistenceBackendInfo,
} from '@/lib/supabase/client';
import {
  evaluateDuePendingTierTransition,
  getSupabaseServiceClient,
  normalizePendingTier,
  normalizeRole,
  normalizeTier,
  type AccountRole,
  type AccountTier,
} from '@/lib/supabase/serverAuth';

export type PaidPlanId = 'pro' | 'premium';

export type CheckoutQuoteMode = 'new' | 'renewal' | 'upgrade' | 'downgrade_schedule' | 'admin_blocked';

export interface CheckoutQuoteResult {
  allowed: boolean;
  mode: CheckoutQuoteMode;
  targetPlan: PaidPlanId;
  currentTier: AccountTier;
  isActivePaid: boolean;
  basePriceNgn: number;
  amountNgn: number;
  amountKobo: number;
  creditNgn: number;
  remainingDays: number;
  remainingWholeDays: number;
  currentExpiresAt: string | null;
  newExpiryIso: string | null;
  reason?: string;
}

export interface UserPaymentReceipt {
  id: string;
  reference: string;
  plan: string;
  amountKobo: number;
  currency: string;
  status: string;
  channel: string | null;
  isManualGrant: boolean;
  paidAt: string | null;
  createdAt: string;
}

const SENSITIVE_CARD_KEYS = new Set([
  'authorization',
  'authorization_code',
  'card',
  'card_number',
  'card_type',
  'cvv',
  'exp_month',
  'exp_year',
  'last4',
  'bin',
  'pan',
  'bank',
  'account_name',
  'reusable',
  'signature',
  'brand',
]);

/**
 * Strips all card / bank authorization details from Paystack API or webhook payloads
 * so zero card data is ever persisted in paystack_payments.
 */
export function sanitizePaystackPayload(input: unknown): Record<string, any> | null {
  if (input === null || input === undefined) return null;

  const sanitizeNode = (val: unknown, depth: number): unknown => {
    if (depth > 8) return undefined;
    if (val === null || val === undefined) return val;
    if (typeof val !== 'object') return val;
    if (Array.isArray(val)) {
      return val.map((item) => sanitizeNode(item, depth + 1)).filter((item) => item !== undefined);
    }
    const out: Record<string, any> = {};
    for (const [key, rawChild] of Object.entries(val as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_CARD_KEYS.has(lowerKey)) {
        continue;
      }
      const cleaned = sanitizeNode(rawChild, depth + 1);
      if (cleaned !== undefined) {
        out[key] = cleaned;
      }
    }
    return out;
  };

  const result = sanitizeNode(input, 0);
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return result as Record<string, any>;
  }
  return null;
}

export function resolvePaystackSecretKey(): string {
  return (
    process.env.PAYSTACK_SECRET_KEY?.trim() ||
    process.env.PAYMENT_SECRET_KEY?.trim() ||
    process.env.PAYMENT_WEBHOOK_SECRET?.trim() ||
    ''
  );
}

/**
 * Canonical Paystack plan settings sourced exclusively from src/lib/tiers.ts.
 * Manual monthly payments only (never attaches subscription plan_code for auto-charge).
 */
export function getPaystackPlanSettings(plan: PaidPlanId): {
  plan: PaidPlanId;
  amountKobo: number;
  amountNgn: number;
  durationDays: number;
} {
  const rule = TIER_RULES[plan];
  return {
    plan,
    amountKobo: rule.amountKobo,
    amountNgn: rule.monthlyPriceNgn,
    durationDays: rule.periodDays,
  };
}

export function verifyPaystackWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!secret || !signature) return false;
  const expectedHash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature.trim(), 'utf8');
  const expBuf = Buffer.from(expectedHash, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function computeCheckoutQuoteForProfile(
  profile: {
    role?: AccountRole | string | null;
    tier?: AccountTier | string | null;
    storedTier?: AccountTier | string | null;
    tierExpiresAt?: string | null;
    pendingTier?: string | null;
    pendingTierEffectiveAt?: string | null;
  },
  targetPlan: PaidPlanId,
  nowMs: number = Date.now()
): CheckoutQuoteResult {
  const role = normalizeRole(profile.role);
  const rawStoredTier = normalizeTier(profile.storedTier ?? profile.tier);
  const transition = evaluateDuePendingTierTransition(
    {
      role,
      tier: rawStoredTier,
      tierExpiresAt: profile.tierExpiresAt ?? null,
      pendingTier: profile.pendingTier ?? null,
      pendingTierEffectiveAt: profile.pendingTierEffectiveAt ?? null,
    },
    nowMs
  );
  const currentTier: AccountTier =
    transition.due && transition.nextTier ? transition.nextTier : rawStoredTier;
  const currentExpiresAt = profile.tierExpiresAt ?? null;
  const basePriceNgn = TIER_RULES[targetPlan].monthlyPriceNgn;

  if (role === 'admin') {
    return {
      allowed: false,
      mode: 'admin_blocked',
      targetPlan,
      currentTier: 'premium',
      isActivePaid: true,
      basePriceNgn,
      amountNgn: 0,
      amountKobo: 0,
      creditNgn: 0,
      remainingDays: 0,
      remainingWholeDays: 0,
      currentExpiresAt: null,
      newExpiryIso: null,
      reason: 'Admin: full access accounts do not require payment.',
    };
  }

  const expMs = currentExpiresAt ? Date.parse(currentExpiresAt) : NaN;
  const hasFutureExpiry =
    (currentTier === 'pro' || currentTier === 'premium') &&
    (!currentExpiresAt || (Number.isFinite(expMs) && expMs > nowMs));
  const isActivePaid = Boolean(hasFutureExpiry);

  const remainingDays =
    isActivePaid && Number.isFinite(expMs) && expMs > nowMs
      ? Math.min(PLAN_PERIOD_DAYS, Math.max(0, (expMs - nowMs) / MS_PER_DAY))
      : 0;
  const remainingWholeDays = Math.ceil(remainingDays);

  if (isActivePaid && currentTier === 'premium' && targetPlan === 'pro') {
    return {
      allowed: true,
      mode: 'downgrade_schedule',
      targetPlan: 'pro',
      currentTier,
      isActivePaid: true,
      basePriceNgn: TIER_RULES.pro.monthlyPriceNgn,
      amountNgn: 0,
      amountKobo: 0,
      creditNgn: 0,
      remainingDays,
      remainingWholeDays,
      currentExpiresAt,
      newExpiryIso: currentExpiresAt,
    };
  }

  if (isActivePaid && currentTier === 'pro' && targetPlan === 'premium') {
    const quote = calculateProToPremiumUpgradeQuote({
      tierExpiresAt: currentExpiresAt,
      nowMs,
    });
    return {
      allowed: true,
      mode: 'upgrade',
      targetPlan: 'premium',
      currentTier,
      isActivePaid: true,
      basePriceNgn: quote.basePriceNgn,
      amountNgn: quote.chargeNgn,
      amountKobo: quote.chargeKobo,
      creditNgn: quote.creditNgn,
      remainingDays: quote.remainingDays,
      remainingWholeDays: quote.remainingWholeDays,
      currentExpiresAt,
      newExpiryIso: quote.newExpiryIso,
    };
  }

  if (isActivePaid && currentTier === targetPlan && Number.isFinite(expMs) && expMs > nowMs) {
    return {
      allowed: true,
      mode: 'renewal',
      targetPlan,
      currentTier,
      isActivePaid: true,
      basePriceNgn,
      amountNgn: basePriceNgn,
      amountKobo: TIER_RULES[targetPlan].amountKobo,
      creditNgn: 0,
      remainingDays,
      remainingWholeDays,
      currentExpiresAt,
      newExpiryIso: new Date(expMs + PLAN_PERIOD_DAYS * MS_PER_DAY).toISOString(),
    };
  }

  return {
    allowed: true,
    mode: 'new',
    targetPlan,
    currentTier,
    isActivePaid,
    basePriceNgn,
    amountNgn: basePriceNgn,
    amountKobo: TIER_RULES[targetPlan].amountKobo,
    creditNgn: 0,
    remainingDays: 0,
    remainingWholeDays: 0,
    currentExpiresAt,
    newExpiryIso: new Date(nowMs + PLAN_PERIOD_DAYS * MS_PER_DAY).toISOString(),
  };
}

function getStorageBackend() {
  const backend = persistenceBackendInfo();
  const serviceClient = getSupabaseServiceClient();
  if (backend.isRemoteSupabase || serviceClient) {
    if (!serviceClient) {
      throw new Error(backend.message);
    }
    return { mode: 'supabase' as const, serviceClient, db: null };
  }
  if (isProductionRuntime()) {
    throw new Error(backend.message);
  }
  const db = getLocalDatabase();
  if (!db) {
    throw new Error('Local database unavailable.');
  }
  return { mode: 'sqlite' as const, serviceClient: null, db };
}

export async function getRawProfileSubscriptionState(userId: string): Promise<{
  id: string;
  email: string;
  role: AccountRole;
  tier: AccountTier;
  tierExpiresAt: string | null;
  pendingTier: 'pro' | 'premium' | null;
  pendingTierEffectiveAt: string | null;
  cancelAtPeriodEnd: boolean;
} | null> {
  const storage = getStorageBackend();
  const nowMs = Date.now();

  if (storage.mode === 'supabase') {
    const { data, error } = await storage.serviceClient
      .from('profiles')
      .select(
        'id, email, role, tier, tier_expires_at, pending_tier, pending_tier_effective_at, cancel_at_period_end'
      )
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;

    const transition = evaluateDuePendingTierTransition(
      {
        role: data.role,
        tier: data.tier,
        tierExpiresAt: data.tier_expires_at,
        pendingTier: data.pending_tier,
        pendingTierEffectiveAt: data.pending_tier_effective_at,
      },
      nowMs
    );

    if (transition.due && transition.nextTier) {
      await storage.serviceClient
        .from('profiles')
        .update({
          tier: transition.nextTier,
          pending_tier: null,
          pending_tier_effective_at: null,
        })
        .eq('id', userId);
      data.tier = transition.nextTier;
      data.pending_tier = null;
      data.pending_tier_effective_at = null;
    }

    return {
      id: String(data.id),
      email: String(data.email || ''),
      role: normalizeRole(data.role),
      tier: normalizeTier(data.tier),
      tierExpiresAt: data.tier_expires_at ? String(data.tier_expires_at) : null,
      pendingTier: normalizePendingTier(data.pending_tier),
      pendingTierEffectiveAt: data.pending_tier_effective_at
        ? String(data.pending_tier_effective_at)
        : null,
      cancelAtPeriodEnd: Boolean(data.cancel_at_period_end === true || data.cancel_at_period_end === 1),
    };
  }

  const row = storage.db
    .prepare(
      `SELECT id, email, role, tier, tier_expires_at, pending_tier, pending_tier_effective_at, cancel_at_period_end FROM profiles WHERE id = ? LIMIT 1`
    )
    .get(userId) as Record<string, any> | undefined;
  if (!row) return null;

  const transition = evaluateDuePendingTierTransition(
    {
      role: row.role,
      tier: row.tier,
      tierExpiresAt: row.tier_expires_at,
      pendingTier: row.pending_tier,
      pendingTierEffectiveAt: row.pending_tier_effective_at,
    },
    nowMs
  );

  if (transition.due && transition.nextTier) {
    storage.db
      .prepare(
        `UPDATE profiles SET tier = ?, pending_tier = NULL, pending_tier_effective_at = NULL WHERE id = ?`
      )
      .run(transition.nextTier, userId);
    row.tier = transition.nextTier;
    row.pending_tier = null;
    row.pending_tier_effective_at = null;
  }

  return {
    id: String(row.id),
    email: String(row.email || ''),
    role: normalizeRole(row.role),
    tier: normalizeTier(row.tier),
    tierExpiresAt: row.tier_expires_at ? String(row.tier_expires_at) : null,
    pendingTier: normalizePendingTier(row.pending_tier),
    pendingTierEffectiveAt: row.pending_tier_effective_at
      ? String(row.pending_tier_effective_at)
      : null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end === 1 || row.cancel_at_period_end === true),
  };
}

export async function createPendingCheckoutRecord(params: {
  reference: string;
  userId: string;
  email: string;
  plan: PaidPlanId;
  quote: CheckoutQuoteResult;
}): Promise<void> {
  const storage = getStorageBackend();
  const nowIso = new Date().toISOString();
  const meta = {
    checkout_mode: params.quote.mode,
    base_price_ngn: params.quote.basePriceNgn,
    credit_ngn: params.quote.creditNgn,
    expected_amount_kobo: params.quote.amountKobo,
    remaining_days: Number(params.quote.remainingDays.toFixed(4)),
  };

  if (storage.mode === 'supabase') {
    await storage.serviceClient.from('paystack_payments').upsert(
      {
        user_id: params.userId,
        email: params.email.toLowerCase().trim(),
        reference: params.reference,
        plan: params.plan,
        amount_kobo: params.quote.amountKobo,
        currency: 'NGN',
        status: 'pending',
        channel: 'paystack',
        is_manual_grant: false,
        paid_at: null,
        metadata: meta,
        raw_webhook: null,
        created_at: nowIso,
      },
      { onConflict: 'reference' }
    );
    return;
  }

  storage.db
    .prepare(
      `INSERT INTO paystack_payments (
        id, user_id, email, reference, plan, amount_kobo, currency, status, channel,
        is_manual_grant, paid_at, metadata, raw_webhook, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'NGN', 'pending', 'paystack', 0, NULL, ?, NULL, ?)
      ON CONFLICT(reference) DO NOTHING`
    )
    .run(
      crypto.randomUUID(),
      params.userId,
      params.email.toLowerCase().trim(),
      params.reference,
      params.plan,
      params.quote.amountKobo,
      JSON.stringify(meta),
      nowIso
    );
}

export async function applyPaystackPaymentRecord(params: {
  reference: string;
  userId?: string | null;
  customerEmail?: string | null;
  planRaw?: string | null;
  amountKobo: number;
  currency?: string;
  status: string;
  channel?: string | null;
  paidAt?: string | null;
  durationDays?: number;
  metadata?: unknown;
  rawWebhook?: unknown;
  nowMs?: number;
}): Promise<{
  applied: boolean;
  alreadyProcessed: boolean;
  userId: string | null;
  plan: PaidPlanId;
  status: string;
  tierExpiresAt: string | null;
  errorReason?: string;
}> {
  const normalizedPlan: PaidPlanId = normalizeTier(params.planRaw) === 'premium' ? 'premium' : 'pro';
  const durationDays = Math.max(1, Math.round(Number(params.durationDays) || PLAN_PERIOD_DAYS));
  const currency = (params.currency || 'NGN').toUpperCase();
  const rawStatus = String(params.status || 'pending').toLowerCase();
  const customerEmail = params.customerEmail ? params.customerEmail.toLowerCase().trim() : null;
  const channel = params.channel || 'paystack';
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const paidAt = params.paidAt || (rawStatus === 'success' ? nowIso : null);
  const amountKobo = Math.max(0, Math.round(Number(params.amountKobo) || 0));

  const sanitizedMeta = sanitizePaystackPayload(params.metadata) ?? {};
  const sanitizedWebhook = sanitizePaystackPayload(params.rawWebhook ?? params.metadata);

  const storage = getStorageBackend();

  if (storage.mode === 'supabase') {
    const sc = storage.serviceClient;
    const { data: existingPay } = await sc
      .from('paystack_payments')
      .select('id, user_id, plan, amount_kobo, status, metadata')
      .eq('reference', params.reference)
      .maybeSingle();

    let userId: string | null = params.userId
      ? String(params.userId)
      : existingPay?.user_id
      ? String(existingPay.user_id)
      : null;

    if (!userId && customerEmail) {
      const { data: prof } = await sc
        .from('profiles')
        .select('id')
        .eq('email', customerEmail)
        .maybeSingle();
      if (prof?.id) userId = String(prof.id);
    }

    // Idempotency: duplicate delivery for an already-succeeded reference never extends again
    if (existingPay && String(existingPay.status || '').toLowerCase() === 'success') {
      let existingExpiresAt: string | null = null;
      if (userId) {
        const prof = await getRawProfileSubscriptionState(userId);
        existingExpiresAt = prof?.tierExpiresAt ?? null;
      }
      return {
        applied: false,
        alreadyProcessed: true,
        userId,
        plan: normalizeTier(existingPay.plan) === 'premium' ? 'premium' : 'pro',
        status: 'success',
        tierExpiresAt: existingExpiresAt,
      };
    }

    // Validate expected amount & currency when payment claims success
    let effectiveStatus = rawStatus;
    let errorReason: string | undefined;
    if (rawStatus === 'success') {
      const existingMeta =
        existingPay?.metadata && typeof existingPay.metadata === 'object'
          ? (existingPay.metadata as Record<string, any>)
          : {};
      const expectedKoboFromRecord =
        existingPay && Number(existingPay.amount_kobo) > 0
          ? Number(existingPay.amount_kobo)
          : Number(existingMeta.expected_amount_kobo ?? sanitizedMeta?.expected_amount_kobo);
      const minExpectedKobo =
        Number.isFinite(expectedKoboFromRecord) && expectedKoboFromRecord >= 0
          ? expectedKoboFromRecord
          : normalizedPlan === 'pro'
          ? TIER_RULES.pro.amountKobo
          : 200000;

      if (currency !== 'NGN' || amountKobo < minExpectedKobo) {
        effectiveStatus = 'failed';
        errorReason = `Amount or currency verification failed (received ${currency} ${amountKobo} kobo, expected at least ${minExpectedKobo} kobo).`;
      }
    }

    await sc.from('paystack_payments').upsert(
      {
        user_id: userId,
        email: customerEmail,
        reference: params.reference,
        plan: normalizedPlan,
        amount_kobo: amountKobo,
        currency,
        status: effectiveStatus,
        channel,
        is_manual_grant: false,
        paid_at: effectiveStatus === 'success' ? paidAt : null,
        metadata: {
          ...sanitizedMeta,
          ...(errorReason ? { verification_error: errorReason } : {}),
        },
        raw_webhook: sanitizedWebhook,
        created_at: nowIso,
      },
      { onConflict: 'reference' }
    );

    let tierExpiresAt: string | null = null;
    if (effectiveStatus === 'success' && userId) {
      const currentProf = await getRawProfileSubscriptionState(userId);
      const currentExpMs = currentProf?.tierExpiresAt ? Date.parse(currentProf.tierExpiresAt) : NaN;
      const isSamePlanActiveRenewal =
        currentProf &&
        currentProf.tier === normalizedPlan &&
        Number.isFinite(currentExpMs) &&
        currentExpMs > nowMs;

      const baseMs = isSamePlanActiveRenewal ? currentExpMs : nowMs;
      tierExpiresAt = new Date(baseMs + durationDays * MS_PER_DAY).toISOString();

      await sc
        .from('profiles')
        .update({
          tier: normalizedPlan,
          tier_expires_at: tierExpiresAt,
          pending_tier: null,
          pending_tier_effective_at: null,
          cancel_at_period_end: false,
          renewal_reminder_sent_at: null,
        })
        .eq('id', userId);
    }

    return {
      applied: effectiveStatus === 'success' && Boolean(userId),
      alreadyProcessed: false,
      userId,
      plan: normalizedPlan,
      status: effectiveStatus,
      tierExpiresAt,
      ...(errorReason ? { errorReason } : {}),
    };
  }

  // SQLite branch
  const db = storage.db;
  const existingPay = db
    .prepare(`SELECT id, user_id, plan, amount_kobo, status, metadata FROM paystack_payments WHERE reference = ? LIMIT 1`)
    .get(params.reference) as
    | {
        id: string;
        user_id: string | null;
        plan: string;
        amount_kobo: number;
        status: string;
        metadata: string | null;
      }
    | undefined;

  let userId: string | null = params.userId
    ? String(params.userId)
    : existingPay?.user_id
    ? String(existingPay.user_id)
    : null;

  if (!userId && customerEmail) {
    const row = db
      .prepare(`SELECT id FROM profiles WHERE LOWER(email) = LOWER(?) LIMIT 1`)
      .get(customerEmail) as { id?: string } | undefined;
    if (row?.id) userId = String(row.id);
  }

  // Idempotency check
  if (existingPay && String(existingPay.status || '').toLowerCase() === 'success') {
    let existingExpiresAt: string | null = null;
    if (userId) {
      const prof = await getRawProfileSubscriptionState(userId);
      existingExpiresAt = prof?.tierExpiresAt ?? null;
    }
    return {
      applied: false,
      alreadyProcessed: true,
      userId,
      plan: normalizeTier(existingPay.plan) === 'premium' ? 'premium' : 'pro',
      status: 'success',
      tierExpiresAt: existingExpiresAt,
    };
  }

  let effectiveStatus = rawStatus;
  let errorReason: string | undefined;
  if (rawStatus === 'success') {
    let existingMeta: Record<string, any> = {};
    if (existingPay?.metadata) {
      try {
        existingMeta = JSON.parse(existingPay.metadata) || {};
      } catch {
        existingMeta = {};
      }
    }
    const expectedKoboFromRecord =
      existingPay && Number(existingPay.amount_kobo) > 0
        ? Number(existingPay.amount_kobo)
        : Number(existingMeta.expected_amount_kobo ?? sanitizedMeta?.expected_amount_kobo);
    const minExpectedKobo =
      Number.isFinite(expectedKoboFromRecord) && expectedKoboFromRecord >= 0
        ? expectedKoboFromRecord
        : normalizedPlan === 'pro'
        ? TIER_RULES.pro.amountKobo
        : 200000;

    if (currency !== 'NGN' || amountKobo < minExpectedKobo) {
      effectiveStatus = 'failed';
      errorReason = `Amount or currency verification failed (received ${currency} ${amountKobo} kobo, expected at least ${minExpectedKobo} kobo).`;
    }
  }

  const metaToStore = {
    ...sanitizedMeta,
    ...(errorReason ? { verification_error: errorReason } : {}),
  };

  db.prepare(
    `INSERT INTO paystack_payments (
      id, user_id, email, reference, plan, amount_kobo, currency, status, channel,
      is_manual_grant, paid_at, metadata, raw_webhook, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    ON CONFLICT(reference) DO UPDATE SET
      user_id = COALESCE(excluded.user_id, paystack_payments.user_id),
      email = COALESCE(excluded.email, paystack_payments.email),
      status = excluded.status,
      amount_kobo = excluded.amount_kobo,
      currency = excluded.currency,
      channel = excluded.channel,
      paid_at = COALESCE(excluded.paid_at, paystack_payments.paid_at),
      metadata = excluded.metadata,
      raw_webhook = COALESCE(excluded.raw_webhook, paystack_payments.raw_webhook)`
  ).run(
    crypto.randomUUID(),
    userId,
    customerEmail,
    params.reference,
    normalizedPlan,
    amountKobo,
    currency,
    effectiveStatus,
    channel,
    effectiveStatus === 'success' ? paidAt : null,
    JSON.stringify(metaToStore),
    sanitizedWebhook ? JSON.stringify(sanitizedWebhook) : null,
    nowIso
  );

  let tierExpiresAt: string | null = null;
  if (effectiveStatus === 'success' && userId) {
    const currentProf = await getRawProfileSubscriptionState(userId);
    const currentExpMs = currentProf?.tierExpiresAt ? Date.parse(currentProf.tierExpiresAt) : NaN;
    const isSamePlanActiveRenewal =
      currentProf &&
      currentProf.tier === normalizedPlan &&
      Number.isFinite(currentExpMs) &&
      currentExpMs > nowMs;

    const baseMs = isSamePlanActiveRenewal ? currentExpMs : nowMs;
    tierExpiresAt = new Date(baseMs + durationDays * MS_PER_DAY).toISOString();

    db.prepare(
      `UPDATE profiles
       SET tier = ?,
           tier_expires_at = ?,
           pending_tier = NULL,
           pending_tier_effective_at = NULL,
           cancel_at_period_end = 0,
           renewal_reminder_sent_at = NULL
       WHERE id = ?`
    ).run(normalizedPlan, tierExpiresAt, userId);
  }

  return {
    applied: effectiveStatus === 'success' && Boolean(userId),
    alreadyProcessed: false,
    userId,
    plan: normalizedPlan,
    status: effectiveStatus,
    tierExpiresAt,
    ...(errorReason ? { errorReason } : {}),
  };
}

export async function scheduleDowngradeForUser(
  userId: string,
  targetTier: 'pro' = 'pro',
  nowMs: number = Date.now()
): Promise<{
  pendingTier: 'pro';
  pendingTierEffectiveAt: string;
}> {
  const profile = await getRawProfileSubscriptionState(userId);
  if (!profile) {
    throw new Error('User profile not found.');
  }
  if (profile.role === 'admin') {
    throw new Error('Admin accounts do not use paid subscription plans.');
  }
  const expMs = profile.tierExpiresAt ? Date.parse(profile.tierExpiresAt) : NaN;
  if (profile.tier !== 'premium' || !profile.tierExpiresAt || !Number.isFinite(expMs) || expMs <= nowMs) {
    throw new Error('Downgrade scheduling is only available on an active Premium plan.');
  }

  const effectiveAt = profile.tierExpiresAt;
  const storage = getStorageBackend();

  if (storage.mode === 'supabase') {
    const { error } = await storage.serviceClient
      .from('profiles')
      .update({
        pending_tier: targetTier,
        pending_tier_effective_at: effectiveAt,
        cancel_at_period_end: false,
      })
      .eq('id', userId);
    if (error) throw new Error(error.message);
  } else {
    storage.db
      .prepare(
        `UPDATE profiles SET pending_tier = ?, pending_tier_effective_at = ?, cancel_at_period_end = 0 WHERE id = ?`
      )
      .run(targetTier, effectiveAt, userId);
  }

  return {
    pendingTier: targetTier,
    pendingTierEffectiveAt: effectiveAt,
  };
}

export async function cancelPendingDowngradeForUser(userId: string): Promise<void> {
  const storage = getStorageBackend();
  if (storage.mode === 'supabase') {
    const { error } = await storage.serviceClient
      .from('profiles')
      .update({
        pending_tier: null,
        pending_tier_effective_at: null,
      })
      .eq('id', userId);
    if (error) throw new Error(error.message);
  } else {
    storage.db
      .prepare(`UPDATE profiles SET pending_tier = NULL, pending_tier_effective_at = NULL WHERE id = ?`)
      .run(userId);
  }
}

export async function setCancelAtPeriodEndForUser(
  userId: string,
  cancelAtPeriodEnd: boolean,
  nowMs: number = Date.now()
): Promise<{ cancelAtPeriodEnd: boolean; tierExpiresAt: string | null }> {
  const profile = await getRawProfileSubscriptionState(userId);
  if (!profile) {
    throw new Error('User profile not found.');
  }
  if (profile.role === 'admin') {
    throw new Error('Admin accounts do not expire.');
  }

  const expMs = profile.tierExpiresAt ? Date.parse(profile.tierExpiresAt) : NaN;
  const hasActivePaid =
    (profile.tier === 'pro' || profile.tier === 'premium') &&
    (!profile.tierExpiresAt || (Number.isFinite(expMs) && expMs > nowMs));

  if (!hasActivePaid) {
    throw new Error('Only active paid plans can change renewal status.');
  }

  const storage = getStorageBackend();
  if (storage.mode === 'supabase') {
    const updatePayload: Record<string, any> = {
      cancel_at_period_end: cancelAtPeriodEnd,
    };
    if (cancelAtPeriodEnd) {
      updatePayload.pending_tier = null;
      updatePayload.pending_tier_effective_at = null;
    }
    const { error } = await storage.serviceClient
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId);
    if (error) throw new Error(error.message);
  } else {
    if (cancelAtPeriodEnd) {
      storage.db
        .prepare(
          `UPDATE profiles SET cancel_at_period_end = 1, pending_tier = NULL, pending_tier_effective_at = NULL WHERE id = ?`
        )
        .run(userId);
    } else {
      storage.db
        .prepare(`UPDATE profiles SET cancel_at_period_end = 0 WHERE id = ?`)
        .run(userId);
    }
  }

  return {
    cancelAtPeriodEnd,
    tierExpiresAt: profile.tierExpiresAt,
  };
}

export async function listUserPaymentHistory(
  userId: string,
  limit = 50
): Promise<UserPaymentReceipt[]> {
  const storage = getStorageBackend();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));

  if (storage.mode === 'supabase') {
    const { data, error } = await storage.serviceClient
      .from('paystack_payments')
      .select('id, reference, plan, amount_kobo, currency, status, channel, is_manual_grant, paid_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(0, safeLimit - 1);

    if (error || !Array.isArray(data)) return [];
    return data.map((p: any) => ({
      id: String(p.id),
      reference: String(p.reference),
      plan: String(p.plan),
      amountKobo: Number(p.amount_kobo) || 0,
      currency: String(p.currency || 'NGN'),
      status: String(p.status),
      channel: p.channel ? String(p.channel) : null,
      isManualGrant: Boolean(p.is_manual_grant === true || p.is_manual_grant === 1),
      paidAt: p.paid_at ? String(p.paid_at) : null,
      createdAt: String(p.created_at || ''),
    }));
  }

  const rows = storage.db
    .prepare(
      `SELECT id, reference, plan, amount_kobo, currency, status, channel, is_manual_grant, paid_at, created_at
       FROM paystack_payments
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(userId, safeLimit) as Array<Record<string, any>>;

  return rows.map((p) => ({
    id: String(p.id),
    reference: String(p.reference),
    plan: String(p.plan),
    amountKobo: Number(p.amount_kobo) || 0,
    currency: String(p.currency || 'NGN'),
    status: String(p.status),
    channel: p.channel ? String(p.channel) : null,
    isManualGrant: Boolean(p.is_manual_grant === 1 || p.is_manual_grant === true),
    paidAt: p.paid_at ? String(p.paid_at) : null,
    createdAt: String(p.created_at || ''),
  }));
}
