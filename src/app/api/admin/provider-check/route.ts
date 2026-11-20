import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecretHeader } from '@/lib/auth/adminAuth';
import { getUncoveredFootballCompetitions } from '@/lib/data/canonicalCompetitions';
import {
  supabase,
  isSupabaseConfigured,
  persistenceBackendInfo,
} from '@/lib/supabase/client';
import {
  PROVIDER_BUDGETS,
  ProviderId,
  SkippedLeagueRecord,
  FIXTURE_STALE_LIMIT_MINUTES,
  BASKETBALL_SYNC_ENABLED,
  getBudgetSummary,
} from '@/lib/data/providerBudget';
import {
  loggedProviderFetch,
  getRecentProviderCalls,
  getAllProviderSyncStates,
  getProviderCallCountToday,
  getStoredSportFreshness,
  upsertProviderSyncState,
  formatUtcTimeStamp,
} from '@/lib/data/providerCallLogger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const auth = verifyAdminSecretHeader(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const url = new URL(req.url);
  const shouldProbe = url.searchParams.get('probe') !== 'false';
  const nowIso = new Date().toISOString();
  const persistence = persistenceBackendInfo();

  let footballDataCoveredCompetitions: Array<{
    code: string;
    name: string;
    area: string;
    plan: string | null;
  }> = [];

  const probeResults = new Map<
    ProviderId,
    {
      status: 'ONLINE' | 'ERROR' | 'RATE_LIMITED' | 'UNCONFIGURED' | 'RETIRED' | 'DISABLED';
      httpStatus: number | null;
      quotaRemaining: string | null;
      quotaHeaders: Record<string, string>;
      latencyMs: number;
      responseBody: string;
      error: string | null;
    }
  >();

  // Probe active DB tables read-only to confirm Supabase Postgres schema readiness
  const tableChecks: Record<string, { ok: boolean; count: number | null; error: string | null }> = {};
  if (isSupabaseConfigured && supabase) {
    const tablesToCheck = ['fixtures', 'provider_sync_state', 'provider_call_logs', 'matches', 'teams'];
    await Promise.all(
      tablesToCheck.map(async table => {
        try {
          const { count, error } = await supabase
            .from(table)
            .select('id', { count: 'exact', head: true });
          tableChecks[table] = {
            ok: !error,
            count: typeof count === 'number' ? count : null,
            error: error ? error.message : null,
          };
        } catch (err: any) {
          tableChecks[table] = {
            ok: false,
            count: null,
            error: err?.message || 'Probe failed',
          };
        }
      })
    );
  }

  if (shouldProbe) {
    const fdKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
    const smToken =
      process.env.SPORTMONKS_API_TOKEN?.trim() ||
      process.env.SPORTSMONK_API_KEY?.trim() ||
      process.env.SPORTMONKS_API_KEY?.trim();
    const oddsKey = process.env.ODDS_API_KEY?.trim();

    await Promise.all([
      // 1. Football-Data.org (v4/competitions returns exact covered free-tier competitions)
      (async () => {
        const res = await loggedProviderFetch('football-data', 'https://api.football-data.org/v4/competitions', {
          headers: fdKey ? { 'X-Auth-Token': fdKey } : undefined,
          syncMode: 'health_probe',
          timeoutMs: 8000,
        });
        if (res.ok && Array.isArray(res.json?.competitions)) {
          footballDataCoveredCompetitions = res.json.competitions.map((c: any) => ({
            code: String(c.code || ''),
            name: String(c.name || ''),
            area: String(c.area?.name || ''),
            plan: c.plan ? String(c.plan) : null,
          }));
        }
        const status = !fdKey && !res.ok
          ? 'UNCONFIGURED'
          : res.status === 429
          ? 'RATE_LIMITED'
          : res.ok
          ? 'ONLINE'
          : 'ERROR';
        probeResults.set('football-data', {
          status,
          httpStatus: res.status,
          quotaRemaining: res.quotaRemaining,
          quotaHeaders: res.quotaHeaders,
          latencyMs: res.latencyMs,
          responseBody: res.ok
            ? `OK (${footballDataCoveredCompetitions.length} competitions returned)`
            : res.bodyText.slice(0, 300),
          error: res.error || null,
        });
        await upsertProviderSyncState('provider:football-data', {
          sport: 'football',
          providerName: 'Football-Data.org v4',
          status,
          lastAttemptAt: nowIso,
          ...(res.ok ? { lastSuccessAt: nowIso, lastError: null, lastHttpStatus: res.status, lastResponseBody: null } : { lastError: res.error || `HTTP ${res.status}`, lastHttpStatus: res.status, lastResponseBody: res.bodyText.slice(0, 300) }),
          quotaRemaining: res.quotaRemaining,
          quotaHeaders: res.quotaHeaders,
          callsUsedLastRun: 1,
        });
      })(),

      // 2. Sportmonks v3
      (async () => {
        const smUrl = smToken
          ? `https://api.sportmonks.com/v3/football/leagues?api_token=${smToken}`
          : 'https://api.sportmonks.com/v3/football/leagues';
        const res = await loggedProviderFetch('sportmonks', smUrl, {
          syncMode: 'health_probe',
          timeoutMs: 8000,
        });
        const status = !smToken && !res.ok
          ? 'UNCONFIGURED'
          : res.status === 429
          ? 'RATE_LIMITED'
          : res.ok
          ? 'ONLINE'
          : 'ERROR';
        probeResults.set('sportmonks', {
          status,
          httpStatus: res.status,
          quotaRemaining: res.quotaRemaining,
          quotaHeaders: res.quotaHeaders,
          latencyMs: res.latencyMs,
          responseBody: res.ok
            ? `OK (${Array.isArray(res.json?.data) ? res.json.data.length : 0} leagues)`
            : res.bodyText.slice(0, 300),
          error: res.error || null,
        });
        await upsertProviderSyncState('provider:sportmonks', {
          sport: 'football',
          providerName: 'Sportmonks v3',
          status,
          lastAttemptAt: nowIso,
          ...(res.ok ? { lastSuccessAt: nowIso, lastError: null, lastHttpStatus: res.status, lastResponseBody: null } : { lastError: res.error || `HTTP ${res.status}`, lastHttpStatus: res.status, lastResponseBody: res.bodyText.slice(0, 300) }),
          quotaRemaining: res.quotaRemaining,
          quotaHeaders: res.quotaHeaders,
          callsUsedLastRun: 1,
        });
      })(),

      // 3. The Odds API v4 (0-cost /v4/sports/ metadata endpoint exposes x-requests-remaining & x-requests-used)
      (async () => {
        const oddsUrl = oddsKey
          ? `https://api.the-odds-api.com/v4/sports/?apiKey=${oddsKey}`
          : 'https://api.the-odds-api.com/v4/sports/';
        const res = await loggedProviderFetch('the-odds-api', oddsUrl, {
          syncMode: 'health_probe',
          timeoutMs: 8000,
        });
        const status = !oddsKey && !res.ok
          ? 'UNCONFIGURED'
          : res.status === 429
          ? 'RATE_LIMITED'
          : res.ok
          ? 'ONLINE'
          : 'ERROR';
        probeResults.set('the-odds-api', {
          status,
          httpStatus: res.status,
          quotaRemaining: res.quotaRemaining,
          quotaHeaders: res.quotaHeaders,
          latencyMs: res.latencyMs,
          responseBody: res.ok
            ? `OK (${Array.isArray(res.json) ? res.json.length : 0} sports active, remaining=${res.quotaRemaining || 'n/a'})`
            : res.bodyText.slice(0, 300),
          error: res.error || null,
        });
        await upsertProviderSyncState('provider:the-odds-api', {
          sport: 'odds',
          providerName: 'The Odds API v4',
          status,
          lastAttemptAt: nowIso,
          ...(res.ok ? { lastSuccessAt: nowIso, lastError: null, lastHttpStatus: res.status, lastResponseBody: null } : { lastError: res.error || `HTTP ${res.status}`, lastHttpStatus: res.status, lastResponseBody: res.bodyText.slice(0, 300) }),
          quotaRemaining: res.quotaRemaining,
          quotaHeaders: res.quotaHeaders,
          // /v4/sports/ is 0 credits; preserve callsUsedLastRun from the latest sync run
        });
      })(),
    ]);
  }

  // Basketball providers remain disabled (0 calls) until basketball module is built
  if (!BASKETBALL_SYNC_ENABLED) {
    probeResults.set('balldontlie', {
      status: 'DISABLED',
      httpStatus: null,
      quotaRemaining: '0/0 disabled',
      quotaHeaders: {},
      latencyMs: 0,
      responseBody: 'NBA and basketball syncing disabled until basketball module is built.',
      error: null,
    });
    probeResults.set('espn_nba', {
      status: 'DISABLED',
      httpStatus: null,
      quotaRemaining: '0/0 disabled',
      quotaHeaders: {},
      latencyMs: 0,
      responseBody: 'NBA and basketball syncing disabled until basketball module is built.',
      error: null,
    });
  }

  // ESPN Soccer is retired and never live-probed
  probeResults.set('espn_soccer', {
    status: 'RETIRED',
    httpStatus: null,
    quotaRemaining: '0/0 retired',
    quotaHeaders: {},
    latencyMs: 0,
    responseBody: 'Retired from scheduled football ingestion (replaced by Football-Data.org + Sportmonks free tiers).',
    error: null,
  });

  const syncStates = await getAllProviderSyncStates();
  const stateById = new Map(syncStates.map(s => [s.id, s]));
  const footballFreshness = await getStoredSportFreshness('football');
  const basketballFreshness = await getStoredSportFreshness('basketball');

  const keyPresent: Record<ProviderId, boolean> = {
    'football-data': Boolean(process.env.FOOTBALL_DATA_API_KEY?.trim()),
    sportmonks: Boolean(
      process.env.SPORTMONKS_API_TOKEN?.trim() ||
        process.env.SPORTSMONK_API_KEY?.trim() ||
        process.env.SPORTMONKS_API_KEY?.trim()
    ),
    'the-odds-api': Boolean(process.env.ODDS_API_KEY?.trim()),
    balldontlie: Boolean(
      process.env.BALLDONTLIE_API_KEY?.trim() || process.env.BALL_DONT_LIE_API_KEY?.trim()
    ),
    espn_soccer: false,
    espn_nba: BASKETBALL_SYNC_ENABLED,
  };

  const providersReport = await Promise.all(
    (Object.keys(PROVIDER_BUDGETS) as ProviderId[]).map(async id => {
      const budget = PROVIDER_BUDGETS[id];
      const storedState = stateById.get(`provider:${id}`);
      const liveProbe = probeResults.get(id);
      const isBasketballDisabled = !BASKETBALL_SYNC_ENABLED && (id === 'balldontlie' || id === 'espn_nba');
      const callsToday =
        id === 'espn_soccer' || isBasketballDisabled
          ? 0
          : await getProviderCallCountToday(id);

      const dailyCap = budget.dailyQuotaLimit;
      const budgetLeft =
        dailyCap !== null ? `${Math.max(0, dailyCap - callsToday)}/${dailyCap} daily budget` : null;

      const lastSuccessIso =
        isBasketballDisabled
          ? null
          : storedState?.lastSuccessAt ||
            ((id === 'football-data' || id === 'sportmonks') ? footballFreshness.newestUpdatedAt : null) ||
            (id === 'espn_nba' ? basketballFreshness.newestUpdatedAt : null);

      return {
        id,
        name: budget.name,
        sport: budget.sport,
        configured: keyPresent[id],
        status: liveProbe?.status || storedState?.status || (keyPresent[id] ? 'ONLINE' : 'UNCONFIGURED'),
        lastHttpStatus: isBasketballDisabled ? null : (liveProbe?.httpStatus ?? storedState?.lastHttpStatus ?? null),
        lastSuccessfulFetch: lastSuccessIso,
        lastSuccessfulFetchFormatted: formatUtcTimeStamp(lastSuccessIso),
        quotaLeft:
          liveProbe?.quotaRemaining ||
          storedState?.quotaRemaining ||
          budgetLeft ||
          'unlimited / public',
        quotaHeaders:
          (liveProbe && Object.keys(liveProbe.quotaHeaders).length > 0
            ? liveProbe.quotaHeaders
            : storedState?.quotaHeaders) || {},
        callsToday,
        lastError: liveProbe?.error ?? storedState?.lastError ?? null,
        lastResponseBody: liveProbe?.responseBody ?? storedState?.lastResponseBody ?? null,
        budget: {
          freeQuota: budget.freeQuota,
          callsPerLiveRefresh: budget.callsPerLiveRefresh,
          callsPerScheduleRefresh: budget.callsPerScheduleRefresh,
          liveRefreshIntervalMinutes: budget.liveRefreshIntervalMinutes,
          scheduleRefreshIntervalMinutes: budget.scheduleRefreshIntervalMinutes,
          budgetedCallsPerDay: budget.budgetedCallsPerDay,
          beforeCallsPerDayEstimate: budget.beforeCallsPerDayEstimate,
        },
      };
    })
  );

  // Aggregate skipped leagues across football & odds sync state
  const skippedMap = new Map<string, SkippedLeagueRecord>();
  for (const st of syncStates) {
    for (const sk of st.skippedLeagues || []) {
      const k = `${sk.provider}:${sk.leagueCode}`;
      if (!skippedMap.has(k)) skippedMap.set(k, sk);
    }
  }

  const last20Calls = await getRecentProviderCalls(20);
  const budgetSummary = getBudgetSummary();
  const uncoveredLeagues = getUncoveredFootballCompetitions();

  // Compute Odds API credit telemetry (excluding 0-cost /v4/sports/ health probes)
  const allRecentOdds = last20Calls.filter(c => c.provider === 'the-odds-api' && c.syncMode !== 'health_probe');
  const oddsProbeHeaders = probeResults.get('the-odds-api')?.quotaHeaders || stateById.get('provider:the-odds-api')?.quotaHeaders || {};
  const oddsState = stateById.get('provider:the-odds-api');
  const oddsWithoutOddsLastRun = oddsState?.skippedLeagues || [];

  return NextResponse.json(
    {
      success: true,
      timestamp: nowIso,
      probedLive: shouldProbe,
      basketballSyncEnabled: BASKETBALL_SYNC_ENABLED,
      architecture: 'vercel_hobby_daily_cron_plus_github_actions_to_supabase_postgres',
      cronSchedule: {
        vercelJson: '0 6 * * *',
        githubActionsEveningSync: '0 18 * * *',
        githubActionsWeeklyBackfill: '0 4 * * 1',
      },
      persistence: {
        ...persistence,
        tables: tableChecks,
      },
      competitionIdDisambiguation: {
        footballDataOrgEuropeanChampionship: {
          externalCode: 'EC',
          internalId: 'comp_euro',
          internalCode: 'EURO',
          name: 'UEFA European Championship',
        },
        footballDataCoUkNationalLeague: {
          divisionCode: 'EC',
          internalId: 'comp_eng_national_league',
          internalCode: 'EC',
          name: 'National League',
        },
      },
      storedFixturesFreshness: {
        staleLimitMinutes: FIXTURE_STALE_LIMIT_MINUTES,
        staleLimitDays: Math.round(FIXTURE_STALE_LIMIT_MINUTES / 1440),
        football: {
          fixtureCount: footballFreshness.fixtureCount,
          lastUpdated: footballFreshness.lastUpdatedFormatted,
          newestUpdatedAt: footballFreshness.newestUpdatedAt,
          ageMinutes: footballFreshness.ageMinutes,
          isStaleBeyondLimit: footballFreshness.isStaleBeyondLimit,
        },
        basketball: {
          enabled: BASKETBALL_SYNC_ENABLED,
          status: BASKETBALL_SYNC_ENABLED ? 'ONLINE' : 'DISABLED',
          fixtureCount: basketballFreshness.fixtureCount,
          lastUpdated: basketballFreshness.lastUpdatedFormatted,
          newestUpdatedAt: basketballFreshness.newestUpdatedAt,
          ageMinutes: basketballFreshness.ageMinutes,
          isStaleBeyondLimit: basketballFreshness.isStaleBeyondLimit,
        },
      },
      footballDataFreeTier: {
        coveredCompetitionsCount: footballDataCoveredCompetitions.length,
        coveredCompetitions: footballDataCoveredCompetitions,
        callsPerRun: 2,
        runsPerDay: 2,
        callsPerDayNeeded: 4,
      },
      theOddsApiCredits: {
        freeMonthlyAllowance: 500,
        maxRunsPerDay: 2,
        dailyCreditCeiling: PROVIDER_BUDGETS['the-odds-api'].dailyQuotaLimit,
        projectedMonthlyMax: (PROVIDER_BUDGETS['the-odds-api'].dailyQuotaLimit || 16) * 30,
        leagueOrderingRule: 'Ordered descending by upcoming qualified picks count per league',
        creditsUsedLastRun: oddsState?.callsUsedLastRun ?? 0,
        creditsUsedThisMonthFromHeader: oddsProbeHeaders['x-requests-used'] || null,
        creditsRemainingFromHeader: oddsProbeHeaders['x-requests-remaining'] || oddsState?.quotaRemaining || null,
        recentCreditCallsLogged: allRecentOdds.length,
        leaguesWithoutOddsLastRunCount: oddsWithoutOddsLastRun.length,
        leaguesWithoutOddsLastRun: oddsWithoutOddsLastRun,
      },
      uncoveredLeaguesCount: uncoveredLeagues.length,
      uncoveredLeagues,
      callBudgetSummary: {
        beforeCallsPerDaySingleVisitor: budgetSummary.beforeCallsPerDaySingleVisitor,
        beforeCallsPerDayPreviousCron: budgetSummary.beforeCallsPerDayPreviousCron,
        afterBudgetedCallsPerDay: budgetSummary.totalBudgetedCallsPerDay,
        visitorReadProviderCalls: 0,
      },
      providers: providersReport,
      skippedLeaguesCount: skippedMap.size,
      skippedLeagues: Array.from(skippedMap.values()),
      last20Calls,
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
