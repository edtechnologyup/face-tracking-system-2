/** Phase A — face log integrity: detection gate, bbox source, confidence chain, null policy */

export type BboxSource = 'yolo' | 'mediapipeLandmark' | 'none';
export type FaceConfidenceSource = 'yolo' | 'mediapipe' | 'landmarkQuality' | 'none';

export interface NormalizedFaceBbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function resolveFaceDetected(
  yoloFresh: boolean,
  mediaPipeDetected: boolean,
  landmarkCount: number
): boolean {
  return yoloFresh || (mediaPipeDetected && landmarkCount > 0);
}

export function resolveFaceConfidence(
  yoloConf: number | null,
  mpConfidence: number | null,
  landmarkConf: number | null
): { value: number | null; source: FaceConfidenceSource } {
  if (yoloConf != null) return { value: yoloConf, source: 'yolo' };
  if (mpConfidence != null) return { value: mpConfidence, source: 'mediapipe' };
  if (landmarkConf != null) return { value: landmarkConf, source: 'landmarkQuality' };
  return { value: null, source: 'none' };
}

export function bboxFromLandmarks(
  landmarks: Array<{ x: number; y: number }>
): NormalizedFaceBbox | null {
  if (!landmarks.length) return null;
  const xs = landmarks.map((l) => l.x);
  const ys = landmarks.map((l) => l.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function resolveLogBbox(
  yoloFresh: boolean,
  yoloBoxNormalized: NormalizedFaceBbox | null,
  landmarks: Array<{ x: number; y: number }> | undefined
): { bbox: NormalizedFaceBbox | null; source: BboxSource } {
  if (yoloFresh && yoloBoxNormalized) {
    return { bbox: yoloBoxNormalized, source: 'yolo' };
  }
  if (landmarks?.length) {
    const landmarkBbox = bboxFromLandmarks(landmarks);
    if (landmarkBbox) return { bbox: landmarkBbox, source: 'mediapipeLandmark' };
  }
  return { bbox: null, source: 'none' };
}

export function applyNormalizedBbox(
  entry: Record<string, unknown>,
  box: NormalizedFaceBbox
): void {
  entry.bboxX = box.x;
  entry.bboxY = box.y;
  entry.bboxWidth = box.width;
  entry.bboxHeight = box.height;
  entry.faceCenterX = box.x + box.width / 2;
  entry.faceCenterY = box.y + box.height / 2;
}

/** Clear FACE / HEAD / GAZE / EYE / FACIAL columns when no reliable face in frame */
export function applyNoFaceNullPolicy(entry: Record<string, unknown>): void {
  entry.faceCount = null;
  entry.faceConfidence = null;
  entry.bboxX = null;
  entry.bboxY = null;
  entry.bboxWidth = null;
  entry.bboxHeight = null;
  entry.faceCenterX = null;
  entry.faceCenterY = null;
  entry.faceDistanceCm = null;
  entry.headYaw = null;
  entry.headPitch = null;
  entry.headRoll = null;
  entry.headPoseConfidence = null;
  entry.gazeYaw = null;
  entry.gazePitch = null;
  entry.gazeConfidence = null;
  entry.gazeLeftX = null;
  entry.gazeLeftY = null;
  entry.gazeLeftZ = null;
  entry.gazeRightX = null;
  entry.gazeRightY = null;
  entry.gazeRightZ = null;
  entry.leftEAR = null;
  entry.rightEAR = null;
  entry.leftEyeOpenness = null;
  entry.rightEyeOpenness = null;
  entry.actionUnitsJson = null;
  entry.landmarkCount = null;
  entry.landmarkConfidence = null;
  entry.yoloConfidence = null;
  entry.mediapipeConfidence = null;
  entry.dlibConfidence = null;
  entry.openfaceConfidence = null;
  entry.occlusionScore = null;
  entry.validPhases = [];
}
