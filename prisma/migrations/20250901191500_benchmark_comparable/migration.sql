-- Comparable benchmark metadata (linked snapshots across 4 model log tables)

ALTER TABLE "model_mediapipe_logs" ADD COLUMN IF NOT EXISTS "benchmarkSnapshotId" TEXT;
ALTER TABLE "model_mediapipe_logs" ADD COLUMN IF NOT EXISTS "confidenceKind" TEXT;
ALTER TABLE "model_mediapipe_logs" ADD COLUMN IF NOT EXISTS "latencyScope" TEXT;
ALTER TABLE "model_mediapipe_logs" ADD COLUMN IF NOT EXISTS "faceCount" INTEGER;
ALTER TABLE "model_mediapipe_logs" ADD COLUMN IF NOT EXISTS "measuredAt" TIMESTAMP(3);

ALTER TABLE "model_yolov8_logs" ADD COLUMN IF NOT EXISTS "benchmarkSnapshotId" TEXT;
ALTER TABLE "model_yolov8_logs" ADD COLUMN IF NOT EXISTS "confidenceKind" TEXT;
ALTER TABLE "model_yolov8_logs" ADD COLUMN IF NOT EXISTS "latencyScope" TEXT;
ALTER TABLE "model_yolov8_logs" ADD COLUMN IF NOT EXISTS "faceCount" INTEGER;
ALTER TABLE "model_yolov8_logs" ADD COLUMN IF NOT EXISTS "measuredAt" TIMESTAMP(3);

ALTER TABLE "model_dlib_logs" ADD COLUMN IF NOT EXISTS "benchmarkSnapshotId" TEXT;
ALTER TABLE "model_dlib_logs" ADD COLUMN IF NOT EXISTS "confidenceKind" TEXT;
ALTER TABLE "model_dlib_logs" ADD COLUMN IF NOT EXISTS "latencyScope" TEXT;
ALTER TABLE "model_dlib_logs" ADD COLUMN IF NOT EXISTS "faceCount" INTEGER;
ALTER TABLE "model_dlib_logs" ADD COLUMN IF NOT EXISTS "measuredAt" TIMESTAMP(3);

ALTER TABLE "model_openface_logs" ADD COLUMN IF NOT EXISTS "benchmarkSnapshotId" TEXT;
ALTER TABLE "model_openface_logs" ADD COLUMN IF NOT EXISTS "confidenceKind" TEXT;
ALTER TABLE "model_openface_logs" ADD COLUMN IF NOT EXISTS "latencyScope" TEXT;
ALTER TABLE "model_openface_logs" ADD COLUMN IF NOT EXISTS "faceCount" INTEGER;
ALTER TABLE "model_openface_logs" ADD COLUMN IF NOT EXISTS "measuredAt" TIMESTAMP(3);
ALTER TABLE "model_openface_logs" ADD COLUMN IF NOT EXISTS "serverLatencyMs" DOUBLE PRECISION;
ALTER TABLE "model_openface_logs" ADD COLUMN IF NOT EXISTS "resultAgeMs" INTEGER;

CREATE INDEX IF NOT EXISTS "model_mediapipe_logs_benchmarkSnapshotId_idx"
  ON "model_mediapipe_logs"("benchmarkSnapshotId");
CREATE INDEX IF NOT EXISTS "model_yolov8_logs_benchmarkSnapshotId_idx"
  ON "model_yolov8_logs"("benchmarkSnapshotId");
CREATE INDEX IF NOT EXISTS "model_dlib_logs_benchmarkSnapshotId_idx"
  ON "model_dlib_logs"("benchmarkSnapshotId");
CREATE INDEX IF NOT EXISTS "model_openface_logs_benchmarkSnapshotId_idx"
  ON "model_openface_logs"("benchmarkSnapshotId");
