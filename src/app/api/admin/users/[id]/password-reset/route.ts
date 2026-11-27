import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/supabase/serverAuth';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import {
  AdminServiceError,
  sendAdminUserPasswordReset,
} from '@/lib/admin/adminService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const auth = await requireAdminApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const rl = checkRateLimit({
    key: `admin:users:pwreset:${auth.session.user.id}`,
    limit: 10,
    windowMs: 5 * 60_000,
    message: 'Password reset rate limit exceeded. Wait a few minutes before retrying.',
  });
  if (!rl.allowed) return rl.errorResponse!;

  try {
    const reqUrl = new URL(request.url);
    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const origin = configuredUrl || `${reqUrl.protocol}//${reqUrl.host}`;
    const result = await sendAdminUserPasswordReset(auth.session, context.params.id, origin);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    const status = err instanceof AdminServiceError ? err.status : 500;
    return NextResponse.json(
      { error: err?.message || 'Failed to send password reset email.' },
      { status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
