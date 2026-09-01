/**
 * Distributed rate limiting via Upstash Redis REST API.
 * Falls back to null when env vars are missing (caller uses in-memory limiter).
 */

interface RedisCommandResult {
  result: number | string | null;
}

async function redisCommand(
  command: (string | number)[]
): Promise<number | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RedisCommandResult;
    return typeof data.result === 'number' ? data.result : null;
  } catch {
    return null;
  }
}

/** Fixed-window counter — returns current count in window or null if Redis unavailable. */
export async function redisFixedWindowCount(
  key: string,
  windowSeconds: number
): Promise<number | null> {
  const windowKey = `${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const count = await redisCommand(['INCR', windowKey]);
  if (count === 1) {
    await redisCommand(['EXPIRE', windowKey, windowSeconds]);
  }
  return count;
}

export function isRedisRateLimitConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export async function redisRateLimitAllowed(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<boolean | null> {
  const count = await redisFixedWindowCount(key, windowSeconds);
  if (count === null) return null;
  return count <= maxRequests;
}
