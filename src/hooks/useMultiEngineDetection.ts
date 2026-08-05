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
    yolov8: { isDetected: false, confidence: 0, latencyMs: 0, fps: 0, landmarksCount: 5 },
    dlib: { isDetected: false, landmarks68: [], confidence: 0, latencyMs: 0, fps: 0, landmarksCount: 68 },
    openface: {
      isDetected: false,
      actionUnits: { au01_InnerBrowRaiser: 0, au02_OuterBrowRaiser: 0, au04_BrowLowerer: 0, au12_LipCornerPuller: 0, au26_JawDrop: 0, au45_Blink: 0 },
      gazeVector: { x: 0, y: 0, z: -1, eyeContact: false },
      poseAngle: { pitch: 0, yaw: 0, roll: 0 },
      confidence: 0,
      latencyMs: 0,
      fps: 0,
      landmarksCount: 68
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
      }
      if (!dlibRef.current) {
        dlibRef.current = new Dlib68PointDetector()
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

    // 2. YOLOv8-Face
    const yoloRes = yolov8Ref.current ? yolov8Ref.current.detect(video) : { isDetected: false, confidence: 0, latencyMs: 0, fps: 0 }

    // 3. Dlib 68-Point
    const dlibRes = dlibRef.current ? dlibRef.current.detect(video) : { isDetected: false, landmarks68: [], confidence: 0, latencyMs: 0, fps: 0 }

    // 4. OpenFace
    const openfaceRes = openfaceRef.current ? openfaceRef.current.detect(video) : {
      isDetected: false,
      actionUnits: { au01_InnerBrowRaiser: 0, au02_OuterBrowRaiser: 0, au04_BrowLowerer: 0, au12_LipCornerPuller: 0, au26_JawDrop: 0, au45_Blink: 0 },
      gazeVector: { x: 0, y: 0, z: -1, eyeContact: false },
      poseAngle: { pitch: 0, yaw: 0, roll: 0 },
      confidence: 0,
      latencyMs: 0,
      fps: 0
    }

    setResults({
      mediapipe: {
        data: mpData,
        fps: mpFps.current || 30,
        latencyMs: Math.max(4.5, mpLatency),
        landmarksCount: mpData?.landmarks?.length || 468
      },
      yolov8: {
        ...yoloRes,
        landmarksCount: 5
      },
      dlib: {
        ...dlibRes,
        landmarksCount: 68
      },
      openface: {
        ...openfaceRes,
        landmarksCount: 68
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
