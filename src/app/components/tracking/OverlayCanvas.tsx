'use client'
import { forwardRef, useEffect } from 'react'

interface OverlayCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

export const OverlayCanvas = forwardRef<HTMLCanvasElement, OverlayCanvasProps>(
  ({ videoRef }, ref) => {
    useEffect(() => {
      const video = videoRef.current
      const canvas = (ref as React.RefObject<HTMLCanvasElement | null>)?.current
      const container = video?.parentElement

      if (!video || !canvas || !container) return

      const updateCanvasSize = () => {
        const rect = container.getBoundingClientRect()
        const cw = Math.round(rect.width)
        const ch = Math.round(rect.height)
        if (cw > 0 && ch > 0 && (canvas.width !== cw || canvas.height !== ch)) {
          canvas.width = cw
          canvas.height = ch
        }
      }

      const resizeObserver = new ResizeObserver(updateCanvasSize)
      resizeObserver.observe(container)

      video.addEventListener('loadedmetadata', updateCanvasSize)
      video.addEventListener('resize', updateCanvasSize)
      video.addEventListener('playing', updateCanvasSize)
      window.addEventListener('resize', updateCanvasSize)

      updateCanvasSize()

      return () => {
        resizeObserver.disconnect()
        video.removeEventListener('loadedmetadata', updateCanvasSize)
        video.removeEventListener('resize', updateCanvasSize)
        video.removeEventListener('playing', updateCanvasSize)
        window.removeEventListener('resize', updateCanvasSize)
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
