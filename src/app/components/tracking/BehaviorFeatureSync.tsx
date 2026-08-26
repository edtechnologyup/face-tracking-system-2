/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react'
import { analyzeImageQuality } from '@/lib/image-quality'
import { calculateOcclusionScore } from '@/lib/occlusion-utils'

export interface BehaviorFeatureSyncProps {
  participantCode?: string;
  isActive: boolean
  sessionId: string | null
  mediaPipeData: any
  yoloData: any
  dlibData: any
  openFaceData: any
}

export function BehaviorFeatureSync({
  isActive,
  sessionId,
  mediaPipeData,
  yoloData,
  dlibData,
  openFaceData,
  participantCode
}: BehaviorFeatureSyncProps) {
  const logBufferRef = useRef<any[]>([])
  const sampleIndexRef = useRef<number>(0)
  const lastSyncTimeRef = useRef<number>(Date.now())
  const lastSampleTimeRef = useRef<number>(Date.now())

  const lastQualityCheckRef = useRef<number>(0);
  const latestQualityRef = useRef({ brightnessMean: 0.5, contrastScore: 0.5, blurScore: 0 });
  const frameCountRef = useRef<number>(0);
  const fpsWindowStartRef = useRef<number>(Date.now());
  const currentFpsRef = useRef<number>(30);
  
  // Throttle timer variables


  // Sample data at ~10Hz (every 100ms)
  useEffect(() => {
    if (!isActive || !sessionId) return

    const now = Date.now()
    if (now - lastSampleTimeRef.current < 100) return // Throttle to 100ms
    lastSampleTimeRef.current = now

    const hasFace = !!(mediaPipeData?.isDetected || yoloData?.isDetected)

    // FPS Calculation (runs every cycle)
    frameCountRef.current++;
    if (now - fpsWindowStartRef.current >= 1000) {
      currentFpsRef.current = frameCountRef.current;
      frameCountRef.current = 0;
      fpsWindowStartRef.current = now;
    }

    // Quality check (throttled to every 2 seconds for performance)
    if (now - lastQualityCheckRef.current >= 2000) {
      lastQualityCheckRef.current = now;
      const videoEl = document.querySelector('video');
      let bbox = null;
      if (mediaPipeData?.landmarks && videoEl) {
        // approximate bounding box from landmarks
        const xs = mediaPipeData.landmarks.map((l: any) => l.x * videoEl.videoWidth);
        const ys = mediaPipeData.landmarks.map((l: any) => l.y * videoEl.videoHeight);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        bbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }
      if (videoEl) {
         // Using setTimeout to defer processing and not block the main React render cycle
         setTimeout(() => {
           latestQualityRef.current = analyzeImageQuality(videoEl, bbox);
         }, 0);
      }
    }
    
    // Calculate Occlusion Score
    const currentOcclusionScore = mediaPipeData?.landmarks ? calculateOcclusionScore(mediaPipeData.landmarks) : (hasFace ? 0 : 1.0);

    
    // Build a log entry
    const logEntry: any = {
      participantCode: participantCode || null,
      featureSchemaVersion: '1.0',
      timestamp: new Date().toISOString(),
      elapsedMs: now - lastSyncTimeRef.current, // will adjust before sending
      sampleIndex: sampleIndexRef.current++,
      phase: 'TRACKING',
      scenario: 'HYBRID_MODE',
      
      faceDetected: hasFace,
      faceCount: yoloData?.faceCount || mediaPipeData?.multipleFaces?.count || (hasFace ? 1 : 0),
      faceConfidence: yoloData?.confidence || mediaPipeData?.confidence || null,
      
      // Box & Distance
      bboxX: null,
      bboxY: null,
      bboxWidth: mediaPipeData?.distance?.faceWidth || null,
      bboxHeight: mediaPipeData?.distance?.faceHeight || null,
      faceCenterX: null,
      faceCenterY: null,
      faceDistanceCm: mediaPipeData?.distance?.estimatedCm || null,
      
      // Head Pose
      headYaw: mediaPipeData?.orientation?.yaw || null,
      headPitch: mediaPipeData?.orientation?.pitch || null,
      headRoll: null,
      headPoseConfidence: mediaPipeData?.confidence || null,
      
      // Gaze (Estimated from head pose if explicit gaze not available)
      gazeYaw: mediaPipeData?.orientation?.yaw ? mediaPipeData.orientation.yaw * 1.2 : null,
      gazePitch: mediaPipeData?.orientation?.pitch ? mediaPipeData.orientation.pitch * 1.2 : null,
      gazeLeftX: openFaceData?.gazeVector?.x || null,
      gazeLeftY: openFaceData?.gazeVector?.y || null,
      gazeLeftZ: openFaceData?.gazeVector?.z || null,
      gazeRightX: openFaceData?.gazeVector?.x || null,
      gazeRightY: openFaceData?.gazeVector?.y || null,
      gazeRightZ: openFaceData?.gazeVector?.z || null,
      gazeConfidence: mediaPipeData?.confidence || null,
      
      // Eye & Action Units
      leftEAR: null,
      rightEAR: null,
      leftEyeOpenness: null,
      rightEyeOpenness: null,
      actionUnitsJson: openFaceData?.actionUnits || null,
      
      // Model Confidences
      yoloConfidence: yoloData?.confidence || null,
      mediapipeConfidence: mediaPipeData?.confidence || null,
      dlibConfidence: dlibData?.confidence || null,
      openfaceConfidence: openFaceData?.confidence || null,
      
      // Quality
      brightnessMean: latestQualityRef.current.brightnessMean,
      contrastScore: latestQualityRef.current.contrastScore,
      blurScore: latestQualityRef.current.blurScore,
      occlusionScore: currentOcclusionScore,
      
      // Landmarks & Device
      landmarkCount: mediaPipeData?.landmarks ? mediaPipeData.landmarks.length : null,
      landmarkConfidence: mediaPipeData?.confidence || null,
      cameraWidth: null,
      cameraHeight: null,
      cameraFps: currentFpsRef.current,
      isValid: hasFace && (yoloData?.faceCount || mediaPipeData?.multipleFaces?.count || (hasFace ? 1 : 0)) <= 1 && currentOcclusionScore < 0.8,
      invalidReason: !hasFace ? 'NO_FACE_DETECTED' : ((yoloData?.faceCount || mediaPipeData?.multipleFaces?.count || (hasFace ? 1 : 0)) > 1 ? 'MULTIPLE_FACES_DETECTED' : (currentOcclusionScore >= 0.8 ? 'FACE_OCCLUDED' : null)),
      pipelineVersion: 'hybrid-1.0'
    }

    // --- คำนวณค่าเพิ่มเติมจาก Landmarks (ถ้ามี) ---
    if (mediaPipeData?.landmarks && mediaPipeData.landmarks.length > 0) {
      const lms = mediaPipeData.landmarks;
      
      // Bounding Box & Center
      const xs = lms.map((l: any) => l.x);
      const ys = lms.map((l: any) => l.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      logEntry.bboxX = minX;
      logEntry.bboxY = minY;
      logEntry.faceCenterX = (minX + maxX) / 2;
      logEntry.faceCenterY = (minY + maxY) / 2;
      
      // Eye Aspect Ratio (EAR) - MediaPipe indices
      const calcEAR = (p1: number, p2: number, p3: number, p4: number, p5: number, p6: number) => {
        if(!lms[p1] || !lms[p6]) return null;
        const v1 = Math.hypot(lms[p2].x - lms[p6].x, lms[p2].y - lms[p6].y);
        const v2 = Math.hypot(lms[p3].x - lms[p5].x, lms[p3].y - lms[p5].y);
        const h = Math.hypot(lms[p1].x - lms[p4].x, lms[p1].y - lms[p4].y);
        return (v1 + v2) / (2.0 * h);
      };
      
      // Left eye (MediaPipe indices)
      logEntry.leftEAR = calcEAR(33, 160, 158, 133, 153, 144);
      // Right eye (MediaPipe indices)
      logEntry.rightEAR = calcEAR(362, 385, 387, 263, 373, 380);
      
      logEntry.leftEyeOpenness = logEntry.leftEAR; // Simplified proxy
      logEntry.rightEyeOpenness = logEntry.rightEAR;
      
      // Head Roll estimation (angle between eyes)
      if (lms[33] && lms[362]) {
        const dx = lms[362].x - lms[33].x;
        const dy = lms[362].y - lms[33].y;
        logEntry.headRoll = Math.atan2(dy, dx) * (180 / Math.PI);
      }
    }
    
    // ดึงค่าขนาดวิดีโอจาก DOM ถ้าทำได้
    try {
      const videoEl = document.querySelector('video');
      if (videoEl && videoEl.videoWidth) {
        logEntry.cameraWidth = videoEl.videoWidth;
        logEntry.cameraHeight = videoEl.videoHeight;
      } else {
        logEntry.cameraWidth = window.innerWidth;
        logEntry.cameraHeight = window.innerHeight;
      }
    } catch {}
    

    logBufferRef.current.push(logEntry)

    // Auto-sync every 50 frames (approx 5 seconds)
    if (logBufferRef.current.length >= 50) {
      const logsToSend = [...logBufferRef.current]
      logBufferRef.current = [] // reset buffer
      
      // Send to API in background
      fetch('/api/tracking/behavior-features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          logs: logsToSend
        })
      }).catch(err => {
        console.error('Failed to sync behavior features:', err)
        // If fail, we drop them to avoid memory leaks or retry logic if needed
      })
    }
  }, [isActive, sessionId, mediaPipeData, yoloData, dlibData, openFaceData, participantCode])

  // Sync on unmount or stop
  useEffect(() => {
    return () => {
      if (logBufferRef.current.length > 0 && sessionId) {
        const logsToSend = [...logBufferRef.current]
        logBufferRef.current = []
        
        fetch('/api/tracking/behavior-features', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true, // Ensure it sends even if page closes
          body: JSON.stringify({
            sessionId,
            logs: logsToSend
          })
        }).catch(err => console.error('Final sync failed:', err))
      }
    }
  }, [sessionId])

  return null // This is a logic-only component
}
