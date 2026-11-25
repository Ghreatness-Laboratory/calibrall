// CALIBRALL: Dynamic Database-Driven Competitions API Route
// Shows competitions with exact DB fixture counts. Basketball returns NBA, NCAAB, EuroLeague cleanly.

import { NextRequest, NextResponse } from 'next/server';
import { getCompetitionsFromDatabase } from '@/lib/data/canonicalCompetitions';
import { getBasketballCompetitionsSummary } from '@/lib/basketball/readService';
import { Sport } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sport = (searchParams.get('sport') as Sport | 'all') || 'football';
  const day = searchParams.get('day') || undefined;

  if (sport === 'basketball') {
    const bb = await getBasketballCompetitionsSummary(day);
    return NextResponse.json(
      {
        data: bb.competitions,
        groupedByCountry: bb.groupedByCountry,
        total: bb.total,
        totalFixtures: bb.totalFixtures,
        sport: 'basketball',
        day: day || 'ALL',
        source: 'database:bb_games',
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }

  const { competitions, groupedByCountry, total, totalFixtures } = await getCompetitionsFromDatabase(
    sport,
    day ? { day } : undefined
  );

  return NextResponse.json(
    {
      data: competitions,
      groupedByCountry,
      total,
      totalFixtures,
      sport,
      day: day || 'ALL',
      source: 'database:fixtures',
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
