'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCamera } from '@/hooks/useCamera'
import { useHybridFaceDetection } from '@/hooks/useHybridFaceDetection'
import { drawSciFiFaceMesh } from '@/lib/face-mesh-utils'
import { Button } from '@/app/components/ui/Button'
import { Card } from '@/app/components/ui/Card'

export default function HybridTestPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [yoloIntervalMs, setYoloIntervalMs] = useState(1500)
  const { initializeCamera, stopCamera } = useCamera()
  const {
    isInitializing,
    isActive,
    mediaPipeData,
    yoloMultiFaceData,
    violations,
    simulateIntruder,
    setSimulateIntruder,
    initializeHybridDetectors,
    startHybridTracking,
    stopHybridTracking
  } = useHybridFaceDetection({
    primaryIntervalMs: 100,
    yoloIntervalMs: yoloIntervalMs,
    lookingAwayThresholdMs: 3000
  })

  // Start Camera and Hybrid Detectors
  const handleStart = async () => {
    const camOk = await initializeCamera(videoRef)
    if (!camOk) {
      alert('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้งานกล้องในเบราว์เซอร์')
      return
    }

    const initOk = await initializeHybridDetectors()
    if (!initOk) {
      alert('ไม่สามารถโหลดโมเดลได้ กรุณาเช็คอินเทอร์เน็ต')
      return
    }

    startHybridTracking(videoRef)
  }

  // Stop Tracking & Camera
  const handleStop = () => {
    stopHybridTracking()
    stopCamera(videoRef)
  }

  // Render Canvas Sci-Fi Overlay from MediaPipe
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video || video.readyState < 2) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 1. Draw MediaPipe 468-point mesh for primary face
    if (mediaPipeData && mediaPipeData.isDetected && mediaPipeData.landmarks) {
      drawSciFiFaceMesh(
        ctx,
        mediaPipeData.landmarks,
        video,
        canvas.width,
        canvas.height,
        mediaPipeData.orientation.isLookingAway
      )
    }

    // 2. Render YOLOv8 Multi-Face Bounding Boxes
    if (yoloMultiFaceData && yoloMultiFaceData.boxes) {
      yoloMultiFaceData.boxes.forEach((box) => {
        const scaleX = canvas.width / (video.videoWidth || 640)
        const scaleY = canvas.height / (video.videoHeight || 480)

        const bx = box.x * scaleX
        const by = box.y * scaleY
        const bw = box.width * scaleX
        const bh = box.height * scaleY

        ctx.strokeStyle = box.isPrimary ? '#3B82F6' : '#EAB308' // Blue for primary, Yellow for intruder
        ctx.lineWidth = box.isPrimary ? 2 : 3
        ctx.setLineDash(box.isPrimary ? [4, 4] : [])
        ctx.strokeRect(bx, by, bw, bh)

        // Label tag
        ctx.fillStyle = box.isPrimary ? '#3B82F6' : '#EAB308'
        ctx.font = 'bold 12px sans-serif'
        ctx.fillText(
          `YOLOv8 ${box.isPrimary ? 'Primary' : 'Intruder'} (${(box.confidence * 100).toFixed(0)}%)`,
          bx + 5,
          by > 20 ? by - 6 : by + 15
        )
      })
    }
  }, [mediaPipeData, yoloMultiFaceData])

  useEffect(() => {
    let animId: number
    const loop = () => {
      drawOverlay()
      animId = requestAnimationFrame(loop)
    }
    if (isActive) {
      loop()
    }
    return () => cancelAnimationFrame(animId)
  }, [isActive, drawOverlay])

  const [aspectRatio, setAspectRatio] = useState<number | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const updateAspect = () => {
      if (video.videoWidth && video.videoHeight) {
        setAspectRatio(video.videoWidth / video.videoHeight)
      }
    }
    video.addEventListener('loadedmetadata', updateAspect)
    video.addEventListener('resize', updateAspect)
    if (video.videoWidth && video.videoHeight) updateAspect()
    return () => {
      video.removeEventListener('loadedmetadata', updateAspect)
      video.removeEventListener('resize', updateAspect)
    }
  }, [isActive])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full text-xs font-bold uppercase tracking-wider text-white">
              Phase 1 Hybrid Test
            </span>
            <h1 className="text-2xl font-bold text-white">Client-Side Hybrid Architecture Test</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Primary: MediaPipe (468 Mesh + Head Pose @ 100ms) | Background: YOLOv8-Face (Multi-Face Scan @ {yoloIntervalMs}ms)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => router.push('/comparison')} className="bg-slate-800 hover:bg-slate-700 text-slate-200">
            📊 Benchmark Lab
          </Button>
          <Button onClick={() => router.push('/tracking')} className="bg-slate-800 hover:bg-slate-700 text-slate-200">
            📹 Normal Tracking
          </Button>
        </div>
      </div>

      {/* Multi-Face Intrusion Alert Banner */}
      {(yoloMultiFaceData?.hasMultipleFaces || (mediaPipeData?.multipleFaces?.count || 0) > 1) && (
        <div className="max-w-7xl mx-auto mb-6 p-4 bg-red-900/80 border-2 border-red-500 rounded-xl text-white flex items-center justify-between animate-pulse shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🚨</span>
            <div>
              <h3 className="font-bold text-lg">SECURITY ALERT: MULTI-FACE INTRUSION DETECTED!</h3>
              <p className="text-sm text-red-200">
                ตรวจพบใบหน้าบุคคลมากกว่า 1 คนในกล้อง ({yoloMultiFaceData?.faceCount || mediaPipeData?.multipleFaces?.count} คน) สแกนโดย Hybrid Scanner
              </p>
            </div>
          </div>
          <span className="px-3 py-1 bg-red-600 rounded-lg text-xs font-bold">HIGH RISK</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Video & Canvas */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-slate-800/80 border-slate-700 p-4 relative overflow-hidden">
            <div 
              className="relative rounded-lg overflow-hidden bg-black flex items-center justify-center border border-slate-700 max-h-[60vh] transition-all duration-300"
              style={{ aspectRatio: aspectRatio ? `${aspectRatio}` : '16/9' }}
            >
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

              {!isActive && (
                <div className="z-10 text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center mx-auto text-slate-400">
                    📹
                  </div>
                  <p className="text-slate-300 font-medium">กดปุ่มเริ่มต้นเพื่อทดสอบ Hybrid System</p>
                  <Button
                    onClick={handleStart}
                    disabled={isInitializing}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-2 rounded-xl font-bold shadow-lg"
                  >
                    {isInitializing ? 'กำลังโหลดโมเดล...' : '🚀 เริ่มทดสอบ Hybrid Engine'}
                  </Button>
                </div>
              )}
            </div>

            {/* Controls bar */}
            {isActive && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-700">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-sm font-semibold text-emerald-400">Hybrid Tracking Active</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    onClick={() => setSimulateIntruder(!simulateIntruder)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      simulateIntruder
                        ? 'bg-amber-600 border-amber-400 text-white font-bold animate-pulse'
                        : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {simulateIntruder ? '🎭 ปิดการจำลองบุคคลที่ 2' : '🎭 จำลองบุคคลที่ 2 เข้าเฟรม'}
                  </Button>

                  <label className="text-xs text-slate-400 ml-2">YOLOv8 Scan Frequency:</label>
                  <select
                    value={yoloIntervalMs}
                    onChange={(e) => setYoloIntervalMs(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200"
                  >
                    <option value={500}>500ms (High)</option>
                    <option value={1000}>1000ms (Medium)</option>
                    <option value={1500}>1500ms (Recommended)</option>
                    <option value={2000}>2000ms (Power Save)</option>
                  </select>

                  <Button onClick={handleStop} className="bg-red-600 hover:bg-red-700 text-white text-xs px-4 py-1.5 rounded-lg ml-2">
                    🛑 หยุดติดตาม
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Engine Real-time Metrics Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* MediaPipe Primary Metrics */}
            <Card className="bg-slate-800/80 border-slate-700 p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-blue-400 text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  Primary: MediaPipe Face Mesh
                </h3>
                <span className="text-xs px-2 py-0.5 bg-blue-900/60 text-blue-300 rounded font-mono">100ms Loop</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Face Status</div>
                  <div className="font-bold text-slate-200">
                    {mediaPipeData?.isDetected ? '🟢 Detected' : '🔴 No Face'}
                  </div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Landmarks</div>
                  <div className="font-bold text-slate-200">{mediaPipeData?.landmarks?.length || 0} points (3D)</div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Head Yaw / Pitch</div>
                  <div className="font-bold text-slate-200">
                    Yaw: {mediaPipeData?.orientation?.yaw?.toFixed(1) || 0}° | Pitch: {mediaPipeData?.orientation?.pitch?.toFixed(1) || 0}°
                  </div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Gaze State</div>
                  <div className={`font-bold ${mediaPipeData?.orientation?.isLookingAway ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {mediaPipeData?.orientation?.isLookingAway ? '⚠️ Looking Away' : '✅ Center'}
                  </div>
                </div>
              </div>
            </Card>

            {/* YOLOv8 Background Metrics */}
            <Card className="bg-slate-800/80 border-slate-700 p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-amber-400 text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Background: YOLOv8 Multi-Face Scanner
                </h3>
                <span className="text-xs px-2 py-0.5 bg-amber-900/60 text-amber-300 rounded font-mono">{yoloIntervalMs}ms Async</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Total Faces Detected</div>
                  <div className="font-bold text-amber-300 text-sm">{yoloMultiFaceData?.faceCount || mediaPipeData?.multipleFaces?.count || 0} คน</div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Multi-Face Alarm</div>
                  <div className={`font-bold ${yoloMultiFaceData?.hasMultipleFaces || (mediaPipeData?.multipleFaces?.count || 0) > 1 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {yoloMultiFaceData?.hasMultipleFaces || (mediaPipeData?.multipleFaces?.count || 0) > 1 ? '🚨 ALERT ACTIVE' : '✅ Clear'}
                  </div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Scan Latency</div>
                  <div className="font-bold text-slate-200">{yoloMultiFaceData?.latencyMs || 0} ms</div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded">
                  <div className="text-slate-400">Confidence Score</div>
                  <div className="font-bold text-slate-200">{((yoloMultiFaceData?.confidence || 0) * 100).toFixed(1)}%</div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Right 1 Col: Live Security Event Log */}
        <div className="space-y-4">
          <Card className="bg-slate-800/80 border-slate-700 p-4 h-full flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-700 mb-3">
              <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                🛡️ Live Security Event Log
              </h3>
              <span className="text-xs text-slate-400">Total: {violations.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[500px] space-y-2 pr-1 custom-scrollbar">
              {violations.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  ยังไม่พบเหตุการณ์น่าสงสัย ระบบปลอดภัย ✅
                </div>
              ) : (
                violations.map((v) => (
                  <div
                    key={v.id}
                    className={`p-3 rounded-lg border text-xs space-y-1 ${
                      v.severity === 'CRITICAL'
                        ? 'bg-red-950/60 border-red-800 text-red-200'
                        : 'bg-amber-950/60 border-amber-800 text-amber-200'
                    }`}
                  >
                    <div className="flex justify-between items-center font-bold">
                      <span className="flex items-center gap-1.5">
                        {v.severity === 'CRITICAL' ? '🔴' : '⚠️'} {v.type}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(v.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-300">{v.message}</p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
