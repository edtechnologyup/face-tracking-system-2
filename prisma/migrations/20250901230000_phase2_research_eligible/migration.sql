-- Phase 2: researchEligible flag on behavior logs
ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "researchEligible" BOOLEAN;

CREATE INDEX IF NOT EXISTS "behavior_feature_logs_researchEligible_idx"
  ON "behavior_feature_logs"("researchEligible");

-- Optional device tier on model logs for cohort analysis
ALTER TABLE "model_mediapipe_logs" ADD COLUMN IF NOT EXISTS "deviceTier" TEXT;
ALTER TABLE "model_yolov8_logs" ADD COLUMN IF NOT EXISTS "deviceTier" TEXT;
ALTER TABLE "model_dlib_logs" ADD COLUMN IF NOT EXISTS "deviceTier" TEXT;
ALTER TABLE "model_openface_logs" ADD COLUMN IF NOT EXISTS "deviceTier" TEXT;
