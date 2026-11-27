import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { TRIAL_DAYS, TIER_RULES, type TierRuleConfig } from '@/lib/tiers';

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
  tierExpiresAt: string | null;
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

/**
 * Canonical server-side entitlement resolver.
 * Priority:
 *  1. admin -> premium, never expires
 *  2. paid tier (pro or premium) with tier_expires_at in the future (or null permanent) -> paid
 *     (when a paid plan lapses, user moves directly to 'expired' — NO second trial)
 *  3. trial active (emailConfirmed !== false and now < trial_ends_at) and no active paid plan -> free tier rules, status='trial'
 *  4. otherwise -> status='expired', no model access
 */
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

  // 1. Admin -> permanent premium, never expires
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

  // 2. Paid plan (pro or premium)
  if (profile.tier === 'pro' || profile.tier === 'premium') {
    if (tierExpiresAt) {
      const expMs = Date.parse(tierExpiresAt);
      if (!Number.isFinite(expMs) || expMs <= nowMs) {
        // Paid plan lapsed -> 'expired' (no second trial)
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

  // 3. Active 7-day trial (requires confirmed email and future trial_ends_at)
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

  // 4. Otherwise -> expired, no model access
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

function mapRowToProfile(
  data: Record<string, any>,
  fallbackEmail: string,
  fallbackDisplayName: string | null,
  fallbackCreatedAt: string,
  emailConfirmed: boolean
): ServerProfileRecord {
  return {
    id: String(data.id),
    email: String(data.email || fallbackEmail),
    displayName: data.display_name ? String(data.display_name) : fallbackDisplayName,
    role: normalizeRole(data.role),
    tier: normalizeTier(data.tier),
    tierExpiresAt: data.tier_expires_at ? String(data.tier_expires_at) : null,
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

async function fetchOrProvisionProfile(
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
    tierExpiresAt: null,
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
      'id, email, display_name, role, tier, tier_expires_at, trial_started_at, trial_ends_at, trial_reminder_5d_sent_at, trial_ended_email_sent_at, suspended, suspended_at, suspended_reason, created_at'
    )
    .eq('id', userId)
    .maybeSingle();

  if (error && /(suspended|trial_started_at|trial_ends_at)/i.test(error.message || '')) {
    const legacy = await serviceClient
      .from('profiles')
      .select('id, email, display_name, role, tier, tier_expires_at, created_at')
      .eq('id', userId)
      .maybeSingle();
    data = legacy.data
      ? {
          ...legacy.data,
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
    // Start trial strictly once upon email confirmation if not yet initialized
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
          'id, email, display_name, role, tier, tier_expires_at, trial_started_at, trial_ends_at, trial_reminder_5d_sent_at, trial_ended_email_sent_at, suspended, suspended_at, suspended_reason, created_at'
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

  // Ensure profile exists if signup trigger hadn't run yet
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
      'id, email, display_name, role, tier, tier_expires_at, trial_started_at, trial_ends_at, trial_reminder_5d_sent_at, trial_ended_email_sent_at, created_at'
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

  const entitlements = getEntitlements({
    role: profile.role,
    tier: profile.tier,
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
      tier: entitlements.effectiveTier,
      emailConfirmed,
    },
    effectiveTier: entitlements.effectiveTier,
    isExpired: entitlements.isExpired,
    isAdmin: entitlements.isAdmin,
    entitlements,
  };
}

function parseBearerToken(request?: Request): string | null {
  if (!request) return null;
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function isSupabaseUserConfirmed(user: {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}): boolean {
  return Boolean(user.email_confirmed_at || user.confirmed_at);
}

/**
 * Resolves the current authenticated user & server-verified profile from Supabase Auth.
 * Accepts optional incoming Request (supporting both SSR cookies and Authorization Bearer JWT).
 * NEVER reads client-spoofed x-calibrall-tier headers or calibrall_tier cookies.
 */
export async function getServerAuthSession(request?: Request): Promise<ServerAuthSession | null> {
  const { url, anonKey, isAuthConfigured } = getServerSupabaseConfig();
  if (!isAuthConfigured) {
    return null;
  }

  try {
    // 1. Check Bearer JWT if supplied on an API request
    const bearerToken = parseBearerToken(request);
    if (bearerToken) {
      const authClient = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await authClient.auth.getUser(bearerToken);
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
    }

    // 2. Standard cookie-based session via Next.js cookies()
    const cookieStore = cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored inside Server Components where response headers are immutable
          }
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

/**
 * Middleware-specific auth resolver supporting NextRequest + NextResponse cookie refresh.
 */
export async function getMiddlewareAuthSession(
  request: NextRequest,
  response: NextResponse
): Promise<ServerAuthSession | null> {
  const { url, anonKey, isAuthConfigured } = getServerSupabaseConfig();
  if (!isAuthConfigured) {
    return null;
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

/**
 * API route guard for authenticated data endpoints (/api/v1/*).
 * Fail-closed:
 *  - returns 401 JSON when no valid user session exists.
 *  - returns 402 JSON when user's trial or paid subscription is expired (no model access).
 */
export async function requireApiUser(
  request: Request,
  deps?: { getSession?: (req: Request) => Promise<ServerAuthSession | null> }
): Promise<
  | { authorized: true; session: ServerAuthSession; errorResponse?: never }
  | { authorized: false; session?: never; errorResponse: NextResponse }
> {
  const session = await (deps?.getSession ? deps.getSession(request) : getServerAuthSession(request));
  if (!session) {
    return {
      authorized: false,
      errorResponse: NextResponse.json(
        {
          error: 'Unauthorized: Sign in required to access this endpoint.',
          code: 'AUTH_REQUIRED',
        },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store, max-age=0',
          },
        }
      ),
    };
  }

  if (!session.entitlements.hasModelAccess) {
    return {
      authorized: false,
      errorResponse: NextResponse.json(
        {
          error: 'Your 7-day free trial has ended. Choose a plan to continue.',
          code: 'TRIAL_EXPIRED',
          status: session.entitlements.status,
          upgradeUrl: '/pricing?reason=trial_ended',
        },
        {
          status: 402,
          headers: {
            'Cache-Control': 'no-store, max-age=0',
          },
        }
      ),
    };
  }

  return { authorized: true, session };
}

/**
 * API route guard for Admin Panel endpoints (/api/admin/*).
 * Enforces profiles.role === 'admin' from server-verified session.
 * Returns HTTP 404 for both unauthenticated callers and non-admins.
 */
export async function requireAdminApiUser(request: Request): Promise<
  | { authorized: true; session: ServerAuthSession; errorResponse?: never }
  | { authorized: false; session?: never; errorResponse: NextResponse }
> {
  const session = await getServerAuthSession(request);
  if (
    !session ||
    !session.isAdmin ||
    session.profile.role !== 'admin' ||
    session.profile.suspended
  ) {
    return {
      authorized: false,
      errorResponse: NextResponse.json(
        { error: 'Not found', code: 'NOT_FOUND' },
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store, max-age=0',
          },
        }
      ),
    };
  }
  return { authorized: true, session };
}
