import { describe, expect, it } from 'vitest';
import {
  evaluateCbmiValidity,
  resolveEffectiveAttentionDirection,
  resolveGazeDirection,
} from '@/lib/cbmi-validity';
import {
  CONTRAST_MIN_THRESHOLD,
  GAZE_YAW_THRESHOLD,
  SHARPNESS_MIN_THRESHOLD,
} from '@/lib/cbmi-parameters';

describe('evaluateCbmiValidity', () => {
  it('passes baseline quality envelope', () => {
    const result = evaluateCbmiValidity({
      brightnessMean: 0.44,
      contrastScore: 0.15,
      sharpnessScore: 0.3,
      hasFace: true,
      faceCount: 1,
      faceDistanceCm: 50,
      qualityReady: true,
    });
    expect(result.isValid).toBe(true);
    expect(result.isDimLight).toBe(false);
  });

  it('flags low contrast', () => {
    const result = evaluateCbmiValidity({
      brightnessMean: 0.5,
      contrastScore: CONTRAST_MIN_THRESHOLD - 0.01,
      sharpnessScore: 0.3,
      hasFace: true,
      qualityReady: true,
    });
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe('LOW_CONTRAST');
  });

  it('flags low sharpness', () => {
    const result = evaluateCbmiValidity({
      brightnessMean: 0.5,
      contrastScore: 0.15,
      sharpnessScore: SHARPNESS_MIN_THRESHOLD - 0.01,
      hasFace: true,
      qualityReady: true,
    });
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe('LOW_SHARPNESS');
  });

  it('marks dim light band without invalidating', () => {
    const result = evaluateCbmiValidity({
      brightnessMean: 0.28,
      contrastScore: 0.15,
      sharpnessScore: 0.3,
      hasFace: true,
      qualityReady: true,
    });
    expect(result.isValid).toBe(true);
    expect(result.isDimLight).toBe(true);
  });
});

describe('resolveGazeDirection', () => {
  it('detects gaze left when head is neutral', () => {
    expect(resolveGazeDirection(-(GAZE_YAW_THRESHOLD + 5), 0)).toBe('LEFT');
  });
});

describe('resolveEffectiveAttentionDirection', () => {
  it('prefers head direction over gaze', () => {
    expect(
      resolveEffectiveAttentionDirection({
        headYaw: GAZE_YAW_THRESHOLD + 5,
        headPitch: 0,
        headDirection: 'RIGHT',
        hasGaze: true,
        gazeYaw: -(GAZE_YAW_THRESHOLD + 5),
        gazePitch: 0,
        gazeConfidence: 0.9,
      })
    ).toBe('RIGHT');
  });

  it('uses gaze when head is center', () => {
    expect(
      resolveEffectiveAttentionDirection({
        headYaw: 0,
        headPitch: 0,
        headDirection: 'CENTER',
        hasGaze: true,
        gazeYaw: -(GAZE_YAW_THRESHOLD + 5),
        gazePitch: 0,
        gazeConfidence: 0.9,
      })
    ).toBe('LEFT');
  });
});
