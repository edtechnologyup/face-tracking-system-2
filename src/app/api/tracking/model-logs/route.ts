import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limiter';
import {
  persistModelEventLogs,
  type ModelEventEngine,
  type ModelEventLogEntry,
} from '@/lib/model-event-log';
import type { EngineBenchmarkMetric } from '@/lib/engine-benchmark';

const VALID_ENGINES: ModelEventEngine[] = ['mediapipe', 'yolov8', 'dlib', 'openface'];
const MAX_BATCH_SIZE = 40;

function parseEntry(raw: unknown): ModelEventLogEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const engine = o.engine;
  const metric = o.metric;
  if (typeof engine !== 'string' || !VALID_ENGINES.includes(engine as ModelEventEngine)) {
    return null;
  }
  if (!metric || typeof metric !== 'object') return null;
  const m = metric as EngineBenchmarkMetric;
  if (typeof m.isDetected !== 'boolean') return null;

  const entry: ModelEventLogEntry = {
    engine: engine as ModelEventEngine,
    metric: m,
  };

  if (engine === 'openface' && o.openfaceExtras && typeof o.openfaceExtras === 'object') {
    const ex = o.openfaceExtras as Record<string, unknown>;
    entry.openfaceExtras = {
      serverLatencyMs: typeof ex.serverLatencyMs === 'number' ? ex.serverLatencyMs : null,
      resultAgeMs: typeof ex.resultAgeMs === 'number' ? ex.resultAgeMs : null,
    };
  }

  return entry;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, logs } = body as { sessionId?: string; logs?: unknown[] };

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const { allowed } = await checkRateLimit({
      key: `model-logs:${sessionId}`,
      ...RATE_LIMITS.modelLogs,
    });
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    if (!logs || !Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json({ error: 'No logs provided' }, { status: 400 });
    }

    const session = await prisma.trackingSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!session) {
      return NextResponse.json(
        { error: 'Tracking session not found', code: 'SESSION_NOT_FOUND' },
        { status: 404 }
      );
    }

    const entries = logs
      .slice(0, MAX_BATCH_SIZE)
      .map(parseEntry)
      .filter((e): e is ModelEventLogEntry => e != null);

    if (!entries.length) {
      return NextResponse.json({ error: 'No valid model log entries' }, { status: 400 });
    }

    const result = await persistModelEventLogs(sessionId, entries);

    return NextResponse.json({
      success: true,
      written: result.written,
      byEngine: result.byEngine,
    });
  } catch (error: unknown) {
    console.error('Error saving model event logs:', error);
    return NextResponse.json({ error: 'Failed to save model logs' }, { status: 500 });
  }
}
