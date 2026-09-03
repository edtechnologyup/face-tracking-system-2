import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Vercel serverless: each function instance opens its own Prisma pool.
 * Keep connection_limit=1 so N concurrent lambdas do not exhaust Supabase
 * (default Prisma pool was 5 → connection pool timeout under exam load).
 * Prefer DATABASE_URL pointing at the Supabase pooler (port 6543) + pgbouncer=true.
 */
function resolveDatasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL
  if (!raw) return undefined

  try {
    const url = new URL(raw)
    if (!url.searchParams.has('connection_limit')) {
      // One connection per serverless isolate — scale via more isolates, not bigger pools
      url.searchParams.set('connection_limit', '1')
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '10')
    }
    // Transaction mode pooler (Supabase): required for Prisma + PgBouncer
    if (
      (url.port === '6543' || url.hostname.includes('pooler.supabase')) &&
      !url.searchParams.has('pgbouncer')
    ) {
      url.searchParams.set('pgbouncer', 'true')
    }
    return url.toString()
  } catch {
    return raw
  }
}

const datasourceUrl = resolveDatasourceUrl()

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    ...(datasourceUrl
      ? { datasources: { db: { url: datasourceUrl } } }
      : {}),
  })

// Cache client across warm invocations in the same isolate
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
else globalForPrisma.prisma = prisma
