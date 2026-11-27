import { NextResponse } from 'next/server';

interface RateLimitBucket {
  timestamps: number[];
}

declare global {
  var __calibrallRateLimits: Map<string, RateLimitBucket> | undefined;
}

function getRateLimitStore(): Map<string, RateLimitBucket> {
  if (!globalThis.__calibrallRateLimits) {
    globalThis.__calibrallRateLimits = new Map();
  }
  return globalThis.__calibrallRateLimits;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  errorResponse?: NextResponse;
}

export function checkRateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
  message?: string;
}): RateLimitResult {
  const { key, limit, windowMs, message } = options;
  const store = getRateLimitStore();
  const now = Date.now();
  const cutoff = now - windowMs;

  // Periodic cleanup if map grows large
  if (store.size > 1000) {
    for (const [k, v] of store.entries()) {
      const kept = v.timestamps.filter((t) => t > cutoff);
      if (kept.length === 0) store.delete(k);
      else v.timestamps = kept;
    }
  }

  const bucket = store.get(key) || { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= limit) {
    const oldestInWindow = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));
    store.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec,
      errorResponse: NextResponse.json(
        {
          error: message || `Rate limit exceeded. Try again in ${retryAfterSec}s.`,
          code: 'RATE_LIMITED',
          retryAfterSec,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSec),
            'Cache-Control': 'no-store, max-age=0',
          },
        }
      ),
    };
  }

  bucket.timestamps.push(now);
  store.set(key, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.timestamps.length),
    retryAfterSec: 0,
  };
}

export function resetRateLimitStoreForTests(): void {
  getRateLimitStore().clear();
}
