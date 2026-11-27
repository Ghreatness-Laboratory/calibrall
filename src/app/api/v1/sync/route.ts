import { NextResponse } from 'next/server';
import {
  isSupabaseConfigured,
  supabase,
  persistenceBackendInfo,
} from '@/lib/supabase/client';
import { getFootballDataProvider } from '@/lib/data/provider';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { lookupCanonicalTeam } from '@/lib/data/canonicalTeams';
import { updateFixtureVerifiedOddsInDatabase } from '@/lib/data/fixturesDatabase';
import { serverCache } from '@/lib/cache/serverCache';
import {
  SyncMode,
  PROVIDER_BUDGETS,
  TIER_2_LEAGUES,
  TIER_3_LEAGUES,
  SkippedLeagueRecord,
  BASKETBALL_SYNC_ENABLED,
  getLeaguePriorityTier,
} from '@/lib/data/providerBudget';
import {
  loggedProviderFetch,
  upsertProviderSyncState,
  getProviderCallCountToday,
  getRecentProviderCalls,
  getProviderSyncState,
} from '@/lib/data/providerCallLogger';
import { syncBasketballLivePipeline } from '@/lib/basketball/liveSync';
import { ensureDailyRecordSlips, settleDailyRecordSlips } from '@/lib/slips/dailySlipRecord';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const ODDS_API_LEAGUES: Array<{ code: string; name: string; sportKey: string }> = [
  { code: 'PL', name: 'Premier League', sportKey: 'soccer_epl' },
  { code: 'CL', name: 'UEFA Champions League', sportKey: 'soccer_uefa_champs_league' },
  { code: 'PD', name: 'La Liga', sportKey: 'soccer_spain_la_liga' },
  { code: 'BL1', name: 'Bundesliga', sportKey: 'soccer_germany_bundesliga' },
  { code: 'SA', name: 'Serie A', sportKey: 'soccer_italy_serie_a' },
  { code: 'FL1', name: 'Ligue 1', sportKey: 'soccer_france_ligue_one' },
  { code: 'ELC', name: 'Championship', sportKey: 'soccer_efl_champ' },
  { code: 'BSA', name: 'Campeonato Brasileiro Série A', sportKey: 'soccer_brazil_campeonato' },
  { code: 'DED', name: 'Eredivisie', sportKey: 'soccer_netherlands_eredivisie' },
  { code: 'PPL', name: 'Primeira Liga', sportKey: 'soccer_portugal_primeira_liga' },
  { code: 'SC0', name: 'Scottish Premiership', sportKey: 'soccer_spl' },
  { code: 'DNK', name: 'Danish Superliga', sportKey: 'soccer_denmark_superliga' },
];

function constantTimeMatch(provided: string, expected: string): boolean {
  const bufProvided = Buffer.from(provided, 'utf8');
  const bufExpected = Buffer.from(expected, 'utf8');
  if (bufProvided.length !== bufExpected.length) {
    crypto.timingSafeEqual(bufExpected, bufExpected);
    return false;
  }
  return crypto.timingSafeEqual(bufProvided, bufExpected);
}

function normalizeTeamToken(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|afc|cf|sc|ac|as|us|rc|sv|vfb|tsg|bv|1\.|fk|bk|if)\b/g, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function oddsTeamMatchesFixture(apiTeamName: string, fixtureTeamId: string, fixtureTeamName: string, leagueCode: string): boolean {
  const canon = lookupCanonicalTeam(apiTeamName, leagueCode);
  if (canon && canon.canonicalId === fixtureTeamId) {
    return true;
  }
  const a = normalizeTeamToken(apiTeamName);
  const b = normalizeTeamToken(fixtureTeamName);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const wordsA = a.split(' ').filter(w => w.length >= 4);
  const wordsB = new Set(b.split(' ').filter(w => w.length >= 4));
  return wordsA.some(w => wordsB.has(w));
}

async function countOddsSyncRunsToday(): Promise<number> {
  const todayPrefix = new Date().toISOString().slice(0, 10);
  const recent = await getRecentProviderCalls(100);
  const oddsSyncTimestamps = recent
    .filter(
      l =>
        l.provider === 'the-odds-api' &&
        l.timestamp.startsWith(todayPrefix) &&
        l.syncMode !== 'health_probe'
    )
    .map(l => new Date(l.timestamp).getTime())
    .filter(ms => !isNaN(ms))
    .sort((a, b) => a - b);

  if (oddsSyncTimestamps.length === 0) return 0;

  // Cluster API calls within 3 minutes into a single scheduled sync run
  let runs = 1;
  for (let i = 1; i < oddsSyncTimestamps.length; i++) {
    if (oddsSyncTimestamps[i] - oddsSyncTimestamps[i - 1] > 180_000) {
      runs++;
    }
  }
  return runs;
}

async function handleSync(request: Request) {
  // 0a. Fail-closed secret protection: requires CRON_SECRET or ADMIN_SECRET via headers only
  const allowedSecrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.ADMIN_SECRET?.trim(),
  ].filter((s): s is string => Boolean(s));

  if (allowedSecrets.length === 0) {
    return NextResponse.json(
      {
        error: 'Service Unavailable: CRON_SECRET or ADMIN_SECRET must be configured before invoking /api/v1/sync.',
      },
      { status: 503 }
    );
  }

  const secretHeader =
    request.headers.get('x-sync-secret')?.trim() ||
    request.headers.get('x-admin-secret')?.trim() ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    '';

  if (!secretHeader) {
    return NextResponse.json(
      {
        error: 'Unauthorized: Missing sync secret (send Authorization: Bearer <CRON_SECRET>, x-sync-secret, or x-admin-secret).',
      },
      { status: 401 }
    );
  }

  const authorized = allowedSecrets.some(expected => constantTimeMatch(secretHeader, expected));
  if (!authorized) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid sync secret.' },
      { status: 401 }
    );
  }

  // 0b. Production persistence check: refuse local SQLite fallback in production
  const persistence = persistenceBackendInfo();
  if (persistence.backend === 'misconfigured') {
    return NextResponse.json(
      {
        error: persistence.message,
        persistence,
      },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const sportParam = url.searchParams.get('sport')?.toLowerCase() || 'all';
  const rawMode = url.searchParams.get('mode')?.toLowerCase();
  const mode: SyncMode =
    rawMode === 'live' || rawMode === 'schedule' || rawMode === 'full'
      ? rawMode
      : 'full';
  const maxCallsParam = url.searchParams.get('maxCalls');
  const maxCalls = maxCallsParam && !isNaN(Number(maxCallsParam)) ? Math.max(1, Number(maxCallsParam)) : undefined;

  const results: Record<string, any> = {};

  // 1. Basketball Sync (NBA, NCAAB D1, EuroLeague + credit-safe Odds + Pre-tipoff picks & Settlement)
  if (sportParam === 'all' || sportParam === 'basketball') {
    const attemptIso = new Date().toISOString();
    if (!BASKETBALL_SYNC_ENABLED) {
      await Promise.all([
        upsertProviderSyncState('basketball', {
          sport: 'basketball',
          providerName: 'ESPN NBA/NCAAB + EuroLeague v2',
          status: 'DISABLED',
          lastAttemptAt: attemptIso,
          lastError: null,
          lastResponseBody: 'Basketball syncing disabled',
          callsUsedLastRun: 0,
        }),
      ]);

      results['basketball'] = {
        enabled: false,
        provider: 'ESPN NBA/NCAAB + EuroLeague v2',
        status: 'DISABLED',
        reason: 'Basketball syncing disabled',
        records: 0,
        callsMade: 0,
      };
    } else {
      try {
        const bbSync = await syncBasketballLivePipeline(mode);
        results['basketball'] = {
          enabled: bbSync.enabled,
          provider: 'ESPN NBA/NCAAB + EuroLeague v2',
          mode: bbSync.mode,
          status: bbSync.status,
          records: bbSync.totalGamesUpserted,
          nbaGamesUpserted: bbSync.nbaGamesUpserted,
          ncaabGamesUpserted: bbSync.ncaabGamesUpserted,
          euroleagueGamesUpserted: bbSync.euroleagueGamesUpserted,
          unresolvedTeamsCount: bbSync.unresolvedTeamsCount,
          callsMade: bbSync.callsMade,
          odds: bbSync.oddsResult,
          picksRecorded: bbSync.picksRecorded,
          picksSkippedExisting: bbSync.picksSkippedExisting,
          settlement: bbSync.settlementResult,
          latencyMs: bbSync.latencyMs,
          ...(bbSync.error ? { error: bbSync.error } : {}),
        };
      } catch (e: any) {
        results['basketball'] = {
          enabled: true,
          provider: 'ESPN NBA/NCAAB + EuroLeague v2',
          mode,
          status: 'ERROR',
          records: 0,
          callsMade: 0,
          error: e?.message || 'Basketball sync failed',
        };
      }
    }
  }

  // 2. Football Fixture Sync (Football-Data.org -> Sportmonks into Supabase Postgres / dev SQLite)
  if (sportParam === 'all' || sportParam === 'football') {
    const t0 = Date.now();
    const footballProvider = getFootballDataProvider();
    try {
      const syncOut = await footballProvider.ensureSynced({
        force: true,
        mode,
        maxCalls,
      });
      results['football'] = {
        provider: syncOut.providerUsed,
        mode: syncOut.mode,
        status: syncOut.ok ? 'ONLINE' : 'ERROR',
        records: syncOut.count,
        rowsWrittenToFixtures: syncOut.rowsWrittenToFixtures,
        rejectedFixtures: syncOut.rejectedFixtures,
        callsMade: syncOut.callsMade,
        skippedLeaguesCount: syncOut.skippedLeagues.length,
        skippedLeagues: syncOut.skippedLeagues,
        latencyMs: Date.now() - t0,
      };
    } catch (e: any) {
      results['football'] = {
        provider: 'Football Providers',
        mode,
        status: 'ERROR',
        records: 0,
        rowsWrittenToFixtures: 0,
        error: e.message || 'Football sync failed',
        latencyMs: Date.now() - t0,
      };
    }

    // 3. The Odds API: ONLY for odds, ordered by upcoming pick count descending, AT MOST twice a day
    // Requests h2h + totals (2 credits per league per fetch: 4 biggest active leagues x 2 runs/day <= 16/day cap).
    const oddsApiKey = process.env.ODDS_API_KEY?.trim();
    if (oddsApiKey && mode !== 'live') {
      const attemptIso = new Date().toISOString();
      const runsCompletedToday = await countOddsSyncRunsToday();
      const recentLogsToday = (await getRecentProviderCalls(200)).filter(
        l =>
          l.provider === 'the-odds-api' &&
          l.timestamp.startsWith(attemptIso.slice(0, 10)) &&
          l.syncMode !== 'health_probe' &&
          !String(l.leagueCode || '').startsWith('BB_')
      );
      let creditsUsedTodayBeforeRun = 0;
      for (const l of recentLogsToday) {
        const lastCost = Number(l.quotaHeaders?.['x-requests-last']);
        creditsUsedTodayBeforeRun += Number.isFinite(lastCost) && lastCost > 0 ? lastCost : 2;
      }
      const dailyCap = PROVIDER_BUDGETS['the-odds-api'].dailyQuotaLimit ?? 16;
      const existingOddsState = await getProviderSyncState('provider:the-odds-api');

      // Evaluate stored upcoming DB fixtures and find ONLY those that generate qualified picks
      const dbFixturesRes = await footballProvider.getLiveFixtures({ status: 'ALL' });
      const nowMs = Date.now();
      const upcomingWithPicks = dbFixturesRes.fixtures.filter(f => {
        if (f.status !== 'TIMED' && f.status !== 'SCHEDULED') return false;
        const kickoffMs = new Date(f.kickoffTime).getTime();
        if (isNaN(kickoffMs) || kickoffMs <= nowMs) return false;
        const stats = f.serverStats || getFixtureStatistics(f);
        if (f.insufficientData || stats.insufficientData) return false;
        const evalResult = evaluateFixtureMarkets(buildFixtureContextFromStats(f, stats));
        return evalResult.predictions.length > 0 && evalResult.topPick !== null;
      });

      const pickFixturesByLeague = new Map<string, typeof upcomingWithPicks>();
      for (const f of upcomingWithPicks) {
        const code = f.competition.code.toUpperCase();
        const list = pickFixturesByLeague.get(code) || [];
        list.push(f);
        pickFixturesByLeague.set(code, list);
      }

      // Order Odds API leagues strictly by upcoming picks count DESC, then priority tier ASC
      const orderedOddsLeagues = [...ODDS_API_LEAGUES].sort((a, b) => {
        const countA = pickFixturesByLeague.get(a.code)?.length || 0;
        const countB = pickFixturesByLeague.get(b.code)?.length || 0;
        if (countB !== countA) return countB - countA;
        return getLeaguePriorityTier(a.code) - getLeaguePriorityTier(b.code);
      });

      const leaguesOrderedByUpcomingPicks = orderedOddsLeagues.map(item => ({
        code: item.code,
        name: item.name,
        sportKey: item.sportKey,
        upcomingMatchesWithPicks: pickFixturesByLeague.get(item.code)?.length || 0,
      }));

      const leaguesWithOddsUpdated: Array<{
        leagueCode: string;
        leagueName: string;
        upcomingMatchesWithPicks: number;
        matchesUpdated: number;
        creditsSpent: number;
      }> = [];
      const oddsSkipped: SkippedLeagueRecord[] = [];
      let oddsCalls = 0;
      let creditsSpentThisRun = 0;
      let matchesUpdated = 0;
      let snapshotsUpserted = 0;
      let lastOk = false;
      let lastStatus: number | null = null;
      let lastErr: string | null = null;
      let lastBody: string | null = null;
      let lastQuotaHeaders: Record<string, string> = existingOddsState?.quotaHeaders || {};
      let lastQuotaRemaining: string | null = existingOddsState?.quotaRemaining || null;

      const appendExcludedTiers = () => {
        for (const code of [...TIER_2_LEAGUES, ...TIER_3_LEAGUES]) {
          if (ODDS_API_LEAGUES.some(o => o.code === code)) continue;
          oddsSkipped.push({
            leagueCode: code,
            leagueName: code,
            tier: getLeaguePriorityTier(code),
            provider: 'the-odds-api',
            reason: 'Excluded from 500 credits/month free Odds API allowance',
          });
        }
      };

      if (runsCompletedToday >= 2) {
        for (const item of orderedOddsLeagues) {
          oddsSkipped.push({
            leagueCode: item.code,
            leagueName: item.name,
            tier: getLeaguePriorityTier(item.code),
            provider: 'the-odds-api',
            reason: 'Skipped: twice-daily Odds API run cap reached (2/2 today)',
          });
        }
        appendExcludedTiers();

        await upsertProviderSyncState('provider:the-odds-api', {
          sport: 'odds',
          providerName: 'The Odds API v4',
          status: existingOddsState?.status || 'ONLINE',
          lastAttemptAt: attemptIso,
          quotaRemaining: lastQuotaRemaining,
          quotaHeaders: lastQuotaHeaders,
          skippedLeagues: oddsSkipped,
          callsUsedLastRun: 0,
        });

        results['theOddsApi'] = {
          provider: 'the-odds-api.com',
          status: 'SKIPPED_TWICE_DAILY_CAP',
          runsCompletedToday,
          maxRunsPerDay: 2,
          callsMade: 0,
          creditsSpentThisRun: 0,
          creditsToday: creditsUsedTodayBeforeRun,
          dailyCap,
          marketsRequested: ['h2h', 'totals'],
          creditsPerLeagueFetch: 2,
          quotaRemaining: lastQuotaRemaining,
          upcomingMatchesWithPicks: upcomingWithPicks.length,
          leaguesOrderedByUpcomingPicks,
          leaguesWithOddsUpdated: [],
          leaguesWithoutOddsCount: oddsSkipped.length,
          leaguesWithoutOdds: oddsSkipped,
        };
      } else {
        const CREDITS_PER_LEAGUE = 2; // h2h (1) + totals (1) in regions=eu
        const perRunRemainingDaily = Math.max(0, dailyCap - creditsUsedTodayBeforeRun);
        const runCreditCap = Math.min(8, perRunRemainingDaily); // Up to 4 leagues x 2 markets per run = 8 credits/run (<= 16/day)
        const targetLeagues = orderedOddsLeagues.filter(
          item => (pickFixturesByLeague.get(item.code)?.length || 0) > 0
        );
        let abortedEarlyReason: string | null = null;
        const { matchesStore } = await import('@/lib/data/matchesStore');

        for (let idx = 0; idx < orderedOddsLeagues.length; idx++) {
          const item = orderedOddsLeagues[idx];
          const leaguePickFixtures = pickFixturesByLeague.get(item.code) || [];

          if (leaguePickFixtures.length === 0) {
            oddsSkipped.push({
              leagueCode: item.code,
              leagueName: item.name,
              tier: getLeaguePriorityTier(item.code),
              provider: 'the-odds-api',
              reason: 'No upcoming matches with qualified picks (0 credits spent)',
            });
            continue;
          }

          if (abortedEarlyReason) {
            oddsSkipped.push({
              leagueCode: item.code,
              leagueName: item.name,
              tier: getLeaguePriorityTier(item.code),
              provider: 'the-odds-api',
              reason: abortedEarlyReason,
            });
            continue;
          }

          if (creditsSpentThisRun + CREDITS_PER_LEAGUE > runCreditCap) {
            oddsSkipped.push({
              leagueCode: item.code,
              leagueName: item.name,
              tier: getLeaguePriorityTier(item.code),
              provider: 'the-odds-api',
              reason: `Daily Odds API credit cap reached (${creditsUsedTodayBeforeRun + creditsSpentThisRun}/${dailyCap} credits/day)`,
            });
            continue;
          }

          oddsCalls++;
          const oddsUrl = `https://api.the-odds-api.com/v4/sports/${item.sportKey}/odds/?apiKey=${oddsApiKey}&regions=eu&markets=h2h,totals&oddsFormat=decimal`;
          const res = await loggedProviderFetch('the-odds-api', oddsUrl, {
            leagueCode: item.code,
            syncMode: mode,
            timeoutMs: 8000,
          });
          const headerCost = Number(res.quotaHeaders['x-requests-last']);
          const callCost = Number.isFinite(headerCost) && headerCost > 0 ? headerCost : CREDITS_PER_LEAGUE;
          creditsSpentThisRun += callCost;
          lastStatus = res.status;
          if (Object.keys(res.quotaHeaders).length > 0) lastQuotaHeaders = res.quotaHeaders;
          if (res.quotaRemaining) lastQuotaRemaining = res.quotaRemaining;

          if (res.ok && Array.isArray(res.json)) {
            lastOk = true;
            const updates: Array<{ id: string; providerId: string; verifiedOdds: any }> = [];
            const rawSnapshots: Array<{
              match_id: string;
              bookmaker: string;
              market_code: string;
              selection: string;
              decimal_odds: number;
              observed_at: string;
              snapshot_type: 'live_pre_kickoff';
              source: string;
            }> = [];

            for (const fix of leaguePickFixtures) {
              const matchedEvent = res.json.find((ev: any) =>
                oddsTeamMatchesFixture(String(ev.home_team || ''), fix.homeTeam.id, fix.homeTeam.name, item.code) &&
                oddsTeamMatchesFixture(String(ev.away_team || ''), fix.awayTeam.id, fix.awayTeam.name, item.code)
              );
              if (!matchedEvent || !Array.isArray(matchedEvent.bookmakers) || matchedEvent.bookmakers.length === 0) {
                continue;
              }

              const homePrices: number[] = [];
              const drawPrices: number[] = [];
              const awayPrices: number[] = [];
              const over15Prices: number[] = [];
              const under15Prices: number[] = [];
              const over25Prices: number[] = [];
              const under25Prices: number[] = [];
              const over35Prices: number[] = [];
              const under35Prices: number[] = [];
              let bookmakerName = '';
              let newestObservedAt = attemptIso;

              for (const bk of matchedEvent.bookmakers) {
                const bkTitle = String(bk.title || bk.key || '').trim() || 'Bookmaker';
                if (!bookmakerName) bookmakerName = bkTitle;
                const observedAt =
                  typeof bk.last_update === 'string' && bk.last_update ? bk.last_update : attemptIso;
                if (observedAt > newestObservedAt) newestObservedAt = observedAt;

                const h2hMarket = Array.isArray(bk.markets) ? bk.markets.find((m: any) => m.key === 'h2h') : null;
                if (h2hMarket && Array.isArray(h2hMarket.outcomes)) {
                  for (const outcome of h2hMarket.outcomes) {
                    const price = Number(outcome.price);
                    if (!isFinite(price) || price <= 1.01) continue;
                    const outName = String(outcome.name || '');
                    if (outName.toLowerCase() === 'draw') {
                      drawPrices.push(price);
                      rawSnapshots.push({
                        match_id: fix.id,
                        bookmaker: bkTitle,
                        market_code: '1X2_DRAW',
                        selection: 'Draw',
                        decimal_odds: price,
                        observed_at: observedAt,
                        snapshot_type: 'live_pre_kickoff',
                        source: 'the-odds-api',
                      });
                    } else if (outName === matchedEvent.home_team) {
                      homePrices.push(price);
                      rawSnapshots.push({
                        match_id: fix.id,
                        bookmaker: bkTitle,
                        market_code: '1X2_HOME',
                        selection: `${fix.homeTeam.name} win`,
                        decimal_odds: price,
                        observed_at: observedAt,
                        snapshot_type: 'live_pre_kickoff',
                        source: 'the-odds-api',
                      });
                    } else if (outName === matchedEvent.away_team) {
                      awayPrices.push(price);
                      rawSnapshots.push({
                        match_id: fix.id,
                        bookmaker: bkTitle,
                        market_code: '1X2_AWAY',
                        selection: `${fix.awayTeam.name} win`,
                        decimal_odds: price,
                        observed_at: observedAt,
                        snapshot_type: 'live_pre_kickoff',
                        source: 'the-odds-api',
                      });
                    }
                  }
                }

                const totalsMarket = Array.isArray(bk.markets)
                  ? bk.markets.find((m: any) => m.key === 'totals')
                  : null;
                if (totalsMarket && Array.isArray(totalsMarket.outcomes)) {
                  for (const outcome of totalsMarket.outcomes) {
                    const price = Number(outcome.price);
                    const point = Number(outcome.point);
                    const outLabel = String(outcome.name || '').toLowerCase();
                    if (!isFinite(price) || price <= 1.01 || !isFinite(point)) continue;
                    const roundedPoint = Math.round(point * 10) / 10;
                    if (roundedPoint === 1.5) {
                      if (outLabel === 'over') {
                        over15Prices.push(price);
                        rawSnapshots.push({
                          match_id: fix.id,
                          bookmaker: bkTitle,
                          market_code: 'TOTAL_GOALS_O15',
                          selection: 'Over 1.5 Goals',
                          decimal_odds: price,
                          observed_at: observedAt,
                          snapshot_type: 'live_pre_kickoff',
                          source: 'the-odds-api',
                        });
                      } else if (outLabel === 'under') {
                        under15Prices.push(price);
                        rawSnapshots.push({
                          match_id: fix.id,
                          bookmaker: bkTitle,
                          market_code: 'TOTAL_GOALS_U15',
                          selection: 'Under 1.5 Goals',
                          decimal_odds: price,
                          observed_at: observedAt,
                          snapshot_type: 'live_pre_kickoff',
                          source: 'the-odds-api',
                        });
                      }
                    } else if (roundedPoint === 2.5) {
                      if (outLabel === 'over') {
                        over25Prices.push(price);
                        rawSnapshots.push({
                          match_id: fix.id,
                          bookmaker: bkTitle,
                          market_code: 'TOTAL_GOALS_O25',
                          selection: 'Over 2.5 Goals',
                          decimal_odds: price,
                          observed_at: observedAt,
                          snapshot_type: 'live_pre_kickoff',
                          source: 'the-odds-api',
                        });
                      } else if (outLabel === 'under') {
                        under25Prices.push(price);
                        rawSnapshots.push({
                          match_id: fix.id,
                          bookmaker: bkTitle,
                          market_code: 'TOTAL_GOALS_U25',
                          selection: 'Under 2.5 Goals',
                          decimal_odds: price,
                          observed_at: observedAt,
                          snapshot_type: 'live_pre_kickoff',
                          source: 'the-odds-api',
                        });
                      }
                    } else if (roundedPoint === 3.5) {
                      if (outLabel === 'over') {
                        over35Prices.push(price);
                        rawSnapshots.push({
                          match_id: fix.id,
                          bookmaker: bkTitle,
                          market_code: 'TOTAL_GOALS_O35',
                          selection: 'Over 3.5 Goals',
                          decimal_odds: price,
                          observed_at: observedAt,
                          snapshot_type: 'live_pre_kickoff',
                          source: 'the-odds-api',
                        });
                      } else if (outLabel === 'under') {
                        under35Prices.push(price);
                        rawSnapshots.push({
                          match_id: fix.id,
                          bookmaker: bkTitle,
                          market_code: 'TOTAL_GOALS_U35',
                          selection: 'Under 3.5 Goals',
                          decimal_odds: price,
                          observed_at: observedAt,
                          snapshot_type: 'live_pre_kickoff',
                          source: 'the-odds-api',
                        });
                      }
                    }
                  }
                }
              }

              const avg = (arr: number[]) =>
                arr.length > 0 ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100 : undefined;

              const homeWin = avg(homePrices);
              const draw = avg(drawPrices);
              const awayWin = avg(awayPrices);
              const over15Goals = avg(over15Prices);
              const under15Goals = avg(under15Prices);
              const over25Goals = avg(over25Prices);
              const under25Goals = avg(under25Prices);
              const over35Goals = avg(over35Prices);
              const under35Goals = avg(under35Prices);

              if (homeWin || awayWin || over25Goals || over15Goals) {
                updates.push({
                  id: fix.id,
                  providerId: fix.providerId,
                  verifiedOdds: {
                    homeWin,
                    draw,
                    awayWin,
                    over15Goals,
                    under15Goals,
                    over25Goals,
                    under25Goals,
                    over35Goals,
                    under35Goals,
                    bookmakerName: bookmakerName || 'EU Bookmaker Consensus',
                    observedAt: newestObservedAt,
                  },
                });
              }
            }

            let leagueUpdated = 0;
            if (updates.length > 0) {
              leagueUpdated = await updateFixtureVerifiedOddsInDatabase(updates);
              matchesUpdated += leagueUpdated;
            }
            if (rawSnapshots.length > 0) {
              snapshotsUpserted += await matchesStore.upsertLiveOddsSnapshots(rawSnapshots);
            }

            if (leagueUpdated > 0) {
              leaguesWithOddsUpdated.push({
                leagueCode: item.code,
                leagueName: item.name,
                upcomingMatchesWithPicks: leaguePickFixtures.length,
                matchesUpdated: leagueUpdated,
                creditsSpent: callCost,
              });
            } else {
              oddsSkipped.push({
                leagueCode: item.code,
                leagueName: item.name,
                tier: getLeaguePriorityTier(item.code),
                provider: 'the-odds-api',
                reason:
                  res.json.length === 0
                    ? `Queried Odds API (${leaguePickFixtures.length} picks) but 0 active events returned`
                    : `Queried Odds API (${leaguePickFixtures.length} picks, ${res.json.length} events) but 0 matched fixtures had EU h2h/totals quotes`,
              });
            }
          } else {
            lastErr = res.error || `HTTP ${res.status}`;
            lastBody = res.bodyText.slice(0, 400);
            oddsSkipped.push({
              leagueCode: item.code,
              leagueName: item.name,
              tier: getLeaguePriorityTier(item.code),
              provider: 'the-odds-api',
              reason: `Odds API error (${lastErr})`,
            });
            const rem = res.quotaRemaining ? parseInt(res.quotaRemaining, 10) : NaN;
            if (res.status === 401 || res.status === 429 || (!isNaN(rem) && rem <= 10)) {
              abortedEarlyReason = `Stopped early after ${item.code} (${lastErr})`;
            }
          }
        }

        appendExcludedTiers();

        if (targetLeagues.length === 0) {
          lastOk = true;
          lastStatus = 200;
        }

        await upsertProviderSyncState('provider:the-odds-api', {
          sport: 'odds',
          providerName: 'The Odds API v4',
          status: lastOk ? 'ONLINE' : 'ERROR',
          lastAttemptAt: attemptIso,
          ...(lastOk
            ? { lastSuccessAt: attemptIso, lastError: null, lastHttpStatus: lastStatus ?? 200, lastResponseBody: null }
            : { lastError: lastErr, lastHttpStatus: lastStatus, lastResponseBody: lastBody }),
          quotaRemaining: lastQuotaRemaining,
          quotaHeaders: lastQuotaHeaders,
          skippedLeagues: oddsSkipped,
          callsUsedLastRun: creditsSpentThisRun,
        });

        if (matchesUpdated > 0) {
          await serverCache.bust('live_fixtures:');
        }

        results['theOddsApi'] = {
          provider: 'the-odds-api.com',
          status: lastOk ? 'ONLINE' : 'ERROR',
          runsToday: oddsCalls > 0 ? runsCompletedToday + 1 : runsCompletedToday,
          maxRunsPerDay: 2,
          marketsRequested: ['h2h', 'totals'],
          creditsPerLeagueFetch: 2,
          leaguesOrderedByUpcomingPicks,
          leaguesWithUpcomingPicks: leaguesOrderedByUpcomingPicks.filter(l => l.upcomingMatchesWithPicks > 0),
          leaguesWithOddsUpdated,
          callsMade: oddsCalls,
          creditsSpentThisRun,
          creditsToday: creditsUsedTodayBeforeRun + creditsSpentThisRun,
          dailyCap,
          matchesUpdatedWithOdds: matchesUpdated,
          snapshotsUpserted,
          quotaRemaining: lastQuotaRemaining,
          quotaUsedThisMonth: lastQuotaHeaders['x-requests-used'] || null,
          monthlyAllowance: 500,
          leaguesWithoutOddsCount: oddsSkipped.length,
          leaguesWithoutOdds: oddsSkipped,
        };
      }
    }
  }

  // 3b. Daily Public Slip Accountability Record (generate pre-kickoff snapshot + settle finished legs)
  try {
    const settledDaily = await settleDailyRecordSlips();
    const ensuredDaily = await ensureDailyRecordSlips();
    results['dailySlips'] = {
      status: 'OK',
      ...settledDaily,
      ...ensuredDaily,
    };
  } catch (err: any) {
    results['dailySlips'] = {
      status: 'WARN',
      error: err?.message || 'Daily slip record check failed',
    };
  }

  // 4. Database check & exact fixtures row count
  let dbHealthy = false;
  if (isSupabaseConfigured && supabase) {
    const t0 = Date.now();
    try {
      const [
        { count: fixturesTotalCount, error: fixErr },
        { count: syncStateCount, error: syncErr },
        { count: bbGamesTotalCount },
      ] = await Promise.all([
        supabase.from('fixtures').select('id', { count: 'exact', head: true }),
        supabase.from('provider_sync_state').select('id', { count: 'exact', head: true }),
        supabase.from('bb_games').select('id', { count: 'exact', head: true }),
      ]);
      const dbOk = !fixErr && !syncErr;
      dbHealthy = dbOk;
      results['database'] = {
        target:
          persistence.backend === 'supabase_postgres'
            ? 'Supabase Postgres'
            : persistence.backend === 'local_sqlite'
            ? 'Local SQLite (data/supabase.db)'
            : 'MISCONFIGURED (Production refuses local SQLite)',
        backend: persistence.backend,
        isRemoteSupabase: persistence.isRemoteSupabase,
        isProduction: persistence.isProduction,
        hasSupabaseUrl: persistence.hasSupabaseUrl,
        hasServiceRoleKey: persistence.hasServiceRoleKey,
        localSqliteAllowed: persistence.localSqliteAllowed,
        message: persistence.message,
        status: dbOk ? 'ONLINE' : 'ERROR',
        fixturesTotalCount: typeof fixturesTotalCount === 'number' ? fixturesTotalCount : null,
        bbGamesTotalCount: typeof bbGamesTotalCount === 'number' ? bbGamesTotalCount : null,
        syncStateTotalCount: typeof syncStateCount === 'number' ? syncStateCount : null,
        tables: {
          fixtures: fixErr ? fixErr.message : 'OK',
          bb_games: typeof bbGamesTotalCount === 'number' ? 'OK' : 'PENDING_MIGRATION',
          provider_sync_state: syncErr ? syncErr.message : 'OK',
        },
        latencyMs: Date.now() - t0,
      };
    } catch (e: any) {
      results['database'] = {
        target: persistence.backend === 'supabase_postgres' ? 'Supabase Postgres' : 'MISCONFIGURED',
        backend: persistence.backend,
        isRemoteSupabase: persistence.isRemoteSupabase,
        isProduction: persistence.isProduction,
        status: 'ERROR',
        error: e.message,
      };
    }
  }

  const hasFatalError =
    results['football']?.status === 'ERROR' ||
    (sportParam === 'basketball' && results['basketball']?.status === 'ERROR') ||
    !dbHealthy;

  return NextResponse.json(
    {
      success: !hasFatalError,
      mode,
      sport: sportParam,
      timestamp: new Date().toISOString(),
      protection: {
        requiresSecret: true,
        acceptedEnvVars: ['CRON_SECRET', 'ADMIN_SECRET'],
        acceptedHeaders: ['Authorization: Bearer <secret>', 'x-sync-secret', 'x-admin-secret'],
        queryParamsRejected: true,
        timingSafe: true,
        failClosedStatusCodes: { unconfigured: 503, missingOrInvalid: 401 },
      },
      persistence,
      results,
    },
    {
      status: hasFatalError ? 500 : 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}

export async function POST(req: Request) {
  return handleSync(req);
}

export async function GET(req: Request) {
  return handleSync(req);
}
