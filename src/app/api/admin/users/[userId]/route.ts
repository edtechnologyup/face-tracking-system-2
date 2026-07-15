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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await verifyAdmin(request)
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { userId } = await params
    const body = await request.json()
    const { email, password, title, firstName, lastName, studentId, phoneNumber, role, isActive, section } = body

    // ดึงข้อมูลผู้ใช้ปัจจุบันเพื่อเปรียบเทียบ
    const currentUser = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!currentUser) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้งานที่ต้องการแก้ไข' }, { status: 404 })
    }

    // ข้อมูลที่จะทำการอัปเดต
    const updateData: {
      email?: string
      title?: string
      firstName?: string
      lastName?: string
      studentId?: string | null
      phoneNumber?: string | null
      section?: string | null
      password?: string
      role?: 'ADMIN' | 'USER'
      isActive?: boolean
    } = {}

    // ตรวจสอบข้อมูลคำนำหน้าชื่อ ชื่อ นามสกุล
    if (title !== undefined) {
      const titleVal = validateTitle(title)
      if (!titleVal.isValid) return NextResponse.json({ error: titleVal.error }, { status: 400 })
      updateData.title = title.toLowerCase()
    }

    if (firstName !== undefined) {
      const firstNameVal = validateName(firstName)
      if (!firstNameVal.isValid) return NextResponse.json({ error: `ชื่อ: ${firstNameVal.error}` }, { status: 400 })
      updateData.firstName = firstName
    }

    if (lastName !== undefined) {
      const lastNameVal = validateName(lastName)
      if (!lastNameVal.isValid) return NextResponse.json({ error: `นามสกุล: ${lastNameVal.error}` }, { status: 400 })
      updateData.lastName = lastName
    }

    // ตรวจสอบอีเมลถ้ามีการแก้ไข
    if (email !== undefined && email !== currentUser.email) {
      const emailVal = validateEmail(email)
      if (!emailVal.isValid) return NextResponse.json({ error: emailVal.error }, { status: 400 })
      const normalizedEmail = emailVal.normalizedEmail!

      // ตรวจสอบอีเมลซ้ำ
      const existingUserByEmail = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      })
      if (existingUserByEmail && existingUserByEmail.id !== userId) {
        return NextResponse.json({ error: 'อีเมลนี้ถูกใช้งานโดยผู้ใช้อื่นแล้ว' }, { status: 400 })
      }
      updateData.email = normalizedEmail
    }

    // ตรวจสอบรหัสนักศึกษาถ้ามีการแก้ไข
    if (studentId !== undefined && studentId !== currentUser.studentId) {
      if (studentId) {
        const studentIdVal = validateStudentId(studentId)
        if (!studentIdVal.isValid) return NextResponse.json({ error: studentIdVal.error }, { status: 400 })

        // ตรวจสอบรหัสซ้ำ
        const existingUserByStudentId = await prisma.user.findUnique({
          where: { studentId }
        })
        if (existingUserByStudentId && existingUserByStudentId.id !== userId) {
          return NextResponse.json({ error: 'รหัสนักศึกษานี้ถูกใช้งานโดยผู้ใช้อื่นแล้ว' }, { status: 400 })
        }
        updateData.studentId = studentId
      } else {
        updateData.studentId = null
      }
    }

    // ตรวจสอบเบอร์โทรศัพท์
    if (phoneNumber !== undefined) {
      if (phoneNumber) {
        const phoneVal = validatePhoneNumber(phoneNumber)
        if (!phoneVal.isValid) return NextResponse.json({ error: phoneVal.error }, { status: 400 })
        updateData.phoneNumber = phoneNumber
      } else {
        updateData.phoneNumber = null
      }
    }

    // อัปเดตเซกชัน
    if (section !== undefined) {
      updateData.section = section || null
    }

    // ตรวจสอบและตั้งรหัสผ่านใหม่ (ถ้ามีการส่งมา)
    if (password) {
      const passwordVal = validatePassword(password)
      if (!passwordVal.isValid) {
        return NextResponse.json(
          { error: 'รหัสผ่านใหม่ไม่ปลอดภัยเพียงพอ', details: passwordVal.feedback },
          { status: 400 }
        )
      }
      updateData.password = await bcrypt.hash(password, 12)
    }

    // อัปเดตสิทธิ์ (role)
    if (role !== undefined) {
      updateData.role = role === 'ADMIN' ? 'ADMIN' : 'USER'
    }

    // อัปเดตสถานะการใช้งาน (isActive)
    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive)
    }

    // บันทึกการเปลี่ยนแปลง
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        studentId: true,
        phoneNumber: true,
        section: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    })

    return NextResponse.json({
      success: true,
      message: 'แก้ไขข้อมูลผู้ใช้งานสำเร็จ',
      user: updatedUser
    })

  } catch (error) {
    console.error('Admin users PUT error:', error)
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await verifyAdmin(request)
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { userId } = await params

    // ป้องกันการลบตัวเอง
    if (auth.decoded?.userId === userId) {
      return NextResponse.json(
        { error: 'ไม่สามารถลบผู้ดูแลระบบที่กำลังใช้งานอยู่ได้' },
        { status: 400 }
      )
    }

    // ตรวจสอบว่าผู้ใช้ที่จะลบมีตัวตนจริง
    const userToDelete = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!userToDelete) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้งานที่ต้องการลบ' }, { status: 404 })
    }

    // ลบผู้ใช้งาน (Cascading deletes ใน database config จะลบ TrackingSession และ TrackingLog อัตโนมัติ)
    await prisma.user.delete({
      where: { id: userId }
    })

    return NextResponse.json({
      success: true,
      message: 'ลบผู้ใช้งานสำเร็จ'
    })

  } catch (error) {
    console.error('Admin users DELETE error:', error)
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' },
      { status: 500 }
    )
  }
}
