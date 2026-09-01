-- Phase C: rename blurScore → sharpnessScore; split cameraFps into detection/stream/sample rates

ALTER TABLE "behavior_feature_logs" RENAME COLUMN "blurScore" TO "sharpnessScore";

ALTER TABLE "behavior_feature_logs" RENAME COLUMN "cameraFps" TO "detectionFps";

ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "cameraStreamFps" INTEGER;

ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "sampleRateHz" INTEGER;

-- Legacy rows: detectionFps previously mixed detection + stream; sample rate was implicit 2 Hz
UPDATE "behavior_feature_logs"
SET "sampleRateHz" = 2
WHERE "sampleRateHz" IS NULL;
