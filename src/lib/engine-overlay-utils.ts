import type { FaceTrackingData } from '@/lib/mediapipe-detector'
import type { YOLOv8MultiFaceResult } from '@/lib/engines/yolov8-detector'
import type { DlibDetectionResult } from '@/lib/engines/dlib-detector'
import type { OpenFaceDetectionResult } from '@/lib/engines/openface-detector'
import type { L2CSGazeResult } from '@/lib/engines/l2cs-gaze-detector'
import { drawSciFiFaceMesh } from '@/lib/face-mesh-utils'
import type { OverlayMode } from '@/lib/tracking-profile'
import {
  calcVideoDisplayCoordinates,
  videoPixelToCanvas,
  type VideoDisplayCoordinates,
} from '@/lib/video-display-coordinates'

export type OverlayCoordinates = VideoDisplayCoordinates

export function calcOverlayCoordinates(
  video: HTMLVideoElement,
  canvasWidth: number,
  canvasHeight: number
): OverlayCoordinates {
  return calcVideoDisplayCoordinates(video, canvasWidth, canvasHeight, 'cover')
}

function toCanvas(
  x: number,
  y: number,
  coords: OverlayCoordinates
): { x: number; y: number } {
  return videoPixelToCanvas(x, y, coords)
}

function drawEngineLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string
) {
  ctx.font = 'bold 11px Inter, sans-serif'
  const width = ctx.measureText(text).width + 10
  ctx.fillStyle = color
  ctx.fillRect(x, Math.max(0, y - 20), width, 18)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(text, x + 5, Math.max(12, y - 6))
}

function drawGazeVector(
  ctx: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  vector: { x: number; y: number },
  color: string,
  length = 120
) {
  const tx = origin.x + vector.x * length
  const ty = origin.y + vector.y * length
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(origin.x, origin.y)
  ctx.lineTo(tx, ty)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(tx, ty, 5, 0, 2 * Math.PI)
  ctx.fill()
}

export function drawMediaPipeOverlay(
  ctx: CanvasRenderingContext2D,
  mediaPipeData: FaceTrackingData | null | undefined,
  video: HTMLVideoElement,
  coords: OverlayCoordinates,
  overlayMode: OverlayMode
) {
  if (
    overlayMode === 'minimal' ||
    !mediaPipeData?.isDetected ||
    !mediaPipeData.landmarks?.length
  ) {
    return
  }

  drawSciFiFaceMesh(
    ctx,
    mediaPipeData.landmarks,
    video,
    coords.canvasWidth,
    coords.canvasHeight,
    mediaPipeData.orientation.isLookingAway,
    overlayMode
  )
}

export function drawYoloOverlay(
  ctx: CanvasRenderingContext2D,
  yoloData: YOLOv8MultiFaceResult | null | undefined,
  coords: OverlayCoordinates
) {
  if (!yoloData?.primaryBox) return

  const b = yoloData.primaryBox
  const topLeft = toCanvas(b.x, b.y, coords)
  const bw = (b.width / coords.videoWidth) * coords.scaleX
  const bh = (b.height / coords.videoHeight) * coords.scaleY

  ctx.strokeStyle = '#3B82F6'
  ctx.lineWidth = 2.5
  ctx.setLineDash([6, 4])
  ctx.strokeRect(topLeft.x, topLeft.y, bw, bh)
  ctx.setLineDash([])

  drawEngineLabel(
    ctx,
    `YOLOv8 ${(b.confidence * 100).toFixed(0)}%`,
    topLeft.x,
    topLeft.y,
    '#3B82F6'
  )

  if (yoloData.keypoints?.length) {
    ctx.fillStyle = '#EF4444'
    yoloData.keypoints.forEach((kp) => {
      const p = toCanvas(kp.x, kp.y, coords)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI)
      ctx.fill()
    })
  }

  yoloData.boxes?.forEach((box) => {
    if (box.isPrimary) return
    const intruder = toCanvas(box.x, box.y, coords)
    const iw = (box.width / coords.videoWidth) * coords.scaleX
    const ih = (box.height / coords.videoHeight) * coords.scaleY
    ctx.strokeStyle = '#EF4444'
    ctx.lineWidth = 3
    ctx.strokeRect(intruder.x, intruder.y, iw, ih)
    drawEngineLabel(
      ctx,
      `INTRUDER ${(box.confidence * 100).toFixed(0)}%`,
      intruder.x,
      intruder.y > 18 ? intruder.y : intruder.y + ih + 18,
      '#EF4444'
    )
  })
}

export function drawDlibOverlay(
  ctx: CanvasRenderingContext2D,
  dlibData: DlibDetectionResult | null | undefined,
  coords: OverlayCoordinates
) {
  if (!dlibData?.isDetected || !dlibData.landmarks68?.length) return

  if (dlibData.detectionBox) {
    const box = dlibData.detectionBox
    const topLeft = toCanvas(box.x, box.y, coords)
    const bw = (box.width / coords.videoWidth) * coords.scaleX
    const bh = (box.height / coords.videoHeight) * coords.scaleY
    ctx.strokeStyle = '#F59E0B'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.strokeRect(topLeft.x, topLeft.y, bw, bh)
    ctx.setLineDash([])
  }

  ctx.fillStyle = '#F59E0B'
  dlibData.landmarks68.forEach((pt) => {
    const p = toCanvas(pt.x, pt.y, coords)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 2.5, 0, 2 * Math.PI)
    ctx.fill()
  })

  const first = dlibData.landmarks68[0]
  if (first) {
    const labelPos = toCanvas(first.x, first.y, coords)
    drawEngineLabel(ctx, 'Dlib 68', labelPos.x, labelPos.y, '#F59E0B')
  }
}

export function drawOpenFaceOverlay(
  ctx: CanvasRenderingContext2D,
  openFaceData: OpenFaceDetectionResult | null | undefined,
  coords: OverlayCoordinates
) {
  if (!openFaceData?.isDetected || !openFaceData.gazeVector) return

  const fc = openFaceData.faceCenter
    ? toCanvas(openFaceData.faceCenter.x, openFaceData.faceCenter.y, coords)
    : { x: coords.canvasWidth / 2, y: coords.canvasHeight / 2 }

  drawGazeVector(ctx, fc, openFaceData.gazeVector, '#A855F7', 150)
  drawEngineLabel(ctx, 'OpenFace gaze', fc.x, fc.y - 24, '#A855F7')
}

export function drawL2csOverlay(
  ctx: CanvasRenderingContext2D,
  l2csData: L2CSGazeResult | null | undefined,
  mediaPipeData: FaceTrackingData | null | undefined,
  coords: OverlayCoordinates
) {
  if (!l2csData?.gazeVector) return

  const lms = mediaPipeData?.landmarks
  const nose = lms?.[1]
  const origin = nose
    ? toCanvas(nose.x * coords.videoWidth, nose.y * coords.videoHeight, coords)
    : { x: coords.canvasWidth / 2, y: coords.canvasHeight / 2 }

  drawGazeVector(ctx, origin, l2csData.gazeVector, '#22D3EE', 100)
  drawEngineLabel(
    ctx,
    `L2CS ${l2csData.gazeDirection}`,
    origin.x,
    origin.y + 20,
    '#22D3EE'
  )
}

export interface EngineOverlayInput {
  mediaPipeData?: FaceTrackingData | null
  yoloData?: YOLOv8MultiFaceResult | null
  dlibData?: DlibDetectionResult | null
  openFaceData?: OpenFaceDetectionResult | null
  l2csData?: L2CSGazeResult | null
  video: HTMLVideoElement
  overlayMode: OverlayMode
}

export function drawAllEngineOverlays(
  ctx: CanvasRenderingContext2D,
  input: EngineOverlayInput
) {
  const coords = calcOverlayCoordinates(
    input.video,
    ctx.canvas.width,
    ctx.canvas.height
  )

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  drawMediaPipeOverlay(
    ctx,
    input.mediaPipeData,
    input.video,
    coords,
    input.overlayMode
  )
  drawYoloOverlay(ctx, input.yoloData, coords)
  drawDlibOverlay(ctx, input.dlibData, coords)
  drawOpenFaceOverlay(ctx, input.openFaceData, coords)
  drawL2csOverlay(ctx, input.l2csData, input.mediaPipeData, coords)
}
