/**
 * CBMI Parameter Adjustment Guide — shared validity + gaze helpers.
 * @see cbmi-parameter-guide.html
 */
import {
  BRIGHTNESS_DIM_LIGHT_THRESHOLD,
  BRIGHTNESS_MIN_THRESHOLD,
  CONTRAST_MIN_THRESHOLD,
  DISTANCE_THRESHOLD_CM,
  GAZE_MIN_CONFIDENCE,
  GAZE_PITCH_DOWN_THRESHOLD,
  GAZE_PITCH_UP_THRESHOLD,
  GAZE_YAW_THRESHOLD,
  OCCLUSION_VALID_THRESHOLD,
  SHARPNESS_MIN_THRESHOLD,
} from '@/lib/cbmi-parameters';

export type CbmiInvalidReason =
  | 'LOW_BRIGHTNESS'
  | 'LOW_CONTRAST'
  | 'LOW_SHARPNESS'
  | 'FACE_TOO_FAR'
  | 'MULTIPLE_FACES_DETECTED'
  | 'NO_FACE_DETECTED'
  | 'FACE_OCCLUDED'
  | 'WARMUP'
  | 'EYES_CLOSED_DISENGAGED';

export interface CbmiImageQualityScores {
  brightnessMean: number;
  contrastScore: number;
  sharpnessScore: number;
}

export interface CbmiValidityInput extends CbmiImageQualityScores {
  hasFace?: boolean;
  faceCount?: number;
  faceDistanceCm?: number | null;
  isTooFar?: boolean;
  occlusionScore?: number;
  qualityReady?: boolean;
}

export interface CbmiValidityResult {
  isValid: boolean;
  invalidReason: CbmiInvalidReason | null;
  isLowBrightness: boolean;
  isDimLight: boolean;
  isLowContrast: boolean;
  isLowSharpness: boolean;
}

/** CBMI Guide Section 4 + 5: brightness, contrast, sharpness, distance validity envelope */
export function evaluateCbmiValidity(input: CbmiValidityInput): CbmiValidityResult {
  const isLowBrightness = input.brightnessMean < BRIGHTNESS_MIN_THRESHOLD;
  const isDimLight =
    !isLowBrightness && input.brightnessMean < BRIGHTNESS_DIM_LIGHT_THRESHOLD;
  const isLowContrast = input.contrastScore < CONTRAST_MIN_THRESHOLD;
  const isLowSharpness = input.sharpnessScore < SHARPNESS_MIN_THRESHOLD;
  const isTooFar =
    !!input.isTooFar ||
    (input.faceDistanceCm != null && input.faceDistanceCm > DISTANCE_THRESHOLD_CM);
  const hasMultipleFaces = (input.faceCount ?? 1) > 1;

  let invalidReason: CbmiInvalidReason | null = null;

  if (input.qualityReady === false) {
    invalidReason = 'WARMUP';
  } else if (input.hasFace === false) {
    invalidReason = 'NO_FACE_DETECTED';
  } else if (hasMultipleFaces) {
    invalidReason = 'MULTIPLE_FACES_DETECTED';
  } else if (
    input.occlusionScore != null &&
    input.occlusionScore >= OCCLUSION_VALID_THRESHOLD
  ) {
    invalidReason = 'FACE_OCCLUDED';
  } else if (isLowBrightness) {
    invalidReason = 'LOW_BRIGHTNESS';
  } else if (isLowContrast) {
    invalidReason = 'LOW_CONTRAST';
  } else if (isLowSharpness) {
    invalidReason = 'LOW_SHARPNESS';
  } else if (isTooFar) {
    invalidReason = 'FACE_TOO_FAR';
  }

  return {
    isValid: invalidReason == null,
    invalidReason,
    isLowBrightness,
    isDimLight,
    isLowContrast,
    isLowSharpness,
  };
}

/** CBMI Guide Phase 2: iris/L2CS gaze direction when head pose is neutral */
export function resolveGazeDirection(
  gazeYaw: number,
  gazePitch: number
): 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER' {
  if (gazeYaw < -GAZE_YAW_THRESHOLD) return 'LEFT';
  if (gazeYaw > GAZE_YAW_THRESHOLD) return 'RIGHT';
  if (gazePitch < -GAZE_PITCH_DOWN_THRESHOLD) return 'DOWN';
  if (gazePitch > GAZE_PITCH_UP_THRESHOLD) return 'UP';
  return 'CENTER';
}

/** Head-first direction; supplement with gaze when head is CENTER (Phase 2) */
export function resolveEffectiveAttentionDirection(input: {
  headYaw: number;
  headPitch: number;
  headDirection: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER';
  hasGaze: boolean;
  gazeYaw?: number | null;
  gazePitch?: number | null;
  gazeConfidence?: number | null;
}): 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER' {
  if (input.headDirection !== 'CENTER') {
    return input.headDirection;
  }
  if (
    !input.hasGaze ||
    input.gazeYaw == null ||
    input.gazePitch == null ||
    (input.gazeConfidence ?? 0) < GAZE_MIN_CONFIDENCE
  ) {
    return 'CENTER';
  }
  return resolveGazeDirection(input.gazeYaw, input.gazePitch);
}
