// CALIBRALL: Dynamic Database-Driven Competitions API Route
// Requirement 2: Build the competition filter from the database, not a hard-coded list.
// Shows every competition that has fixtures, grouped by country, with exact fixture counts.

import { NextRequest, NextResponse } from 'next/server';
import { getCompetitionsFromDatabase } from '@/lib/data/canonicalCompetitions';
import { Sport } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sport = (searchParams.get('sport') as Sport | 'all') || 'football';

  const { competitions, groupedByCountry, total } = await getCompetitionsFromDatabase(sport);

  return NextResponse.json(
    {
      data: competitions,
      groupedByCountry,
      total,
      sport,
      source: 'database:fixtures',
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    }
  );
}
