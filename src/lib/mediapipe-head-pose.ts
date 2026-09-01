import type { Matrix } from '@mediapipe/tasks-vision';

export interface HeadPoseFromMatrix {
  yaw: number;
  pitch: number;
  roll: number;
  confidence: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Extract yaw/pitch/roll (degrees) from MediaPipe facialTransformationMatrix (L1 model-native). */
export function extractHeadPoseFromMatrix(matrix: Matrix | undefined): HeadPoseFromMatrix | null {
  if (!matrix?.data || matrix.data.length < 16) return null;

  const d = matrix.data;
  // Column-major 4×4 — rotation submatrix
  const r00 = d[0];
  const r01 = d[4];
  const r02 = d[8];
  const r10 = d[1];
  const r11 = d[5];
  const r12 = d[9];
  const r20 = d[2];
  const r21 = d[6];
  const r22 = d[10];

  const pitch = Math.asin(clamp(-r12, -1, 1)) * (180 / Math.PI);
  const yaw = Math.atan2(r02, r22) * (180 / Math.PI);
  const roll = Math.atan2(r10, r11) * (180 / Math.PI);

  const col0 = Math.hypot(r00, r10, r20);
  const col1 = Math.hypot(r01, r11, r21);
  const col2 = Math.hypot(r02, r12, r22);
  const det =
    r00 * (r11 * r22 - r12 * r21) -
    r01 * (r10 * r22 - r12 * r20) +
    r02 * (r10 * r21 - r11 * r20);

  const orthoOk =
    Math.abs(col0 - 1) < 0.18 && Math.abs(col1 - 1) < 0.18 && Math.abs(col2 - 1) < 0.18;
  const detOk = Math.abs(Math.abs(det) - 1) < 0.25;
  const confidence = Number(
    (orthoOk && detOk ? 0.82 + (1 - Math.min(1, Math.abs(Math.abs(det) - 1) * 2)) * 0.18 : 0.42).toFixed(
      3
    )
  );

  return {
    yaw: Number(yaw.toFixed(1)),
    pitch: Number(pitch.toFixed(1)),
    roll: Number(roll.toFixed(1)),
    confidence,
  };
}
