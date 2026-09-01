-- Synced comparable benchmark: same-frame capture + unified inference/score columns

ALTER TABLE "model_mediapipe_logs" ADD COLUMN IF NOT EXISTS "inferenceLatencyMs" DOUBLE PRECISION;
ALTER TABLE "model_mediapipe_logs" ADD COLUMN IF NOT EXISTS "comparableDetectionScore" DOUBLE PRECISION;
ALTER TABLE "model_mediapipe_logs" ADD COLUMN IF NOT EXISTS "snapshotSynced" BOOLEAN;

ALTER TABLE "model_yolov8_logs" ADD COLUMN IF NOT EXISTS "inferenceLatencyMs" DOUBLE PRECISION;
ALTER TABLE "model_yolov8_logs" ADD COLUMN IF NOT EXISTS "comparableDetectionScore" DOUBLE PRECISION;
ALTER TABLE "model_yolov8_logs" ADD COLUMN IF NOT EXISTS "snapshotSynced" BOOLEAN;

ALTER TABLE "model_dlib_logs" ADD COLUMN IF NOT EXISTS "inferenceLatencyMs" DOUBLE PRECISION;
ALTER TABLE "model_dlib_logs" ADD COLUMN IF NOT EXISTS "comparableDetectionScore" DOUBLE PRECISION;
ALTER TABLE "model_dlib_logs" ADD COLUMN IF NOT EXISTS "snapshotSynced" BOOLEAN;

ALTER TABLE "model_openface_logs" ADD COLUMN IF NOT EXISTS "inferenceLatencyMs" DOUBLE PRECISION;
ALTER TABLE "model_openface_logs" ADD COLUMN IF NOT EXISTS "comparableDetectionScore" DOUBLE PRECISION;
ALTER TABLE "model_openface_logs" ADD COLUMN IF NOT EXISTS "snapshotSynced" BOOLEAN;

CREATE INDEX IF NOT EXISTS "model_mediapipe_logs_snapshotSynced_idx"
  ON "model_mediapipe_logs"("snapshotSynced");
CREATE INDEX IF NOT EXISTS "model_yolov8_logs_snapshotSynced_idx"
  ON "model_yolov8_logs"("snapshotSynced");
CREATE INDEX IF NOT EXISTS "model_dlib_logs_snapshotSynced_idx"
  ON "model_dlib_logs"("snapshotSynced");
CREATE INDEX IF NOT EXISTS "model_openface_logs_snapshotSynced_idx"
  ON "model_openface_logs"("snapshotSynced");
