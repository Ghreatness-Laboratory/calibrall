import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

export type AccountRole = 'user' | 'admin';
export type AccountTier = 'free' | 'pro' | 'premium';

export interface ServerProfileRecord {
  id: string;
  email: string;
  displayName: string | null;
  role: AccountRole;
  tier: AccountTier;
  tierExpiresAt: string | null;
  suspended?: boolean;
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  createdAt: string;
}

export interface ServerAuthSession {
  user: {
    id: string;
    email: string;
  };
  profile: ServerProfileRecord;
  effectiveTier: AccountTier;
  isExpired: boolean;
  isAdmin: boolean;
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

export function computeEffectiveEntitlements(profile: {
  role: AccountRole;
  tier: AccountTier;
  tierExpiresAt: string | null;
}): {
  effectiveTier: AccountTier;
  isExpired: boolean;
  isAdmin: boolean;
} {
  const isAdmin = profile.role === 'admin';
  if (isAdmin) {
    return {
      effectiveTier: 'premium',
      isExpired: false,
      isAdmin: true,
    };
  }

  if (profile.tier === 'pro' || profile.tier === 'premium') {
    if (profile.tierExpiresAt) {
      const expMs = Date.parse(profile.tierExpiresAt);
      if (Number.isFinite(expMs) && expMs <= Date.now()) {
        return {
          effectiveTier: 'free',
          isExpired: true,
          isAdmin: false,
        };
      }
    }
    return {
      effectiveTier: profile.tier,
      isExpired: false,
      isAdmin: false,
    };
  }

  return {
    effectiveTier: 'free',
    isExpired: false,
    isAdmin: false,
  };
}

export function isSafeRedirectPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '/fixtures';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return '/fixtures';
  }
  // Never redirect back into auth endpoints
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

async function fetchOrProvisionProfile(
  userId: string,
  email: string,
  fallbackDisplayName?: string | null
): Promise<ServerProfileRecord> {
  const fallbackProfile: ServerProfileRecord = {
    id: userId,
    email,
    displayName: fallbackDisplayName || email.split('@')[0] || 'Member',
    role: 'user',
    tier: 'free',
    tierExpiresAt: null,
    suspended: false,
    suspendedAt: null,
    suspendedReason: null,
    createdAt: new Date().toISOString(),
  };

  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) {
    return fallbackProfile;
  }

  let { data, error } = await serviceClient
    .from('profiles')
    .select('id, email, display_name, role, tier, tier_expires_at, suspended, suspended_at, suspended_reason, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error && /suspended/i.test(error.message || '')) {
    const legacy = await serviceClient
      .from('profiles')
      .select('id, email, display_name, role, tier, tier_expires_at, created_at')
      .eq('id', userId)
      .maybeSingle();
    data = legacy.data ? { ...legacy.data, suspended: false, suspended_at: null, suspended_reason: null } : null;
    error = legacy.error;
  }

  if (!error && data) {
    return {
      id: String(data.id),
      email: String(data.email || email),
      displayName: data.display_name ? String(data.display_name) : fallbackProfile.displayName,
      role: normalizeRole(data.role),
      tier: normalizeTier(data.tier),
      tierExpiresAt: data.tier_expires_at ? String(data.tier_expires_at) : null,
      suspended: Boolean(data.suspended === true || data.suspended === 1),
      suspendedAt: data.suspended_at ? String(data.suspended_at) : null,
      suspendedReason: data.suspended_reason ? String(data.suspended_reason) : null,
      createdAt: String(data.created_at || fallbackProfile.createdAt),
    };
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
      },
      { onConflict: 'id' }
    )
    .select('id, email, display_name, role, tier, tier_expires_at, created_at')
    .maybeSingle();

  if (inserted) {
    return {
      id: String(inserted.id),
      email: String(inserted.email || email),
      displayName: inserted.display_name ? String(inserted.display_name) : fallbackProfile.displayName,
      role: normalizeRole(inserted.role),
      tier: normalizeTier(inserted.tier),
      tierExpiresAt: inserted.tier_expires_at ? String(inserted.tier_expires_at) : null,
      createdAt: String(inserted.created_at || fallbackProfile.createdAt),
    };
  }

  return fallbackProfile;
}

export function buildServerAuthSessionFromUserAndProfile(
  user: { id: string; email?: string | null; user_metadata?: Record<string, any> },
  profile: ServerProfileRecord
): ServerAuthSession {
  const { effectiveTier, isExpired, isAdmin } = computeEffectiveEntitlements(profile);
  return {
    user: {
      id: user.id,
      email: user.email || profile.email,
    },
    profile: {
      ...profile,
      tier: effectiveTier,
    },
    effectiveTier,
    isExpired,
    isAdmin,
  };
}

function parseBearerToken(request?: Request): string | null {
  if (!request) return null;
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
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
      const profile = await fetchOrProvisionProfile(user.id, user.email || '', fallbackName);
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
    const profile = await fetchOrProvisionProfile(user.id, user.email || '', fallbackName);
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
    const profile = await fetchOrProvisionProfile(user.id, user.email || '', fallbackName);
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
 * Fail-closed: returns 401 JSON when no valid user session exists.
 */
export async function requireApiUser(request: Request): Promise<
  | { authorized: true; session: ServerAuthSession; errorResponse?: never }
  | { authorized: false; session?: never; errorResponse: NextResponse }
> {
  const session = await getServerAuthSession(request);
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
