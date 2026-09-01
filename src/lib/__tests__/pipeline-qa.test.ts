import { describe, expect, it } from 'vitest';
import {
  createMinimalValidLog,
  CURRENT_FEATURE_SCHEMA_VERSION,
  validateBehaviorCsv,
  validateBehaviorLogEntry,
  validateBehaviorLogEntryFull,
  validateFeatureProvenance,
} from '@/lib/pipeline-qa';
import { buildBehaviorFeatureProvenance } from '@/lib/feature-provenance';

describe('validateBehaviorLogEntry', () => {
  it('accepts a minimal valid log', () => {
    const report = validateBehaviorLogEntry(createMinimalValidLog());
    expect(report.valid).toBe(true);
    expect(report.summary.errorCount).toBe(0);
  });

  it('flags unknown scenario as error', () => {
    const report = validateBehaviorLogEntry(
      createMinimalValidLog({ scenario: 'NOT_A_REAL_SCENARIO' })
    );
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.field === 'scenario')).toBe(true);
  });

  it('warns when face missing but scenario is not FACE_MISSING', () => {
    const report = validateBehaviorLogEntry(
      createMinimalValidLog({ faceDetected: false, scenario: 'CENTER_SCREEN' })
    );
    expect(report.issues.some((i) => i.message.includes('FACE_MISSING'))).toBe(true);
  });

  it('flags unknown experiment phase as error', () => {
    const report = validateBehaviorLogEntry(
      createMinimalValidLog({ phase: 'NOT_A_PHASE' })
    );
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.field === 'phase')).toBe(true);
  });

  it('flags unknown validPhase as error', () => {
    const report = validateBehaviorLogEntry(
      createMinimalValidLog({ validPhases: ['faceValid', 'bogusPhase'] })
    );
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.field === 'validPhases')).toBe(true);
  });

  it('errors when face missing but head features are still populated', () => {
    const report = validateBehaviorLogEntry(
      createMinimalValidLog({ faceDetected: false, scenario: 'FACE_MISSING', headYaw: 10 })
    );
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.field === 'faceDetected')).toBe(true);
  });

  it('errors when gazeValid set but gaze angles are null', () => {
    const report = validateBehaviorLogEntry(
      createMinimalValidLog({
        validPhases: ['faceValid', 'headValid', 'gazeValid'],
        gazeYaw: null,
        gazePitch: null,
      })
    );
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.field === 'gazeYaw')).toBe(true);
  });

  it('errors when gaze columns populated without gazeValid flag', () => {
    const report = validateBehaviorLogEntry(
      createMinimalValidLog({
        validPhases: ['faceValid', 'headValid'],
        gazeYaw: 12,
        gazePitch: 3,
      })
    );
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.message.includes('gazeValid absent'))).toBe(true);
  });

  it('errors when duplicated per-eye gaze vectors', () => {
    const report = validateBehaviorLogEntry(
      createMinimalValidLog({
        validPhases: ['faceValid', 'headValid', 'gazeValid'],
        gazeYaw: 5,
        gazePitch: 1,
        gazeLeftX: 0.1,
        gazeLeftY: 0.2,
        gazeLeftZ: -0.9,
        gazeRightX: 0.1,
        gazeRightY: 0.2,
        gazeRightZ: -0.9,
      })
    );
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.field === 'gazeLeftX')).toBe(true);
  });

  it('warns on deprecated blurScore column', () => {
    const report = validateBehaviorLogEntry(
      createMinimalValidLog({ blurScore: 0.8, sharpnessScore: undefined })
    );
    expect(report.issues.some((i) => i.field === 'blurScore')).toBe(true);
  });

  it('errors when isValid=true but invalidReason is set', () => {
    const report = validateBehaviorLogEntry(
      createMinimalValidLog({ isValid: true, invalidReason: 'LOW_BRIGHTNESS' })
    );
    expect(report.valid).toBe(false);
  });
});

describe('validateFeatureProvenance', () => {
  it('validates provenance from buildBehaviorFeatureProvenance', () => {
    const provenance = buildBehaviorFeatureProvenance({
      headPoseSource: 'facialTransformationMatrix',
      yoloStaleMs: 100,
      yoloDetected: true,
      yoloFresh: true,
      yoloLatencyMs: 40,
      yoloFaceCount: 1,
      yoloPrimaryConfidence: 0.9,
      yoloPrimaryBoxNormalized: { x: 0.2, y: 0.2, width: 0.3, height: 0.4 },
      mediapipeBlendshapes: true,
      faceCountSource: 'yolo',
      dlibStaleMs: null,
      dlibDetected: false,
      dlibFresh: false,
      dlibLatencyMs: null,
      dlibDetectionScore: null,
      dlibLandmarkQuality: null,
      dlibDetectionBoxNormalized: null,
      l2csStaleMs: null,
      l2csFresh: false,
      l2csSource: 'none',
      l2csLatencyMs: null,
      l2csGazePitch: null,
      l2csGazeYaw: null,
      l2csConfidence: null,
      openfaceStaleMs: null,
      openfaceFresh: false,
      openfaceSource: 'none',
      openfaceLatencyMs: null,
      openfaceDetectionConfidence: null,
      openfaceActionUnits: null,
      distanceMethod: 'pinholeDefault',
      distanceReliable: true,
      occlusionMethod: 'landmarkHeuristic',
      occlusionReliable: true,
    });

    const report = validateFeatureProvenance(provenance);
    expect(report.valid).toBe(true);
    expect(provenance._schema).toBe('feature-provenance-v2');
  });

  it('flags openface offline as none source with null confidence in full validation', () => {
    const log = createMinimalValidLog({
      openfaceConfidence: null,
      featureProvenance: {
        _schema: 'feature-provenance-v2',
        fields: {
          openfaceConfidence: { engine: 'OpenFace 3.0', level: 'NULL', method: 'retinaFaceDetectionScore' },
        },
        engines: { openface: { source: 'none', detectionConfidence: null } },
      },
    });

    const report = validateBehaviorLogEntryFull(log);
    expect(report.valid).toBe(true);
    expect(log.openfaceConfidence).toBeNull();
  });
});

describe('validateBehaviorCsv', () => {
  it('parses and validates CSV export', () => {
    const csv = [
      'scenario,faceDetected,faceCount,headYaw,brightnessMean,occlusionScore,isValid,invalidReason,featureSchemaVersion',
      `CENTER_SCREEN,true,1,0,0.5,0.1,true,,${CURRENT_FEATURE_SCHEMA_VERSION}`,
      'MULTIPLE_FACES,true,2,0,0.5,0.1,false,MULTIPLE_FACES_DETECTED,2.5',
    ].join('\n');

    const report = validateBehaviorCsv(csv);
    expect(report.entryCount).toBe(2);
    expect(report.headers.length).toBe(9);
  });
});
