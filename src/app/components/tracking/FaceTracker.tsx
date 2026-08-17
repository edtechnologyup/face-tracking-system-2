'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { Card } from '@/app/components/ui/Card'
import { VideoPlayer } from './VideoPlayer'
import { OverlayCanvas } from './OverlayCanvas'
import { DetectionStats } from './DetectionStats'
import { ControlPanel } from './ControlPanel'
import { useCamera } from '@/hooks/useCamera'
import { useHybridFaceDetection } from '@/hooks/useHybridFaceDetection'
import { drawSciFiFaceMesh } from '@/lib/face-mesh-utils'
import toast from 'react-hot-toast'

interface FaceTrackerProps {
  onTrackingStop: () => void
  sessionName?: string
}

interface AnalyticsResult {
  liveness?: {
    isReal: boolean
    score: number
    label: 'REAL' | 'SPOOF'
  }
  l2csGaze?: {
    pitch: number
    yaw: number
    gazeDirection: 'LOOKING_LEFT' | 'LOOKING_RIGHT' | 'LOOKING_DOWN_NOTES' | 'LOOKING_UP' | 'SCREEN_CENTER'
    isLookingOffScreen: boolean
  }
}

export function FaceTracker({ onTrackingStop, sessionName = 'การสอบ' }: FaceTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  // State สำหรับ session management
  const sessionIdRef = useRef<string | null>(null)
  const isSessionSavedRef = useRef(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [analyticsResult, setAnalyticsResult] = useState<AnalyticsResult | null>(null)

  // ใช้ Hybrid custom hooks
  const { initializeCamera, stopCamera } = useCamera()
  const { 
    isActive, 
    mediaPipeData,
    yoloMultiFaceData,
    violations,
    isRecording, 
    orientationStats, 
    faceLossStats,
    initializeHybridDetectors, 
    startHybridTracking, 
    stopHybridTracking,
    startRecording,
    stopRecording,
    getCurrentStats,
    getFaceDetectionLossStats,
    getFaceDetectionLossEvents,
    getOrientationHistory
  } = useHybridFaceDetection({
    primaryIntervalMs: 100,
    yoloIntervalMs: 1200,
    lookingAwayThresholdMs: 3000
  })

  // Ref สำหรับเก็บ violations ล่าสุดเพื่อไม่ให้ callback re-trigger
  const violationsRef = useRef(violations)
  useEffect(() => {
    violationsRef.current = violations
  }, [violations])




  // 🎨 วาดการแสดงผล Sci-Fi Mesh & YOLO Bounding Boxes บน Canvas
  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 1. Draw MediaPipe 468-point Mesh for candidate face
    if (mediaPipeData && mediaPipeData.isDetected && mediaPipeData.landmarks) {
      drawSciFiFaceMesh(ctx, mediaPipeData.landmarks, video, canvas.width, canvas.height, mediaPipeData.orientation.isLookingAway)
    }

    // 2. Draw YOLOv8 Intruder Bounding Boxes
    if (yoloMultiFaceData && yoloMultiFaceData.boxes) {
      yoloMultiFaceData.boxes.forEach((box) => {
        if (!box.isPrimary) {
          const vx = (box.x / 100) * canvas.width
          const vy = (box.y / 100) * canvas.height
          const vw = (box.width / 100) * canvas.width
          const vh = (box.height / 100) * canvas.height

          ctx.strokeStyle = '#EF4444'
          ctx.lineWidth = 3
          ctx.strokeRect(vx, vy, vw, vh)

          ctx.fillStyle = '#EF4444'
          ctx.font = 'bold 12px sans-serif'
          ctx.fillText(`🚨 INTRUDER (${(box.confidence * 100).toFixed(0)}%)`, vx, vy > 15 ? vy - 5 : vy + 15)
        }
      })
    }
  }, [mediaPipeData, yoloMultiFaceData])

  // 🚀 ส่งภาพ Snapshot เพื่อวิเคราะห์ Phase 3 Deep Analytics (L2CS-Net + MiniFASNet) ไปยัง API
  const sendSnapshotForDeepAnalytics = useCallback(async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return

    try {
      const offscreenCanvas = document.createElement('canvas')
      offscreenCanvas.width = 320
      offscreenCanvas.height = 240
      const ctx = offscreenCanvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(video, 0, 0, 320, 240)
      const base64Image = offscreenCanvas.toDataURL('image/jpeg', 0.8)

      const token = localStorage.getItem('token')
      const landmarks = mediaPipeData?.landmarks ? mediaPipeData.landmarks.map(l => ({ x: l.x, y: l.y, z: l.z })) : undefined

      const response = await fetch('/api/tracking/snapshot-analytics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          image: base64Image,
          landmarks: landmarks
        })
      })

      const resData = await response.json()
      if (response.ok && resData.success && resData.data) {
        setAnalyticsResult({
          liveness: resData.data.liveness,
          l2csGaze: resData.data.l2csGaze
        })
      }
    } catch (err) {
      console.warn('Backend snapshot analytics warning:', err)
    }
  }, [mediaPipeData])

  // Periodic Snapshot Trigger (ทุกๆ 8 วินาทีระหว่างการติดตาม)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    if (isActive) {
      const timeout = setTimeout(() => {
        sendSnapshotForDeepAnalytics()
      }, 2000)

      interval = setInterval(() => {
        sendSnapshotForDeepAnalytics()
      }, 8000)

      return () => {
        clearTimeout(timeout)
        if (interval) clearInterval(interval)
      }
    }
  }, [isActive, sendSnapshotForDeepAnalytics])

  // ตัวแปรป้องกันการสร้าง session พร้อมกัน
  const sessionCreationInProgress = useRef(false)

  // ฟังก์ชันสร้าง tracking session
  const createTrackingSession = useCallback(async () => {
    try {
      if (sessionIdRef.current) {
        return sessionIdRef.current
      }

      if (sessionCreationInProgress.current) {
        return null
      }

      sessionCreationInProgress.current = true
      setIsLoading(true)
      setApiError(null)

      const token = localStorage.getItem('token')
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
      isSessionSavedRef.current = false
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
  const endTrackingSession = useCallback(async (sessionId: string, status?: string, isKeepAlive = false) => {
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
          sessionId: sessionId,
          status: status
        }),
        keepalive: isKeepAlive
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'ไม่สามารถอัปเดต session ได้')
      }

      console.log(`✅ อัปเดต tracking session สำเร็จ (${status}):`, result.data)
      return result.data
    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาดในการอัปเดต session:', error)
      setApiError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ')
      return null
    }
  }, [])

  // เริ่มการติดตามด้วย Hybrid Dual-Loop Architecture
  const startTracking = useCallback(async () => {
    try {
      let sessionId = sessionIdRef.current
      if (!sessionId) {
        sessionId = await createTrackingSession()
        if (!sessionId) {
          alert('ไม่สามารถสร้าง tracking session ได้\nกรุณาตรวจสอบการเข้าสู่ระบบ')
          return
        }
      }

      const cameraInitialized = await initializeCamera(videoRef)
      if (!cameraInitialized) {
        alert('ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบการอนุญาต')
        return
      }

      const ok = await initializeHybridDetectors()
      if (!ok) {
        alert('ไม่สามารถเริ่มต้น AI Hybrid Detectors ได้')
        return
      }

      startHybridTracking(videoRef)
      
      setTimeout(() => {
        startRecording()
      }, 1000)
    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาดในการเริ่มต้น:', error)
      alert('สถาปัตยกรรม Hybrid ไม่สามารถเริ่มต้นได้\nกรุณาลองใหม่อีกครั้ง')
    }
  }, [createTrackingSession, initializeCamera, initializeHybridDetectors, startHybridTracking, startRecording])

  // ฟังก์ชันส่งข้อมูลไป API
  const saveOrientationData = useCallback(async (
    sessionId: string, 
    events: unknown[], 
    stats: unknown, 
    faceDetectionLossStats?: { lossCount: number; totalLossTime: number }, 
    faceDetectionLossEvents?: unknown[],
    isKeepAlive = false
  ) => {
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
          faceDetectionLossEvents: faceDetectionLossEvents || [],
          securityViolations: violationsRef.current || []
        }),
        keepalive: isKeepAlive
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
        isSessionSavedRef.current = true
        // จบ tracking session สถานะสำเร็จ
        await endTrackingSession(currentSessionId, 'COMPLETED')
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
        // บันทึกไม่สำเร็จ -> อัปเดตสถานะเป็น INTERRUPTED (หยุดการบันทึกกลางคัน)
        await endTrackingSession(currentSessionId, 'INTERRUPTED')
        sessionIdRef.current = null
        sessionCreationInProgress.current = false

        const statsData = stats as {
          leftTurns: { count: number; totalDuration: number };
          rightTurns: { count: number; totalDuration: number };
          lookingDown: { count: number; totalDuration: number };
          lookingUp: { count: number; totalDuration: number };
          totalEvents: number;
        }
        alert(`เกิดข้อผิดพลาดในการบันทึก! ⚠️\n\nสรุปผลลัพธ์:\n• หันซ้าย: ${statsData?.leftTurns?.count || 0} ครั้ง (${statsData?.leftTurns?.totalDuration || 0} วิ)\n• หันขวา: ${statsData?.rightTurns?.count || 0} ครั้ง (${statsData?.rightTurns?.totalDuration || 0} วิ)\n• ก้มหน้า: ${statsData?.lookingDown?.count || 0} ครั้ง (${statsData?.lookingDown?.totalDuration || 0} วิ)\n• เงยหน้า: ${statsData?.lookingUp?.count || 0} ครั้ง (${statsData?.lookingUp?.totalDuration || 0} วิ)\n• รวม events: ${statsData?.totalEvents || 0} ครั้ง\n\n⚠️ สถานะถูกเปลี่ยนเป็น "หยุดการบันทึกกลางคัน"`)
      }
      setIsLoading(false)
    } else {
      if (currentSessionId) {
        await endTrackingSession(currentSessionId, 'INTERRUPTED')
        sessionIdRef.current = null
        sessionCreationInProgress.current = false
      }
      const statsData = stats as {
        leftTurns: { count: number; totalDuration: number };
        rightTurns: { count: number; totalDuration: number };
        lookingDown: { count: number; totalDuration: number };
        lookingUp: { count: number; totalDuration: number };
        totalEvents: number;
      }
      alert(`หยุดติดตามแล้ว!\n\nสรุปผลลัพธ์:\n• หันซ้าย: ${statsData?.leftTurns?.count || 0} ครั้ง (${statsData?.leftTurns?.totalDuration || 0} วิ)\n• หันขวา: ${statsData?.rightTurns?.count || 0} ครั้ง (${statsData?.rightTurns?.totalDuration || 0} วิ)\n• ก้มหน้า: ${statsData?.lookingDown?.count || 0} ครั้ง (${statsData?.lookingDown?.totalDuration || 0} วิ)\n• เงยหน้า: ${statsData?.lookingUp?.count || 0} ครั้ง (${statsData?.lookingUp?.totalDuration || 0} วิ)\n• รวม events: ${statsData?.totalEvents || 0} ครั้ง\n\n⚠️ สถานะถูกเปลี่ยนเป็น "หยุดการบันทึกกลางคัน"`)
    }
  }, [stopRecording, getCurrentStats, currentSessionId, saveOrientationData, endTrackingSession, getFaceDetectionLossStats, getFaceDetectionLossEvents])

  // หยุดการติดตาม
  const stopTracking = useCallback(async () => {
    // หยุดบันทึกก่อน (ถ้ากำลังบันทึกอยู่)
    if (isRecording) {
      await handleStopRecording()
    } else if (currentSessionId && !isSessionSavedRef.current) {
      await endTrackingSession(currentSessionId, 'INTERRUPTED')
    }
    
    stopHybridTracking()
    stopCamera(videoRef)
    // ล้าง session reference และ flags เมื่อหยุดการติดตาม
    sessionIdRef.current = null
    sessionCreationInProgress.current = false
    onTrackingStop()
  }, [stopHybridTracking, stopCamera, onTrackingStop, isRecording, handleStopRecording, currentSessionId, endTrackingSession])

  // ฟังก์ชันส่วนกลางสำหรับบันทึกและซิงค์ข้อมูล session ปัจจุบันแบบฉุกเฉินหรือกรณีขาดการเชื่อมต่อ
  const flushSessionData = useCallback((sessionStatus: string = 'DISCONNECTED', isKeepAlive = true) => {
    const sessionId = sessionIdRef.current
    const isSaved = isSessionSavedRef.current
    
    if (!sessionId || isSaved) return

    const token = localStorage.getItem('token')
    if (!token) return

    try {
      const events = stopRecording()
      const stats = getCurrentStats()
      const faceDetectionLossStats = getFaceDetectionLossStats()
      const faceDetectionLossEvents = getFaceDetectionLossEvents()
      
      const orientationEvents = ((events as Array<{
        startTime: string;
        endTime: string;
        direction: string;
        duration: number;
        maxYaw?: number;
        maxPitch?: number;
        confidence?: number;
      }>) || [])
        .filter(event => event.direction !== 'CENTER')
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

      // 1. บันทึกข้อมูล logs
      fetch('/api/tracking/orientation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId: sessionId,
          events: orientationEvents,
          sessionStats: stats || {
            totalEvents: 0,
            leftTurns: { count: 0, totalDuration: 0 },
            rightTurns: { count: 0, totalDuration: 0 },
            lookingUp: { count: 0, totalDuration: 0 },
            lookingDown: { count: 0, totalDuration: 0 },
            centerTime: 0,
            sessionStartTime: new Date().toISOString()
          },
          faceDetectionLoss: faceDetectionLossStats || { lossCount: 0, totalLossTime: 0 },
          faceDetectionLossEvents: faceDetectionLossEvents || [],
          securityViolations: violationsRef.current || []
        }),
        keepalive: isKeepAlive
      }).catch(err => console.error('Auto-sync orientation error:', err))

      // 2. อัปเดตสถานะ session
      fetch('/api/tracking/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId: sessionId,
          status: sessionStatus
        }),
        keepalive: isKeepAlive
      }).catch(err => console.error('Auto-sync session status error:', err))

      if (sessionStatus !== 'IN_PROGRESS') {
        isSessionSavedRef.current = true
      }
    } catch (err) {
      console.error('Flush session data error:', err)
    }
  }, [stopRecording, getCurrentStats, getFaceDetectionLossStats, getFaceDetectionLossEvents])

  // 🔄 ระบบ Periodic Auto-Sync บันทึกข้อมูลลง DB อัตโนมัติทุกๆ 15 วินาทีระหว่างการติดตาม
  useEffect(() => {
    let syncInterval: NodeJS.Timeout | null = null

    if (isActive && isRecording && currentSessionId) {
      syncInterval = setInterval(() => {
        const sessionId = sessionIdRef.current
        const isSaved = isSessionSavedRef.current
        const token = localStorage.getItem('token')

        if (sessionId && !isSaved && token) {
          const stats = getCurrentStats()
          const events = getOrientationHistory()
          const faceLossStats = getFaceDetectionLossStats()
          const faceLossEvents = getFaceDetectionLossEvents()

          if (stats && events.length > 0) {
            saveOrientationData(sessionId, events, stats, faceLossStats, faceLossEvents, true)
              .then(() => console.log('🔄 [Auto-Sync] บันทึกข้อมูลการติดตามลงฐานข้อมูลแบบเรียลไทม์สำเร็จ'))
              .catch(err => console.warn('⚠️ [Auto-Sync] ไม่สามารถซิงค์ข้อมูลได้:', err))
          }
        }
      }, 15000) // ทุก 15 วินาที
    }

    return () => {
      if (syncInterval) clearInterval(syncInterval)
    }
  }, [isActive, isRecording, currentSessionId, getCurrentStats, getOrientationHistory, getFaceDetectionLossStats, getFaceDetectionLossEvents, saveOrientationData])

  // 🛡️ ดักจับเหตุการณ์ปิดแท็บ, ย้ายหน้า, ซ่อนแอป (beforeunload, pagehide)
  useEffect(() => {
    const handleUnloadEvents = () => {
      flushSessionData('DISCONNECTED', true)
    }

    window.addEventListener('beforeunload', handleUnloadEvents)
    window.addEventListener('pagehide', handleUnloadEvents)

    return () => {
      window.removeEventListener('beforeunload', handleUnloadEvents)
      window.removeEventListener('pagehide', handleUnloadEvents)
    }
  }, [flushSessionData])

  // Cleanup เมื่อ component unmount (เช่น ย้ายหน้าภายใต้ SPA)
  useEffect(() => {
    return () => {
      stopCamera(videoRef)
      flushSessionData('DISCONNECTED', true)
      sessionIdRef.current = null
      sessionCreationInProgress.current = false
    }
  }, [stopCamera, flushSessionData])

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
        {/* Video and Canvas Container with Live Face Count HUD Badge */}
        <div className="relative mb-6 rounded-2xl overflow-hidden shadow-lg border border-gray-200">
          <VideoPlayer ref={videoRef} />
          <OverlayCanvas ref={canvasRef} videoRef={videoRef} />

          {/* Live Detected Face Count Badge on Video Corner */}
          {isActive && (
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
              {mediaPipeData?.multipleFaces?.isSecurityRisk || (yoloMultiFaceData && yoloMultiFaceData.faceCount > 1) ? (
                <div className="bg-red-600/90 text-white border border-red-400 backdrop-blur-md flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-lg text-xs font-bold font-mono animate-bounce">
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping"></span>
                  <span>🚨 ตรวจพบ: {yoloMultiFaceData?.faceCount || mediaPipeData?.multipleFaces?.count || 2} ใบหน้า (เสี่ยงทุจริต!)</span>
                </div>
              ) : mediaPipeData?.isDetected ? (
                <div className="bg-slate-900/80 text-emerald-400 border border-emerald-500/40 backdrop-blur-md flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-lg text-xs font-bold font-mono">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>👤 ตรวจพบ: 1 ใบหน้า (ผู้สอบหลัก)</span>
                </div>
              ) : (
                <div className="bg-slate-900/80 text-rose-400 border border-rose-500/40 backdrop-blur-md flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-lg text-xs font-bold font-mono">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                  <span>❌ ไม่พบใบหน้าในกล้อง</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Current Primary Detection Status & Live Behavior Event Counters */}
        <DetectionStats 
          data={mediaPipeData} 
          isActive={isActive} 
          orientationStats={orientationStats}
          faceLossStats={faceLossStats}
        />

        {/* Phase 3 Backend Analytics Status (MiniFASNet Liveness + L2CS-Net 3D Gaze) */}
        {isActive && analyticsResult && (
          <div className="mb-4 p-4 bg-slate-900 text-white rounded-xl border border-slate-800 shadow-md">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-purple-400">
                <span>🧠 Backend Hybrid AI Deep Analytics (Phase 3)</span>
              </h3>
              <span className="text-[10px] bg-purple-900/60 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
                LIVE SNAPSHOT
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* MiniFASNet Anti-Spoofing Status */}
              <div className={`p-3 rounded-lg border flex items-center justify-between ${
                analyticsResult.liveness?.isReal 
                  ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-800/50 text-rose-300'
              }`}>
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    <span>🛡️ MiniFASNet Liveness:</span>
                    <span>{analyticsResult.liveness?.label === 'REAL' ? '🟢 REAL (คนจริง)' : '🚨 SPOOF (ภาพปลอม)'}</span>
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    คะแนนความสมจริง: {((analyticsResult.liveness?.score || 0) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* L2CS-Net 3D Gaze Direction */}
              <div className={`p-3 rounded-lg border flex items-center justify-between ${
                analyticsResult.l2csGaze?.isLookingOffScreen
                  ? 'bg-amber-950/40 border-amber-800/50 text-amber-300'
                  : 'bg-indigo-950/40 border-indigo-800/50 text-indigo-300'
              }`}>
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    <span>👁️ L2CS-Net 3D Gaze:</span>
                    <span>{analyticsResult.l2csGaze?.gazeDirection}</span>
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Pitch: {analyticsResult.l2csGaze?.pitch}° | Yaw: {analyticsResult.l2csGaze?.yaw}°
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phase 1 YOLOv8 Intruder Alert Security Panel */}
        {isActive && yoloMultiFaceData?.hasMultipleFaces && (
          <div className="mb-4 p-4 bg-red-900/20 border-2 border-red-500 rounded-xl text-red-200 animate-pulse">
            <div className="flex items-center gap-2 font-bold text-red-400">
              <span className="text-xl">🚨</span>
              <span>[YOLOv8 Background Scanner] ตรวจพบบุคคลซ้อนในกล้อง ({yoloMultiFaceData.faceCount} คน)!</span>
            </div>
            <p className="text-xs text-red-300 mt-1">
              ระบบตรวจจับผู้บุกรุก (Intruder Detection) กำลังทำงานในโหมด Background Scan เพื่อความปลอดภัยสูงสุด
            </p>
          </div>
        )}

        {/* Security Violations Log Stream */}
        {isActive && violations.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs space-y-2">
            <div className="font-bold text-red-800 flex items-center justify-between">
              <span>🚨 บันทึกเหตุการณ์ผิดปกติทางการสอบ (Security Violations):</span>
              <span className="bg-red-200 text-red-900 px-2 py-0.5 rounded-full">{violations.length} รายการ</span>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {violations.slice(0, 10).map((v) => (
                <div key={v.id} className="p-2 bg-white rounded border border-red-100 flex justify-between items-center text-[11px]">
                  <span className="font-medium text-red-700">{v.message}</span>
                  <span className="text-gray-400 text-[10px]">{new Date(v.timestamp).toLocaleTimeString('th-TH')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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