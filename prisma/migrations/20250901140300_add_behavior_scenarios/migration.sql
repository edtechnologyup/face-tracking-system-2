-- Add missing behavior scenarios used by BehaviorFeatureSync
ALTER TYPE "BehaviorScenario" ADD VALUE IF NOT EXISTS 'LOOK_UP';
ALTER TYPE "BehaviorScenario" ADD VALUE IF NOT EXISTS 'EYES_CLOSED_DISENGAGED';
