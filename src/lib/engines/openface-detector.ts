import type { IrisGazeEstimate } from '@/lib/gaze-estimation';
import type { MediapipeBlendshapePayload } from '@/lib/blendshape-action-units';

/** OpenFace runs on remote Docker service — browser uses UI passthrough until server responds. */
export const OPENFACE_IS_MOCK = false;
export const OPENFACE_AVAILABLE_IN_BROWSER = false;
export const OPENFACE_USES_REMOTE_SERVER = true;
export const OPENFACE_USES_MEDIAPIPE_BLENDSHAPES = false;

export type OpenFaceSource = 'openface-server' | 'ui-passthrough';

export interface OpenFaceActionUnits {
  au01_InnerBrowRaiser: number;
  au02_OuterBrowRaiser: number;
  au04_BrowLowerer: number;
  au12_LipCornerPuller: number;
  au26_JawDrop: number;
  au45_Blink: number;
}

export interface OpenFaceDetectionResult {
  isDetected: boolean;
  actionUnits: OpenFaceActionUnits | MediapipeBlendshapePayload | null;
  gazeVector: { x: number; y: number; z: number; eyeContact: boolean };
  poseAngle: { pitch: number; yaw: number; roll: number };
  faceCenter?: { x: number; y: number };
  /** RetinaFace score from OpenFace 3.0 server when available */
  confidence: number | null;
  latencyMs: number;
  fps: number;
  memoryMb: number;
  cpuLoadPct: number;
  source?: OpenFaceSource;
  timestamp?: number;
  serverLatencyMs?: number;
  /** Full fetch round-trip including network (benchmark latencyScope=networkRoundTrip) */
  clientRoundTripMs?: number;
}

const emptyResult = (): OpenFaceDetectionResult => ({
  isDetected: false,
  actionUnits: null,
  gazeVector: { x: 0, y: 0, z: -1, eyeContact: false },
  poseAngle: { pitch: 0, yaw: 0, roll: 0 },
  confidence: null,
  latencyMs: 0,
  fps: 0,
  memoryMb: 0,
  cpuLoadPct: 0,
  source: 'ui-passthrough',
});

export class OpenFaceDetector {
  /**
   * UI-only passthrough for benchmark panel — does not produce OpenFace model scores.
   * Facial expression data lives in actionUnitsJson from MediaPipe blendshapes.
   */
  detectFromMediaPipe(
    video: HTMLVideoElement | null,
    yaw: number,
    pitch: number,
    _actionUnits?: MediapipeBlendshapePayload | null,
    gaze?: IrisGazeEstimate | null,
    landmarks?: Array<{ x: number; y: number }>
  ): OpenFaceDetectionResult {
    const startTime = performance.now();

    if (!video || video.readyState < 2 || !gaze) {
      return emptyResult();
    }

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    let cx = vw / 2;
    let cy = vh / 2;

    if (landmarks && landmarks.length > 0) {
      let sumX = 0;
      let sumY = 0;
      landmarks.forEach(pt => {
        sumX += pt.x * vw;
        sumY += pt.y * vh;
      });
      cx = sumX / landmarks.length;
      cy = sumY / landmarks.length;
    }

    const avgGazeX = (gaze.left.x + gaze.right.x) / 2;
    const avgGazeY = (gaze.left.y + gaze.right.y) / 2;
    const gazeZ = (gaze.left.z + gaze.right.z) / 2;

    const gazeYaw = gaze.yaw ?? yaw;
    const gazePitch = gaze.pitch ?? pitch;
    const isEyeContact = Math.abs(gazeYaw) < 15 && Math.abs(gazePitch) < 12;

    const latencyMs = Number((performance.now() - startTime).toFixed(1));

    return {
      isDetected: true,
      actionUnits: null,
      gazeVector: {
        x: Number(avgGazeX.toFixed(3)),
        y: Number(avgGazeY.toFixed(3)),
        z: Number(gazeZ.toFixed(3)),
        eyeContact: isEyeContact,
      },
      poseAngle: {
        pitch: Number(pitch.toFixed(1)),
        yaw: Number(yaw.toFixed(1)),
        roll: 0,
      },
      faceCenter: { x: cx, y: cy },
      confidence: null,
      latencyMs,
      fps: latencyMs > 0 ? Number((1000 / latencyMs).toFixed(1)) : 0,
      memoryMb: 0,
      cpuLoadPct: Number(((latencyMs / 16.6) * 100).toFixed(1)),
      source: 'ui-passthrough',
    };
  }
}
