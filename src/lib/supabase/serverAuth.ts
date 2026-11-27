import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  LOCAL_SESSION_COOKIE_NAME,
  isLocalAuthAllowed,
  verifyLocalSessionToken,
} from '@/lib/auth/localSession';
import {
  buildLocalFallbackSession,
  buildServerAuthSessionFromUserAndProfile,
  fetchOrProvisionProfile,
  getServerSupabaseConfig,
  isSupabaseUserConfirmed,
  type ServerAuthSession,
} from '@/lib/supabase/authCore';

export * from '@/lib/supabase/authCore';

function parseBearerToken(request?: Request): string | null {
  if (!request) return null;
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function readCookieFromHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key === name) {
      const val = part.slice(eqIdx + 1).trim();
      try {
        return decodeURIComponent(val);
      } catch {
        return val;
      }
    }
  }
  return null;
}

/**
 * Resolves the current authenticated user & server-verified profile from Supabase Auth
 * (or signed local SQLite session cookie when Supabase Auth is not configured in dev).
 * Accepts optional incoming Request (supporting both SSR cookies and Authorization Bearer JWT).
 * NEVER reads client-spoofed x-calibrall-tier headers or calibrall_tier cookies.
 */
export async function getServerAuthSession(request?: Request): Promise<ServerAuthSession | null> {
  const { url, anonKey, isAuthConfigured } = getServerSupabaseConfig();
  if (!isAuthConfigured) {
    if (!isLocalAuthAllowed()) {
      return null;
    }
    try {
      let localToken: string | null = null;
      if (request) {
        localToken = readCookieFromHeader(
          request.headers.get('cookie'),
          LOCAL_SESSION_COOKIE_NAME
        );
      } else {
        localToken = cookies().get(LOCAL_SESSION_COOKIE_NAME)?.value ?? null;
      }
      const payload = await verifyLocalSessionToken(localToken);
      if (!payload) return null;

      let dbRow: Record<string, any> | null = null;
      try {
        const { supabase } = await import('@/lib/supabase/client');
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', payload.userId)
          .limit(1);
        if (Array.isArray(data) && data.length > 0) {
          dbRow = data[0] as Record<string, any>;
        }
      } catch {
        dbRow = null;
      }

      return buildLocalFallbackSession(payload, dbRow);
    } catch {
      return null;
    }
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
