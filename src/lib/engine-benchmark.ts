/** Comparable engine benchmark metrics — synced same-frame capture for fair cross-model comparison */

export type ConfidenceKind =
  | 'trackingQuality'
  | 'faceBoxScore'
  | 'detectorScore'
  | 'retinaFaceScore';

export type LatencyScope = 'browserInference' | 'networkRoundTrip' | 'serverInference';

export interface EngineBenchmarkMetric {
  name: string;
  isDetected: boolean;
  fps: number | null;
  latencyMs: number | null;
  latencyScope: LatencyScope;
  /** Model compute time comparable across engines (browser infer or OpenFace server infer) */
  inferenceLatencyMs: number | null;
  /** Unified 0–1 face detection score (0 when not detected) */
  comparableDetectionScore: number | null;
  /** True when this row belongs to a same-frame synced snapshot */
  frameSynced: boolean;
  landmarksCount: number | null;
  faceCount: number | null;
  memoryMb: number | null;
  cpuLoadPct: number | null;
  confidence: number | null;
  confidenceKind: ConfidenceKind;
  measuredAt: string;
  serverLatencyMs?: number | null;
  resultAgeMs?: number | null;
}

export interface MultiEngineBenchmarkPayload {
  snapshotId: string;
  capturedAt: string;
  browserHeapMb: number | null;
  /** All 4 engines ran on the same captured frame */
  snapshotSynced: boolean;
  enginesCaptured: number;
  mediapipe: EngineBenchmarkMetric;
  yolov8: EngineBenchmarkMetric;
  dlib: EngineBenchmarkMetric;
  openface: EngineBenchmarkMetric;
}

export function createBenchmarkSnapshotId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `bm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readBrowserHeapMb(): number | null {
  if (typeof performance === 'undefined') return null;
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
  const bytes = perf.memory?.usedJSHeapSize;
  if (bytes == null || bytes <= 0) return null;
  return Number((bytes / (1024 * 1024)).toFixed(1));
}

export function latencyToFps(latencyMs: number | null | undefined): number | null {
  if (latencyMs == null || latencyMs <= 0) return null;
  return Number((1000 / latencyMs).toFixed(1));
}

/** Unified detection score for cross-engine comparison (0 when not detected). */
export function toComparableDetectionScore(
  isDetected: boolean,
  confidence: number | null | undefined
): number | null {
  if (!isDetected) return 0;
  if (confidence == null) return null;
  return Number(Math.min(1, Math.max(0, confidence)).toFixed(3));
}

/** Inference latency comparable across engines (OpenFace uses server-side ms). */
export function toInferenceLatencyMs(
  engine: 'mediapipe' | 'yolov8' | 'dlib' | 'openface',
  browserLatencyMs: number | null | undefined,
  serverLatencyMs: number | null | undefined
): number | null {
  if (engine === 'openface') {
    if (serverLatencyMs == null) return null;
    return Number(serverLatencyMs.toFixed(1));
  }
  if (browserLatencyMs == null) return null;
  return Number(browserLatencyMs.toFixed(1));
}

export interface BuildBenchmarkInput {
  mpLatencyMs: number;
  mpIsDetected: boolean;
  mpConfidence: number;
  mpLandmarksCount: number;
  yolo: {
    isDetected: boolean;
    latencyMs: number;
    confidence: number;
    faceCount: number;
  } | null;
  dlib: {
    isDetected: boolean;
    latencyMs: number;
    confidence: number;
    landmarksCount: number;
  } | null;
  openface: {
    isDetected: boolean;
    confidence: number | null;
    clientRoundTripMs: number | null;
    serverLatencyMs: number | null;
    resultTimestamp?: number | null;
  } | null;
  now?: number;
  /** When true, all engines ran on the same captured frame (OpenFace on same JPEG). */
  snapshotSynced?: boolean;
  snapshotId?: string;
}

function buildEngineMetric(
  partial: Omit<
    EngineBenchmarkMetric,
    'inferenceLatencyMs' | 'comparableDetectionScore' | 'frameSynced'
  > & {
    engineKey: 'mediapipe' | 'yolov8' | 'dlib' | 'openface';
    serverLatencyMs?: number | null;
  },
  frameSynced: boolean
): EngineBenchmarkMetric {
  const { engineKey, serverLatencyMs, ...rest } = partial;
  return {
    ...rest,
    frameSynced,
    inferenceLatencyMs: toInferenceLatencyMs(
      engineKey,
      rest.latencyMs,
      serverLatencyMs ?? null
    ),
    comparableDetectionScore: toComparableDetectionScore(rest.isDetected, rest.confidence),
  };
}

/** Build a linked snapshot for all 4 engines. Set snapshotSynced=true only for same-frame capture. */
export function buildMultiEngineBenchmark(input: BuildBenchmarkInput): MultiEngineBenchmarkPayload {
  const now = input.now ?? Date.now();
  const capturedAt = new Date(now).toISOString();
  const heapMb = readBrowserHeapMb();
  const snapshotId = input.snapshotId ?? createBenchmarkSnapshotId();
  const frameSynced = input.snapshotSynced ?? false;

  const of = input.openface;
  const ofAgeMs =
    of?.resultTimestamp != null ? Math.max(0, now - of.resultTimestamp) : null;

  let enginesCaptured = 1;
  if (input.yolo) enginesCaptured += 1;
  if (input.dlib) enginesCaptured += 1;
  if (of) enginesCaptured += 1;

  const snapshotSynced =
    frameSynced && enginesCaptured === 4 && input.yolo != null && input.dlib != null && of != null;

  const mediapipe = buildEngineMetric(
    {
      engineKey: 'mediapipe',
      name: 'MediaPipe (468 3D Mesh)',
      isDetected: input.mpIsDetected,
      fps: latencyToFps(input.mpLatencyMs),
      latencyMs: Number(input.mpLatencyMs.toFixed(1)),
      latencyScope: 'browserInference',
      landmarksCount: input.mpLandmarksCount,
      faceCount: null,
      memoryMb: heapMb,
      cpuLoadPct: null,
      confidence: Number(input.mpConfidence.toFixed(3)),
      confidenceKind: 'trackingQuality',
      measuredAt: capturedAt,
    },
    frameSynced
  );

  const yolov8 = buildEngineMetric(
    {
      engineKey: 'yolov8',
      name: 'YOLOv8-Face (ONNX)',
      isDetected: input.yolo?.isDetected ?? false,
      fps: latencyToFps(input.yolo?.latencyMs),
      latencyMs: input.yolo?.latencyMs ?? null,
      latencyScope: 'browserInference',
      landmarksCount: null,
      faceCount: input.yolo?.faceCount ?? null,
      memoryMb: heapMb,
      cpuLoadPct: null,
      confidence:
        input.yolo?.confidence != null ? Number(input.yolo.confidence.toFixed(3)) : null,
      confidenceKind: 'faceBoxScore',
      measuredAt: capturedAt,
    },
    frameSynced
  );

  const dlib = buildEngineMetric(
    {
      engineKey: 'dlib',
      name: 'Dlib (68-Point Landmark)',
      isDetected: input.dlib?.isDetected ?? false,
      fps: latencyToFps(input.dlib?.latencyMs),
      latencyMs: input.dlib?.latencyMs ?? null,
      latencyScope: 'browserInference',
      landmarksCount: input.dlib?.landmarksCount ?? null,
      faceCount: null,
      memoryMb: heapMb,
      cpuLoadPct: null,
      confidence:
        input.dlib?.confidence != null ? Number(input.dlib.confidence.toFixed(3)) : null,
      confidenceKind: 'detectorScore',
      measuredAt: capturedAt,
    },
    frameSynced
  );

  const openface = buildEngineMetric(
    {
      engineKey: 'openface',
      name: 'OpenFace 3.0 (remote)',
      isDetected: of?.isDetected ?? false,
      fps: latencyToFps(of?.serverLatencyMs ?? of?.clientRoundTripMs),
      latencyMs: of?.clientRoundTripMs ?? null,
      latencyScope: of?.serverLatencyMs != null ? 'serverInference' : 'networkRoundTrip',
      landmarksCount: null,
      faceCount: null,
      memoryMb: null,
      cpuLoadPct: null,
      confidence: of?.confidence != null ? Number(of.confidence.toFixed(3)) : null,
      confidenceKind: 'retinaFaceScore',
      measuredAt: capturedAt,
      serverLatencyMs: of?.serverLatencyMs ?? null,
      resultAgeMs: frameSynced ? 0 : ofAgeMs,
    },
    frameSynced
  );

  return {
    snapshotId,
    capturedAt,
    browserHeapMb: heapMb,
    snapshotSynced,
    enginesCaptured,
    mediapipe,
    yolov8,
    dlib,
    openface,
  };
}

export const CONFIDENCE_KIND_LABELS: Record<ConfidenceKind, string> = {
  trackingQuality: 'Tracking quality',
  faceBoxScore: 'Face box score',
  detectorScore: 'Detector score',
  retinaFaceScore: 'RetinaFace score',
};

export const LATENCY_SCOPE_LABELS: Record<LatencyScope, string> = {
  browserInference: 'Browser inference',
  networkRoundTrip: 'Network round-trip',
  serverInference: 'Server inference',
};

function parseMeasuredAt(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Map client benchmark metric → Prisma create fields (shared across 4 tables). */
export function benchmarkMetricToDbBase(
  metric: EngineBenchmarkMetric,
  snapshotId: string,
  snapshotSynced: boolean
) {
  return {
    benchmarkSnapshotId: snapshotId,
    isDetected: metric.isDetected,
    fps: metric.fps,
    latencyMs: metric.latencyMs,
    landmarksCount: metric.landmarksCount,
    faceCount: metric.faceCount,
    memoryMb: metric.memoryMb,
    cpuLoadPct: metric.cpuLoadPct,
    confidence: metric.confidence,
    confidenceKind: metric.confidenceKind,
    latencyScope: metric.latencyScope,
    measuredAt: parseMeasuredAt(metric.measuredAt),
    inferenceLatencyMs: metric.inferenceLatencyMs,
    comparableDetectionScore: metric.comparableDetectionScore,
    snapshotSynced,
  };
}

export function formatBenchmarkFps(fps: number | null | undefined): string {
  return fps == null ? '—' : `${fps} FPS`;
}

export function formatBenchmarkLatency(
  ms: number | null | undefined,
  scope?: LatencyScope
): string {
  if (ms == null) return '—';
  if (!scope) return `${ms} ms`;
  return `${ms} ms (${LATENCY_SCOPE_LABELS[scope]})`;
}

export function formatComparableInferenceMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return `${ms} ms (comparable infer)`;
}

export function formatComparableScore(score: number | null | undefined): string {
  if (score == null) return '—';
  return `${(score * 100).toFixed(1)}%`;
}

export function formatBenchmarkMemory(metric: EngineBenchmarkMetric): string {
  if (metric.memoryMb == null) return '—';
  return `${metric.memoryMb} MB JS heap (tab)`;
}

export function formatBenchmarkConfidence(metric: EngineBenchmarkMetric): string {
  if (metric.confidence == null) return '—';
  return `${(metric.confidence * 100).toFixed(1)}% (${CONFIDENCE_KIND_LABELS[metric.confidenceKind]})`;
}

export function formatLandmarksColumn(metric: EngineBenchmarkMetric): string {
  if (metric.faceCount != null) return `${metric.faceCount} face(s)`;
  if (metric.landmarksCount != null) return `${metric.landmarksCount} landmarks`;
  if (metric.serverLatencyMs != null && !metric.frameSynced) {
    const age =
      metric.resultAgeMs != null ? ` · age ${Math.round(metric.resultAgeMs)}ms` : '';
    return `server infer ${metric.serverLatencyMs} ms${age}`;
  }
  return '—';
}

/** Pick latest synced snapshot rows joined by benchmarkSnapshotId (for admin/export). */
export function pickLatestSyncedSnapshotLogs<
  T extends { benchmarkSnapshotId?: string | null; snapshotSynced?: boolean | null; measuredAt?: Date | string | null }
>(logs: T[]): T[] {
  const synced = logs.filter((row) => row.snapshotSynced === true && row.benchmarkSnapshotId);
  if (synced.length === 0) return [];

  const bySnapshot = new Map<string, T[]>();
  for (const row of synced) {
    const id = row.benchmarkSnapshotId as string;
    if (!bySnapshot.has(id)) bySnapshot.set(id, []);
    bySnapshot.get(id)!.push(row);
  }

  let latestId: string | null = null;
  let latestTime = 0;
  for (const [id, rows] of bySnapshot) {
    const t = rows
      .map((r) => (r.measuredAt ? new Date(r.measuredAt).getTime() : 0))
      .reduce((a, b) => Math.max(a, b), 0);
    if (t >= latestTime) {
      latestTime = t;
      latestId = id;
    }
  }

  return latestId ? bySnapshot.get(latestId) ?? [] : [];
}
