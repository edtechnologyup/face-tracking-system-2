import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import jwt from 'jsonwebtoken'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    // ตรวจสอบ Authorization header
    const authorization = request.headers.get('authorization')
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'ไม่พบ token การยืนยันตัวตน' },
        { status: 401 }
      )
    }

    const token = authorization.substring(7)

    // ตรวจสอบ JWT token
    let decoded: { userId: string; role: string }
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as { userId: string; role: string }
    } catch {
      return NextResponse.json(
        { error: 'Token ไม่ถูกต้องหรือหมดอายุ' },
        { status: 401 }
      )
    }

    // ตรวจสอบสิทธิ์ admin
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true }
    })

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' },
        { status: 403 }
      )
    }

    // Await params สำหรับ Next.js 15
    const { sessionId } = await params

    // ตรวจสอบว่า session นี้มีอยู่จริง
    const session = await prisma.trackingSession.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            studentId: true,
            section: true
          }
        },
        mediapipeLogs: true,
        yolov8Logs: true,
        dlibLogs: true,
        openFaceLogs: true
      }
    })

    if (!session) {
      return NextResponse.json(
        { error: 'ไม่พบเซสชันที่ระบุ' },
        { status: 404 }
      )
    }

    // ดึงข้อมูล logs ของ session นี้
    const logs = await prisma.trackingLog.findMany({
      where: {
        sessionId: sessionId
      },
    })

    // คำนวณสถิติตาม DetectionType ที่มีจริง
    const faceOrientationLogs = logs.filter(log => log.detectionType === 'FACE_ORIENTATION')
    const faceDetectionLossLogs = logs.filter(log => log.detectionType === 'FACE_DETECTION_LOSS')
    const securityViolationLogs = logs.filter(log => log.detectionType === 'SECURITY_VIOLATION')
    
    // นับประเภท Security Violations
    const violationCounts = {
      MULTI_FACE_DETECTED: 0,
      LOOKING_AWAY_EXCEEDED: 0,
      FACE_LOSS: 0,
      CRITICAL: 0,
      WARNING: 0
    }

    securityViolationLogs.forEach(log => {
      if (log.detectionData && typeof log.detectionData === 'object' && !Array.isArray(log.detectionData)) {
        const data = log.detectionData as Record<string, unknown>
        const vType = data.violationType as string
        const severity = data.severity as string
        if (vType === 'MULTI_FACE_DETECTED') violationCounts.MULTI_FACE_DETECTED++
        if (vType === 'LOOKING_AWAY_EXCEEDED') violationCounts.LOOKING_AWAY_EXCEEDED++
        if (vType === 'FACE_LOSS') violationCounts.FACE_LOSS++
        if (severity === 'CRITICAL') violationCounts.CRITICAL++
        if (severity === 'WARNING') violationCounts.WARNING++
      }
    })

    // นับทิศทางและเวลาจาก detectionData
    const directionCounts = {
      UP: 0,
      DOWN: 0,
      LEFT: 0,
      RIGHT: 0,
      FORWARD: 0
    }
    
    const directionDurations = {
      UP: 0,
      DOWN: 0,
      LEFT: 0,
      RIGHT: 0,
      FORWARD: 0
    }
    
    faceOrientationLogs.forEach(log => {
      if (log.detectionData && typeof log.detectionData === 'object' && 'direction' in log.detectionData) {
        const direction = log.detectionData.direction as keyof typeof directionCounts
        if (directionCounts.hasOwnProperty(direction)) {
          directionCounts[direction]++
          // เพิ่มระยะเวลาถ้ามี duration
          if ('duration' in log.detectionData && typeof log.detectionData.duration === 'number') {
            directionDurations[direction] += log.detectionData.duration
          }
        }
      }
    })

    // คำนวณเวลารวม
    const totalBehaviorDuration = Object.values(directionDurations).reduce((sum, duration) => sum + duration, 0)

    const stats = {
      totalLogs: logs.length,
      faceOrientationCount: faceOrientationLogs.length,
      faceDetectionLossCount: faceDetectionLossLogs.length,
      securityViolationCount: securityViolationLogs.length,
      violationCounts,
      directionCounts,
      directionDurations,
      totalBehaviorDuration,
      averageConfidence: logs.filter(log => log.confidence !== null)
        .reduce((sum, log, _, arr) => arr.length > 0 ? sum + (log.confidence || 0) / arr.length : 0, 0)
    }

    return NextResponse.json({
      session,
      logs,
      stats
    })

  } catch (error) {
    console.error('Admin session logs error:', error)
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' },
      { status: 500 }
    )
  }
}