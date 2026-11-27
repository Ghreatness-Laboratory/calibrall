import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/supabase/serverAuth';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { AdminServiceError, listAdminUsers } from '@/lib/admin/adminService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireAdminApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const rl = checkRateLimit({
    key: `admin:users:list:${auth.session.user.id}`,
    limit: 90,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rl.errorResponse!;

  try {
    const { searchParams } = new URL(request.url);
    const data = await listAdminUsers({
      search: searchParams.get('search') || undefined,
      tier: searchParams.get('tier') || undefined,
      role: searchParams.get('role') || undefined,
      status: searchParams.get('status') || undefined,
      page: Number(searchParams.get('page') || 1),
      pageSize: Number(searchParams.get('pageSize') || 25),
    });

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    const status = err instanceof AdminServiceError ? err.status : 500;
    return NextResponse.json(
      { error: err?.message || 'Failed to list users.' },
      { status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
