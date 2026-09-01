-- Phase 1: device tier + tracking profile metadata on behavior logs
ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "deviceTier" TEXT;
ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "trackingProfile" TEXT;
ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

CREATE INDEX IF NOT EXISTS "behavior_feature_logs_deviceTier_idx"
  ON "behavior_feature_logs"("deviceTier");
