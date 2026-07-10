'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Card } from '@/app/components/ui/Card'
import { Input } from '@/app/components/ui/Input'
import { Button } from '@/app/components/ui/Button'
import { validateEmail } from '@/lib/utils/validation'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    // ตรวจสอบรูปแบบอีเมล
    const emailValidation = validateEmail(email)
    if (!emailValidation.isValid) {
      setError(emailValidation.error || 'กรุณากรอกอีเมลในรูปแบบที่ถูกต้อง')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailValidation.normalizedEmail })
      })

      const result = await response.json()

      if (response.ok) {
        setSuccess(true)
        toast.success('ทำรายการสำเร็จ! กรุณาตรวจสอบอีเมลของท่าน')
      } else {
        setError(result.error || 'เกิดข้อผิดพลาดในการขอรหัสผ่านใหม่')
        toast.error(result.error || 'เกิดข้อผิดพลาดในการขอรหัสผ่านใหม่')
      }
    } catch (err) {
      console.error('Forgot password error:', err)
      const errorMsg = 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="p-8 w-full max-w-md mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">ลืมรหัสผ่าน?</h2>
            <p className="mt-2 text-sm text-gray-600">
              ระบบจะสร้างรหัสผ่านชั่วคราวและส่งข้อมูลไปยังอีเมลที่ท่านลงทะเบียนไว้
            </p>
          </div>

          {!success ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <Input
                label="อีเมลที่ลงทะเบียน"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (error) setError('')
                }}
                placeholder="example@email.com"
                required
                error={error}
                loading={loading}
              />

              <Button
                type="submit"
                variant="primary"
                disabled={loading}
                className="w-full justify-center flex py-3"
              >
                {loading ? 'กำลังดำเนินรายการ...' : 'ส่งรหัสผ่านชั่วคราว'}
              </Button>
            </form>
          ) : (
            <div className="space-y-6 text-center">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
                <div className="flex items-center justify-center mb-2">
                  <svg className="w-6 h-6 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold">ส่งอีเมลสำเร็จแล้ว</span>
                </div>
                ระบบได้ส่งรหัสผ่านชั่วคราวไปยังอีเมล <b>{email}</b> แล้ว (หากไม่พบในกล่องข้อความเข้า กรุณาตรวจสอบใน Junk / Spam folder ของท่าน)
              </div>

              <div className="p-4 bg-purple-50 border border-purple-100 rounded-lg text-xs text-purple-700 text-left space-y-1">
                <span className="font-bold">💡 คำแนะนำ:</span>
                <p>1. นำรหัสผ่านชั่วคราวที่ได้รับไปใช้ในการเข้าสู่ระบบ</p>
                <p>2. เมื่อเข้าระบบสำเร็จแล้ว ให้ดำเนินการเปลี่ยนรหัสผ่านทันทีเพื่อความปลอดภัย</p>
              </div>
            </div>
          )}

          {/* Footer link */}
          <div className="mt-8 text-center">
            <Link 
              href="/login" 
              className="text-sm font-semibold text-purple-600 hover:text-purple-800 transition-colors inline-flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              กลับสู่หน้าเข้าสู่ระบบ
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
