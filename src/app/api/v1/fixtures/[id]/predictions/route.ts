import { NextResponse } from 'next/server';
import { getEvaluatedFixture } from '@/lib/data/provider';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const result = await getEvaluatedFixture(params.id);

  if (!result) {
    return NextResponse.json(
      { error: 'Fixture not found', code: 'FIXTURE_NOT_FOUND' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    fixtureId: params.id,
    matchName: `${result.fixture.homeTeam.name} vs ${result.fixture.awayTeam.name}`,
    competition: result.fixture.competition.name,
    context: {
      homeXg: result.context.homeXg,
      awayXg: result.context.awayXg,
      totalXg: result.context.homeXg + result.context.awayXg,
      expectedCorners: result.context.expectedCornersHome + result.context.expectedCornersAway,
      expectedCards: result.context.expectedCards,
      uncertaintyScore: result.context.uncertaintyScore,
      dataCoverageScore: result.context.dataCoverageScore,
      sampleSize: result.context.sampleSizeMatches,
    },
    topRecommendation: result.topPick,
    noRecommendationReason: result.noRecommendationReason,
    allPredictions: result.predictions,
    timestamp: new Date().toISOString(),
  });
}
