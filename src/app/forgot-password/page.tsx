'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Card } from '@/app/components/ui/Card'
import { Input } from '@/app/components/ui/Input'
import { Button } from '@/app/components/ui/Button'
import { validatePassword } from '@/lib/utils/validation'
import { FaceReset } from '@/app/components/auth/FaceReset'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Step 1: Identifier lookup
  const [verificationToken, setVerificationToken] = useState<string | null>(null)
  const [userFirstName, setUserFirstName] = useState('')
  const [showFaceModal, setShowFaceModal] = useState(false)
  
  // Step 2: Reset Token from Face scan
  const [resetToken, setResetToken] = useState<string | null>(null)
  
  // Step 3: Password fields
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!identifier.trim()) {
      setError('กรุณากรอกอีเมลหรือรหัสนิสิต')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setVerificationToken(result.verificationToken)
        setUserFirstName(result.firstName || '')
        setShowFaceModal(true)
        toast.success(`พบข้อมูลบัญชีของ ${result.firstName || ''} กรุณายืนยันใบหน้า`)
      } else {
        setError(result.error || 'เกิดข้อผิดพลาดในการตรวจสอบบัญชี')
        toast.error(result.error || 'เกิดข้อผิดพลาดในการตรวจสอบบัญชี')
      }
    } catch (err) {
      console.error('Lookup error:', err)
      const errorMsg = 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleFaceSuccess = (token: string) => {
    setResetToken(token)
    setShowFaceModal(false)
    toast.success('ยืนยันตัวตนด้วยใบหน้าสำเร็จ กรุณาตั้งรหัสผ่านใหม่')
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')

    if (!resetToken) {
      toast.error('ไม่พบลิงก์เปลี่ยนรหัสผ่านที่ถูกต้อง กรุณาดำเนินการยืนยันใบหน้าใหม่อีกครั้ง')
      return
    }

    // ตรวจสอบรหัสผ่านที่กรอก
    const strength = validatePassword(password)
    if (!strength.isValid) {
      setPasswordError(`รหัสผ่านยังไม่แข็งแกร่งพอ: ${strength.feedback.join(', ')}`)
      return
    }

    if (password !== confirmPassword) {
      setPasswordError('รหัสผ่านไม่ตรงกัน')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password })
      })

      const result = await response.json()

      if (response.ok) {
        setSuccess(true)
        toast.success('เปลี่ยนรหัสผ่านสำเร็จ!')
      } else {
        setPasswordError(result.error || 'เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่')
        toast.error(result.error || 'เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่')
      }
    } catch (err) {
      console.error('Reset password error:', err)
      const errorMsg = 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง'
      setPasswordError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="p-8 w-full max-w-md mx-auto">
          
          {/* 1. สเตจทำรายการสำเร็จ */}
          {success ? (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full mx-auto flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">เปลี่ยนรหัสผ่านสำเร็จ</h2>
              <p className="text-sm text-gray-600">
                รหัสผ่านใหม่ของคุณพร้อมใช้งานแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่
              </p>
              <Link href="/login" className="block">
                <Button variant="primary" className="w-full justify-center py-3">
                  เข้าสู่ระบบ
                </Button>
              </Link>
            </div>
          ) : resetToken ? (
            /* 2. สเตจกรอกรหัสผ่านใหม่ (หลังผ่านการแสกนหน้าสำเร็จ) */
            <div>
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-950">ตั้งรหัสผ่านใหม่</h2>
                {userFirstName && (
                  <p className="mt-2 text-sm text-purple-700 font-medium">
                    ยืนยันตัวตนบัญชีของ: {userFirstName}
                  </p>
                )}
              </div>

              <form onSubmit={handleResetPassword} className="space-y-6">
                <Input
                  label="รหัสผ่านใหม่"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (passwordError) setPasswordError('')
                  }}
                  placeholder="รหัสผ่านใหม่ (ขั้นต่ำ 8 ตัวอักษร)"
                  required
                  error={passwordError}
                />

                <Input
                  label="ยืนยันรหัสผ่านใหม่"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    if (passwordError) setPasswordError('')
                  }}
                  placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                  required
                />

                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading}
                  className="w-full justify-center flex py-3 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {loading ? 'กำลังตั้งรหัสผ่าน...' : 'บันทึกรหัสผ่านใหม่'}
                </Button>
              </form>
            </div>
          ) : (
            /* 3. สเตจค้นหาบัญชีผู้ใช้ด้วย Email/StudentId */
            <div>
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 tracking-tight">รีเซ็ตรหัสผ่าน</h2>
                <p className="mt-2 text-sm text-gray-600">
                  ยืนยันตัวตนด้วยใบหน้าเพื่อขอเปลี่ยนรหัสผ่านใหม่
                </p>
              </div>

              <form onSubmit={handleLookup} className="space-y-6">
                <Input
                  label="อีเมล หรือ รหัสนิสิต ม.พะเยา"
                  type="text"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value)
                    if (error) setError('')
                  }}
                  placeholder="รหัสนิสิต (เช่น 65000000) หรืออีเมล"
                  required
                  error={error}
                  loading={loading}
                />

                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading}
                  className="w-full justify-center flex py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium"
                >
                  {loading ? 'กำลังตรวจสอบ...' : 'ยืนยันใบหน้าเพื่อเปลี่ยนรหัสผ่าน'}
                </Button>
              </form>

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
            </div>
          )}
        </Card>
      </div>

      {/* หน้าต่างสแกนใบหน้า (FaceReset Modal) */}
      {showFaceModal && verificationToken && (
        <FaceReset
          isOpen={showFaceModal}
          verificationToken={verificationToken}
          onSuccess={handleFaceSuccess}
          onCancel={() => {
            setShowFaceModal(false)
            setVerificationToken(null)
          }}
        />
      )}
    </div>
  )
}
