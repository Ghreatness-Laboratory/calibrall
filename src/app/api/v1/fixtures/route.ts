import { NextResponse } from 'next/server';
import { getFootballDataProvider } from '@/lib/data/provider';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const competitionCode = searchParams.get('competition') || undefined;
  const status = searchParams.get('status') || undefined;

  const provider = getFootballDataProvider();
  const fixtures = await provider.getFixtures({ competitionCode, status });

  return NextResponse.json({
    data: fixtures,
    total: fixtures.length,
    filters: { competitionCode, status },
    timestamp: new Date().toISOString(),
  });
}
