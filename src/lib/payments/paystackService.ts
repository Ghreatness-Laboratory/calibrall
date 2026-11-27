import crypto from 'node:crypto';
import { TIER_RULES } from '@/lib/tiers';
import { getLocalDatabase, isProductionRuntime, persistenceBackendInfo } from '@/lib/supabase/client';
import { getSupabaseServiceClient, normalizeTier } from '@/lib/supabase/serverAuth';

export type PaidPlanId = 'pro' | 'premium';

export function resolvePaystackSecretKey(): string {
  return (
    process.env.PAYSTACK_SECRET_KEY?.trim() ||
    process.env.PAYMENT_SECRET_KEY?.trim() ||
    process.env.PAYMENT_WEBHOOK_SECRET?.trim() ||
    ''
  );
}

export function getPaystackPlanSettings(plan: PaidPlanId): {
  plan: PaidPlanId;
  amountKobo: number;
  planCode?: string;
  durationDays: number;
} {
  const envAmount =
    plan === 'premium'
      ? Number(process.env.PAYSTACK_PREMIUM_AMOUNT_KOBO)
      : Number(process.env.PAYSTACK_PRO_AMOUNT_KOBO);
  const defaultAmount = TIER_RULES[plan].monthlyPriceNgn * 100;
  const amountKobo = Number.isFinite(envAmount) && envAmount > 0 ? Math.round(envAmount) : defaultAmount;

  const planCode =
    plan === 'premium'
      ? process.env.PAYSTACK_PREMIUM_PLAN_CODE?.trim() || undefined
      : process.env.PAYSTACK_PRO_PLAN_CODE?.trim() || undefined;

  return {
    plan,
    amountKobo,
    planCode,
    durationDays: 30,
  };
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
}): Promise<{
  applied: boolean;
  userId: string | null;
  plan: PaidPlanId;
  status: string;
  tierExpiresAt: string | null;
}> {
  const normalizedPlan: PaidPlanId = normalizeTier(params.planRaw) === 'premium' ? 'premium' : 'pro';
  const durationDays = Math.max(1, Math.round(Number(params.durationDays) || 30));
  const currency = (params.currency || 'NGN').toUpperCase();
  const status = String(params.status || 'pending').toLowerCase();
  const customerEmail = params.customerEmail ? params.customerEmail.toLowerCase().trim() : null;
  const channel = params.channel || 'paystack';
  const paidAt = params.paidAt || (status === 'success' ? new Date().toISOString() : null);
  const nowIso = new Date().toISOString();

  const backend = persistenceBackendInfo();
  const serviceClient = getSupabaseServiceClient();

  if (backend.isRemoteSupabase || serviceClient) {
    if (!serviceClient) {
      throw new Error(backend.message);
    }

    let userId: string | null = params.userId ? String(params.userId) : null;
    if (!userId && customerEmail) {
      const { data: prof } = await serviceClient
        .from('profiles')
        .select('id')
        .eq('email', customerEmail)
        .maybeSingle();
      if (prof?.id) userId = String(prof.id);
    }

    await serviceClient.from('paystack_payments').upsert(
      {
        user_id: userId,
        email: customerEmail,
        reference: params.reference,
        plan: normalizedPlan,
        amount_kobo: Math.round(Number(params.amountKobo) || 0),
        currency,
        status,
        channel,
        is_manual_grant: false,
        paid_at: paidAt,
        metadata: params.metadata ?? null,
        created_at: nowIso,
      },
      { onConflict: 'reference' }
    );

    let tierExpiresAt: string | null = null;
    if (status === 'success' && userId) {
      tierExpiresAt = new Date(Date.now() + durationDays * 86_400_000).toISOString();
      await serviceClient
        .from('profiles')
        .update({ tier: normalizedPlan, tier_expires_at: tierExpiresAt })
        .eq('id', userId);
    }

    return {
      applied: status === 'success' && Boolean(userId),
      userId,
      plan: normalizedPlan,
      status,
      tierExpiresAt,
    };
  }

  if (isProductionRuntime()) {
    throw new Error(backend.message);
  }

  const db = getLocalDatabase();
  if (!db) {
    throw new Error('Local database unavailable.');
  }

  let userId: string | null = params.userId ? String(params.userId) : null;
  if (!userId && customerEmail) {
    const row = db
      .prepare(`SELECT id FROM profiles WHERE LOWER(email) = LOWER(?) LIMIT 1`)
      .get(customerEmail) as { id?: string } | undefined;
    if (row?.id) userId = String(row.id);
  }

  db.prepare(
    `INSERT INTO paystack_payments (
      id, user_id, email, reference, plan, amount_kobo, currency, status, channel,
      is_manual_grant, paid_at, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    ON CONFLICT(reference) DO UPDATE SET
      status = excluded.status,
      amount_kobo = excluded.amount_kobo,
      channel = excluded.channel,
      paid_at = COALESCE(excluded.paid_at, paystack_payments.paid_at),
      metadata = excluded.metadata`
  ).run(
    crypto.randomUUID(),
    userId,
    customerEmail,
    params.reference,
    normalizedPlan,
    Math.round(Number(params.amountKobo) || 0),
    currency,
    status,
    channel,
    paidAt,
    params.metadata ? JSON.stringify(params.metadata) : null,
    nowIso
  );

  let tierExpiresAt: string | null = null;
  if (status === 'success' && userId) {
    tierExpiresAt = new Date(Date.now() + durationDays * 86_400_000).toISOString();
    db.prepare(`UPDATE profiles SET tier = ?, tier_expires_at = ? WHERE id = ?`).run(
      normalizedPlan,
      tierExpiresAt,
      userId
    );
  }

  return {
    applied: status === 'success' && Boolean(userId),
    userId,
    plan: normalizedPlan,
    status,
    tierExpiresAt,
  };
}
