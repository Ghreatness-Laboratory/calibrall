import { NextResponse } from 'next/server';
import { getFootballDataProvider } from '@/lib/data/provider';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { evaluateFixtureMarkets, selectDiversifiedSlatePicks } from '@/lib/prediction/marketSelection';
import { persistOrLoadImmutableFootballExplanation } from '@/lib/prediction/footballPickPersistence';
import { getBasketballFixturesAndEvaluations } from '@/lib/basketball/readService';
import { resolveRequestTier, redactExplanationForTier } from '@/lib/auth/tierAccess';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  const tier = resolveRequestTier(request);
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport')?.toLowerCase() || 'football';

  if (sport === 'basketball') {
    const league = searchParams.get('league') || searchParams.get('competition_id') || undefined;
    const day = searchParams.get('day') || undefined;
    const bb = await getBasketballFixturesAndEvaluations({
      league,
      competitionId: league,
      status: 'SCHEDULED',
      day,
    });

    const recommendations = bb.fixtures
      .map((f) => ({ fixture: f, evaluation: bb.evaluationsById[f.id] }))
      .filter((item) => item.evaluation && !item.evaluation.needsHistory && item.evaluation.topPick !== null)
      .map((item, idx) => ({
        fixtureId: item.fixture.id,
        league: item.evaluation.league,
        match: `${item.fixture.homeTeam.name} vs ${item.fixture.awayTeam.name}`,
        competition: item.fixture.competition.name,
        kickoff: item.fixture.kickoffTime,
        topPick: item.evaluation.topPick,
        picks: item.evaluation.picks,
        writtenExplanation: redactExplanationForTier(
          item.evaluation.writtenExplanation || item.fixture.writtenExplanation,
          tier,
          idx
        ),
      }));

    return NextResponse.json(
      {
        sport: 'basketball',
        tier,
        totalQualified: recommendations.length,
        recommendations,
        liveDataAvailable: bb.liveDataAvailable,
        lastUpdated: bb.lastUpdated,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }

  const provider = getFootballDataProvider();
  const liveResult = await provider.getLiveFixtures();

  if (!liveResult.liveDataAvailable || liveResult.fixtures.length === 0) {
    return NextResponse.json(
      {
        tier,
        totalQualified: 0,
        recommendations: [],
        liveDataAvailable: false,
        lastUpdated: liveResult.lastUpdated,
        error: liveResult.error || `Live data unavailable. Last updated ${liveResult.lastUpdated}`,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }

  const evaluated = liveResult.fixtures
    .filter(f => f.status !== 'FINISHED')
    .map(fixture => {
      const stats = getFixtureStatistics(fixture);
      const context = buildFixtureContextFromStats(fixture, stats);
      const evalResult = evaluateFixtureMarkets(context);
      const expl =
        fixture.writtenExplanation ||
        persistOrLoadImmutableFootballExplanation(fixture, evalResult, context);
      return {
        fixtureId: fixture.id,
        fixture,
        topPick: evalResult.topPick,
        predictions: evalResult.predictions,
        noRecommendationReason: evalResult.noRecommendationReason,
        writtenExplanation: expl,
      };
    });

  const diversified = selectDiversifiedSlatePicks(evaluated, 0.40);
  const qualified = diversified
    .filter(item => item.topPick !== null)
    .map((item, idx) => ({
      fixtureId: item.fixture.id,
      match: `${item.fixture.homeTeam.name} vs ${item.fixture.awayTeam.name}`,
      competition: item.fixture.competition.name,
      kickoff: item.fixture.kickoffTime,
      topPick: item.topPick,
      writtenExplanation: redactExplanationForTier(item.writtenExplanation, tier, idx),
    }));

  return NextResponse.json(
    {
      tier,
      totalQualified: qualified.length,
      recommendations: qualified,
      liveDataAvailable: true,
      lastUpdated: liveResult.lastUpdated,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
