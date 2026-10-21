// Server Cache & In-Memory Redis Integration Layer
// MOCKED per AI Studio Web Runtime Constraints — in-memory, data lost on container sleep
import { Fixture } from '@/types';

// MOCKED — in-memory, data lost on container sleep
const store = new Map<string, { value: any; expiresAt: number }>();
export const redis = {
  get: async (k: string) => {
    const entry = store.get(k);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      store.delete(k);
      return null;
    }
    return typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
  },
  set: async (k: string, v: any, ...args: any[]) => {
    let ttlMs = 300 * 1000;
    if (args.includes('EX')) {
      const exIdx = args.indexOf('EX');
      const seconds = args[exIdx + 1];
      if (typeof seconds === 'number') ttlMs = seconds * 1000;
    }
    store.set(k, { value: v, expiresAt: Date.now() + ttlMs });
    return 'OK';
  },
  del: async (...keys: string[]) => {
    let count = 0;
    for (const k of keys) {
      if (store.delete(k)) count++;
    }
    return count;
  },
  incr: async (k: string) => {
    const entry = store.get(k);
    const curr = (entry && typeof entry.value === 'number') ? entry.value : 0;
    const next = curr + 1;
    store.set(k, { value: next, expiresAt: entry?.expiresAt ?? Date.now() + 86400000 });
    return next;
  },
  keys: async (pattern: string) => {
    const cleaned = pattern.replace(/\*/g, '');
    return Array.from(store.keys()).filter(k => k.includes(cleaned));
  },
  flushdb: async () => {
    store.clear();
    return 'OK';
  },
  ping: async () => 'PONG',
};

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // Timestamp in ms
}

class ServerCache {
  private inMemoryStore = new Map<string, CacheEntry<any>>();

  // Dynamic TTL rules
  static readonly FIXTURE_DEFAULT_TTL_SEC = 300;      // 5 minutes
  static readonly FIXTURE_NEAR_KICKOFF_TTL_SEC = 60;  // 1 minute within 2 hours of kickoff
  static readonly ODDS_DEFAULT_TTL_SEC = 600;         // 10 minutes

  constructor() {}

  /**
   * Generates standardized fixture cache key with sport, league and date window
   */
  getFixtureCacheKey(league: string | undefined, dateFrom: string, dateTo: string, sport: string = 'football'): string {
    return `fixtures:${sport}:${league || 'ALL'}:${dateFrom}:${dateTo}`;
  }

  /**
   * Generates standardized odds cache key with sport, league and date window
   */
  getOddsCacheKey(league: string | undefined, dateFrom: string, dateTo: string, sport: string = 'football'): string {
    return `odds:${sport}:${league || 'ALL'}:${dateFrom}:${dateTo}`;
  }

  /**
   * Computes appropriate TTL for fixtures:
   * 1 minute if any fixture is within 2 hours of kickoff, otherwise 5 minutes.
   */
  computeFixtureTTL(fixtures: Fixture[]): number {
    const now = Date.now();
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

    const hasNearKickoff = fixtures.some(f => {
      try {
        const kickoff = new Date(f.kickoffTime).getTime();
        const diff = kickoff - now;
        return diff >= -TWO_HOURS_MS && diff <= TWO_HOURS_MS;
      } catch {
        return false;
      }
    });

    return hasNearKickoff
      ? ServerCache.FIXTURE_NEAR_KICKOFF_TTL_SEC
      : ServerCache.FIXTURE_DEFAULT_TTL_SEC;
  }

  /**
   * Check if a value represents a failure or empty result.
   * Requirement 4: STOP CACHING FAILURES. Never write "Live data unavailable" into serverCache.
   */
  private isFailureOrEmpty(value: any): boolean {
    if (!value) return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (typeof value === 'object') {
      const anyVal = value as Record<string, any>;
      if (anyVal.liveDataAvailable === false || anyVal.error || anyVal.status === 'ERROR') {
        return true;
      }
    }
    return false;
  }

  /**
   * Retrieve cached value from in-memory store.
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.inMemoryStore.get(key);
    if (!entry) return null;

    if (Date.now() >= entry.expiresAt) {
      this.inMemoryStore.delete(key);
      return null;
    }

    if (this.isFailureOrEmpty(entry.value)) {
      this.inMemoryStore.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Store value with MANDATORY TTL expiry in in-memory store.
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    // Never cache failures or empty payloads
    if (this.isFailureOrEmpty(value)) {
      return;
    }

    if (!ttlSeconds || ttlSeconds <= 0) {
      console.warn(`[ServerCache] Refusing to set key "${key}" without positive TTL.`);
      return;
    }

    // Update local memory store with expiry
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.inMemoryStore.set(key, { value, expiresAt });
    store.set(key, { value, expiresAt });
  }

  /**
   * Busts the cache. Clears in-memory store.
   */
  async bust(pattern?: string): Promise<number> {
    let memoryDeleted = 0;
    if (!pattern) {
      memoryDeleted = this.inMemoryStore.size;
      this.inMemoryStore.clear();
      store.clear();
    } else {
      for (const key of Array.from(this.inMemoryStore.keys())) {
        if (key.includes(pattern)) {
          this.inMemoryStore.delete(key);
          store.delete(key);
          memoryDeleted++;
        }
      }
    }
    return memoryDeleted;
  }

  /**
   * Redis health check probe for /api/health
   */
  async ping(): Promise<{ ok: boolean; configured: boolean; latencyMs?: number; error?: string; urlScheme?: string }> {
    return {
      ok: true,
      configured: true,
      urlScheme: 'In-Memory Cache (Mocked)',
      latencyMs: 0,
    };
  }
}

export const serverCache = new ServerCache();
