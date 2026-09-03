import { prisma } from '@/lib/prisma';
import {
  benchmarkMetricToDbBase,
  createBenchmarkSnapshotId,
  type EngineBenchmarkMetric,
} from '@/lib/engine-benchmark';

export type ModelEventEngine = 'mediapipe' | 'yolov8' | 'dlib' | 'openface';

export interface ModelEventLogEntry {
  engine: ModelEventEngine;
  metric: EngineBenchmarkMetric;
  openfaceExtras?: {
    serverLatencyMs?: number | null;
    resultAgeMs?: number | null;
  };
}

export interface PersistModelEventLogsResult {
  written: number;
  byEngine: Partial<Record<ModelEventEngine, number>>;
}

export type ModelEventLogEnqueue = (entry: ModelEventLogEntry) => void;

function metricToRow(
  sessionId: string,
  metric: EngineBenchmarkMetric,
  openfaceExtras?: ModelEventLogEntry['openfaceExtras']
) {
  const snapshotId = createBenchmarkSnapshotId();
  const base = benchmarkMetricToDbBase(metric, snapshotId, false);
  return {
    sessionId,
    ...base,
    ...(openfaceExtras
      ? {
          serverLatencyMs: openfaceExtras.serverLatencyMs ?? null,
          resultAgeMs:
            openfaceExtras.resultAgeMs != null
              ? Math.round(openfaceExtras.resultAgeMs)
              : null,
        }
      : {}),
  };
}

/** Batch insert event-driven model logs (snapshotSynced=false). */
export async function persistModelEventLogs(
  sessionId: string,
  entries: ModelEventLogEntry[]
): Promise<PersistModelEventLogsResult> {
  if (!entries.length) {
    return { written: 0, byEngine: {} };
  }

  const mpRows = entries
    .filter((e) => e.engine === 'mediapipe')
    .map((e) => metricToRow(sessionId, e.metric));
  const yoloRows = entries
    .filter((e) => e.engine === 'yolov8')
    .map((e) => metricToRow(sessionId, e.metric));
  const dlibRows = entries
    .filter((e) => e.engine === 'dlib')
    .map((e) => metricToRow(sessionId, e.metric));
  const openfaceRows = entries
    .filter((e) => e.engine === 'openface')
    .map((e) => metricToRow(sessionId, e.metric, e.openfaceExtras));

  const byEngine: Partial<Record<ModelEventEngine, number>> = {};

  // Avoid interactive $transaction — it holds a pooled connection for the whole
  // batch and causes P2028 / pool timeouts under concurrent exam sessions.
  // Event logs are append-only; partial writes are acceptable and retried by client.
  if (mpRows.length) {
    const r = await prisma.mediaPipeLog.createMany({ data: mpRows });
    byEngine.mediapipe = r.count;
  }
  if (yoloRows.length) {
    const r = await prisma.yolov8Log.createMany({ data: yoloRows });
    byEngine.yolov8 = r.count;
  }
  if (dlibRows.length) {
    const r = await prisma.dlibLog.createMany({ data: dlibRows });
    byEngine.dlib = r.count;
  }
  if (openfaceRows.length) {
    const r = await prisma.openFaceLog.createMany({ data: openfaceRows });
    byEngine.openface = r.count;
  }

  const written = Object.values(byEngine).reduce((a, b) => a + (b ?? 0), 0);
  return { written, byEngine };
}
