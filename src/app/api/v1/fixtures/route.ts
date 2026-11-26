import { NextResponse } from 'next/server';
import { getFootballDataProvider } from '@/lib/data/provider';
import { logCompetitionIntegrityError } from '@/lib/data/canonicalCompetitions';
import { parseCompetitionFilterIds } from '@/lib/data/fixturesDatabase';
import {
  getBasketballFixturesAndEvaluations,
  getBasketballFixtureByIdFromDb,
} from '@/lib/basketball/readService';
import { resolveTierFromSession, redactExplanationForTier } from '@/lib/auth/tierAccess';
import { requireApiUser } from '@/lib/supabase/serverAuth';
import { Sport } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(request);
    if (!auth.authorized) {
      return auth.errorResponse;
    }
    const tier = resolveTierFromSession(auth.session);
    const { searchParams } = new URL(request.url);
    const rawSport = (searchParams.get('sport') || 'football').toLowerCase();
    const sport: Sport | 'all' =
      rawSport === 'basketball' ? 'basketball' : rawSport === 'all' ? 'all' : 'football';
    const rawCompetitionId = searchParams.get('competition_id') || searchParams.get('league') || undefined;
    const day = searchParams.get('day') || undefined;
    const status = searchParams.get('status') || undefined;
    const fixtureId = searchParams.get('id') || undefined;

    if (sport === 'all') {
      const filterIds = parseCompetitionFilterIds(rawCompetitionId);
      if (filterIds !== null && filterIds.length === 0) {
        logCompetitionIntegrityError('api_query', rawCompetitionId, '/api/v1/fixtures');
        return NextResponse.json(
          {
            sport: 'all',
            tier,
            data: [],
            evaluations: {},
            total: 0,
            liveDataAvailable: true,
            lastUpdated: new Date().toISOString().slice(11, 16) + ' UTC',
            error: `Rejected non-canonical competition_id: "${rawCompetitionId}".`,
            filters: { sport, competition_id: rawCompetitionId, day: day || 'ALL', status: status || 'ALL' },
            timestamp: new Date().toISOString(),
          },
          { headers: { 'Cache-Control': 'no-store, max-age=0' } }
        );
      }

      const footballIds = filterIds?.filter(
        (id) => id !== 'comp_nba' && id !== 'comp_ncaab' && id !== 'comp_euroleague'
      );
      const bbIds = filterIds?.filter(
        (id) => id === 'comp_nba' || id === 'comp_ncaab' || id === 'comp_euroleague'
      );

      const provider = getFootballDataProvider();
      const [fbResult, bbResult] = await Promise.all([
        !filterIds || (footballIds && footballIds.length > 0)
          ? provider.getLiveFixtures({
              competitionId: footballIds && footballIds.length > 0 ? footballIds.join(',') : undefined,
              status,
              day,
            })
          : Promise.resolve(null),
        !filterIds || (bbIds && bbIds.length > 0)
          ? getBasketballFixturesAndEvaluations({
              competitionId: bbIds && bbIds.length > 0 ? bbIds.join(',') : undefined,
              status,
              day,
            })
          : Promise.resolve(null),
      ]);

      const combined = [
        ...(fbResult?.fixtures || []),
        ...(bbResult?.fixtures || []),
      ].sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime());

      let summaryIdx = 0;
      const redactedAll = combined.map((f) => {
        if (!f.writtenExplanation) return f;
        const redacted = redactExplanationForTier(f.writtenExplanation, tier, summaryIdx++);
        return { ...f, writtenExplanation: redacted };
      });

      const evaluationsById: Record<string, any> = {};
      if (bbResult?.evaluationsById) {
        for (const [k, ev] of Object.entries(bbResult.evaluationsById)) {
          const matched = redactedAll.find((f) => f.id === k);
          evaluationsById[k] = ev.writtenExplanation
            ? { ...ev, writtenExplanation: matched?.writtenExplanation ?? redactExplanationForTier(ev.writtenExplanation, tier, 0) }
            : ev;
        }
      }

      return NextResponse.json(
        {
          sport: 'all',
          tier,
          data: redactedAll,
          evaluations: evaluationsById,
          total: redactedAll.length,
          liveDataAvailable: Boolean(fbResult?.liveDataAvailable || bbResult?.liveDataAvailable || redactedAll.length > 0),
          lastUpdated: fbResult?.lastUpdated || bbResult?.lastUpdated || 'never',
          lastSyncTimestamp: fbResult?.lastSyncTimestamp || bbResult?.lastSyncTimestamp || null,
          isDelayed: Boolean(fbResult?.isDelayed && bbResult?.isDelayed),
          staleLimitMinutes: fbResult?.staleLimitMinutes || bbResult?.staleLimitMinutes || 4320,
          filters: {
            sport,
            competition_id: filterIds ? filterIds.join(',') : 'ALL',
            day: day || 'ALL',
            status: status || 'ALL',
          },
          timestamp: new Date().toISOString(),
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (sport === 'basketball') {
      const result = await getBasketballFixturesAndEvaluations({
        league: rawCompetitionId,
        competitionId: rawCompetitionId,
        status,
        day,
      });

      if (fixtureId) {
        const single = await getBasketballFixtureByIdFromDb(fixtureId);
        if (single) {
          if (!result.fixtures.some((f) => f.id === fixtureId)) {
            result.fixtures.unshift(single.fixture);
          }
          result.evaluationsById[fixtureId] = single.evaluation;
        }
      }

      let bbSummaryIdx = 0;
      const redactedBbFixtures = result.fixtures.map((f) => {
        if (!f.writtenExplanation) return f;
        const redacted = redactExplanationForTier(f.writtenExplanation, tier, bbSummaryIdx++);
        return { ...f, writtenExplanation: redacted };
      });
      const redactedEvals: typeof result.evaluationsById = {};
      for (const [k, ev] of Object.entries(result.evaluationsById)) {
        const matchedFix = redactedBbFixtures.find((f) => f.id === k);
        redactedEvals[k] = ev.writtenExplanation
          ? { ...ev, writtenExplanation: matchedFix?.writtenExplanation ?? redactExplanationForTier(ev.writtenExplanation, tier, 0) }
          : ev;
      }

      return NextResponse.json(
        {
          sport: 'basketball',
          tier,
          data: redactedBbFixtures,
          evaluations: redactedEvals,
          total: redactedBbFixtures.length,
          liveDataAvailable: result.liveDataAvailable,
          lastUpdated: result.lastUpdated,
          lastSyncTimestamp: result.lastSyncTimestamp,
          isDelayed: result.isDelayed,
          staleLimitMinutes: result.staleLimitMinutes,
          error: result.error,
          failedProvider: result.failedProvider,
          season: result.season,
          filters: { sport, competition_id: rawCompetitionId || 'ALL', status: status || 'ALL', day: day || 'ALL' },
          timestamp: new Date().toISOString(),
        },
        {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
          },
        }
      );
    }

    // Rule 3: Filter by canonical competition_id(s) ONLY, combined with day filter.
    const filterIds = parseCompetitionFilterIds(rawCompetitionId);
    if (filterIds !== null && filterIds.length === 0) {
      logCompetitionIntegrityError('api_query', rawCompetitionId, '/api/v1/fixtures');
      return NextResponse.json(
        {
          sport: 'football',
          data: [],
          total: 0,
          liveDataAvailable: true,
          lastUpdated: new Date().toISOString().slice(11, 16) + ' UTC',
          error: `Rejected non-canonical competition_id: "${rawCompetitionId}".`,
          filters: { sport, competition_id: rawCompetitionId, day: day || 'ALL', status: status || 'ALL' },
          timestamp: new Date().toISOString(),
        },
        {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
          },
        }
      );
    }
    const competitionId = filterIds ? filterIds.join(',') : undefined;

    // Strictly DB-only read via provider.getLiveFixtures()
    const provider = getFootballDataProvider();
    const result = await provider.getLiveFixtures({ competitionId, status, day });

    if (fixtureId && (!competitionId || competitionId === 'ALL')) {
      const single = await provider.getFixtureById(fixtureId);
      if (single && !result.fixtures.some(f => f.id === fixtureId)) {
        result.fixtures.unshift(single);
      }
    }

    let fbSummaryIdx = 0;
    const redactedFootballFixtures = result.fixtures.map((f) => {
      if (!f.writtenExplanation) return f;
      const redacted = redactExplanationForTier(f.writtenExplanation, tier, fbSummaryIdx++);
      return { ...f, writtenExplanation: redacted };
    });

    return NextResponse.json(
      {
        sport: 'football',
        tier,
        data: redactedFootballFixtures,
        total: redactedFootballFixtures.length,
        liveDataAvailable: result.liveDataAvailable,
        lastUpdated: result.lastUpdated,
        lastSyncTimestamp: result.lastSyncTimestamp,
        isDelayed: result.isDelayed,
        staleLimitMinutes: result.staleLimitMinutes,
        hasFreeFixturesSource: result.hasFreeFixturesSource ?? true,
        storedHistoryMode: result.storedHistoryMode ?? false,
        providerUsed: result.providerUsed,
        failedProvider: result.failedProvider,
        quotaHeaders: result.quotaHeaders,
        skippedLeagues: result.skippedLeagues,
        error: result.error,
        dateRange: result.dateRange,
        filters: { sport, competition_id: competitionId || 'ALL', day: day || 'ALL', status: status || 'ALL' },
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (err: any) {
    const message = err?.message || 'Internal server error loading fixtures';
    return NextResponse.json(
      {
        error: `server error (500): ${message}`,
        reason: message,
        serverStatus: 500,
        isOffline: false,
        data: [],
        total: 0,
        liveDataAvailable: false,
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }
}
