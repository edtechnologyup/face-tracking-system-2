import { describe, expect, it } from 'vitest';
import {
  applyGazeInvalidNullPolicy,
  hasGazeValidPhase,
  resolveGazeLogFields,
} from '@/lib/behavior-log-gaze-policy';

describe('resolveGazeLogFields', () => {
  it('uses L2CS for angles and iris for per-eye vectors when both available', () => {
    const result = resolveGazeLogFields({
      l2csFresh: true,
      l2csGaze: { gazeYaw: 5, gazePitch: -3, confidence: 0.9 },
      irisGaze: {
        yaw: 10,
        pitch: 2,
        irisYawDeg: 1,
        irisPitchDeg: 0,
        confidence: 0.7,
        left: { x: -0.1, y: 0.02, z: -0.99 },
        right: { x: 0.12, y: 0.01, z: -0.98 },
      },
    });

    expect(result.gazeSource).toBe('l2cs-onnx');
    expect(result.gazeYaw).toBe(5);
    expect(result.gazePitch).toBe(-3);
    expect(result.gazeLeftX).toBe(-0.1);
    expect(result.gazeRightX).toBe(0.12);
    expect(result.perEyeGazeVectorSource).toBe('iris-landmark');
  });

  it('does not duplicate L2CS vector into both eyes when iris missing', () => {
    const result = resolveGazeLogFields({
      l2csFresh: true,
      l2csGaze: { gazeYaw: 5, gazePitch: -3, confidence: 0.9 },
      irisGaze: null,
    });

    expect(result.gazeYaw).toBe(5);
    expect(result.gazeLeftX).toBeNull();
    expect(result.gazeRightX).toBeNull();
    expect(result.perEyeGazeVectorSource).toBe('none');
  });

  it('falls back to iris landmark gaze when L2CS stale', () => {
    const result = resolveGazeLogFields({
      l2csFresh: false,
      irisGaze: {
        yaw: 8,
        pitch: 1,
        irisYawDeg: 2,
        irisPitchDeg: 0,
        confidence: 0.6,
        left: { x: -0.05, y: 0, z: -1 },
        right: { x: 0.06, y: 0, z: -1 },
      },
    });

    expect(result.gazeSource).toBe('iris-landmark');
    expect(result.gazeYaw).toBe(8);
    expect(result.gazeLeftX).toBe(-0.05);
    expect(result.gazeRightX).toBe(0.06);
  });
});

describe('applyGazeInvalidNullPolicy', () => {
  it('clears gaze columns when gazeValid absent', () => {
    const entry: Record<string, unknown> = {
      gazeYaw: 10,
      gazeLeftX: 0.1,
      headYaw: 5,
    };
    applyGazeInvalidNullPolicy(entry);
    expect(entry.gazeYaw).toBeNull();
    expect(entry.gazeLeftX).toBeNull();
    expect(entry.headYaw).toBe(5);
  });
});

describe('hasGazeValidPhase', () => {
  it('detects gazeValid flag', () => {
    expect(hasGazeValidPhase(['faceValid', 'gazeValid'])).toBe(true);
    expect(hasGazeValidPhase(['faceValid'])).toBe(false);
  });
});
