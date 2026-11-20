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
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

  // 1. Basketball Sync (NBA) - Disabled until basketball module is built
  if (sportParam === 'all' || sportParam === 'basketball') {
    const attemptIso = new Date().toISOString();
    if (!BASKETBALL_SYNC_ENABLED) {
      await Promise.all([
        upsertProviderSyncState('basketball', {
          sport: 'basketball',
          providerName: 'ESPN NBA Scoreboard + BallDontLie v1',
          status: 'DISABLED',
          lastAttemptAt: attemptIso,
          lastError: null,
          lastResponseBody: 'NBA and basketball syncing disabled until basketball module is built',
          callsUsedLastRun: 0,
        }),
        upsertProviderSyncState('provider:espn_nba', {
          sport: 'basketball',
          providerName: 'ESPN NBA Scoreboard',
          status: 'DISABLED',
          lastAttemptAt: attemptIso,
          lastError: null,
          lastResponseBody: 'Disabled until basketball module is built (0 calls/day)',
          callsUsedLastRun: 0,
        }),
        upsertProviderSyncState('provider:balldontlie', {
          sport: 'basketball',
          providerName: 'BallDontLie v1',
          status: 'DISABLED',
          lastAttemptAt: attemptIso,
          lastError: null,
          lastResponseBody: 'Disabled until basketball module is built (0 calls/day)',
          callsUsedLastRun: 0,
        }),
      ]);

      results['basketball'] = {
        enabled: false,
        provider: 'ESPN NBA / BallDontLie',
        status: 'DISABLED',
        reason: 'NBA and basketball syncing disabled until basketball module is built',
        records: 0,
        callsMade: 0,
      };
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
        error: e.message || 'Football sync failed',
        latencyMs: Date.now() - t0,
      };
    }

    // 3. The Odds API: ONLY for odds, ordered by upcoming pick count descending, AT MOST twice a day
    const oddsApiKey = process.env.ODDS_API_KEY?.trim();
    if (oddsApiKey && mode !== 'live') {
      const attemptIso = new Date().toISOString();
      const runsCompletedToday = await countOddsSyncRunsToday();
      const callsTodayBeforeRun = await getProviderCallCountToday('the-odds-api');
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
      }> = [];
      const oddsSkipped: SkippedLeagueRecord[] = [];
      let oddsCalls = 0;
      let matchesUpdated = 0;
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
          callsToday: callsTodayBeforeRun,
          dailyCap,
          quotaRemaining: lastQuotaRemaining,
          upcomingMatchesWithPicks: upcomingWithPicks.length,
          leaguesOrderedByUpcomingPicks,
          leaguesWithOddsUpdated: [],
          leaguesWithoutOddsCount: oddsSkipped.length,
          leaguesWithoutOdds: oddsSkipped,
        };
      } else {
        const perRunRemainingDaily = Math.max(0, dailyCap - callsTodayBeforeRun);
        const runCap = Math.min(8, perRunRemainingDaily);
        const targetLeagues = orderedOddsLeagues.filter(
          item => (pickFixturesByLeague.get(item.code)?.length || 0) > 0
        );
        let abortedEarlyReason: string | null = null;

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

          if (oddsCalls >= runCap) {
            oddsSkipped.push({
              leagueCode: item.code,
              leagueName: item.name,
              tier: getLeaguePriorityTier(item.code),
              provider: 'the-odds-api',
              reason: `Daily Odds API credit cap reached (${callsTodayBeforeRun + oddsCalls}/${dailyCap} calls/day)`,
            });
            continue;
          }

          oddsCalls++;
          const oddsUrl = `https://api.the-odds-api.com/v4/sports/${item.sportKey}/odds/?apiKey=${oddsApiKey}&regions=eu&markets=h2h`;
          const res = await loggedProviderFetch('the-odds-api', oddsUrl, {
            leagueCode: item.code,
            syncMode: mode,
            timeoutMs: 8000,
          });
          lastStatus = res.status;
          if (Object.keys(res.quotaHeaders).length > 0) lastQuotaHeaders = res.quotaHeaders;
          if (res.quotaRemaining) lastQuotaRemaining = res.quotaRemaining;

          if (res.ok && Array.isArray(res.json)) {
            lastOk = true;
            const updates: Array<{ id: string; providerId: string; verifiedOdds: any }> = [];

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
              let bookmakerName = '';

              for (const bk of matchedEvent.bookmakers) {
                const h2hMarket = Array.isArray(bk.markets) ? bk.markets.find((m: any) => m.key === 'h2h') : null;
                if (!h2hMarket || !Array.isArray(h2hMarket.outcomes)) continue;
                if (!bookmakerName && bk.title) bookmakerName = String(bk.title);

                for (const outcome of h2hMarket.outcomes) {
                  const price = Number(outcome.price);
                  if (!isFinite(price) || price <= 1.01) continue;
                  const outName = String(outcome.name || '');
                  if (outName.toLowerCase() === 'draw') {
                    drawPrices.push(price);
                  } else if (outName === matchedEvent.home_team) {
                    homePrices.push(price);
                  } else if (outName === matchedEvent.away_team) {
                    awayPrices.push(price);
                  }
                }
              }

              const avg = (arr: number[]) =>
                arr.length > 0 ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100 : undefined;

              const homeWin = avg(homePrices);
              const draw = avg(drawPrices);
              const awayWin = avg(awayPrices);

              if (homeWin && awayWin) {
                updates.push({
                  id: fix.id,
                  providerId: fix.providerId,
                  verifiedOdds: {
                    homeWin,
                    draw,
                    awayWin,
                    bookmakerName: bookmakerName || 'EU Bookmaker Consensus',
                  },
                });
              }
            }

            let leagueUpdated = 0;
            if (updates.length > 0) {
              leagueUpdated = await updateFixtureVerifiedOddsInDatabase(updates);
              matchesUpdated += leagueUpdated;
            }

            if (leagueUpdated > 0) {
              leaguesWithOddsUpdated.push({
                leagueCode: item.code,
                leagueName: item.name,
                upcomingMatchesWithPicks: leaguePickFixtures.length,
                matchesUpdated: leagueUpdated,
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
                    : `Queried Odds API (${leaguePickFixtures.length} picks, ${res.json.length} events) but 0 matched fixtures had EU H2H quotes`,
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
          callsUsedLastRun: oddsCalls,
        });

        results['theOddsApi'] = {
          provider: 'the-odds-api.com',
          status: lastOk ? 'ONLINE' : 'ERROR',
          runsToday: oddsCalls > 0 ? runsCompletedToday + 1 : runsCompletedToday,
          maxRunsPerDay: 2,
          leaguesOrderedByUpcomingPicks,
          leaguesWithUpcomingPicks: leaguesOrderedByUpcomingPicks.filter(l => l.upcomingMatchesWithPicks > 0),
          leaguesWithOddsUpdated,
          callsMade: oddsCalls,
          matchesUpdatedWithOdds: matchesUpdated,
          quotaRemaining: lastQuotaRemaining,
          quotaUsedThisMonth: lastQuotaHeaders['x-requests-used'] || null,
          monthlyAllowance: 500,
          leaguesWithoutOddsCount: oddsSkipped.length,
          leaguesWithoutOdds: oddsSkipped,
        };
      }
    }
  }

  // 4. Database check
  if (isSupabaseConfigured && supabase) {
    const t0 = Date.now();
    try {
      const [{ error: fixErr }, { error: syncErr }] = await Promise.all([
        supabase.from('fixtures').select('id').limit(1),
        supabase.from('provider_sync_state').select('id').limit(1),
      ]);
      const dbOk = !fixErr && !syncErr;
      results['database'] = {
        backend: persistence.backend,
        isRemoteSupabase: persistence.isRemoteSupabase,
        isProduction: persistence.isProduction,
        hasSupabaseUrl: persistence.hasSupabaseUrl,
        hasServiceRoleKey: persistence.hasServiceRoleKey,
        localSqliteAllowed: persistence.localSqliteAllowed,
        message: persistence.message,
        status: dbOk ? 'ONLINE' : 'ERROR',
        tables: {
          fixtures: fixErr ? fixErr.message : 'OK',
          provider_sync_state: syncErr ? syncErr.message : 'OK',
        },
        latencyMs: Date.now() - t0,
      };
    } catch (e: any) {
      results['database'] = {
        backend: persistence.backend,
        isRemoteSupabase: persistence.isRemoteSupabase,
        isProduction: persistence.isProduction,
        status: 'ERROR',
        error: e.message,
      };
    }
  }

  return NextResponse.json(
    {
      success: true,
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
