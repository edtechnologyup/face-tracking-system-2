'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  buildMediaPipeEventMetric,
  type EngineBenchmarkMetric,
} from '@/lib/engine-benchmark';
import type { ModelEventEngine, ModelEventLogEntry, ModelEventLogEnqueue } from '@/lib/model-event-log';

/** Sample MediaPipe metrics less often under multi-user load (was 1s → pool storms). */
export const MEDIAPIPE_MODEL_LOG_INTERVAL_MS = 3000;
const MODEL_LOG_BATCH_SIZE = 20;
const MODEL_LOG_FLUSH_MS = 10000;
const RETRY_BUFFER_MAX = 80;

export interface ModelEventLogSyncProps {
  isActive: boolean;
  sessionId: string | null;
  getLatestDetection?: () => {
    mediaPipeData: {
      isDetected?: boolean;
      confidence?: number;
      landmarks?: unknown[];
    } | null;
    mpLatencyMs?: number;
  };
  /** Hybrid hook calls this ref after YOLO/Dlib/OpenFace inference completes */
  enqueueRef?: React.MutableRefObject<ModelEventLogEnqueue | null>;
}

async function postModelEventLogs(
  sessionId: string,
  logs: ModelEventLogEntry[],
  keepalive = false
): Promise<boolean> {
  try {
    const res = await fetch('/api/tracking/model-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive,
      body: JSON.stringify({ sessionId, logs }),
    });
    if (res.ok) return true;
    console.warn('[model-logs] sync failed', res.status, await res.text().catch(() => ''));
    return false;
  } catch (err) {
    console.error('[model-logs] sync error:', err);
    return false;
  }
}

export function ModelEventLogSync({
  isActive,
  sessionId,
  getLatestDetection,
  enqueueRef,
}: ModelEventLogSyncProps) {
  const bufferRef = useRef<ModelEventLogEntry[]>([]);
  const lastMpLogAtRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flushBuffer = useCallback(
    async (keepalive = false) => {
      if (!sessionId || bufferRef.current.length === 0) return;
      const batch = bufferRef.current.splice(0, MODEL_LOG_BATCH_SIZE);
      const ok = await postModelEventLogs(sessionId, batch, keepalive);
      if (!ok) {
        bufferRef.current = [...batch, ...bufferRef.current].slice(0, RETRY_BUFFER_MAX);
      }
    },
    [sessionId]
  );

  const enqueue: ModelEventLogEnqueue = useCallback(
    (entry) => {
      if (!sessionId || !isActive) return;
      bufferRef.current.push(entry);
      if (bufferRef.current.length >= MODEL_LOG_BATCH_SIZE) {
        void flushBuffer();
      }
    },
    [sessionId, isActive, flushBuffer]
  );

  useEffect(() => {
    if (!enqueueRef) return;
    enqueueRef.current = enqueue;
    return () => {
      enqueueRef.current = null;
    };
  }, [enqueueRef, enqueue]);

  useEffect(() => {
    if (!sessionId) {
      bufferRef.current = [];
      lastMpLogAtRef.current = 0;
    }
  }, [sessionId]);

  // MediaPipe: fixed 1 Hz sample of latest inference
  useEffect(() => {
    if (!isActive || !sessionId) return;

    const tick = () => {
      const now = Date.now();
      if (now - lastMpLogAtRef.current < MEDIAPIPE_MODEL_LOG_INTERVAL_MS) return;
      lastMpLogAtRef.current = now;

      const snap = getLatestDetection?.();
      const mp = snap?.mediaPipeData;
      const mpLatencyMs = snap?.mpLatencyMs ?? 0;
      if (!mp) return;

      const measuredAt = new Date(now).toISOString();
      const metric: EngineBenchmarkMetric = buildMediaPipeEventMetric({
        mpLatencyMs,
        mpIsDetected: !!mp.isDetected,
        mpConfidence: mp.confidence ?? 0,
        mpLandmarksCount: mp.landmarks?.length ?? 0,
        measuredAt,
      });

      enqueue({ engine: 'mediapipe', metric });
    };

    tick();
    const id = setInterval(tick, MEDIAPIPE_MODEL_LOG_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isActive, sessionId, getLatestDetection, enqueue]);

  // Periodic flush + unmount drain
  useEffect(() => {
    if (!isActive || !sessionId) return;

    flushTimerRef.current = setInterval(() => {
      void flushBuffer();
    }, MODEL_LOG_FLUSH_MS);

    return () => {
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (bufferRef.current.length > 0 && sessionId) {
        const remaining = [...bufferRef.current];
        bufferRef.current = [];
        void postModelEventLogs(sessionId, remaining, true);
      }
    };
  }, [isActive, sessionId, flushBuffer]);

  return null;
}

export type { ModelEventLogEntry, ModelEventEngine, ModelEventLogEnqueue };
