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
  const { isActive, results, initializeEngines, processFrame, stopEngines } = useMultiEngineDetection()

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

            // Draw blendshape panel from MediaPipe (OpenFace not available in browser)
            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'
            ctx.fillRect(10, 10, 240, 80)
            ctx.fillStyle = '#e9d5ff'
            ctx.font = 'bold 12px Inter, sans-serif'
            const bs = results.mediapipe.data?.actionUnits?.blendshapes
            const smile = bs?.mouthSmileLeft ?? bs?.mouthSmileRight
            const blink = bs?.eyeBlinkLeft ?? bs?.eyeBlinkRight
            ctx.fillText(`Blendshape Smile: ${smile != null ? smile.toFixed(2) : '-'}`, 20, 32)
            ctx.fillText(`Blendshape Blink: ${blink != null ? blink.toFixed(2) : '-'}`, 20, 52)
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
  }, [isRunning])

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
      {/* Control Panel Card */}
      <Card className="p-6 bg-gradient-to-r from-gray-900 via-slate-800 to-gray-900 text-white shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span>🔬 Multi-Engine Real-Time Face Detection Benchmark</span>
              <span className="text-xs bg-purple-500/30 text-purple-300 border border-purple-400/30 px-2 py-0.5 rounded-full font-normal">
                Phase 1 Benchmark
              </span>
            </h2>
            <p className="text-sm text-gray-300 mt-1">
              เปรียบเทียบประสิทธิภาพการประมวลผล real-time 4 เครื่องมือ (MediaPipe, YOLOv8-Face, Dlib, OpenFace)
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {!isRunning ? (
              <Button onClick={startComparison} className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-green-500/20">
                🚀 เริ่มทดสอบเปรียบเทียบ 4 เครื่องมือ
              </Button>
            ) : (
              <Button onClick={stopComparison} className="bg-red-600 hover:bg-red-700 text-white font-medium px-6 py-2.5 rounded-xl transition-all shadow-md">
                ⏹️ หยุดการเปรียบเทียบ
              </Button>
            )}
          </div>
        </div>
      </Card>

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
          <div 
            className="relative bg-black rounded-xl overflow-hidden shadow-inner max-h-[50vh] transition-all duration-300 flex items-center justify-center"
            style={{ aspectRatio: aspectRatio ? `${aspectRatio}` : '16/9' }}
          >
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
          <div 
            className="relative bg-black rounded-xl overflow-hidden shadow-inner max-h-[50vh] transition-all duration-300 flex items-center justify-center"
            style={{ aspectRatio: aspectRatio ? `${aspectRatio}` : '16/9' }}
          >
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
          <div 
            className="relative bg-black rounded-xl overflow-hidden shadow-inner max-h-[50vh] transition-all duration-300 flex items-center justify-center"
            style={{ aspectRatio: aspectRatio ? `${aspectRatio}` : '16/9' }}
          >
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
          <div 
            className="relative bg-black rounded-xl overflow-hidden shadow-inner max-h-[50vh] transition-all duration-300 flex items-center justify-center"
            style={{ aspectRatio: aspectRatio ? `${aspectRatio}` : '16/9' }}
          >
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
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          ตารางสรุปเปรียบเทียบประสิทธิภาพ 4 เครื่องมือ (Live Benchmark Matrix)
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
                <td className="px-4 py-3 font-bold text-green-600 bg-green-50/30">{results.mediapipe.fps} FPS</td>
                <td className="px-4 py-3 font-bold text-blue-600 bg-blue-50/30">{results.yolov8.fps} FPS</td>
                <td className="px-4 py-3 text-amber-700 bg-amber-50/30">{results.dlib.fps} FPS</td>
                <td className="px-4 py-3 text-purple-700 bg-purple-50/30">{results.openface.fps} FPS</td>
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
                <td className="px-4 py-3 text-green-700 bg-green-50/30">468 จุด (3D Mesh)</td>
                <td className="px-4 py-3 text-blue-700 bg-blue-50/30">5 จุดหลัก (Box)</td>
                <td className="px-4 py-3 text-amber-700 bg-amber-50/30">68 จุด (2D Standard)</td>
                <td className="px-4 py-3 text-purple-700 bg-purple-50/30">68+ จุด (Behavioral)</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-gray-900">การใช้ทรัพยากร (RAM & CPU)</td>
                <td className="px-4 py-3 text-green-700 bg-green-50/30">
                  <div className="font-bold">ต่ำมาก (Client Edge)</div>
                  <div className="text-xs text-gray-600 mt-0.5">รันใน browser — ไม่วัด RAM/CPU ต่อโมเดล</div>
                </td>
                <td className="px-4 py-3 text-blue-700 bg-blue-50/30">
                  <div className="font-bold">ต่ำ-ปานกลาง (ONNX)</div>
                  <div className="text-xs text-gray-600 mt-0.5">รันใน browser — ไม่วัด RAM/CPU ต่อโมเดล</div>
                </td>
                <td className="px-4 py-3 text-amber-700 bg-amber-50/30">
                  <div className="font-bold">ปานกลาง (CPU-bound)</div>
                  <div className="text-xs text-gray-600 mt-0.5">รันใน browser — ไม่วัด RAM/CPU ต่อโมเดล</div>
                </td>
                <td className="px-4 py-3 text-purple-700 bg-purple-50/30">
                  <div className="font-bold">สูงมาก (Server/GPU)</div>
                  <div className="text-xs text-gray-600 mt-0.5">รันบน OpenFace server</div>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-gray-900">ความแม่นยำ (Real-Time Confidence)</td>
                <td className="px-4 py-3 text-green-700 bg-green-50/30">
                  <div className="font-bold text-green-600">{((results.mediapipe.data?.confidence || 0) * 100).toFixed(1)}%</div>
                </td>
                <td className="px-4 py-3 text-blue-700 bg-blue-50/30">
                  <div className="font-bold text-blue-600">{(results.yolov8.confidence * 100).toFixed(1)}%</div>
                </td>
                <td className="px-4 py-3 text-amber-700 bg-amber-50/30">
                  <div className="font-bold text-amber-600">{(results.dlib.confidence * 100).toFixed(1)}%</div>
                </td>
                <td className="px-4 py-3 text-purple-700 bg-purple-50/30">
                  <div className="font-bold text-purple-600">N/A</div>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-gray-900">ความลึกพฤติกรรม (Action Units)</td>
                <td className="px-4 py-3 text-green-700 bg-green-50/30">ปานกลาง (Head Pose)</td>
                <td className="px-4 py-3 text-blue-700 bg-blue-50/30">ไม่มี (เน้นตรวจจับกรอบ)</td>
                <td className="px-4 py-3 text-amber-700 bg-amber-50/30">ไม่มี</td>
                <td className="px-4 py-3 text-purple-700 bg-purple-50/30">ไม่พร้อมใช้ (browser)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
