import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/supabase/serverAuth';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import {
  AdminServiceError,
  getAdminUserDetail,
  updateAdminUser,
} from '@/lib/admin/adminService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const auth = await requireAdminApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const rl = checkRateLimit({
    key: `admin:users:detail:${auth.session.user.id}`,
    limit: 90,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rl.errorResponse!;

  try {
    const detail = await getAdminUserDetail(context.params.id);
    return NextResponse.json(detail, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    const status = err instanceof AdminServiceError ? err.status : 500;
    return NextResponse.json(
      { error: err?.message || 'Failed to load user detail.' },
      { status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  const auth = await requireAdminApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const rl = checkRateLimit({
    key: `admin:users:mutate:${auth.session.user.id}`,
    limit: 30,
    windowMs: 60_000,
    message: 'Too many user administration updates. Please wait briefly.',
  });
  if (!rl.allowed) return rl.errorResponse!;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || !body.action) {
      return NextResponse.json(
        { error: 'Request body with valid action is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const updated = await updateAdminUser(auth.session, context.params.id, body);
    return NextResponse.json(updated, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    const status = err instanceof AdminServiceError ? err.status : 500;
    return NextResponse.json(
      { error: err?.message || 'Failed to update user.' },
      { status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
