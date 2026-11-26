import { NextResponse } from 'next/server';
import { getEvaluatedFixture } from '@/lib/data/provider';
import { resolveRequestTier, redactExplanationForTier } from '@/lib/auth/tierAccess';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const tier = resolveRequestTier(request);
  const result = await getEvaluatedFixture(params.id);

  if (!result) {
    return NextResponse.json(
      { error: 'Fixture not found', code: 'FIXTURE_NOT_FOUND' },
      { status: 404 }
    );
  }

  const redactedExplanation = redactExplanationForTier(result.writtenExplanation, tier, 0);
  const topRecommendation = result.topPick
    ? { ...result.topPick, writtenExplanation: redactedExplanation }
    : null;

  return NextResponse.json(
    {
      fixtureId: params.id,
      tier,
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
      writtenExplanation: redactedExplanation,
      topRecommendation,
      noRecommendationReason: result.noRecommendationReason,
      allPredictions: result.predictions,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
