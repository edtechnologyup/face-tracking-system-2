/** face-api.js TinyFaceDetector + 68-point shape predictor (dlib-compatible) */
export const DLIB_DETECTOR_MODEL = 'tiny_face_detector_model-weights_manifest.json';
export const DLIB_LANDMARK_MODEL = 'face_landmark_68_model-weights_manifest.json';
export const DLIB_DETECTOR_INPUT_SIZE = 416;
export const DLIB_DETECTOR_SCORE_THRESHOLD = 0.5;
export const DLIB_LOG_MAX_STALE_MS = 800;

export function isDlibResultFresh(
  timestamp: number | undefined | null,
  now: number,
  maxStaleMs = DLIB_LOG_MAX_STALE_MS
): boolean {
  if (timestamp == null) return false;
  return now - timestamp <= maxStaleMs;
}

export function normalizeDlibBox(
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
