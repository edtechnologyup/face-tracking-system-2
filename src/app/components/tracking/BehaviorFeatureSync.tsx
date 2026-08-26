import { useEffect, useRef } from 'react'

export interface BehaviorFeatureSyncProps {
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
  openFaceData
}: BehaviorFeatureSyncProps) {
  const logBufferRef = useRef<any[]>([])
  const sampleIndexRef = useRef<number>(0)
  const lastSyncTimeRef = useRef<number>(Date.now())
  const lastSampleTimeRef = useRef<number>(Date.now())

  // Sample data at ~10Hz (every 100ms)
  useEffect(() => {
    if (!isActive || !sessionId) return

    const now = Date.now()
    if (now - lastSampleTimeRef.current < 100) return // Throttle to 100ms
    lastSampleTimeRef.current = now

    const hasFace = !!(mediaPipeData?.isDetected || yoloData?.isDetected)
    
    // Build a log entry
    const logEntry = {
      timestamp: new Date().toISOString(),
      elapsedMs: now - lastSyncTimeRef.current, // will adjust before sending
      sampleIndex: sampleIndexRef.current++,
      phase: 'TRACKING',
      scenario: 'HYBRID_MODE',
      
      faceDetected: hasFace,
      faceCount: yoloData?.faceCount || mediaPipeData?.multipleFaces?.count || (hasFace ? 1 : 0),
      faceConfidence: yoloData?.confidence || mediaPipeData?.confidence || null,
      
      // Box & Distance
      bboxWidth: mediaPipeData?.distance?.faceWidth || null,
      bboxHeight: mediaPipeData?.distance?.faceHeight || null,
      faceDistanceCm: mediaPipeData?.distance?.estimatedCm || null,
      
      // Head Pose
      headYaw: mediaPipeData?.orientation?.yaw || null,
      headPitch: mediaPipeData?.orientation?.pitch || null,
      
      // Model Confidences
      yoloConfidence: yoloData?.confidence || null,
      mediapipeConfidence: mediaPipeData?.confidence || null,
      dlibConfidence: dlibData?.confidence || null,
      openfaceConfidence: openFaceData?.confidence || null,
      
      landmarkCount: mediaPipeData?.landmarks ? mediaPipeData.landmarks.length : null,
      
      cameraFps: 30, // approximate
      isValid: hasFace
    }

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
  }, [isActive, sessionId, mediaPipeData, yoloData, dlibData, openFaceData])

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
