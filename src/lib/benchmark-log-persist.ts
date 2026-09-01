import { prisma } from '@/lib/prisma';
import {
  benchmarkMetricToDbBase,
  type MultiEngineBenchmarkPayload,
} from '@/lib/engine-benchmark';

export interface PersistSyncedBenchmarkResult {
  persisted: boolean;
  skippedDuplicate: boolean;
  enginesWritten: number;
  snapshotId: string | null;
}

/** Idempotent write of 4 model logs for a synced benchmark snapshot. */
export async function persistSyncedBenchmarkLogs(
  sessionId: string,
  benchmarkMetrics: MultiEngineBenchmarkPayload
): Promise<PersistSyncedBenchmarkResult> {
  const snapshotId = benchmarkMetrics.snapshotId;
  if (!snapshotId) {
    return { persisted: false, skippedDuplicate: false, enginesWritten: 0, snapshotId: null };
  }
  if (!benchmarkMetrics.snapshotSynced) {
    return { persisted: false, skippedDuplicate: false, enginesWritten: 0, snapshotId };
  }

  const existing = await prisma.mediaPipeLog.findFirst({
    where: { sessionId, benchmarkSnapshotId: snapshotId },
    select: { id: true },
  });
  if (existing) {
    return { persisted: false, skippedDuplicate: true, enginesWritten: 0, snapshotId };
  }

  let enginesWritten = 0;

  await prisma.$transaction(async (tx) => {
    if (benchmarkMetrics.mediapipe) {
      await tx.mediaPipeLog.create({
        data: {
          sessionId,
          ...benchmarkMetricToDbBase(
            benchmarkMetrics.mediapipe,
            snapshotId,
            true
          ),
        },
      });
      enginesWritten += 1;
    }

    if (benchmarkMetrics.yolov8) {
      await tx.yolov8Log.create({
        data: {
          sessionId,
          ...benchmarkMetricToDbBase(benchmarkMetrics.yolov8, snapshotId, true),
        },
      });
      enginesWritten += 1;
    }

    if (benchmarkMetrics.dlib) {
      await tx.dlibLog.create({
        data: {
          sessionId,
          ...benchmarkMetricToDbBase(benchmarkMetrics.dlib, snapshotId, true),
        },
      });
      enginesWritten += 1;
    }

    if (benchmarkMetrics.openface) {
      await tx.openFaceLog.create({
        data: {
          sessionId,
          ...benchmarkMetricToDbBase(benchmarkMetrics.openface, snapshotId, true),
          serverLatencyMs: benchmarkMetrics.openface.serverLatencyMs ?? null,
          resultAgeMs:
            benchmarkMetrics.openface.resultAgeMs != null
              ? Math.round(benchmarkMetrics.openface.resultAgeMs)
              : null,
        },
      });
      enginesWritten += 1;
    }
  });

  return { persisted: enginesWritten > 0, skippedDuplicate: false, enginesWritten, snapshotId };
}
