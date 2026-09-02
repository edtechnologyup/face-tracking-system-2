/** Map video / normalized landmark coordinates onto a canvas for CSS object-fit modes */

export type VideoObjectFit = 'contain' | 'cover'

export interface VideoDisplayCoordinates {
  /** Multiplier for normalized landmark x/y (0–1), or scale via (pixel / videoWidth) * scaleX */
  scaleX: number
  scaleY: number
  offsetX: number
  offsetY: number
  videoWidth: number
  videoHeight: number
  canvasWidth: number
  canvasHeight: number
}

export function calcVideoDisplayCoordinates(
  video: HTMLVideoElement | null | undefined,
  canvasWidth: number,
  canvasHeight: number,
  objectFit: VideoObjectFit = 'cover'
): VideoDisplayCoordinates {
  const videoWidth = video?.videoWidth || 640
  const videoHeight = video?.videoHeight || 480
  const cw = canvasWidth
  const ch = canvasHeight

  if (cw <= 0 || ch <= 0) {
    return {
      scaleX: cw,
      scaleY: ch,
      offsetX: 0,
      offsetY: 0,
      videoWidth,
      videoHeight,
      canvasWidth: cw,
      canvasHeight: ch,
    }
  }

  const scaleContain = Math.min(cw / videoWidth, ch / videoHeight)
  const scaleCover = Math.max(cw / videoWidth, ch / videoHeight)
  const scale = objectFit === 'cover' ? scaleCover : scaleContain

  const displayW = videoWidth * scale
  const displayH = videoHeight * scale

  return {
    scaleX: displayW,
    scaleY: displayH,
    offsetX: (cw - displayW) / 2,
    offsetY: (ch - displayH) / 2,
    videoWidth,
    videoHeight,
    canvasWidth: cw,
    canvasHeight: ch,
  }
}

export function videoPixelToCanvas(
  x: number,
  y: number,
  coords: VideoDisplayCoordinates
): { x: number; y: number } {
  return {
    x: (x / coords.videoWidth) * coords.scaleX + coords.offsetX,
    y: (y / coords.videoHeight) * coords.scaleY + coords.offsetY,
  }
}

export function normalizedLandmarkToCanvas(
  x: number,
  y: number,
  coords: VideoDisplayCoordinates
): { x: number; y: number } {
  return {
    x: x * coords.scaleX + coords.offsetX,
    y: y * coords.scaleY + coords.offsetY,
  }
}
