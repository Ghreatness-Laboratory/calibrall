import { NextResponse } from 'next/server';
import { getFootballDataProvider } from '@/lib/data/provider';
import { getNBADataProvider } from '@/lib/data/nbaProvider';
import { Sport } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 120;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = (searchParams.get('sport') as Sport) || 'football';
  const competitionCode = searchParams.get('competition') || undefined;
  const status = searchParams.get('status') || undefined;

  if (sport === 'basketball') {
    const nbaProvider = getNBADataProvider();
    const result = await nbaProvider.getFixtures(status);

    return NextResponse.json(
      {
        sport: 'basketball',
        data: result.fixtures,
        total: result.fixtures.length,
        liveDataAvailable: result.liveDataAvailable,
        lastUpdated: result.lastUpdated,
        filters: { sport, status },
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60',
        },
      }
    );
  }

  // Default: Football
  const provider = getFootballDataProvider();
  const result = await provider.getLiveFixtures({ competitionCode, status });

  return NextResponse.json(
    {
      sport: 'football',
      data: result.fixtures,
      total: result.fixtures.length,
      liveDataAvailable: result.liveDataAvailable,
      lastUpdated: result.lastUpdated,
      error: result.error,
      dateRange: result.dateRange,
      filters: { sport, competitionCode, status },
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60',
      },
    }
  );
}
