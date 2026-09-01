/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react'
import { analyzeImageQuality } from '@/lib/image-quality'
import { estimateFaceDistance, estimateOcclusion } from '@/lib/distance-occlusion'
import {
  labelBehaviorFromFeatures,
  type AttentionState,
} from '@/lib/behavior-rule-labeler'
import { type NaturalReadingState } from '@/lib/natural-reading-detector'
import { extractEyeOpennessFromBlendshapes } from '@/lib/blendshape-action-units'
import { buildBehaviorFeatureProvenance } from '@/lib/feature-provenance'
import {
  CURRENT_FEATURE_SCHEMA_VERSION,
  CURRENT_PIPELINE_VERSION,
} from '@/lib/pipeline-qa'
import {
  type ExperimentPhase,
  resolveExperimentPhase,
  DEFAULT_EXPERIMENT_PHASE,
} from '@/lib/experiment-phase'
import {
  isYoloResultFresh,
  normalizeYoloBox,
  YOLO_LOG_MAX_STALE_MS,
} from '@/lib/engines/yolo-constants'
import {
  isDlibResultFresh,
  normalizeDlibBox,
  DLIB_LOG_MAX_STALE_MS,
} from '@/lib/engines/dlib-constants'
import {
  isL2csResultFresh,
  L2CS_LOG_MAX_STALE_MS,
} from '@/lib/engines/l2cs-constants'
import {
  isOpenFaceResultFresh,
  OPENFACE_LOG_MAX_STALE_MS,
} from '@/lib/engines/openface-constants'

import { HEAD_ROLL_DISTANCE_INVALID_DEG } from '@/lib/distance-occlusion';
import {
  applyNoFaceNullPolicy,
  applyNormalizedBbox,
  resolveFaceConfidence,
  resolveFaceDetected,
  resolveLogBbox,
} from '@/lib/behavior-log-face-policy';
import {
  applyGazeFields,
  applyGazeInvalidNullPolicy,
  hasGazeValidPhase,
  resolveGazeLogFields,
} from '@/lib/behavior-log-gaze-policy';

const HEAD_ROLL_SMOOTH_WINDOW = 5;
// Capacity tuning for ~80 concurrent users: 2Hz sampling, batch flush every 4s
const SAMPLE_INTERVAL_MS = 500;
const SAMPLE_RATE_HZ = Math.round(1000 / SAMPLE_INTERVAL_MS);
const SYNC_BATCH_SIZE = 8;
const RETRY_BUFFER_MAX = 300;

function calcMediaPipeEAR(lms: any[], p1: number, p2: number, p3: number, p4: number, p5: number, p6: number): number | null {
  if (!lms[p1] || !lms[p6]) return null;
  const v1 = Math.hypot(lms[p2].x - lms[p6].x, lms[p2].y - lms[p6].y);
  const v2 = Math.hypot(lms[p3].x - lms[p5].x, lms[p3].y - lms[p5].y);
  const h = Math.hypot(lms[p1].x - lms[p4].x, lms[p1].y - lms[p4].y);
  return (v1 + v2) / (2.0 * h);
}

function buildLogFingerprint(entry: {
  scenario: string;
  headYaw: number | null;
  headPitch: number | null;
  headRoll: number | null;
  faceCenterX: number | null;
  faceCenterY: number | null;
  faceDetected: boolean;
}): string {
  return [
    entry.scenario,
    entry.faceDetected,
    entry.headYaw?.toFixed(1) ?? 'n',
    entry.headPitch?.toFixed(1) ?? 'n',
    entry.headRoll?.toFixed(1) ?? 'n',
    entry.faceCenterX?.toFixed(3) ?? 'n',
    entry.faceCenterY?.toFixed(3) ?? 'n',
  ].join('|');
}

export interface BehaviorFeatureSyncProps {
  participantCode?: string;
  /** ช่วงการทดลอง — default NATURAL_TASK; warmup ใช้ SYSTEM_STABILIZATION อัตโนมัติ */
  experimentPhase?: ExperimentPhase;
  isActive: boolean
  sessionId: string | null
  mediaPipeData: any
  yoloData: any
  dlibData: any
  openFaceData: any
  l2csGazeData: any
}

export function BehaviorFeatureSync({
  isActive,
  sessionId,
  mediaPipeData,
  yoloData,
  dlibData,
  openFaceData,
  l2csGazeData,
  participantCode,
  experimentPhase = DEFAULT_EXPERIMENT_PHASE,
}: BehaviorFeatureSyncProps) {
  const logBufferRef = useRef<any[]>([])
  const sampleIndexRef = useRef<number>(0)
  const sessionStartTimeRef = useRef<number>(Date.now())
  const lastSampleTimeRef = useRef<number>(Date.now())
  const lastLogFingerprintRef = useRef<string | null>(null)
  const headRollHistoryRef = useRef<number[]>([])

  const lastQualityCheckRef = useRef<number>(0);
  const qualityReadyRef = useRef<boolean>(false);
  const latestQualityRef = useRef({ brightnessMean: 0.5, contrastScore: 0.5, sharpnessScore: 0 });
  const detectionFrameCountRef = useRef<number>(0);
  const fpsWindowStartRef = useRef<number>(Date.now());
  const currentFpsRef = useRef<number>(0);
  
  // Throttle timer variables


  const attentionStateRef = useRef<AttentionState>({
    direction: 'CENTER',
    startTime: Date.now()
  });
  const naturalReadingRef = useRef<NaturalReadingState>({ startTime: null, yawSamples: [] });

  // Reset session-scoped refs when tracking session changes
  useEffect(() => {
    if (!sessionId) return
    sessionStartTimeRef.current = Date.now()
    sampleIndexRef.current = 0
    lastLogFingerprintRef.current = null
    headRollHistoryRef.current = []
    naturalReadingRef.current = { startTime: null, yawSamples: [] }
    qualityReadyRef.current = false
    lastQualityCheckRef.current = 0
  }, [sessionId])

  // Count detection-loop frames (~10 Hz) separately from 2 Hz sampling
  useEffect(() => {
    if (!isActive || !mediaPipeData) return

    detectionFrameCountRef.current++
    const now = Date.now()
    if (now - fpsWindowStartRef.current >= 1000) {
      currentFpsRef.current = detectionFrameCountRef.current
      detectionFrameCountRef.current = 0
      fpsWindowStartRef.current = now
    }
  }, [isActive, mediaPipeData])

  // Sample data at 2Hz (every 500ms) — doubled vs 1Hz while staying within 80-user DB budget
  useEffect(() => {
    if (!isActive || !sessionId) return

    const now = Date.now()
    if (now - lastSampleTimeRef.current < SAMPLE_INTERVAL_MS) return
    lastSampleTimeRef.current = now

    const videoEl = document.querySelector('video') as HTMLVideoElement | null
    const vw = videoEl?.videoWidth || 640
    const vh = videoEl?.videoHeight || 480

    // Quality check (throttled to every 2 seconds for performance)
    if (now - lastQualityCheckRef.current >= 2000) {
      lastQualityCheckRef.current = now;
      let bbox = null;
      if (mediaPipeData?.landmarks && videoEl) {
        const xs = mediaPipeData.landmarks.map((l: any) => l.x * videoEl.videoWidth);
        const ys = mediaPipeData.landmarks.map((l: any) => l.y * videoEl.videoHeight);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        bbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }
      if (videoEl) {
         setTimeout(() => {
           latestQualityRef.current = analyzeImageQuality(videoEl, bbox);
           qualityReadyRef.current = true;
         }, 0);
      }
    }

    if (!qualityReadyRef.current) return

    const yoloFresh =
      !!yoloData?.isDetected &&
      yoloData.confidence != null &&
      isYoloResultFresh(yoloData.timestamp, now, YOLO_LOG_MAX_STALE_MS);

    let yoloPrimaryBoxNormalized = null as ReturnType<typeof normalizeYoloBox> | null;
    if (yoloFresh && yoloData?.primaryBox) {
      yoloPrimaryBoxNormalized = normalizeYoloBox(yoloData.primaryBox, vw, vh);
    }

    const lms = mediaPipeData?.landmarks;
    const landmarkCount = lms?.length ?? 0;
    const faceDetected = resolveFaceDetected(
      yoloFresh,
      !!mediaPipeData?.isDetected,
      landmarkCount
    );
    const hasFace = faceDetected;

    const dlibFresh =
      !!dlibData?.isDetected &&
      dlibData.detectionScore != null &&
      isDlibResultFresh(dlibData.timestamp, now, DLIB_LOG_MAX_STALE_MS);

    const occlusionEstimate = estimateOcclusion({
      landmarks: mediaPipeData?.landmarks,
      dlibLandmarkQuality: dlibData?.landmarkQuality ?? null,
      dlibFresh,
    });
    const currentOcclusionScore = occlusionEstimate.score;

    const distanceEstimate = estimateFaceDistance({
      landmarks: mediaPipeData?.landmarks,
      headRoll: mediaPipeData?.headRoll ?? null,
      yoloBboxNormalized: yoloPrimaryBoxNormalized,
      yoloFresh,
      videoWidthPx: vw,
      videoHeightPx: vh,
    });

    const mpFaceCount = mediaPipeData?.multipleFaces?.count ?? (mediaPipeData?.isDetected ? 1 : 0);
    const yoloFaceCount = yoloFresh ? (yoloData?.faceCount ?? 0) : null;
    const faceCountSource: 'yolo' | 'mediapipe' | 'fallback' = yoloFresh
      ? 'yolo'
      : mpFaceCount > 0
        ? 'mediapipe'
        : 'fallback';
    const faceCount = faceDetected
      ? yoloFresh
        ? (yoloData?.faceCount ?? 0)
        : mpFaceCount || 1
      : 0;

    const yaw = faceDetected ? (mediaPipeData?.orientation?.yaw || 0) : 0;
    const pitch = faceDetected ? (mediaPipeData?.orientation?.pitch || 0) : 0;
    const irisGaze = faceDetected ? mediaPipeData?.gaze : undefined;
    const l2csOnnxFresh =
      l2csGazeData?.source === 'l2cs-onnx' &&
      isL2csResultFresh(l2csGazeData.timestamp, now, L2CS_LOG_MAX_STALE_MS);
    const hasGaze = faceDetected && (l2csOnnxFresh || !!irisGaze);

    const leftEAR =
      faceDetected && lms?.length
        ? calcMediaPipeEAR(lms, 33, 160, 158, 133, 153, 144)
        : null;
    const rightEAR =
      faceDetected && lms?.length
        ? calcMediaPipeEAR(lms, 362, 385, 387, 263, 373, 380)
        : null;

    const actionUnits = faceDetected ? (mediaPipeData?.actionUnits ?? null) : null;
    const eyeOpenness =
      faceDetected && lms?.length
        ? extractEyeOpennessFromBlendshapes(actionUnits?.blendshapes)
        : { left: null, right: null };

    let headRollForRules = faceDetected ? (mediaPipeData?.headRoll ?? null) : null;
    if (headRollForRules === null && faceDetected && lms?.length && lms[33] && lms[362]) {
      const dx = lms[362].x - lms[33].x;
      const dy = lms[362].y - lms[33].y;
      headRollForRules = Number((Math.atan2(dy, dx) * (180 / Math.PI)).toFixed(1));
    }

    const ruleResult = labelBehaviorFromFeatures({
      now,
      hasFace,
      faceCount,
      yaw,
      pitch,
      occlusionScore: currentOcclusionScore,
      brightnessMean: latestQualityRef.current.brightnessMean,
      faceDistanceCm: distanceEstimate.reliable ? distanceEstimate.estimatedCm : null,
      isTooFar: distanceEstimate.isTooFar,
      leftEAR,
      rightEAR,
      leftEyeOpenness: eyeOpenness.left,
      rightEyeOpenness: eyeOpenness.right,
      headRoll: headRollForRules,
      headPitch: mediaPipeData?.orientation?.pitch ?? null,
      qualityReady: qualityReadyRef.current,
      hasGaze,
      landmarkCount: lms?.length ?? 0,
      attentionState: attentionStateRef.current,
      naturalReadingState: naturalReadingRef.current,
    });
    attentionStateRef.current = ruleResult.attentionState;
    naturalReadingRef.current = ruleResult.naturalReadingState;

    const computedScenario = ruleResult.scenario;
    const computedValidPhases = [...ruleResult.validPhases];
    const resolvedExperimentPhase = resolveExperimentPhase(
      qualityReadyRef.current,
      experimentPhase
    );
    const isValid = ruleResult.isValid;
    const invalidReason = ruleResult.invalidReason;

    const mpConfidence = mediaPipeData?.confidence ?? null;
    const landmarkConf = mediaPipeData?.landmarkConfidence ?? mpConfidence;
    const yoloConf = yoloFresh ? yoloData.confidence : null;
    const yoloStaleMs = yoloData?.timestamp != null ? now - yoloData.timestamp : null;
    const faceConfidenceResult = resolveFaceConfidence(yoloConf, mpConfidence, landmarkConf);
    const bboxResult = resolveLogBbox(yoloFresh, yoloPrimaryBoxNormalized, lms);
    const dlibConf = dlibFresh ? dlibData.detectionScore : null;
    const dlibStaleMs = dlibData?.timestamp != null ? now - dlibData.timestamp : null;
    const l2csStaleMs = l2csGazeData?.timestamp != null ? now - l2csGazeData.timestamp : null;
    const l2csSource = l2csGazeData?.source ?? 'none';
    const openfaceFresh =
      openFaceData?.source === 'openface-server' &&
      openFaceData.confidence != null &&
      isOpenFaceResultFresh(openFaceData.timestamp, now, OPENFACE_LOG_MAX_STALE_MS);
    const openfaceStaleMs = openFaceData?.timestamp != null ? now - openFaceData.timestamp : null;
    const openfaceSource = openFaceData?.source ?? 'none';
    const openfaceConf = openfaceFresh ? openFaceData.confidence : null;

    const gazeFields = faceDetected
      ? resolveGazeLogFields({
          l2csFresh: l2csOnnxFresh,
          l2csGaze: l2csOnnxFresh
            ? {
                gazeYaw: l2csGazeData.gazeYaw,
                gazePitch: l2csGazeData.gazePitch,
                confidence: l2csGazeData.confidence,
              }
            : null,
          irisGaze: irisGaze ?? null,
        })
      : resolveGazeLogFields({ l2csFresh: false, irisGaze: null });

    let dlibDetectionBoxNormalized = null as ReturnType<typeof normalizeDlibBox> | null;
    if (dlibFresh && dlibData?.detectionBox) {
      dlibDetectionBoxNormalized = normalizeDlibBox(dlibData.detectionBox, vw, vh);
    }

    const headPoseSource = mediaPipeData?.orientationSource ?? 'landmarkGeometry';

    // Build a log entry
    const logEntry: any = {
      participantCode: participantCode || null,
      featureSchemaVersion: CURRENT_FEATURE_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      elapsedMs: now - sessionStartTimeRef.current,
      sampleIndex: sampleIndexRef.current,
      scenario: computedScenario,
      phase: resolvedExperimentPhase,
      validPhases: computedValidPhases,
      
      faceDetected,
      faceCount: faceDetected ? faceCount : null,
      faceConfidence: faceDetected ? faceConfidenceResult.value : null,
      
      bboxX: null,
      bboxY: null,
      bboxWidth: null,
      bboxHeight: null,
      faceCenterX: null,
      faceCenterY: null,
      faceDistanceCm:
        faceDetected && distanceEstimate.reliable ? distanceEstimate.estimatedCm : null,
      
      headYaw: faceDetected ? (mediaPipeData?.orientation?.yaw ?? null) : null,
      headPitch: faceDetected ? (mediaPipeData?.orientation?.pitch ?? null) : null,
      headRoll: faceDetected ? (mediaPipeData?.headRoll ?? null) : null,
      headPoseConfidence: faceDetected ? (mediaPipeData?.headPoseConfidence ?? null) : null,
      
      gazeYaw: null,
      gazePitch: null,
      gazeLeftX: null,
      gazeLeftY: null,
      gazeLeftZ: null,
      gazeRightX: null,
      gazeRightY: null,
      gazeRightZ: null,
      gazeConfidence: null,
      
      leftEAR,
      rightEAR,
      leftEyeOpenness: eyeOpenness.left,
      rightEyeOpenness: eyeOpenness.right,
      actionUnitsJson: actionUnits,
      
      yoloConfidence: faceDetected ? yoloConf : null,
      mediapipeConfidence: faceDetected ? mpConfidence : null,
      dlibConfidence: faceDetected ? dlibConf : null,
      openfaceConfidence: faceDetected ? openfaceConf : null,
      
      brightnessMean: latestQualityRef.current.brightnessMean,
      contrastScore: latestQualityRef.current.contrastScore,
      sharpnessScore: latestQualityRef.current.sharpnessScore,
      occlusionScore: faceDetected ? currentOcclusionScore : null,
      
      landmarkCount:
        faceDetected && lms
          ? lms.length >= 468
            ? 468
            : lms.length
          : null,
      landmarkConfidence: faceDetected ? landmarkConf : null,
      cameraWidth: null,
      cameraHeight: null,
      detectionFps: null,
      cameraStreamFps: null,
      sampleRateHz: SAMPLE_RATE_HZ,
      isValid,
      invalidReason,
      pipelineVersion: CURRENT_PIPELINE_VERSION,
      featureProvenance: buildBehaviorFeatureProvenance({
        headPoseSource,
        yoloStaleMs,
        yoloDetected: !!yoloData?.isDetected,
        yoloFresh,
        yoloLatencyMs: yoloData?.latencyMs ?? null,
        yoloFaceCount,
        yoloPrimaryConfidence: yoloConf,
        yoloPrimaryBoxNormalized,
        mediapipeBlendshapes: !!actionUnits?.blendshapes,
        faceCountSource,
        dlibStaleMs,
        dlibDetected: !!dlibData?.isDetected,
        dlibFresh,
        dlibLatencyMs: dlibData?.latencyMs ?? null,
        dlibDetectionScore: dlibConf,
        dlibLandmarkQuality: dlibData?.landmarkQuality ?? null,
        dlibDetectionBoxNormalized,
        l2csStaleMs,
        l2csFresh: l2csOnnxFresh,
        l2csSource,
        l2csLatencyMs: l2csGazeData?.latencyMs ?? null,
        l2csGazePitch: l2csOnnxFresh ? l2csGazeData.gazePitch : null,
        l2csGazeYaw: l2csOnnxFresh ? l2csGazeData.gazeYaw : null,
        l2csConfidence: l2csOnnxFresh ? l2csGazeData.confidence : null,
        openfaceStaleMs,
        openfaceFresh,
        openfaceSource,
        openfaceLatencyMs: openFaceData?.serverLatencyMs ?? openFaceData?.latencyMs ?? null,
        openfaceDetectionConfidence: openfaceConf,
        openfaceActionUnits:
          openfaceFresh && openFaceData?.actionUnits
            ? (openFaceData.actionUnits as Record<string, number>)
            : null,
        distanceMethod: distanceEstimate.method,
        distanceReliable: distanceEstimate.reliable,
        distanceInvalidReason: distanceEstimate.invalidReason ?? null,
        occlusionMethod: occlusionEstimate.method,
        occlusionReliable: occlusionEstimate.reliable,
        bboxSource: bboxResult.source,
        faceConfidenceSource: faceConfidenceResult.source,
        gazeSource: gazeFields.gazeSource,
        perEyeGazeVectorSource: gazeFields.perEyeGazeVectorSource,
      }),
    }

    if (faceDetected) {
      if (hasGazeValidPhase(computedValidPhases)) {
        applyGazeFields(logEntry, gazeFields);
      } else {
        applyGazeInvalidNullPolicy(logEntry);
      }

      if (bboxResult.bbox) {
        applyNormalizedBbox(logEntry, bboxResult.bbox);
      }

      if (lms?.length && logEntry.headRoll === null && lms[33] && lms[362]) {
        const dx = lms[362].x - lms[33].x;
        const dy = lms[362].y - lms[33].y;
        const rawRoll = Math.atan2(dy, dx) * (180 / Math.PI);
        headRollHistoryRef.current.push(rawRoll);
        if (headRollHistoryRef.current.length > HEAD_ROLL_SMOOTH_WINDOW) {
          headRollHistoryRef.current.shift();
        }
        const smoothedRoll = headRollHistoryRef.current.reduce((sum, v) => sum + v, 0)
          / headRollHistoryRef.current.length;
        logEntry.headRoll = Number(smoothedRoll.toFixed(1));
      }

      if (logEntry.headRoll !== null && Math.abs(logEntry.headRoll) > HEAD_ROLL_DISTANCE_INVALID_DEG) {
        logEntry.faceDistanceCm = null;
      }
    } else {
      applyNoFaceNullPolicy(logEntry);
    }
    
    try {
      if (videoEl && videoEl.videoWidth) {
        logEntry.cameraWidth = videoEl.videoWidth;
        logEntry.cameraHeight = videoEl.videoHeight;
      } else {
        logEntry.cameraWidth = window.innerWidth;
        logEntry.cameraHeight = window.innerHeight;
      }
      const track = videoEl?.srcObject instanceof MediaStream
        ? videoEl.srcObject.getVideoTracks()[0]
        : undefined;
      const streamFps = track?.getSettings()?.frameRate;
      logEntry.detectionFps =
        currentFpsRef.current > 0 ? Math.round(currentFpsRef.current) : null;
      logEntry.cameraStreamFps =
        streamFps != null && Number.isFinite(streamFps) ? Math.round(streamFps) : null;
      logEntry.sampleRateHz = SAMPLE_RATE_HZ;
    } catch {}

    const fingerprint = buildLogFingerprint(logEntry);
    if (fingerprint === lastLogFingerprintRef.current) return;
    lastLogFingerprintRef.current = fingerprint;
    logEntry.sampleIndex = sampleIndexRef.current++;

    logBufferRef.current.push(logEntry)

    // Auto-sync every SYNC_BATCH_SIZE samples (~4 seconds at 2Hz)
    if (logBufferRef.current.length >= SYNC_BATCH_SIZE) {
      const logsToSend = [...logBufferRef.current]
      logBufferRef.current = [] // reset buffer
      
      // Send to API in background
      fetch('/api/tracking/behavior-features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          logs: logsToSend
        })
      }).catch(err => {
        console.error('Failed to sync behavior features:', err)
        // Re-queue failed logs back to buffer for retry
        logBufferRef.current = [...logsToSend, ...logBufferRef.current].slice(0, RETRY_BUFFER_MAX)
      })
    }
  }, [isActive, sessionId, mediaPipeData, yoloData, dlibData, openFaceData, l2csGazeData, participantCode, experimentPhase])

  // Sync on unmount or stop
  useEffect(() => {
    return () => {
      if (logBufferRef.current.length > 0 && sessionId) {
        const logsToSend = [...logBufferRef.current]
        logBufferRef.current = []
        
        fetch('/api/tracking/behavior-features', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true, // Ensure it sends even if page closes
          body: JSON.stringify({
            sessionId,
            logs: logsToSend
          })
        }).catch(err => console.error('Final sync failed:', err))
      }
    }
  }, [sessionId])

  return null // This is a logic-only component
}
