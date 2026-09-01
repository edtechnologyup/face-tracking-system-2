/** MediaPipe Face Blendshape category from FaceLandmarker */
export interface BlendshapeCategory {
  categoryName?: string;
  score?: number;
}

/** Native MediaPipe blendshapes — NOT OpenFace AU (stored in actionUnitsJson column for facial expression data). */
export interface MediapipeBlendshapePayload {
  _source: 'mediapipe_face_landmarker_blendshapes';
  _engine: 'MediaPipe FaceLandmarker';
  _level: 'L0';
  blendshapes: Record<string, number>;
  meanActivation: number;
}

export function mapBlendshapesToPayload(
  categories: BlendshapeCategory[] | undefined
): MediapipeBlendshapePayload | null {
  if (!categories || categories.length === 0) return null;

  const blendshapes: Record<string, number> = {};
  let sum = 0;
  let count = 0;

  for (const c of categories) {
    if (c.categoryName != null && c.score != null) {
      blendshapes[c.categoryName] = Number(c.score.toFixed(4));
      sum += c.score;
      count++;
    }
  }

  if (count === 0) return null;

  return {
    _source: 'mediapipe_face_landmarker_blendshapes',
    _engine: 'MediaPipe FaceLandmarker',
    _level: 'L0',
    blendshapes,
    meanActivation: Number((sum / count).toFixed(4)),
  };
}

/** @deprecated use mapBlendshapesToPayload — kept for type compat in FaceTrackingData */
export type MappedActionUnits = MediapipeBlendshapePayload;
export const mapBlendshapesToActionUnits = mapBlendshapesToPayload;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Eye openness 0–1 from MediaPipe blendshapes only (L0). */
export function extractEyeOpennessFromBlendshapes(
  blendshapes: Record<string, number> | undefined
): { left: number | null; right: number | null } {
  const fromBlink = (blinkKey: string, openKey: string): number | null => {
    if (!blendshapes) return null;
    const blink = blendshapes[blinkKey];
    if (blink != null) return Number(clamp01(1 - blink).toFixed(3));
    const open = blendshapes[openKey];
    if (open != null) return Number(clamp01(open).toFixed(3));
    return null;
  };

  return {
    left: fromBlink('eyeBlinkLeft', 'eyeOpenLeft'),
    right: fromBlink('eyeBlinkRight', 'eyeOpenRight'),
  };
}

/** @deprecated use extractEyeOpennessFromBlendshapes for behavior logs (L0) */
export function extractEyeOpenness(
  blendshapes: Record<string, number> | undefined,
  leftEAR?: number | null,
  rightEAR?: number | null
): { left: number | null; right: number | null } {
  const fromBlink = (blinkKey: string, openKey: string, ear?: number | null): number | null => {
    if (blendshapes) {
      const blink = blendshapes[blinkKey];
      if (blink != null) return Number(clamp01(1 - blink).toFixed(3));
      const open = blendshapes[openKey];
      if (open != null) return Number(clamp01(open).toFixed(3));
    }
    if (ear != null && ear > 0) {
      return Number(clamp01((ear - 0.12) / 0.22).toFixed(3));
    }
    return null;
  };

  return {
    left: fromBlink('eyeBlinkLeft', 'eyeOpenLeft', leftEAR),
    right: fromBlink('eyeBlinkRight', 'eyeOpenRight', rightEAR),
  };
}
