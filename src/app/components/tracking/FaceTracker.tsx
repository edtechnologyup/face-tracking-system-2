'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { FaceTrackingData } from '@/lib/mediapipe-detector'
import { Card } from '@/app/components/ui/Card'
import { VideoPlayer } from './VideoPlayer'
import { OverlayCanvas } from './OverlayCanvas'
import { DetectionStats } from './DetectionStats'
import { ControlPanel } from './ControlPanel'
import { useCamera } from '@/hooks/useCamera'
import { useFaceDetection } from '@/hooks/useFaceDetection'
import { drawSciFiFaceMesh, drawStatusInfo } from '@/lib/face-mesh-utils'
import { loadFaceApiModels, detectFaceAndGetDescriptor } from '@/lib/face-api/detection'
import toast from 'react-hot-toast'

interface FaceTrackerProps {
  onTrackingStop: () => void
  sessionName?: string
}

export function FaceTracker({ onTrackingStop, sessionName = 'การสอบ' }: FaceTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  // State สำหรับ session management
  const sessionIdRef = useRef<string | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  // ใช้ custom hooks
  const { initializeCamera, stopCamera } = useCamera()
  const { 
    isActive, 
    currentData, 
    isRecording, 
    orientationStats, 
    initializeDetector, 
    startDetection, 
    stopDetection,
    startRecording,
    stopRecording,
    getCurrentStats,
    getFaceDetectionLossStats,
    getFaceDetectionLossEvents,
    recordFaceMismatchEvent
  } = useFaceDetection()

  // State สำหรับควบคุมระบบเปรียบเทียบใบหน้าคนสวมสิทธิ์
  const [isMismatchDetected, setIsMismatchDetected] = useState(false)
  const [isFaceApiLoaded, setIsFaceApiLoaded] = useState(false)
  const consecutiveMismatches = useRef(0)
  const activeMismatchStartTime = useRef<string | null>(null)

  // โหลดโมเดล face-api สำหรับยืนยันตัวตนคนสวมสิทธิ์
  useEffect(() => {
    async function loadModels() {
      try {
        console.log('⏳ กำลังโหลดโมเดล face-api สำหรับตรวจจับคนสวมสิทธิ์...')
        await loadFaceApiModels()
        setIsFaceApiLoaded(true)
        console.log('✅ โหลดโมเดล face-api สำเร็จ')
      } catch (err) {
        console.error('❌ ไม่สามารถโหลดโมเดล face-api ได้:', err)
      }
    }
    loadModels()
  }, [])

  // ฟังก์ชันสแกนและเปรียบเทียบใบหน้ากับเจ้าของบัญชี
  const performFaceVerification = useCallback(async () => {
    if (!videoRef.current || !isFaceApiLoaded) return

    try {
      const userData = localStorage.getItem('user')
      const userId = userData ? JSON.parse(userData).id : null
      if (!userId) {
        console.warn('🔒 [Security System] ไม่พบข้อมูลผู้ใช้ใน localStorage')
        return
      }

      console.log('🔒 [Security System] กำลังตรวจจับและเทียบใบหน้าเบื้องหลัง...')
      // ดึง face descriptor ของบุคคลปัจจุบันในกล้อง (จะโยน error หากไม่พบใบหน้าใดๆ เลย)
      const descriptor = await detectFaceAndGetDescriptor(videoRef.current, true)
      if (!descriptor || descriptor.length !== 128) {
        console.warn('🔒 [Security System] ไม่สามารถสร้าง Face Descriptor ได้')
        return
      }

      console.log('🔒 [Security System] ส่งข้อมูลไปเทียบที่ API...')
      const response = await fetch('/api/auth/face-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          faceData: descriptor,
          singlePoseVerification: true // ยืนยันว่าคนหน้ากล้องตรงกับผู้สอบหรือไม่
        })
      })

      const result = await response.json()

      if (response.ok) {
        console.log('🔒 [Security System] ผลการเปรียบเทียบ:', {
          isMatch: result.isMatch,
          distance: result.distance,
          threshold: result.threshold
        })

        if (result.isMatch) {
          // ถ้าใบหน้าตรงกัน
          consecutiveMismatches.current = 0
          if (isMismatchDetected) {
            console.log('🔒 [Security System] ผู้สอบตัวจริงกลับมาเข้าระบบแล้ว ปลดล็อกสถานะ mismatch')
            setIsMismatchDetected(false)
            
            // ถ้าหากเคยมีสถานะ mismatch ก่อนหน้านี้ ให้คำนวณระยะเวลาแล้วบันทึก event ลง database
            if (activeMismatchStartTime.current) {
              const endTime = new Date().toLocaleTimeString('th-TH', { hour12: false })
              
              // คำนวณระยะเวลา (วินาที)
              const [startH, startM, startS] = activeMismatchStartTime.current.split(':').map(Number)
              const [endH, endM, endS] = endTime.split(':').map(Number)
              const startMs = (startH * 3600 + startM * 60 + startS) * 1000
              const endMs = (endH * 3600 + endM * 60 + endS) * 1000
              const duration = Math.max(1, Math.round((endMs - startMs) / 1000))
              
              recordFaceMismatchEvent(activeMismatchStartTime.current, endTime, duration)
              activeMismatchStartTime.current = null
            }
          }
        } else {
          // ถ้าใบหน้าไม่ตรงกัน
          consecutiveMismatches.current += 1
          console.warn(`🔒 [Security System] ⚠️ ตรวจพบใบหน้าไม่ตรงกับผู้สอบ! ครั้งที่ ${consecutiveMismatches.current}`)
          
          // ตรวจจับและเก็บข้อมูลทันทีตั้งแต่ครั้งแรกเพื่อความปลอดภัยสูงสุดและรวดเร็ว
          if (consecutiveMismatches.current >= 1) {
            if (!isMismatchDetected) {
              console.warn('🔒 [Security System] 🚨 ยืนยันพบการสวมสิทธิ์สอบ! บันทึกช่วงเวลาสวมสิทธิ์ในฐานข้อมูล')
              setIsMismatchDetected(true)
              activeMismatchStartTime.current = new Date().toLocaleTimeString('th-TH', { hour12: false })
            }
          }
        }
      }
    } catch (error) {
      // หากเกิด error เช่น "ไม่พบใบหน้า" (ห้องว่าง) เราจะไม่นับเป็น mismatch และข้ามไป
      console.log('Background verification check: No face present or network issue', error)
    }
  }, [isFaceApiLoaded, isMismatchDetected, recordFaceMismatchEvent])

  // ระบบตรวจสอบใบหน้าผู้สอบแบบวนซ้ำเป็นระยะ (ความถี่ทุก 2 วินาที เพื่อการตอบสนองที่รวดเร็ว)
  useEffect(() => {
    let matchInterval: NodeJS.Timeout | null = null

    if (isActive && isRecording && isFaceApiLoaded) {
      console.log('🔒 [Security System] เริ่มต้นระบบตรวจสอบใบหน้าผู้เข้าสอบแบบวนซ้ำ (เช็คทุก 2 วินาที)')
      
      // รันเช็คครั้งแรกทันทีที่เริ่มบันทึก
      performFaceVerification()

      matchInterval = setInterval(performFaceVerification, 2000)
    }

    return () => {
      if (matchInterval) {
        clearInterval(matchInterval)
      }
    }
  }, [isActive, isRecording, isFaceApiLoaded, performFaceVerification])

  // ตัวแปรเก็บสถานะใบหน้าก่อนหน้าเพื่อเปรียบเทียบหาการเปลี่ยนแปลงในทันที
  const prevFaceState = useRef({ isDetected: false, count: 0 })
  const isVerifyingRef = useRef(false) // ตัวป้องกันการเรียกซ้อนกัน

  // ตรวจจับการเปลี่ยนแปลงพฤติกรรมในกล้อง เพื่อตรวจสอบอัตลักษณ์ใบหน้าทันที (ความเร็วระดับมิลลิวินาที)
  useEffect(() => {
    if (!currentData || !isFaceApiLoaded || !isRecording) return

    const currDetected = currentData.isDetected
    const currCount = currentData.multipleFaces?.count || 0
    const prev = prevFaceState.current

    // เงื่อนไขกระตุ้นเช็คทันที:
    // 1. มีใบหน้าโผล่เข้ามาใหม่ (เปลี่ยนจากจับไม่ได้ -> จับได้)
    // 2. จำนวนใบหน้าในกล้องเกิดการเปลี่ยนแปลง (มีคนเดินเข้ามาเพิ่ม หรือคนเก่าเดินออก)
    if ((!prev.isDetected && currDetected) || (prev.count !== currCount)) {
      if (!isVerifyingRef.current) {
        isVerifyingRef.current = true
        console.log('🔒 [Security System] [Instant Trigger] ตรวจพบใบหน้าเข้า/ออกจากกล้อง! กำลังสแกนยืนยันตัวตนทันที...')
        
        // ดีเลย์เล็กน้อย 200ms เพื่อให้กล้องโฟกัสใบหน้าของคนใหม่ที่เพิ่งเข้ามาให้ชัดเจน
        setTimeout(async () => {
          await performFaceVerification()
          isVerifyingRef.current = false
        }, 200)
      }
    }

    prevFaceState.current = { isDetected: currDetected, count: currCount }
  }, [currentData, isFaceApiLoaded, isRecording, performFaceVerification])


  // วาดการแสดงผลบน canvas
  const drawDetectionOverlay = useCallback((data: FaceTrackingData) => {
    const canvas = canvasRef.current
    const video = videoRef.current
    
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // ล้าง canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!data.isDetected) {
      // แสดงข้อความเมื่อไม่พบใบหน้า
      ctx.fillStyle = 'rgba(255, 0, 0, 0.8)'
      ctx.font = '24px Arial'
      ctx.fillText('ไม่พบใบหน้า', 50, 50)
      return
    }

    // แสดงเตือนหลายใบหน้า (ความปลอดภัยในการสอบ)
    if (data.multipleFaces && data.multipleFaces.isSecurityRisk) {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.9)'
      ctx.font = 'bold 20px Arial'
      ctx.fillText('🚨 เตือน: พบหลายใบหน้าในการสอบ!', 50, 30)
      ctx.fillStyle = 'rgba(255, 255, 0, 0.8)'
      ctx.font = '16px Arial'
      ctx.fillText(`จำนวนใบหน้า: ${data.multipleFaces.count}`, 50, 55)
    }

    // วาด Sci-Fi Face Mesh ด้วย landmarks ทั้ง 468 จุด
    if (data.landmarks && data.landmarks.length > 0) {
      drawSciFiFaceMesh(ctx, data.landmarks, video, canvas.width, canvas.height, data.orientation.isLookingAway)
    }

    // แสดงข้อมูลสถานะ
    drawStatusInfo(ctx, data, canvas.width, canvas.height)
  }, [])

  // ตัวแปรป้องกันการสร้าง session พร้อมกัน
  const sessionCreationInProgress = useRef(false)

  // ฟังก์ชันสร้าง tracking session
  const createTrackingSession = useCallback(async () => {
    try {
      // ป้องกันการสร้าง session ซ้ำแบบเข้มงวด
      if (sessionIdRef.current) {
        console.log('📌 Session มีอยู่แล้ว:', sessionIdRef.current)
        return sessionIdRef.current
      }

      // ป้องกันการเรียกพร้อมกัน (race condition)
      if (sessionCreationInProgress.current) {
        console.log('⏳ กำลังสร้าง session อยู่ รอสักครู่...')
        return null
      }

      sessionCreationInProgress.current = true

      setIsLoading(true)
      setApiError(null)

      const token = localStorage.getItem('token')
      console.log('🔑 Token check:', token ? 'มี token' : 'ไม่มี token')
      if (!token) {
        throw new Error('ไม่พบ token การเข้าสู่ระบบ กรุณา Login ก่อน')
      }

      const response = await fetch('/api/tracking/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionName: sessionName
        })
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'ไม่สามารถสร้าง session ได้')
      }

      sessionIdRef.current = result.data.sessionId
      setCurrentSessionId(result.data.sessionId)
      console.log('✅ สร้าง tracking session สำเร็จ:', result.data.sessionId)
      
      return result.data.sessionId
    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาดในการสร้าง session:', error)
      setApiError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ')
      return null
    } finally {
      setIsLoading(false)
      sessionCreationInProgress.current = false
    }
  }, [sessionName])

  // ฟังก์ชันจบ tracking session
  const endTrackingSession = useCallback(async (sessionId: string) => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('ไม่พบ token การเข้าสู่ระบบ')
      }

      const response = await fetch('/api/tracking/sessions', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId: sessionId
        })
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'ไม่สามารถจบ session ได้')
      }

      console.log('✅ จบ tracking session สำเร็จ:', result.data)
      return result.data
    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาดในการจบ session:', error)
      setApiError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ')
      return null
    }
  }, [])

  // เริ่มการติดตาม และบันทึกข้อมูลอัตโนมัติ
  const startTracking = useCallback(async () => {
    try {
      // ตรวจสอบว่ามี session อยู่แล้วหรือไม่
      let sessionId = sessionIdRef.current
      if (!sessionId) {
        // สร้าง tracking session ใหม่เฉพาะเมื่อยังไม่มี
        sessionId = await createTrackingSession()
        if (!sessionId) {
          alert('ไม่สามารถสร้าง tracking session ได้\nกรุณาตรวจสอบการเข้าสู่ระบบ')
          return
        }
        console.log('✅ สร้าง session ใหม่:', sessionId)
      } else {
        console.log('📌 ใช้ session ที่มีอยู่:', sessionId)
      }

      const cameraInitialized = await initializeCamera(videoRef)
      if (!cameraInitialized) {
        alert('ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบการอนุญาต')
        return
      }

      await initializeDetector()
      
      startDetection(videoRef, drawDetectionOverlay)
      
      // Real-time callbacks removed
      
      // เริ่มบันทึกข้อมูลอัตโนมัติ
      setTimeout(() => {
        const started = startRecording()
        if (started) {
          console.log('🎬 เริ่มบันทึก orientation data อัตโนมัติ สำหรับ session:', sessionId)
        }
      }, 1000) // รอ 1 วินาทีให้ detection เริ่มทำงาน
    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาดในการเริ่มต้น:', error)
      alert('MediaPipe ไม่สามารถโหลดได้\nกรุณาตรวจสอบ internet connection\nหรือลอง refresh หน้าเว็บ')
    }
  }, [initializeCamera, initializeDetector, startDetection, drawDetectionOverlay, startRecording, createTrackingSession])

  // ฟังก์ชันส่งข้อมูลไป API
  const saveOrientationData = useCallback(async (sessionId: string, events: unknown[], stats: unknown, faceDetectionLossStats?: { lossCount: number; totalLossTime: number }, faceDetectionLossEvents?: unknown[]) => {
    try {
      setIsLoading(true)
      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('ไม่พบ token การเข้าสู่ระบบ')
      }

      // แปลงข้อมูล events ให้ตรงกับ API format (กรอง CENTER ออก)
      const orientationEvents = (events as Array<{
        startTime: string;
        endTime: string;
        direction: string;
        duration: number;
        maxYaw?: number;
        maxPitch?: number;
        confidence?: number;
      }>)
      .filter(event => event.direction !== 'CENTER') // กรอง CENTER ออก
      .map(event => ({
        startTime: event.startTime,
        endTime: event.endTime,
        direction: event.direction,
        duration: event.duration,
        maxYaw: event.maxYaw || 0,
        maxPitch: event.maxPitch || 0,
        confidence: typeof event.confidence === 'number' ? event.confidence : 0.95,
        isActive: false
      }))

      const response = await fetch('/api/tracking/orientation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId: sessionId,
          events: orientationEvents,
          sessionStats: stats as Record<string, unknown>,
          faceDetectionLoss: faceDetectionLossStats || { lossCount: 0, totalLossTime: 0 },
          faceDetectionLossEvents: faceDetectionLossEvents || []
        })
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'ไม่สามารถบันทึกข้อมูลได้')
      }

      console.log('✅ บันทึกข้อมูล orientation สำเร็จ:', result.data)
      return result.data
    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล:', error)
      setApiError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  // หยุดบันทึกและแสดงผลลัพธ์
  const handleStopRecording = useCallback(async () => {
    // บันทึก mismatch event ที่ยังค้างอยู่ก่อนจบ session
    if (activeMismatchStartTime.current) {
      const endTime = new Date().toLocaleTimeString('th-TH', { hour12: false })
      const [startH, startM, startS] = activeMismatchStartTime.current.split(':').map(Number)
      const [endH, endM, endS] = endTime.split(':').map(Number)
      const startMs = (startH * 3600 + startM * 60 + startS) * 1000
      const endMs = (endH * 3600 + endM * 60 + endS) * 1000
      const duration = Math.max(1, Math.round((endMs - startMs) / 1000))
      
      recordFaceMismatchEvent(activeMismatchStartTime.current, endTime, duration)
      activeMismatchStartTime.current = null
      setIsMismatchDetected(false)
    }

    const events = stopRecording()
    const stats = getCurrentStats()
    const faceDetectionLossStats = getFaceDetectionLossStats()
    
    console.log('📊 สถิติการหันหน้า:', stats)
    console.log('📝 รายละเอียด events:', events)
    console.log('🚨 สถิติ Face Detection Loss:', faceDetectionLossStats)
    
    // บันทึกข้อมูลลง database
    if (currentSessionId && events && stats) {
      setIsLoading(true)
      const faceDetectionLossEvents = getFaceDetectionLossEvents()
      const saveResult = await saveOrientationData(currentSessionId, events, stats, faceDetectionLossStats, faceDetectionLossEvents)
      
      if (saveResult) {
        // จบ tracking session
        await endTrackingSession(currentSessionId)
        // ล้าง session reference และ flags เพื่อป้องกันการใช้ซ้ำ
        sessionIdRef.current = null
        sessionCreationInProgress.current = false
        
        const statsData = stats as {
          leftTurns: { count: number; totalDuration: number };
          rightTurns: { count: number; totalDuration: number };
          lookingDown: { count: number; totalDuration: number };
          lookingUp: { count: number; totalDuration: number };
          totalEvents: number;
        }
        toast(`บันทึกข้อมูลสำเร็จ! 🎉\n\nสรุปผลลัพธ์:\n• หันซ้าย: ${statsData?.leftTurns?.count || 0} ครั้ง (${statsData?.leftTurns?.totalDuration || 0} วิ)\n• หันขวา: ${statsData?.rightTurns?.count || 0} ครั้ง (${statsData?.rightTurns?.totalDuration || 0} วิ)\n• ก้มหน้า: ${statsData?.lookingDown?.count || 0} ครั้ง (${statsData?.lookingDown?.totalDuration || 0} วิ)\n• เงยหน้า: ${statsData?.lookingUp?.count || 0} ครั้ง (${statsData?.lookingUp?.totalDuration || 0} วิ)\n• รวม events: ${statsData?.totalEvents || 0} ครั้ง\n🚨 ไม่พบใบหน้า: ${faceDetectionLossStats?.lossCount || 0} ครั้ง (รวม ${faceDetectionLossStats?.totalLossTime || 0} วิ)\n\n✅ ข้อมูลถูกบันทึกลงฐานข้อมูลแล้ว`)
      } else {
        const statsData = stats as {
          leftTurns: { count: number; totalDuration: number };
          rightTurns: { count: number; totalDuration: number };
          lookingDown: { count: number; totalDuration: number };
          lookingUp: { count: number; totalDuration: number };
          totalEvents: number;
        }
        alert(`เกิดข้อผิดพลาดในการบันทึก! ⚠️\n\nสรุปผลลัพธ์:\n• หันซ้าย: ${statsData?.leftTurns?.count || 0} ครั้ง (${statsData?.leftTurns?.totalDuration || 0} วิ)\n• หันขวา: ${statsData?.rightTurns?.count || 0} ครั้ง (${statsData?.rightTurns?.totalDuration || 0} วิ)\n• ก้มหน้า: ${statsData?.lookingDown?.count || 0} ครั้ง (${statsData?.lookingDown?.totalDuration || 0} วิ)\n• เงยหน้า: ${statsData?.lookingUp?.count || 0} ครั้ง (${statsData?.lookingUp?.totalDuration || 0} วิ)\n• รวม events: ${statsData?.totalEvents || 0} ครั้ง\n\n❌ ไม่สามารถบันทึกลงฐานข้อมูลได้`)
      }
      setIsLoading(false)
    } else {
      const statsData = stats as {
        leftTurns: { count: number; totalDuration: number };
        rightTurns: { count: number; totalDuration: number };
        lookingDown: { count: number; totalDuration: number };
        lookingUp: { count: number; totalDuration: number };
        totalEvents: number;
      }
      alert(`หยุดติดตามแล้ว!\n\nสรุปผลลัพธ์:\n• หันซ้าย: ${statsData?.leftTurns?.count || 0} ครั้ง (${statsData?.leftTurns?.totalDuration || 0} วิ)\n• หันขวา: ${statsData?.rightTurns?.count || 0} ครั้ง (${statsData?.rightTurns?.totalDuration || 0} วิ)\n• ก้มหน้า: ${statsData?.lookingDown?.count || 0} ครั้ง (${statsData?.lookingDown?.totalDuration || 0} วิ)\n• เงยหน้า: ${statsData?.lookingUp?.count || 0} ครั้ง (${statsData?.lookingUp?.totalDuration || 0} วิ)\n• รวม events: ${statsData?.totalEvents || 0} ครั้ง`)
    }
  }, [stopRecording, getCurrentStats, currentSessionId, saveOrientationData, endTrackingSession, getFaceDetectionLossStats, getFaceDetectionLossEvents, recordFaceMismatchEvent])

  // หยุดการติดตาม
  const stopTracking = useCallback(() => {
    // หยุดบันทึกก่อน (ถ้ากำลังบันทึกอยู่)
    if (isRecording) {
      handleStopRecording()
    }
    
    stopDetection()
    stopCamera(videoRef)
    // ล้าง session reference และ flags เมื่อหยุดการติดตาม
    sessionIdRef.current = null
    sessionCreationInProgress.current = false
    onTrackingStop()
  }, [stopDetection, stopCamera, onTrackingStop, isRecording, handleStopRecording])

  // Cleanup เมื่อ component unmount
  useEffect(() => {
    return () => {
      stopCamera(videoRef)
      // ล้าง session reference และ flags เมื่อ component ถูก unmount
      sessionIdRef.current = null
      sessionCreationInProgress.current = false
    }
  }, [stopCamera])

  // Auto-start tracking when component mounts (เพียงครั้งเดียว)
  const hasAutoStarted = useRef(false)
  useEffect(() => {
    if (!isActive && !sessionIdRef.current && !isLoading && !hasAutoStarted.current) {
      console.log('🚀 Auto-starting tracking...')
      hasAutoStarted.current = true
      startTracking()
    }
  }, [isActive, isLoading, startTracking]) // เพิ่ม dependencies ที่จำเป็น

  return (
    <Card className="w-full h-full">
      <div className="p-6">
        {/* Video and Canvas Container */}
        <div className="relative mb-6">
          <VideoPlayer ref={videoRef} />
          <OverlayCanvas ref={canvasRef} videoRef={videoRef} />
        </div>

        {/* Current Detection Status */}
        <DetectionStats data={currentData} isActive={isActive} />

        {/* API Error Display */}
        {apiError && (
          <div className="mb-4 p-4 bg-red-50 rounded-lg border border-red-200">
            <h3 className="text-lg font-semibold text-red-800 mb-2">⚠️ เกิดข้อผิดพลาด</h3>
            <p className="text-sm text-red-600">{apiError}</p>
            <button 
              onClick={() => setApiError(null)}
              className="mt-2 px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded border"
            >
              ปิด
            </button>
          </div>
        )}

        {/* Loading State Display */}
        {isLoading && (
          <div className="mb-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-medium text-yellow-700">กำลังดำเนินการ...</span>
            </div>
          </div>
        )}

        {/* Recording Status Display */}
        {isActive && (
          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-blue-800 mb-3">📊 สถานะการบันทึกข้อมูล</h3>
            
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`}></div>
              <span className={`text-sm font-medium ${isRecording ? 'text-red-600' : 'text-gray-500'}`}>
                {isRecording ? 'กำลังบันทึกข้อมูลอัตโนมัติ...' : 'เริ่มต้นระบบบันทึก...'}
              </span>
            </div>
          </div>
        )}

        {/* Live Orientation Statistics */}
        {orientationStats && isRecording && (
          <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
            <h3 className="text-lg font-semibold text-purple-800 mb-3">📈 สถิติการหันหน้า (แบบเรียลไทม์)</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
              <div className="text-center p-2 bg-white rounded border">
                <div className="text-2xl font-bold text-blue-600">{orientationStats.leftTurns.count}</div>
                <div className="text-sm text-gray-600">หันซ้าย</div>
                <div className="text-xs text-gray-500">{orientationStats.leftTurns.totalDuration}วิ</div>
              </div>
              
              <div className="text-center p-2 bg-white rounded border">
                <div className="text-2xl font-bold text-green-600">{orientationStats.rightTurns.count}</div>
                <div className="text-sm text-gray-600">หันขวา</div>
                <div className="text-xs text-gray-500">{orientationStats.rightTurns.totalDuration}วิ</div>
              </div>
              
              <div className="text-center p-2 bg-white rounded border">
                <div className="text-2xl font-bold text-red-600">{orientationStats.lookingDown.count}</div>
                <div className="text-sm text-gray-600">ก้มหน้า</div>
                <div className="text-xs text-gray-500">{orientationStats.lookingDown.totalDuration}วิ</div>
              </div>
              
              <div className="text-center p-2 bg-white rounded border">
                <div className="text-2xl font-bold text-yellow-600">{orientationStats.lookingUp.count}</div>
                <div className="text-sm text-gray-600">เงยหน้า</div>
                <div className="text-xs text-gray-500">{orientationStats.lookingUp.totalDuration}วิ</div>
              </div>
            </div>

            {/* Face Detection Loss Statistics */}
            <div className="mt-4 p-3 bg-red-50 rounded border border-red-200">
              <h4 className="text-md font-semibold text-red-800 mb-2">🚨 สถิติการสูญเสียการตรวจจับใบหน้า</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-2 bg-white rounded border">
                  <div className="text-xl font-bold text-red-600">{getFaceDetectionLossStats().lossCount}</div>
                  <div className="text-sm text-gray-600">ครั้งที่ไม่พบใบหน้า</div>
                </div>
                <div className="text-center p-2 bg-white rounded border">
                  <div className="text-xl font-bold text-red-600">{getFaceDetectionLossStats().totalLossTime}</div>
                  <div className="text-sm text-gray-600">วินาทีรวม</div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-between text-sm text-gray-600 mt-3">
              <span>📊 รวม {orientationStats.totalEvents} events</span>
              <span>🕐 เริ่มบันทึก: {orientationStats.sessionStartTime}</span>
              {orientationStats.lastEventTime && (
                <span>🕐 Event ล่าสุด: {orientationStats.lastEventTime}</span>
              )}
            </div>
          </div>
        )}
        {/* Control Buttons */}
        <ControlPanel isActive={isActive} onStop={stopTracking} />
      </div>
    </Card>
  )
}