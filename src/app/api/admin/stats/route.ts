import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import jwt from 'jsonwebtoken'

import { autoCloseStaleSessions } from '@/lib/utils/session-cleanup'

export async function GET(request: NextRequest) {
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

    const JWT_SECRET = process.env.JWT_SECRET
    if (!JWT_SECRET) {
      return NextResponse.json(
        { error: 'ไม่ได้ตั้งค่า JWT_SECRET' },
        { status: 500 }
      )
    }

    // ตรวจสอบ JWT token
    let decoded: { userId: string; role: string }
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string }
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

    // เคลียร์และปิดเซสชันที่ค้างเกิน 60 วินาทีให้อัตโนมัติก่อนประมวลผลสถิติ
    await autoCloseStaleSessions()

    // ดึงข้อมูลสถิติพื้นฐาน (ใช้ count ซึ่งเป็น DB aggregation อยู่แล้ว)
    const [totalUsers, totalAdmins, totalSessions, activeSessions, interruptedSessions] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.trackingSession.count(),
      prisma.trackingSession.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.trackingSession.count({ where: { status: 'DISCONNECTED' } })
    ])

    // ใช้ raw SQL ที่อ้างอิงชื่อตารางถูกต้อง ("tracking_logs") เพื่อ aggregate ข้อมูลพฤติกรรมบน database
    let orientationAgg: Array<{ direction: string; count: number; total_time: number }> = []
    let faceLossAgg: Array<{ count: number; total_time: number }> = []

    try {
      orientationAgg = await prisma.$queryRaw<
        Array<{ direction: string; count: number; total_time: number }>
      >`
        SELECT 
          "detectionData"->>'direction' as direction,
          COUNT(*)::integer as count,
          COALESCE(SUM(
            CASE 
              WHEN jsonb_typeof("detectionData"->'duration') = 'number' 
                THEN ("detectionData"->>'duration')::double precision
              WHEN jsonb_typeof("detectionData"->'duration') = 'string' 
                THEN ("detectionData"->>'duration')::double precision
              ELSE 0
            END
          ), 0)::double precision as total_time
        FROM "tracking_logs"
        WHERE "detectionType" = 'FACE_ORIENTATION'
          AND "detectionData"->>'direction' IS NOT NULL
        GROUP BY "detectionData"->>'direction'
      `

      faceLossAgg = await prisma.$queryRaw<
        Array<{ count: number; total_time: number }>
      >`
        SELECT 
          COUNT(*)::integer as count,
          COALESCE(SUM(
            CASE 
              WHEN jsonb_typeof("detectionData"->'duration') = 'number' 
                THEN ("detectionData"->>'duration')::double precision
              WHEN jsonb_typeof("detectionData"->'duration') = 'string' 
                THEN ("detectionData"->>'duration')::double precision
              ELSE 0
            END
          ), 0)::double precision as total_time
        FROM "tracking_logs"
        WHERE "detectionType" = 'FACE_DETECTION_LOSS'
      `
    } catch (sqlError) {
      console.error('SQL aggregation warning:', sqlError)
    }

    // แปลงผลลัพธ์จาก DB aggregation เป็น behaviorCounts
    const behaviorCounts = {
      leftTurn: { count: 0, totalTime: 0 },
      rightTurn: { count: 0, totalTime: 0 },
      lookDown: { count: 0, totalTime: 0 },
      lookUp: { count: 0, totalTime: 0 },
      faceLoss: { count: 0, totalTime: 0 }
    }

    for (const row of orientationAgg) {
      const count = Number(row.count) || 0
      const totalTime = Number(row.total_time) || 0

      switch (row.direction) {
        case 'LEFT':
        case 'หันซ้าย':
          behaviorCounts.leftTurn.count += count
          behaviorCounts.leftTurn.totalTime += totalTime
          break
        case 'RIGHT':
        case 'หันขวา':
          behaviorCounts.rightTurn.count += count
          behaviorCounts.rightTurn.totalTime += totalTime
          break
        case 'DOWN':
        case 'ก้มหน้า':
          behaviorCounts.lookDown.count += count
          behaviorCounts.lookDown.totalTime += totalTime
          break
        case 'UP':
        case 'เงยหน้า':
          behaviorCounts.lookUp.count += count
          behaviorCounts.lookUp.totalTime += totalTime
          break
      }
    }

    if (faceLossAgg.length > 0) {
      behaviorCounts.faceLoss.count = Number(faceLossAgg[0].count) || 0
      behaviorCounts.faceLoss.totalTime = Number(faceLossAgg[0].total_time) || 0
    }

    // เตรียมข้อมูลกราฟ
    const chartData = [
      {
        behavior: 'หันซ้าย',
        count: behaviorCounts.leftTurn.count,
        totalTime: Math.round(behaviorCounts.leftTurn.totalTime * 10) / 10,
        color: '#3b82f6',
        lightColor: '#93c5fd'
      },
      {
        behavior: 'หันขวา',
        count: behaviorCounts.rightTurn.count,
        totalTime: Math.round(behaviorCounts.rightTurn.totalTime * 10) / 10,
        color: '#22c55e',
        lightColor: '#86efac'
      },
      {
        behavior: 'ก้มหน้า',
        count: behaviorCounts.lookDown.count,
        totalTime: Math.round(behaviorCounts.lookDown.totalTime * 10) / 10,
        color: '#f97316',
        lightColor: '#fed7aa'
      },
      {
        behavior: 'เงยหน้า',
        count: behaviorCounts.lookUp.count,
        totalTime: Math.round(behaviorCounts.lookUp.totalTime * 10) / 10,
        color: '#a855f7',
        lightColor: '#d8b4fe'
      },
      {
        behavior: 'สูญเสียใบหน้า',
        count: behaviorCounts.faceLoss.count,
        totalTime: Math.round(behaviorCounts.faceLoss.totalTime * 10) / 10,
        color: '#ef4444',
        lightColor: '#fca5a5'
      }
    ]

    return NextResponse.json({
      totalUsers,
      totalAdmins,
      totalSessions,
      activeSessions,
      interruptedSessions,
      chartData
    })

  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' },
      { status: 500 }
    )
  }
}