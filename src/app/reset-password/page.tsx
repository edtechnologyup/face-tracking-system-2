'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/app/components/ui/Card'
import { PasswordInput } from '@/app/components/ui/PasswordInput'
import { Button } from '@/app/components/ui/Button'
import { validatePassword } from '@/lib/utils/validation'
import toast from 'react-hot-toast'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (!token) {
      setError('ไม่พบรหัสกู้คืนที่ถูกต้อง กรุณาคลิกจากลิงก์ที่ได้รับในอีเมลอีกครั้ง')
      return
    }

    // 1. ตรวจสอบความถูกต้องของรหัสผ่านใหม่
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.isValid) {
      setError('รหัสผ่านใหม่ยังไม่แข็งแกร่งพอ กรุณาทำตามเงื่อนไขความแข็งแกร่งด้านล่าง')
      return
    }

    // 2. ตรวจสอบว่ารหัสผ่านตรงกันหรือไม่
    if (password !== confirmPassword) {
      setError('การยืนยันรหัสผ่านไม่ตรงกัน กรุณาตรวจสอบรหัสผ่านอีกครั้ง')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      })

      const result = await response.json()

      if (response.ok) {
        setSuccess(true)
        toast.success('เปลี่ยนรหัสผ่านใหม่สำเร็จแล้ว!')
        
        // ดีเลย์ 2 วินาทีแล้วนำทางไปที่หน้า Login
        setTimeout(() => {
          window.location.href = '/login'
        }, 2000)
      } else {
        setError(result.error || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่านใหม่')
        toast.error(result.error || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่านใหม่')
      }
    } catch (err) {
      console.error('Reset password error:', err)
      const errorMsg = 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-8 w-full max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 tracking-tight">ตั้งรหัสผ่านใหม่</h2>
        <p className="mt-2 text-sm text-gray-600">
          กรุณากำหนดรหัสผ่านใหม่ที่ปลอดภัยเพื่อความปลอดภัยของบัญชีของท่าน
        </p>
      </div>

      {!token ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm text-center">
          ⚠️ ลิงก์กู้คืนรหัสผ่านไม่ถูกต้อง หรือไม่มีโทเค็นที่ถูกต้อง
          <div className="mt-4">
            <Link 
              href="/forgot-password" 
              className="text-sm font-semibold text-purple-600 hover:text-purple-800 transition-colors"
            >
              ขอลิงก์เปลี่ยนรหัสผ่านใหม่
            </Link>
          </div>
        </div>
      ) : !success ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          <PasswordInput
            label="รหัสผ่านใหม่"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError('')
            }}
            placeholder="••••••••"
            required
            showStrength={true}
            error={error && error.includes('แข็งแกร่ง') ? error : undefined}
          />

          <PasswordInput
            label="ยืนยันรหัสผ่านใหม่"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value)
              if (error) setError('')
            }}
            placeholder="••••••••"
            required
            showStrength={false}
            error={error && error.includes('ยืนยัน') ? error : undefined}
          />

          {error && !error.includes('แข็งแกร่ง') && !error.includes('ยืนยัน') && (
            <p className="text-sm text-red-600 text-center font-medium">{error}</p>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            className="w-full justify-center flex py-3"
          >
            {loading ? 'กำลังบันทึกรหัสผ่านใหม่...' : 'เปลี่ยนรหัสผ่านใหม่'}
          </Button>
        </form>
      ) : (
        <div className="space-y-6 text-center">
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
            <div className="flex items-center justify-center mb-2">
              <svg className="w-6 h-6 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold">เปลี่ยนรหัสผ่านใหม่สำเร็จแล้ว!</span>
            </div>
            ระบบจะนำทางท่านไปยังหน้าเข้าสู่ระบบอัตโนมัติภายใน 2 วินาที...
          </div>
          <div className="mt-4">
            <Link 
              href="/login" 
              className="text-sm font-semibold text-purple-600 hover:text-purple-800 transition-colors"
            >
              หรือคลิกที่นี่เพื่อไปหน้าล็อกอินทันที
            </Link>
          </div>
        </div>
      )}

      {/* Footer Link to Login page */}
      {!success && (
        <div className="mt-8 text-center">
          <Link 
            href="/login" 
            className="text-sm font-semibold text-purple-600 hover:text-purple-800 transition-colors inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            ย้อนกลับไปหน้าล็อกอิน
          </Link>
        </div>
      )}
    </Card>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Suspense fallback={
          <Card className="p-8 w-full max-w-md mx-auto text-center">
            <div className="flex flex-col items-center justify-center py-6">
              <svg className="animate-spin h-8 w-8 text-purple-500 mb-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-purple-600 font-semibold text-sm">กำลังโหลดข้อมูลระบบ...</p>
            </div>
          </Card>
        }>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
