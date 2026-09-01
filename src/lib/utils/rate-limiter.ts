/**
 * Token-bucket rate limiter with optional Upstash Redis for multi-instance deployments.
 */

import {
  isRedisRateLimitConfigured,
  redisRateLimitAllowed,
} from '@/lib/utils/redis-rate-limiter';

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

const store = new Map<string, RateLimitEntry>();

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.lastRefill > 120_000) {
        store.delete(key);
      }
    }
  }, 60_000);
}

function inMemoryRateLimit(
  key: string,
  maxTokens: number,
  refillRate: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { tokens: maxTokens - 1, lastRefill: now };
    store.set(key, entry);
    return { allowed: true, remaining: entry.tokens };
  }

  const elapsedSeconds = (now - entry.lastRefill) / 1000;
  entry.tokens = Math.min(maxTokens, entry.tokens + elapsedSeconds * refillRate);
  entry.lastRefill = now;

  if (entry.tokens < 1) {
    return { allowed: false, remaining: 0 };
  }

  entry.tokens -= 1;
  return { allowed: true, remaining: Math.floor(entry.tokens) };
}

/** Sync in-memory limiter (legacy). */
export function rateLimit(
  key: string,
  maxTokens: number = 30,
  refillRate: number = 3
): { allowed: boolean; remaining: number } {
  return inMemoryRateLimit(key, maxTokens, refillRate);
}

export interface RateLimitCheckOptions {
  key: string;
  /** Burst capacity (in-memory token bucket). */
  maxTokens: number;
  /** Tokens refilled per second (in-memory). */
  refillRate: number;
  /** Redis fixed-window max requests (when UPSTASH_* configured). */
  redisMaxRequests?: number;
  /** Redis window seconds (default 60). */
  redisWindowSeconds?: number;
}

/**
 * Prefer Redis when configured; otherwise in-memory token bucket.
 * Both layers must pass when Redis is active (defense in depth).
 */
export async function checkRateLimit(
  options: RateLimitCheckOptions
): Promise<{ allowed: boolean; remaining: number; backend: 'redis' | 'memory' | 'both' }> {
  const {
    key,
    maxTokens,
    refillRate,
    redisMaxRequests = maxTokens * 2,
    redisWindowSeconds = 60,
  } = options;

  const memory = inMemoryRateLimit(key, maxTokens, refillRate);

  if (!isRedisRateLimitConfigured()) {
    return { ...memory, backend: 'memory' };
  }

  const redisAllowed = await redisRateLimitAllowed(
    `rl:${key}`,
    redisMaxRequests,
    redisWindowSeconds
  );

  if (redisAllowed === null) {
    return { ...memory, backend: 'memory' };
  }

  const allowed = memory.allowed && redisAllowed;
  return {
    allowed,
    remaining: memory.remaining,
    backend: 'both',
  };
}

/** Pre-tuned limits for ~90 concurrent exam sessions. */
export const RATE_LIMITS = {
  behaviorFeatures: { maxTokens: 60, refillRate: 6, redisMaxRequests: 120 },
  orientation: { maxTokens: 24, refillRate: 2, redisMaxRequests: 48 },
  snapshotAnalytics: { maxTokens: 20, refillRate: 2, redisMaxRequests: 40 },
  openfaceAnalyze: { maxTokens: 15, refillRate: 0.5, redisMaxRequests: 30 },
  login: { maxTokens: 5, refillRate: 0.1, redisMaxRequests: 10 },
} as const;
