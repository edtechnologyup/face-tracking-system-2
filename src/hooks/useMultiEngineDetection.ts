'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { MediaPipeDetector, FaceTrackingData } from '@/lib/mediapipe-detector'
import { YOLOv8FaceDetector, YOLOv8DetectionResult } from '@/lib/engines/yolov8-detector'
import { Dlib68PointDetector, DlibDetectionResult } from '@/lib/engines/dlib-detector'
import { OpenFaceDetector, OpenFaceDetectionResult } from '@/lib/engines/openface-detector'

export interface MultiEngineResults {
  mediapipe: {
    data: FaceTrackingData | null;
    fps: number;
    latencyMs: number;
    landmarksCount: number;
  };
  yolov8: YOLOv8DetectionResult & { landmarksCount: number };
  dlib: DlibDetectionResult & { landmarksCount: number };
  openface: OpenFaceDetectionResult & { landmarksCount: number };
}

export function useMultiEngineDetection() {
  const [isInitializing, setIsInitializing] = useState(false)
  const [isActive, setIsActive] = useState(false)

  // Instances of Detector Engines
  const mediapipeRef = useRef<MediaPipeDetector | null>(null)
  const yolov8Ref = useRef<YOLOv8FaceDetector | null>(null)
  const dlibRef = useRef<Dlib68PointDetector | null>(null)
  const openfaceRef = useRef<OpenFaceDetector | null>(null)

  // FPS tracking for MediaPipe
  const mpFrameCount = useRef(0)
  const mpLastTime = useRef(Date.now())
  const mpFps = useRef(60)

  const [results, setResults] = useState<MultiEngineResults>({
    mediapipe: { data: null, fps: 0, latencyMs: 0, landmarksCount: 468 },
    yolov8: { isDetected: false, confidence: 0, latencyMs: 0, fps: 0, landmarksCount: 0 },
    dlib: { isDetected: false, landmarks68: [], confidence: 0, detectionScore: 0, landmarkQuality: null, latencyMs: 0, fps: 0, landmarksCount: 68, timestamp: 0 },
    openface: {
      isDetected: false,
      actionUnits: null,
      gazeVector: { x: 0, y: 0, z: -1, eyeContact: false },
      poseAngle: { pitch: 0, yaw: 0, roll: 0 },
      confidence: null,
      latencyMs: 0,
      fps: 0,
      landmarksCount: 0,
    }
  })

  // Initialize all engines
  const initializeEngines = useCallback(async () => {
    setIsInitializing(true)
    try {
      if (!mediapipeRef.current) {
        mediapipeRef.current = new MediaPipeDetector()
        await mediapipeRef.current.initialize()
      }
      if (!yolov8Ref.current) {
        yolov8Ref.current = new YOLOv8FaceDetector()
        await yolov8Ref.current.initialize()
      }
      if (!dlibRef.current) {
        dlibRef.current = new Dlib68PointDetector()
        await dlibRef.current.initialize()
      }
      if (!openfaceRef.current) {
        openfaceRef.current = new OpenFaceDetector()
      }
      setIsActive(true)
      setIsInitializing(false)
      return true
    } catch (err) {
      console.error('Error initializing multi-engines:', err)
      setIsInitializing(false)
      return false
    }
  }, [])

  // Process single frame across all 4 engines
  const processFrame = useCallback(async (video: HTMLVideoElement) => {
    if (!video || video.readyState < 2) return

    // 1. MediaPipe
    const mpStartTime = performance.now()
    let mpData: FaceTrackingData | null = null
    if (mediapipeRef.current) {
      mpData = await mediapipeRef.current.detectFromVideo(video)
      
      const now = Date.now()
      mpFrameCount.current++
      if (now - mpLastTime.current >= 1000) {
        mpFps.current = mpFrameCount.current
        mpFrameCount.current = 0
        mpLastTime.current = now
      }
    }
    const mpEndTime = performance.now()
    const mpLatency = Number((mpEndTime - mpStartTime).toFixed(1))

    const activeLandmarks = mpData?.landmarks
    const yaw = mpData?.orientation?.yaw || 0
    const pitch = mpData?.orientation?.pitch || 0

    // 2. YOLOv8-Face ONNX (lindevs single-class)
    const yoloRes = yolov8Ref.current
      ? await yolov8Ref.current.detectMultiFace(video)
      : { isDetected: false, confidence: 0, latencyMs: 0, fps: 0, faceCount: 0, hasMultipleFaces: false, boxes: [], timestamp: Date.now() }

    // 3. Dlib 68-Point (face-api landmark68Net)
    const dlibRes = dlibRef.current
      ? await dlibRef.current.detect(video)
      : {
          isDetected: false,
          landmarks68: [],
          confidence: 0,
          detectionScore: 0,
          landmarkQuality: null,
          latencyMs: 0,
          fps: 0,
          timestamp: Date.now(),
        }

    // 4. OpenFace — not available in browser (UI passthrough only)
    const openfaceRes = openfaceRef.current
      ? openfaceRef.current.detectFromMediaPipe(video, yaw, pitch, mpData?.actionUnits, mpData?.gaze, activeLandmarks)
      : {
          isDetected: false,
          actionUnits: null,
          gazeVector: { x: 0, y: 0, z: -1, eyeContact: false },
          poseAngle: { pitch: 0, yaw: 0, roll: 0 },
          confidence: null,
          latencyMs: 0,
          fps: 0,
        }

    const mpDerivedFps = mpLatency > 0 ? Number((1000 / mpLatency).toFixed(1)) : 0

    setResults({
      mediapipe: {
        data: mpData,
        fps: mpDerivedFps,
        latencyMs: Number(mpLatency.toFixed(1)),
        landmarksCount: mpData?.landmarks?.length || 468,
      },
      yolov8: {
        ...yoloRes,
        landmarksCount: 0
      },
      dlib: {
        ...dlibRes,
        landmarksCount: dlibRes.landmarks68?.length || 0
      },
      openface: {
        ...openfaceRes,
        landmarksCount: 0
      }
    })
  }, [])

  const stopEngines = useCallback(() => {
    setIsActive(false)
    if (mediapipeRef.current) {
      mediapipeRef.current.destroy()
      mediapipeRef.current = null
    }
    yolov8Ref.current = null
    dlibRef.current = null
    openfaceRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      stopEngines()
    }
  }, [stopEngines])

  return {
    isInitializing,
    isActive,
    results,
    initializeEngines,
    processFrame,
    stopEngines
  }
}
