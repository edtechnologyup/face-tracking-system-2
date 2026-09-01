import { loadYoloOnnxSession, runYoloOnnxDetection } from './yolo-onnx-inference';
import { YOLO_FACE_MODEL_FILE } from './yolo-constants';

/** Real YOLOv8n-Face ONNX via onnxruntime-web (lindevs single-class face model) */
export const YOLO_WRAPS_MEDIAPIPE = false;
export const YOLO_USES_FACE_API = false;
export const YOLO_USES_ONNX = true;
export const YOLO_MODEL_FILE = YOLO_FACE_MODEL_FILE;

export interface YOLOv8FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  isPrimary: boolean;
}

export interface YOLOv8DetectionResult {
  isDetected: boolean;
  box?: { x: number; y: number; width: number; height: number };
  confidence: number;
  keypoints?: Array<{ x: number; y: number }>;
  latencyMs: number;
  fps: number;
  memoryMb: number;
  cpuLoadPct: number;
}

export interface YOLOv8MultiFaceResult {
  isDetected: boolean;
  faceCount: number;
  hasMultipleFaces: boolean;
  primaryBox?: YOLOv8FaceBox;
  boxes: YOLOv8FaceBox[];
  confidence: number;
  keypoints?: Array<{ x: number; y: number }>;
  latencyMs: number;
  fps: number;
  memoryMb: number;
  cpuLoadPct: number;
  timestamp: number;
}

const emptyMulti = (now: number): YOLOv8MultiFaceResult => ({
  isDetected: false,
  faceCount: 0,
  hasMultipleFaces: false,
  boxes: [],
  confidence: 0,
  latencyMs: 0,
  fps: 0,
  memoryMb: 0,
  cpuLoadPct: 0,
  timestamp: now,
});

function pickPrimaryBox(
  boxes: YOLOv8FaceBox[],
  videoW: number,
  videoH: number
): YOLOv8FaceBox | undefined {
  if (boxes.length === 0) return undefined;
  const cx = videoW / 2;
  const cy = videoH / 2;
  return [...boxes].sort((a, b) => {
    const aCx = a.x + a.width / 2;
    const aCy = a.y + a.height / 2;
    const bCx = b.x + b.width / 2;
    const bCy = b.y + b.height / 2;
    const aDist = Math.hypot(aCx - cx, aCy - cy);
    const bDist = Math.hypot(bCx - cx, bCy - cy);
    if (Math.abs(aDist - bDist) > 20) return aDist - bDist;
    return b.confidence - a.confidence;
  })[0];
}

export class YOLOv8FaceDetector {
  private ready = false;
  private lastRunMs = 0;
  private lastFps = 0;
  private readonly minIntervalMs = 100;
  private lastCached: YOLOv8MultiFaceResult | null = null;

  async initialize(): Promise<boolean> {
    try {
      await loadYoloOnnxSession();
      this.ready = true;
    } catch (err) {
      console.error('YOLOv8 ONNX init error:', err);
      this.ready = false;
    }
    return this.ready;
  }

  async detectMultiFace(
    video: HTMLVideoElement,
    _allFacesLandmarks?: unknown,
    simulateIntruder = false,
    options?: { bypassCache?: boolean }
  ): Promise<YOLOv8MultiFaceResult> {
    const now = Date.now();
    if (!video || video.readyState < 2) return emptyMulti(now);

    if (!options?.bypassCache && this.lastCached && now - this.lastRunMs < this.minIntervalMs) {
      return { ...this.lastCached, timestamp: this.lastRunMs };
    }

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    try {
      const { boxes: rawBoxes, latencyMs } = await runYoloOnnxDetection(video);

      let boxes: YOLOv8FaceBox[] = rawBoxes.map((b, idx) => ({
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        confidence: b.confidence,
        isPrimary: idx === 0,
      }));

      if (simulateIntruder && process.env.NODE_ENV === 'development' && boxes.length === 1) {
        boxes.push({
          x: Math.round(vw * 0.68),
          y: Math.round(vh * 0.18),
          width: Math.round(vw * 0.24),
          height: Math.round(vh * 0.32),
          confidence: 0.91,
          isPrimary: false,
        });
      }

      const primary = pickPrimaryBox(boxes, vw, vh);
      boxes = boxes.map(b => ({ ...b, isPrimary: primary ? b === primary : b.isPrimary }));

      this.lastFps = latencyMs > 0 ? Number((1000 / latencyMs).toFixed(1)) : 0;

      const result: YOLOv8MultiFaceResult = {
        isDetected: boxes.length > 0,
        faceCount: boxes.length,
        hasMultipleFaces: boxes.length > 1,
        primaryBox: primary,
        boxes,
        confidence: primary?.confidence ?? 0,
        keypoints: primary
          ? [{ x: primary.x + primary.width * 0.5, y: primary.y + primary.height * 0.35 }]
          : [],
        latencyMs,
        fps: this.lastFps,
        memoryMb: 0,
        cpuLoadPct: 0,
        timestamp: now,
      };

      this.lastCached = result;
      this.lastRunMs = now;
      return result;
    } catch (err) {
      console.error('YOLOv8 ONNX detectMultiFace error:', err);
      return emptyMulti(now);
    }
  }
}
