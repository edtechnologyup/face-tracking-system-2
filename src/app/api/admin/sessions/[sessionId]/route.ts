import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import jwt from 'jsonwebtoken'

// ฟังก์ชันตรวจสอบสิทธิ์ Admin
async function verifyAdmin(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return { error: 'ไม่พบ token การยืนยันตัวตน', status: 401 }
  }

  const token = authorization.substring(7)
  let decoded: { userId: string; role: string }
  
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as { userId: string; role: string }
  } catch {
    return { error: 'Token ไม่ถูกต้องหรือหมดอายุ', status: 401 }
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { role: true }
  })

  if (!user || user.role !== 'ADMIN') {
    return { error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้', status: 403 }
  }

  return { decoded }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const auth = await verifyAdmin(request)
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { sessionId } = await params

    // ตรวจสอบว่ามีเซสชันนี้อยู่จริง
    const session = await prisma.trackingSession.findUnique({
      where: { id: sessionId }
    })

    if (!session) {
      return NextResponse.json({ error: 'ไม่พบเซสชันที่ต้องการลบ' }, { status: 404 })
    }

    // ลบเซสชัน (Cascading deletes ใน database config จะลบ TrackingLog และ SessionStatistics อัตโนมัติ)
    await prisma.trackingSession.delete({
      where: { id: sessionId }
    })

    return NextResponse.json({
      success: true,
      message: 'ลบเซสชันการติดตามสำเร็จ'
    })

  } catch (error) {
    console.error('Admin sessions DELETE error:', error)
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' },
      { status: 500 }
    )
  }
}
