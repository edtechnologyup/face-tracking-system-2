-- Split experiment protocol phase vs feature validity flags

CREATE TYPE "ExperimentPhase" AS ENUM (
  'SYSTEM_STABILIZATION',
  'CALIBRATION',
  'CONTROLLED_TASK',
  'ROBUSTNESS_TEST',
  'NATURAL_TASK'
);

CREATE TYPE "FeatureValidPhase" AS ENUM (
  'faceValid',
  'headValid',
  'gazeValid',
  'eyeValid'
);

ALTER TABLE "behavior_feature_logs" ADD COLUMN IF NOT EXISTS "validPhases" "FeatureValidPhase"[] DEFAULT ARRAY[]::"FeatureValidPhase"[];

-- Migrate old Phase[] (faceValid flags) → validPhases
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
  END IF;
END $$;

ALTER TABLE "behavior_feature_logs" DROP COLUMN IF EXISTS "phase";

DROP TYPE IF EXISTS "Phase";

ALTER TABLE "behavior_feature_logs"
  ADD COLUMN IF NOT EXISTS "phase" "ExperimentPhase" NOT NULL DEFAULT 'NATURAL_TASK';
