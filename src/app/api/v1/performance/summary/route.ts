import { NextResponse } from 'next/server';
import { VERIFIED_PERFORMANCE_REPORT } from '@/lib/data/seedData';
import { VERIFIED_NBA_PERFORMANCE_REPORT } from '@/lib/data/nbaSeedData';
import { CALIBRATED_BASKETBALL_PARAMS } from '@/lib/basketball/calibratedParams';
import {
  getBasketballForwardSummary,
  getBasketballForwardRecords,
} from '@/lib/basketball/settlementService';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport')?.toLowerCase() || 'football';

  if (sport === 'basketball') {
    const [forwardSummary, forwardPicks] = await Promise.all([
      getBasketballForwardSummary(),
      getBasketballForwardRecords(60),
    ]);

    return NextResponse.json({
      sport: 'basketball',
      walkForward: CALIBRATED_BASKETBALL_PARAMS,
      forwardSummary,
      forwardPicks,
      report: VERIFIED_NBA_PERFORMANCE_REPORT,
      timestamp: new Date().toISOString(),
      auditStatus: 'SEPARATE_BASKETBALL_LEDGER',
    });
  }

  return NextResponse.json({
    report: VERIFIED_PERFORMANCE_REPORT,
    timestamp: new Date().toISOString(),
    auditStatus: 'VERIFIED_IMMUTABLE',
  });
}
