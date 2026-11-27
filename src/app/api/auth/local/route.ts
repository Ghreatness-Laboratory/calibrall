import { NextResponse } from 'next/server';
import { getServerSupabaseConfig } from '@/lib/supabase/serverAuth';
import { isDisposableEmail } from '@/lib/auth/disposableDomains';
import {
  LOCAL_SESSION_COOKIE_NAME,
  LOCAL_SESSION_TTL_MS,
  isLocalAuthAllowed,
  signLocalSessionToken,
} from '@/lib/auth/localSession';
import {
  LocalAuthError,
  authenticateLocalTrialAccount,
  authenticateLocalUserAccount,
  createLocalUserAccount,
} from '@/lib/auth/localAuthDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  const { isAuthConfigured } = getServerSupabaseConfig();
  if (isAuthConfigured || !isLocalAuthAllowed()) {
    return NextResponse.json(
      { error: 'Local auth fallback is disabled when Supabase Auth is active.' },
      { status: 404 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const mode = String(body.mode || '').toLowerCase();
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : undefined;
  const confirmed18Plus = Boolean(body.confirmed18Plus);

  try {
    let payload;
    if (mode === 'signup') {
      if (!confirmed18Plus) {
        return NextResponse.json(
          { error: 'You must confirm you are at least 18 years old to create an account.' },
          { status: 400 }
        );
      }
      if (isDisposableEmail(email)) {
        return NextResponse.json(
          {
            error:
              'Please use a permanent email address. Disposable email domains are not eligible for the 7-day free trial.',
          },
          { status: 400 }
        );
      }
      payload = createLocalUserAccount({ email, password, displayName });
    } else if (mode === 'login') {
      payload = authenticateLocalUserAccount({ email, password });
    } else if (mode === 'demo') {
      payload = authenticateLocalTrialAccount();
    } else {
      return NextResponse.json({ error: 'Invalid authentication mode.' }, { status: 400 });
    }

    const token = await signLocalSessionToken(payload);
    const forwardedProto = request.headers.get('x-forwarded-proto') || '';
    const isHttps = forwardedProto.includes('https') || request.url.startsWith('https://');

    const response = NextResponse.json(
      {
        ok: true,
        user: {
          id: payload.userId,
          email: payload.email,
          displayName: payload.displayName,
        },
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );

    response.cookies.set(LOCAL_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      path: '/',
      maxAge: Math.floor(LOCAL_SESSION_TTL_MS / 1000),
      sameSite: isHttps ? 'none' : 'lax',
      secure: isHttps,
    });

    return response;
  } catch (err: any) {
    if (err instanceof LocalAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message || 'Unable to authenticate right now.' },
      { status: 500 }
    );
  }
}
