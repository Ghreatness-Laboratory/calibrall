import { NextResponse } from 'next/server';
import { getFootballDataProvider } from '@/lib/data/provider';
import { getFixtureStatistics } from '@/lib/data/seedData';
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

    const evalResult = evaluateFixtureMarkets({
      fixtureId: fixture.id,
      homeTeamName: fixture.homeTeam.name,
      awayTeamName: fixture.awayTeam.name,
      competitionCode: fixture.competition.code,
      competitionName: fixture.competition.name,
      homeAttackRating: fixture.homeTeam.attackRating ?? 1.0,
      homeDefenseRating: fixture.homeTeam.defenseRating ?? 1.0,
      awayAttackRating: fixture.awayTeam.attackRating ?? 1.0,
      awayDefenseRating: fixture.awayTeam.defenseRating ?? 1.0,
      homeXg: stats.homeXg,
      awayXg: stats.awayXg,
      expectedCornersHome: stats.expectedCornersHome,
      expectedCornersAway: stats.expectedCornersAway,
      expectedCards: stats.expectedCards,
      uncertaintyScore: stats.uncertaintyScore as any,
      dataCoverageScore: stats.dataCoverageScore as any,
      sampleSizeMatches: stats.sampleSizeMatches,
      verifiedOdds: stats.verifiedOdds,
      insufficientData: stats.insufficientData,
      hasRealTeamStrength: stats.hasRealTeamStrength,
    });

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
