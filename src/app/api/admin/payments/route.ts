import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/supabase/serverAuth';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import {
  AdminServiceError,
  listAdminPayments,
  recordManualGrant,
} from '@/lib/admin/adminService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireAdminApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const rl = checkRateLimit({
    key: `admin:payments:list:${auth.session.user.id}`,
    limit: 90,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rl.errorResponse!;

  try {
    const { searchParams } = new URL(request.url);
    const data = await listAdminPayments({
      page: Number(searchParams.get('page') || 1),
      pageSize: Number(searchParams.get('pageSize') || 25),
      status: searchParams.get('status') || undefined,
      manualOnly: searchParams.get('manualOnly') || undefined,
      search: searchParams.get('search') || undefined,
    });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    const status = err instanceof AdminServiceError ? err.status : 500;
    return NextResponse.json(
      { error: err?.message || 'Failed to load payments.' },
      { status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const rl = checkRateLimit({
    key: `admin:payments:grant:${auth.session.user.id}`,
    limit: 20,
    windowMs: 60_000,
    message: 'Too many manual payment grant requests. Wait a minute.',
  });
  if (!rl.allowed) return rl.errorResponse!;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request payload.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const result = await recordManualGrant(auth.session, body);
    return NextResponse.json(result, {
      status: 201,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    const status = err instanceof AdminServiceError ? err.status : 500;
    return NextResponse.json(
      { error: err?.message || 'Failed to record manual grant.' },
      { status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
