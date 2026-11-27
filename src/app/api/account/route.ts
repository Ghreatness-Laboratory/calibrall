import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  getServerAuthSession,
  getServerSupabaseConfig,
  getSupabaseServiceClient,
} from '@/lib/supabase/serverAuth';
import {
  maybeSendPaidRenewalReminderEmail,
  maybeSendTrialReminderEmail,
} from '@/lib/notifications/trialReminders';
import {
  LOCAL_SESSION_COOKIE_NAME,
  isLocalAuthAllowed,
} from '@/lib/auth/localSession';
import {
  deleteLocalUserAccount,
  updateLocalProfileDisplayName,
} from '@/lib/auth/localAuthDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const session = await getServerAuthSession(request);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized: Authentication required.', code: 'AUTH_REQUIRED' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  // Non-blocking optional reminder emails (only sends if email provider is configured)
  void maybeSendTrialReminderEmail(session).catch(() => {});
  void maybeSendPaidRenewalReminderEmail(session).catch(() => {});

  return NextResponse.json(
    {
      user: session.user,
      profile: {
        ...session.profile,
        tier: session.effectiveTier,
        storedTier: session.profile.storedTier ?? session.profile.tier,
        pendingTier: session.profile.pendingTier ?? null,
        pendingTierEffectiveAt: session.profile.pendingTierEffectiveAt ?? null,
        cancelAtPeriodEnd: Boolean(session.profile.cancelAtPeriodEnd),
        isAdmin: session.isAdmin,
        isExpired: session.isExpired,
        entitlementStatus: session.entitlements.status,
        hasModelAccess: session.entitlements.hasModelAccess,
        trialStartedAt: session.entitlements.trialStartedAt,
        trialEndsAt: session.entitlements.trialEndsAt,
        trialDaysRemaining: session.entitlements.trialDaysRemaining,
        emailConfirmed: session.entitlements.emailConfirmed,
      },
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

export async function PATCH(request: Request) {
  const session = await getServerAuthSession(request);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized: Authentication required.', code: 'AUTH_REQUIRED' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Strictly only allow displayName updates; ignore role, tier, trial dates, or tier_expires_at
  const rawName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!rawName || rawName.length > 80) {
    return NextResponse.json(
      { error: 'Display name must be between 1 and 80 characters.' },
      { status: 400 }
    );
  }

  const serviceClient = getSupabaseServiceClient();
  let updatedData: any = null;
  if (!serviceClient) {
    if (!isLocalAuthAllowed()) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured on the server.' },
        { status: 503 }
      );
    }
    updatedData = updateLocalProfileDisplayName(session.user.id, rawName);
    if (!updatedData) {
      return NextResponse.json(
        { error: 'Failed to update local profile.' },
        { status: 500 }
      );
    }
  } else {
    const { data, error } = await serviceClient
      .from('profiles')
      .update({ display_name: rawName })
      .eq('id', session.user.id)
      .select('id, email, display_name, role, tier, tier_expires_at, created_at')
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Failed to update profile.' },
        { status: 500 }
      );
    }
    updatedData = data;
  }
  const data = updatedData;

  return NextResponse.json(
    {
      success: true,
      profile: {
        id: data.id,
        email: data.email || session.user.email,
        displayName: data.display_name,
        role: session.profile.role,
        tier: session.effectiveTier,
        storedTier: session.profile.storedTier ?? session.profile.tier,
        tierExpiresAt: session.profile.tierExpiresAt,
        pendingTier: session.profile.pendingTier ?? null,
        pendingTierEffectiveAt: session.profile.pendingTierEffectiveAt ?? null,
        cancelAtPeriodEnd: Boolean(session.profile.cancelAtPeriodEnd),
        isAdmin: session.isAdmin,
        isExpired: session.isExpired,
        entitlementStatus: session.entitlements.status,
        hasModelAccess: session.entitlements.hasModelAccess,
        trialStartedAt: session.entitlements.trialStartedAt,
        trialEndsAt: session.entitlements.trialEndsAt,
        trialDaysRemaining: session.entitlements.trialDaysRemaining,
        emailConfirmed: session.entitlements.emailConfirmed,
        createdAt: data.created_at,
      },
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

export async function DELETE(request: Request) {
  const session = await getServerAuthSession(request);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized: Authentication required.', code: 'AUTH_REQUIRED' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (body.confirm !== 'DELETE') {
    return NextResponse.json(
      { error: 'Confirmation token "DELETE" is required to permanently delete your account.' },
      { status: 400 }
    );
  }

  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) {
    if (!isLocalAuthAllowed()) {
      return NextResponse.json(
        { error: 'Supabase service role is not configured on the server.' },
        { status: 503 }
      );
    }
    deleteLocalUserAccount(session.user.id);
  } else {
    // Delete from auth.users (cascades to public.profiles via FK ON DELETE CASCADE)
    const { error: deleteErr } = await serviceClient.auth.admin.deleteUser(session.user.id);
    if (deleteErr) {
      return NextResponse.json(
        { error: deleteErr.message || 'Failed to delete user account.' },
        { status: 500 }
      );
    }
  }

  // Also clear SSR auth cookies
  const cookieStore = cookies();
  const { url, anonKey, isAuthConfigured } = getServerSupabaseConfig();
  const response = NextResponse.json(
    { success: true, deletedUserId: session.user.id },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );

  if (isAuthConfigured) {
    try {
      const supabase = createServerClient(url, anonKey, {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      });
      await supabase.auth.signOut();
    } catch {}
  }

  const forwardedProto = request.headers.get('x-forwarded-proto') || '';
  const isHttps = forwardedProto.includes('https') || request.url.startsWith('https://');
  response.cookies.set(LOCAL_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
  });

  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith('sb-') || c.name === 'calibrall_tier') {
      response.cookies.set(c.name, '', { path: '/', maxAge: 0 });
    }
  }

  return response;
}
