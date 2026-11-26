import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import {
  getServerSupabaseConfig,
  isSafeRedirectPath,
} from '@/lib/supabase/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const nextPath = isSafeRedirectPath(searchParams.get('next'));

  const { url, anonKey, isAuthConfigured } = getServerSupabaseConfig();
  if (!isAuthConfigured) {
    return NextResponse.redirect(`${origin}/login?error=auth_unconfigured`);
  }

  const redirectResponse = NextResponse.redirect(`${origin}${nextPath}`);

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          redirectResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectResponse;
    }
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      return redirectResponse;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
