import type { DistanceMethod, OcclusionMethod } from '@/lib/distance-occlusion';
import type { GazeSource, PerEyeGazeVectorSource } from '@/lib/behavior-log-gaze-policy';
import {
  L2CS_MODEL_FILE,
  L2CS_MODEL_VERSION,
} from '@/lib/engines/l2cs-constants';
import {
  OPENFACE_SERVER_MODEL,
  OPENFACE_SERVER_VERSION,
} from '@/lib/engines/openface-constants';
import {
  DLIB_DETECTOR_MODEL,
  DLIB_LANDMARK_MODEL,
} from '@/lib/engines/dlib-constants';
import {
  YOLO_FACE_MODEL_FILE,
  YOLO_FACE_MODEL_VERSION,
} from '@/lib/engines/yolo-constants';

export type ProvenanceLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'PIXEL' | 'NULL';

export interface FieldProvenance {
  engine: string;
  level: ProvenanceLevel;
  method?: string;
  modelFile?: string;
  staleMs?: number;
}

export interface YoloProvenanceEngine {
  modelFile: string;
  modelVersion: string;
  latencyMs: number | null;
  faceCount: number | null;
  isFresh: boolean;
  staleMs: number | null;
  primaryBoxNormalized: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  primaryConfidence: number | null;
}

export interface DlibProvenanceEngine {
  detectorModel: string;
  landmarkModel: string;
  latencyMs: number | null;
  isFresh: boolean;
  staleMs: number | null;
  detectionScore: number | null;
  landmarkQuality: number | null;
  detectionBoxNormalized: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export interface L2csProvenanceEngine {
  modelFile: string;
  modelVersion: string;
  latencyMs: number | null;
  isFresh: boolean;
  staleMs: number | null;
  source: 'l2cs-onnx' | 'iris-heuristic' | 'none';
  gazePitch: number | null;
  gazeYaw: number | null;
  confidence: number | null;
}

export interface OpenFaceProvenanceEngine {
  model: string;
  modelVersion: string;
  latencyMs: number | null;
  isFresh: boolean;
  staleMs: number | null;
  source: 'openface-server' | 'ui-passthrough' | 'none';
  detectionConfidence: number | null;
  actionUnits: Record<string, number> | null;
}

export interface FeatureProvenancePayload {
  _schema: 'feature-provenance-v2' | 'feature-provenance-v2-slim';
  fields: Record<string, FieldProvenance>;
  engines?: {
    yolo?: YoloProvenanceEngine;
    dlib?: DlibProvenanceEngine;
    l2cs?: L2csProvenanceEngine;
    openface?: OpenFaceProvenanceEngine;
    gaze?: {
      source: GazeSource;
      perEyeVectorSource: PerEyeGazeVectorSource;
    };
  };
}

export function buildBehaviorFeatureProvenance(input: {
  headPoseSource: 'facialTransformationMatrix' | 'landmarkGeometry' | 'none';
  yoloStaleMs: number | null;
  yoloDetected: boolean;
  yoloFresh: boolean;
  yoloLatencyMs: number | null;
  yoloFaceCount: number | null;
  yoloPrimaryConfidence: number | null;
  yoloPrimaryBoxNormalized: YoloProvenanceEngine['primaryBoxNormalized'];
  mediapipeBlendshapes: boolean;
  leftEarForOpenness?: boolean;
  rightEarForOpenness?: boolean;
  faceCountSource: 'yolo' | 'mediapipe' | 'fallback';
  dlibStaleMs: number | null;
  dlibDetected: boolean;
  dlibFresh: boolean;
  dlibLatencyMs: number | null;
  dlibDetectionScore: number | null;
  dlibLandmarkQuality: number | null;
  dlibDetectionBoxNormalized: DlibProvenanceEngine['detectionBoxNormalized'];
  l2csStaleMs: number | null;
  l2csFresh: boolean;
  l2csSource: L2csProvenanceEngine['source'];
  l2csLatencyMs: number | null;
  l2csGazePitch: number | null;
  l2csGazeYaw: number | null;
  l2csConfidence: number | null;
  openfaceStaleMs: number | null;
  openfaceFresh: boolean;
  openfaceSource: OpenFaceProvenanceEngine['source'];
  openfaceLatencyMs: number | null;
  openfaceDetectionConfidence: number | null;
  openfaceActionUnits: OpenFaceProvenanceEngine['actionUnits'];
  distanceMethod?: DistanceMethod;
  distanceReliable?: boolean;
  distanceInvalidReason?: string | null;
  occlusionMethod?: OcclusionMethod;
  occlusionReliable?: boolean;
  bboxSource?: 'yolo' | 'mediapipeLandmark' | 'none';
  faceConfidenceSource?: 'yolo' | 'mediapipe' | 'landmarkQuality' | 'none';
  gazeSource?: GazeSource;
  perEyeGazeVectorSource?: PerEyeGazeVectorSource;
}): FeatureProvenancePayload {
  const distanceLevel: ProvenanceLevel =
    input.distanceReliable === false || input.distanceInvalidReason
      ? 'NULL'
      : input.distanceMethod === 'yoloBboxPinhole' || input.distanceMethod === 'pinholeCalibrated'
        ? 'L1'
        : 'L2';

  const occlusionLevel: ProvenanceLevel =
    input.occlusionReliable === false
      ? 'NULL'
      : input.occlusionMethod === 'dlibQualityFusion' || input.occlusionMethod === 'landmarkQualityFusion'
        ? 'L1'
        : 'L2';
  const fields: Record<string, FieldProvenance> = {
    yoloConfidence: {
      engine: 'YOLOv8n-Face',
      level: input.yoloFresh ? 'L0' : 'NULL',
      method: 'onnxruntime-web',
      modelFile: YOLO_FACE_MODEL_FILE,
      ...(input.yoloStaleMs != null ? { staleMs: input.yoloStaleMs } : {}),
    },
    faceCount: {
      engine: input.faceCountSource === 'yolo' ? 'YOLOv8n-Face' : 'MediaPipe FaceLandmarker',
      level: input.faceCountSource === 'yolo' ? 'L0' : input.faceCountSource === 'mediapipe' ? 'L1' : 'L2',
      method: input.faceCountSource === 'yolo' ? 'faceBoxCount' : 'landmarkFaceCount',
    },
    mediapipeConfidence: {
      engine: 'MediaPipe FaceLandmarker',
      level: 'L1',
      method: 'blendshapeStability+landmarkQuality',
      modelFile: 'face_landmarker.task',
    },
    landmarkConfidence: {
      engine: 'MediaPipe FaceLandmarker',
      level: 'L1',
      method: 'landmarkGeometryQuality',
    },
    headYaw: {
      engine: 'MediaPipe FaceLandmarker',
      level: input.headPoseSource === 'facialTransformationMatrix' ? 'L1' : 'L2',
      method:
        input.headPoseSource === 'facialTransformationMatrix'
          ? 'facialTransformationMatrix'
          : 'landmarkGeometry',
    },
    headPitch: {
      engine: 'MediaPipe FaceLandmarker',
      level: input.headPoseSource === 'facialTransformationMatrix' ? 'L1' : 'L2',
      method:
        input.headPoseSource === 'facialTransformationMatrix'
          ? 'facialTransformationMatrix'
          : 'landmarkGeometry',
    },
    headRoll: {
      engine: 'MediaPipe FaceLandmarker',
      level: input.headPoseSource === 'facialTransformationMatrix' ? 'L1' : 'L2',
      method:
        input.headPoseSource === 'facialTransformationMatrix'
          ? 'facialTransformationMatrix'
          : 'interEyeAngle',
    },
    headPoseConfidence: {
      engine: 'MediaPipe FaceLandmarker',
      level: input.headPoseSource === 'facialTransformationMatrix' ? 'L1' : 'L2',
      method: 'rotationMatrixOrthogonality',
    },
    faceConfidence: {
      engine:
        input.faceConfidenceSource === 'yolo'
          ? 'YOLOv8n-Face'
          : input.faceConfidenceSource === 'mediapipe'
            ? 'MediaPipe FaceLandmarker'
            : input.faceConfidenceSource === 'landmarkQuality'
              ? 'MediaPipe FaceLandmarker'
              : 'none',
      level:
        input.faceConfidenceSource === 'yolo'
          ? 'L0'
          : input.faceConfidenceSource === 'mediapipe'
            ? 'L1'
            : input.faceConfidenceSource === 'landmarkQuality'
              ? 'L2'
              : 'NULL',
      method:
        input.faceConfidenceSource === 'yolo'
          ? 'primaryFaceBoxScore'
          : input.faceConfidenceSource === 'mediapipe'
            ? 'trackingQuality'
            : input.faceConfidenceSource === 'landmarkQuality'
              ? 'landmarkGeometryQuality'
              : 'noFace',
    },
    bboxX: {
      engine:
        input.bboxSource === 'yolo'
          ? 'YOLOv8n-Face'
          : input.bboxSource === 'mediapipeLandmark'
            ? 'MediaPipe FaceLandmarker'
            : 'none',
      level:
        input.bboxSource === 'yolo' ? 'L0' : input.bboxSource === 'mediapipeLandmark' ? 'L1' : 'NULL',
      method:
        input.bboxSource === 'yolo'
          ? 'primaryFaceBoxNormalized'
          : input.bboxSource === 'mediapipeLandmark'
            ? 'landmarkMinMaxNormalized'
            : 'noFace',
    },
    leftEyeOpenness: {
      engine: 'MediaPipe FaceLandmarker',
      level: input.mediapipeBlendshapes
        ? 'L0'
        : input.leftEarForOpenness
          ? 'L2'
          : 'NULL',
      method: input.mediapipeBlendshapes
        ? '1-eyeBlinkLeft'
        : input.leftEarForOpenness
          ? 'landmarkEAR-derivedOpenness'
          : 'none',
    },
    rightEyeOpenness: {
      engine: 'MediaPipe FaceLandmarker',
      level: input.mediapipeBlendshapes
        ? 'L0'
        : input.rightEarForOpenness
          ? 'L2'
          : 'NULL',
      method: input.mediapipeBlendshapes
        ? '1-eyeBlinkRight'
        : input.rightEarForOpenness
          ? 'landmarkEAR-derivedOpenness'
          : 'none',
    },
    leftEAR: { engine: 'derived', level: 'L2', method: 'mediaPipeLandmarkEAR' },
    rightEAR: { engine: 'derived', level: 'L2', method: 'mediaPipeLandmarkEAR' },
    actionUnitsJson: {
      engine: 'MediaPipe FaceLandmarker',
      level: input.mediapipeBlendshapes ? 'L0' : 'NULL',
      method: 'faceBlendshapes',
    },
    openfaceConfidence: {
      engine: 'OpenFace 3.0',
      level: input.openfaceFresh && input.openfaceSource === 'openface-server' ? 'L0' : 'NULL',
      method: 'retinaFaceDetectionScore',
      ...(input.openfaceFresh && input.openfaceSource === 'openface-server'
        ? { modelFile: OPENFACE_SERVER_MODEL }
        : {}),
      ...(input.openfaceStaleMs != null ? { staleMs: input.openfaceStaleMs } : {}),
    },
    scenario: { engine: 'proctoringRules', level: 'L3', method: 'behavior-rule-labeler' },
    phase: { engine: 'sessionProtocol', level: 'L3', method: 'experimentPhase' },
    validPhases: { engine: 'proctoringRules', level: 'L3', method: 'feature-validity-flags' },
    isValid: { engine: 'proctoringRules', level: 'L3', method: 'behavior-rule-labeler' },
    invalidReason: { engine: 'proctoringRules', level: 'L3', method: 'behavior-rule-labeler' },
    brightnessMean: { engine: 'pixelAnalysis', level: 'PIXEL', method: 'canvasCrop' },
    contrastScore: { engine: 'pixelAnalysis', level: 'PIXEL', method: 'canvasCrop' },
    sharpnessScore: { engine: 'pixelAnalysis', level: 'PIXEL', method: 'laplacianVarianceNormalized' },
    occlusionScore: {
      engine: 'MediaPipe FaceLandmarker',
      level: occlusionLevel,
      method: input.occlusionMethod ?? 'landmarkHeuristic',
    },
    faceDistanceCm: {
      engine: input.distanceMethod === 'yoloBboxPinhole' ? 'YOLOv8n-Face' : 'derived',
      level: distanceLevel,
      method: input.distanceMethod ?? 'pinholeEstimate',
    },
    gazeYaw: {
      engine:
        input.gazeSource === 'l2cs-onnx'
          ? 'L2CS-Net'
          : input.gazeSource === 'iris-landmark'
            ? 'MediaPipe FaceLandmarker'
            : 'none',
      level:
        input.gazeSource === 'l2cs-onnx'
          ? 'L0'
          : input.gazeSource === 'iris-landmark'
            ? 'L2'
            : 'NULL',
      method:
        input.gazeSource === 'l2cs-onnx'
          ? '90binSoftmaxExpectation'
          : input.gazeSource === 'iris-landmark'
            ? 'irisLandmarkFusion'
            : 'gazeInvalidOrUnavailable',
      ...(input.gazeSource === 'l2cs-onnx' ? { modelFile: L2CS_MODEL_FILE } : {}),
      ...(input.l2csStaleMs != null ? { staleMs: input.l2csStaleMs } : {}),
    },
    gazePitch: {
      engine:
        input.gazeSource === 'l2cs-onnx'
          ? 'L2CS-Net'
          : input.gazeSource === 'iris-landmark'
            ? 'MediaPipe FaceLandmarker'
            : 'none',
      level:
        input.gazeSource === 'l2cs-onnx'
          ? 'L0'
          : input.gazeSource === 'iris-landmark'
            ? 'L2'
            : 'NULL',
      method:
        input.gazeSource === 'l2cs-onnx'
          ? '90binSoftmaxExpectation'
          : input.gazeSource === 'iris-landmark'
            ? 'irisLandmarkFusion'
            : 'gazeInvalidOrUnavailable',
      ...(input.gazeSource === 'l2cs-onnx' ? { modelFile: L2CS_MODEL_FILE } : {}),
      ...(input.l2csStaleMs != null ? { staleMs: input.l2csStaleMs } : {}),
    },
    gazeConfidence: {
      engine:
        input.gazeSource === 'l2cs-onnx'
          ? 'L2CS-Net'
          : input.gazeSource === 'iris-landmark'
            ? 'MediaPipe FaceLandmarker'
            : 'none',
      level:
        input.gazeSource === 'l2cs-onnx'
          ? 'L0'
          : input.gazeSource === 'iris-landmark'
            ? 'L2'
            : 'NULL',
      method:
        input.gazeSource === 'l2cs-onnx'
          ? 'binHeadMaxSoftmax'
          : input.gazeSource === 'iris-landmark'
            ? 'irisLandmarkQuality'
            : 'gazeInvalidOrUnavailable',
      ...(input.gazeSource === 'l2cs-onnx' ? { modelFile: L2CS_MODEL_FILE } : {}),
      ...(input.l2csStaleMs != null ? { staleMs: input.l2csStaleMs } : {}),
    },
    gazeLeftX: {
      engine: 'MediaPipe FaceLandmarker',
      level: input.perEyeGazeVectorSource === 'iris-landmark' ? 'L2' : 'NULL',
      method: 'irisPupilOffsetVectorLeft',
    },
    gazeRightX: {
      engine: 'MediaPipe FaceLandmarker',
      level: input.perEyeGazeVectorSource === 'iris-landmark' ? 'L2' : 'NULL',
      method: 'irisPupilOffsetVectorRight',
    },
    dlibConfidence: {
      engine: 'face-api.js TinyFaceDetector',
      level: input.dlibFresh ? 'L0' : 'NULL',
      method: 'detection.score',
      modelFile: DLIB_DETECTOR_MODEL,
      ...(input.dlibStaleMs != null ? { staleMs: input.dlibStaleMs } : {}),
    },
  };

  return {
    _schema: 'feature-provenance-v2',
    fields,
    engines: {
      yolo: {
        modelFile: YOLO_FACE_MODEL_FILE,
        modelVersion: YOLO_FACE_MODEL_VERSION,
        latencyMs: input.yoloLatencyMs,
        faceCount: input.yoloFaceCount,
        isFresh: input.yoloFresh,
        staleMs: input.yoloStaleMs,
        primaryBoxNormalized: input.yoloPrimaryBoxNormalized,
        primaryConfidence: input.yoloPrimaryConfidence,
      },
      dlib: {
        detectorModel: DLIB_DETECTOR_MODEL,
        landmarkModel: DLIB_LANDMARK_MODEL,
        latencyMs: input.dlibLatencyMs,
        isFresh: input.dlibFresh,
        staleMs: input.dlibStaleMs,
        detectionScore: input.dlibDetectionScore,
        landmarkQuality: input.dlibLandmarkQuality,
        detectionBoxNormalized: input.dlibDetectionBoxNormalized,
      },
      l2cs: {
        modelFile: L2CS_MODEL_FILE,
        modelVersion: L2CS_MODEL_VERSION,
        latencyMs: input.l2csLatencyMs,
        isFresh: input.l2csFresh,
        staleMs: input.l2csStaleMs,
        source: input.l2csSource,
        gazePitch: input.l2csGazePitch,
        gazeYaw: input.l2csGazeYaw,
        confidence: input.l2csConfidence,
      },
      openface: {
        model: OPENFACE_SERVER_MODEL,
        modelVersion: OPENFACE_SERVER_VERSION,
        latencyMs: input.openfaceLatencyMs,
        isFresh: input.openfaceFresh,
        staleMs: input.openfaceStaleMs,
        source: input.openfaceSource,
        detectionConfidence: input.openfaceDetectionConfidence,
        actionUnits: input.openfaceActionUnits,
      },
      gaze: {
        source: input.gazeSource ?? 'none',
        perEyeVectorSource: input.perEyeGazeVectorSource ?? 'none',
      },
    },
  };
}

/** Slim provenance for high-volume exam logging — keeps key field levels + gaze source only. */
export function slimFeatureProvenance(
  full: FeatureProvenancePayload
): FeatureProvenancePayload {
  const pick = (name: string) =>
    full.fields[name] ? { [name]: full.fields[name] } : {};

  return {
    _schema: 'feature-provenance-v2-slim',
    fields: {
      ...pick('faceConfidence'),
      ...pick('headYaw'),
      ...pick('headPitch'),
      ...pick('gazeYaw'),
      ...pick('gazePitch'),
      ...pick('yoloConfidence'),
    },
    engines: full.engines?.gaze
      ? { gaze: full.engines.gaze }
      : undefined,
  };
}
