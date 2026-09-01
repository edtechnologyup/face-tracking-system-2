import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface PerEyeGazeVector {
  x: number;
  y: number;
  z: number;
}

export interface IrisGazeEstimate {
  /** Net screen gaze yaw (head + iris), degrees */
  yaw: number;
  /** Net screen gaze pitch (head + iris), degrees */
  pitch: number;
  /** Iris-only horizontal component, degrees */
  irisYawDeg: number;
  /** Iris-only vertical component, degrees */
  irisPitchDeg: number;
  left: PerEyeGazeVector;
  right: PerEyeGazeVector;
  /** 0–1 confidence based on iris landmark availability */
  confidence: number;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Gaze confidence from iris landmark quality — not hardcoded constants. */
export function computeGazeConfidence(
  landmarks: NormalizedLandmark[],
  leftPupilOffsetX: number,
  rightPupilOffsetX: number,
  leftPupilOffsetY: number,
  rightPupilOffsetY: number,
  leftEyeWidth: number,
  rightEyeWidth: number,
  leftEyeHeight: number,
  rightEyeHeight: number
): number {
  const hasIrisLandmarks = landmarks.length >= 478 && !!landmarks[468] && !!landmarks[473];
  const irisScore = hasIrisLandmarks ? 1 : 0.55;

  const eyeWidthOk =
    leftEyeWidth > 0.02 && leftEyeWidth < 0.2 && rightEyeWidth > 0.02 && rightEyeWidth < 0.2 ? 1 : 0.5;
  const eyeHeightOk =
    leftEyeHeight > 0.005 && leftEyeHeight < 0.08 && rightEyeHeight > 0.005 && rightEyeHeight < 0.08
      ? 1
      : 0.55;

  const maxOffset = Math.max(
    Math.abs(leftPupilOffsetX),
    Math.abs(rightPupilOffsetX),
    Math.abs(leftPupilOffsetY),
    Math.abs(rightPupilOffsetY)
  );
  const offsetOk = maxOffset < 0.85 ? 1 - maxOffset * 0.35 : 0.35;

  const asymX = Math.abs(leftPupilOffsetX - rightPupilOffsetX);
  const asymY = Math.abs(leftPupilOffsetY - rightPupilOffsetY);
  const symmetryOk = 1 - Math.min(1, (asymX + asymY) * 0.4);

  const irisIndices = [468, 469, 470, 471, 472, 473, 474, 475, 476, 477];
  let irisVisible = 0;
  for (const idx of irisIndices) {
    const lm = landmarks[idx];
    if (!lm) continue;
    if (lm.x >= 0 && lm.x <= 1 && lm.y >= 0 && lm.y <= 1) irisVisible++;
  }
  const irisVisibility = hasIrisLandmarks ? irisVisible / irisIndices.length : 0.6;

  const score = clamp01(
    irisScore * 0.35 +
      eyeWidthOk * 0.15 +
      eyeHeightOk * 0.1 +
      offsetOk * 0.15 +
      symmetryOk * 0.1 +
      irisVisibility * 0.15
  );

  return Number(score.toFixed(3));
}

function pupilOffsetToVector(offsetX: number, offsetY: number): PerEyeGazeVector {
  const x = Math.max(-1, Math.min(1, offsetX));
  const y = Math.max(-1, Math.min(1, offsetY));
  const zSq = 1 - x * x - y * y;
  const z = zSq > 0 ? -Math.sqrt(zSq) : -0.01;
  return { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)), z: Number(z.toFixed(3)) };
}

/**
 * Iris + head gaze estimation from MediaPipe face mesh (468+ landmarks).
 * Uses iris indices 468–477 when available; falls back to eye corners.
 */
export function estimateGazeFromLandmarks(landmarks: NormalizedLandmark[]): IrisGazeEstimate | null {
  if (!landmarks || landmarks.length < 468) return null;

  const noseTip = landmarks[1];
  const leftEyeInner = landmarks[133];
  const rightEyeInner = landmarks[362];
  const leftEyeOuter = landmarks[33];
  const rightEyeOuter = landmarks[263];
  const chin = landmarks[18];
  const forehead = landmarks[10];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];

  const leftPupil = landmarks[468] || landmarks[470] || leftEyeOuter;
  const rightPupil = landmarks[473] || landmarks[475] || rightEyeOuter;

  const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
  const headYawDegrees = (faceCenterX - noseTip.x) * 160;

  const leftEyeWidth = Math.abs(leftEyeOuter.x - leftEyeInner.x) || 0.05;
  const rightEyeWidth = Math.abs(rightEyeInner.x - rightEyeOuter.x) || 0.05;
  const leftEyeCenterX = (leftEyeInner.x + leftEyeOuter.x) / 2;
  const rightEyeCenterX = (rightEyeInner.x + rightEyeOuter.x) / 2;

  const leftPupilOffsetX = (leftPupil.x - leftEyeCenterX) / leftEyeWidth;
  const rightPupilOffsetX = (rightPupil.x - rightEyeCenterX) / rightEyeWidth;
  const irisGazeRelX = (leftPupilOffsetX + rightPupilOffsetX) / 2;
  const irisYawDeg = irisGazeRelX * 45;

  const totalFaceHeight = Math.abs(chin.y - forehead.y) || 0.3;
  const noseRelativePosition = (noseTip.y - forehead.y) / totalFaceHeight;
  const pitchDeviation = 0.52 - noseRelativePosition;
  const pitchScale = pitchDeviation > 0 ? 80 : 75;

  const leftTop = landmarks[159] || leftPupil;
  const leftBottom = landmarks[145] || leftPupil;
  const rightTop = landmarks[386] || rightPupil;
  const rightBottom = landmarks[374] || rightPupil;
  const leftEyeHeight = Math.abs(leftBottom.y - leftTop.y) || 0.02;
  const rightEyeHeight = Math.abs(rightBottom.y - rightTop.y) || 0.02;
  const leftEyeCenterY = (leftTop.y + leftBottom.y) / 2;
  const rightEyeCenterY = (rightTop.y + rightBottom.y) / 2;

  const leftPupilOffsetY = (leftEyeCenterY - leftPupil.y) / leftEyeHeight;
  const rightPupilOffsetY = (rightEyeCenterY - rightPupil.y) / rightEyeHeight;
  const irisGazeRelY = (leftPupilOffsetY + rightPupilOffsetY) / 2;
  const irisPitchDeg = irisGazeRelY * 25;

  const rawPitchHead = pitchDeviation * pitchScale;
  const netYaw = Math.max(-60, Math.min(60, headYawDegrees + irisYawDeg));
  const netPitch = Math.max(-35, Math.min(35, rawPitchHead + irisPitchDeg + 1.5));

  const confidence = computeGazeConfidence(
    landmarks,
    leftPupilOffsetX,
    rightPupilOffsetX,
    leftPupilOffsetY,
    rightPupilOffsetY,
    leftEyeWidth,
    rightEyeWidth,
    leftEyeHeight,
    rightEyeHeight
  );

  return {
    yaw: Number(netYaw.toFixed(1)),
    pitch: Number(netPitch.toFixed(1)),
    irisYawDeg: Number(irisYawDeg.toFixed(1)),
    irisPitchDeg: Number(irisPitchDeg.toFixed(1)),
    left: pupilOffsetToVector(leftPupilOffsetX, leftPupilOffsetY),
    right: pupilOffsetToVector(rightPupilOffsetX, rightPupilOffsetY),
    confidence: Number(confidence.toFixed(3)),
  };
}
