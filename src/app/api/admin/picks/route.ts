import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/supabase/serverAuth';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { AdminServiceError, listAdminPicks } from '@/lib/admin/adminService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireAdminApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const rl = checkRateLimit({
    key: `admin:picks:list:${auth.session.user.id}`,
    limit: 90,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rl.errorResponse!;

  try {
    const { searchParams } = new URL(request.url);
    const data = await listAdminPicks({
      page: Number(searchParams.get('page') || 1),
      pageSize: Number(searchParams.get('pageSize') || 25),
      sport: searchParams.get('sport') || undefined,
      status: searchParams.get('status') || undefined,
      search: searchParams.get('search') || undefined,
    });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    const status = err instanceof AdminServiceError ? err.status : 500;
    return NextResponse.json(
      { error: err?.message || 'Failed to load picks.' },
      { status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
