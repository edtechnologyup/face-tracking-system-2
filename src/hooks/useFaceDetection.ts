'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { MediaPipeDetector, FaceTrackingData, OrientationEvent, OrientationStats } from '@/lib/mediapipe-detector'

export function useFaceDetection() {
  const [isActive, setIsActive] = useState(false)
  const [currentData, setCurrentData] = useState<FaceTrackingData | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [orientationStats, setOrientationStats] = useState<OrientationStats | null>(null)
  
  const detectorRef = useRef<MediaPipeDetector | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const initializeDetector = useCallback(async () => {
    if (!detectorRef.current) {
      detectorRef.current = new MediaPipeDetector()
      
      const initialized = await detectorRef.current.initialize()
      
      if (!initialized) {
        throw new Error('MediaPipe initialization failed')
      }
    }
    
    return true
  }, [])

  const performDetection = useCallback(async (videoRef: React.RefObject<HTMLVideoElement | null>) => {
    if (!detectorRef.current || !videoRef.current) return

    try {
      const trackingData = await detectorRef.current.detectFromVideo(videoRef.current)
      
      if (trackingData) {
        setCurrentData(trackingData)
        return trackingData
      }
    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาดในการตรวจจับ:', error)
    }
    
    return null
  }, [])

  const startDetection = useCallback((videoRef: React.RefObject<HTMLVideoElement | null>, onDetection?: (data: FaceTrackingData) => void) => {
    setIsActive(true)
    
    intervalRef.current = setInterval(async () => {
      const data = await performDetection(videoRef)
      if (data && onDetection) {
        onDetection(data)
      }
    }, 100) // ทุก 100ms
  }, [performDetection])

  const stopDetection = useCallback(() => {
    setIsActive(false)
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    
    if (detectorRef.current) {
      detectorRef.current.destroy()
      detectorRef.current = null
    }
  }, [])

  // Cleanup เมื่อ component unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current)
      }
      if (detectorRef.current) {
        detectorRef.current.destroy()
      }
    }
  }, [])

  // เริ่มบันทึก orientation data
  const startRecording = useCallback(() => {
    if (!detectorRef.current) return false
    
    detectorRef.current.startRecording()
    setIsRecording(true)
    
    // อัปเดตสถิติทุก 2 วินาที
    statsIntervalRef.current = setInterval(() => {
      if (detectorRef.current) {
        const stats = detectorRef.current.getOrientationStats()
        setOrientationStats(stats)
      }
    }, 2000)
    
    console.log('🎬 เริ่มบันทึก orientation data')
    return true
  }, [])
  
  // หยุดบันทึกและคืนค่าข้อมูล
  const stopRecording = useCallback((): OrientationEvent[] => {
    if (!detectorRef.current) return []
    
    const events = detectorRef.current.stopRecording()
    setIsRecording(false)
    
    // หยุด stats interval
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current)
      statsIntervalRef.current = null
    }
    
    // อัปเดตสถิติครั้งสุดท้าย
    const finalStats = detectorRef.current.getOrientationStats()
    setOrientationStats(finalStats)
    
    console.log('🛑 หยุดบันทึก orientation data')
    console.log('📊 ข้อมูลที่บันทึกได้:', events)
    
    return events
  }, [])
  
  // ดึงข้อมูลสถิติปัจจุบัน
  const getCurrentStats = useCallback((): OrientationStats | null => {
    if (!detectorRef.current) return null
    return detectorRef.current.getOrientationStats()
  }, [])
  
  // ดึงประวัติ orientation events ทั้งหมด
  const getOrientationHistory = useCallback((): OrientationEvent[] => {
    if (!detectorRef.current) return []
    return detectorRef.current.getDetailedOrientationHistory()
  }, [])

  // ดึงข้อมูลสถิติ face detection loss
  const getFaceDetectionLossStats = useCallback((): { lossCount: number; totalLossTime: number } => {
    if (!detectorRef.current) return { lossCount: 0, totalLossTime: 0 }
    return detectorRef.current.getFaceDetectionLossStats()
  }, [])

  // ดึงข้อมูล face detection loss events
  const getFaceDetectionLossEvents = useCallback(() => {
    if (!detectorRef.current) return []
    return detectorRef.current.getFaceDetectionLossEvents()
  }, [])

  // บันทึก face mismatch event
  const recordFaceMismatchEvent = useCallback((startTime: string, endTime: string, duration: number) => {
    if (detectorRef.current) {
      detectorRef.current.recordFaceMismatchEvent(startTime, endTime, duration)
    }
  }, [])

  return {
    isActive,
    currentData,
    isRecording,
    orientationStats,
    initializeDetector,
    startDetection,
    stopDetection,
    performDetection,
    startRecording,
    stopRecording,
    getCurrentStats,
    getOrientationHistory,
    getFaceDetectionLossStats,
    getFaceDetectionLossEvents,
    recordFaceMismatchEvent,
    detector: detectorRef.current
  }
}