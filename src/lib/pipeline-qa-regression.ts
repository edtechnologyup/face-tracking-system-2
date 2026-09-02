import {
  labelBehaviorFromFeatures,
  type BehaviorScenarioLabel,
  type RuleLabelInput,
} from '@/lib/behavior-rule-labeler';
import { YAW_THRESHOLD, SUSTAINED_DURATION_SEC } from '@/lib/cbmi-parameters';

export interface ScenarioRegressionCase {
  id: string;
  description: string;
  input: RuleLabelInput;
  expectedScenario: BehaviorScenarioLabel;
  expectedValid?: boolean;
  expectedInvalidReason?: string | null;
}

const BASE_NOW = 20_000;

function baseInput(overrides: Partial<RuleLabelInput> = {}): RuleLabelInput {
  return {
    now: BASE_NOW,
    hasFace: true,
    faceCount: 1,
    yaw: 0,
    pitch: 0,
    occlusionScore: 0.1,
    brightnessMean: 0.5,
    faceDistanceCm: 50,
    qualityReady: true,
    hasGaze: true,
    landmarkCount: 468,
    attentionState: { direction: 'CENTER', startTime: BASE_NOW },
    naturalReadingState: { startTime: null, yawSamples: [] },
    ...overrides,
  };
}

/** Automated scenario regression cases — Phase 9 test matrix */
export const BEHAVIOR_SCENARIO_REGRESSION_CASES: ScenarioRegressionCase[] = [
  {
    id: 'center-screen',
    description: 'หน้าเดียว มองจอ',
    input: baseInput(),
    expectedScenario: 'CENTER_SCREEN',
    expectedValid: true,
  },
  {
    id: 'sustained-left',
    description: 'หันซ้าย >2s',
    input: baseInput({
      yaw: -(YAW_THRESHOLD + 5),
      attentionState: {
        direction: 'LEFT',
        startTime: BASE_NOW - (SUSTAINED_DURATION_SEC + 1) * 1000,
      },
    }),
    expectedScenario: 'SUSTAINED_LOOK_AWAY_LEFT',
  },
  {
    id: 'multi-face',
    description: '2 คนในเฟรม',
    input: baseInput({ faceCount: 2 }),
    expectedScenario: 'MULTIPLE_FACES',
    expectedValid: false,
    expectedInvalidReason: 'MULTIPLE_FACES_DETECTED',
  },
  {
    id: 'eyes-closed',
    description: 'ปิดตา + ก้มหน้า',
    input: baseInput({
      leftEAR: 0.08,
      rightEAR: 0.08,
      headPitch: 15,
    }),
    expectedScenario: 'EYES_CLOSED_DISENGAGED',
    expectedValid: false,
    expectedInvalidReason: 'EYES_CLOSED_DISENGAGED',
  },
  {
    id: 'low-light',
    description: 'แสงน้อย',
    input: baseInput({ brightnessMean: 0.05 }),
    expectedScenario: 'LOW_LIGHT',
    expectedValid: false,
    expectedInvalidReason: 'LOW_BRIGHTNESS',
  },
  {
    id: 'dim-light',
    description: 'แสงลดลง (CBMI DIM_LIGHT protocol)',
    input: baseInput({ brightnessMean: 0.28 }),
    expectedScenario: 'DIM_LIGHT',
    expectedValid: true,
  },
  {
    id: 'low-contrast',
    description: 'contrast ต่ำ',
    input: baseInput({ contrastScore: 0.04 }),
    expectedScenario: 'CENTER_SCREEN',
    expectedValid: false,
    expectedInvalidReason: 'LOW_CONTRAST',
  },
  {
    id: 'low-sharpness',
    description: 'ภาพเบลอ',
    input: baseInput({ sharpnessScore: 0.05 }),
    expectedScenario: 'CENTER_SCREEN',
    expectedValid: false,
    expectedInvalidReason: 'LOW_SHARPNESS',
  },
  {
    id: 'gaze-away-head-center',
    description: 'Phase 2: หัวตรง แต่ gaze หันซ้าย',
    input: baseInput({
      yaw: 0,
      pitch: 0,
      gazeYaw: -(YAW_THRESHOLD + 8),
      gazePitch: 0,
      gazeConfidence: 0.8,
      attentionState: {
        direction: 'LEFT',
        startTime: BASE_NOW - 500,
      },
    }),
    expectedScenario: 'BRIEF_GLANCE_LEFT',
    expectedValid: true,
  },
  {
    id: 'face-missing',
    description: 'ไม่เจอใบหน้า',
    input: baseInput({ hasFace: false, faceCount: 0 }),
    expectedScenario: 'FACE_MISSING',
    expectedValid: false,
    expectedInvalidReason: 'NO_FACE_DETECTED',
  },
];

export interface RegressionRunResult {
  passed: number;
  failed: number;
  results: Array<{
    id: string;
    passed: boolean;
    expectedScenario: BehaviorScenarioLabel;
    actualScenario: BehaviorScenarioLabel;
    message?: string;
  }>;
}

/** รัน regression suite สำหรับ rule labeler */
export function runBehaviorScenarioRegression(
  cases: ScenarioRegressionCase[] = BEHAVIOR_SCENARIO_REGRESSION_CASES
): RegressionRunResult {
  const results: RegressionRunResult['results'] = [];
  let passed = 0;
  let failed = 0;

  for (const testCase of cases) {
    const result = labelBehaviorFromFeatures(testCase.input);
    let ok = result.scenario === testCase.expectedScenario;

    if (testCase.expectedValid != null && result.isValid !== testCase.expectedValid) {
      ok = false;
    }
    if (
      testCase.expectedInvalidReason !== undefined &&
      result.invalidReason !== testCase.expectedInvalidReason
    ) {
      ok = false;
    }

    if (ok) {
      passed++;
    } else {
      failed++;
    }

    results.push({
      id: testCase.id,
      passed: ok,
      expectedScenario: testCase.expectedScenario,
      actualScenario: result.scenario,
      message: ok
        ? undefined
        : `expected scenario=${testCase.expectedScenario}, got=${result.scenario}; valid=${result.isValid}; reason=${result.invalidReason}`,
    });
  }

  return { passed, failed, results };
}
