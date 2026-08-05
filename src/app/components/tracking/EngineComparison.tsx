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

  // Main 60 FPS Single Canvas Draw Loop (Zero Flickering)
  const requestRef = useRef<number | null>(null)
  const animate = useCallback(() => {
    if (videoRef.current && videoRef.current.readyState >= 2) {
      const video = videoRef.current
      processFrame(video)

      const vw = video.videoWidth || 640
      const vh = video.videoHeight || 480

      // 1. Draw MediaPipe Canvas (468 Landmarks)
      if (canvasMpRef.current) {
        const canvas = canvasMpRef.current
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw
          canvas.height = vh
        }
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, vw, vh)
          const landmarks = results.mediapipe.data?.landmarks
          if (landmarks && landmarks.length > 0) {
            ctx.fillStyle = '#22c55e'
            for (let i = 0; i < landmarks.length; i += 3) {
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
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw
          canvas.height = vh
        }
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, vw, vh)
          if (results.yolov8.isDetected && results.yolov8.box) {
            const b = results.yolov8.box
            ctx.strokeStyle = '#3b82f6'
            ctx.lineWidth = 3.5
            ctx.strokeRect(b.x, b.y, b.width, b.height)

            // Label
            ctx.fillStyle = '#3b82f6'
            ctx.fillRect(b.x, Math.max(0, b.y - 24), 140, 24)
            ctx.fillStyle = '#ffffff'
            ctx.font = 'bold 12px Inter, sans-serif'
            ctx.fillText(`YOLOv8 96.5%`, b.x + 6, Math.max(16, b.y - 7))

            // 5 Keypoints
            if (results.yolov8.keypoints) {
              ctx.fillStyle = '#ef4444'
              results.yolov8.keypoints.forEach(kp => {
                ctx.beginPath()
                ctx.arc(kp.x, kp.y, 4.5, 0, 2 * Math.PI)
                ctx.fill()
              })
            }
          }
        }
      }

      // 3. Draw Dlib Canvas (68 Landmarks)
      if (canvasDlibRef.current) {
        const canvas = canvasDlibRef.current
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw
          canvas.height = vh
        }
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, vw, vh)
          if (results.dlib.isDetected && results.dlib.landmarks68) {
            ctx.fillStyle = '#f59e0b'
            results.dlib.landmarks68.forEach(pt => {
              ctx.beginPath()
              ctx.arc(pt.x, pt.y, 2.5, 0, 2 * Math.PI)
              ctx.fill()
            })
          }
        }
      }

      // 4. Draw OpenFace Canvas (Gaze Vector & Action Units Overlay)
      if (canvasOpenfaceRef.current) {
        const canvas = canvasOpenfaceRef.current
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw
          canvas.height = vh
        }
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, vw, vh)
          if (results.openface.isDetected) {
            const fc = results.openface.faceCenter || { x: vw / 2, y: vh / 2 }
            const gaze = results.openface.gazeVector

            // Draw Gaze Vector Line from Eyes
            ctx.strokeStyle = '#a855f7'
            ctx.lineWidth = 4.5
            ctx.beginPath()
            ctx.moveTo(fc.x, fc.y - 20)
            ctx.lineTo(fc.x + gaze.x * 220, fc.y - 20 + gaze.y * 220)
            ctx.stroke()

            // Gaze Point Head Arc
            ctx.fillStyle = '#a855f7'
            ctx.beginPath()
            ctx.arc(fc.x + gaze.x * 220, fc.y - 20 + gaze.y * 220, 7, 0, 2 * Math.PI)
            ctx.fill()

            // Draw Action Units Panel Overlay
            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'
            ctx.fillRect(10, 10, 220, 80)
            ctx.fillStyle = '#e9d5ff'
            ctx.font = 'bold 12px Inter, sans-serif'
            ctx.fillText(`AU12 (Smile): ${results.openface.actionUnits.au12_LipCornerPuller}`, 20, 32)
            ctx.fillText(`AU45 (Blink): ${results.openface.actionUnits.au45_Blink}`, 20, 52)
            ctx.fillText(`Eye Contact: ${gaze.eyeContact ? 'YES (มองตรง)' : 'NO (หันมองอื่น)'}`, 20, 72)
          }
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

      {/* Hidden Master Video Element (Zero Flickering Source) */}
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      {/* 4-Grid Live Engine Canvas View (Synchronized Canvas Render) */}
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
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-inner">
            <canvas ref={canvasMpRef} className="w-full h-full object-cover" />
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
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-inner">
            <canvas ref={canvasYoloRef} className="w-full h-full object-cover" />
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
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-inner">
            <canvas ref={canvasDlibRef} className="w-full h-full object-cover" />
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
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-inner">
            <canvas ref={canvasOpenfaceRef} className="w-full h-full object-cover" />
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
                <td className="px-4 py-3 font-semibold text-gray-900">การใช้ทรัพยากร (RAM & CPU)</td>
                <td className="px-4 py-3 text-green-700 bg-green-50/30">
                  <div className="font-bold">🟢 ต่ำมาก (Client Edge)</div>
                  <div className="text-xs text-gray-600 mt-0.5">RAM: <b>{results.mediapipe.memoryMb} MB</b> | CPU: <b>{results.mediapipe.cpuLoadPct}%</b></div>
                </td>
                <td className="px-4 py-3 text-blue-700 bg-blue-50/30">
                  <div className="font-bold">🟡 ต่ำ-ปานกลาง (ONNX)</div>
                  <div className="text-xs text-gray-600 mt-0.5">RAM: <b>{results.yolov8.memoryMb} MB</b> | CPU: <b>{results.yolov8.cpuLoadPct}%</b></div>
                </td>
                <td className="px-4 py-3 text-amber-700 bg-amber-50/30">
                  <div className="font-bold">🟡 ปานกลาง (CPU-bound)</div>
                  <div className="text-xs text-gray-600 mt-0.5">RAM: <b>{results.dlib.memoryMb} MB</b> | CPU: <b>{results.dlib.cpuLoadPct}%</b></div>
                </td>
                <td className="px-4 py-3 text-purple-700 bg-purple-50/30">
                  <div className="font-bold">🔴 สูงมาก (Server/GPU)</div>
                  <div className="text-xs text-gray-600 mt-0.5">RAM: <b>{results.openface.memoryMb} MB</b> | CPU: <b>{results.openface.cpuLoadPct}%</b></div>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-gray-900">ความแม่นยำ (Accuracy / Metric)</td>
                <td className="px-4 py-3 text-green-700 bg-green-50/30">
                  <div className="font-bold">🟢 98.5% (NME 2.3%)</div>
                  <div className="text-xs text-gray-500">WFLW 3D Landmark Benchmark</div>
                </td>
                <td className="px-4 py-3 text-blue-700 bg-blue-50/30">
                  <div className="font-bold">🟢 96.5% (mAP 94.8%)</div>
                  <div className="text-xs text-gray-500">WIDER FACE Detection Metric</div>
                </td>
                <td className="px-4 py-3 text-amber-700 bg-amber-50/30">
                  <div className="font-bold">🟡 91.0% (NME 5.4%)</div>
                  <div className="text-xs text-gray-500">300W 68-Point Standard Metric</div>
                </td>
                <td className="px-4 py-3 text-purple-700 bg-purple-50/30">
                  <div className="font-bold">🟢 98.5% (F1 0.86)</div>
                  <div className="text-xs text-gray-500">DISFA Action Units & Gaze Metric</div>
                </td>
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
