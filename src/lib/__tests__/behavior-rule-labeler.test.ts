import { describe, expect, it } from 'vitest';
import {
  aggregateScenarioCounts,
  labelBehaviorFromFeatures,
  scenarioToViolationType,
} from '@/lib/behavior-rule-labeler';
import {
  BEHAVIOR_SCENARIO_REGRESSION_CASES,
  runBehaviorScenarioRegression,
} from '@/lib/pipeline-qa-regression';

describe('labelBehaviorFromFeatures', () => {
  it('labels center screen for neutral pose', () => {
    const result = labelBehaviorFromFeatures({
      now: 10_000,
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
      attentionState: { direction: 'CENTER', startTime: 10_000 },
      naturalReadingState: { startTime: null, yawSamples: [] },
    });

    expect(result.scenario).toBe('CENTER_SCREEN');
    expect(result.validPhases).toContain('faceValid');
    expect(result.isValid).toBe(true);
  });
});

describe('aggregateScenarioCounts', () => {
  it('counts scenarios', () => {
    expect(
      aggregateScenarioCounts(['CENTER_SCREEN', 'CENTER_SCREEN', 'LOW_LIGHT'])
    ).toEqual({
      CENTER_SCREEN: 2,
      LOW_LIGHT: 1,
    });
  });
});

describe('scenarioToViolationType', () => {
  it('maps sustained look away to violation', () => {
    expect(scenarioToViolationType('SUSTAINED_LOOK_AWAY_LEFT')).toBe('LOOKING_AWAY_EXCEEDED');
    expect(scenarioToViolationType('CENTER_SCREEN')).toBeNull();
  });
});

describe('Phase 9 scenario regression matrix', () => {
  it('passes all automated regression cases', () => {
    const run = runBehaviorScenarioRegression(BEHAVIOR_SCENARIO_REGRESSION_CASES);
    expect(run.failed).toBe(0);
    expect(run.passed).toBe(BEHAVIOR_SCENARIO_REGRESSION_CASES.length);
  });
});
