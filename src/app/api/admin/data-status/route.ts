import { NextRequest, NextResponse } from 'next/server';
import { matchesStore } from '@/lib/data/matchesStore';
import { verifyAdminSecretHeader } from '@/lib/auth/adminAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  // 1. Authenticate with ADMIN_SECRET via x-admin-secret header only
  const auth = verifyAdminSecretHeader(req);
  if (!auth.authorized) {
    return auth.response!;
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
