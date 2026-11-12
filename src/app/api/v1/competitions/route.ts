// CALIBRALL: Dynamic Database-Driven Competitions API Route
// Requirement 2: Build the competition filter from the database, not a hard-coded list.
// Shows every competition that has fixtures, grouped by country, with exact fixture counts.

import { NextRequest, NextResponse } from 'next/server';
import { getCompetitionsFromDatabase } from '@/lib/data/canonicalCompetitions';
import { getFootballDataProvider } from '@/lib/data/provider';
import { Sport } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sport = (searchParams.get('sport') as Sport | 'all') || 'football';
  const day = searchParams.get('day') || undefined;

  if (sport === 'football' || sport === 'all') {
    await getFootballDataProvider().ensureSynced();
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
