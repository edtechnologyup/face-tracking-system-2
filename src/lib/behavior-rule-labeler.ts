import {
  YAW_THRESHOLD,
  PITCH_UP_THRESHOLD,
  PITCH_DOWN_THRESHOLD,
  BRIGHTNESS_MIN_THRESHOLD,
  BRIGHTNESS_DIM_LIGHT_THRESHOLD,
  CONTRAST_MIN_THRESHOLD,
  SHARPNESS_MIN_THRESHOLD,
  OCCLUSION_VALID_THRESHOLD,
  OCCLUSION_SCENARIO_THRESHOLD,
  SUSTAINED_DURATION_SEC,
  DISTANCE_THRESHOLD_CM,
  EAR_THRESHOLD,
  HEAD_PITCH_DISENGAGEMENT_THRESHOLD,
} from '@/lib/cbmi-parameters';
import {
  evaluateCbmiValidity,
  resolveEffectiveAttentionDirection,
} from '@/lib/cbmi-validity';
import {
  updateNaturalReading,
  type NaturalReadingState,
} from '@/lib/natural-reading-detector';

/** สถานการณ์พฤติกรรมที่ใช้ label detection — ตรงกับ enum BehaviorScenario ใน Prisma */
export type BehaviorScenarioLabel =
  | 'CENTER_SCREEN'
  | 'BRIEF_GLANCE_LEFT'
  | 'BRIEF_GLANCE_RIGHT'
  | 'SUSTAINED_LOOK_AWAY_LEFT'
  | 'SUSTAINED_LOOK_AWAY_RIGHT'
  | 'LOOK_DOWN'
  | 'LOOK_UP'
  | 'FACE_MISSING'
  | 'OCCLUSION'
  | 'MULTIPLE_FACES'
  | 'LOW_LIGHT'
  | 'DIM_LIGHT'
  | 'DISTANCE_1M'
  | 'EYES_CLOSED_DISENGAGED'
  | 'NATURAL_READING';

export type PhaseLabel = 'faceValid' | 'headValid' | 'gazeValid' | 'eyeValid';

export type { ExperimentPhase, FeatureValidPhase } from '@/lib/experiment-phase';

export interface AttentionState {
  direction: 'CENTER' | 'LEFT' | 'RIGHT' | 'DOWN' | 'UP';
  startTime: number;
}

export interface RuleLabelInput {
  now: number;
  hasFace: boolean;
  faceCount: number;
  yaw: number;
  pitch: number;
  occlusionScore: number;
  brightnessMean: number;
  contrastScore?: number;
  sharpnessScore?: number;
  faceDistanceCm: number | null;
  isTooFar?: boolean;
  leftEAR?: number | null;
  rightEAR?: number | null;
  leftEyeOpenness?: number | null;
  rightEyeOpenness?: number | null;
  headRoll?: number | null;
  headPitch?: number | null;
  gazeYaw?: number | null;
  gazePitch?: number | null;
  gazeConfidence?: number | null;
  qualityReady: boolean;
  hasGaze: boolean;
  landmarkCount?: number;
  attentionState: AttentionState;
  naturalReadingState: NaturalReadingState;
}

export interface RuleLabelResult {
  scenario: BehaviorScenarioLabel;
  validPhases: PhaseLabel[];
  isValid: boolean;
  invalidReason: string | null;
  attentionState: AttentionState;
  naturalReadingState: NaturalReadingState;
  direction: AttentionState['direction'];
  durationLookingMs: number;
}

function resolveDirection(yaw: number, pitch: number): AttentionState['direction'] {
  if (yaw < -YAW_THRESHOLD) return 'LEFT';
  if (yaw > YAW_THRESHOLD) return 'RIGHT';
  if (pitch > PITCH_UP_THRESHOLD) return 'UP';
  if (pitch < -PITCH_DOWN_THRESHOLD) return 'DOWN';
  return 'CENTER';
}

function updateAttentionState(
  current: AttentionState,
  direction: AttentionState['direction'],
  now: number
): AttentionState {
  if (current.direction !== direction) {
    return { direction, startTime: now };
  }
  return current;
}

/**
 * L3 rule engine — label scenario / phase / isValid จาก aggregated features
 */
export function labelBehaviorFromFeatures(input: RuleLabelInput): RuleLabelResult {
  const {
    now,
    hasFace,
    faceCount,
    yaw,
    pitch,
    occlusionScore,
    brightnessMean,
    contrastScore = 0.5,
    sharpnessScore = 0.5,
    faceDistanceCm,
    isTooFar,
    leftEAR,
    rightEAR,
    headPitch,
    gazeYaw,
    gazePitch,
    gazeConfidence,
    qualityReady,
    hasGaze,
    attentionState: prevAttention,
    naturalReadingState: prevReading,
  } = input;

  const headDirection = resolveDirection(yaw, pitch);
  const direction = resolveEffectiveAttentionDirection({
    headYaw: yaw,
    headPitch: pitch,
    headDirection,
    hasGaze,
    gazeYaw,
    gazePitch,
    gazeConfidence,
  });
  const attentionState = updateAttentionState(prevAttention, direction, now);
  const durationLookingMs = now - attentionState.startTime;

  const readingUpdate = updateNaturalReading(prevReading, {
    yaw,
    pitch,
    now,
    hasFace,
    faceCount,
  });
  const naturalReadingState = readingUpdate.state;
  const isNaturalReading = readingUpdate.isNaturalReading;

  let scenario: BehaviorScenarioLabel = 'CENTER_SCREEN';

  if (!hasFace) {
    scenario = 'FACE_MISSING';
  } else if (faceCount > 1) {
    scenario = 'MULTIPLE_FACES';
  } else if (occlusionScore >= OCCLUSION_SCENARIO_THRESHOLD) {
    scenario = 'OCCLUSION';
  } else if (brightnessMean < BRIGHTNESS_MIN_THRESHOLD) {
    scenario = 'LOW_LIGHT';
  } else if (brightnessMean < BRIGHTNESS_DIM_LIGHT_THRESHOLD) {
    scenario = 'DIM_LIGHT';
  } else if (
    (faceDistanceCm != null && faceDistanceCm > DISTANCE_THRESHOLD_CM) ||
    isTooFar
  ) {
    scenario = 'DISTANCE_1M';
  } else if (isNaturalReading) {
    scenario = 'NATURAL_READING';
  } else if (direction === 'LEFT') {
    scenario =
      durationLookingMs > SUSTAINED_DURATION_SEC * 1000
        ? 'SUSTAINED_LOOK_AWAY_LEFT'
        : 'BRIEF_GLANCE_LEFT';
  } else if (direction === 'RIGHT') {
    scenario =
      durationLookingMs > SUSTAINED_DURATION_SEC * 1000
        ? 'SUSTAINED_LOOK_AWAY_RIGHT'
        : 'BRIEF_GLANCE_RIGHT';
  } else if (direction === 'DOWN') {
    scenario = 'LOOK_DOWN';
  } else if (direction === 'UP') {
    scenario = 'LOOK_UP';
  }

  const avgEAR =
    leftEAR != null && rightEAR != null ? (leftEAR + rightEAR) / 2 : null;
  const isEyeDisengaged =
    avgEAR != null &&
    avgEAR < EAR_THRESHOLD &&
    (headPitch ?? 0) > HEAD_PITCH_DISENGAGEMENT_THRESHOLD;

  if (isEyeDisengaged) {
    scenario = 'EYES_CLOSED_DISENGAGED';
  }

  const isFaceValid =
    hasFace &&
    occlusionScore < OCCLUSION_VALID_THRESHOLD &&
    scenario !== 'MULTIPLE_FACES' &&
    qualityReady;
  const isHeadValid =
    isFaceValid &&
    Number.isFinite(yaw) &&
    Number.isFinite(pitch) &&
    (input.headRoll == null || Number.isFinite(input.headRoll));
  const isGazeValid = isHeadValid && hasGaze;
  const hasEar = input.leftEAR != null && input.rightEAR != null;
  const hasEyeOpenness =
    input.leftEyeOpenness != null && input.rightEyeOpenness != null;
  const isEyeValid = isFaceValid && (hasEar || hasEyeOpenness);

  const validPhases: PhaseLabel[] = [];
  if (isFaceValid) validPhases.push('faceValid');
  if (isHeadValid) validPhases.push('headValid');
  if (isGazeValid) validPhases.push('gazeValid');
  if (isEyeValid) validPhases.push('eyeValid');

  let isValid =
    qualityReady &&
    hasFace &&
    faceCount <= 1 &&
    occlusionScore < OCCLUSION_VALID_THRESHOLD &&
    brightnessMean >= BRIGHTNESS_MIN_THRESHOLD &&
    contrastScore >= CONTRAST_MIN_THRESHOLD &&
    sharpnessScore >= SHARPNESS_MIN_THRESHOLD &&
    !(faceDistanceCm != null && faceDistanceCm > DISTANCE_THRESHOLD_CM) &&
    !isTooFar;

  let invalidReason: string | null = null;
  const cbmiValidity = evaluateCbmiValidity({
    brightnessMean,
    contrastScore,
    sharpnessScore,
    hasFace,
    faceCount,
    faceDistanceCm,
    isTooFar,
    occlusionScore,
    qualityReady,
  });

  if (!qualityReady) {
    isValid = false;
    invalidReason = 'WARMUP';
  } else if (!hasFace) {
    isValid = false;
    invalidReason = 'NO_FACE_DETECTED';
  } else if (faceCount > 1) {
    isValid = false;
    invalidReason = 'MULTIPLE_FACES_DETECTED';
  } else if (occlusionScore >= OCCLUSION_VALID_THRESHOLD) {
    isValid = false;
    invalidReason = 'FACE_OCCLUDED';
  } else if (!cbmiValidity.isValid) {
    isValid = false;
    invalidReason = cbmiValidity.invalidReason;
  } else if (scenario === 'EYES_CLOSED_DISENGAGED') {
    isValid = false;
    invalidReason = 'EYES_CLOSED_DISENGAGED';
  }

  return {
    scenario,
    validPhases,
    isValid,
    invalidReason,
    attentionState,
    naturalReadingState,
    direction,
    durationLookingMs,
  };
}

/** สรุป scenario counts สำหรับ admin analytics */
export function aggregateScenarioCounts(
  scenarios: (BehaviorScenarioLabel | string | null)[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of scenarios) {
    const key = s ?? 'UNKNOWN';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** แปลง scenario เป็น violation type สำหรับ snapshot-analytics / tracking logs */
export function scenarioToViolationType(
  scenario: BehaviorScenarioLabel
): string | null {
  switch (scenario) {
    case 'SUSTAINED_LOOK_AWAY_LEFT':
    case 'SUSTAINED_LOOK_AWAY_RIGHT':
    case 'LOOK_DOWN':
    case 'LOOK_UP':
      return 'LOOKING_AWAY_EXCEEDED';
    case 'MULTIPLE_FACES':
      return 'MULTI_FACE_DETECTED';
    case 'FACE_MISSING':
      return 'FACE_LOSS';
    case 'EYES_CLOSED_DISENGAGED':
      return 'EYES_CLOSED_DISENGAGED';
    case 'OCCLUSION':
      return 'FACE_OCCLUDED';
    case 'LOW_LIGHT':
      return 'LOW_LIGHT';
    case 'DIM_LIGHT':
      return 'DIM_LIGHT';
    case 'DISTANCE_1M':
      return 'FACE_TOO_FAR';
    default:
      return null;
  }
}

/** scenario ที่ถือเป็น security risk สำหรับ admin dashboard */
export function isSecurityScenario(scenario: BehaviorScenarioLabel): boolean {
  return [
    'SUSTAINED_LOOK_AWAY_LEFT',
    'SUSTAINED_LOOK_AWAY_RIGHT',
    'MULTIPLE_FACES',
    'FACE_MISSING',
    'EYES_CLOSED_DISENGAGED',
    'OCCLUSION',
  ].includes(scenario);
}
