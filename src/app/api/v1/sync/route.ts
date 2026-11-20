import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { getFootballDataProvider } from '@/lib/data/provider';
import { getNBADataProvider } from '@/lib/data/nbaProvider';
import { computeNBADateWindow } from '@/lib/utils/dateWindow';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { lookupCanonicalTeam } from '@/lib/data/canonicalTeams';
import { updateFixtureVerifiedOddsInDatabase } from '@/lib/data/fixturesDatabase';
import {
  SyncMode,
  PROVIDER_BUDGETS,
  TIER_1_LEAGUES,
  TIER_2_LEAGUES,
  TIER_3_LEAGUES,
  SkippedLeagueRecord,
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
  const url = new URL(request.url);
  const sportParam = url.searchParams.get('sport')?.toLowerCase() || 'all';
  const rawMode = url.searchParams.get('mode')?.toLowerCase();
  const mode: SyncMode =
    rawMode === 'live' || rawMode === 'schedule' || rawMode === 'full'
      ? rawMode
      : 'full';
  const maxCallsParam = url.searchParams.get('maxCalls');
  const maxCalls = maxCallsParam && !isNaN(Number(maxCallsParam)) ? Math.max(1, Number(maxCallsParam)) : undefined;

  // Secret protection: check x-sync-secret or Authorization Bearer header (no query string)
  const secretHeader =
    request.headers.get('x-sync-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const configuredSecret = process.env.CRON_SECRET?.trim();

  if (configuredSecret) {
    if (!secretHeader) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing sync secret.' },
        { status: 401 }
      );
    }
    const bufProvided = Buffer.from(secretHeader, 'utf8');
    const bufConfigured = Buffer.from(configuredSecret, 'utf8');
    if (bufProvided.length !== bufConfigured.length || !crypto.timingSafeEqual(bufProvided, bufConfigured)) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid sync secret.' },
        { status: 401 }
      );
    }
  }

  const results: Record<string, any> = {};

  // 1. Basketball Sync (NBA) - Scheduled server ingestion
  if (sportParam === 'all' || sportParam === 'basketball') {
    const t0 = Date.now();
    try {
      const nbaProvider = getNBADataProvider();
      const count = await nbaProvider.syncLiveFixtures(true, mode);
      const health = nbaProvider.getFixturesHealth();
      const windowInfo = computeNBADateWindow(1, 14);

      results['basketball'] = {
        provider: health.provider,
        mode,
        status: health.providerStatus,
        season: health.season,
        records: count,
        newestKickoff: health.newestKickoff,
        window: {
          dateFrom: windowInfo.dateFrom,
          dateTo: windowInfo.dateTo,
          daysIncluded: windowInfo.datesList.length,
        },
        latencyMs: Date.now() - t0,
        lastSync: health.lastSyncTime,
      };
    } catch (e: any) {
      results['basketball'] = {
        provider: 'ESPN NBA Live Scoreboard',
        mode,
        status: 'ERROR',
        error: e.message || 'Sync failed',
        latencyMs: Date.now() - t0,
      };
    }

    // BallDontLie stats check (schedule/full only, 2 calls/day budget)
    const ballDontLieKey = process.env.BALLDONTLIE_API_KEY?.trim() || process.env.BALL_DONT_LIE_API_KEY?.trim();
    if (ballDontLieKey && mode !== 'live') {
      const attemptIso = new Date().toISOString();
      const res = await loggedProviderFetch('balldontlie', 'https://api.balldontlie.io/v1/teams', {
        headers: { Authorization: ballDontLieKey },
        syncMode: mode,
        timeoutMs: 8000,
      });
      await upsertProviderSyncState('provider:balldontlie', {
        sport: 'basketball',
        providerName: 'BallDontLie v1',
        status: res.ok ? 'ONLINE' : 'ERROR',
        lastAttemptAt: attemptIso,
        ...(res.ok ? { lastSuccessAt: attemptIso, lastError: null, lastHttpStatus: res.status, lastResponseBody: null } : { lastError: res.error, lastHttpStatus: res.status, lastResponseBody: res.bodyText.slice(0, 400) }),
        quotaRemaining: res.quotaRemaining,
        quotaHeaders: res.quotaHeaders,
        callsUsedLastRun: 1,
      });
      results['balldontlie'] = {
        status: res.ok ? 'ONLINE' : 'ERROR',
        httpStatus: res.status,
        latencyMs: res.latencyMs,
      };
    }
  }

  // 2. Football Fixture Sync (Football-Data.org -> Sportmonks into Supabase/SQLite)
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

    // 3. The Odds API: ONLY for odds, ONLY for upcoming matches that have picks, AT MOST twice a day
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

      const oddsSkipped: SkippedLeagueRecord[] = [];
      let oddsCalls = 0;
      let matchesUpdated = 0;
      let lastOk = false;
      let lastStatus: number | null = null;
      let lastErr: string | null = null;
      let lastBody: string | null = null;
      let lastQuotaHeaders: Record<string, string> = existingOddsState?.quotaHeaders || {};
      let lastQuotaRemaining: string | null = existingOddsState?.quotaRemaining || null;

      if (runsCompletedToday >= 2) {
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
        };
      } else {
        const perRunRemainingDaily = Math.max(0, dailyCap - callsTodayBeforeRun);
        const runCap = Math.min(8, perRunRemainingDaily);
        const targetLeagues = ODDS_API_LEAGUES.filter(item => (pickFixturesByLeague.get(item.code)?.length || 0) > 0);

        for (const item of ODDS_API_LEAGUES) {
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

            if (updates.length > 0) {
              const updatedCount = await updateFixtureVerifiedOddsInDatabase(updates);
              matchesUpdated += updatedCount;
            }
          } else {
            lastErr = res.error || `HTTP ${res.status}`;
            lastBody = res.bodyText.slice(0, 400);
            const rem = res.quotaRemaining ? parseInt(res.quotaRemaining, 10) : NaN;
            if (res.status === 401 || res.status === 429 || (!isNaN(rem) && rem <= 10)) {
              break;
            }
          }
        }

        // Note Tier 2/3 leagues not queried via Odds API to conserve 500 credits/month free allowance
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
          leaguesWithUpcomingPicks: Array.from(pickFixturesByLeague.entries()).map(([code, list]) => ({
            code,
            upcomingMatchesWithPicks: list.length,
          })),
          callsMade: oddsCalls,
          matchesUpdatedWithOdds: matchesUpdated,
          quotaRemaining: lastQuotaRemaining,
          quotaUsedThisMonth: lastQuotaHeaders['x-requests-used'] || null,
          monthlyAllowance: 500,
          skippedLeaguesCount: oddsSkipped.length,
        };
      }
    }
  }

  // 4. Database check
  if (isSupabaseConfigured && supabase) {
    const t0 = Date.now();
    try {
      const { error } = await supabase.from('fixtures').select('id').limit(1);
      results['database'] = {
        provider: 'Supabase / Local Persistent Store',
        isConfigured: true,
        status: error ? 'ERROR' : 'ONLINE',
        latencyMs: Date.now() - t0,
      };
    } catch (e: any) {
      results['database'] = {
        provider: 'Supabase / Local Persistent Store',
        isConfigured: true,
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
