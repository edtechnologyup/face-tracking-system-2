import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { 
  validateName, 
  validateEmail, 
  validateStudentId, 
  validatePassword, 
  validateTitle, 
  validatePhoneNumber 
} from '@/lib/utils/validation'

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

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request)
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    // ดึงข้อมูลผู้ใช้ทั้งหมด (ไม่รวม password และ faceData)
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        studentId: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json(users)

  } catch (error) {
    console.error('Admin users GET error:', error)
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request)
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const { email, password, title, firstName, lastName, studentId, phoneNumber, role } = body

    // ตรวจสอบฟิลด์ที่จำเป็น
    if (!email || !password || !title || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (อีเมล รหัสผ่าน คำนำหน้าชื่อ ชื่อ และนามสกุล)' },
        { status: 400 }
      )
    }

    // ตรวจสอบความถูกต้องของข้อมูล
    const titleVal = validateTitle(title)
    if (!titleVal.isValid) return NextResponse.json({ error: titleVal.error }, { status: 400 })

    const firstNameVal = validateName(firstName)
    if (!firstNameVal.isValid) return NextResponse.json({ error: `ชื่อ: ${firstNameVal.error}` }, { status: 400 })

    const lastNameVal = validateName(lastName)
    if (!lastNameVal.isValid) return NextResponse.json({ error: `นามสกุล: ${lastNameVal.error}` }, { status: 400 })

    if (studentId) {
      const studentIdVal = validateStudentId(studentId)
      if (!studentIdVal.isValid) return NextResponse.json({ error: studentIdVal.error }, { status: 400 })
    }

    if (phoneNumber) {
      const phoneVal = validatePhoneNumber(phoneNumber)
      if (!phoneVal.isValid) return NextResponse.json({ error: phoneVal.error }, { status: 400 })
    }

    const emailVal = validateEmail(email)
    if (!emailVal.isValid) return NextResponse.json({ error: emailVal.error }, { status: 400 })
    const normalizedEmail = emailVal.normalizedEmail!

    const passwordVal = validatePassword(password)
    if (!passwordVal.isValid) {
      return NextResponse.json(
        { error: 'รหัสผ่านไม่ปลอดภัยเพียงพอ', details: passwordVal.feedback },
        { status: 400 }
      )
    }

    // ตรวจสอบอีเมลซ้ำ
    const existingUserByEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })
    if (existingUserByEmail) {
      return NextResponse.json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' }, { status: 400 })
    }

    // ตรวจสอบรหัสนักศึกษาซ้ำ
    if (studentId) {
      const existingUserByStudentId = await prisma.user.findUnique({
        where: { studentId }
      })
      if (existingUserByStudentId) {
        return NextResponse.json({ error: 'รหัสนักศึกษานี้ถูกใช้งานแล้ว' }, { status: 400 })
      }
    }

    // เข้ารหัสรหัสผ่าน
    const hashedPassword = await bcrypt.hash(password, 12)

    // บันทึกลงฐานข้อมูล
    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        title: title.toLowerCase(),
        firstName,
        lastName,
        studentId: studentId || null,
        phoneNumber: phoneNumber || null,
        role: role === 'ADMIN' ? 'ADMIN' : 'USER',
        isActive: true,
        faceData: null
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        studentId: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    })

    return NextResponse.json({
      success: true,
      message: 'เพิ่มผู้ใช้งานสำเร็จ',
      user: newUser
    }, { status: 201 })

  } catch (error) {
    console.error('Admin users POST error:', error)
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' },
      { status: 500 }
    )
  }
}