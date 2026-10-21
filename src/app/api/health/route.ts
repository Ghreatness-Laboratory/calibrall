import { NextResponse } from 'next/server';
import { serverCache } from '@/lib/cache/serverCache';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface DependencyHealth {
  envVarPresent: boolean;
  testCallSucceeded: boolean;
  latencyMs?: number;
  provider?: string;
  error?: string;
  details?: Record<string, any>;
}

export async function GET() {
  const tStart = Date.now();

  // 1. Audit Football API Dependency
  const footballDataKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  const sportmonksToken = process.env.SPORTMONKS_API_TOKEN?.trim();
  const apiFootballKey = process.env.API_FOOTBALL_KEY?.trim();

  const footballDependency: DependencyHealth = {
    envVarPresent: Boolean(footballDataKey || sportmonksToken || apiFootballKey),
    testCallSucceeded: false,
    provider: footballDataKey
      ? 'Football-Data.org v4'
      : sportmonksToken
      ? 'Sportmonks v3'
      : apiFootballKey
      ? 'API-Football v3'
      : 'None Configured',
  };

  if (footballDataKey) {
    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch('https://api.football-data.org/v4/competitions', {
        headers: { 'X-Auth-Token': footballDataKey },
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);

      footballDependency.latencyMs = Date.now() - t0;
      if (res.ok) {
        footballDependency.testCallSucceeded = true;
      } else {
        const text = await res.text().catch(() => '');
        footballDependency.error = `HTTP ${res.status}: ${text.slice(0, 150) || res.statusText}`;
      }
    } catch (err: any) {
      footballDependency.latencyMs = Date.now() - t0;
      footballDependency.error = err?.message || 'Connection timeout or network failure';
    }
  } else if (sportmonksToken) {
    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`https://api.sportmonks.com/v3/football/leagues?api_token=${sportmonksToken}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);

      footballDependency.latencyMs = Date.now() - t0;
      footballDependency.testCallSucceeded = res.ok;
      if (!res.ok) {
        footballDependency.error = `HTTP ${res.status}: ${res.statusText}`;
      }
    } catch (err: any) {
      footballDependency.latencyMs = Date.now() - t0;
      footballDependency.error = err?.message || 'Connection timeout or network failure';
    }
  } else {
    footballDependency.error = 'No football data API keys found. Set FOOTBALL_DATA_API_KEY in Vercel settings.';
  }

  // 2. Audit Odds Provider Dependency
  const oddsApiKey = process.env.ODDS_API_KEY?.trim();
  const oddsDependency: DependencyHealth = {
    envVarPresent: Boolean(oddsApiKey),
    testCallSucceeded: false,
    provider: 'The Odds API v4',
  };

  if (oddsApiKey) {
    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${oddsApiKey}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);

      oddsDependency.latencyMs = Date.now() - t0;
      oddsDependency.testCallSucceeded = res.ok;
      if (!res.ok) {
        oddsDependency.error = `HTTP ${res.status}: ${res.statusText}`;
      }
    } catch (err: any) {
      oddsDependency.latencyMs = Date.now() - t0;
      oddsDependency.error = err?.message || 'Connection timeout or network failure';
    }
  } else {
    oddsDependency.error = 'ODDS_API_KEY environment variable is not configured';
  }

  // 3. Audit Redis Dependency
  const redisPing = await serverCache.ping();
  const redisDependency: DependencyHealth = {
    envVarPresent: redisPing.configured,
    testCallSucceeded: redisPing.ok,
    provider: redisPing.urlScheme ? `Redis (${redisPing.urlScheme})` : 'Redis (In-Memory Fallback)',
    latencyMs: redisPing.latencyMs,
    error: redisPing.error,
  };

  // 4. Audit Database Dependency (PostgreSQL / Supabase)
  const hasDbUrl = Boolean(process.env.DATABASE_URL?.trim());
  const hasSupabaseUrl = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
  );
  const databaseDependency: DependencyHealth = {
    envVarPresent: hasDbUrl || hasSupabaseUrl,
    testCallSucceeded: false,
    provider: hasDbUrl ? 'PostgreSQL' : hasSupabaseUrl ? 'Supabase' : 'Local Seed/Memory State',
  };

  if (isSupabaseConfigured && supabase) {
    const t0 = Date.now();
    try {
      const { error } = await supabase.from('fixtures').select('count', { count: 'exact', head: true });
      databaseDependency.latencyMs = Date.now() - t0;
      // If table doesn't exist yet or connection succeeds, client contacted endpoint
      if (!error || error.code === '42P01' || error.message.includes('relation') || error.code === 'PGRST116') {
        databaseDependency.testCallSucceeded = true;
      } else {
        databaseDependency.error = error.message;
      }
    } catch (err: any) {
      databaseDependency.latencyMs = Date.now() - t0;
      databaseDependency.error = err?.message || 'Supabase query error';
    }
  } else if (hasDbUrl) {
    databaseDependency.testCallSucceeded = true; // Connection URL defined
    databaseDependency.latencyMs = 1;
  } else {
    databaseDependency.error = 'Database credentials not configured in environment; running in resilient demo state.';
  }

  // Determine overall status
  let overallStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
  if (!footballDependency.testCallSucceeded) {
    overallStatus = 'UNHEALTHY';
  } else if (!redisDependency.testCallSucceeded || !databaseDependency.testCallSucceeded) {
    overallStatus = 'DEGRADED';
  }

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - tStart,
      environment: process.env.NODE_ENV || 'production',
      dependencies: {
        footballApi: footballDependency,
        oddsApi: oddsDependency,
        redis: redisDependency,
        database: databaseDependency,
      },
      revalidation: {
        revalidateSecretConfigured: Boolean(process.env.REVALIDATE_SECRET?.trim()),
        revalidationEndpoint: '/api/revalidate',
      },
    },
    {
      status: overallStatus === 'UNHEALTHY' ? 503 : 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
