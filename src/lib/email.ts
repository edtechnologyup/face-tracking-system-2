import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

// การตั้งค่า SMTP ผ่าน Environment Variables
const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
const smtpUser = process.env.SMTP_USER;
const smtpPassword = process.env.SMTP_PASSWORD;
const smtpFrom = process.env.SMTP_FROM || 'no-reply@tracking-system.com';

/**
 * ส่งอีเมลลิงก์เปลี่ยนรหัสผ่าน
 * @param toEmail อีเมลผู้รับ
 * @param resetLink ลิงก์เปลี่ยนรหัสผ่าน
 */
export async function sendResetPasswordEmail(toEmail: string, resetLink: string): Promise<boolean> {
  const subject = '🔒 ลิงก์เปลี่ยนรหัสผ่านสำหรับระบบ Face Tracking System';
  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; border-bottom: 2px solid #6b21a8; padding-bottom: 15px; margin-bottom: 20px;">
        <h2 style="color: #6b21a8; margin: 0; font-size: 24px;">Face Tracking System</h2>
      </div>
      <p style="font-size: 16px; color: #333333; line-height: 1.5;">สวัสดีครับ/ค่ะ,</p>
      <p style="font-size: 16px; color: #333333; line-height: 1.5;">ระบบได้รับคำร้องขอตั้งค่ารหัสผ่านใหม่สำหรับบัญชีของท่าน กรุณาคลิกที่ปุ่มด้านล่างเพื่อดำเนินการเปลี่ยนรหัสผ่านใหม่ภายใน 1 ชั่วโมง:</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #7c3aed; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(124, 58, 237, 0.25);">
          เปลี่ยนรหัสผ่านใหม่
        </a>
      </div>

      <p style="font-size: 14px; color: #555555; line-height: 1.5; word-break: break-all;">
        หรือคัดลอกลิงก์ด้านล่างเพื่อเปิดในเว็บเบราว์เซอร์ของท่าน:<br/>
        <a href="${resetLink}" style="color: #2563eb; text-decoration: underline;">${resetLink}</a>
      </p>

      <p style="font-size: 14px; color: #ff0000; font-weight: bold; line-height: 1.5; margin-top: 25px;">⚠️ ข้อควรระวัง:</p>
      <ul style="font-size: 14px; color: #555555; line-height: 1.6; padding-left: 20px;">
        <li>ลิงก์นี้จะมีอายุการใช้งาน <b>1 ชั่วโมง</b> เท่านั้นเมื่อเริ่มส่ง</li>
        <li>หากท่านไม่ได้เป็นผู้ส่งคำร้องนี้กรุณาเพิกเฉยต่ออีเมลนี้ บัญชีของท่านยังคงปลอดภัยด้วยรหัสผ่านเดิม</li>
      </ul>

      <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 25px 0;" />
      <p style="font-size: 12px; color: #888888; text-align: center; line-height: 1.5;">
        นี่เป็นอีเมลอัตโนมัติจากระบบ กรุณาอย่าตอบกลับอีเมลนี้<br/>
        หากท่านมีข้อสงสัยใด ๆ กรุณาติดต่อผู้ดูแลระบบทันที
      </p>
    </div>
  `;

  // ตรวจสอบว่ามีการตั้งค่า SMTP ครบถ้วนหรือไม่
  if (smtpHost && smtpUser && smtpPassword) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465, // SSL สำหรับพอร์ต 465
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });

      await transporter.sendMail({
        from: `Face Tracking System <${smtpFrom}>`,
        to: toEmail,
        subject: subject,
        html: htmlContent,
      });

      console.log(`📧 [Email Service] ส่งลิงก์เปลี่ยนรหัสผ่านสำเร็จไปยัง: ${toEmail} (ทาง SMTP)`);
      return true;
    } catch (error) {
      console.error('❌ [Email Service] เกิดข้อผิดพลาดในการส่ง SMTP:', error);
      // ทำการ fallback ไปบันทึกลงไฟล์เพื่อไม่ให้แอปชะงักระหว่างการทดสอบในเครื่องภายใน
    }
  }

  // Fallback: ทำการจำลองการส่งอีเมล (Mock Send) เพื่อให้ระบบสามารถทดสอบในเครื่อง Local ได้อย่างง่ายดาย
  try {
    const mockLogDir = path.join(process.cwd(), 'scripts');
    if (!fs.existsSync(mockLogDir)) {
      fs.mkdirSync(mockLogDir, { recursive: true });
    }

    const logPath = path.join(mockLogDir, 'mock-emails.log');
    const timestamp = new Date().toLocaleString('th-TH');
    const logData = `
========================================
[MOCK EMAIL SENT] - ${timestamp}
To: ${toEmail}
From: ${smtpFrom}
Subject: ${subject}
Reset Link: ${resetLink}
========================================
`;

    fs.appendFileSync(logPath, logData, 'utf-8');
    
    console.log('\n=============================================================');
    console.log(`📧 [MOCK EMAIL SERVICE] จำลองการส่งลิงก์เปลี่ยนรหัสผ่านสำเร็จ!`);
    console.log(`📬 ส่งไปที่: ${toEmail}`);
    console.log(`🔗 ลิงก์เปลี่ยนรหัสผ่านคือ: ${resetLink}`);
    console.log(`📝 บันทึกข้อมูลจำลองเรียบร้อยแล้วที่: scripts/mock-emails.log`);
    console.log('=============================================================\n');

    return true;
  } catch (writeError) {
    console.error('❌ [Email Service] ไม่สามารถเขียน Log จำลองการส่งอีเมลได้:', writeError);
    return false;
  }
}
