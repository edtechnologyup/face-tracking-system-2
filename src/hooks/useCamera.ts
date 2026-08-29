'use client'
import { useRef, useCallback } from 'react'

export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null)

  const initializeCamera = useCallback(async (videoRef: React.RefObject<HTMLVideoElement | null>) => {
    try {
      // Progressive constraint fallback for maximum device compatibility
      const constraintOptions: MediaStreamConstraints[] = [
        // 1. Ideal HD for desktop/laptop
        {
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        },
        // 2. Lower resolution for mid-range devices
        {
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
          },
          audio: false
        },
        // 3. Minimal constraints for low-end mobile
        {
          video: { facingMode: 'user' },
          audio: false
        },
        // 4. Last resort - any available camera
        {
          video: true,
          audio: false
        }
      ]

      let stream: MediaStream | null = null
      for (const constraints of constraintOptions) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints)
          break
        } catch (err) {
          console.warn('Camera constraint failed, trying next fallback:', err)
        }
      }

      if (!stream) {
        console.error('❌ ไม่สามารถเข้าถึงกล้องได้จากทุกรูปแบบ')
        return false
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        
        return new Promise<boolean>((resolve) => {
          const timeoutId = setTimeout(() => {
            console.warn('⚠️ Camera metadata loading timeout')
            resolve(false)
          }, 10000) // 10 second timeout for slow mobile cameras

          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              clearTimeout(timeoutId)
              videoRef.current?.play().catch(console.error)
              resolve(true)
            }
          }
        })
      }

      return false
    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาดในการเริ่มต้นกล้อง:', error)
      return false
    }
  }, [])

  const stopCamera = useCallback((videoRef: React.RefObject<HTMLVideoElement | null>) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  return {
    initializeCamera,
    stopCamera,
    stream: streamRef.current
  }
}