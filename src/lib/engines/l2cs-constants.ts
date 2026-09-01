/** L2CS-Net ResNet50 gaze360 — 90-bin pitch/yaw heads, 448×448 face crop */
export const L2CS_MODEL_FILE = 'l2cs-net-448.onnx';
export const L2CS_MODEL_VERSION = 'l2csnet-sim_opt_asym_int8_q';
export const L2CS_INPUT_SIZE = 448;
export const L2CS_NUM_BINS = 90;
export const L2CS_BIN_DEGREES = 4;
export const L2CS_LOG_MAX_STALE_MS = 1000;
export const L2CS_IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
export const L2CS_IMAGENET_STD = [0.229, 0.224, 0.225] as const;

export function isL2csResultFresh(
  timestamp: number | undefined | null,
  now: number,
  maxStaleMs = L2CS_LOG_MAX_STALE_MS
): boolean {
  if (timestamp == null) return false;
  return now - timestamp <= maxStaleMs;
}

export interface PixelFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function padFaceBox(box: PixelFaceBox, videoW: number, videoH: number, padRatio = 0.12): PixelFaceBox {
  const padW = box.width * padRatio;
  const padH = box.height * padRatio;
  const x = Math.max(0, Math.floor(box.x - padW));
  const y = Math.max(0, Math.floor(box.y - padH));
  const x2 = Math.min(videoW, Math.ceil(box.x + box.width + padW));
  const y2 = Math.min(videoH, Math.ceil(box.y + box.height + padH));
  const width = Math.max(1, x2 - x);
  const height = Math.max(1, y2 - y);
  return { x, y, width, height };
}

export function faceBoxFromLandmarks(
  landmarks: Array<{ x: number; y: number }>,
  videoW: number,
  videoH: number
): PixelFaceBox | null {
  if (!landmarks.length) return null;
  const xs = landmarks.map(l => l.x * videoW);
  const ys = landmarks.map(l => l.y * videoH);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return padFaceBox(
    { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    videoW,
    videoH
  );
}
