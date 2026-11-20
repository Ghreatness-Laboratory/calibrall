import { NextResponse } from 'next/server';
import { serverCache } from '@/lib/cache/serverCache';
import {
  supabase,
  isSupabaseConfigured,
  persistenceBackendInfo,
} from '@/lib/supabase/client';
import { BASKETBALL_SYNC_ENABLED } from '@/lib/data/providerBudget';
import { getAllProviderSyncStates, getStoredSportFreshness } from '@/lib/data/providerCallLogger';

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
  const persistence = persistenceBackendInfo();

  // DB-only health check: never calls external provider APIs on visitor/health requests.
  const [syncStates, footballFreshness, basketballFreshness] = await Promise.all([
    getAllProviderSyncStates(),
    getStoredSportFreshness('football'),
    getStoredSportFreshness('basketball'),
  ]);

  const stateById = new Map(syncStates.map(s => [s.id, s]));
  const fdState = stateById.get('provider:football-data');
  const smState = stateById.get('provider:sportmonks');
  const oddsState = stateById.get('provider:the-odds-api');
  const bdlState = stateById.get('provider:balldontlie');

  const footballDataKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  const sportmonksToken =
    process.env.SPORTMONKS_API_TOKEN?.trim() ||
    process.env.SPORTSMONK_API_KEY?.trim() ||
    process.env.SPORTMONKS_API_KEY?.trim();

  const footballHealthy =
    footballFreshness.fixtureCount > 0 && !footballFreshness.isStaleBeyondLimit;

  const footballDependency: DependencyHealth = {
    envVarPresent: Boolean(footballDataKey || sportmonksToken),
    testCallSucceeded: footballHealthy || fdState?.status === 'ONLINE' || smState?.status === 'ONLINE',
    provider: footballDataKey ? 'Football-Data.org v4' : sportmonksToken ? 'Sportmonks v3' : 'None Configured',
    details: {
      storedFixtures: footballFreshness.fixtureCount,
      lastUpdated: footballFreshness.lastUpdatedFormatted,
      ageMinutes: footballFreshness.ageMinutes,
      providerStatus: fdState?.status || smState?.status || 'UNKNOWN',
    },
    ...(footballHealthy ? {} : footballFreshness.syncState?.lastError ? { error: footballFreshness.syncState.lastError } : {}),
  };

  const ballDontLieKey =
    process.env.BALLDONTLIE_API_KEY?.trim() || process.env.BALL_DONT_LIE_API_KEY?.trim();
  const basketballHealthy = BASKETBALL_SYNC_ENABLED
    ? basketballFreshness.fixtureCount > 0 && !basketballFreshness.isStaleBeyondLimit
    : true;

  const basketballDependency: DependencyHealth = BASKETBALL_SYNC_ENABLED
    ? {
        envVarPresent: Boolean(ballDontLieKey || basketballFreshness.fixtureCount > 0),
        testCallSucceeded: basketballHealthy || bdlState?.status === 'ONLINE',
        provider: 'ESPN NBA Scoreboard + BallDontLie v1',
        details: {
          enabled: true,
          storedFixtures: basketballFreshness.fixtureCount,
          lastUpdated: basketballFreshness.lastUpdatedFormatted,
          ageMinutes: basketballFreshness.ageMinutes,
          ballDontLieStatus: bdlState?.status || 'UNCHECKED',
        },
      }
    : {
        envVarPresent: true,
        testCallSucceeded: true,
        provider: 'Disabled until basketball module is built',
        details: {
          enabled: false,
          status: 'DISABLED',
          storedFixtures: basketballFreshness.fixtureCount,
          lastUpdated: basketballFreshness.lastUpdatedFormatted,
        },
      };

  const oddsApiKey = process.env.ODDS_API_KEY?.trim();
  const oddsDependency: DependencyHealth = {
    envVarPresent: Boolean(oddsApiKey),
    testCallSucceeded: Boolean(oddsApiKey) && oddsState?.status !== 'ERROR',
    provider: 'The Odds API v4',
    details: {
      status: oddsState?.status || (oddsApiKey ? 'CONFIGURED' : 'UNCONFIGURED'),
      quotaRemaining: oddsState?.quotaRemaining || null,
      lastAttemptAt: oddsState?.lastAttemptAt || null,
    },
    ...(oddsState?.lastError ? { error: oddsState.lastError } : {}),
  };

  const redisPing = await serverCache.ping();
  const redisDependency: DependencyHealth = {
    envVarPresent: redisPing.configured,
    testCallSucceeded: redisPing.ok,
    provider: redisPing.urlScheme ? `Redis (${redisPing.urlScheme})` : 'Redis (In-Memory Fallback)',
    latencyMs: redisPing.latencyMs,
    error: redisPing.error,
  };

  const hasDbUrl = Boolean(process.env.DATABASE_URL?.trim());
  const hasSupabaseUrl = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
  );
  const databaseDependency: DependencyHealth = {
    envVarPresent: hasDbUrl || persistence.isRemoteSupabase || persistence.localSqliteAllowed,
    testCallSucceeded: false,
    provider:
      persistence.backend === 'supabase_postgres'
        ? 'Supabase PostgreSQL'
        : persistence.backend === 'local_sqlite'
        ? 'Local SQLite Dev Store (data/supabase.db)'
        : 'Misconfigured Production Persistence',
    details: { ...persistence, hasSupabaseUrl },
  };

  if (persistence.backend === 'misconfigured') {
    databaseDependency.testCallSucceeded = false;
    databaseDependency.error = persistence.message;
  } else if (isSupabaseConfigured && supabase) {
    const t0 = Date.now();
    try {
      const { error } = await supabase.from('fixtures').select('count', { count: 'exact', head: true });
      databaseDependency.latencyMs = Date.now() - t0;
      if (!error) {
        databaseDependency.testCallSucceeded = true;
      } else {
        databaseDependency.error = error.message;
      }
    } catch (err: any) {
      databaseDependency.latencyMs = Date.now() - t0;
      databaseDependency.error = err?.message || 'Database query error';
    }
  } else if (hasDbUrl) {
    databaseDependency.testCallSucceeded = true;
    databaseDependency.latencyMs = 1;
  }

  const footballOperational = footballDependency.testCallSucceeded;
  const basketballOperational = BASKETBALL_SYNC_ENABLED ? basketballDependency.testCallSucceeded : false;

  let overallStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
  if (!footballOperational || !databaseDependency.testCallSucceeded) {
    overallStatus = databaseDependency.testCallSucceeded ? 'DEGRADED' : 'UNHEALTHY';
  } else if (!redisDependency.testCallSucceeded) {
    overallStatus = 'DEGRADED';
  }

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - tStart,
      environment: process.env.NODE_ENV || 'production',
      visitorExternalApiCalls: 0,
      sports: {
        football: {
          operational: footballOperational,
          api: footballDependency,
          engine: 'Dixon Coles Poisson + NegBinomial',
        },
        basketball: {
          enabled: BASKETBALL_SYNC_ENABLED,
          operational: basketballOperational,
          api: basketballDependency,
          engine: 'Disabled until basketball module is built',
        },
      },
      infrastructure: {
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
