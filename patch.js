const fs = require('fs');
const path = 'src/app/components/tracking/FaceTracker.tsx';
let content = fs.readFileSync(path, 'utf8');

const oldCode = `  // เริ่มการติดตามด้วย Hybrid Dual-Loop Architecture
  const startTracking = useCallback(async () => {
    setIsLoading(true)
    try {
      let sessionId = sessionIdRef.current
      if (!sessionId) {
        sessionId = await createTrackingSession()
        if (!sessionId) {
          alert('ไม่สามารถสร้าง tracking session ได้\\nกรุณาตรวจสอบการเข้าสู่ระบบ')
          setIsLoading(false)
          return
        }
      }

      const cameraInitialized = await initializeCamera(videoRef)
      if (!cameraInitialized) {
        alert('ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบการอนุญาต')
        return
      }

      const ok = await initializeHybridDetectors()
      if (!ok) {
        alert('ไม่สามารถเริ่มต้น AI Hybrid Detectors ได้')
        return
      }

      startHybridTracking(videoRef)
      
      setTimeout(() => {
        startRecording()
      }, 1000)
    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาดในการเริ่มต้น:', error)
      alert('สถาปัตยกรรม Hybrid ไม่สามารถเริ่มต้นได้\\nกรุณาลองใหม่อีกครั้ง')
    }
  }, [createTrackingSession, initializeCamera, initializeHybridDetectors, startHybridTracking, startRecording])`;

const newCode = `  // เริ่มการติดตามด้วย Hybrid Dual-Loop Architecture
  const startTracking = useCallback(async () => {
    setIsLoading(true)
    try {
      let sessionId = sessionIdRef.current
      if (!sessionId) {
        sessionId = await createTrackingSession()
        if (!sessionId) {
          alert('ไม่สามารถสร้าง tracking session ได้\\nกรุณาตรวจสอบการเข้าสู่ระบบ')
          setIsLoading(false)
          return
        }
      }

      const cameraInitialized = await initializeCamera(videoRef)
      if (!cameraInitialized) {
        alert('ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบการอนุญาต')
        setIsLoading(false)
        return
      }

      // Allow UI to render Loading Spinner before blocking thread with WebAssembly
      await new Promise(r => setTimeout(r, 150))

      const ok = await initializeHybridDetectors()
      if (!ok) {
        alert('ไม่สามารถเริ่มต้น AI Hybrid Detectors ได้')
        setIsLoading(false)
        return
      }

      startHybridTracking(videoRef)
      
      setTimeout(() => {
        startRecording()
      }, 1000)
    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาดในการเริ่มต้น:', error)
      alert('สถาปัตยกรรม Hybrid ไม่สามารถเริ่มต้นได้\\nกรุณาลองใหม่อีกครั้ง')
    } finally {
      setIsLoading(false)
    }
  }, [createTrackingSession, initializeCamera, initializeHybridDetectors, startHybridTracking, startRecording])`;

if (content.includes(oldCode)) {
  fs.writeFileSync(path, content.replace(oldCode, newCode));
  console.log("Patched successfully");
} else {
  console.log("Could not find the old code block");
}
