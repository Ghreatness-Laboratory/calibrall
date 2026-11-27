import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/supabase/serverAuth';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { AdminServiceError, moderateAdminPick } from '@/lib/admin/adminService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  const auth = await requireAdminApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const rl = checkRateLimit({
    key: `admin:picks:moderate:${auth.session.user.id}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rl.errorResponse!;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid moderation payload.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const sport = body.sport === 'basketball' ? 'basketball' : body.sport === 'football' ? 'football' : null;
    if (!sport) {
      return NextResponse.json(
        { error: 'sport must be football or basketball.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const result = await moderateAdminPick(auth.session, decodeURIComponent(context.params.id), {
      sport,
      action: body.action,
      reason: body.reason,
    });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    const status = err instanceof AdminServiceError ? err.status : 500;
    return NextResponse.json(
      { error: err?.message || 'Failed to moderate pick.' },
      { status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
