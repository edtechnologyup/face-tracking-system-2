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

export interface HybridDetectionConfig {
  primaryIntervalMs?: number  // MediaPipe detection rate (Default: 100ms)
  yoloIntervalMs?: number     // YOLOv8 background multi-face check rate (Default: 1500ms)
  lookingAwayThresholdMs?: number // Threshold to trigger backend snapshot (Default: 3000ms)
  runtimeConfig?: TrackingRuntimeConfig
  /** Set by ModelEventLogSync — enqueue event-driven model DB logs */
  modelEventLogEnqueueRef?: React.MutableRefObject<ModelEventLogEnqueue | null>
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
  buildYolov8EventMetric,
  buildDlibEventMetric,
  buildOpenFaceEventMetric,
  createBenchmarkSnapshotId,
  openFaceBenchmarkFromDetection,
  type EngineBenchmarkMetric,
  type MultiEngineBenchmarkPayload,
} from '@/lib/engine-benchmark'
import type { ModelEventLogEnqueue } from '@/lib/model-event-log'
import {
  buildTrackingRuntimeConfig,
  type TrackingRuntimeConfig,
} from '@/lib/tracking-profile'

export type EngineMetric = EngineBenchmarkMetric
export type MultiEngineBenchmarkData = MultiEngineBenchmarkPayload

export function useHybridFaceDetection(config: HybridDetectionConfig = {}) {
  const runtimeConfigRef = useRef<TrackingRuntimeConfig>(
    config.runtimeConfig ?? buildTrackingRuntimeConfig()
  )

  const {
    primaryIntervalMs = runtimeConfigRef.current.primaryIntervalMs,
    yoloIntervalMs = runtimeConfigRef.current.yoloIntervalMs,
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

  const primaryIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const yoloIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const dlibIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const l2csIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const openfaceIntervalRef = useRef<NodeJS.Timeout | null>(null)

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
  const primaryInFlightRef = useRef(false)
  const yoloInFlightRef = useRef(false)
  const dlibInFlightRef = useRef(false)
  const yoloMultiFaceDataRef = useRef<YOLOv8MultiFaceResult | null>(null)
  const dlibDataRef = useRef<DlibDetectionResult | null>(null)
  const l2csGazeDataRef = useRef<L2CSGazeResult | null>(null)
  const statsLastPublishRef = useRef(0)
  const benchmarkLastPublishRef = useRef(0)
  const uiLastPublishRef = useRef(0)
  const detectionFrameCountRef = useRef(0)
  const mpLastLatencyMsRef = useRef(0)
  const modelEventLogEnqueueRef = config.modelEventLogEnqueueRef
  const UI_PUBLISH_MS = 250
  /** Benchmark comparison panel refresh — display only, does not change engine loop rates */
  const BENCHMARK_UI_PUBLISH_MS = 2000

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

  useEffect(() => {
    yoloMultiFaceDataRef.current = yoloMultiFaceData
  }, [yoloMultiFaceData])

  useEffect(() => {
    dlibDataRef.current = dlibData
  }, [dlibData])

  useEffect(() => {
    l2csGazeDataRef.current = l2csGazeData
  }, [l2csGazeData])

  const publishUiDetectionState = useCallback((data: FaceTrackingData) => {
    const now = Date.now()
    mediaPipeDataRef.current = data
    detectionFrameCountRef.current += 1
    if (now - uiLastPublishRef.current >= UI_PUBLISH_MS) {
      uiLastPublishRef.current = now
      setMediaPipeData(data)
    }
  }, [])

  // Initialize all 4 detector engines
  const initializeHybridDetectors = useCallback(async () => {
    setIsInitializing(true)
    try {
      if (!mpDetectorRef.current) {
        mpDetectorRef.current = new MediaPipeDetector({
          performanceMode:
            runtimeConfigRef.current.profile === 'exam' ? 'exam' : 'full',
        })
        const ok = await mpDetectorRef.current.initialize()
        if (!ok) throw new Error('MediaPipe initialization failed')
      }

      // YOLO/L2CS lazy-init on first background tick — keeps startup fast

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

  // 1. Primary Loop: MediaPipe only (high FPS)
  const performPrimaryDetection = useCallback(async (video: HTMLVideoElement) => {
    if (!mpDetectorRef.current || !video || video.readyState < 2) return null
    if (primaryInFlightRef.current) return mediaPipeDataRef.current

    primaryInFlightRef.current = true
    try {
      const mpStartTime = performance.now()
      const data = await mpDetectorRef.current.detectFromVideo(video)
      const mpEndTime = performance.now()
      const mpLatency = Number((mpEndTime - mpStartTime).toFixed(1))
      mpLastLatencyMsRef.current = mpLatency

      if (data) {
        publishUiDetectionState(data)

        const now = Date.now()
        if (now - statsLastPublishRef.current >= 500) {
          statsLastPublishRef.current = now
          if (mpDetectorRef.current) {
            setOrientationStats(mpDetectorRef.current.getOrientationStats())
            setFaceLossStats(mpDetectorRef.current.getFaceDetectionLossStats())
          }
        }

        const yRes = yoloMultiFaceDataRef.current

        if (now - benchmarkLastPublishRef.current >= BENCHMARK_UI_PUBLISH_MS) {
          benchmarkLastPublishRef.current = now
          const ofRes = openFaceDataRef.current
          const dRes = dlibDataRef.current
          setBenchmarkMetrics(
            buildMultiEngineBenchmark({
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
                ? openFaceBenchmarkFromDetection({
                    isDetected: ofRes.isDetected,
                    confidence: ofRes.confidence,
                    clientRoundTripMs:
                      ofRes.clientRoundTripMs ?? ofRes.latencyMs ?? null,
                    serverLatencyMs: ofRes.serverLatencyMs ?? null,
                    resultTimestamp: ofRes.timestamp ?? null,
                    actionUnits: ofRes.actionUnits as Record<string, unknown> | null,
                  })
                : null,
              snapshotSynced: false,
            })
          )
        }

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
    } finally {
      primaryInFlightRef.current = false
    }
  }, [lookingAwayThresholdMs, addViolation, publishUiDetectionState])

  /** L2CS ONNX — separate low-frequency loop (never blocks MediaPipe) */
  const performL2csScan = useCallback(async (video: HTMLVideoElement) => {
    if (
      !runtimeConfigRef.current.enableL2csInPrimaryLoop ||
      !video ||
      video.readyState < 2
    ) {
      return null
    }

    if (!l2csDetectorRef.current) {
      l2csDetectorRef.current = new L2CSGazeDetector()
      await l2csDetectorRef.current.initialize()
    }

    const mpData = mediaPipeDataRef.current
    const landmarks = mpData?.landmarks
    const yRes = yoloMultiFaceDataRef.current
    const faceBox = yRes?.primaryBox
      ? {
          x: yRes.primaryBox.x,
          y: yRes.primaryBox.y,
          width: yRes.primaryBox.width,
          height: yRes.primaryBox.height,
        }
      : undefined

    try {
      const l2csRes = await l2csDetectorRef.current.predictGazeAsync(video, {
        landmarks,
        faceBox,
      })
      l2csGazeDataRef.current = l2csRes
      setL2csGazeData(l2csRes)
      return l2csRes
    } catch (err) {
      console.error('Error in L2CS gaze scan:', err)
      return null
    }
  }, [])

  /** Same-frame benchmark: MP + YOLO + Dlib on live video, OpenFace on captured JPEG — for DB comparison. */
  const captureSyncedBenchmark = useCallback(async (video: HTMLVideoElement) => {
    if (!mpDetectorRef.current || !video || video.readyState < 2) return null

    if (syncedCaptureInFlightRef.current) {
      const deadline = Date.now() + 12_000
      while (syncedCaptureInFlightRef.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200))
      }
      if (syncedBenchmarkMetricsRef.current) {
        return syncedBenchmarkMetricsRef.current
      }
      if (syncedCaptureInFlightRef.current) return null
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

      if (!yoloDetectorRef.current) {
        yoloDetectorRef.current = new YOLOv8FaceDetector()
        await yoloDetectorRef.current.initialize()
      }

      if (!dlibDetectorRef.current) {
        dlibDetectorRef.current = new Dlib68PointDetector()
        await dlibDetectorRef.current.initialize()
      }

      const yRes = yoloDetectorRef.current
        ? await yoloDetectorRef.current.detectMultiFace(video, undefined, false, { bypassCache: true })
        : null

      const dRes = dlibDetectorRef.current
        ? await dlibDetectorRef.current.detect(video, { bypassCache: true })
        : null
      if (dRes) {
        dlibDataRef.current = dRes
        setDlibData(dRes)
      }

      let openfaceMapped: OpenFaceDetectionResult | null = null
      if (frameBase64) {
        const remote = await Promise.race([
          analyzeOpenFaceRemote(frameBase64),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 10_000)
          ),
        ])
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
          ? openFaceBenchmarkFromDetection({
              isDetected: openfaceMapped.isDetected,
              confidence: openfaceMapped.confidence,
              clientRoundTripMs:
                openfaceMapped.clientRoundTripMs ?? openfaceMapped.latencyMs ?? null,
              serverLatencyMs: openfaceMapped.serverLatencyMs ?? null,
              resultTimestamp: captureNow,
              actionUnits: openfaceMapped.actionUnits as Record<string, unknown> | null,
            })
          : null,
      })

      syncedBenchmarkMetricsRef.current = synced
      setBenchmarkMetrics(synced)

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
    if (!video || video.readyState < 2) return null
    if (yoloInFlightRef.current) return null

    if (!yoloDetectorRef.current) {
      yoloDetectorRef.current = new YOLOv8FaceDetector()
      await yoloDetectorRef.current.initialize()
    }

    yoloInFlightRef.current = true
    try {
      const mpData = mediaPipeDataRef.current
      const currentLm = mpData?.allFaceLandmarks || (mpData?.landmarks ? [mpData.landmarks] : undefined)
      const yoloResult = await yoloDetectorRef.current.detectMultiFace(
        video,
        currentLm,
        simulateIntruderRef.current
      )
      yoloMultiFaceDataRef.current = yoloResult
      setYoloMultiFaceData(yoloResult)

      const measuredAt = new Date().toISOString()
      modelEventLogEnqueueRef?.current?.({
        engine: 'yolov8',
        metric: buildYolov8EventMetric({
          isDetected: yoloResult.isDetected,
          latencyMs: yoloResult.latencyMs,
          confidence: yoloResult.confidence,
          faceCount: yoloResult.faceCount,
          measuredAt,
        }),
      })

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
    } finally {
      yoloInFlightRef.current = false
    }
  }, [addViolation, modelEventLogEnqueueRef])

  /** Dlib 68-point — background loop (face-api.js, does not block MediaPipe) */
  const performBackgroundDlibScan = useCallback(async (video: HTMLVideoElement) => {
    if (!video || video.readyState < 2) return null
    if (dlibInFlightRef.current) return null

    if (!dlibDetectorRef.current) {
      dlibDetectorRef.current = new Dlib68PointDetector()
      const ok = await dlibDetectorRef.current.initialize()
      if (!ok) {
        console.warn('⚠️ Dlib/face-api failed to initialize')
        return null
      }
    }

    dlibInFlightRef.current = true
    try {
      const dRes = await dlibDetectorRef.current.detect(video)
      dlibDataRef.current = dRes
      setDlibData(dRes)

      const measuredAt = new Date().toISOString()
      modelEventLogEnqueueRef?.current?.({
        engine: 'dlib',
        metric: buildDlibEventMetric({
          isDetected: dRes.isDetected,
          latencyMs: dRes.latencyMs,
          confidence: dRes.confidence,
          landmarksCount: dRes.landmarks68?.length ?? 0,
          measuredAt,
        }),
      })

      return dRes
    } catch (err) {
      console.error('Error in Background Dlib scan:', err)
      return null
    } finally {
      dlibInFlightRef.current = false
    }
  }, [modelEventLogEnqueueRef])

  // 3. Background Loop: OpenFace 3.0 remote server (~800ms)
  const performOpenFaceRemoteScan = useCallback(async (video: HTMLVideoElement) => {
    if (!video || video.readyState < 2) return null

    const frame = captureVideoFrameBase64(video)
    if (!frame) return null

    try {
      const remote = await analyzeOpenFaceRemote(frame)
      if (!remote) return null

      const mapped = mapRemoteToOpenFaceResult(remote, Date.now())
      openFaceDataRef.current = mapped
      setOpenFaceData(mapped)

      if (mapped.source === 'openface-server') {
        const auCount =
          mapped.actionUnits && typeof mapped.actionUnits === 'object'
            ? Object.keys(mapped.actionUnits).length
            : 0
        const measuredAt = new Date().toISOString()
        modelEventLogEnqueueRef?.current?.({
          engine: 'openface',
          metric: buildOpenFaceEventMetric({
            isDetected: mapped.isDetected,
            confidence: mapped.confidence,
            clientRoundTripMs: mapped.clientRoundTripMs ?? mapped.latencyMs ?? null,
            serverLatencyMs: mapped.serverLatencyMs ?? null,
            actionUnitCount: auCount,
            measuredAt,
          }),
          openfaceExtras: {
            serverLatencyMs: mapped.serverLatencyMs ?? null,
            resultAgeMs: 0,
          },
        })
      }

      return mapped
    } catch (err) {
      console.error('Error in OpenFace remote scan:', err)
      return null
    }
  }, [modelEventLogEnqueueRef])

  // Start Dual Hybrid Tracking Loops for 4 Concurrent Models
  const startHybridTracking = useCallback((videoRef: React.RefObject<HTMLVideoElement | null>) => {
    if (!videoRef.current) return
    // Prevent duplicate loops if already tracking
    if (isActiveRef.current) return
    setIsActive(true)
    isActiveRef.current = true

    if (primaryIntervalRef.current) clearTimeout(primaryIntervalRef.current)
    if (yoloIntervalRef.current) clearTimeout(yoloIntervalRef.current)
    if (dlibIntervalRef.current) clearTimeout(dlibIntervalRef.current)
    if (l2csIntervalRef.current) clearTimeout(l2csIntervalRef.current)
    if (openfaceIntervalRef.current) clearTimeout(openfaceIntervalRef.current)

    // A) High-frequency Primary Loop (MediaPipe + Dlib + OpenFace)
    const runPrimaryLoop = async () => {
      if (!isActiveRef.current) {
        return
      }
      if (videoRef.current) {
        await performPrimaryDetection(videoRef.current)
      }
      primaryIntervalRef.current = setTimeout(runPrimaryLoop, primaryIntervalMs)
    }
    runPrimaryLoop()

    // B) Low-frequency Background Loop (YOLOv8 Multi-face scan) — delayed start so MediaPipe stabilizes first
    const yoloStartupDelayMs = runtimeConfigRef.current.profile === 'exam' ? 3000 : 500
    const runYoloLoop = async () => {
      if (!isActiveRef.current) {
        return
      }
      if (videoRef.current) {
        await performBackgroundYoloScan(videoRef.current)
      }
      yoloIntervalRef.current = setTimeout(runYoloLoop, yoloIntervalMs)
    }
    setTimeout(() => runYoloLoop(), yoloStartupDelayMs)

    // C) Background Dlib 68-point loop (face-api.js)
    if (runtimeConfigRef.current.enableDlibBackgroundLoop) {
      const dlibIntervalMs = runtimeConfigRef.current.dlibIntervalMs
      const dlibStartupDelayMs = yoloStartupDelayMs + 1500
      const runDlibLoop = async () => {
        if (!isActiveRef.current) return
        if (videoRef.current) {
          await performBackgroundDlibScan(videoRef.current)
        }
        dlibIntervalRef.current = setTimeout(runDlibLoop, dlibIntervalMs)
      }
      setTimeout(() => runDlibLoop(), dlibStartupDelayMs)
    }

    // D) L2CS gaze loop — decoupled from MediaPipe primary loop
    if (runtimeConfigRef.current.enableL2csInPrimaryLoop) {
      const l2csIntervalMs = runtimeConfigRef.current.l2csIntervalMs
      const runL2csLoop = async () => {
        if (!isActiveRef.current) {
          return
        }
        if (videoRef.current) {
          await performL2csScan(videoRef.current)
        }
        l2csIntervalRef.current = setTimeout(runL2csLoop, l2csIntervalMs)
      }
      runL2csLoop()
    }

    // E) OpenFace remote — fast loop (research/T0) or low-frequency background (exam)
    if (runtimeConfigRef.current.openFaceContinuousLoop) {
      const runOpenFaceLoop = async () => {
        if (!isActiveRef.current) {
          return
        }
        if (videoRef.current) {
          await performOpenFaceRemoteScan(videoRef.current)
        }
        openfaceIntervalRef.current = setTimeout(
          runOpenFaceLoop,
          OPENFACE_REMOTE_MIN_INTERVAL_MS
        )
      }
      runOpenFaceLoop()
    } else if (runtimeConfigRef.current.enableOpenFaceBackgroundLoop) {
      const openFaceIntervalMs = runtimeConfigRef.current.openFaceIntervalMs
      const openFaceStartupDelayMs = yoloStartupDelayMs + 2500
      const runOpenFaceBgLoop = async () => {
        if (!isActiveRef.current) return
        if (videoRef.current) {
          await performOpenFaceRemoteScan(videoRef.current)
        }
        openfaceIntervalRef.current = setTimeout(runOpenFaceBgLoop, openFaceIntervalMs)
      }
      setTimeout(() => runOpenFaceBgLoop(), openFaceStartupDelayMs)
    }

    // D) Stats อัปเดตจาก primary loop (throttle 250ms) — ไม่ใช้ setInterval แยกเพื่อลด re-render

    console.log(
      `🚀 Hybrid tracking started [${runtimeConfigRef.current.profile}/${runtimeConfigRef.current.tier}] ` +
        `(L2CS: ${runtimeConfigRef.current.enableL2csInPrimaryLoop ? 'on' : 'off'}, ` +
        `OpenFace: ${runtimeConfigRef.current.openFaceContinuousLoop ? 'fast-loop' : runtimeConfigRef.current.enableOpenFaceBackgroundLoop ? `bg ${runtimeConfigRef.current.openFaceIntervalMs}ms` : 'snapshot-only'})`
    )
  }, [primaryIntervalMs, yoloIntervalMs, performPrimaryDetection, performBackgroundYoloScan, performBackgroundDlibScan, performL2csScan, performOpenFaceRemoteScan])

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
    if (dlibIntervalRef.current) {
      clearTimeout(dlibIntervalRef.current)
      dlibIntervalRef.current = null
    }
    if (l2csIntervalRef.current) {
      clearTimeout(l2csIntervalRef.current)
      l2csIntervalRef.current = null
    }
    if (openfaceIntervalRef.current) {
      clearTimeout(openfaceIntervalRef.current)
      openfaceIntervalRef.current = null
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

  const getLatestDetection = useCallback(() => ({
    mediaPipeData: mediaPipeDataRef.current,
    yoloMultiFaceData: yoloMultiFaceDataRef.current,
    dlibData: dlibDataRef.current,
    openFaceData: openFaceDataRef.current,
    l2csGazeData: l2csGazeDataRef.current,
    detectionFrameCount: detectionFrameCountRef.current,
    mpLatencyMs: mpLastLatencyMsRef.current,
  }), [])

  const resetDetectionFrameCount = useCallback(() => {
    detectionFrameCountRef.current = 0
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
    runtimeConfig: runtimeConfigRef.current,
    getLatestDetection,
    resetDetectionFrameCount,
  }
}

