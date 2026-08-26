'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useCamera } from '@/hooks/useCamera'
import { InsightFaceArcFaceEngine, ArcFaceVerificationResult } from '@/lib/engines/insightface-arcface'
import { MediaPipeDetector, FaceTrackingData } from '@/lib/mediapipe-detector'
import { drawSciFiFaceMesh } from '@/lib/face-mesh-utils'
import { Button } from '@/app/components/ui/Button'
import { Card } from '@/app/components/ui/Card'

export default function ArcFaceTestPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const arcFaceEngineRef = useRef<InsightFaceArcFaceEngine | null>(null)
  const mpDetectorRef = useRef<MediaPipeDetector | null>(null)
  const mpIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const { initializeCamera, stopCamera } = useCamera()
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [mediaPipeData, setMediaPipeData] = useState<FaceTrackingData | null>(null)
  const [registeredPoses, setRegisteredPoses] = useState<Record<string, number[]>>({})
  const [verificationResult, setVerificationResult] = useState<ArcFaceVerificationResult | null>(null)
  const [scanMessage, setScanMessage] = useState<string | null>(null)

  // Initialize ArcFace Engine, MediaPipe & Camera
  const handleStart = async () => {
    const ok = await initializeCamera(videoRef)
    if (!ok) {
      alert('ไม่สามารถเปิดกล้องได้')
      return
    }

    if (!arcFaceEngineRef.current) {
      arcFaceEngineRef.current = new InsightFaceArcFaceEngine()
    }

    if (!mpDetectorRef.current) {
      mpDetectorRef.current = new MediaPipeDetector()
      await mpDetectorRef.current.initialize()
    }

    setIsCameraActive(true)

    // Start 100ms MediaPipe detection loop for face tracking & landmarks
    if (mpIntervalRef.current) clearInterval(mpIntervalRef.current)
    mpIntervalRef.current = setInterval(async () => {
      if (videoRef.current && mpDetectorRef.current) {
        const data = await mpDetectorRef.current.detectFromVideo(videoRef.current)
        if (data) setMediaPipeData(data)
      }
    }, 100)
  }

  const handleStop = () => {
    if (mpIntervalRef.current) {
      clearInterval(mpIntervalRef.current)
      mpIntervalRef.current = null
    }
    if (mpDetectorRef.current) {
      mpDetectorRef.current.destroy()
      mpDetectorRef.current = null
    }
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

  // Render Canvas Sci-Fi Mesh for Face Gatekeeper
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
    }
  }, [mediaPipeData])

  useEffect(() => {
    let animId: number
    const loop = () => {
      drawOverlay()
      animId = requestAnimationFrame(loop)
    }
    if (isCameraActive) {
      loop()
    }
    return () => cancelAnimationFrame(animId)
  }, [isCameraActive, drawOverlay])

  // Capture 512D Vector with Strict Face Check Gatekeeper
  const capturePoseVector = useCallback((poseName: string) => {
    if (!videoRef.current || !arcFaceEngineRef.current) return

    // 🔴 Gatekeeper Check: Ensure face is detected
    if (!mediaPipeData || !mediaPipeData.isDetected || !mediaPipeData.landmarks || mediaPipeData.landmarks.length < 10) {
      setScanMessage(`⚠️ ไม่พบใบหน้าในกล้อง! กรุณาอยู่หน้ากล้องเพื่อสแกนท่า ${poseName}`)
      return
    }

    const emb = arcFaceEngineRef.current.extract512DEmbedding(videoRef.current, mediaPipeData.landmarks)
    if (!emb) {
      setScanMessage('⚠️ ไม่สามารถสกัดคุณลักษณะใบหน้าได้')
      return
    }

    setRegisteredPoses((prev) => ({
      ...prev,
      [poseName]: emb,
    }))

    setScanMessage(`✅ บันทึก Biometric 512D ท่า ${poseName} สำเร็จ!`)
  }, [mediaPipeData])

  // Run Live Verification with Strict Gatekeeper
  const verifyLiveIdentity = useCallback(() => {
    if (!videoRef.current || !arcFaceEngineRef.current) return

    if (Object.keys(registeredPoses).length === 0) {
      alert('กรุณาสแกนลงทะเบียนอย่างน้อย 1 ท่าก่อนกดทดสอบยืนยันตัวตน')
      return
    }

    // 🔴 Gatekeeper Check: Ensure face is detected
    if (!mediaPipeData || !mediaPipeData.isDetected || !mediaPipeData.landmarks || mediaPipeData.landmarks.length < 10) {
      setScanMessage('❌ ไม่พบใบหน้าในกล้อง! ระบบปฏิเสธการยืนยันตัวตน (No Face Detected)')
      setVerificationResult({
        isMatch: false,
        similarityScore: 0,
        euclideanDistance: 2.0,
        bestMatchingPose: 'none',
        securityLevel: 'LOW',
        thresholdUsed: 0.68,
        poseScores: []
      })
      return
    }

    const liveEmb = arcFaceEngineRef.current.extract512DEmbedding(videoRef.current, mediaPipeData.landmarks)
    if (!liveEmb) {
      setScanMessage('❌ ไม่สามารถสกัดข้อมูลใบหน้าสำหรับการยืนยันได้')
      return
    }

    const result = arcFaceEngineRef.current.verifyMultiPoseBiometrics(registeredPoses, liveEmb, 0.68)
    setVerificationResult(result)
    setScanMessage(
      result.isMatch
        ? `✅ ยืนยันตัวตนสำเร็จ! (ตรงกับท่า ${result.bestMatchingPose} คะแนน: ${(result.similarityScore * 100).toFixed(1)}%)`
        : `❌ ใบหน้าไม่ตรงกับข้อมูล 512D ที่บันทึกไว้ (คะแนนสูงสุด: ${(result.similarityScore * 100).toFixed(1)}% < Threshold 68%)`
    )
  }, [registeredPoses, mediaPipeData])

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
  }, [isCameraActive])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full text-xs font-bold uppercase tracking-wider text-white">
              Phase 2 ArcFace Auth
            </span>
            <h1 className="text-2xl font-bold text-white">InsightFace (ArcFace 512D) Biometric Verification Test</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Strict Gatekeeper & 512-Dimensional Biometric Cosine Similarity Matching
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => router.push('/hybrid-test')} className="bg-slate-800 hover:bg-slate-700 text-slate-200">
            🚀 Phase 1 Hybrid Test
          </Button>
          <Button onClick={() => router.push('/login')} className="bg-purple-600 hover:bg-purple-700 text-white">
            🔐 Main Login Page
          </Button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Camera & ArcFace Controls */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-slate-800/80 border-slate-700 p-4">
            <div 
              className="relative rounded-lg overflow-hidden bg-black flex items-center justify-center border border-slate-700 mb-4 max-h-[60vh] transition-all duration-300"
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

              {!isCameraActive && (
                <div className="z-10 text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center mx-auto text-slate-400 text-2xl">
                    👤
                  </div>
                  <p className="text-slate-300 font-medium">กดปุ่มเพื่อเริ่มทดสอบระบบ InsightFace ArcFace 512D</p>
                  <Button
                    onClick={handleStart}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-6 py-2 rounded-xl font-bold shadow-lg"
                  >
                    🚀 เปิดกล้องสแกนใบหน้า ArcFace
                  </Button>
                </div>
              )}
            </div>

            {/* Status Feedback Toast Banner */}
            {scanMessage && (
              <div className="mb-4 p-3 bg-slate-900 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200">
                {scanMessage}
              </div>
            )}

            {/* Action Buttons */}
            {isCameraActive && (
              <div className="space-y-3 pt-2 border-t border-slate-700">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-semibold">ขั้นตอนลงทะเบียนและยืนยันตัวตน Biometric 512D:</span>
                  <span className={`font-bold ${mediaPipeData?.isDetected ? 'text-emerald-400' : 'text-red-400'}`}>
                    {mediaPipeData?.isDetected ? '🟢 Face Detected (พร้อมสแกน)' : '🔴 No Face (โปรดอยู่หน้ากล้อง)'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      onClick={() => capturePoseVector('front')}
                      disabled={!mediaPipeData?.isDetected}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs px-3 py-2 rounded-lg"
                    >
                      📸 1. ลงทะเบียน 512D หน้าตรง
                    </Button>
                    <Button
                      onClick={() => capturePoseVector('left')}
                      disabled={!mediaPipeData?.isDetected}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-3 py-2 rounded-lg"
                    >
                      📸 2. ลงทะเบียน 512D หันซ้าย
                    </Button>
                    <Button
                      onClick={() => capturePoseVector('right')}
                      disabled={!mediaPipeData?.isDetected}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs px-3 py-2 rounded-lg"
                    >
                      📸 3. ลงทะเบียน 512D หันขวา
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={verifyLiveIdentity}
                      className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-4 py-2 rounded-lg font-bold shadow-md"
                    >
                      🔍 4. ทดสอบยืนยันตัวตน
                    </Button>
                    <Button onClick={handleStop} className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-2 rounded-lg">
                      🛑 ปิดกล้อง
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Registered Posal Embeddings Status */}
          <Card className="bg-slate-800/80 border-slate-700 p-4">
            <h3 className="font-bold text-slate-200 text-sm mb-3 flex items-center gap-2">
              📂 ข้อมูลใบหน้า ArcFace 512D ที่ลงทะเบียนไว้ ({Object.keys(registeredPoses).length} ท่า)
            </h3>

            {Object.keys(registeredPoses).length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                ยังไม่มีข้อมูล 512D กรุณากดลงทะเบียนอย่างน้อย 1 ท่า
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Object.entries(registeredPoses).map(([pose, vec]) => (
                  <div key={pose} className="bg-slate-900/80 p-3 rounded-lg border border-slate-700 text-xs space-y-1">
                    <div className="flex justify-between items-center font-bold text-emerald-400 uppercase">
                      <span>Pose: {pose}</span>
                      <span className="text-[10px] text-slate-400 font-mono">512D Vector</span>
                    </div>
                    <div className="text-slate-400 font-mono text-[10px] truncate">
                      Sample: [{vec.slice(0, 5).join(', ')}...]
                    </div>
                    <div className="text-slate-500 text-[10px]">L2 Normalized (||v|| = 1)</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right 1 Col: Verification Result Meter */}
        <div className="space-y-4">
          <Card className="bg-slate-800/80 border-slate-700 p-4 space-y-4">
            <h3 className="font-bold text-slate-200 text-sm pb-2 border-b border-slate-700 flex items-center gap-2">
              🛡️ ArcFace Biometric Verification Meter
            </h3>

            {verificationResult ? (
              <div className="space-y-4">
                <div
                  className={`p-4 rounded-xl border text-center space-y-1 ${
                    verificationResult.isMatch
                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
                      : 'bg-red-950/80 border-red-500 text-red-200'
                  }`}
                >
                  <div className="text-3xl mb-1">{verificationResult.isMatch ? '✅' : '❌'}</div>
                  <h4 className="font-bold text-base">
                    {verificationResult.isMatch ? 'VERIFICATION MATCHED' : 'VERIFICATION FAILED'}
                  </h4>
                  <p className="text-xs text-slate-300">
                    {verificationResult.isMatch
                      ? `ยืนยันตัวตนสำเร็จ ตรงกับท่า ${verificationResult.bestMatchingPose}`
                      : 'ใบหน้าไม่ตรงกับข้อมูล Biometric 512D ที่ลงทะเบียนไว้'}
                  </p>
                </div>

                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-700 space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Cosine Similarity Score:</span>
                      <span className="font-bold text-emerald-400">
                        {(verificationResult.similarityScore * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-2.5 transition-all duration-500 ${
                          verificationResult.similarityScore >= 0.68 ? 'bg-emerald-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(100, verificationResult.similarityScore * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <span>0.0 (Different)</span>
                      <span>Threshold: 0.68</span>
                      <span>1.0 (Exact)</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800">
                    <div>
                      <span className="text-slate-400 block">Security Level:</span>
                      <span
                        className={`font-bold ${
                          verificationResult.securityLevel === 'HIGH'
                            ? 'text-emerald-400'
                            : verificationResult.securityLevel === 'MEDIUM'
                            ? 'text-amber-400'
                            : 'text-red-400'
                        }`}
                      >
                        {verificationResult.securityLevel}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Best Pose Match:</span>
                      <span className="font-bold text-blue-400 uppercase">{verificationResult.bestMatchingPose}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="text-slate-400 font-semibold text-[11px]">คะแนนเปรียบเทียบแต่ละท่า:</div>
                  {verificationResult.poseScores.map((ps) => (
                    <div key={ps.pose} className="flex justify-between items-center bg-slate-900/60 p-2 rounded">
                      <span className="uppercase text-slate-300 font-mono">{ps.pose}:</span>
                      <span className="font-mono font-bold text-slate-200">
                        {(ps.similarity * 100).toFixed(1)}% (Cos: {ps.similarity})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-slate-500 text-xs">
                กดสแกนลงทะเบียน และกด &quot;ทดสอบยืนยันตัวตน&quot; เพื่อประเมินผล
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
