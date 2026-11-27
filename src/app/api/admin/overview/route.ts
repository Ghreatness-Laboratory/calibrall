import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/supabase/serverAuth';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { AdminServiceError, getAdminOverview } from '@/lib/admin/adminService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireAdminApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const rl = checkRateLimit({
    key: `admin:overview:${auth.session.user.id}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rl.errorResponse!;

  try {
    const overview = await getAdminOverview();
    return NextResponse.json(overview, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    const status = err instanceof AdminServiceError ? err.status : 500;
    return NextResponse.json(
      { error: err?.message || 'Failed to load admin overview.' },
      { status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
