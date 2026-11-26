import { NextResponse } from 'next/server';
import { VERIFIED_PERFORMANCE_REPORT } from '@/lib/data/seedData';
import { VERIFIED_NBA_PERFORMANCE_REPORT } from '@/lib/data/nbaSeedData';
import { CALIBRATED_BASKETBALL_PARAMS } from '@/lib/basketball/calibratedParams';
import {
  getBasketballForwardSummary,
  getBasketballForwardRecords,
} from '@/lib/basketball/settlementService';
import { resolveRequestTier, FREE_DAILY_SUMMARY_LIMIT } from '@/lib/auth/tierAccess';
import { cleanDisplayText } from '@/lib/utils/formatText';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function firstSentenceSummary(text?: string): string | undefined {
  if (!text) return undefined;
  const cleaned = cleanDisplayText(text).trim();
  const match = cleaned.match(/^(.+?[.!?])(?:\s+|$)/);
  return match ? match[1].trim() : cleaned;
}

export async function GET(request: Request) {
  const tier = resolveRequestTier(request);
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport')?.toLowerCase() || 'football';

  if (sport === 'basketball') {
    const [forwardSummary, rawForwardPicks] = await Promise.all([
      getBasketballForwardSummary(),
      getBasketballForwardRecords(60),
    ]);

    let summaryIdx = 0;
    const forwardPicks = rawForwardPicks.map((row) => {
      if (tier === 'pro' || tier === 'premium') return row;
      const hasSummary = Boolean(row.summary);
      const allowed = hasSummary && summaryIdx < FREE_DAILY_SUMMARY_LIMIT;
      if (hasSummary) summaryIdx++;
      return {
        ...row,
        summary: hasSummary
          ? allowed
            ? firstSentenceSummary(row.summary)
            : 'Daily free summary limit reached (3 per day). Upgrade for full match analysis.'
          : undefined,
        reasoning: undefined,
        alternates: undefined,
      };
    });

    return NextResponse.json(
      {
        sport: 'basketball',
        tier,
        walkForward: CALIBRATED_BASKETBALL_PARAMS,
        forwardSummary,
        forwardPicks,
        report: VERIFIED_NBA_PERFORMANCE_REPORT,
        timestamp: new Date().toISOString(),
        auditStatus: 'SEPARATE_BASKETBALL_LEDGER',
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }

  return NextResponse.json(
    {
      tier,
      report: VERIFIED_PERFORMANCE_REPORT,
      timestamp: new Date().toISOString(),
      auditStatus: 'VERIFIED_IMMUTABLE',
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
