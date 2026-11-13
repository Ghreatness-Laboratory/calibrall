import { NextResponse } from 'next/server';
import { getFootballDataProvider } from '@/lib/data/provider';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';

export const dynamic = 'force-dynamic';
export const revalidate = 120;

export async function GET() {
  const provider = getFootballDataProvider();
  const liveResult = await provider.getLiveFixtures();

  if (!liveResult.liveDataAvailable || liveResult.fixtures.length === 0) {
    return NextResponse.json(
      {
        totalQualified: 0,
        recommendations: [],
        liveDataAvailable: false,
        lastUpdated: liveResult.lastUpdated,
        error: liveResult.error || `Live data unavailable. Last updated ${liveResult.lastUpdated}`,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60',
        },
      }
    );
  }

  const qualified: any[] = [];

  liveResult.fixtures.filter(f => f.status !== 'FINISHED').forEach(fixture => {
    const stats = getFixtureStatistics(fixture);

    const evalResult = evaluateFixtureMarkets(buildFixtureContextFromStats(fixture, stats));

    if (evalResult.topPick) {
      qualified.push({
        fixtureId: fixture.id,
        match: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
        competition: fixture.competition.name,
        kickoff: fixture.kickoffTime,
        topPick: evalResult.topPick,
      });
    }
  });

  return NextResponse.json(
    {
      totalQualified: qualified.length,
      recommendations: qualified,
      liveDataAvailable: true,
      lastUpdated: liveResult.lastUpdated,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60',
      },
    }
  );
}
