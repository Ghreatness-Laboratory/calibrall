import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';

export async function POST() {
  const footballDataKey = process.env.FOOTBALL_DATA_API_KEY;
  const oddsApiKey = process.env.ODDS_API_KEY;
  const sportmonksToken = process.env.SPORTMONKS_API_TOKEN;

  const results: Record<string, any> = {};

  // 1. Football-Data.org
  if (footballDataKey) {
    const t0 = Date.now();
    try {
      const res = await fetch('https://api.football-data.org/v4/competitions', {
        headers: { 'X-Auth-Token': footballDataKey },
        next: { revalidate: 60 }
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

  // 2. The Odds API
  if (oddsApiKey) {
    const t0 = Date.now();
    try {
      const res = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${oddsApiKey}`, {
        next: { revalidate: 60 }
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

  // 3. Sportmonks
  if (sportmonksToken) {
    const t0 = Date.now();
    try {
      const res = await fetch(`https://api.sportmonks.com/v3/football/leagues?api_token=${sportmonksToken}`, {
        next: { revalidate: 60 }
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

  // 4. Supabase
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
  });
}
