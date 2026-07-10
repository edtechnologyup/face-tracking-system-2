import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validatePassword } from '@/lib/utils/validation';

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: 'ไม่พบลิงก์กู้คืนรหัสผ่านที่ถูกต้อง กรุณาดำเนินการใหม่อีกครั้ง' },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json(
        { error: 'กรุณากรอกรหัสผ่านใหม่' },
        { status: 400 }
      );
    }

    // 1. ตรวจสอบความถูกต้องและความแรงของรหัสผ่านใหม่
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { error: 'รหัสผ่านใหม่ยังไม่แข็งแกร่งพอ: ' + passwordValidation.feedback.join(', ') },
        { status: 400 }
      );
    }

    // 2. แกะและตรวจสอบ Token ด้วย JWT
    let decoded: { userId: string; email: string; purpose: string };
    try {
      decoded = jwt.verify(
        token, 
        process.env.JWT_SECRET || 'fallback-secret'
      ) as { userId: string; email: string; purpose: string };
      
      // ป้องกันการใช้ token อื่นมารีเซ็ตรหัสผ่าน
      if (decoded.purpose !== 'password-reset') {
        return NextResponse.json(
          { error: 'วัตถุประสงค์ของลิงก์ไม่ถูกต้อง' },
          { status: 400 }
        );
      }
    } catch (err) {
      console.error('❌ [Reset Password JWT Error]:', err);
      return NextResponse.json(
        { error: 'ลิงก์เปลี่ยนรหัสผ่านหมดอายุ หรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง' },
        { status: 400 }
      );
    }

    const { userId, email } = decoded;

    // 3. ค้นหาผู้ใช้ในระบบอีกครั้งเพื่อความชัวร์
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        email: email
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'ไม่พบบัญชีผู้ใช้นี้ในระบบ' },
        { status: 404 }
      );
    }

    // 4. เข้ารหัสรหัสผ่านใหม่ด้วย bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 5. อัปเดตรหัสผ่านใหม่ลงในฐานข้อมูล
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    console.log(`✅ [Reset Password] เปลี่ยนรหัสผ่านสำเร็จสำหรับผู้ใช้: ${email}`);

    return NextResponse.json(
      { message: 'เปลี่ยนรหัสผ่านใหม่สำเร็จแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่' },
      { status: 200 }
    );

  } catch (error) {
    console.error('❌ [Reset Password API Error]:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการกู้คืนรหัสผ่าน กรุณาลองใหม่อีกครั้งภายหลัง' },
      { status: 500 }
    );
  }
}
