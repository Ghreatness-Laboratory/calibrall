// Server Cache & Redis Integration Layer
// Enforces mandatory TTL expiry, league & date window cache keys,
// dynamic TTL calculation (5 mins default, 1 min within 2h of kickoff, 10 mins for odds),
// and explicit cache busting.

import { Fixture } from '@/types';

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

  /**
   * Generates standardized fixture cache key with league and date window
   */
  getFixtureCacheKey(league: string | undefined, dateFrom: string, dateTo: string): string {
    return `fixtures:${league || 'ALL'}:${dateFrom}:${dateTo}`;
  }

  /**
   * Generates standardized odds cache key with league and date window
   */
  getOddsCacheKey(league: string | undefined, dateFrom: string, dateTo: string): string {
    return `odds:${league || 'ALL'}:${dateFrom}:${dateTo}`;
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
        // If kickoff is within the next 2 hours or started less than 2 hours ago
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
   * Retrieve cached value if not expired
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.inMemoryStore.get(key);
    if (!entry) return null;

    if (Date.now() >= entry.expiresAt) {
      this.inMemoryStore.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Store value with MANDATORY TTL expiry.
   * Throws if ttlSeconds is non-positive or missing to guarantee no key is set without expiry.
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!ttlSeconds || ttlSeconds <= 0) {
      throw new Error(`[ServerCache] Refusing to set key "${key}" without an expiry TTL.`);
    }

    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.inMemoryStore.set(key, { value, expiresAt });
  }

  /**
   * Busts the cache. If pattern is provided, clears matching keys; otherwise clears all.
   */
  async bust(pattern?: string): Promise<number> {
    if (!pattern) {
      const count = this.inMemoryStore.size;
      this.inMemoryStore.clear();
      return count;
    }

    let deleted = 0;
    for (const key of Array.from(this.inMemoryStore.keys())) {
      if (key.includes(pattern)) {
        this.inMemoryStore.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Clean expired entries periodically
   */
  cleanExpired(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.inMemoryStore.entries())) {
      if (now >= entry.expiresAt) {
        this.inMemoryStore.delete(key);
      }
    }
  }
}

export const serverCache = new ServerCache();
