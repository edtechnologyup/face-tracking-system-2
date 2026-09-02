-- Catch-up for model_*_benchmark log tables (idempotent)
-- Run when persistSyncedBenchmarkLogs fails with P2022 on confidenceKind etc.
--
-- Local: npm run db:catch-up-models

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'model_mediapipe_logs',
    'model_yolov8_logs',
    'model_dlib_logs',
    'model_openface_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "faceCount" INTEGER', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "confidenceKind" TEXT', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "latencyScope" TEXT', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "benchmarkSnapshotId" TEXT', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "measuredAt" TIMESTAMP(3)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "inferenceLatencyMs" DOUBLE PRECISION', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "comparableDetectionScore" DOUBLE PRECISION', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "snapshotSynced" BOOLEAN', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I("benchmarkSnapshotId")',
      t || '_benchmarkSnapshotId_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I("snapshotSynced")',
      t || '_snapshotSynced_idx', t);
  END LOOP;
END $$;

ALTER TABLE "model_openface_logs" ADD COLUMN IF NOT EXISTS "serverLatencyMs" DOUBLE PRECISION;
ALTER TABLE "model_openface_logs" ADD COLUMN IF NOT EXISTS "resultAgeMs" INTEGER;

-- deviceTier removed from app + Prisma schema (never written to model_*_logs)
ALTER TABLE "model_mediapipe_logs" DROP COLUMN IF EXISTS "deviceTier";
ALTER TABLE "model_yolov8_logs" DROP COLUMN IF EXISTS "deviceTier";
ALTER TABLE "model_dlib_logs" DROP COLUMN IF EXISTS "deviceTier";
ALTER TABLE "model_openface_logs" DROP COLUMN IF EXISTS "deviceTier";
