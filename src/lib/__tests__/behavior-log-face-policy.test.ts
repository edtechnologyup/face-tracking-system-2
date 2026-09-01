import { describe, expect, it } from 'vitest';
import {
  applyNoFaceNullPolicy,
  bboxFromLandmarks,
  resolveFaceConfidence,
  resolveFaceDetected,
  resolveLogBbox,
} from '@/lib/behavior-log-face-policy';

describe('resolveFaceDetected', () => {
  it('requires fresh yolo or mediapipe with landmarks', () => {
    expect(resolveFaceDetected(true, false, 0)).toBe(true);
    expect(resolveFaceDetected(false, true, 468)).toBe(true);
    expect(resolveFaceDetected(false, true, 0)).toBe(false);
    expect(resolveFaceDetected(false, false, 468)).toBe(false);
  });
});

describe('resolveFaceConfidence', () => {
  it('falls back yolo → mediapipe → landmark quality', () => {
    expect(resolveFaceConfidence(0.9, 0.7, 0.5)).toEqual({ value: 0.9, source: 'yolo' });
    expect(resolveFaceConfidence(null, 0.7, 0.5)).toEqual({ value: 0.7, source: 'mediapipe' });
    expect(resolveFaceConfidence(null, null, 0.5)).toEqual({ value: 0.5, source: 'landmarkQuality' });
    expect(resolveFaceConfidence(null, null, null)).toEqual({ value: null, source: 'none' });
  });
});

describe('resolveLogBbox', () => {
  it('prefers yolo box over landmark envelope', () => {
    const yoloBox = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    const landmarks = [{ x: 0.5, y: 0.5 }];
    expect(resolveLogBbox(true, yoloBox, landmarks)).toEqual({ bbox: yoloBox, source: 'yolo' });
  });

  it('uses landmark envelope when yolo unavailable', () => {
    const landmarks = [
      { x: 0.2, y: 0.3 },
      { x: 0.6, y: 0.7 },
    ];
    expect(resolveLogBbox(false, null, landmarks)).toEqual({
      bbox: bboxFromLandmarks(landmarks),
      source: 'mediapipeLandmark',
    });
  });
});

describe('applyNoFaceNullPolicy', () => {
  it('nulls face/head/gaze/eye columns', () => {
    const entry: Record<string, unknown> = {
      faceDetected: false,
      faceCount: 2,
      headYaw: 12,
      leftEAR: 0.3,
      gazeYaw: 5,
      landmarkCount: 468,
      brightnessMean: 0.5,
      scenario: 'FACE_MISSING',
    };
    applyNoFaceNullPolicy(entry);
    expect(entry.faceCount).toBeNull();
    expect(entry.headYaw).toBeNull();
    expect(entry.leftEAR).toBeNull();
    expect(entry.gazeYaw).toBeNull();
    expect(entry.landmarkCount).toBeNull();
    expect(entry.validPhases).toEqual([]);
    expect(entry.brightnessMean).toBe(0.5);
    expect(entry.scenario).toBe('FACE_MISSING');
  });
});
