export const YOLO_FACE_MODEL_FILE = 'yolov8n-face.onnx';
export const YOLO_FACE_MODEL_VERSION = 'lindevs-1.0.1';
export const YOLO_LOG_MAX_STALE_MS = 800;

export function isYoloResultFresh(
  timestamp: number | undefined | null,
  now: number,
  maxStaleMs = YOLO_LOG_MAX_STALE_MS
): boolean {
  if (timestamp == null) return false;
  return now - timestamp <= maxStaleMs;
}

export function normalizeYoloBox(
  box: { x: number; y: number; width: number; height: number },
  videoWidth: number,
  videoHeight: number
) {
  const vw = videoWidth || 640;
  const vh = videoHeight || 480;
  return {
    x: Number((box.x / vw).toFixed(4)),
    y: Number((box.y / vh).toFixed(4)),
    width: Number((box.width / vw).toFixed(4)),
    height: Number((box.height / vh).toFixed(4)),
  };
}
