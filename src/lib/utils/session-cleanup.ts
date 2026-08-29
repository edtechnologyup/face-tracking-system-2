import { prisma } from '@/lib/prisma'
import { getThailandTime, calculateDurationInSeconds } from '@/lib/utils/datetime'

/**
 * เคลียร์และปิดเซสชันที่ค้างอยู่เป็น IN_PROGRESS แต่ไม่มีความเคลื่อนไหวเกิน 120 วินาที
 * ปรับสถานะเป็น DISCONNECTED และบันทึกเวลาจบให้อัตโนมัติ
 * 
 * ตรวจสอบจากหลายแหล่ง: trackingLogs, behaviorFeatureLogs, mediapipeLogs
 * เพื่อป้องกันการปิดเซสชันผู้ใช้ที่ยังเชื่อมต่ออยู่
 */
export async function autoCloseStaleSessions(targetUserId?: string) {
  try {
    const thresholdTime = new Date(Date.now() - 120 * 1000) // 120 วินาทีที่แล้ว (เพิ่มจาก 60 เป็น 120 เพื่อรองรับ network delay)

    const whereCondition: { status: string; startTime: { lt: Date }; userId?: string } = {
      status: 'IN_PROGRESS',
      startTime: {
        lt: thresholdTime
      }
    }

    if (targetUserId) {
      whereCondition.userId = targetUserId
    }

    const staleSessions = await prisma.trackingSession.findMany({
      where: whereCondition,
      include: {
        trackingLogs: {
          orderBy: { timestamp: 'desc' },
          take: 1
        },
        behaviorFeatureLogs: {
          orderBy: { timestamp: 'desc' },
          take: 1
        },
        mediapipeLogs: {
          orderBy: { timestamp: 'desc' },
          take: 1
        }
      }
    })

    const nowTime = getThailandTime()

    for (const session of staleSessions) {
      // Find the most recent activity timestamp across ALL log sources
      let lastActivityTime = new Date(session.startTime)
      
      const timestamps = [
        session.trackingLogs[0]?.timestamp,
        session.behaviorFeatureLogs[0]?.timestamp,
        session.mediapipeLogs[0]?.timestamp,
      ].filter(Boolean).map(t => new Date(t!))

      for (const t of timestamps) {
        if (t > lastActivityTime) lastActivityTime = t
      }

      // หากไม่มีความเคลื่อนไหวล่าสุดเกิน threshold หรือเป็นการบังคับปิดเซสชันเก่าของ user เดียวกัน
      if (lastActivityTime < thresholdTime || targetUserId) {
        const totalDuration = calculateDurationInSeconds(session.startTime, nowTime)
        await prisma.trackingSession.update({
          where: { id: session.id },
          data: {
            endTime: nowTime,
            totalDuration: totalDuration,
            status: 'DISCONNECTED'
          }
        })
        console.log(`🧹 Auto-closed stale session: ${session.id} -> DISCONNECTED`)
      }
    }
  } catch (err) {
    console.error('Error auto-closing stale sessions:', err)
  }
}
