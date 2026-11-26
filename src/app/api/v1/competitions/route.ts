// CALIBRALL: Dynamic Database-Driven Competitions API Route
// Supports football, basketball, and unified all-sports competition discovery with day-range fixture counts & unmapped reporting.

import { NextRequest, NextResponse } from 'next/server';
import { getCompetitionsFromDatabase } from '@/lib/data/canonicalCompetitions';
import { getBasketballCompetitionsSummary } from '@/lib/basketball/readService';
import { requireApiUser } from '@/lib/supabase/serverAuth';
import { Sport } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const { searchParams } = new URL(request.url);
  const rawSport = (searchParams.get('sport') || 'football').toLowerCase();
  const sport: Sport | 'all' =
    rawSport === 'basketball' ? 'basketball' : rawSport === 'all' ? 'all' : 'football';
  const day = searchParams.get('day') || undefined;

  if (sport === 'basketball') {
    const bb = await getBasketballCompetitionsSummary(day);
    return NextResponse.json(
      {
        data: bb.competitions,
        groupedByCountry: bb.groupedByCountry,
        total: bb.total,
        totalFixtures: bb.totalFixtures,
        unmappedFixtures: bb.unmappedFixtures,
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

  const { competitions, groupedByCountry, total, totalFixtures, unmappedFixtures } =
    await getCompetitionsFromDatabase(sport, {
      day,
      includeEmpty: true,
    });

  return NextResponse.json(
    {
      data: competitions,
      groupedByCountry,
      total,
      totalFixtures,
      unmappedFixtures,
      sport,
      day: day || 'ALL',
      source: sport === 'all' ? 'database:fixtures+bb_games' : 'database:fixtures',
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
