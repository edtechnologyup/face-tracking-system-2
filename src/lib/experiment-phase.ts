/** Experiment protocol phases stored in behavior_feature_logs.phase */

export const EXPERIMENT_PHASES = [
  'SYSTEM_STABILIZATION',
  'CALIBRATION',
  'CONTROLLED_TASK',
  'ROBUSTNESS_TEST',
  'NATURAL_TASK',
] as const;

export type ExperimentPhase = (typeof EXPERIMENT_PHASES)[number];

export const FEATURE_VALID_PHASES = [
  'faceValid',
  'headValid',
  'gazeValid',
  'eyeValid',
] as const;

export type FeatureValidPhase = (typeof FEATURE_VALID_PHASES)[number];

export const DEFAULT_EXPERIMENT_PHASE: ExperimentPhase = 'NATURAL_TASK';

/** Warmup / quality not ready → SYSTEM_STABILIZATION; otherwise configured phase. */
export function resolveExperimentPhase(
  qualityReady: boolean,
  configured: ExperimentPhase = DEFAULT_EXPERIMENT_PHASE
): ExperimentPhase {
  if (!qualityReady) return 'SYSTEM_STABILIZATION';
  return configured;
}

export const EXPERIMENT_PHASE_LABELS: Record<ExperimentPhase, string> = {
  SYSTEM_STABILIZATION: 'ระบบ stabilizing / warmup',
  CALIBRATION: 'Calibration',
  CONTROLLED_TASK: 'Controlled task',
  ROBUSTNESS_TEST: 'Robustness test',
  NATURAL_TASK: 'Natural task (สอบจริง)',
};

export const FEATURE_VALID_LABELS: Record<FeatureValidPhase, string> = {
  faceValid: 'Face data usable',
  headValid: 'Head yaw/pitch/roll usable',
  gazeValid: 'Gaze usable',
  eyeValid: 'EAR / eye openness usable',
};
