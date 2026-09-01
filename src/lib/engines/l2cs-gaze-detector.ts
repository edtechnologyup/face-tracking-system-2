/**
 * L2CS-Net gaze engine — ONNX L0 in browser, landmark heuristic fallback (server / no crop).
 */
import {
  faceBoxFromLandmarks,
  type PixelFaceBox,
} from '@/lib/engines/l2cs-constants';
import { runL2csOnnxInference } from '@/lib/engines/l2cs-onnx-inference';

export const L2CS_IS_MOCK = false;
export const L2CS_USES_ONNX = true;

export type L2CSGazeSource = 'l2cs-onnx' | 'iris-heuristic';

export interface L2CSGazeResult {
  gazePitch: number;
  gazeYaw: number;
  gazeDirection: 'SCREEN_CENTER' | 'LOOKING_LEFT' | 'LOOKING_RIGHT' | 'LOOKING_DOWN_NOTES' | 'LOOKING_UP';
  isLookingOffScreen: boolean;
  confidence: number;
  gazeVector: { x: number; y: number; z: number };
  screenCoordinateEstimate?: { xPct: number; yPct: number };
  source: L2CSGazeSource;
  latencyMs: number;
  timestamp: number;
}

function gazeAnglesToVector(pitch: number, yaw: number) {
  const pitchRad = (pitch * Math.PI) / 180;
  const yawRad = (yaw * Math.PI) / 180;
  return {
    x: Number((Math.sin(yawRad) * Math.cos(pitchRad)).toFixed(4)),
    y: Number(Math.sin(pitchRad).toFixed(4)),
    z: Number((-Math.cos(yawRad) * Math.cos(pitchRad)).toFixed(4)),
  };
}

function classifyGazeDirection(pitch: number, yaw: number): Pick<L2CSGazeResult, 'gazeDirection' | 'isLookingOffScreen'> {
  let gazeDirection: L2CSGazeResult['gazeDirection'] = 'SCREEN_CENTER';
  let isLookingOffScreen = false;

  const absYaw = Math.abs(yaw);
  const absPitch = Math.abs(pitch);
  const isYawActive = absYaw > 15;
  const isPitchUpActive = pitch > 10;
  const isPitchDownActive = pitch < -12;

  if (isYawActive && (isPitchUpActive || isPitchDownActive)) {
    gazeDirection = absYaw >= absPitch ? (yaw > 0 ? 'LOOKING_RIGHT' : 'LOOKING_LEFT') : (pitch > 0 ? 'LOOKING_UP' : 'LOOKING_DOWN_NOTES');
    isLookingOffScreen = true;
  } else if (isYawActive) {
    gazeDirection = yaw > 0 ? 'LOOKING_RIGHT' : 'LOOKING_LEFT';
    isLookingOffScreen = true;
  } else if (isPitchDownActive) {
    gazeDirection = 'LOOKING_DOWN_NOTES';
    isLookingOffScreen = true;
  } else if (isPitchUpActive) {
    gazeDirection = 'LOOKING_UP';
    isLookingOffScreen = true;
  }

  return { gazeDirection, isLookingOffScreen };
}

function screenCoordinateFromAngles(pitch: number, yaw: number) {
  return {
    xPct: Math.min(100, Math.max(0, Math.round(50 + (yaw / 35) * 50))),
    yPct: Math.min(100, Math.max(0, Math.round(50 - (pitch / 30) * 50))),
  };
}

function buildResult(
  pitch: number,
  yaw: number,
  confidence: number,
  source: L2CSGazeSource,
  latencyMs: number,
  timestamp: number
): L2CSGazeResult {
  const { gazeDirection, isLookingOffScreen } = classifyGazeDirection(pitch, yaw);
  return {
    gazePitch: pitch,
    gazeYaw: yaw,
    gazeDirection,
    isLookingOffScreen,
    confidence,
    gazeVector: gazeAnglesToVector(pitch, yaw),
    screenCoordinateEstimate: screenCoordinateFromAngles(pitch, yaw),
    source,
    latencyMs,
    timestamp,
  };
}

/** Iris + head heuristic — L2 fallback when ONNX unavailable (e.g. API route). */
export function predictGazeHeuristic(
  landmarks?: Array<{ x: number; y: number; z?: number }>
): L2CSGazeResult | null {
  if (!landmarks || landmarks.length < 468) return null;

  const leftPupil = landmarks[468] || landmarks[470] || landmarks[33];
  const rightPupil = landmarks[473] || landmarks[475] || landmarks[362];
  const leftOuter = landmarks[33];
  const leftInner = landmarks[133];
  const rightInner = landmarks[362];
  const rightOuter = landmarks[263];
  const leftTop = landmarks[159] || leftPupil;
  const leftBottom = landmarks[145] || leftPupil;
  const rightTop = landmarks[386] || rightPupil;
  const rightBottom = landmarks[374] || rightPupil;
  const noseTip = landmarks[1];
  const forehead = landmarks[10];
  const chin = landmarks[152];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];

  const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
  const headYawDegrees = (faceCenterX - noseTip.x) * 160;

  const leftEyeWidth = Math.abs(leftOuter.x - leftInner.x) || 0.05;
  const rightEyeWidth = Math.abs(rightInner.x - rightOuter.x) || 0.05;
  const leftEyeCenterX = (leftInner.x + leftOuter.x) / 2;
  const rightEyeCenterX = (rightInner.x + rightOuter.x) / 2;
  const leftPupilOffset = (leftPupil.x - leftEyeCenterX) / leftEyeWidth;
  const rightPupilOffset = (rightPupil.x - rightEyeCenterX) / rightEyeWidth;
  const irisGazeRelX = (leftPupilOffset + rightPupilOffset) / 2;
  const irisGazeDegrees = irisGazeRelX * 45;

  const faceHeight = Math.hypot(chin.x - forehead.x, chin.y - forehead.y) || 0.3;
  const noseRelY = (noseTip.y - forehead.y) / faceHeight;
  const headPitchDegrees = (0.52 - noseRelY) * 45;

  const leftEyeHeight = Math.abs(leftBottom.y - leftTop.y) || 0.02;
  const rightEyeHeight = Math.abs(rightBottom.y - rightTop.y) || 0.02;
  const leftEyeCenterY = (leftTop.y + leftBottom.y) / 2;
  const rightEyeCenterY = (rightTop.y + rightBottom.y) / 2;
  const leftPupilOffsetY = (leftEyeCenterY - leftPupil.y) / leftEyeHeight;
  const rightPupilOffsetY = (rightEyeCenterY - rightPupil.y) / rightEyeHeight;
  const irisGazeRelY = (leftPupilOffsetY + rightPupilOffsetY) / 2;
  const irisGazePitchDegrees = irisGazeRelY * 65;

  const rawYaw = headYawDegrees + irisGazeDegrees;
  const rawPitch = headPitchDegrees + irisGazePitchDegrees + 6;
  const yaw = Number(Math.max(-60, Math.min(60, rawYaw)).toFixed(1));
  const pitch = Number(Math.max(-45, Math.min(45, rawPitch)).toFixed(1));

  return buildResult(pitch, yaw, 0.55, 'iris-heuristic', 0, Date.now());
}

export class L2CSGazeDetector {
  private lastRunMs = 0;
  private lastCached: L2CSGazeResult | null = null;
  private readonly minIntervalMs = 400;
  private ready = false;

  async initialize(): Promise<boolean> {
    try {
      const { loadL2csOnnxSession } = await import('@/lib/engines/l2cs-onnx-inference');
      await loadL2csOnnxSession();
      this.ready = true;
    } catch (err) {
      console.error('L2CS ONNX init error:', err);
      this.ready = false;
    }
    return this.ready;
  }

  /** @deprecated Use predictGazeAsync — kept for analytics-test sync heuristic path */
  public predictGaze(
    _video: HTMLVideoElement | HTMLCanvasElement,
    landmarks?: Array<{ x: number; y: number; z?: number }>
  ): L2CSGazeResult {
    return (
      predictGazeHeuristic(landmarks) ??
      buildResult(0, 0, 0, 'iris-heuristic', 0, Date.now())
    );
  }

  public async predictGazeAsync(
    video: HTMLVideoElement,
    options?: {
      landmarks?: Array<{ x: number; y: number; z?: number }>;
      faceBox?: PixelFaceBox;
    }
  ): Promise<L2CSGazeResult> {
    const now = Date.now();
    if (this.lastCached && now - this.lastRunMs < this.minIntervalMs) {
      return { ...this.lastCached, timestamp: this.lastRunMs };
    }

    if (!video || video.readyState < 2) {
      const fallback = predictGazeHeuristic(options?.landmarks);
      return fallback ?? buildResult(0, 0, 0, 'iris-heuristic', 0, now);
    }

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const faceBox =
      options?.faceBox ??
      (options?.landmarks ? faceBoxFromLandmarks(options.landmarks, vw, vh) : null);

    if (this.ready && faceBox) {
      try {
        const onnx = await runL2csOnnxInference(video, faceBox);
        const result = buildResult(
          onnx.gazePitch,
          onnx.gazeYaw,
          onnx.confidence,
          'l2cs-onnx',
          onnx.latencyMs,
          now
        );
        this.lastCached = result;
        this.lastRunMs = now;
        return result;
      } catch (err) {
        console.error('L2CS ONNX inference error:', err);
      }
    }

    const heuristic = predictGazeHeuristic(options?.landmarks);
    const result = heuristic ?? buildResult(0, 0, 0, 'iris-heuristic', 0, now);
    this.lastCached = result;
    this.lastRunMs = now;
    return result;
  }
}
