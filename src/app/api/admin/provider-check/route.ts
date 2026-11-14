import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecretHeader } from '@/lib/auth/adminAuth';
import {
  PROVIDER_BUDGETS,
  ProviderId,
  SkippedLeagueRecord,
  FIXTURE_STALE_LIMIT_MINUTES,
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

  // Optional live lightweight probe of each provider to report current HTTP status & quota headers
  const probeResults = new Map<
    ProviderId,
    {
      status: 'ONLINE' | 'ERROR' | 'RATE_LIMITED' | 'UNCONFIGURED';
      httpStatus: number | null;
      quotaRemaining: string | null;
      quotaHeaders: Record<string, string>;
      latencyMs: number;
      responseBody: string;
      error: string | null;
    }
  >();

  if (shouldProbe) {
    const fdKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
    const smToken =
      process.env.SPORTMONKS_API_TOKEN?.trim() ||
      process.env.SPORTSMONK_API_KEY?.trim() ||
      process.env.SPORTMONKS_API_KEY?.trim();
    const oddsKey = process.env.ODDS_API_KEY?.trim();
    const bdlKey =
      process.env.BALLDONTLIE_API_KEY?.trim() ||
      process.env.BALL_DONT_LIE_API_KEY?.trim();

    await Promise.all([
      // 1. Football-Data.org
      (async () => {
        const res = await loggedProviderFetch('football-data', 'https://api.football-data.org/v4/competitions', {
          headers: fdKey ? { 'X-Auth-Token': fdKey } : undefined,
          syncMode: 'health_probe',
          timeoutMs: 8000,
        });
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
          responseBody: res.bodyText.slice(0, 300),
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
          responseBody: res.bodyText.slice(0, 300),
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

      // 3. The Odds API v4 (free /v4/sports/ metadata endpoint)
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
          responseBody: res.bodyText.slice(0, 300),
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
          callsUsedLastRun: 1,
        });
      })(),

      // 4. BallDontLie v1
      (async () => {
        const res = await loggedProviderFetch('balldontlie', 'https://api.balldontlie.io/v1/teams', {
          headers: bdlKey ? { Authorization: bdlKey } : undefined,
          syncMode: 'health_probe',
          timeoutMs: 8000,
        });
        const status = !bdlKey && !res.ok
          ? 'UNCONFIGURED'
          : res.status === 429
          ? 'RATE_LIMITED'
          : res.ok
          ? 'ONLINE'
          : 'ERROR';
        probeResults.set('balldontlie', {
          status,
          httpStatus: res.status,
          quotaRemaining: res.quotaRemaining,
          quotaHeaders: res.quotaHeaders,
          latencyMs: res.latencyMs,
          responseBody: res.bodyText.slice(0, 300),
          error: res.error || null,
        });
        await upsertProviderSyncState('provider:balldontlie', {
          sport: 'basketball',
          providerName: 'BallDontLie v1',
          status,
          lastAttemptAt: nowIso,
          ...(res.ok ? { lastSuccessAt: nowIso, lastError: null, lastHttpStatus: res.status, lastResponseBody: null } : { lastError: res.error || `HTTP ${res.status}`, lastHttpStatus: res.status, lastResponseBody: res.bodyText.slice(0, 300) }),
          quotaRemaining: res.quotaRemaining,
          quotaHeaders: res.quotaHeaders,
          callsUsedLastRun: 1,
        });
      })(),

      // 5. ESPN Soccer Scoreboard
      (async () => {
        const res = await loggedProviderFetch(
          'espn_soccer',
          'https://site.web.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard',
          {
            headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; Calibrall/1.0)' },
            leagueCode: 'PL',
            syncMode: 'health_probe',
            timeoutMs: 8000,
          }
        );
        const status = res.status === 429 ? 'RATE_LIMITED' : res.ok ? 'ONLINE' : 'ERROR';
        probeResults.set('espn_soccer', {
          status,
          httpStatus: res.status,
          quotaRemaining: res.quotaRemaining,
          quotaHeaders: res.quotaHeaders,
          latencyMs: res.latencyMs,
          responseBody: res.ok ? `OK (${(res.json?.events || []).length} events)` : res.bodyText.slice(0, 300),
          error: res.error || null,
        });
        await upsertProviderSyncState('provider:espn_soccer', {
          sport: 'football',
          providerName: 'ESPN Soccer Scoreboard',
          status,
          lastAttemptAt: nowIso,
          ...(res.ok ? { lastSuccessAt: nowIso, lastError: null, lastHttpStatus: res.status, lastResponseBody: null } : { lastError: res.error || `HTTP ${res.status}`, lastHttpStatus: res.status, lastResponseBody: res.bodyText.slice(0, 300) }),
          quotaRemaining: res.quotaRemaining,
          quotaHeaders: res.quotaHeaders,
          callsUsedLastRun: 1,
        });
      })(),

      // 6. ESPN NBA Scoreboard
      (async () => {
        const res = await loggedProviderFetch(
          'espn_nba',
          'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
          {
            headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; Calibrall/1.0)' },
            leagueCode: 'NBA',
            syncMode: 'health_probe',
            timeoutMs: 8000,
          }
        );
        const status = res.status === 429 ? 'RATE_LIMITED' : res.ok ? 'ONLINE' : 'ERROR';
        probeResults.set('espn_nba', {
          status,
          httpStatus: res.status,
          quotaRemaining: res.quotaRemaining,
          quotaHeaders: res.quotaHeaders,
          latencyMs: res.latencyMs,
          responseBody: res.ok ? `OK (${(res.json?.events || []).length} events)` : res.bodyText.slice(0, 300),
          error: res.error || null,
        });
        await upsertProviderSyncState('provider:espn_nba', {
          sport: 'basketball',
          providerName: 'ESPN NBA Scoreboard',
          status,
          lastAttemptAt: nowIso,
          ...(res.ok ? { lastSuccessAt: nowIso, lastError: null, lastHttpStatus: res.status, lastResponseBody: null } : { lastError: res.error || `HTTP ${res.status}`, lastHttpStatus: res.status, lastResponseBody: res.bodyText.slice(0, 300) }),
          quotaRemaining: res.quotaRemaining,
          quotaHeaders: res.quotaHeaders,
          callsUsedLastRun: 1,
        });
      })(),
    ]);
  }

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
    espn_soccer: true,
    espn_nba: true,
  };

  const providersReport = await Promise.all(
    (Object.keys(PROVIDER_BUDGETS) as ProviderId[]).map(async id => {
      const budget = PROVIDER_BUDGETS[id];
      const storedState = stateById.get(`provider:${id}`);
      const liveProbe = probeResults.get(id);
      const callsToday = await getProviderCallCountToday(id);

      const dailyCap = budget.dailyQuotaLimit;
      const budgetLeft =
        dailyCap !== null ? `${Math.max(0, dailyCap - callsToday)}/${dailyCap} daily budget` : null;

      const lastSuccessIso =
        storedState?.lastSuccessAt ||
        (id === 'espn_soccer' ? footballFreshness.newestUpdatedAt : null) ||
        (id === 'espn_nba' ? basketballFreshness.newestUpdatedAt : null);

      return {
        id,
        name: budget.name,
        sport: budget.sport,
        configured: keyPresent[id],
        status: liveProbe?.status || storedState?.status || (keyPresent[id] ? 'ONLINE' : 'UNCONFIGURED'),
        lastHttpStatus: liveProbe?.httpStatus ?? storedState?.lastHttpStatus ?? null,
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

  return NextResponse.json(
    {
      success: true,
      timestamp: nowIso,
      probedLive: shouldProbe,
      architecture: 'scheduled_cron_to_supabase_db_only_reads',
      storedFixturesFreshness: {
        staleLimitMinutes: FIXTURE_STALE_LIMIT_MINUTES,
        football: {
          fixtureCount: footballFreshness.fixtureCount,
          lastUpdated: footballFreshness.lastUpdatedFormatted,
          newestUpdatedAt: footballFreshness.newestUpdatedAt,
          ageMinutes: footballFreshness.ageMinutes,
          isStaleBeyondLimit: footballFreshness.isStaleBeyondLimit,
        },
        basketball: {
          fixtureCount: basketballFreshness.fixtureCount,
          lastUpdated: basketballFreshness.lastUpdatedFormatted,
          newestUpdatedAt: basketballFreshness.newestUpdatedAt,
          ageMinutes: basketballFreshness.ageMinutes,
          isStaleBeyondLimit: basketballFreshness.isStaleBeyondLimit,
        },
      },
      callBudgetSummary: {
        beforeCallsPerDaySingleVisitor: budgetSummary.beforeCallsPerDaySingleVisitor,
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
