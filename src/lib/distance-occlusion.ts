import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { computeLandmarkQuality } from '@/lib/mediapipe-quality';
import { calculateOcclusionScore } from '@/lib/occlusion-utils';
import { DISTANCE_THRESHOLD_CM } from '@/lib/mediapipe-detector';

/** ค่า focal length เริ่มต้นสำหรับ webcam ทั่วไป (pixels) */
export const DEFAULT_FOCAL_LENGTH_PX = 550;
/** ความกว้าง/สูงใบหน้าเฉลี่ย (cm) สำหรับ pinhole estimate */
export const AVERAGE_FACE_WIDTH_CM = 15;
export const AVERAGE_FACE_HEIGHT_CM = 19;
/** เอียงศีรษะเกินนี้ → ระยะห่างไม่น่าเชื่อถือ */
export const HEAD_ROLL_DISTANCE_INVALID_DEG = 30;
/** landmark quality ต่ำกว่านี้ → null distance */
export const MIN_LANDMARK_QUALITY_FOR_DISTANCE = 0.45;
/** inter-eye normalized ต่ำกว่านี้ → ใบหน้าเล็ก/ไกลเกินไป */
export const MIN_INTER_EYE_NORM = 0.06;

const SESSION_FOCAL_KEY = 'face-tracking:focalLengthPx';

export type DistanceMethod =
  | 'pinholeCalibrated'
  | 'pinholeDefault'
  | 'yoloBboxPinhole'
  | 'mediapipeLandmark';

export type OcclusionMethod =
  | 'landmarkHeuristic'
  | 'landmarkQualityFusion'
  | 'dlibQualityFusion';

export interface DistanceEstimate {
  estimatedCm: number | null;
  isTooFar: boolean;
  confidence: number;
  reliable: boolean;
  method: DistanceMethod;
  invalidReason?: string;
}

export interface OcclusionEstimate {
  score: number;
  confidence: number;
  reliable: boolean;
  method: OcclusionMethod;
}

export interface DistanceInput {
  landmarks?: NormalizedLandmark[];
  headRoll?: number | null;
  yoloBboxNormalized?: { width: number; height: number } | null;
  yoloFresh?: boolean;
  videoWidthPx?: number;
  videoHeightPx?: number;
}

export interface OcclusionInput {
  landmarks?: NormalizedLandmark[];
  dlibLandmarkQuality?: number | null;
  dlibFresh?: boolean;
}

/** อ่าน focal length ที่ calibrate ไว้ใน session (ถ้ามี) */
export function getSessionFocalLengthPx(): number | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(SESSION_FOCAL_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 100 ? parsed : null;
}

/**
 * Calibrate focal length จากขนาดใบหน้าที่รู้ระยะจริง (เช่น 40cm)
 * @param faceWidthNormalized ความกว้างใบหน้า normalized 0–1
 * @param knownDistanceCm ระยะจริงที่ยืน (cm)
 */
export function calibrateSessionFocalLength(
  faceWidthNormalized: number,
  knownDistanceCm: number
): number | null {
  if (faceWidthNormalized <= 0 || knownDistanceCm <= 0) return null;
  const pixelWidth = faceWidthNormalized * 1000;
  const focal = (pixelWidth * knownDistanceCm) / AVERAGE_FACE_WIDTH_CM;
  if (!Number.isFinite(focal) || focal < 100 || focal > 2000) return null;
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(SESSION_FOCAL_KEY, String(Math.round(focal)));
  }
  return Math.round(focal);
}

function pinholeFromFaceSize(
  faceWidthNorm: number,
  faceHeightNorm: number,
  focalPx: number
): number {
  const distanceFromWidth =
    (AVERAGE_FACE_WIDTH_CM * focalPx) / (faceWidthNorm * 1000);
  const distanceFromHeight =
    (AVERAGE_FACE_HEIGHT_CM * focalPx) / (faceHeightNorm * 1000);
  return (distanceFromWidth + distanceFromHeight) / 2;
}

/**
 * ประมาณระยะห่างใบหน้า (cm) — null + provenance เมื่อไม่น่าเชื่อถือ
 */
export function estimateFaceDistance(input: DistanceInput): DistanceEstimate {
  const {
    landmarks,
    headRoll,
    yoloBboxNormalized,
    yoloFresh,
    videoWidthPx = 640,
    videoHeightPx = 480,
  } = input;

  if (headRoll != null && Math.abs(headRoll) > HEAD_ROLL_DISTANCE_INVALID_DEG) {
    return {
      estimatedCm: null,
      isTooFar: false,
      confidence: 0,
      reliable: false,
      method: 'mediapipeLandmark',
      invalidReason: 'HEAD_ROLL_TOO_HIGH',
    };
  }

  const calibratedFocal = getSessionFocalLengthPx();
  const focalPx = calibratedFocal ?? DEFAULT_FOCAL_LENGTH_PX;
  const method: DistanceMethod = calibratedFocal
    ? 'pinholeCalibrated'
    : 'pinholeDefault';

  // YOLO bbox path — L1 เมื่อ fresh
  if (yoloFresh && yoloBboxNormalized && yoloBboxNormalized.width > 0) {
    const pixelWidth = yoloBboxNormalized.width * videoWidthPx;
    const pixelHeight = yoloBboxNormalized.height * videoHeightPx;
    const fromWidth = (AVERAGE_FACE_WIDTH_CM * focalPx) / pixelWidth;
    const fromHeight = (AVERAGE_FACE_HEIGHT_CM * focalPx) / pixelHeight;
    const estimatedCm = Math.round((fromWidth + fromHeight) / 2);
    const confidence = 0.75;
    return {
      estimatedCm,
      isTooFar: estimatedCm > DISTANCE_THRESHOLD_CM,
      confidence,
      reliable: true,
      method: 'yoloBboxPinhole',
    };
  }

  if (!landmarks || landmarks.length < 468) {
    return {
      estimatedCm: null,
      isTooFar: false,
      confidence: 0,
      reliable: false,
      method: 'mediapipeLandmark',
      invalidReason: 'INSUFFICIENT_LANDMARKS',
    };
  }

  const landmarkQuality = computeLandmarkQuality(landmarks);
  if (landmarkQuality != null && landmarkQuality < MIN_LANDMARK_QUALITY_FOR_DISTANCE) {
    return {
      estimatedCm: null,
      isTooFar: false,
      confidence: landmarkQuality,
      reliable: false,
      method: 'mediapipeLandmark',
      invalidReason: 'LOW_LANDMARK_QUALITY',
    };
  }

  const leftEar = landmarks[234];
  const rightEar = landmarks[454];
  const forehead = landmarks[10];
  const chin = landmarks[152];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];

  if (!leftEar || !rightEar || !forehead || !chin || !leftEye || !rightEye) {
    return {
      estimatedCm: null,
      isTooFar: false,
      confidence: 0,
      reliable: false,
      method: 'mediapipeLandmark',
      invalidReason: 'MISSING_KEY_LANDMARKS',
    };
  }

  const interEye = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  if (interEye < MIN_INTER_EYE_NORM) {
    return {
      estimatedCm: null,
      isTooFar: true,
      confidence: 0.3,
      reliable: false,
      method: 'mediapipeLandmark',
      invalidReason: 'FACE_TOO_SMALL',
    };
  }

  const faceWidth = Math.abs(leftEar.x - rightEar.x);
  const faceHeight = Math.abs(forehead.y - chin.y);
  const rawCm = pinholeFromFaceSize(faceWidth, faceHeight, focalPx);
  const estimatedCm = Math.round(rawCm);

  const widthHeightRatio = faceWidth / Math.max(faceHeight, 0.001);
  const ratioOk = widthHeightRatio > 0.5 && widthHeightRatio < 1.8 ? 1 : 0.6;
  const confidence = Number(
    Math.min(1, (landmarkQuality ?? 0.5) * ratioOk).toFixed(3)
  );

  return {
    estimatedCm,
    isTooFar: estimatedCm > DISTANCE_THRESHOLD_CM,
    confidence,
    reliable: confidence >= 0.4,
    method,
  };
}

/**
 * ประมาณ occlusion score 0–1 (สูง = บังมาก) พร้อม confidence
 */
export function estimateOcclusion(input: OcclusionInput): OcclusionEstimate {
  const { landmarks, dlibLandmarkQuality, dlibFresh } = input;

  if (!landmarks || landmarks.length < 468) {
    return {
      score: 1.0,
      confidence: 0.9,
      reliable: true,
      method: 'landmarkHeuristic',
    };
  }

  const heuristicScore = calculateOcclusionScore(landmarks);
  const landmarkQuality = computeLandmarkQuality(landmarks);

  let score = heuristicScore;
  let confidence = 0.65;
  let method: OcclusionMethod = 'landmarkHeuristic';

  if (landmarkQuality != null) {
    const qualityOcclusion = 1 - landmarkQuality;
    score = heuristicScore * 0.6 + qualityOcclusion * 0.4;
    confidence = 0.75;
    method = 'landmarkQualityFusion';
  }

  if (dlibFresh && dlibLandmarkQuality != null) {
    const dlibOcclusion = 1 - dlibLandmarkQuality;
    score = score * 0.7 + dlibOcclusion * 0.3;
    confidence = Math.min(1, confidence + 0.1);
    method = 'dlibQualityFusion';
  }

  return {
    score: Number(Math.min(1, Math.max(0, score)).toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    reliable: true,
    method,
  };
}
