import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { validateEmail } from '@/lib/utils/validation';
import { sendResetPasswordEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'กรุณากรอกอีเมล' },
        { status: 400 }
      );
    }

    // ตรวจสอบรูปแบบอีเมลและปรับปรุงให้อยู่ในรูปแบบที่ถูกต้อง
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return NextResponse.json(
        { error: emailValidation.error },
        { status: 400 }
      );
    }

    const normalizedEmail = emailValidation.normalizedEmail!;

    // ค้นหาผู้ใช้จากอีเมลในระบบ
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    // หากไม่พบผู้ใช้ในระบบ เพื่อความปลอดภัยป้องกันไม่ให้แฮกเกอร์ตรวจพบอีเมลจริง (Email Enumeration Attack)
    // เราจะตอบกลับสำเร็จกลับไป
    if (!user) {
      console.log(`ℹ️ [Forgot Password] ไม่พบอีเมล: ${normalizedEmail} ในระบบ (ตอบกลับสำเร็จหลอกเพื่อความปลอดภัย)`);
      return NextResponse.json(
        { message: 'หากอีเมลนี้อยู่ในระบบ ลิงก์สำหรับเปลี่ยนรหัสผ่านได้ถูกส่งไปยังอีเมลของท่านเรียบร้อยแล้ว' },
        { status: 200 }
      );
    }

    // สร้าง Token สำหรับรีเซ็ตรหัสผ่านที่มีความยาวและปลอดภัย โดยกำหนดอายุ 1 ชั่วโมง
    const resetToken = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        purpose: 'password-reset' 
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '1h' }
    );

    // สร้าง ลิงก์สำหรับเปลี่ยนรหัสผ่าน
    const origin = request.nextUrl.origin;
    const resetLink = `${origin}/reset-password?token=${resetToken}`;

    console.log(`🔒 [Forgot Password] ได้สร้างลิงก์เปลี่ยนรหัสผ่านสำหรับ: ${normalizedEmail}`);

    // ส่งอีเมลแจ้งเตือนลิงก์เปลี่ยนรหัสผ่าน
    const emailSent = await sendResetPasswordEmail(normalizedEmail, resetLink);
    
    if (!emailSent) {
      return NextResponse.json(
        { error: 'เกิดข้อผิดพลาดในการส่งลิงก์เปลี่ยนรหัสผ่าน กรุณาลองใหม่อีกครั้งภายหลัง' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'หากอีเมลนี้อยู่ในระบบ ลิงก์สำหรับเปลี่ยนรหัสผ่านได้ถูกส่งไปยังอีเมลของท่านเรียบร้อยแล้ว' },
      { status: 200 }
    );

  } catch (error) {
    console.error('❌ [Forgot Password API] เกิดข้อผิดพลาด:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการกู้คืนรหัสผ่าน กรุณาตรวจสอบข้อมูลอีกครั้ง' },
      { status: 500 }
    );
  }
}
