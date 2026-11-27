import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { TRIAL_DAYS, TIER_RULES, type TierRuleConfig } from '@/lib/tiers';
import {
  LOCAL_SESSION_COOKIE_NAME,
  isLocalAuthAllowed,
  verifyLocalSessionToken,
  type LocalSessionTokenPayload,
} from '@/lib/auth/localSession';

export type AccountRole = 'user' | 'admin';
export type AccountTier = 'free' | 'pro' | 'premium';
export type EntitlementStatus = 'admin' | 'paid' | 'trial' | 'expired';

export interface EffectiveEntitlements {
  status: EntitlementStatus;
  effectiveTier: AccountTier;
  isExpired: boolean;
  isAdmin: boolean;
  isTrial: boolean;
  hasModelAccess: boolean;
  trialDaysRemaining: number;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  tierExpiresAt: string | null;
  emailConfirmed: boolean;
  tierRule: TierRuleConfig | null;
}

export interface ServerProfileRecord {
  id: string;
  email: string;
  displayName: string | null;
  role: AccountRole;
  tier: AccountTier;
  storedTier?: AccountTier;
  tierExpiresAt: string | null;
  pendingTier?: 'pro' | 'premium' | null;
  pendingTierEffectiveAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  renewalReminderSentAt?: string | null;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  trialReminder5dSentAt?: string | null;
  trialEndedEmailSentAt?: string | null;
  emailConfirmed?: boolean;
  suspended?: boolean;
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  createdAt: string;
}

export interface ServerAuthSession {
  user: {
    id: string;
    email: string;
    emailConfirmedAt?: string | null;
  };
  profile: ServerProfileRecord;
  effectiveTier: AccountTier;
  isExpired: boolean;
  isAdmin: boolean;
  entitlements: EffectiveEntitlements;
}

export function getServerSupabaseConfig() {
  const url = (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ''
  );
  const anonKey = (
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ''
  );
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

  const hasUrl = Boolean(
    url && url.startsWith('https://') && !url.includes('your-project-id')
  );

  return {
    url,
    anonKey,
    serviceRoleKey,
    isAuthConfigured: Boolean(hasUrl && anonKey),
    isAdminConfigured: Boolean(hasUrl && serviceRoleKey),
  };
}

let cachedServiceClient: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient | null {
  const { url, serviceRoleKey, isAdminConfigured } = getServerSupabaseConfig();
  if (!isAdminConfigured) return null;
  if (!cachedServiceClient) {
    cachedServiceClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return cachedServiceClient;
}

export function normalizeRole(raw: unknown): AccountRole {
  return String(raw || '').toLowerCase() === 'admin' ? 'admin' : 'user';
}

export function normalizeTier(raw: unknown): AccountTier {
  const v = String(raw || '').toLowerCase();
  if (v === 'premium') return 'premium';
  if (v === 'pro') return 'pro';
  return 'free';
}

export function normalizePendingTier(raw: unknown): 'pro' | 'premium' | null {
  const v = String(raw || '').toLowerCase();
  if (v === 'pro') return 'pro';
  if (v === 'premium') return 'premium';
  return null;
}

export function evaluateDuePendingTierTransition(
  input: {
    role?: unknown;
    tier?: unknown;
    tierExpiresAt?: string | null;
    pendingTier?: unknown;
    pendingTierEffectiveAt?: string | null;
  },
  nowMs: number = Date.now()
): { due: boolean; nextTier: 'pro' | 'premium' | null } {
  if (normalizeRole(input.role) === 'admin') {
    return { due: false, nextTier: null };
  }
  const pending = normalizePendingTier(input.pendingTier);
  if (!pending) {
    return { due: false, nextTier: null };
  }
  const effectiveIso = input.pendingTierEffectiveAt || input.tierExpiresAt;
  if (!effectiveIso) {
    return { due: false, nextTier: null };
  }
  const effectiveMs = Date.parse(effectiveIso);
  if (Number.isFinite(effectiveMs) && effectiveMs <= nowMs) {
    return { due: true, nextTier: pending };
  }
  return { due: false, nextTier: null };
}

export function getEntitlements(
  profile: {
    role: AccountRole;
    tier: AccountTier;
    tierExpiresAt: string | null;
    trialStartedAt?: string | null;
    trialEndsAt?: string | null;
    emailConfirmed?: boolean;
  },
  nowMs: number = Date.now()
): EffectiveEntitlements {
  const emailConfirmed = profile.emailConfirmed !== false;
  const trialStartedAt = profile.trialStartedAt ?? null;
  const trialEndsAt = profile.trialEndsAt ?? null;
  const tierExpiresAt = profile.tierExpiresAt ?? null;

  if (profile.role === 'admin') {
    return {
      status: 'admin',
      effectiveTier: 'premium',
      isExpired: false,
      isAdmin: true,
      isTrial: false,
      hasModelAccess: true,
      trialDaysRemaining: 0,
      trialStartedAt,
      trialEndsAt,
      tierExpiresAt: null,
      emailConfirmed: true,
      tierRule: TIER_RULES.premium,
    };
  }

  if (profile.tier === 'pro' || profile.tier === 'premium') {
    if (tierExpiresAt) {
      const expMs = Date.parse(tierExpiresAt);
      if (!Number.isFinite(expMs) || expMs <= nowMs) {
        return {
          status: 'expired',
          effectiveTier: 'free',
          isExpired: true,
          isAdmin: false,
          isTrial: false,
          hasModelAccess: false,
          trialDaysRemaining: 0,
          trialStartedAt,
          trialEndsAt,
          tierExpiresAt,
          emailConfirmed,
          tierRule: null,
        };
      }
    }
    return {
      status: 'paid',
      effectiveTier: profile.tier,
      isExpired: false,
      isAdmin: false,
      isTrial: false,
      hasModelAccess: true,
      trialDaysRemaining: 0,
      trialStartedAt,
      trialEndsAt,
      tierExpiresAt,
      emailConfirmed,
      tierRule: TIER_RULES[profile.tier],
    };
  }

  if (emailConfirmed && trialEndsAt) {
    const endMs = Date.parse(trialEndsAt);
    if (Number.isFinite(endMs) && endMs > nowMs) {
      const daysRemaining = Math.max(1, Math.ceil((endMs - nowMs) / 86_400_000));
      return {
        status: 'trial',
        effectiveTier: 'free',
        isExpired: false,
        isAdmin: false,
        isTrial: true,
        hasModelAccess: true,
        trialDaysRemaining: daysRemaining,
        trialStartedAt,
        trialEndsAt,
        tierExpiresAt: null,
        emailConfirmed: true,
        tierRule: TIER_RULES.free,
      };
    }
  }

  return {
    status: 'expired',
    effectiveTier: 'free',
    isExpired: true,
    isAdmin: false,
    isTrial: false,
    hasModelAccess: false,
    trialDaysRemaining: 0,
    trialStartedAt,
    trialEndsAt,
    tierExpiresAt,
    emailConfirmed,
    tierRule: null,
  };
}

export function computeEffectiveEntitlements(profile: {
  role: AccountRole;
  tier: AccountTier;
  tierExpiresAt: string | null;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  emailConfirmed?: boolean;
}): {
  effectiveTier: AccountTier;
  isExpired: boolean;
  isAdmin: boolean;
} {
  const ent = getEntitlements(profile);
  return {
    effectiveTier: ent.effectiveTier,
    isExpired: ent.isExpired,
    isAdmin: ent.isAdmin,
  };
}

export function isSafeRedirectPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '/fixtures';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return '/fixtures';
  }
  if (
    trimmed.startsWith('/login') ||
    trimmed.startsWith('/signup') ||
    trimmed.startsWith('/forgot-password') ||
    trimmed.startsWith('/auth/callback')
  ) {
    return '/fixtures';
  }
  return trimmed;
}

export function mapRowToProfile(
  data: Record<string, any>,
  fallbackEmail: string,
  fallbackDisplayName: string | null,
  fallbackCreatedAt: string,
  emailConfirmed: boolean
): ServerProfileRecord {
  const storedTier = normalizeTier(data.tier);
  return {
    id: String(data.id),
    email: String(data.email || fallbackEmail),
    displayName: data.display_name ? String(data.display_name) : fallbackDisplayName,
    role: normalizeRole(data.role),
    tier: storedTier,
    storedTier,
    tierExpiresAt: data.tier_expires_at ? String(data.tier_expires_at) : null,
    pendingTier: normalizePendingTier(data.pending_tier),
    pendingTierEffectiveAt: data.pending_tier_effective_at ? String(data.pending_tier_effective_at) : null,
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end === true || data.cancel_at_period_end === 1),
    renewalReminderSentAt: data.renewal_reminder_sent_at ? String(data.renewal_reminder_sent_at) : null,
    trialStartedAt: data.trial_started_at ? String(data.trial_started_at) : null,
    trialEndsAt: data.trial_ends_at ? String(data.trial_ends_at) : null,
    trialReminder5dSentAt: data.trial_reminder_5d_sent_at ? String(data.trial_reminder_5d_sent_at) : null,
    trialEndedEmailSentAt: data.trial_ended_email_sent_at ? String(data.trial_ended_email_sent_at) : null,
    emailConfirmed,
    suspended: Boolean(data.suspended === true || data.suspended === 1),
    suspendedAt: data.suspended_at ? String(data.suspended_at) : null,
    suspendedReason: data.suspended_reason ? String(data.suspended_reason) : null,
    createdAt: String(data.created_at || fallbackCreatedAt),
  };
}

export async function fetchOrProvisionProfile(
  userId: string,
  email: string,
  fallbackDisplayName?: string | null,
  emailConfirmed: boolean = true
): Promise<ServerProfileRecord> {
  const now = new Date();
  const nowIso = now.toISOString();
  const defaultTrialEndsIso = new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString();

  const fallbackProfile: ServerProfileRecord = {
    id: userId,
    email,
    displayName: fallbackDisplayName || email.split('@')[0] || 'Member',
    role: 'user',
    tier: 'free',
    storedTier: 'free',
    tierExpiresAt: null,
    pendingTier: null,
    pendingTierEffectiveAt: null,
    cancelAtPeriodEnd: false,
    renewalReminderSentAt: null,
    trialStartedAt: emailConfirmed ? nowIso : null,
    trialEndsAt: emailConfirmed ? defaultTrialEndsIso : null,
    trialReminder5dSentAt: null,
    trialEndedEmailSentAt: null,
    emailConfirmed,
    suspended: false,
    suspendedAt: null,
    suspendedReason: null,
    createdAt: nowIso,
  };

  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) {
    return fallbackProfile;
  }

  let { data, error } = await serviceClient
    .from('profiles')
    .select(
      'id, email, display_name, role, tier, tier_expires_at, pending_tier, pending_tier_effective_at, cancel_at_period_end, renewal_reminder_sent_at, trial_started_at, trial_ends_at, trial_reminder_5d_sent_at, trial_ended_email_sent_at, suspended, suspended_at, suspended_reason, created_at'
    )
    .eq('id', userId)
    .maybeSingle();

  if (
    error &&
    /(suspended|trial_started_at|trial_ends_at|pending_tier|cancel_at_period_end|renewal_reminder_sent_at)/i.test(
      error.message || ''
    )
  ) {
    const legacy = await serviceClient
      .from('profiles')
      .select('id, email, display_name, role, tier, tier_expires_at, created_at')
      .eq('id', userId)
      .maybeSingle();
    data = legacy.data
      ? {
          ...legacy.data,
          pending_tier: null,
          pending_tier_effective_at: null,
          cancel_at_period_end: false,
          renewal_reminder_sent_at: null,
          suspended: false,
          suspended_at: null,
          suspended_reason: null,
          trial_started_at: null,
          trial_ends_at: null,
          trial_reminder_5d_sent_at: null,
          trial_ended_email_sent_at: null,
        }
      : null;
    error = legacy.error;
  }

  if (!error && data) {
    const transition = evaluateDuePendingTierTransition({
      role: data.role,
      tier: data.tier,
      tierExpiresAt: data.tier_expires_at,
      pendingTier: data.pending_tier,
      pendingTierEffectiveAt: data.pending_tier_effective_at,
    });
    if (transition.due && transition.nextTier) {
      await serviceClient
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

    if (
      emailConfirmed &&
      normalizeRole(data.role) === 'user' &&
      normalizeTier(data.tier) === 'free' &&
      !data.trial_started_at &&
      !data.trial_ends_at
    ) {
      const startIso = new Date().toISOString();
      const endIso = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();
      const { data: updatedRow } = await serviceClient
        .from('profiles')
        .update({
          trial_started_at: startIso,
          trial_ends_at: endIso,
        })
        .eq('id', userId)
        .is('trial_started_at', null)
        .is('trial_ends_at', null)
        .select(
          'id, email, display_name, role, tier, tier_expires_at, pending_tier, pending_tier_effective_at, cancel_at_period_end, renewal_reminder_sent_at, trial_started_at, trial_ends_at, trial_reminder_5d_sent_at, trial_ended_email_sent_at, suspended, suspended_at, suspended_reason, created_at'
        )
        .maybeSingle();
      if (updatedRow) {
        data = updatedRow;
      } else {
        data.trial_started_at = startIso;
        data.trial_ends_at = endIso;
      }
    }

    return mapRowToProfile(
      data,
      email,
      fallbackProfile.displayName,
      fallbackProfile.createdAt,
      emailConfirmed
    );
  }

  const { data: inserted } = await serviceClient
    .from('profiles')
    .upsert(
      {
        id: userId,
        email,
        display_name: fallbackProfile.displayName,
        role: 'user',
        tier: 'free',
        tier_expires_at: null,
        trial_started_at: emailConfirmed ? nowIso : null,
        trial_ends_at: emailConfirmed ? defaultTrialEndsIso : null,
      },
      { onConflict: 'id' }
    )
    .select(
      'id, email, display_name, role, tier, tier_expires_at, pending_tier, pending_tier_effective_at, cancel_at_period_end, renewal_reminder_sent_at, trial_started_at, trial_ends_at, trial_reminder_5d_sent_at, trial_ended_email_sent_at, created_at'
    )
    .maybeSingle();

  if (inserted) {
    return mapRowToProfile(
      inserted,
      email,
      fallbackProfile.displayName,
      fallbackProfile.createdAt,
      emailConfirmed
    );
  }

  return fallbackProfile;
}

export function buildServerAuthSessionFromUserAndProfile(
  user: {
    id: string;
    email?: string | null;
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
    user_metadata?: Record<string, any>;
  },
  profile: ServerProfileRecord
): ServerAuthSession {
  const hasConfirmFields = 'email_confirmed_at' in user || 'confirmed_at' in user;
  const emailConfirmed = hasConfirmFields
    ? Boolean(user.email_confirmed_at || user.confirmed_at)
    : profile.emailConfirmed !== false;

  const transition = evaluateDuePendingTierTransition({
    role: profile.role,
    tier: profile.tier,
    tierExpiresAt: profile.tierExpiresAt,
    pendingTier: profile.pendingTier,
    pendingTierEffectiveAt: profile.pendingTierEffectiveAt,
  });

  const effectiveStoredTier = transition.due && transition.nextTier ? transition.nextTier : profile.tier;
  const effectivePendingTier = transition.due ? null : profile.pendingTier ?? null;
  const effectivePendingAt = transition.due ? null : profile.pendingTierEffectiveAt ?? null;

  const entitlements = getEntitlements({
    role: profile.role,
    tier: effectiveStoredTier,
    tierExpiresAt: profile.tierExpiresAt,
    trialStartedAt: profile.trialStartedAt ?? null,
    trialEndsAt: profile.trialEndsAt ?? null,
    emailConfirmed,
  });

  return {
    user: {
      id: user.id,
      email: user.email || profile.email,
      emailConfirmedAt: user.email_confirmed_at || user.confirmed_at || null,
    },
    profile: {
      ...profile,
      storedTier: effectiveStoredTier,
      pendingTier: effectivePendingTier,
      pendingTierEffectiveAt: effectivePendingAt,
      cancelAtPeriodEnd: Boolean(profile.cancelAtPeriodEnd),
      tier: entitlements.effectiveTier,
      emailConfirmed,
    },
    effectiveTier: entitlements.effectiveTier,
    isExpired: entitlements.isExpired,
    isAdmin: entitlements.isAdmin,
    entitlements,
  };
}

export function isSupabaseUserConfirmed(user: {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}): boolean {
  return Boolean(user.email_confirmed_at || user.confirmed_at);
}

export function buildLocalFallbackSession(
  payload: LocalSessionTokenPayload,
  dbRow?: Record<string, any> | null
): ServerAuthSession | null {
  if (dbRow && (dbRow.suspended === true || dbRow.suspended === 1)) {
    return null;
  }
  const profile: ServerProfileRecord = dbRow
    ? mapRowToProfile(
        dbRow,
        payload.email,
        payload.displayName,
        payload.createdAt,
        true
      )
    : {
        id: payload.userId,
        email: payload.email,
        displayName: payload.displayName,
        role: normalizeRole(payload.role),
        tier: normalizeTier(payload.tier),
        storedTier: normalizeTier(payload.tier),
        tierExpiresAt: payload.tierExpiresAt,
        pendingTier: null,
        pendingTierEffectiveAt: null,
        cancelAtPeriodEnd: false,
        renewalReminderSentAt: null,
        trialStartedAt: payload.trialStartedAt,
        trialEndsAt: payload.trialEndsAt,
        trialReminder5dSentAt: null,
        trialEndedEmailSentAt: null,
        emailConfirmed: true,
        suspended: false,
        suspendedAt: null,
        suspendedReason: null,
        createdAt: payload.createdAt,
      };

  return buildServerAuthSessionFromUserAndProfile(
    {
      id: profile.id,
      email: profile.email,
      email_confirmed_at: profile.createdAt,
    },
    profile
  );
}

/**
 * Middleware-specific auth resolver supporting NextRequest + NextResponse cookie refresh
 * and local signed session cookie fallback when remote Supabase Auth is unset.
 */
export async function getMiddlewareAuthSession(
  request: NextRequest,
  response: NextResponse
): Promise<ServerAuthSession | null> {
  const { url, anonKey, isAuthConfigured } = getServerSupabaseConfig();
  if (!isAuthConfigured) {
    if (!isLocalAuthAllowed()) {
      return null;
    }
    try {
      const localToken = request.cookies.get(LOCAL_SESSION_COOKIE_NAME)?.value;
      const payload = await verifyLocalSessionToken(localToken);
      if (!payload) return null;
      return buildLocalFallbackSession(payload);
    } catch {
      return null;
    }
  }

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      return null;
    }

    const user = data.user;
    const fallbackName =
      (user.user_metadata?.display_name as string | undefined) ||
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      null;
    const profile = await fetchOrProvisionProfile(
      user.id,
      user.email || '',
      fallbackName,
      isSupabaseUserConfirmed(user)
    );
    if (profile.suspended) {
      return null;
    }
    return buildServerAuthSessionFromUserAndProfile(user, profile);
  } catch {
    return null;
  }
}
