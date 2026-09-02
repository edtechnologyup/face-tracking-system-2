import { describe, expect, it } from 'vitest';
import {
  buildMultiEngineBenchmark,
  latencyToFps,
  benchmarkMetricToDbBase,
  toComparableDetectionScore,
  toInferenceLatencyMs,
  pickLatestSyncedSnapshotLogs,
} from '@/lib/engine-benchmark';

describe('buildMultiEngineBenchmark', () => {
  it('uses real wall-clock latency without synthetic adjustment', () => {
    const snapshot = buildMultiEngineBenchmark({
      mpLatencyMs: 12.4,
      mpIsDetected: true,
      mpConfidence: 0.88,
      mpLandmarksCount: 468,
      yolo: { isDetected: true, latencyMs: 45, confidence: 0.91, faceCount: 1 },
      dlib: { isDetected: true, latencyMs: 80, confidence: 0.85, landmarksCount: 68 },
      openface: {
        isDetected: true,
        confidence: 0.92,
        clientRoundTripMs: 320,
        serverLatencyMs: 180,
        resultTimestamp: 10_000,
        faceCount: 1,
        actionUnitCount: 14,
      },
      now: 10_500,
      snapshotSynced: true,
    });

    expect(snapshot.mediapipe.latencyMs).toBe(12.4);
    expect(snapshot.mediapipe.inferenceLatencyMs).toBe(12.4);
    expect(snapshot.mediapipe.comparableDetectionScore).toBe(0.88);
    expect(snapshot.mediapipe.fps).toBe(latencyToFps(12.4));
    expect(snapshot.mediapipe.latencyScope).toBe('browserInference');
    expect(snapshot.yolov8.faceCount).toBe(1);
    expect(snapshot.openface.inferenceLatencyMs).toBe(180);
    expect(snapshot.openface.latencyScope).toBe('serverInference');
    expect(snapshot.openface.faceCount).toBe(1);
    expect(snapshot.openface.landmarksCount).toBe(14);
    expect(snapshot.openface.resultAgeMs).toBe(0);
    expect(snapshot.snapshotSynced).toBe(true);
    expect(snapshot.enginesCaptured).toBe(4);
    expect(snapshot.snapshotId).toBeTruthy();
  });

  it('marks snapshot as not synced when OpenFace missing', () => {
    const snapshot = buildMultiEngineBenchmark({
      mpLatencyMs: 10,
      mpIsDetected: true,
      mpConfidence: 0.9,
      mpLandmarksCount: 468,
      yolo: { isDetected: true, latencyMs: 40, confidence: 0.9, faceCount: 1 },
      dlib: { isDetected: true, latencyMs: 70, confidence: 0.8, landmarksCount: 68 },
      openface: null,
      snapshotSynced: true,
    });

    expect(snapshot.snapshotSynced).toBe(false);
    expect(snapshot.enginesCaptured).toBe(3);
  });

  it('links all engines with same snapshotId in DB mapping', () => {
    const snapshot = buildMultiEngineBenchmark({
      mpLatencyMs: 10,
      mpIsDetected: true,
      mpConfidence: 0.9,
      mpLandmarksCount: 468,
      yolo: null,
      dlib: null,
      openface: null,
    });

    const mpDb = benchmarkMetricToDbBase(snapshot.mediapipe, snapshot.snapshotId, false);
    expect(mpDb.benchmarkSnapshotId).toBe(snapshot.snapshotId);
    expect(mpDb.snapshotSynced).toBe(false);
    expect(mpDb.confidenceKind).toBe('trackingQuality');
  });

  it('normalizes comparable helpers', () => {
    expect(toComparableDetectionScore(false, 0.9)).toBe(0);
    expect(toComparableDetectionScore(true, 0.912)).toBe(0.912);
    expect(toInferenceLatencyMs('openface', 300, 120)).toBe(120);
    expect(toInferenceLatencyMs('yolov8', 45, null)).toBe(45);
  });

  it('picks latest synced snapshot group', () => {
    const rows = pickLatestSyncedSnapshotLogs([
      { benchmarkSnapshotId: 'a', snapshotSynced: true, measuredAt: '2026-01-01T00:00:00Z' },
      { benchmarkSnapshotId: 'b', snapshotSynced: true, measuredAt: '2026-01-02T00:00:00Z' },
      { benchmarkSnapshotId: 'b', snapshotSynced: true, measuredAt: '2026-01-02T00:00:01Z' },
      { benchmarkSnapshotId: 'c', snapshotSynced: false, measuredAt: '2026-01-03T00:00:00Z' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.benchmarkSnapshotId === 'b')).toBe(true);
  });
});
