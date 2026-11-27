import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import {
  getServerSupabaseConfig,
  getSupabaseServiceClient,
  isSafeRedirectPath,
  normalizeRole,
  normalizeTier,
} from '@/lib/supabase/serverAuth';
import { TRIAL_DAYS } from '@/lib/tiers';

export const dynamic = 'force-dynamic';

async function ensureTrialStartedForUser(userId: string) {
  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) return;
  const { data } = await serviceClient
    .from('profiles')
    .select('id, role, tier, trial_started_at, trial_ends_at')
    .eq('id', userId)
    .maybeSingle();
  if (
    data &&
    normalizeRole(data.role) === 'user' &&
    normalizeTier(data.tier) === 'free' &&
    !data.trial_started_at &&
    !data.trial_ends_at
  ) {
    const startIso = new Date().toISOString();
    const endIso = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();
    await serviceClient
      .from('profiles')
      .update({ trial_started_at: startIso, trial_ends_at: endIso })
      .eq('id', userId)
      .is('trial_started_at', null)
      .is('trial_ends_at', null);
  }
}

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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data?.user?.id && (data.user.email_confirmed_at || data.user.confirmed_at)) {
        await ensureTrialStartedForUser(data.user.id).catch(() => {});
      }
      return redirectResponse;
    }
  }

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      if (data?.user?.id && (data.user.email_confirmed_at || data.user.confirmed_at)) {
        await ensureTrialStartedForUser(data.user.id).catch(() => {});
      }
      return redirectResponse;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
