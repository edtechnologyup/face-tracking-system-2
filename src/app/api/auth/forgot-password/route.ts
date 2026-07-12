import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateEmail } from '@/lib/utils/validation';

export async function POST(request: NextRequest) {
  try {
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

    return NextResponse.json({
      success: true,
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      studentId: user.studentId
    });

  } catch (error) {
    console.error('❌ [Forgot Password API] เกิดข้อผิดพลาด:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการตรวจสอบบัญชี กรุณาลองใหม่อีกครั้งภายหลัง' },
      { status: 500 }
    );
  }
}
