'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/app/components/ui/Button'
import { Card } from '@/app/components/ui/Card'
import { LogoutConfirmation } from '@/app/components/ui/LogoutConfirmation'
import { FaceTracker } from '@/app/components/tracking/FaceTracker'
import { getThailandTime, calculateDurationInSeconds } from '@/lib/utils/datetime'
import { toast } from 'react-hot-toast'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
}

export default function TrackingPage() {
  const [user, setUser] = useState<User | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)
  const [trackingData, setTrackingData] = useState({
    startTime: null as Date | null,
    duration: 0,
    location: 'ห้องเรียน A1'
  })

  useEffect(() => {
    // ตรวจสอบการ login
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')

    if (!token || !userData) {
      toast.error('กรุณาเข้าสู่ระบบก่อน')
      window.location.href = '/login'
      return
    }

    // ตรวจสอบความถูกต้องของ token (JWT format)
    if (!token.includes('.')) {
      toast.error('Token ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่')
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
      return
    }

    try {
      const parsedUser = JSON.parse(userData)
      // ตรวจสอบว่าข้อมูลผู้ใช้ครบถ้วน
      if (!parsedUser.id || !parsedUser.firstName) {
        throw new Error('ข้อมูลผู้ใช้ไม่ครบถ้วน')
      }
      
      // ป้องกันไม่ให้ admin เข้าหน้า tracking
      if (parsedUser.role === 'ADMIN') {
        toast.error('ผู้ดูแลระบบไม่สามารถเข้าหน้านี้ได้')
        window.location.href = '/admin'
        return
      }
      
      setUser(parsedUser)
    } catch (error) {
      console.error('Invalid user data:', error)
      toast.error('ข้อมูลผู้ใช้ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่')
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
  }, [])

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (isTracking && trackingData.startTime) {
      interval = setInterval(() => {
        const duration = calculateDurationInSeconds(trackingData.startTime!)
        setTrackingData(prev => ({ ...prev, duration }))
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isTracking, trackingData.startTime])

  const handleStartTracking = () => {
    setTrackingData(prev => ({
      ...prev,
      startTime: getThailandTime()
    }))
    setIsTracking(true)
  }

  const handleStopTracking = () => {
    setIsTracking(false)
    // บันทึกข้อมูลการติดตาม
    console.log('Tracking completed:', trackingData)
    alert('การติดตามเสร็จสิ้น')
  }

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true)
  }

  const handleLogoutConfirm = async () => {
  setLogoutLoading(true)
  
  try {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('tempUser')
    localStorage.removeItem('tempUserId')
    sessionStorage.clear()
    
    // ใช้ toast แทน alert (ไม่บล็อก UI)
    toast.success('ออกจากระบบสำเร็จ')
    
    // รอ 1 วินาที แล้ว redirect
    setTimeout(() => {
      window.location.href = '/login'
    }, 1000)
    
  } catch (error) {
    console.error('Logout error:', error)
    localStorage.clear()
    sessionStorage.clear()
    window.location.href = '/login'
  } finally {
    setLogoutLoading(false)
  }
}

  const handleLogoutCancel = () => {
    setShowLogoutConfirm(false)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-100">
        {/* ส่วนหัว */}
        <div className="bg-white shadow-sm border-b border-purple-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-800">Tracking System</h1>
                  <p className="text-sm text-gray-600">ยินดีต้อนรับคุณ {user.firstName}</p>
                </div>
              </div>
              <Button onClick={handleLogoutClick} variant="secondary">
                ออกจากระบบ
              </Button>
            </div>
          </div>
        </div>

        {/* เนื้อหาหลัก */}
        <div className="max-w-6xl mx-auto p-3 sm:p-6">
          <div className="grid gap-4 sm:gap-6">
            {/* การ์ดติดตาม */}
            {!isTracking ? (
              <Card className="p-4 sm:p-8 min-h-[380px] sm:min-h-[550px] flex justify-center items-center">
                <div className="text-center">
                  <div className="w-16 h-16 sm:w-24 sm:h-24 mx-auto mb-4 sm:mb-6 rounded-full flex items-center justify-center bg-gray-100 text-gray-400">
                    <svg className="w-8 h-8 sm:w-12 sm:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>

                  <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">
                    พร้อมเริ่มติดตาม
                  </h2>

                  <p className="text-sm sm:text-base text-gray-600 mb-6">
                    กดปุ่มเพื่อเปิดกล้องและเริ่มระบบติดตามพฤติกรรม
                  </p>

                  <Button
                    onClick={handleStartTracking}
                    className="w-full sm:w-auto px-8 sm:px-12 py-3.5 sm:py-4 text-base sm:text-lg font-semibold shadow-md active:scale-95 transition-transform"
                  >
                    🎥 เริ่มติดตาม
                  </Button>
                </div>
              </Card>
            ) : (
              <FaceTracker
                onTrackingStop={handleStopTracking}
                sessionName={trackingData.location}
              />
            )}
          </div>
        </div>
      </div>

      {/* โมดอลยืนยันการออกจากระบบ */}
      <LogoutConfirmation
        isOpen={showLogoutConfirm}
        onConfirm={handleLogoutConfirm}
        onCancel={handleLogoutCancel}
        loading={logoutLoading}
      />
    </>
  )
}