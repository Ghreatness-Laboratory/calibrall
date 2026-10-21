import { NextResponse } from 'next/server';
import { getFootballDataProvider } from '@/lib/data/provider';

export const dynamic = 'force-dynamic';
export const revalidate = 120;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const competitionCode = searchParams.get('competition') || undefined;
  const status = searchParams.get('status') || undefined;

  const provider = getFootballDataProvider();
  const result = await provider.getLiveFixtures({ competitionCode, status });

  return NextResponse.json(
    {
      data: result.fixtures,
      total: result.fixtures.length,
      liveDataAvailable: result.liveDataAvailable,
      lastUpdated: result.lastUpdated,
      error: result.error,
      dateRange: result.dateRange,
      filters: { competitionCode, status },
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60',
      },
    }
  );
}
