import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import jwt from 'jsonwebtoken'

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
  benchmarkMetrics?: Record<string, unknown>;
}

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
        if (!event.isActive && event.endTime && event.duration) {
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

    // 4. เพิ่ม Live Benchmark Matrix Metrics Event (4 Models)
    if (benchmarkMetrics) {
      const bm = benchmarkMetrics as Record<string, { confidence?: number }>
      logsData.push({
        sessionId: sessionId,
        detectionType: 'BENCHMARK_METRICS',
        detectionData: benchmarkMetrics as unknown as Prisma.InputJsonObject,
        confidence: bm.mediapipe?.confidence || 0.98
      })
      console.log(`⚡ บันทึกข้อมูล Live Benchmark Metrics (4 Models) ลงฐานข้อมูล`)
    }

    // 5. ทำการบันทึกข้อมูลอย่างถูกต้อง (ลบ log เก่าของ session เพื่อกันข้อมูลซ้ำจากการ auto-sync แล้วลง log ชุดใหม่ล่าสุด)
    let logsCreated = 0

    await prisma.trackingLog.deleteMany({
      where: { sessionId: sessionId }
    })

    if (logsData.length > 0) {
      const batchResult = await prisma.trackingLog.createMany({
        data: logsData
      })
      logsCreated = batchResult.count
    }

    // บันทึกลงตารางโมเดลแยกแต่ละตัว (MediaPipe, YOLOv8, Dlib, OpenFace)
    if (benchmarkMetrics) {
      const bm = benchmarkMetrics as Record<string, {
        fps?: number
        latencyMs?: number
        landmarksCount?: number
        memoryMb?: number
        cpuLoadPct?: number
        confidence?: number
        isDetected?: boolean
      }>

      // ข้อมูล log ของโมเดลแยกจะถูกบันทึกเพิ่มเข้าไปเรื่อยๆ (เก็บต่อเนื่อง)

      if (bm.mediapipe) {
        await prisma.mediaPipeLog.create({
          data: {
            sessionId,
            fps: bm.mediapipe.fps,
            latencyMs: bm.mediapipe.latencyMs,
            landmarksCount: bm.mediapipe.landmarksCount ?? 468,
            memoryMb: bm.mediapipe.memoryMb,
            cpuLoadPct: bm.mediapipe.cpuLoadPct,
            confidence: bm.mediapipe.confidence,
            isDetected: bm.mediapipe.isDetected ?? true
          }
        })
      }

      if (bm.yolov8) {
        await prisma.yolov8Log.create({
          data: {
            sessionId,
            fps: bm.yolov8.fps,
            latencyMs: bm.yolov8.latencyMs,
            landmarksCount: bm.yolov8.landmarksCount ?? 5,
            memoryMb: bm.yolov8.memoryMb,
            cpuLoadPct: bm.yolov8.cpuLoadPct,
            confidence: bm.yolov8.confidence,
            isDetected: bm.yolov8.isDetected ?? true
          }
        })
      }

      if (bm.dlib) {
        await prisma.dlibLog.create({
          data: {
            sessionId,
            fps: bm.dlib.fps,
            latencyMs: bm.dlib.latencyMs,
            landmarksCount: bm.dlib.landmarksCount ?? 68,
            memoryMb: bm.dlib.memoryMb,
            cpuLoadPct: bm.dlib.cpuLoadPct,
            confidence: bm.dlib.confidence,
            isDetected: bm.dlib.isDetected ?? true
          }
        })
      }

      if (bm.openface) {
        await prisma.openFaceLog.create({
          data: {
            sessionId,
            fps: bm.openface.fps,
            latencyMs: bm.openface.latencyMs,
            landmarksCount: bm.openface.landmarksCount ?? 68,
            memoryMb: bm.openface.memoryMb,
            cpuLoadPct: bm.openface.cpuLoadPct,
            confidence: bm.openface.confidence,
            isDetected: bm.openface.isDetected ?? true
          }
        })
      }
    }

    // อัปเดตหรือสร้าง SessionStatistics
    const existingStats = await prisma.sessionStatistics.findUnique({
      where: { sessionId: sessionId }
    })

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

    let sessionStatistics
    if (existingStats) {
      // อัปเดตสถิติที่มีอยู่
      sessionStatistics = await prisma.sessionStatistics.update({
        where: { sessionId: sessionId },
        data: statsData
      })
    } else {
      // สร้างสถิติใหม่
      sessionStatistics = await prisma.sessionStatistics.create({
        data: {
          sessionId: sessionId,
          ...statsData
        }
      })
    }

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