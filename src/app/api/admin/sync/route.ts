import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/supabase/serverAuth';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { AdminServiceError, triggerAdminSync } from '@/lib/admin/adminService';
import type { SyncMode } from '@/lib/data/providerBudget';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireAdminApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const rl = checkRateLimit({
    key: `admin:sync:${auth.session.user.id}`,
    limit: 5,
    windowMs: 5 * 60_000,
    message: 'Manual sync rate limit exceeded. Wait a few minutes before retrying.',
  });
  if (!rl.allowed) return rl.errorResponse!;

  try {
    const body = await request.json().catch(() => ({}));
    const rawSport = String(body?.sport || 'all').toLowerCase();
    const sport: 'all' | 'football' | 'basketball' =
      rawSport === 'football' ? 'football' : rawSport === 'basketball' ? 'basketball' : 'all';
    const rawMode = String(body?.mode || 'schedule').toLowerCase();
    const mode: SyncMode =
      rawMode === 'results' ? 'results' : rawMode === 'odds' ? 'odds' : 'schedule';

    const result = await triggerAdminSync(auth.session, { sport, mode });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    const status = err instanceof AdminServiceError ? err.status : 500;
    return NextResponse.json(
      { error: err?.message || 'Sync execution failed.' },
      { status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
