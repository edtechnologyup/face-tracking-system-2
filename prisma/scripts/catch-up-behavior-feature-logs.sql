-- Safe catch-up for behavior_feature_logs (idempotent, no data loss)
-- Run when POST /api/tracking/behavior-features returns Prisma P2022 (missing column)
--
-- Local:  npx prisma db execute --file prisma/scripts/catch-up-behavior-feature-logs.sql
-- Supabase: paste into SQL Editor and run

-- BehaviorScenario enum values
ALTER TYPE "BehaviorScenario" ADD VALUE IF NOT EXISTS 'LOOK_UP';
ALTER TYPE "BehaviorScenario" ADD VALUE IF NOT EXISTS 'EYES_CLOSED_DISENGAGED';
ALTER TYPE "BehaviorScenario" ADD VALUE IF NOT EXISTS 'DIM_LIGHT';

-- featureProvenance (20250901172600)
ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "featureProvenance" JSONB;

-- ExperimentPhase + validPhases (20250901200400)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExperimentPhase') THEN
    CREATE TYPE "ExperimentPhase" AS ENUM (
      'SYSTEM_STABILIZATION',
      'CALIBRATION',
      'CONTROLLED_TASK',
      'ROBUSTNESS_TEST',
      'NATURAL_TASK'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeatureValidPhase') THEN
    CREATE TYPE "FeatureValidPhase" AS ENUM (
      'faceValid',
      'headValid',
      'gazeValid',
      'eyeValid'
    );
  END IF;
END $$;

ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "validPhases" "FeatureValidPhase"[] DEFAULT ARRAY[]::"FeatureValidPhase"[];

-- Migrate legacy Phase[] → validPhases if old column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'behavior_feature_logs' AND column_name = 'phase'
    AND udt_name = '_Phase'
  ) THEN
    UPDATE "behavior_feature_logs"
    SET "validPhases" = ARRAY(
      SELECT unnest("phase"::text[])::"FeatureValidPhase"
    )
    WHERE cardinality("phase") > 0;
    ALTER TABLE "behavior_feature_logs" DROP COLUMN "phase";
  END IF;
END $$;

DROP TYPE IF EXISTS "Phase";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'behavior_feature_logs' AND column_name = 'phase'
  ) THEN
    ALTER TABLE "behavior_feature_logs"
      ADD COLUMN "phase" "ExperimentPhase" NOT NULL DEFAULT 'NATURAL_TASK';
  END IF;
END $$;

-- sharpness / fps rename (20250901213000)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'behavior_feature_logs' AND column_name = 'blurScore'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'behavior_feature_logs' AND column_name = 'sharpnessScore'
  ) THEN
    ALTER TABLE "behavior_feature_logs" RENAME COLUMN "blurScore" TO "sharpnessScore";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'behavior_feature_logs' AND column_name = 'cameraFps'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'behavior_feature_logs' AND column_name = 'detectionFps'
  ) THEN
    ALTER TABLE "behavior_feature_logs" RENAME COLUMN "cameraFps" TO "detectionFps";
  END IF;
END $$;

ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "sharpnessScore" DOUBLE PRECISION;
ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "detectionFps" INTEGER;
ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "cameraStreamFps" INTEGER;
ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "sampleRateHz" INTEGER;

UPDATE "behavior_feature_logs"
SET "sampleRateHz" = 2
WHERE "sampleRateHz" IS NULL;

-- tracking profile (20250901220000)
ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "trackingProfile" TEXT;
ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

-- researchEligible (20250901230000)
ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "researchEligible" BOOLEAN;

CREATE INDEX IF NOT EXISTS "behavior_feature_logs_researchEligible_idx"
  ON "behavior_feature_logs"("researchEligible");

-- Remove deprecated deviceTier columns (no longer stored by app)
DROP INDEX IF EXISTS "behavior_feature_logs_deviceTier_idx";
ALTER TABLE "behavior_feature_logs" DROP COLUMN IF EXISTS "deviceTier";
ALTER TABLE "model_mediapipe_logs" DROP COLUMN IF EXISTS "deviceTier";
ALTER TABLE "model_yolov8_logs" DROP COLUMN IF EXISTS "deviceTier";
ALTER TABLE "model_dlib_logs" DROP COLUMN IF EXISTS "deviceTier";
ALTER TABLE "model_openface_logs" DROP COLUMN IF EXISTS "deviceTier";
