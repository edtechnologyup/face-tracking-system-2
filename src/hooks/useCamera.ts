'use client'
import { useRef, useCallback } from 'react'

export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null)

  const initializeCamera = useCallback(async (videoRef: React.RefObject<HTMLVideoElement | null>) => {
    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        })
      } catch (err) {
        console.warn('Initial camera constraints failed, trying basic mobile facingMode constraint:', err)
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false
        })
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        
        return new Promise<boolean>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
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