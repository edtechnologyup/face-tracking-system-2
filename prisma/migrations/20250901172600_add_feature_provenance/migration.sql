-- AlterTable
ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "featureProvenance" JSONB;
