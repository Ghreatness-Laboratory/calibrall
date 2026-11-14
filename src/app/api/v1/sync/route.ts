import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { getFootballDataProvider } from '@/lib/data/provider';
import { getNBADataProvider } from '@/lib/data/nbaProvider';
import { computeNBADateWindow } from '@/lib/utils/dateWindow';
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
];

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

    // BallDontLie stats check (schedule/full only, 4 calls/day budget)
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
        ...(res.ok ? { lastSuccessAt: attemptIso, lastError: null } : { lastError: res.error, lastHttpStatus: res.status, lastResponseBody: res.bodyText.slice(0, 400) }),
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

  // 2. Football Fixture Sync (Football-Data.org -> Sportmonks -> ESPN Soccer into Supabase/SQLite)
  if (sportParam === 'all' || sportParam === 'football') {
    const t0 = Date.now();
    try {
      const footballProvider = getFootballDataProvider();
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

    // 3. The Odds API (Schedule/Full only, strictly capped at 16 calls/day across Tier-1 leagues)
    const oddsApiKey = process.env.ODDS_API_KEY?.trim();
    if (oddsApiKey && mode !== 'live') {
      const attemptIso = new Date().toISOString();
      const callsToday = await getProviderCallCountToday('the-odds-api');
      const dailyCap = PROVIDER_BUDGETS['the-odds-api'].dailyQuotaLimit ?? 16;
      const runCap = Math.max(0, Math.min(4, dailyCap - callsToday));
      const oddsSkipped: SkippedLeagueRecord[] = [];
      let oddsCalls = 0;
      let lastOk = false;
      let lastStatus: number | null = null;
      let lastErr: string | null = null;
      let lastBody: string | null = null;
      let lastQuotaHeaders: Record<string, string> = {};
      let lastQuotaRemaining: string | null = null;

      for (const item of ODDS_API_LEAGUES) {
        if (oddsCalls >= runCap) {
          oddsSkipped.push({
            leagueCode: item.code,
            leagueName: item.name,
            tier: getLeaguePriorityTier(item.code),
            provider: 'the-odds-api',
            reason: `Daily Odds API credit budget reached (${callsToday + oddsCalls}/${dailyCap} calls/day)`,
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
        lastQuotaHeaders = res.quotaHeaders;
        lastQuotaRemaining = res.quotaRemaining;
        if (res.ok) {
          lastOk = true;
        } else {
          lastErr = res.error || `HTTP ${res.status}`;
          lastBody = res.bodyText.slice(0, 400);
          const rem = res.quotaRemaining ? parseInt(res.quotaRemaining, 10) : NaN;
          if (res.status === 401 || res.status === 429 || (!isNaN(rem) && rem <= 10)) {
            break;
          }
        }
      }

      // Note secondary Tier 2 & Tier 3 leagues skipped for odds conservation
      for (const code of [...TIER_2_LEAGUES, ...TIER_3_LEAGUES]) {
        oddsSkipped.push({
          leagueCode: code,
          leagueName: code,
          tier: getLeaguePriorityTier(code),
          provider: 'the-odds-api',
          reason: 'Excluded from 500 credits/month Odds API tier budget (Tier 1 prioritised)',
        });
      }

      await upsertProviderSyncState('provider:the-odds-api', {
        sport: 'odds',
        providerName: 'The Odds API v4',
        status: lastOk ? 'ONLINE' : 'ERROR',
        lastAttemptAt: attemptIso,
        ...(lastOk ? { lastSuccessAt: attemptIso, lastError: null } : { lastError: lastErr, lastHttpStatus: lastStatus, lastResponseBody: lastBody }),
        quotaRemaining: lastQuotaRemaining,
        quotaHeaders: lastQuotaHeaders,
        skippedLeagues: oddsSkipped,
        callsUsedLastRun: oddsCalls,
      });

      results['theOddsApi'] = {
        provider: 'the-odds-api.com',
        status: lastOk ? 'ONLINE' : 'ERROR',
        callsMade: oddsCalls,
        quotaRemaining: lastQuotaRemaining,
        skippedLeaguesCount: oddsSkipped.length,
      };
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
