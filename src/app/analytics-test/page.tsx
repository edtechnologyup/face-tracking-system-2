'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useCamera } from '@/hooks/useCamera'
import { MediaPipeDetector, FaceTrackingData } from '@/lib/mediapipe-detector'
import { L2CSGazeDetector, L2CSGazeResult } from '@/lib/engines/l2cs-gaze-detector'
import { MiniFASNetLivenessDetector, MiniFASNetResult } from '@/lib/engines/minifas-liveness'
import { drawSciFiFaceMesh } from '@/lib/face-mesh-utils'
import { Button } from '@/app/components/ui/Button'
import { Card } from '@/app/components/ui/Card'

export default function AnalyticsTestPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mpDetectorRef = useRef<MediaPipeDetector | null>(null)
  const gazeDetectorRef = useRef<L2CSGazeDetector | null>(null)
  const livenessDetectorRef = useRef<MiniFASNetLivenessDetector | null>(null)
  const mpIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const { initializeCamera, stopCamera } = useCamera()
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [mediaPipeData, setMediaPipeData] = useState<FaceTrackingData | null>(null)
  const [gazeResult, setGazeResult] = useState<L2CSGazeResult | null>(null)
  const [livenessResult, setLivenessResult] = useState<MiniFASNetResult | null>(null)
  const [capturedSnapshot, setCapturedSnapshot] = useState<string | null>(null)
  const [isSendingAnalytics, setIsSendingAnalytics] = useState(false)
  const [backendResponse, setBackendResponse] = useState<Record<string, unknown> | null>(null)

  // Initialize Engines & Camera
  const handleStart = async () => {
    const ok = await initializeCamera(videoRef)
    if (!ok) {
      alert('ไม่สามารถเปิดกล้องได้')
      return
    }

    if (!mpDetectorRef.current) {
      mpDetectorRef.current = new MediaPipeDetector()
      await mpDetectorRef.current.initialize()
    }

    if (!gazeDetectorRef.current) gazeDetectorRef.current = new L2CSGazeDetector()
    if (!livenessDetectorRef.current) livenessDetectorRef.current = new MiniFASNetLivenessDetector()

    setIsCameraActive(true)

    // Detection Loop
    if (mpIntervalRef.current) clearInterval(mpIntervalRef.current)
    mpIntervalRef.current = setInterval(async () => {
      if (videoRef.current && mpDetectorRef.current) {
        const data = await mpDetectorRef.current.detectFromVideo(videoRef.current)
        if (data) {
          setMediaPipeData(data)

          // Run Local L2CS-Net & MiniFASNet Predictions
          if (gazeDetectorRef.current) {
            const gaze = gazeDetectorRef.current.predictGaze(videoRef.current, data.landmarks)
            setGazeResult(gaze)
          }

          if (livenessDetectorRef.current) {
            const liveness = livenessDetectorRef.current.evaluateLiveness(videoRef.current, data.landmarks)
            setLivenessResult(liveness)
          }
        }
      }
    }, 100)
  }

  const handleStop = () => {
    if (mpIntervalRef.current) clearInterval(mpIntervalRef.current)
    if (mpDetectorRef.current) mpDetectorRef.current.destroy()
    stopCamera(videoRef)
    setIsCameraActive(false)
    setMediaPipeData(null)
  }

  useEffect(() => {
    return () => {
      if (mpIntervalRef.current) clearInterval(mpIntervalRef.current)
      if (mpDetectorRef.current) mpDetectorRef.current.destroy()
    }
  }, [])

  // Capture Base64 Snapshot Frame
  const captureFrameSnapshot = useCallback((): string | null => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const base64 = canvas.toDataURL('image/jpeg', 0.85)
    setCapturedSnapshot(base64)
    return base64
  }, [])

  // Send Snapshot to Backend Analytics API (/api/tracking/snapshot-analytics)
  const sendToBackendAnalytics = useCallback(async () => {
    const snapshotBase64 = captureFrameSnapshot()
    if (!snapshotBase64) {
      alert('ไม่สามารถดึงภาพสแนปชอตได้')
      return
    }

    setIsSendingAnalytics(true)
    try {
      const response = await fetch('/api/tracking/snapshot-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'demo_session_phase3',
          snapshotImage: snapshotBase64,
          violationType: gazeResult?.isLookingOffScreen ? 'LOOKING_AWAY_EXCEEDED' : 'ROUTINE_ANALYTICS',
          landmarks: mediaPipeData?.landmarks,
          yaw: gazeResult?.gazeYaw,
          pitch: gazeResult?.gazePitch
        })
      })

      const resData = await response.json()
      setBackendResponse(resData)
    } catch (err) {
      console.error('Error sending analytics:', err)
      alert('เกิดข้อผิดพลาดในการส่ง API')
    } finally {
      setIsSendingAnalytics(false)
    }
  }, [captureFrameSnapshot, gazeResult, mediaPipeData?.landmarks])

  // Render Canvas Sci-Fi Overlay & Gaze Vector Arrow
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video || video.readyState < 2) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (mediaPipeData && mediaPipeData.isDetected && mediaPipeData.landmarks) {
      drawSciFiFaceMesh(
        ctx,
        mediaPipeData.landmarks,
        video,
        canvas.width,
        canvas.height,
        mediaPipeData.orientation.isLookingAway
      )

      // Draw L2CS-Net 3D Gaze Vector Arrow
      if (gazeResult) {
        const centerX = canvas.width / 2
        const centerY = canvas.height / 2
        const arrowLength = 90
        const endX = centerX - (gazeResult.gazeYaw / 45) * arrowLength
        const endY = centerY - (gazeResult.gazePitch / 45) * arrowLength

        ctx.beginPath()
        ctx.moveTo(centerX, centerY)
        ctx.lineTo(endX, endY)
        ctx.strokeStyle = gazeResult.isLookingOffScreen ? '#EF4444' : '#10B981'
        ctx.lineWidth = 4
        ctx.stroke()

        // Arrow head
        ctx.beginPath()
        ctx.arc(endX, endY, 6, 0, 2 * Math.PI)
        ctx.fillStyle = gazeResult.isLookingOffScreen ? '#EF4444' : '#10B981'
        ctx.fill()
      }
    }
  }, [mediaPipeData, gazeResult])

  useEffect(() => {
    let animId: number
    const loop = () => {
      drawOverlay()
      animId = requestAnimationFrame(loop)
    }
    if (isCameraActive) loop()
    return () => cancelAnimationFrame(animId)
  }, [isCameraActive, drawOverlay])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full text-xs font-bold uppercase tracking-wider text-white">
              Phase 3 Deep Analytics
            </span>
            <h1 className="text-2xl font-bold text-white">Backend Deep Analytics Pipeline (L2CS-Net & MiniFASNet)</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Server-Side 3D Screen Gaze Vectors + MiniFASNet Anti-Spoofing & PostgreSQL Logging
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => router.push('/arcface-test')} className="bg-slate-800 hover:bg-slate-700 text-slate-200">
            👤 Phase 2 ArcFace
          </Button>
          <Button onClick={() => router.push('/hybrid-test')} className="bg-slate-800 hover:bg-slate-700 text-slate-200">
            🚀 Phase 1 Hybrid
          </Button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Camera & Live Deep Models */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-slate-800/80 border-slate-700 p-4">
            <div className="relative aspect-video rounded-lg overflow-hidden bg-black flex items-center justify-center border border-slate-700 mb-4">
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
                playsInline
                muted
              />
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none transform -scale-x-100"
              />

              {!isCameraActive && (
                <div className="z-10 text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center mx-auto text-slate-400 text-2xl">
                    🧠
                  </div>
                  <p className="text-slate-300 font-medium">กดปุ่มเพื่อเปิดกล้องทดสอบระบบ Phase 3 Deep Analytics Pipeline</p>
                  <Button
                    onClick={handleStart}
                    className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-6 py-2 rounded-xl font-bold shadow-lg"
                  >
                    🚀 เริ่มการทดสอบ Deep Analytics
                  </Button>
                </div>
              )}
            </div>

            {/* Action Bar */}
            {isCameraActive && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-700">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-purple-500 animate-ping" />
                  <span className="text-xs font-semibold text-purple-400">Deep Models Active (L2CS + MiniFAS)</span>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={sendToBackendAnalytics}
                    disabled={isSendingAnalytics}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs px-4 py-2 rounded-lg font-bold shadow-md"
                  >
                    {isSendingAnalytics ? 'กำลังส่ง API...' : '📸 ถ่ายสแนปชอต & ส่งประมวลผล Backend API'}
                  </Button>
                  <Button onClick={handleStop} className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-2 rounded-lg">
                    🛑 หยุดการทดสอบ
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Model Status Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* L2CS-Net 3D Eye Gaze Card */}
            <Card className="bg-slate-800/80 border-slate-700 p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-emerald-400 text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  L2CS-Net 3D Eye Gaze Estimation
                </h3>
                <span className="text-xs px-2 py-0.5 bg-emerald-900/60 text-emerald-300 rounded font-mono">Vector Engine</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Gaze Pitch (Vertical)</div>
                  <div className="font-bold text-slate-200">{gazeResult?.gazePitch || 0}°</div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Gaze Yaw (Horizontal)</div>
                  <div className="font-bold text-slate-200">{gazeResult?.gazeYaw || 0}°</div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Predicted Direction</div>
                  <div className="font-bold text-amber-300">{gazeResult?.gazeDirection || 'SCREEN_CENTER'}</div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Off-Screen Violation</div>
                  <div className={`font-bold ${gazeResult?.isLookingOffScreen ? 'text-red-400' : 'text-emerald-400'}`}>
                    {gazeResult?.isLookingOffScreen ? '⚠️ YES (OFF-SCREEN)' : '✅ NO (ON-SCREEN)'}
                  </div>
                </div>
              </div>
            </Card>

            {/* MiniFASNet Anti-Spoofing Card */}
            <Card className="bg-slate-800/80 border-slate-700 p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-purple-400 text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  MiniFASNet Anti-Spoofing Engine
                </h3>
                <span className="text-xs px-2 py-0.5 bg-purple-900/60 text-purple-300 rounded font-mono">CNN Liveness</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Liveness Score</div>
                  <div className="font-bold text-purple-300">
                    {((livenessResult?.livenessScore || 0) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Person Authenticity</div>
                  <div className={`font-bold ${livenessResult?.isRealPerson ? 'text-emerald-400' : 'text-red-400'}`}>
                    {livenessResult?.isRealPerson ? '🟢 REAL PERSON' : '🔴 SPOOF DETECTED'}
                  </div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Attack Type</div>
                  <div className="font-bold text-slate-200">{livenessResult?.attackTypeDetected || 'NONE'}</div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Recommendation</div>
                  <div className="font-bold text-blue-300">{livenessResult?.recommendation || 'ALLOW_EXAM'}</div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Right 1 Col: Snapshot & Backend DB Response Log */}
        <div className="space-y-4">
          <Card className="bg-slate-800/80 border-slate-700 p-4 space-y-4">
            <h3 className="font-bold text-slate-200 text-sm pb-2 border-b border-slate-700 flex items-center gap-2">
              📸 Snapshot & PostgreSQL Database API Log
            </h3>

            {capturedSnapshot && (
              <div className="space-y-2">
                <div className="text-xs text-slate-400 font-semibold">ภาพสแนปชอตที่ถูกส่งไปประมวลผล:</div>
                <div className="aspect-video rounded-lg overflow-hidden border border-slate-700 bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={capturedSnapshot} alt="Snapshot Preview" className="w-full h-full object-cover transform -scale-x-100" />
                </div>
              </div>
            )}

            {backendResponse ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-emerald-400 font-bold">API Response Success ✅</span>
                  <span className="text-[10px] text-slate-400 font-mono">Status: 200 OK</span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-[280px] custom-scrollbar">
                  <pre>{JSON.stringify(backendResponse, null, 2)}</pre>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-slate-500 text-xs">
                กดปุ่ม &quot;ถ่ายสแนปชอต &amp; ส่งประมวลผล Backend API&quot; เพื่อดู API Response และ Log DB
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
