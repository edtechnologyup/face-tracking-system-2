/** OpenFace 3.0 remote server (Docker) — RetinaFace detection confidence + AU */
export const OPENFACE_SERVER_MODEL = 'OpenFace-3.0';
export const OPENFACE_SERVER_VERSION = '3.0.0';
export const OPENFACE_LOG_MAX_STALE_MS = 2500;
export const OPENFACE_REMOTE_MIN_INTERVAL_MS = 800;

export function isOpenFaceResultFresh(
  timestamp: number | undefined | null,
  now: number,
  maxStaleMs = OPENFACE_LOG_MAX_STALE_MS
): boolean {
  if (timestamp == null) return false;
  return now - timestamp <= maxStaleMs;
}

export function captureVideoFrameBase64(video: HTMLVideoElement, quality = 0.72): string | null {
  if (!video || video.readyState < 2 || !video.videoWidth) return null;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
