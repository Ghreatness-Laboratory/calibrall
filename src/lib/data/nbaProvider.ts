// Basketball Data Provider: Delegates live sync to liveSync.ts and visitor reads strictly to DB-only readService.ts
// Preserves NBADataProvider compatibility interface without making external calls on visitor reads.

import { serverCache } from '../cache/serverCache';
import {
  NBATeamStats,
  Fixture,
} from '@/types';
import {
  NBASeason,
  computeNBASeason,
  getNBATeamStats,
  getAllNBATeamsList,
} from './nbaSeedData';
import {
  SyncMode,
  FIXTURE_STALE_LIMIT_MINUTES,
  BASKETBALL_SYNC_ENABLED,
} from './providerBudget';
import {
  getStoredSportFreshness,
} from './providerCallLogger';
import {
  getBasketballFixturesAndEvaluations,
  getBasketballFixtureByIdFromDb,
} from '@/lib/basketball/readService';
import { syncBasketballLivePipeline } from '@/lib/basketball/liveSync';

export interface NBAProviderHealth {
  providerName: string;
  isConfigured: boolean;
  status: 'ONLINE' | 'STANDBY_DEV_MODE' | 'ERROR' | 'RATE_LIMITED' | 'DISABLED';
  lastSyncTimestamp: string;
  message: string;
  missingEnvVars: string[];
}

export interface NBAStatsFetchResult {
  stats: Record<string, NBATeamStats>;
  source: string;
  season: string;
  lastUpdated: string;
  isLive: boolean;
  error?: string;
}

export interface NBAFixturesHealthResult {
  lastSyncTime: string;
  lastSyncFormatted: string;
  newestKickoff: string | null;
  rowCount: number;
  providerStatus: 'ONLINE' | 'STANDBY_DEV_MODE' | 'ERROR' | 'DISABLED';
  provider: string;
  season: string;
  isDelayed: boolean;
}

export class NBADataProvider {
  private static readonly STATS_CACHE_TTL_SEC = 6 * 60 * 60;
  private fixturesStore = new Map<string, Fixture>();
  private lastSyncTimestamp: string | null = null;
  private lastSyncStatus: 'ONLINE' | 'STANDBY_DEV_MODE' | 'ERROR' | 'DISABLED' =
    BASKETBALL_SYNC_ENABLED ? 'ONLINE' : 'DISABLED';
  private lastProviderUsed: string = 'ESPN NBA/NCAAB + EuroLeague v2';
  private activeSyncPromise: Promise<number> | null = null;

  async getHealth(): Promise<NBAProviderHealth> {
    if (!BASKETBALL_SYNC_ENABLED) {
      return {
        providerName: 'Disabled',
        isConfigured: false,
        status: 'DISABLED',
        lastSyncTimestamp: this.lastSyncTimestamp || new Date().toISOString(),
        message: 'Basketball syncing disabled.',
        missingEnvVars: [],
      };
    }

    const freshness = await getStoredSportFreshness('basketball');
    return {
      providerName: 'ESPN NBA/NCAAB Scoreboards + EuroLeague v2 (DB Sync)',
      isConfigured: true,
      status: freshness.syncState?.status === 'ERROR' && freshness.isStaleBeyondLimit ? 'ERROR' : this.lastSyncStatus,
      lastSyncTimestamp: freshness.newestUpdatedAt || this.lastSyncTimestamp || new Date().toISOString(),
      message: 'Basketball pipeline active (NBA, NCAAB D1, EuroLeague). Visitor reads served strictly from database.',
      missingEnvVars: process.env.ODDS_API_KEY?.trim() ? [] : ['ODDS_API_KEY (optional for real bookmaker prices)'],
    };
  }

  getFixturesHealth(): NBAFixturesHealthResult {
    if (!BASKETBALL_SYNC_ENABLED) {
      return {
        lastSyncTime: this.lastSyncTimestamp || new Date().toISOString(),
        lastSyncFormatted: 'disabled',
        newestKickoff: null,
        rowCount: this.fixturesStore.size,
        providerStatus: 'DISABLED',
        provider: 'Disabled',
        season: computeNBASeason(),
        isDelayed: false,
      };
    }

    const now = Date.now();
    const syncTimeMs = this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp).getTime() : now;
    const diffMinutes = (now - syncTimeMs) / 60000;
    const isDelayed = diffMinutes >= FIXTURE_STALE_LIMIT_MINUTES;

    let newestKickoff: string | null = null;
    let maxKickoffMs = 0;
    this.fixturesStore.forEach((f) => {
      const ms = new Date(f.kickoffTime).getTime();
      if (ms > maxKickoffMs) {
        maxKickoffMs = ms;
        newestKickoff = f.kickoffTime;
      }
    });

    const syncDate = this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp) : new Date();
    const lastSyncFormatted = `${String(syncDate.getUTCHours()).padStart(2, '0')}:${String(
      syncDate.getUTCMinutes()
    ).padStart(2, '0')} UTC`;

    return {
      lastSyncTime: this.lastSyncTimestamp || new Date().toISOString(),
      lastSyncFormatted,
      newestKickoff,
      rowCount: this.fixturesStore.size,
      providerStatus: this.lastSyncStatus,
      provider: this.lastProviderUsed,
      season: computeNBASeason(),
      isDelayed,
    };
  }

  async syncLiveFixtures(force = false, mode: SyncMode = 'full'): Promise<number> {
    if (!BASKETBALL_SYNC_ENABLED) {
      this.lastSyncStatus = 'DISABLED';
      return 0;
    }

    if (!force && this.lastSyncTimestamp && this.fixturesStore.size > 0) {
      const ageMs = Date.now() - new Date(this.lastSyncTimestamp).getTime();
      if (ageMs < 15 * 60 * 1000) {
        return this.fixturesStore.size;
      }
    }

    if (this.activeSyncPromise) {
      return this.activeSyncPromise;
    }

    this.activeSyncPromise = (async () => {
      try {
        const res = await syncBasketballLivePipeline(mode);
        this.lastSyncTimestamp = new Date().toISOString();
        this.lastSyncStatus = res.status === 'ERROR' ? 'ERROR' : 'ONLINE';
        const readOut = await getBasketballFixturesAndEvaluations();
        this.fixturesStore.clear();
        for (const f of readOut.fixtures) {
          this.fixturesStore.set(f.id, f);
        }
        return res.totalGamesUpserted || readOut.fixtures.length;
      } finally {
        this.activeSyncPromise = null;
      }
    })();

    return this.activeSyncPromise;
  }

  async getFixtures(
    status?: string,
    options?: { league?: string; competitionId?: string; day?: string }
  ) {
    const out = await getBasketballFixturesAndEvaluations({
      league: options?.league,
      competitionId: options?.competitionId,
      status,
      day: options?.day,
    });

    if (out.fixtures.length > 0) {
      for (const f of out.fixtures) {
        this.fixturesStore.set(f.id, f);
      }
      if (out.lastSyncTimestamp) {
        this.lastSyncTimestamp = out.lastSyncTimestamp;
      }
    }

    return {
      fixtures: out.fixtures,
      evaluationsById: out.evaluationsById,
      lastUpdated: out.lastUpdated,
      lastSyncTimestamp: out.lastSyncTimestamp,
      liveDataAvailable: out.liveDataAvailable,
      isDelayed: out.isDelayed,
      staleLimitMinutes: out.staleLimitMinutes,
      error: out.error,
      failedProvider: out.failedProvider,
      season: out.season,
    };
  }

  async getFixtureById(id: string): Promise<Fixture | null> {
    const out = await getBasketballFixtureByIdFromDb(id);
    return out?.fixture || null;
  }

  async getTeamAdvancedStats(season?: NBASeason | string, forceRefresh = false): Promise<NBAStatsFetchResult> {
    const targetSeason = season || computeNBASeason();
    const cacheKey = `nba:stats:${targetSeason}`;

    if (!forceRefresh) {
      const cached = await serverCache.get<NBAStatsFetchResult>(cacheKey);
      if (cached && cached.stats && Object.keys(cached.stats).length > 0) {
        return cached;
      }
    }

    const allTeams = getAllNBATeamsList();
    const statsResult: Record<string, NBATeamStats> = {};
    allTeams.forEach((t) => {
      const teamStats = getNBATeamStats(t.abbreviation, targetSeason);
      if (teamStats) statsResult[t.abbreviation] = teamStats;
    });

    const now = new Date();
    const lastUpdated = `${String(now.getUTCHours()).padStart(2, '0')}:${String(
      now.getUTCMinutes()
    ).padStart(2, '0')} UTC`;

    const result: NBAStatsFetchResult = {
      stats: statsResult,
      source: 'Calibrall Basketball Historical Team Metrics',
      season: targetSeason,
      lastUpdated,
      isLive: true,
    };

    await serverCache.set(cacheKey, result, NBADataProvider.STATS_CACHE_TTL_SEC);
    return result;
  }
}

declare global {
  var __nbaProviderInstance: NBADataProvider | undefined;
}

export function getNBADataProvider(): NBADataProvider {
  if (!globalThis.__nbaProviderInstance) {
    globalThis.__nbaProviderInstance = new NBADataProvider();
  }
  return globalThis.__nbaProviderInstance;
}
