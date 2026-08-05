import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import jwt from 'jsonwebtoken'

export async function POST(request: NextRequest) {
  try {
    // ตรวจสอบ JWT_SECRET
    const JWT_SECRET = process.env.JWT_SECRET
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured')
    }

    // ตรวจสอบ Authorization header
    const authorization = request.headers.get('authorization')
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'กรุณาเข้าสู่ระบบก่อนลงทะเบียนใบหน้า' },
        { status: 401 }
      )
    }

    const token = authorization.substring(7)

    // ตรวจสอบ token (รองรับทั้ง JWT ปกติ และ registrationToken)
    let userId: string
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; purpose?: string }
      
      // ยอมรับเฉพาะ token ที่มี purpose เป็น 'face-registration' หรือ token login ปกติ
      if (decoded.purpose && decoded.purpose !== 'face-registration') {
        return NextResponse.json(
          { error: 'Token ไม่ถูกต้องสำหรับการลงทะเบียนใบหน้า' },
          { status: 403 }
        )
      }

      userId = decoded.userId
    } catch {
      return NextResponse.json(
        { error: 'Token ไม่ถูกต้องหรือหมดอายุ กรุณาลงทะเบียนใหม่' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { faceData } = body

    // ตรวจสอบฟิลด์ที่จำเป็น
    if (!faceData) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ครบถ้วน' },
        { status: 400 }
      )
    }

    // ตรวจสอบรูปแบบข้อมูลใบหน้า - คาดหวังว่าจะมีหลายท่า
    if (typeof faceData !== 'object' || faceData === null) {
      return NextResponse.json(
        { error: 'ข้อมูลใบหน้าไม่ถูกต้อง' },
        { status: 400 }
      )
    }

    // ตรวจสอบว่ามีท่าที่จำเป็นหรือไม่
    const providedPoses = Object.keys(faceData)
    
    // อนุญาตท่าบางส่วน (ต้องมีท่าหน้าตรงอย่างน้อย)
    if (!faceData.front || !Array.isArray(faceData.front) || faceData.front.length !== 128) {
      return NextResponse.json(
        { error: 'ต้องมีข้อมูลใบหน้าท่าหน้าตรงอย่างน้อย' },
        { status: 400 }
      )
    }

    // ตรวจสอบแต่ละท่าที่ให้มา
    for (const [pose, data] of Object.entries(faceData)) {
      if (!Array.isArray(data) || data.length !== 128) {
        return NextResponse.json(
          { error: `ข้อมูลใบหน้าท่า${pose}ไม่ถูกต้อง` },
          { status: 400 }
        )
      }
    }

    // อัปเดตข้อมูลผู้ใช้ด้วยข้อมูลใบหน้า (ใช้ userId จาก token เท่านั้น)
    const user = await prisma.user.update({
      where: { id: userId },
      data: { 
        faceData: JSON.stringify(faceData)
      }
    })

    console.log('Face data saved successfully for user:', user.id)

    return NextResponse.json({ 
      success: true,
      message: `บันทึกข้อมูลใบหน้า ${providedPoses.length} ท่าสำเร็จ`,
      capturedPoses: providedPoses
    })

  } catch (error: unknown) {
    console.error('Face Register API Error:', error instanceof Error ? error.message : 'Unknown error')

    // ตรวจสอบข้อผิดพลาดเฉพาะของฐานข้อมูล
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลผู้ใช้' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        error: 'ไม่สามารถบันทึกข้อมูลใบหน้าได้',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : 'Unknown error') : undefined
      },
      { status: 500 }
    )
  }
}