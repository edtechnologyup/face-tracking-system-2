'use client'
import { forwardRef, useEffect } from 'react'

interface OverlayCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

export const OverlayCanvas = forwardRef<HTMLCanvasElement, OverlayCanvasProps>(
  ({ videoRef }, ref) => {
    // อัปเดตขนาด canvas ให้ตรงกับ video element เสมอ
    useEffect(() => {
      const video = videoRef.current
      const canvas = (ref as React.RefObject<HTMLCanvasElement | null>)?.current
      
      if (video && canvas) {
        const updateCanvasSize = () => {
          const videoRect = video.getBoundingClientRect()
          const vw = video.offsetWidth || videoRect.width
          const vh = video.offsetHeight || videoRect.height
          if (vw > 0 && vh > 0 && (canvas.width !== vw || canvas.height !== vh)) {
            canvas.width = vw
            canvas.height = vh
          }
        }
        
        video.addEventListener('loadedmetadata', updateCanvasSize)
        video.addEventListener('resize', updateCanvasSize)
        video.addEventListener('playing', updateCanvasSize)
        window.addEventListener('resize', updateCanvasSize)

        updateCanvasSize()

        return () => {
          video.removeEventListener('loadedmetadata', updateCanvasSize)
          video.removeEventListener('resize', updateCanvasSize)
          video.removeEventListener('playing', updateCanvasSize)
          window.removeEventListener('resize', updateCanvasSize)
        }
      }
    }, [videoRef, ref])

    return (
      <canvas
        ref={ref}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none', transform: 'scaleX(-1)' }}
      />
    )
  }
)

OverlayCanvas.displayName = 'OverlayCanvas'