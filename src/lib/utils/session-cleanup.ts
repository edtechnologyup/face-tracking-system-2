import { prisma } from '@/lib/prisma'
import { getThailandTime, calculateDurationInSeconds } from '@/lib/utils/datetime'

/**
 * เคลียร์และปิดเซสชันที่ค้างอยู่เป็น IN_PROGRESS แต่ไม่มีความเคลื่อนไหวเกิน 60 วินาที
 * ปรับสถานะเป็น DISCONNECTED และบันทึกเวลาจบให้อัตโนมัติ
 */
export async function autoCloseStaleSessions(targetUserId?: string) {
  try {
    const thresholdTime = new Date(Date.now() - 60 * 1000) // 60 วินาทีที่แล้ว

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
        }
      }
    })

    const nowTime = getThailandTime()

    for (const session of staleSessions) {
      const lastLog = session.trackingLogs[0]
      const lastActivityTime = lastLog ? new Date(lastLog.timestamp) : new Date(session.startTime)

      // หากไม่มีความเคลื่อนไหวล่าสุดเกิน 60 วินาที หรือเป็นการบังคับปิดเซสชันเก่าของ user เดียวกัน
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
