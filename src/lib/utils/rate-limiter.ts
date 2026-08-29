/**
 * Simple Token-Bucket Rate Limiter สำหรับ Vercel Serverless
 * ใช้ in-memory Map + auto cleanup เพื่อป้องกัน memory leak
 * 
 * หมายเหตุ: Rate limit จะ reset เมื่อ serverless function cold start ใหม่
 * ถ้าต้องการ persistent rate limiting ข้าม instances ให้ใช้ Upstash Redis แทน
 */

interface RateLimitEntry {
  tokens: number
  lastRefill: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup entries ที่ไม่ active เกิน 2 นาที เพื่อป้องกัน memory leak
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now - entry.lastRefill > 120_000) {
        store.delete(key)
      }
    }
  }, 60_000)
}

/**
 * ตรวจสอบ rate limit ด้วย token bucket algorithm
 * 
 * @param key - Unique identifier (เช่น userId, IP address)
 * @param maxTokens - จำนวน tokens สูงสุด (burst capacity)
 * @param refillRate - จำนวน tokens ที่เติมต่อวินาที
 * @returns { allowed, remaining } - allowed=true ถ้ายังไม่เกิน limit
 * 
 * @example
 * // Tracking endpoint: อนุญาต 30 requests, เติม 3 tokens/s
 * const { allowed } = rateLimit(`tracking:${userId}`, 30, 3)
 * 
 * // Auth endpoint: อนุญาต 5 requests, เติม 0.1 tokens/s (1 ทุก 10 วินาที)
 * const { allowed } = rateLimit(`auth:${ip}`, 5, 0.1)
 */
export function rateLimit(
  key: string,
  maxTokens: number = 30,
  refillRate: number = 3 // tokens per second
): { allowed: boolean; remaining: number } {
  const now = Date.now()
  let entry = store.get(key)

  if (!entry) {
    entry = { tokens: maxTokens - 1, lastRefill: now }
    store.set(key, entry)
    return { allowed: true, remaining: entry.tokens }
  }

  // Refill tokens ตามเวลาที่ผ่านไป
  const elapsedSeconds = (now - entry.lastRefill) / 1000
  entry.tokens = Math.min(maxTokens, entry.tokens + elapsedSeconds * refillRate)
  entry.lastRefill = now

  if (entry.tokens < 1) {
    return { allowed: false, remaining: 0 }
  }

  entry.tokens -= 1
  return { allowed: true, remaining: Math.floor(entry.tokens) }
}
