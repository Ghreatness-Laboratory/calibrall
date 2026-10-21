import { NextResponse } from 'next/server';
import { FIXTURES, FIXTURE_STATISTICS } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';

export async function GET() {
  const qualified: any[] = [];

  FIXTURES.filter(f => f.status !== 'FINISHED').forEach(fixture => {
    const stats = FIXTURE_STATISTICS[fixture.id];
    if (!stats) return;

    const evalResult = evaluateFixtureMarkets({
      fixtureId: fixture.id,
      homeTeamName: fixture.homeTeam.name,
      awayTeamName: fixture.awayTeam.name,
      competitionCode: fixture.competition.code,
      competitionName: fixture.competition.name,
      homeAttackRating: fixture.homeTeam.attackRating,
      homeDefenseRating: fixture.homeTeam.defenseRating,
      awayAttackRating: fixture.awayTeam.attackRating,
      awayDefenseRating: fixture.awayTeam.defenseRating,
      homeXg: stats.homeXg,
      awayXg: stats.awayXg,
      expectedCornersHome: stats.expectedCornersHome,
      expectedCornersAway: stats.expectedCornersAway,
      expectedCards: stats.expectedCards,
      uncertaintyScore: stats.uncertaintyScore,
      dataCoverageScore: stats.dataCoverageScore,
      sampleSizeMatches: stats.sampleSizeMatches,
      verifiedOdds: stats.verifiedOdds,
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

  return NextResponse.json({
    totalQualified: qualified.length,
    recommendations: qualified,
    timestamp: new Date().toISOString(),
  });
}
