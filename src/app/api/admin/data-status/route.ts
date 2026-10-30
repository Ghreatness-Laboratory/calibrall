import { NextRequest, NextResponse } from 'next/server';
import { matchesStore } from '@/lib/data/matchesStore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  // 1. Authenticate with ADMIN_SECRET header or query parameter
  const url = new URL(req.url);
  const secretParam = url.searchParams.get('secret');
  const adminSecret =
    req.headers.get('admin_secret') ||
    req.headers.get('x-admin-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    secretParam;

  const validSecret =
    process.env.ADMIN_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.REVALIDATE_SECRET?.trim() ||
    'calibrall_secret_2026';

  if (!adminSecret || adminSecret !== validSecret) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing ADMIN_SECRET.' },
      { status: 401 }
    );
  }

  try {
    const report = await matchesStore.getDataStatus();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...report,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to retrieve data status' },
      { status: 500 }
    );
  }
}
