import { NextResponse } from 'next/server';
import { getFootballDataProvider } from '@/lib/data/provider';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { evaluateFixtureMarkets, selectDiversifiedSlatePicks } from '@/lib/prediction/marketSelection';

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

  const evaluated = liveResult.fixtures
    .filter(f => f.status !== 'FINISHED')
    .map(fixture => {
      const stats = getFixtureStatistics(fixture);
      const evalResult = evaluateFixtureMarkets(buildFixtureContextFromStats(fixture, stats));
      return {
        fixtureId: fixture.id,
        fixture,
        topPick: evalResult.topPick,
        predictions: evalResult.predictions,
        noRecommendationReason: evalResult.noRecommendationReason,
      };
    });

  const diversified = selectDiversifiedSlatePicks(evaluated, 0.40);
  const qualified = diversified
    .filter(item => item.topPick !== null)
    .map(item => ({
      fixtureId: item.fixture.id,
      match: `${item.fixture.homeTeam.name} vs ${item.fixture.awayTeam.name}`,
      competition: item.fixture.competition.name,
      kickoff: item.fixture.kickoffTime,
      topPick: item.topPick,
    }));

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
