import { describe, expect, it } from 'vitest';
import { extractHeadPoseFromMatrix } from '@/lib/mediapipe-head-pose';

describe('extractHeadPoseFromMatrix', () => {
  it('returns null for missing matrix data', () => {
    expect(extractHeadPoseFromMatrix(undefined)).toBeNull();
    expect(extractHeadPoseFromMatrix({ data: [] } as never)).toBeNull();
  });

  it('extracts ~0° pose from identity rotation matrix', () => {
    const matrix = {
      rows: 4,
      columns: 4,
      data: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ],
    };

    const pose = extractHeadPoseFromMatrix(matrix);
    expect(pose).not.toBeNull();
    expect(pose!.yaw).toBeCloseTo(0, 0);
    expect(pose!.pitch).toBeCloseTo(0, 0);
    expect(pose!.roll).toBeCloseTo(0, 0);
    expect(pose!.confidence).toBeGreaterThan(0.7);
  });

  it('detects positive yaw from Y-axis rotation matrix', () => {
    const yawDeg = 25;
    const rad = (yawDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const matrix = {
      rows: 4,
      columns: 4,
      data: [
        cos, 0, sin, 0,
        0, 1, 0, 0,
        -sin, 0, cos, 0,
        0, 0, 0, 1,
      ],
    };

    const pose = extractHeadPoseFromMatrix(matrix);
    expect(pose).not.toBeNull();
    expect(Math.abs(pose!.yaw)).toBeGreaterThan(15);
    expect(Math.abs(pose!.yaw)).toBeLessThan(35);
  });
});
