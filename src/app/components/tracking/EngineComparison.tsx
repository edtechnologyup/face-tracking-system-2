'use client'
import { useRef, useEffect, useState, useCallback } from 'react'
import { Card } from '@/app/components/ui/Card'
import { Button } from '@/app/components/ui/Button'
import { useCamera } from '@/hooks/useCamera'
import { useMultiEngineDetection } from '@/hooks/useMultiEngineDetection'
import toast from 'react-hot-toast'

export function EngineComparison() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasMpRef = useRef<HTMLCanvasElement>(null)
  const canvasYoloRef = useRef<HTMLCanvasElement>(null)
  const canvasDlibRef = useRef<HTMLCanvasElement>(null)
  const canvasOpenfaceRef = useRef<HTMLCanvasElement>(null)

  const [isRunning, setIsRunning] = useState(false)
  const { initializeCamera, stopCamera } = useCamera()
  const { isInitializing, isActive, results, initializeEngines, processFrame, stopEngines } = useMultiEngineDetection()

  // Main Detection Loop
  const requestRef = useRef<number | null>(null)
  const animate = useCallback(() => {
    if (videoRef.current && videoRef.current.readyState >= 2) {
      processFrame(videoRef.current)

      const video = videoRef.current
      const vw = video.videoWidth || 640
      const vh = video.videoHeight || 480

      // 1. Draw MediaPipe Canvas (468 Landmarks)
      if (canvasMpRef.current) {
        const canvas = canvasMpRef.current
        canvas.width = vw
        canvas.height = vh
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, vw, vh)
          const landmarks = results.mediapipe.data?.landmarks
          if (landmarks && landmarks.length > 0) {
            ctx.fillStyle = '#22c55e'
            for (let i = 0; i < landmarks.length; i += 4) {
              const pt = landmarks[i]
              ctx.beginPath()
              ctx.arc(pt.x * vw, pt.y * vh, 1.2, 0, 2 * Math.PI)
              ctx.fill()
            }
          }
        }
      }

      // 2. Draw YOLOv8-Face Canvas (Bounding Box + 5 Keypoints)
      if (canvasYoloRef.current) {
        const canvas = canvasYoloRef.current
        canvas.width = vw
        canvas.height = vh
        const ctx = canvas.getContext('2d')
        if (ctx && results.yolov8.isDetected && results.yolov8.box) {
          ctx.clearRect(0, 0, vw, vh)
          const b = results.yolov8.box
          ctx.strokeStyle = '#3b82f6'
          ctx.lineWidth = 3
          ctx.strokeRect(b.x, b.y, b.width, b.height)

          // Draw 5 keypoints
          if (results.yolov8.keypoints) {
            ctx.fillStyle = '#ef4444'
            results.yolov8.keypoints.forEach(kp => {
              ctx.beginPath()
              ctx.arc(kp.x, kp.y, 4, 0, 2 * Math.PI)
              ctx.fill()
            })
          }
        }
      }

      // 3. Draw Dlib Canvas (68 Landmarks)
      if (canvasDlibRef.current) {
        const canvas = canvasDlibRef.current
        canvas.width = vw
        canvas.height = vh
        const ctx = canvas.getContext('2d')
        if (ctx && results.dlib.isDetected && results.dlib.landmarks68) {
          ctx.clearRect(0, 0, vw, vh)
          ctx.fillStyle = '#f59e0b'
          results.dlib.landmarks68.forEach(pt => {
            ctx.beginPath()
            ctx.arc(pt.x, pt.y, 2.5, 0, 2 * Math.PI)
            ctx.fill()
          })
        }
      }

      // 4. Draw OpenFace Canvas (Gaze Vector & Action Units Overlay)
      if (canvasOpenfaceRef.current) {
        const canvas = canvasOpenfaceRef.current
        canvas.width = vw
        canvas.height = vh
        const ctx = canvas.getContext('2d')
        if (ctx && results.openface.isDetected) {
          ctx.clearRect(0, 0, vw, vh)
          const cx = vw / 2
          const cy = vh / 2

          // Draw Gaze Vector Line
          const gaze = results.openface.gazeVector
          ctx.strokeStyle = '#a855f7'
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.moveTo(cx, cy - 30)
          ctx.lineTo(cx + gaze.x * 200, cy - 30 + gaze.y * 200)
          ctx.stroke()

          // Draw Action Units Label
          ctx.fillStyle = 'rgba(168, 85, 247, 0.9)'
          ctx.font = 'bold 13px Inter, sans-serif'
          ctx.fillText(`AU12 (Smile): ${results.openface.actionUnits.au12_LipCornerPuller}`, 15, 25)
          ctx.fillText(`Eye Contact: ${gaze.eyeContact ? 'YES' : 'NO'}`, 15, 45)
        }
      }
    }

    requestRef.current = requestAnimationFrame(animate)
  }, [processFrame, results])

  const startComparison = async () => {
    const camSuccess = await initializeCamera(videoRef)
    if (!camSuccess) {
      toast.error('ไม่สามารถเปิดกล้องได้')
      return
    }

    const enginesSuccess = await initializeEngines()
    if (!enginesSuccess) {
      toast.error('ไม่สามารถเริ่มต้น Engine ตรวจจับได้')
      return
    }

    setIsRunning(true)
    toast.success('เริ่มต้นการเปรียบเทียบเรียลไทม์ 4 เครื่องมือสำเร็จ!')
  }

  const stopComparison = () => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current)
    }
    stopCamera(videoRef)
    stopEngines()
    setIsRunning(false)
    toast('หยุดการเปรียบเทียบแล้ว')
  }

  useEffect(() => {
    if (isRunning && isActive) {
      requestRef.current = requestAnimationFrame(animate)
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current)
      }
    }
  }, [isRunning, isActive, animate])

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span>⚡ ระบบทดสอบเปรียบเทียบ 4 เครื่องมือตรวจจับใบหน้า</span>
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            MediaPipe vs YOLOv8-Face vs Dlib (68-Point) vs OpenFace (Real-Time Benchmark)
          </p>
        </div>
        <div className="flex gap-3">
          {!isRunning ? (
            <Button onClick={startComparison} disabled={isInitializing} className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-xl transition-all shadow-md">
              {isInitializing ? '⏳ กำลังเริ่มต้น...' : '🚀 เริ่มต้นเปรียบเทียบเรียลไทม์'}
            </Button>
          ) : (
            <Button onClick={stopComparison} className="bg-red-600 hover:bg-red-700 text-white font-medium px-6 py-2.5 rounded-xl transition-all shadow-md">
              ⏹️ หยุดการเปรียบเทียบ
            </Button>
          )}
        </div>
      </div>

      {/* Hidden Master Video element for camera stream */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* 4-Grid Live Engine Canvas View */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. MediaPipe Slot */}
        <Card className="p-4 relative overflow-hidden border-2 border-green-500/30">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <span className="font-bold text-gray-900">1. MediaPipe (468 3D Mesh)</span>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="bg-green-100 text-green-800 font-bold px-2.5 py-1 rounded-full">
                {results.mediapipe.fps} FPS
              </span>
              <span className="bg-gray-100 text-gray-700 font-semibold px-2.5 py-1 rounded-full">
                {results.mediapipe.latencyMs} ms
              </span>
            </div>
          </div>
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
            <video
              src={videoRef.current?.srcObject ? undefined : undefined}
              ref={(el) => {
                if (el && videoRef.current?.srcObject) el.srcObject = videoRef.current.srcObject
              }}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasMpRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
          </div>
          <div className="mt-3 text-xs text-gray-500 flex justify-between">
            <span>จุด Landmarks: <b>468 จุด (3D)</b></span>
            <span>การใช้งาน: <b>Client WASM (Edge)</b></span>
          </div>
        </Card>

        {/* 2. YOLOv8-Face Slot */}
        <Card className="p-4 relative overflow-hidden border-2 border-blue-500/30">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
              <span className="font-bold text-gray-900">2. YOLOv8-Face (Bounding Box)</span>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="bg-blue-100 text-blue-800 font-bold px-2.5 py-1 rounded-full">
                {results.yolov8.fps} FPS
              </span>
              <span className="bg-gray-100 text-gray-700 font-semibold px-2.5 py-1 rounded-full">
                {results.yolov8.latencyMs} ms
              </span>
            </div>
          </div>
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
            <video
              ref={(el) => {
                if (el && videoRef.current?.srcObject) el.srcObject = videoRef.current.srcObject
              }}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasYoloRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
          </div>
          <div className="mt-3 text-xs text-gray-500 flex justify-between">
            <span>จุด Landmarks: <b>5 จุดหลัก (Box)</b></span>
            <span>การใช้งาน: <b>ONNX Runtime (Ultra Fast)</b></span>
          </div>
        </Card>

        {/* 3. Dlib 68-Point Slot */}
        <Card className="p-4 relative overflow-hidden border-2 border-amber-500/30">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
              <span className="font-bold text-gray-900">3. Dlib (68-Point Landmark)</span>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-full">
                {results.dlib.fps} FPS
              </span>
              <span className="bg-gray-100 text-gray-700 font-semibold px-2.5 py-1 rounded-full">
                {results.dlib.latencyMs} ms
              </span>
            </div>
          </div>
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
            <video
              ref={(el) => {
                if (el && videoRef.current?.srcObject) el.srcObject = videoRef.current.srcObject
              }}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasDlibRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
          </div>
          <div className="mt-3 text-xs text-gray-500 flex justify-between">
            <span>จุด Landmarks: <b>68 จุด (2D Standard)</b></span>
            <span>การใช้งาน: <b>CPU HOG+SVM</b></span>
          </div>
        </Card>

        {/* 4. OpenFace Slot */}
        <Card className="p-4 relative overflow-hidden border-2 border-purple-500/30">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500 animate-pulse" />
              <span className="font-bold text-gray-900">4. OpenFace (Action Units & Gaze)</span>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="bg-purple-100 text-purple-800 font-bold px-2.5 py-1 rounded-full">
                {results.openface.fps} FPS
              </span>
              <span className="bg-gray-100 text-gray-700 font-semibold px-2.5 py-1 rounded-full">
                {results.openface.latencyMs} ms
              </span>
            </div>
          </div>
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
            <video
              ref={(el) => {
                if (el && videoRef.current?.srcObject) el.srcObject = videoRef.current.srcObject
              }}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasOpenfaceRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
          </div>
          <div className="mt-3 text-xs text-gray-500 flex justify-between">
            <span>จุด Landmarks: <b>68+ จุด (Behavioral)</b></span>
            <span>การใช้งาน: <b>Deep Analysis (Server/GPU)</b></span>
          </div>
        </Card>
      </div>

      {/* Benchmark Matrix Comparison Table */}
      <Card className="p-6 bg-white border border-gray-200 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <span>📊 ตารางสรุปเปรียบเทียบประสิทธิภาพ 4 เครื่องมือ (Live Benchmark Matrix)</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">มิติประเมิน / เครื่องมือ</th>
                <th className="px-4 py-3 text-left font-semibold text-green-700 bg-green-50/50">MediaPipe</th>
                <th className="px-4 py-3 text-left font-semibold text-blue-700 bg-blue-50/50">YOLOv8-Face</th>
                <th className="px-4 py-3 text-left font-semibold text-amber-700 bg-amber-50/50">Dlib (68-Point)</th>
                <th className="px-4 py-3 text-left font-semibold text-purple-700 bg-purple-50/50">OpenFace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="px-4 py-3 font-semibold text-gray-900">ความเร็ว (FPS)</td>
                <td className="px-4 py-3 font-bold text-green-600 bg-green-50/30">{results.mediapipe.fps} FPS ⚡⚡⚡⚡</td>
                <td className="px-4 py-3 font-bold text-blue-600 bg-blue-50/30">{results.yolov8.fps} FPS ⚡⚡⚡⚡</td>
                <td className="px-4 py-3 text-amber-700 bg-amber-50/30">{results.dlib.fps} FPS ⚡⚡</td>
                <td className="px-4 py-3 text-purple-700 bg-purple-50/30">{results.openface.fps} FPS ⚡</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-gray-900">เวลาประมวลผล (Latency)</td>
                <td className="px-4 py-3 text-green-700 bg-green-50/30 font-medium">{results.mediapipe.latencyMs} ms</td>
                <td className="px-4 py-3 text-blue-700 bg-blue-50/30 font-medium">{results.yolov8.latencyMs} ms</td>
                <td className="px-4 py-3 text-amber-700 bg-amber-50/30 font-medium">{results.dlib.latencyMs} ms</td>
                <td className="px-4 py-3 text-purple-700 bg-purple-50/30 font-medium">{results.openface.latencyMs} ms</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-gray-900">ความละเอียด จุด Landmarks</td>
                <td className="px-4 py-3 text-green-700 bg-green-50/30">🟢 468 จุด (3D Mesh)</td>
                <td className="px-4 py-3 text-blue-700 bg-blue-50/30">🔴 5 จุดหลัก (Box)</td>
                <td className="px-4 py-3 text-amber-700 bg-amber-50/30">🟡 68 จุด (2D Standard)</td>
                <td className="px-4 py-3 text-purple-700 bg-purple-50/30">🟢 68+ จุด (Behavioral)</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-gray-900">การใช้ทรัพยากร (Resource)</td>
                <td className="px-4 py-3 text-green-700 bg-green-50/30">🟢 ต่ำมาก (Client Edge)</td>
                <td className="px-4 py-3 text-blue-700 bg-blue-50/30">🟡 ต่ำ-ปานกลาง</td>
                <td className="px-4 py-3 text-amber-700 bg-amber-50/30">🟡 ปานกลาง (CPU-bound)</td>
                <td className="px-4 py-3 text-purple-700 bg-purple-50/30">🔴 สูงมาก (ต้องการ GPU)</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-gray-900">ความลึกพฤติกรรม (Action Units)</td>
                <td className="px-4 py-3 text-green-700 bg-green-50/30">🟡 ปานกลาง (Head Pose)</td>
                <td className="px-4 py-3 text-blue-700 bg-blue-50/30">🔴 ไม่มี (เน้นตรวจจับกรอบ)</td>
                <td className="px-4 py-3 text-amber-700 bg-amber-50/30">🔴 ไม่มี</td>
                <td className="px-4 py-3 text-purple-700 bg-purple-50/30">🟢 สูงสุด (สกัด 18+ AUs)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
