import { PrismaClient } from '@prisma/client'

const urlSrc = "postgresql://postgres.qxgsosixllzuirfkeeof:5EVFVYi4RDZHBt77@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgress?pgbouncer=true"
const urlDest = "postgresql://postgres.qxgsosixllzuirfkeeof:5EVFVYi4RDZHBt77@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"

async function migrate() {
  console.log('🔄 Starting data migration from postgress to postgres...')
  
  const prismaSrc = new PrismaClient({ datasources: { db: { url: urlSrc } } })
  const prismaDest = new PrismaClient({ datasources: { db: { url: urlDest } } })

  try {
    // 1. Migrate Users
    console.log('👥 Migrating Users...')
    const srcUsers = await prismaSrc.user.findMany()
    console.log(`Found ${srcUsers.length} users in source.`)

    for (const user of srcUsers) {
      const existing = await prismaDest.user.findUnique({
        where: { email: user.email }
      })

      if (!existing) {
        await prismaDest.user.create({
          data: user
        })
        console.log(`✅ Copied user: ${user.email}`)
      } else {
        // If it exists but has no face data in dest, update it
        if (!existing.faceData && user.faceData) {
          await prismaDest.user.update({
            where: { email: user.email },
            data: { faceData: user.faceData }
          })
          console.log(`🔄 Updated face data for user: ${user.email}`)
        } else {
          console.log(`ℹ️ User already exists: ${user.email}`)
        }
      }
    }

    // 2. Migrate TrackingSessions
    console.log('📅 Migrating Tracking Sessions...')
    const srcSessions = await prismaSrc.trackingSession.findMany()
    console.log(`Found ${srcSessions.length} sessions in source.`)

    for (const session of srcSessions) {
      const existing = await prismaDest.trackingSession.findUnique({
        where: { id: session.id }
      })

      if (!existing) {
        await prismaDest.trackingSession.create({
          data: session
        })
        console.log(`✅ Copied session: ${session.id}`)
      } else {
        console.log(`ℹ️ Session already exists: ${session.id}`)
      }
    }

    // 3. Migrate TrackingLogs
    console.log('📝 Migrating Tracking Logs...')
    const srcLogs = await prismaSrc.trackingLog.findMany()
    console.log(`Found ${srcLogs.length} logs in source.`)

    for (const log of srcLogs) {
      const existing = await prismaDest.trackingLog.findUnique({
        where: { id: log.id }
      })

      if (!existing) {
        await prismaDest.trackingLog.create({
          data: {
            id: log.id,
            sessionId: log.sessionId,
            detectionType: log.detectionType,
            detectionData: log.detectionData || {},
            confidence: log.confidence,
            timestamp: log.timestamp
          }
        })
      }
    }
    console.log(`✅ Copied all missing tracking logs.`)

    // 4. Migrate SessionStatistics
    console.log('📊 Migrating Session Statistics...')
    const srcStats = await prismaSrc.sessionStatistics.findMany()
    console.log(`Found ${srcStats.length} statistics in source.`)

    for (const stat of srcStats) {
      const existing = await prismaDest.sessionStatistics.findUnique({
        where: { id: stat.id }
      })

      if (!existing) {
        await prismaDest.sessionStatistics.create({
          data: {
            id: stat.id,
            sessionId: stat.sessionId,
            faceOrientationsByDirection: stat.faceOrientationsByDirection || {},
            timeOffScreen: stat.timeOffScreen,
            faceDetectionLoss: stat.faceDetectionLoss,
            totalLossTime: stat.totalLossTime
          }
        })
        console.log(`✅ Copied statistics for session: ${stat.sessionId}`)
      } else {
        console.log(`ℹ️ Statistics already exist for session: ${stat.sessionId}`)
      }
    }

    console.log('🎉 Migration completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error)
  } finally {
    await prismaSrc.$disconnect()
    await prismaDest.$disconnect()
  }
}

migrate()
