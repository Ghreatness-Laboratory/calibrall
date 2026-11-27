import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/supabase/serverAuth';
import {
  ensureDailyRecordSlips,
  getDailySlipRecordSummary,
  settleDailyRecordSlips,
} from '@/lib/slips/dailySlipRecord';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  try {
    await settleDailyRecordSlips();
    await ensureDailyRecordSlips();
  } catch {
    // Non-fatal: still return persisted records cleanly
  }

  const summary = await getDailySlipRecordSummary();

  return NextResponse.json(summary, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
