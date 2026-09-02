#!/usr/bin/env tsx
/**
 * Load test: simulate N concurrent sessions posting behavior-feature batches.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 SESSION_IDS=id1,id2,... npm run load-test:90
 *   BASE_URL=http://localhost:3000 CONCURRENT=90 DURATION_SEC=60 npm run load-test:90
 *
 * Without real session IDs, sends anonymous-shaped payloads (expect 400/401) —
 * use for rate-limit / throughput smoke only.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CONCURRENT = Number(process.env.CONCURRENT ?? '90');
const DURATION_SEC = Number(process.env.DURATION_SEC ?? '60');
const SESSION_IDS = (process.env.SESSION_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function buildMockLog(sampleIndex: number) {
  return {
    participantCode: 'load-test',
    featureSchemaVersion: '2.8',
    timestamp: new Date().toISOString(),
    elapsedMs: sampleIndex * 500,
    sampleIndex,
    scenario: 'NATURAL_READING',
    phase: 'NATURAL_TASK',
    validPhases: ['faceValid', 'headValid'],
    faceDetected: true,
    faceCount: 1,
    faceConfidence: 0.92,
    isValid: true,
    pipelineVersion: 'hybrid-4.1-tracking-profile',
    trackingProfile: 'exam',
    researchEligible: true,
    sampleRateHz: 2,
  };
}

async function postBatch(sessionId: string, workerId: number): Promise<{ ok: boolean; status: number }> {
  const logs = Array.from({ length: 8 }, (_, i) => buildMockLog(i + workerId * 100));
  try {
    const res = await fetch(`${BASE_URL}/api/tracking/behavior-features`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, logs }),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function worker(workerId: number, endAt: number, stats: { ok: number; fail: number; rateLimited: number }) {
  const sessionId = SESSION_IDS[workerId % SESSION_IDS.length] ?? `load-test-session-${workerId}`;
  while (Date.now() < endAt) {
    const result = await postBatch(sessionId, workerId);
    if (result.ok) stats.ok += 1;
    else if (result.status === 429) stats.rateLimited += 1;
    else stats.fail += 1;
    await new Promise((r) => setTimeout(r, 4000));
  }
}

async function main() {
  console.log(`Load test: ${CONCURRENT} workers × ${DURATION_SEC}s → ${BASE_URL}`);
  if (SESSION_IDS.length === 0) {
    console.warn('No SESSION_IDS — requests may fail auth/validation (rate-limit smoke test only)');
  }

  const stats = { ok: 0, fail: 0, rateLimited: 0 };
  const endAt = Date.now() + DURATION_SEC * 1000;
  const workers = Array.from({ length: CONCURRENT }, (_, i) => worker(i, endAt, stats));
  await Promise.all(workers);

  const total = stats.ok + stats.fail + stats.rateLimited;
  const errorRate = total > 0 ? ((stats.fail + stats.rateLimited) / total) * 100 : 0;

  console.log('\n--- Results ---');
  console.log(`OK:           ${stats.ok}`);
  console.log(`Rate limited: ${stats.rateLimited}`);
  console.log(`Failed:       ${stats.fail}`);
  console.log(`Error rate:   ${errorRate.toFixed(2)}%`);
  console.log(`AC1 pass (<1% errors): ${errorRate < 1 ? 'YES' : 'NO'}`);

  process.exit(errorRate < 1 ? 0 : 1);
}

main();
