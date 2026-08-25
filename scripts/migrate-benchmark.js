const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('Testing DB connection and executing database schema updates...')

  try {
    // 1. Add BENCHMARK_METRICS enum value
    await prisma.$executeRawUnsafe(`ALTER TYPE "DetectionType" ADD VALUE IF NOT EXISTS 'BENCHMARK_METRICS';`)
    console.log('✅ Added BENCHMARK_METRICS to DetectionType enum in PostgreSQL')
  } catch (e) {
    console.warn('⚠️ Enum alter note:', e.message)
  }

  try {
    // 2. Add benchmarkMetrics column & model confidence columns to session_statistics table
    await prisma.$executeRawUnsafe(`ALTER TABLE "session_statistics" ADD COLUMN IF NOT EXISTS "benchmarkMetrics" JSONB;`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "session_statistics" ADD COLUMN IF NOT EXISTS "mediapipeConfidence" DOUBLE PRECISION;`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "session_statistics" ADD COLUMN IF NOT EXISTS "yolov8Confidence" DOUBLE PRECISION;`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "session_statistics" ADD COLUMN IF NOT EXISTS "dlibConfidence" DOUBLE PRECISION;`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "session_statistics" ADD COLUMN IF NOT EXISTS "openfaceConfidence" DOUBLE PRECISION;`)
    console.log('✅ Added benchmarkMetrics and 4 model confidence columns to session_statistics table in PostgreSQL')
  } catch (e) {
    console.warn('⚠️ session_statistics alter note:', e.message)
  }

  try {
    // 3. Add model confidence columns to tracking_logs table
    await prisma.$executeRawUnsafe(`ALTER TABLE "tracking_logs" ADD COLUMN IF NOT EXISTS "mediapipeConfidence" DOUBLE PRECISION;`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "tracking_logs" ADD COLUMN IF NOT EXISTS "yolov8Confidence" DOUBLE PRECISION;`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "tracking_logs" ADD COLUMN IF NOT EXISTS "dlibConfidence" DOUBLE PRECISION;`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "tracking_logs" ADD COLUMN IF NOT EXISTS "openfaceConfidence" DOUBLE PRECISION;`)
    console.log('✅ Added 4 model confidence columns to tracking_logs table in PostgreSQL')
  } catch (e) {
    console.warn('⚠️ tracking_logs alter note:', e.message)
  }

  console.log('Database migration script finished successfully.')
}

main()
  .catch(e => {
    console.error('❌ Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
