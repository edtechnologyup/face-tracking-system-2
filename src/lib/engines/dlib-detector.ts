import { computeDlibLandmarkConfidence } from '@/lib/dlib-landmark-quality';
import { ensureFaceApiReady, faceapi, TINY_FACE_OPTIONS } from './face-api-engine';

/** 68-point shape predictor weights (face-api.js / dlib-compatible architecture) */
export const DLIB_IS_MOCK = false;
export const DLIB_USES_FACE_API = true;

export interface DlibDetectionResult {
  isDetected: boolean;
  landmarks68: Array<{ x: number; y: number }>;
  /** TinyFaceDetector score (L0) — primary metric for logging */
  confidence: number;
  detectionScore: number;
  /** 68-point geometry fit quality (L2 auxiliary — not logged to dlibConfidence) */
  landmarkQuality: number | null;
  detectionBox?: { x: number; y: number; width: number; height: number };
  latencyMs: number;
  fps: number;
  memoryMb: number;
  cpuLoadPct: number;
  timestamp: number;
}

const emptyResult = (now: number): DlibDetectionResult => ({
  isDetected: false,
  landmarks68: [],
  confidence: 0,
  detectionScore: 0,
  landmarkQuality: null,
  latencyMs: 0,
  fps: 0,
  memoryMb: 0,
  cpuLoadPct: 0,
  timestamp: now,
});

export class Dlib68PointDetector {
  private ready = false;
  private lastRunMs = 0;
  private lastCached: DlibDetectionResult | null = null;
  private readonly minIntervalMs = 400;

  async initialize(): Promise<boolean> {
    this.ready = await ensureFaceApiReady();
    return this.ready;
  }

  async detect(
    video: HTMLVideoElement,
    options?: { bypassCache?: boolean }
  ): Promise<DlibDetectionResult> {
    const now = Date.now();
    if (!video || video.readyState < 2) return emptyResult(now);

    if (!options?.bypassCache && this.lastCached && now - this.lastRunMs < this.minIntervalMs) {
      return { ...this.lastCached, timestamp: this.lastRunMs };
    }

    if (!this.ready) {
      this.ready = await ensureFaceApiReady();
    }
    if (!this.ready) return emptyResult(now);

    const startTime = performance.now();
    try {
      const detection = await faceapi
        .detectSingleFace(video, TINY_FACE_OPTIONS())
        .withFaceLandmarks();

      if (!detection) {
        const miss = emptyResult(now);
        this.lastCached = miss;
        this.lastRunMs = now;
        return miss;
      }

      const landmarks68 = detection.landmarks.positions.map(p => ({
        x: Number(p.x.toFixed(1)),
        y: Number(p.y.toFixed(1)),
      }));

      const latencyMs = Number((performance.now() - startTime).toFixed(1));
      const detectionScore = Number(detection.detection.score.toFixed(3));
      const landmarkQuality = computeDlibLandmarkConfidence(landmarks68);
      const box = detection.detection.box;

      const result: DlibDetectionResult = {
        isDetected: true,
        landmarks68,
        confidence: detectionScore,
        detectionScore,
        landmarkQuality,
        detectionBox: {
          x: Number(box.x.toFixed(1)),
          y: Number(box.y.toFixed(1)),
          width: Number(box.width.toFixed(1)),
          height: Number(box.height.toFixed(1)),
        },
        latencyMs,
        fps: latencyMs > 0 ? Number((1000 / latencyMs).toFixed(1)) : 0,
        memoryMb: 0,
        cpuLoadPct: 0,
        timestamp: now,
      };

      this.lastCached = result;
      this.lastRunMs = now;
      return result;
    } catch (err) {
      console.error('Dlib/face-api detect error:', err);
      return emptyResult(now);
    }
  }
}
