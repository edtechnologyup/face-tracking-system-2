import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

/** Landmark geometry quality 0–1 from MediaPipe mesh stability (not a heuristic yaw formula). */
export function computeLandmarkQuality(landmarks: NormalizedLandmark[] | undefined): number | null {
  if (!landmarks || landmarks.length < 468) return null;

  const keyIndices = [1, 33, 133, 263, 362, 10, 18, 234, 454];
  let visible = 0;
  for (const idx of keyIndices) {
    const lm = landmarks[idx];
    if (!lm) continue;
    const inBounds = lm.x >= 0 && lm.x <= 1 && lm.y >= 0 && lm.y <= 1;
    const zOk = lm.z === undefined || Math.abs(lm.z) < 0.15;
    if (inBounds && zOk) visible++;
  }

  const visibilityScore = visible / keyIndices.length;

  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const interEye = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  const interEyeOk = interEye > 0.08 && interEye < 0.45 ? 1 : 0.6;

  const score = Math.min(1, Math.max(0, visibilityScore * 0.7 + interEyeOk * 0.3));
  return Number(score.toFixed(3));
}

export function computeLandmarkConfidence(landmarks: NormalizedLandmark[] | undefined): number | null {
  return computeLandmarkQuality(landmarks);
}

export function computeMediapipeFrameConfidence(
  landmarks: NormalizedLandmark[] | undefined,
  blendshapeCategories?: Array<{ score?: number }>
): number | null {
  const geo = computeLandmarkQuality(landmarks);
  if (geo === null) return null;

  if (blendshapeCategories && blendshapeCategories.length > 0) {
    const meanBs =
      blendshapeCategories.reduce((s, c) => s + (c.score ?? 0), 0) / blendshapeCategories.length;
    const bsStability = 1 - Math.min(1, Math.abs(meanBs - 0.08) * 3);
    return Number(Math.min(1, geo * 0.85 + bsStability * 0.15).toFixed(3));
  }

  return geo;
}

/** Head-pose confidence from pose landmark geometry — separate from general mesh quality. */
export function computeHeadPoseConfidence(landmarks: NormalizedLandmark[] | undefined): number | null {
  if (!landmarks || landmarks.length < 468) return null;

  const noseTip = landmarks[1];
  const leftEyeOuter = landmarks[33];
  const rightEyeOuter = landmarks[263];
  const leftEyeInner = landmarks[133];
  const rightEyeInner = landmarks[362];
  const chin = landmarks[152] || landmarks[18];
  const forehead = landmarks[10];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];

  if (!noseTip || !leftEyeOuter || !rightEyeOuter || !chin || !forehead) return null;

  const interEye = Math.hypot(rightEyeOuter.x - leftEyeOuter.x, rightEyeOuter.y - leftEyeOuter.y);
  if (interEye < 0.06) return null;

  const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
  const noseOffsetNorm = Math.abs(noseTip.x - faceCenterX) / interEye;
  const noseCenterOk = noseOffsetNorm < 0.55 ? 1 : 0.55;

  const faceHeight = Math.abs(chin.y - forehead.y);
  const heightOk = faceHeight > interEye * 0.9 && faceHeight < interEye * 3.5 ? 1 : 0.55;

  const leftEyeW = Math.abs(leftEyeOuter.x - leftEyeInner.x);
  const rightEyeW = Math.abs(rightEyeInner.x - rightEyeOuter.x);
  const eyeSymmetry = 1 - Math.min(1, Math.abs(leftEyeW - rightEyeW) / interEye);

  const cheekSpan = Math.abs(leftCheek.x - rightCheek.x);
  const cheekOk = cheekSpan > interEye * 1.2 && cheekSpan < interEye * 3.2 ? 1 : 0.6;

  const score = Math.min(
    1,
    Math.max(0, noseCenterOk * 0.3 + heightOk * 0.25 + eyeSymmetry * 0.25 + cheekOk * 0.2)
  );
  return Number(score.toFixed(3));
}
