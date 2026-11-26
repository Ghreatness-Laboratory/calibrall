import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  getServerAuthSession,
  getServerSupabaseConfig,
  getSupabaseServiceClient,
} from '@/lib/supabase/serverAuth';

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

  return NextResponse.json(
    {
      user: session.user,
      profile: {
        ...session.profile,
        tier: session.effectiveTier,
        isAdmin: session.isAdmin,
        isExpired: session.isExpired,
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

  // Strictly only allow displayName updates; ignore role, tier, or tier_expires_at
  const rawName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!rawName || rawName.length > 80) {
    return NextResponse.json(
      { error: 'Display name must be between 1 and 80 characters.' },
      { status: 400 }
    );
  }

  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) {
    return NextResponse.json(
      { error: 'Supabase service role is not configured on the server.' },
      { status: 503 }
    );
  }

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

  return NextResponse.json(
    {
      success: true,
      profile: {
        id: data.id,
        email: data.email || session.user.email,
        displayName: data.display_name,
        role: session.profile.role,
        tier: session.effectiveTier,
        tierExpiresAt: session.profile.tierExpiresAt,
        isAdmin: session.isAdmin,
        isExpired: session.isExpired,
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
    return NextResponse.json(
      { error: 'Supabase service role is not configured on the server.' },
      { status: 503 }
    );
  }

  // Delete from auth.users (cascades to public.profiles via FK ON DELETE CASCADE)
  const { error: deleteErr } = await serviceClient.auth.admin.deleteUser(session.user.id);
  if (deleteErr) {
    return NextResponse.json(
      { error: deleteErr.message || 'Failed to delete user account.' },
      { status: 500 }
    );
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

  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith('sb-') || c.name === 'calibrall_tier') {
      response.cookies.set(c.name, '', { path: '/', maxAge: 0 });
    }
  }

  return response;
}
