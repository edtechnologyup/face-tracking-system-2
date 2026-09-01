'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { MediaPipeDetector, FaceTrackingData, OrientationStats } from '@/lib/mediapipe-detector'
import { YOLOv8FaceDetector, YOLOv8MultiFaceResult } from '@/lib/engines/yolov8-detector'
import { Dlib68PointDetector, DlibDetectionResult } from '@/lib/engines/dlib-detector'
import { OpenFaceDetectionResult } from '@/lib/engines/openface-detector'
import {
  analyzeOpenFaceRemote,
  mapRemoteToOpenFaceResult,
} from '@/lib/engines/openface-client'
import {
  captureVideoFrameBase64,
  OPENFACE_REMOTE_MIN_INTERVAL_MS,
} from '@/lib/engines/openface-constants'
import { L2CSGazeDetector, L2CSGazeResult } from '@/lib/engines/l2cs-gaze-detector'
import { loadFaceApiModels } from '@/lib/face-api/detection'

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

import {
  buildMultiEngineBenchmark,
  createBenchmarkSnapshotId,
  type EngineBenchmarkMetric,
  type MultiEngineBenchmarkPayload,
} from '@/lib/engine-benchmark'

export type EngineMetric = EngineBenchmarkMetric
export type MultiEngineBenchmarkData = MultiEngineBenchmarkPayload

export function useHybridFaceDetection(config: HybridDetectionConfig = {}) {
  const {
    primaryIntervalMs = 100,
    yoloIntervalMs = 1500,
    lookingAwayThresholdMs = 3000
  } = config

  const [isActive, setIsActive] = useState(false)
  const isActiveRef = useRef(false)

  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])
  const [isInitializing, setIsInitializing] = useState(false)
  const [mediaPipeData, setMediaPipeData] = useState<FaceTrackingData | null>(null)
  const [yoloMultiFaceData, setYoloMultiFaceData] = useState<YOLOv8MultiFaceResult | null>(null)
  const [dlibData, setDlibData] = useState<DlibDetectionResult | null>(null)
  const [openFaceData, setOpenFaceData] = useState<OpenFaceDetectionResult | null>(null)
  const [l2csGazeData, setL2csGazeData] = useState<L2CSGazeResult | null>(null)
  const [benchmarkMetrics, setBenchmarkMetrics] = useState<MultiEngineBenchmarkData | null>(null)

  const [violations, setViolations] = useState<SecurityViolationEvent[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [orientationStats, setOrientationStats] = useState<OrientationStats | null>(null)
  const [faceLossStats, setFaceLossStats] = useState<{ lossCount: number; totalLossTime: number }>({ lossCount: 0, totalLossTime: 0 })
  const [simulateIntruder, setSimulateIntruder] = useState(false)

  // Ref Instances for 4 Face Detection Engines
  const mpDetectorRef = useRef<MediaPipeDetector | null>(null)
  const yoloDetectorRef = useRef<YOLOv8FaceDetector | null>(null)
  const dlibDetectorRef = useRef<Dlib68PointDetector | null>(null)
  const l2csDetectorRef = useRef<L2CSGazeDetector | null>(null)

  // Interval Refs
  const primaryIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const yoloIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const openfaceIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Tracking state refs
  const lookingAwayStartTimeRef = useRef<number | null>(null)
  const multiFaceConsecutiveFramesRef = useRef(0)
  const mediaPipeDataRef = useRef<FaceTrackingData | null>(null)
  const openFaceDataRef = useRef<OpenFaceDetectionResult | null>(null)
  const benchmarkMetricsRef = useRef<MultiEngineBenchmarkData | null>(null)
  const syncedBenchmarkMetricsRef = useRef<MultiEngineBenchmarkData | null>(null)
  const syncedCaptureInFlightRef = useRef(false)
  const simulateIntruderRef = useRef(false)
  const lastViolationTimeMapRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    mediaPipeDataRef.current = mediaPipeData
  }, [mediaPipeData])

  useEffect(() => {
    openFaceDataRef.current = openFaceData
  }, [openFaceData])

  useEffect(() => {
    benchmarkMetricsRef.current = benchmarkMetrics
  }, [benchmarkMetrics])

  useEffect(() => {
    simulateIntruderRef.current = simulateIntruder
  }, [simulateIntruder])

  // Initialize all 4 detector engines
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
        await yoloDetectorRef.current.initialize()
      }

      if (!dlibDetectorRef.current) {
        dlibDetectorRef.current = new Dlib68PointDetector()
        await dlibDetectorRef.current.initialize()
      }

      if (!l2csDetectorRef.current) {
        l2csDetectorRef.current = new L2CSGazeDetector()
        await l2csDetectorRef.current.initialize()
      }

      await loadFaceApiModels()

      setIsInitializing(false)
      return true
    } catch (err) {
      console.error('❌ Multi-Engine Detector Init Error:', err)
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

  // 1. Primary Loop: MediaPipe + Dlib + OpenFace (High FPS / 100ms)
  const performPrimaryDetection = useCallback(async (video: HTMLVideoElement) => {
    if (!mpDetectorRef.current || !video || video.readyState < 2) return null

    try {
      const mpStartTime = performance.now()
      const data = await mpDetectorRef.current.detectFromVideo(video)
      const mpEndTime = performance.now()
      const mpLatency = Number((mpEndTime - mpStartTime).toFixed(1))

      if (data) {
        setMediaPipeData(data)

        // Real-time update for orientation stats and face loss stats
        if (mpDetectorRef.current) {
          setOrientationStats(mpDetectorRef.current.getOrientationStats())
          setFaceLossStats(mpDetectorRef.current.getFaceDetectionLossStats())
        }

        const landmarks = data.landmarks

        // Run YOLOv8-Face (Model 2) concurrently
        let yRes: YOLOv8MultiFaceResult | null = null
        if (yoloDetectorRef.current) {
          yRes = await yoloDetectorRef.current.detectMultiFace(video, undefined, simulateIntruderRef.current)
          setYoloMultiFaceData(yRes)
        }

        let dRes: DlibDetectionResult | null = null
        if (dlibDetectorRef.current) {
          dRes = await dlibDetectorRef.current.detect(video)
          setDlibData(dRes)
        }

        let l2csRes: L2CSGazeResult | null = null
        if (l2csDetectorRef.current) {
          const faceBox =
            dRes?.detectionBox ??
            (yRes?.primaryBox
              ? {
                  x: yRes.primaryBox.x,
                  y: yRes.primaryBox.y,
                  width: yRes.primaryBox.width,
                  height: yRes.primaryBox.height,
                }
              : undefined);
          l2csRes = await l2csDetectorRef.current.predictGazeAsync(video, {
            landmarks,
            faceBox,
          })
          setL2csGazeData(l2csRes)
        }

        const ofRes = openFaceDataRef.current

        const liveBenchmark = buildMultiEngineBenchmark({
          mpLatencyMs: mpLatency,
          mpIsDetected: data.isDetected,
          mpConfidence: data.confidence || 0,
          mpLandmarksCount: data.landmarks?.length || 0,
          yolo: yRes
            ? {
                isDetected: yRes.isDetected,
                latencyMs: yRes.latencyMs,
                confidence: yRes.confidence,
                faceCount: yRes.faceCount,
              }
            : null,
          dlib: dRes
            ? {
                isDetected: dRes.isDetected,
                latencyMs: dRes.latencyMs,
                confidence: dRes.confidence,
                landmarksCount: dRes.landmarks68?.length || 0,
              }
            : null,
          openface: ofRes
            ? {
                isDetected: ofRes.isDetected,
                confidence: ofRes.confidence,
                clientRoundTripMs: ofRes.clientRoundTripMs ?? ofRes.latencyMs ?? null,
                serverLatencyMs: ofRes.serverLatencyMs ?? null,
                resultTimestamp: ofRes.timestamp ?? null,
              }
            : null,
          snapshotSynced: false,
        })

        setBenchmarkMetrics(liveBenchmark)

        // Check for MediaPipe's own multi-face count
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
      console.error('Error in Primary Multi-Model detection loop:', err)
      return null
    }
  }, [lookingAwayThresholdMs, addViolation])

  /** Same-frame benchmark: MP + YOLO + Dlib on live video, OpenFace on captured JPEG — for DB comparison. */
  const captureSyncedBenchmark = useCallback(async (video: HTMLVideoElement) => {
    if (!mpDetectorRef.current || !video || video.readyState < 2) return null
    if (syncedCaptureInFlightRef.current) {
      return syncedBenchmarkMetricsRef.current
    }

    syncedCaptureInFlightRef.current = true
    const captureNow = Date.now()
    const snapshotId = createBenchmarkSnapshotId()
    const frameBase64 = captureVideoFrameBase64(video)

    try {
      const mpStart = performance.now()
      const mpData = await mpDetectorRef.current.detectFromVideo(video)
      const mpLatency = Number((performance.now() - mpStart).toFixed(1))

      if (!mpData) return null

      const yRes = yoloDetectorRef.current
        ? await yoloDetectorRef.current.detectMultiFace(video, undefined, false, { bypassCache: true })
        : null

      const dRes = dlibDetectorRef.current
        ? await dlibDetectorRef.current.detect(video, { bypassCache: true })
        : null

      let openfaceMapped: OpenFaceDetectionResult | null = null
      if (frameBase64) {
        const remote = await analyzeOpenFaceRemote(frameBase64)
        if (remote) {
          openfaceMapped = mapRemoteToOpenFaceResult(remote, captureNow)
          setOpenFaceData(openfaceMapped)
        }
      }

      const synced = buildMultiEngineBenchmark({
        snapshotId,
        now: captureNow,
        snapshotSynced: true,
        mpLatencyMs: mpLatency,
        mpIsDetected: mpData.isDetected,
        mpConfidence: mpData.confidence || 0,
        mpLandmarksCount: mpData.landmarks?.length || 0,
        yolo: yRes
          ? {
              isDetected: yRes.isDetected,
              latencyMs: yRes.latencyMs,
              confidence: yRes.confidence,
              faceCount: yRes.faceCount,
            }
          : null,
        dlib: dRes
          ? {
              isDetected: dRes.isDetected,
              latencyMs: dRes.latencyMs,
              confidence: dRes.confidence,
              landmarksCount: dRes.landmarks68?.length || 0,
            }
          : null,
        openface: openfaceMapped
          ? {
              isDetected: openfaceMapped.isDetected,
              confidence: openfaceMapped.confidence,
              clientRoundTripMs: openfaceMapped.clientRoundTripMs ?? openfaceMapped.latencyMs ?? null,
              serverLatencyMs: openfaceMapped.serverLatencyMs ?? null,
              resultTimestamp: captureNow,
            }
          : null,
      })

      syncedBenchmarkMetricsRef.current = synced
      if (synced.snapshotSynced) {
        setBenchmarkMetrics(synced)
      }

      return synced
    } catch (err) {
      console.error('Synced benchmark capture failed:', err)
      return null
    } finally {
      syncedCaptureInFlightRef.current = false
    }
  }, [])

  // 2. Background Loop: YOLOv8-Face (Lower FPS / 1500ms)
  const performBackgroundYoloScan = useCallback(async (video: HTMLVideoElement) => {
    if (!yoloDetectorRef.current || !video || video.readyState < 2) return null

    try {
      const mpData = mediaPipeDataRef.current
      const currentLm = mpData?.allFaceLandmarks || (mpData?.landmarks ? [mpData.landmarks] : undefined)
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

  // 3. Background Loop: OpenFace 3.0 remote server (~800ms)
  const performOpenFaceRemoteScan = useCallback(async (video: HTMLVideoElement) => {
    if (!video || video.readyState < 2) return null

    const frame = captureVideoFrameBase64(video)
    if (!frame) return null

    try {
      const remote = await analyzeOpenFaceRemote(frame)
      if (!remote) return null

      const mapped = mapRemoteToOpenFaceResult(remote, Date.now())
      setOpenFaceData(mapped)
      return mapped
    } catch (err) {
      console.error('Error in OpenFace remote scan:', err)
      return null
    }
  }, [])

  // Start Dual Hybrid Tracking Loops for 4 Concurrent Models
  const startHybridTracking = useCallback((videoRef: React.RefObject<HTMLVideoElement | null>) => {
    if (!videoRef.current) return
    // Prevent duplicate loops if already tracking
    if (isActiveRef.current) return
    setIsActive(true)
    isActiveRef.current = true

    if (primaryIntervalRef.current) clearTimeout(primaryIntervalRef.current)
    if (yoloIntervalRef.current) clearTimeout(yoloIntervalRef.current)
    if (openfaceIntervalRef.current) clearTimeout(openfaceIntervalRef.current)
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current)

    // A) High-frequency Primary Loop (MediaPipe + Dlib + OpenFace)
    const runPrimaryLoop = async () => {
      if (!isActiveRef.current) return
      if (videoRef.current) {
        await performPrimaryDetection(videoRef.current)
      }
      primaryIntervalRef.current = setTimeout(runPrimaryLoop, primaryIntervalMs)
    }
    runPrimaryLoop()

    // B) Low-frequency Background Loop (YOLOv8 Multi-face scan)
    const runYoloLoop = async () => {
      if (!isActiveRef.current) return
      if (videoRef.current) {
        await performBackgroundYoloScan(videoRef.current)
      }
      yoloIntervalRef.current = setTimeout(runYoloLoop, yoloIntervalMs)
    }
    runYoloLoop()

    // C) OpenFace 3.0 remote server loop
    const runOpenFaceLoop = async () => {
      if (!isActiveRef.current) return
      if (videoRef.current) {
        await performOpenFaceRemoteScan(videoRef.current)
      }
      openfaceIntervalRef.current = setTimeout(runOpenFaceLoop, OPENFACE_REMOTE_MIN_INTERVAL_MS)
    }
    runOpenFaceLoop()

    // D) Live Real-Time Stats Update Loop (Every 250ms)
    statsIntervalRef.current = setInterval(() => {
      if (mpDetectorRef.current) {
        setOrientationStats(mpDetectorRef.current.getOrientationStats())
        setFaceLossStats(mpDetectorRef.current.getFaceDetectionLossStats())
      }
    }, 250)

    console.log(`🚀 Started 4-Model Multi-Engine Hybrid Tracking (MediaPipe + YOLOv8 + Dlib + OpenFace)`)
  }, [primaryIntervalMs, yoloIntervalMs, performPrimaryDetection, performBackgroundYoloScan, performOpenFaceRemoteScan])

  // Stop Tracking & Cleanup Resources
  const stopHybridTracking = useCallback(() => {
    setIsActive(false)
    isActiveRef.current = false

    if (primaryIntervalRef.current) {
      clearTimeout(primaryIntervalRef.current)
      primaryIntervalRef.current = null
    }
    if (yoloIntervalRef.current) {
      clearTimeout(yoloIntervalRef.current)
      yoloIntervalRef.current = null
    }
    if (openfaceIntervalRef.current) {
      clearTimeout(openfaceIntervalRef.current)
      openfaceIntervalRef.current = null
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
    dlibDetectorRef.current = null
    l2csDetectorRef.current = null
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

  const getBenchmarkMetrics = useCallback(() => {
    return benchmarkMetricsRef.current
  }, [])

  const getComparableBenchmarkMetrics = useCallback(() => {
    return syncedBenchmarkMetricsRef.current
  }, [])

  return {
    isInitializing,
    isActive,
    mediaPipeData,
    yoloMultiFaceData,
    dlibData,
    openFaceData,
    l2csGazeData,
    benchmarkMetrics,
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
    getBenchmarkMetrics,
    getComparableBenchmarkMetrics,
    captureSyncedBenchmark,
  }
}

