import { describe, expect, it } from 'vitest';
import { slimFeatureProvenance } from '@/lib/feature-provenance';

describe('slimFeatureProvenance', () => {
  it('keeps key fields and gaze engine only', () => {
    const full = {
      _schema: 'feature-provenance-v2' as const,
      fields: {
        faceConfidence: { engine: 'YOLOv8n-Face', level: 'L0' as const },
        headYaw: { engine: 'MediaPipe FaceLandmarker', level: 'L1' as const },
        bboxX: { engine: 'YOLOv8n-Face', level: 'L0' as const },
      },
      engines: {
        gaze: { source: 'l2cs-onnx' as const, perEyeVectorSource: 'iris-landmark' as const },
        l2cs: {
          modelFile: 'l2cs.onnx',
          modelVersion: '1',
          latencyMs: 10,
          isFresh: true,
          staleMs: 0,
          source: 'l2cs-onnx' as const,
          gazePitch: 1,
          gazeYaw: 2,
          confidence: 0.9,
        },
      },
    };

    const slim = slimFeatureProvenance(full);
    expect(slim._schema).toBe('feature-provenance-v2-slim');
    expect(slim.fields.faceConfidence).toBeDefined();
    expect(slim.fields.bboxX).toBeUndefined();
    expect(slim.engines?.gaze).toBeDefined();
    expect(slim.engines?.l2cs).toBeUndefined();
  });
});
