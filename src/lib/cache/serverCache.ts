// Server Cache & Redis Integration Layer
// Production-hardened: supports rediss:// TLS URLs, short connect timeout,
// fails open to local cache / provider if Redis is down, and NEVER caches failures.

import Redis, { RedisOptions } from 'ioredis';
import { Fixture } from '@/types';

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // Timestamp in ms
}

class ServerCache {
  private inMemoryStore = new Map<string, CacheEntry<any>>();
  private redisClient: Redis | null = null;
  private isConnectingRedis = false;
  private redisFailedOnce = false;

  // Dynamic TTL rules
  static readonly FIXTURE_DEFAULT_TTL_SEC = 300;      // 5 minutes
  static readonly FIXTURE_NEAR_KICKOFF_TTL_SEC = 60;  // 1 minute within 2 hours of kickoff
  static readonly ODDS_DEFAULT_TTL_SEC = 600;         // 10 minutes

  constructor() {
    this.initRedis();
  }

  private initRedis(): Redis | null {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      return null;
    }

    if (this.redisClient) {
      return this.redisClient;
    }

    if (this.isConnectingRedis) {
      return null;
    }

    try {
      this.isConnectingRedis = true;
      const isTls = redisUrl.startsWith('rediss://');

      const options: RedisOptions = {
        connectTimeout: 2000,
        commandTimeout: 2000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
        retryStrategy(times) {
          if (times > 3) return null; // stop reconnecting after 3 attempts
          return Math.min(times * 100, 1000);
        },
      };

      if (isTls) {
        options.tls = {
          rejectUnauthorized: false,
        };
      }

      const client = new Redis(redisUrl, options);

      client.on('error', (err) => {
        if (!this.redisFailedOnce) {
          this.redisFailedOnce = true;
          console.error('[Redis Client Error] Redis connection failed, failing open to memory/provider:', err?.message || err);
        }
      });

      client.on('connect', () => {
        this.redisFailedOnce = false;
        console.log('[Redis] Connected successfully to remote Redis cache.');
      });

      // Attempt async background connection
      client.connect().catch((err) => {
        console.error('[Redis Connect Failed] Failing open:', err?.message || err);
      });

      this.redisClient = client;
      return this.redisClient;
    } catch (err: any) {
      console.error('[Redis Init Exception] Failing open:', err?.message || err);
      return null;
    } finally {
      this.isConnectingRedis = false;
    }
  }

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
   * Retrieve cached value.
   * Checks Redis first (if available); if Redis times out or fails, fails open to local in-memory cache.
   */
  async get<T>(key: string): Promise<T | null> {
    // 1. Try Redis first if active
    const client = this.redisClient || this.initRedis();
    if (client && client.status === 'ready') {
      try {
        const raw = await client.get(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (!this.isFailureOrEmpty(parsed)) {
            return parsed as T;
          }
        }
      } catch (err: any) {
        console.error(`[Redis Read Error for ${key}] Failing open:`, err?.message || err);
      }
    }

    // 2. Fail open to local in-memory store
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
   * Store value with MANDATORY TTL expiry.
   * Requirement 4: Stop caching failures. Only cache successful responses.
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

    // Always update local memory store with expiry
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.inMemoryStore.set(key, { value, expiresAt });

    // Also persist to Redis if available
    const client = this.redisClient || this.initRedis();
    if (client && client.status === 'ready') {
      try {
        await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      } catch (err: any) {
        console.error(`[Redis Write Error for ${key}] Failing open to memory:`, err?.message || err);
      }
    }
  }

  /**
   * Busts the cache. Clears both in-memory store and Redis matching keys.
   */
  async bust(pattern?: string): Promise<number> {
    let memoryDeleted = 0;
    if (!pattern) {
      memoryDeleted = this.inMemoryStore.size;
      this.inMemoryStore.clear();
    } else {
      for (const key of Array.from(this.inMemoryStore.keys())) {
        if (key.includes(pattern)) {
          this.inMemoryStore.delete(key);
          memoryDeleted++;
        }
      }
    }

    // Bust Redis keys if connected
    let redisDeleted = 0;
    const client = this.redisClient || this.initRedis();
    if (client && client.status === 'ready') {
      try {
        if (!pattern) {
          await client.flushdb();
        } else {
          const keys = await client.keys(`*${pattern}*`);
          if (keys.length > 0) {
            redisDeleted = await client.del(...keys);
          }
        }
      } catch (err: any) {
        console.error('[Redis Bust Error]', err?.message || err);
      }
    }

    return memoryDeleted + redisDeleted;
  }

  /**
   * Redis health check probe for /api/health
   */
  async ping(): Promise<{ ok: boolean; configured: boolean; latencyMs?: number; error?: string; urlScheme?: string }> {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      return { ok: false, configured: false, error: 'REDIS_URL environment variable is not configured' };
    }

    const urlScheme = redisUrl.startsWith('rediss://') ? 'rediss (TLS)' : 'redis';
    const client = this.redisClient || this.initRedis();

    if (!client) {
      return { ok: false, configured: true, urlScheme, error: 'Failed to initialize Redis client' };
    }

    const t0 = Date.now();
    try {
      const pong = await client.ping();
      return {
        ok: pong === 'PONG',
        configured: true,
        urlScheme,
        latencyMs: Date.now() - t0,
      };
    } catch (err: any) {
      return {
        ok: false,
        configured: true,
        urlScheme,
        latencyMs: Date.now() - t0,
        error: err?.message || 'Redis ping failed',
      };
    }
  }
}

export const serverCache = new ServerCache();
