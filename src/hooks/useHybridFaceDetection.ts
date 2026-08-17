'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { MediaPipeDetector, FaceTrackingData, OrientationStats } from '@/lib/mediapipe-detector'
import { YOLOv8FaceDetector, YOLOv8MultiFaceResult } from '@/lib/engines/yolov8-detector'

export interface HybridDetectionConfig {
  primaryIntervalMs?: number  // MediaPipe detection rate (Default: 100ms)
  yoloIntervalMs?: number     // YOLOv8 background multi-face check rate (Default: 1500ms)
  lookingAwayThresholdMs?: number // Threshold to trigger backend snapshot (Default: 3000ms)
}

export interface SecurityViolationEvent {
  id: string
  type: 'MULTI_FACE_DETECTED' | 'LOOKING_AWAY_EXCEEDED' | 'FACE_LOSS'
  message: string
  timestamp: string
  severity: 'WARNING' | 'CRITICAL'
  snapshotBlob?: string
}

export function useHybridFaceDetection(config: HybridDetectionConfig = {}) {
  const {
    primaryIntervalMs = 100,
    yoloIntervalMs = 1500,
    lookingAwayThresholdMs = 3000
  } = config

  const [isActive, setIsActive] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [mediaPipeData, setMediaPipeData] = useState<FaceTrackingData | null>(null)
  const [yoloMultiFaceData, setYoloMultiFaceData] = useState<YOLOv8MultiFaceResult | null>(null)
  const [violations, setViolations] = useState<SecurityViolationEvent[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [orientationStats, setOrientationStats] = useState<OrientationStats | null>(null)
  const [faceLossStats, setFaceLossStats] = useState<{ lossCount: number; totalLossTime: number }>({ lossCount: 0, totalLossTime: 0 })
  const [simulateIntruder, setSimulateIntruder] = useState(false)

  // Ref Instances
  const mpDetectorRef = useRef<MediaPipeDetector | null>(null)
  const yoloDetectorRef = useRef<YOLOv8FaceDetector | null>(null)

  // Interval Refs
  const primaryIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const yoloIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Tracking state refs
  const lookingAwayStartTimeRef = useRef<number | null>(null)
  const multiFaceConsecutiveFramesRef = useRef(0)
  const mediaPipeDataRef = useRef<FaceTrackingData | null>(null)
  const simulateIntruderRef = useRef(false)
  const lastViolationTimeMapRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    mediaPipeDataRef.current = mediaPipeData
  }, [mediaPipeData])

  useEffect(() => {
    simulateIntruderRef.current = simulateIntruder
  }, [simulateIntruder])

  // Initialize both detectors
  const initializeHybridDetectors = useCallback(async () => {
    setIsInitializing(true)
    try {
      if (!mpDetectorRef.current) {
        mpDetectorRef.current = new MediaPipeDetector()
        const ok = await mpDetectorRef.current.initialize()
        if (!ok) throw new Error('MediaPipe initialization failed')
      }

      if (!yoloDetectorRef.current) {
        yoloDetectorRef.current = new YOLOv8FaceDetector()
      }

      setIsInitializing(false)
      return true
    } catch (err) {
      console.error('❌ Hybrid Detector Init Error:', err)
      setIsInitializing(false)
      return false
    }
  }, [])

  // Add violation alert with log history limit and 5-second cooldown throttle per violation type
  const addViolation = useCallback((event: Omit<SecurityViolationEvent, 'id' | 'timestamp'>) => {
    const now = Date.now()
    const lastTime = lastViolationTimeMapRef.current.get(event.type) || 0
    const COOLDOWN_MS = 5000 // 5 วินาที cooldown เพื่อไม่ให้ trigger state update รัวๆ จน UI ค้าง

    if (now - lastTime < COOLDOWN_MS) {
      return // ข้ามหากเพิ่งเพิ่มประเภทเดียวกันภายใน 5 วินาทีที่ผ่านมา
    }

    lastViolationTimeMapRef.current.set(event.type, now)

    const newViolation: SecurityViolationEvent = {
      ...event,
      id: `viol_${now}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString()
    }

    setViolations(prev => [newViolation, ...prev].slice(0, 50))
    console.warn(`🚨 [SECURITY VIOLATION - ${event.severity}] ${event.message}`)
  }, [])

  // 1. Primary Loop: MediaPipe (High FPS / 100ms)
  const performPrimaryDetection = useCallback(async (video: HTMLVideoElement) => {
    if (!mpDetectorRef.current || !video || video.readyState < 2) return null

    try {
      const data = await mpDetectorRef.current.detectFromVideo(video)
      if (data) {
        setMediaPipeData(data)

        // Real-time update for orientation stats and face loss stats
        if (mpDetectorRef.current) {
          setOrientationStats(mpDetectorRef.current.getOrientationStats())
          setFaceLossStats(mpDetectorRef.current.getFaceDetectionLossStats())
        }

        // Check for MediaPipe's own multi-face count with temporal persistence debouncing (3 consecutive frames)
        if (data.multipleFaces && data.multipleFaces.count > 1) {
          multiFaceConsecutiveFramesRef.current += 1
          if (multiFaceConsecutiveFramesRef.current >= 3) {
            addViolation({
              type: 'MULTI_FACE_DETECTED',
              message: `[MediaPipe] ตรวจพบใบหน้าในกล้องจำนวน ${data.multipleFaces.count} คน!`,
              severity: 'CRITICAL'
            })
          }
        } else {
          multiFaceConsecutiveFramesRef.current = 0
        }

        // Check for sustained Looking Away anomaly
        if (data.orientation.isLookingAway) {
          if (!lookingAwayStartTimeRef.current) {
            lookingAwayStartTimeRef.current = Date.now()
          } else {
            const elapsed = Date.now() - lookingAwayStartTimeRef.current
            if (elapsed >= lookingAwayThresholdMs) {
              addViolation({
                type: 'LOOKING_AWAY_EXCEEDED',
                message: `ผู้สอบมองออกนอกจอนานเกิน ${(elapsed / 1000).toFixed(1)} วินาที`,
                severity: 'WARNING'
              })
              lookingAwayStartTimeRef.current = Date.now()
            }
          }
        } else {
          lookingAwayStartTimeRef.current = null
        }

        return data
      }
    } catch (err) {
      console.error('Error in Primary MediaPipe detection loop:', err)
      return null
    }
  }, [lookingAwayThresholdMs, addViolation])

  // 2. Background Loop: YOLOv8-Face (Lower FPS / 1500ms)
  const performBackgroundYoloScan = useCallback(async (video: HTMLVideoElement) => {
    if (!yoloDetectorRef.current || !video || video.readyState < 2) return null

    try {
      const currentLm = mediaPipeDataRef.current?.allFaceLandmarks
      const yoloResult = await yoloDetectorRef.current.detectMultiFace(
        video,
        currentLm,
        simulateIntruderRef.current
      )
      setYoloMultiFaceData(yoloResult)

      // Multi-Face Violation Check
      if (yoloResult.hasMultipleFaces) {
        addViolation({
          type: 'MULTI_FACE_DETECTED',
          message: `[YOLOv8 Background Scanner] พบใบหน้าบุคคลซ้อนในกล้องจำนวน ${yoloResult.faceCount} คน!`,
          severity: 'CRITICAL'
        })
      }
    } catch (err) {
      console.error('Error in Background YOLOv8 multi-face scan:', err)
    }
  }, [addViolation])

  // Start Dual Hybrid Tracking Loops
  const startHybridTracking = useCallback((videoRef: React.RefObject<HTMLVideoElement | null>) => {
    if (!videoRef.current) return
    setIsActive(true)

    if (primaryIntervalRef.current) clearInterval(primaryIntervalRef.current)
    if (yoloIntervalRef.current) clearInterval(yoloIntervalRef.current)
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current)

    // A) High-frequency Primary Loop (MediaPipe)
    primaryIntervalRef.current = setInterval(() => {
      if (videoRef.current) {
        performPrimaryDetection(videoRef.current)
      }
    }, primaryIntervalMs)

    // B) Low-frequency Background Loop (YOLOv8 Multi-face scan)
    yoloIntervalRef.current = setInterval(() => {
      if (videoRef.current) {
        performBackgroundYoloScan(videoRef.current)
      }
    }, yoloIntervalMs)

    // C) Live Real-Time Stats Update Loop (Every 250ms)
    statsIntervalRef.current = setInterval(() => {
      if (mpDetectorRef.current) {
        setOrientationStats(mpDetectorRef.current.getOrientationStats())
        setFaceLossStats(mpDetectorRef.current.getFaceDetectionLossStats())
      }
    }, 250)

    console.log(`🚀 Started Hybrid Tracking (Primary: ${primaryIntervalMs}ms, Background YOLO: ${yoloIntervalMs}ms)`)
  }, [primaryIntervalMs, yoloIntervalMs, performPrimaryDetection, performBackgroundYoloScan])

  // Stop Tracking & Cleanup Resources
  const stopHybridTracking = useCallback(() => {
    setIsActive(false)

    if (primaryIntervalRef.current) {
      clearInterval(primaryIntervalRef.current)
      primaryIntervalRef.current = null
    }
    if (yoloIntervalRef.current) {
      clearInterval(yoloIntervalRef.current)
      yoloIntervalRef.current = null
    }
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current)
      statsIntervalRef.current = null
    }

    if (mpDetectorRef.current) {
      mpDetectorRef.current.destroy()
      mpDetectorRef.current = null
    }
    yoloDetectorRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      stopHybridTracking()
    }
  }, [stopHybridTracking])

  // Delegate methods to internal MediaPipeDetector instance
  const startRecording = useCallback(() => {
    if (mpDetectorRef.current) {
      mpDetectorRef.current.startRecording()
      setIsRecording(true)
      return true
    }
    return false
  }, [])

  const stopRecording = useCallback(() => {
    if (mpDetectorRef.current) {
      const events = mpDetectorRef.current.stopRecording()
      setIsRecording(false)
      return events
    }
    setIsRecording(false)
    return []
  }, [])

  const getCurrentStats = useCallback(() => {
    return mpDetectorRef.current ? mpDetectorRef.current.getOrientationStats() : null
  }, [])

  const getFaceDetectionLossStats = useCallback(() => {
    return mpDetectorRef.current ? mpDetectorRef.current.getFaceDetectionLossStats() : { lossCount: 0, totalLossTime: 0 }
  }, [])

  const getFaceDetectionLossEvents = useCallback(() => {
    return mpDetectorRef.current ? mpDetectorRef.current.getFaceDetectionLossEvents() : []
  }, [])

  const getOrientationHistory = useCallback(() => {
    return mpDetectorRef.current ? mpDetectorRef.current.getDetailedOrientationHistory() : []
  }, [])

  return {
    isInitializing,
    isActive,
    mediaPipeData,
    yoloMultiFaceData,
    violations,
    isRecording,
    setIsRecording,
    orientationStats,
    setOrientationStats,
    faceLossStats,
    simulateIntruder,
    setSimulateIntruder,
    initializeHybridDetectors,
    startHybridTracking,
    stopHybridTracking,
    startRecording,
    stopRecording,
    getCurrentStats,
    getFaceDetectionLossStats,
    getFaceDetectionLossEvents,
    getOrientationHistory,
  }
}
