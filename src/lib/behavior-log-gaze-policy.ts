import type { IrisGazeEstimate, PerEyeGazeVector } from '@/lib/gaze-estimation';

/** Primary gaze angle source stored in behavior logs + provenance */
export type GazeSource = 'l2cs-onnx' | 'iris-landmark' | 'none';

export type PerEyeGazeVectorSource = 'iris-landmark' | 'none';

export interface GazeLogFields {
  gazeYaw: number | null;
  gazePitch: number | null;
  gazeConfidence: number | null;
  gazeLeftX: number | null;
  gazeLeftY: number | null;
  gazeLeftZ: number | null;
  gazeRightX: number | null;
  gazeRightY: number | null;
  gazeRightZ: number | null;
  gazeSource: GazeSource;
  perEyeGazeVectorSource: PerEyeGazeVectorSource;
}

export interface ResolveGazeInput {
  l2csFresh: boolean;
  l2csGaze?: {
    gazeYaw: number;
    gazePitch: number;
    confidence: number;
  } | null;
  irisGaze?: IrisGazeEstimate | null;
}

function vectorComponents(v: PerEyeGazeVector | undefined): {
  x: number | null;
  y: number | null;
  z: number | null;
} {
  if (!v) return { x: null, y: null, z: null };
  return { x: v.x, y: v.y, z: v.z };
}

/** Resolve gaze columns: L2CS primary for angles; per-eye vectors from iris only (never duplicated). */
export function resolveGazeLogFields(input: ResolveGazeInput): GazeLogFields {
  const empty: GazeLogFields = {
    gazeYaw: null,
    gazePitch: null,
    gazeConfidence: null,
    gazeLeftX: null,
    gazeLeftY: null,
    gazeLeftZ: null,
    gazeRightX: null,
    gazeRightY: null,
    gazeRightZ: null,
    gazeSource: 'none',
    perEyeGazeVectorSource: 'none',
  };

  if (input.l2csFresh && input.l2csGaze) {
    const left = vectorComponents(input.irisGaze?.left);
    const right = vectorComponents(input.irisGaze?.right);
    const hasPerEye = input.irisGaze != null;
    return {
      gazeYaw: input.l2csGaze.gazeYaw,
      gazePitch: input.l2csGaze.gazePitch,
      gazeConfidence: input.l2csGaze.confidence,
      gazeLeftX: left.x,
      gazeLeftY: left.y,
      gazeLeftZ: left.z,
      gazeRightX: right.x,
      gazeRightY: right.y,
      gazeRightZ: right.z,
      gazeSource: 'l2cs-onnx',
      perEyeGazeVectorSource: hasPerEye ? 'iris-landmark' : 'none',
    };
  }

  if (input.irisGaze) {
    const left = vectorComponents(input.irisGaze.left);
    const right = vectorComponents(input.irisGaze.right);
    return {
      gazeYaw: input.irisGaze.yaw,
      gazePitch: input.irisGaze.pitch,
      gazeConfidence: input.irisGaze.confidence,
      gazeLeftX: left.x,
      gazeLeftY: left.y,
      gazeLeftZ: left.z,
      gazeRightX: right.x,
      gazeRightY: right.y,
      gazeRightZ: right.z,
      gazeSource: 'iris-landmark',
      perEyeGazeVectorSource: 'iris-landmark',
    };
  }

  return empty;
}

export function hasGazeValidPhase(validPhases: readonly string[]): boolean {
  return validPhases.includes('gazeValid');
}

/** Null gaze columns when gazeValid flag is absent (face may still be present). */
export function applyGazeInvalidNullPolicy(entry: Record<string, unknown>): void {
  entry.gazeYaw = null;
  entry.gazePitch = null;
  entry.gazeConfidence = null;
  entry.gazeLeftX = null;
  entry.gazeLeftY = null;
  entry.gazeLeftZ = null;
  entry.gazeRightX = null;
  entry.gazeRightY = null;
  entry.gazeRightZ = null;
}

export function applyGazeFields(entry: Record<string, unknown>, gaze: GazeLogFields): void {
  entry.gazeYaw = gaze.gazeYaw;
  entry.gazePitch = gaze.gazePitch;
  entry.gazeConfidence = gaze.gazeConfidence;
  entry.gazeLeftX = gaze.gazeLeftX;
  entry.gazeLeftY = gaze.gazeLeftY;
  entry.gazeLeftZ = gaze.gazeLeftZ;
  entry.gazeRightX = gaze.gazeRightX;
  entry.gazeRightY = gaze.gazeRightY;
  entry.gazeRightZ = gaze.gazeRightZ;
}
