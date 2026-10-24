import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { getNBADataProvider } from '@/lib/data/nbaProvider';
import { computeNBADateWindow } from '@/lib/utils/dateWindow';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function handleSync(request: Request) {
  const url = new URL(request.url);
  const sportParam = url.searchParams.get('sport')?.toLowerCase() || 'all';
  
  // Secret protection: check x-sync-secret, Authorization Bearer, or ?secret=
  const secretHeader = request.headers.get('x-sync-secret') || 
    request.headers.get('authorization')?.replace('Bearer ', '');
  const urlSecret = url.searchParams.get('secret');
  const configuredSecret = process.env.CRON_SECRET?.trim() || process.env.REVALIDATE_SECRET?.trim();

  if (configuredSecret && secretHeader !== configuredSecret && urlSecret !== configuredSecret) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid sync secret.' },
      { status: 401 }
    );
  }

  const results: Record<string, any> = {};

  // 1. Basketball Sync (NBA)
  if (sportParam === 'all' || sportParam === 'basketball') {
    const t0 = Date.now();
    try {
      const nbaProvider = getNBADataProvider();
      const count = await nbaProvider.syncLiveFixtures(true);
      const health = nbaProvider.getFixturesHealth();
      const windowInfo = computeNBADateWindow(1, 14);

      results['basketball'] = {
        provider: health.provider,
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
        status: 'ERROR',
        error: e.message || 'Sync failed',
        latencyMs: Date.now() - t0,
      };
    }
  }

  // 2. Football-Data.org
  if (sportParam === 'all' || sportParam === 'football') {
    const footballDataKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
    if (footballDataKey) {
      const t0 = Date.now();
      try {
        const res = await fetch('https://api.football-data.org/v4/competitions', {
          headers: { 'X-Auth-Token': footballDataKey },
          next: { revalidate: 60 },
        });
        const data = await res.json();
        results['footballData'] = {
          provider: 'football-data.org',
          status: res.ok ? 'ONLINE' : 'ERROR',
          records: data.count || (data.competitions ? data.competitions.length : 0),
          latencyMs: Date.now() - t0,
        };
      } catch (e: any) {
        results['footballData'] = {
          provider: 'football-data.org',
          status: 'OFFLINE_FALLBACK',
          error: e.message,
        };
      }
    }

    // 3. The Odds API
    const oddsApiKey = process.env.ODDS_API_KEY?.trim();
    if (oddsApiKey) {
      const t0 = Date.now();
      try {
        const res = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${oddsApiKey}`, {
          next: { revalidate: 60 },
        });
        const data = await res.json();
        results['theOddsApi'] = {
          provider: 'the-odds-api.com',
          status: res.ok ? 'ONLINE' : 'ERROR',
          records: Array.isArray(data) ? data.length : 0,
          latencyMs: Date.now() - t0,
        };
      } catch (e: any) {
        results['theOddsApi'] = {
          provider: 'the-odds-api.com',
          status: 'OFFLINE_FALLBACK',
          error: e.message,
        };
      }
    }

    // 4. Sportmonks
    const sportmonksToken = process.env.SPORTMONKS_API_TOKEN?.trim();
    if (sportmonksToken) {
      const t0 = Date.now();
      try {
        const res = await fetch(`https://api.sportmonks.com/v3/football/leagues?api_token=${sportmonksToken}`, {
          next: { revalidate: 60 },
        });
        const data = await res.json();
        results['sportmonks'] = {
          provider: 'sportmonks.com',
          status: res.ok ? 'ONLINE' : 'ERROR',
          records: data?.data ? data.data.length : 0,
          latencyMs: Date.now() - t0,
        };
      } catch (e: any) {
        results['sportmonks'] = {
          provider: 'sportmonks.com',
          status: 'OFFLINE_FALLBACK',
          error: e.message,
        };
      }
    }
  }

  // 5. Supabase Database check
  if (isSupabaseConfigured && supabase) {
    const t0 = Date.now();
    try {
      const auth = await supabase.auth.getSession();
      results['supabase'] = {
        provider: 'Supabase PostgreSQL',
        isConfigured: true,
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        status: auth.error ? 'ERROR' : 'ONLINE',
        latencyMs: Date.now() - t0,
      };
    } catch (e: any) {
      results['supabase'] = {
        provider: 'Supabase PostgreSQL',
        isConfigured: true,
        status: 'OFFLINE_FALLBACK',
        error: e.message,
      };
    }
  } else {
    results['supabase'] = {
      provider: 'Supabase PostgreSQL',
      isConfigured: false,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not configured',
      status: 'LOCAL_DEV_SEED_MODE',
    };
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    results,
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

export async function POST(req: Request) {
  return handleSync(req);
}

export async function GET(req: Request) {
  return handleSync(req);
}
