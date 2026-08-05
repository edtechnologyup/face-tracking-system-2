import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateEmail } from '@/lib/utils/validation';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    const { identifier } = await request.json();

    if (!identifier) {
      return NextResponse.json(
        { error: 'กรุณากรอกอีเมลหรือรหัสนิสิต' },
        { status: 400 }
      );
    }

    const isEmail = identifier.includes('@');
    let user = null;

    if (isEmail) {
      const emailValidation = validateEmail(identifier);
      if (!emailValidation.isValid) {
        return NextResponse.json(
          { error: emailValidation.error },
          { status: 400 }
        );
      }
      user = await prisma.user.findUnique({
        where: { email: emailValidation.normalizedEmail }
      });
    } else {
      // ค้นหาด้วยรหัสนิสิต (studentId)
      const cleanedStudentId = identifier.trim();
      user = await prisma.user.findFirst({
        where: { studentId: cleanedStudentId }
      });
    }

    if (!user) {
      // ส่ง response เหมือนกันทั้งกรณีพบและไม่พบ เพื่อป้องกัน User Enumeration
      return NextResponse.json(
        { error: 'ไม่พบบัญชีผู้ใช้ในระบบ กรุณาตรวจสอบอีเมลหรือรหัสนิสิตอีกครั้ง' },
        { status: 404 }
      );
    }

    if (!user.faceData) {
      return NextResponse.json(
        { error: 'บัญชีนี้ยังไม่ได้ลงทะเบียนข้อมูลใบหน้า กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน' },
        { status: 400 }
      );
    }

    // สร้าง verificationToken (อายุ 10 นาที) สำหรับขั้นตอนยืนยันใบหน้า
    const verificationToken = jwt.sign(
      { userId: user.id, purpose: 'face-verification' },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    // ส่ง token กลับ — ไม่ส่งข้อมูลส่วนตัว (userId, email, studentId) เพื่อป้องกัน PII Leakage
    return NextResponse.json({
      success: true,
      requiresFaceVerification: true,
      verificationToken,
      firstName: user.firstName // ส่งแค่ชื่อเพื่อแสดง UI เท่านั้น
    });

  } catch (error) {
    console.error('❌ [Forgot Password API] เกิดข้อผิดพลาด:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการตรวจสอบบัญชี กรุณาลองใหม่อีกครั้งภายหลัง' },
      { status: 500 }
    );
  }
}
