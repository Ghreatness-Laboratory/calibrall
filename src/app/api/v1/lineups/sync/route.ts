import { NextRequest, NextResponse } from 'next/server';
import { LiveFootballDataProvider } from '@/lib/data/provider';
import { syncActiveWindowLineups } from '@/lib/data/lineupsService';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const provider = new LiveFootballDataProvider();
    const liveResult = await provider.getLiveFixtures({ status: 'ALL' });
    const fixtures = liveResult.fixtures || [];

    const syncReport = await syncActiveWindowLineups(fixtures);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      syncReport,
      policy: 'Polling active strictly for fixtures starting within [now, now + 90 mins]. Polling stops immediately upon confirmed lineup flag.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Lineup sync failed' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
