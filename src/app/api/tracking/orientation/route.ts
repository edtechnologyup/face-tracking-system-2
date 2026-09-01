import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { rateLimit } from '@/lib/utils/rate-limiter'
import { SUSTAINED_DURATION_SEC } from '@/lib/mediapipe-detector'
import {
  benchmarkMetricToDbBase,
  type MultiEngineBenchmarkPayload,
} from '@/lib/engine-benchmark'

// Interface สำหรับ request body
interface OrientationEvent {
  startTime: string;
  endTime?: string;
  direction: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';
  duration?: number;
  maxYaw?: number;
  maxPitch?: number;
  confidence?: number;
  isActive: boolean;
}

interface SecurityViolationItem {
  id?: string;
  type: string; // 'MULTI_FACE_DETECTED' | 'LOOKING_AWAY_EXCEEDED' | 'FACE_LOSS' | 'FACE_MISMATCH' etc.
  message: string;
  timestamp: string;
  severity: 'WARNING' | 'CRITICAL';
  faceCount?: number;
  duration?: number;
  details?: Record<string, unknown>;
}

interface OrientationLogRequest {
  sessionId: string;
  events: OrientationEvent[];
  sessionStats: {
    totalEvents: number;
    leftTurns: { count: number; totalDuration: number };
    rightTurns: { count: number; totalDuration: number };
    lookingUp: { count: number; totalDuration: number };
    lookingDown: { count: number; totalDuration: number };
    centerTime: number;
    sessionStartTime: string;
    lastEventTime?: string;
  };
  faceDetectionLoss?: {
    lossCount: number;
    totalLossTime: number;
  };
  faceDetectionLossEvents?: Array<{
    startTime: string;
    endTime?: string;
    duration?: number;
    isActive: boolean;
    isMismatch?: boolean;
    reason?: string;
  }>;
  securityViolations?: SecurityViolationItem[];
  benchmarkMetrics?: MultiEngineBenchmarkPayload;
}

// CBMI Parameter Adjustment Guide: ข้าม event ที่มีระยะเวลาสั้นกว่า SUSTAINED_DURATION_SEC ก่อนบันทึกลงฐานข้อมูล

// บันทึกข้อมูล orientation tracking
export async function POST(request: NextRequest) {
  try {
    // ตรวจสอบ authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'ไม่พบ authorization header' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    let userId: string

    const JWT_SECRET = process.env.JWT_SECRET
    if (!JWT_SECRET) {
      return NextResponse.json({ error: 'ไม่ได้ตั้งค่า JWT_SECRET' }, { status: 500 })
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
      userId = decoded.userId
    } catch {
      return NextResponse.json({ error: 'Token ไม่ถูกต้อง' }, { status: 401 })
    }

    // Rate limiting: จำกัด 10 requests per user, refill 1 token/s (ปกติเรียกทุก 15 วินาที)
    const { allowed } = rateLimit(`orientation:${userId}`, 10, 1)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const body: OrientationLogRequest = await request.json()
    const { sessionId, events, sessionStats, faceDetectionLoss, faceDetectionLossEvents, securityViolations, benchmarkMetrics } = body

    // ตรวจสอบว่า session มีอยู่และเป็นของ user คนนี้
    const session = await prisma.trackingSession.findFirst({
      where: {
        id: sessionId,
        userId: userId
      }
    })

    if (!session) {
      return NextResponse.json({ error: 'ไม่พบ session หรือไม่มีสิทธิ์เข้าถึง' }, { status: 404 })
    }

    // เตรียมข้อมูล logs ทั้งหมด
    const logsData: Prisma.TrackingLogCreateManyInput[] = []

    // 1. เพิ่ม orientation events
    events.forEach(event => {
      // ข้าม event ที่ duration สั้นกว่าเกณฑ์ Sustained Duration ก่อนบันทึกลงฐานข้อมูล
      if (typeof event.duration === 'number' && event.duration < SUSTAINED_DURATION_SEC) {
        return
      }
      logsData.push({
        sessionId: sessionId,
        detectionType: 'FACE_ORIENTATION',
        detectionData: {
          direction: event.direction,
          startTime: event.startTime,
          endTime: event.endTime,
          duration: event.duration,
          maxYaw: event.maxYaw,
          maxPitch: event.maxPitch
        },
        confidence: typeof event.confidence === 'number' ? event.confidence : 0.95
      })
    })

    // 2. เพิ่ม face detection loss events
    let lossLogsCount = 0
    if (faceDetectionLossEvents && faceDetectionLossEvents.length > 0) {
      faceDetectionLossEvents.forEach(event => {
        if (!event.isActive && event.endTime && event.duration && event.duration >= SUSTAINED_DURATION_SEC) {
          logsData.push({
            sessionId: sessionId,
            detectionType: 'FACE_DETECTION_LOSS',
            detectionData: {
              startTime: event.startTime,
              endTime: event.endTime,
              duration: event.duration,
              isMismatch: event.isMismatch || false,
              reason: event.reason || undefined
            },
            confidence: 1.0 // การไม่พบใบหน้าเป็นข้อมูลที่แน่นอน
          })
          lossLogsCount++
        }
      })
      console.log(`🚨 ตรวจพบ Face Detection Loss: ${lossLogsCount} events, รวม ${faceDetectionLoss?.totalLossTime || 0} วินาที`)
    }

    // 3. เพิ่ม Security Violation Events
    let securityViolationLogsCount = 0
    if (securityViolations && securityViolations.length > 0) {
      securityViolations.forEach(v => {
        const violationData: Prisma.InputJsonObject = {
          violationType: v.type,
          message: v.message,
          severity: v.severity,
          timestamp: v.timestamp,
          faceCount: v.faceCount || null,
          duration: v.duration || null
        }

        logsData.push({
          sessionId: sessionId,
          detectionType: 'SECURITY_VIOLATION',
          detectionData: violationData,
          confidence: v.severity === 'CRITICAL' ? 0.99 : 0.85
        })
        securityViolationLogsCount++
      })
      console.log(`🚨 ตรวจพบ Security Violations: ${securityViolationLogsCount} รายการ`)
    }

    // 5. บันทึกข้อมูลแบบ append-only (เพิ่มเฉพาะ events ใหม่ที่ยังไม่เคยบันทึก)
    // แทนที่ delete+create ทั้งหมดทุกรอบ เพื่อลด write amplification สำหรับ 100+ users พร้อมกัน
    let logsCreated = 0

    if (logsData.length > 0) {
      // ดึง timestamp ของ log ล่าสุดที่เคยบันทึกไว้ เพื่อกรองเฉพาะ events ใหม่
      const lastLog = await prisma.trackingLog.findFirst({
        where: { 
          sessionId: sessionId,
          detectionType: {
            in: ['FACE_ORIENTATION', 'FACE_DETECTION_LOSS', 'SECURITY_VIOLATION']
          }
        },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true }
      })

      // กรองเฉพาะ events ที่มี startTime ใหม่กว่า log ล่าสุด
      const lastTimestamp = lastLog?.timestamp || new Date(0)
      const newLogsData = logsData.filter(log => {
        const detectionData = log.detectionData as Record<string, unknown> | null
        if (detectionData && typeof detectionData === 'object') {
          const startTimeStr = (detectionData as Record<string, unknown>).startTime as string | undefined
          const timestampStr = (detectionData as Record<string, unknown>).timestamp as string | undefined
          const eventTime = startTimeStr ? new Date(startTimeStr) : 
                           timestampStr ? new Date(timestampStr) : new Date()
          return eventTime > lastTimestamp
        }
        return true // ถ้าไม่มี detectionData ให้บันทึกไว้ก่อน
      })

      if (newLogsData.length > 0) {
        const batchResult = await prisma.trackingLog.createMany({
          data: newLogsData
        })
        logsCreated = batchResult.count
      }
    }

    // บันทึกลงตารางโมเดลแยกแต่ละตัว — เฉพาะ synced snapshot (4 engine, frame เดียวกัน)
    if (benchmarkMetrics) {
      const bm = benchmarkMetrics
      const snapshotId = bm.snapshotId
      if (!snapshotId) {
        console.warn('[orientation] benchmarkMetrics missing snapshotId — skip model logs')
      } else if (!bm.snapshotSynced) {
        console.warn(
          '[orientation] benchmark snapshot not synced across 4 engines — skip model logs (need OpenFace server)'
        )
      } else {
        const snapshotSynced = true
        const benchmarkPromises = []

        if (bm.mediapipe) {
          benchmarkPromises.push(
            prisma.mediaPipeLog.create({
              data: {
                sessionId,
                ...benchmarkMetricToDbBase(bm.mediapipe, snapshotId, snapshotSynced),
              },
            })
          )
        }

        if (bm.yolov8) {
          benchmarkPromises.push(
            prisma.yolov8Log.create({
              data: {
                sessionId,
                ...benchmarkMetricToDbBase(bm.yolov8, snapshotId, snapshotSynced),
              },
            })
          )
        }

        if (bm.dlib) {
          benchmarkPromises.push(
            prisma.dlibLog.create({
              data: {
                sessionId,
                ...benchmarkMetricToDbBase(bm.dlib, snapshotId, snapshotSynced),
              },
            })
          )
        }

        if (bm.openface) {
          benchmarkPromises.push(
            prisma.openFaceLog.create({
              data: {
                sessionId,
                ...benchmarkMetricToDbBase(bm.openface, snapshotId, snapshotSynced),
                serverLatencyMs: bm.openface.serverLatencyMs ?? null,
                resultAgeMs:
                  bm.openface.resultAgeMs != null
                    ? Math.round(bm.openface.resultAgeMs)
                    : null,
              },
            })
          )
        }

        if (benchmarkPromises.length > 0) {
          await Promise.all(benchmarkPromises)
        }
      }
    }

    // อัปเดตหรือสร้าง SessionStatistics (ใช้ upsert แทน findUnique + if/else เพื่อลด query จาก 2 เหลือ 1)
    // === FACE TRACKING SUMMARY (No Duplicated Data) ===
    const statsData = {
      // Face orientation counts only - ข้อมูลสรุปจำนวนครั้ง
      faceOrientationsByDirection: {
        LEFT: sessionStats.leftTurns.count,
        RIGHT: sessionStats.rightTurns.count,
        UP: sessionStats.lookingUp.count,
        DOWN: sessionStats.lookingDown.count
      },
      
      // Time summary - ข้อมูลสรุปเวลา
      timeOffScreen: sessionStats.leftTurns.totalDuration + 
                     sessionStats.rightTurns.totalDuration + 
                     sessionStats.lookingUp.totalDuration + 
                     sessionStats.lookingDown.totalDuration,
      
      // Face detection loss summary
      faceDetectionLoss: faceDetectionLoss?.lossCount || 0,
      totalLossTime: faceDetectionLoss?.totalLossTime || 0,

      // Security violations summary
      securityViolationCount: securityViolationLogsCount,

      // Live Benchmark Matrix Summary (4 AI Engines: MediaPipe, YOLOv8-Face, Dlib 68-Point, OpenFace)
      benchmarkMetrics: benchmarkMetrics ? (benchmarkMetrics as unknown as Prisma.InputJsonValue) : undefined
    }

    const sessionStatistics = await prisma.sessionStatistics.upsert({
      where: { sessionId: sessionId },
      update: statsData,
      create: {
        sessionId: sessionId,
        ...statsData
      }
    })

    console.log(`✅ บันทึก logs ทั้งหมด ${logsCreated} รายการ สำหรับ session ${sessionId}`)
    
    return NextResponse.json({
      success: true,
      message: `บันทึก logs ทั้งหมด ${logsCreated} รายการ สำเร็จ`,
      data: {
        logsCreated: logsCreated,
        orientationLogsCreated: events.length,
        faceDetectionLossLogCreated: lossLogsCount,
        sessionStatistics: sessionStatistics,
        summary: {
          totalEvents: sessionStats.totalEvents,
          totalDurationOffScreen: sessionStats.leftTurns.totalDuration + 
                                   sessionStats.rightTurns.totalDuration + 
                                   sessionStats.lookingUp.totalDuration + 
                                   sessionStats.lookingDown.totalDuration,
          faceDetectionLoss: {
            count: faceDetectionLoss?.lossCount || 0,
            totalTime: faceDetectionLoss?.totalLossTime || 0
          },
          breakdown: {
            left: `${sessionStats.leftTurns.count} ครั้ง (${sessionStats.leftTurns.totalDuration}วิ)`,
            right: `${sessionStats.rightTurns.count} ครั้ง (${sessionStats.rightTurns.totalDuration}วิ)`,
            up: `${sessionStats.lookingUp.count} ครั้ง (${sessionStats.lookingUp.totalDuration}วิ)`,
            down: `${sessionStats.lookingDown.count} ครั้ง (${sessionStats.lookingDown.totalDuration}วิ)`
          }
        }
      }
    })
    
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการบันทึก orientation data:', error)
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' },
      { status: 500 }
    )
  }
}

// ดึงข้อมูล orientation logs ของ session
export async function GET(request: NextRequest) {
  try {
    // ตรวจสอบ authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'ไม่พบ authorization header' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    let userId: string

    const JWT_SECRET = process.env.JWT_SECRET
    if (!JWT_SECRET) {
      return NextResponse.json({ error: 'ไม่ได้ตั้งค่า JWT_SECRET' }, { status: 500 })
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
      userId = decoded.userId
    } catch {
      return NextResponse.json({ error: 'Token ไม่ถูกต้อง' }, { status: 401 })
    }

    // ดึง sessionId จาก query parameters
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'ไม่พบ sessionId' }, { status: 400 })
    }

    // ตรวจสอบว่า session เป็นของ user คนนี้
    const session = await prisma.trackingSession.findFirst({
      where: {
        id: sessionId,
        userId: userId
      }
    })

    if (!session) {
      return NextResponse.json({ error: 'ไม่พบ session หรือไม่มีสิทธิ์เข้าถึง' }, { status: 404 })
    }

    // ดึงข้อมูล orientation logs
    const orientationLogs = await prisma.trackingLog.findMany({
      where: {
        sessionId: sessionId,
        detectionType: 'FACE_ORIENTATION'
      },
      orderBy: {
        id: 'asc'
      }
    })

    // ดึงสถิติของ session
    const statistics = await prisma.sessionStatistics.findUnique({
      where: { sessionId: sessionId }
    })

    return NextResponse.json({
      success: true,
      data: {
        session: {
          id: session.id,
          sessionName: session.sessionName,
          startTime: session.startTime,
          endTime: session.endTime,
          totalDuration: session.totalDuration
        },
        orientationLogs: orientationLogs,
        statistics: statistics,
        summary: {
          totalLogs: orientationLogs.length,
          timeRange: {
            start: session.startTime,
            end: session.endTime
          }
        }
      }
    })
    
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการดึงข้อมูل orientation logs:', error)
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' },
      { status: 500 }
    )
  }
}