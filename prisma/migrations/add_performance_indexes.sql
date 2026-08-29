-- Performance indexes for 100+ concurrent users
-- Run with: npx prisma db execute --file prisma/migrations/add_performance_indexes.sql --url "$DIRECT_URL"

-- Index สำหรับ JSONB direction query ใน admin stats (ใช้กับ raw SQL aggregation)
CREATE INDEX IF NOT EXISTS idx_tracking_logs_direction 
  ON tracking_logs ((("detectionData"->>'direction')));

-- Composite index สำหรับ session + detection type query (ใช้บ่อยใน orientation sync)
CREATE INDEX IF NOT EXISTS idx_tracking_logs_session_type 
  ON tracking_logs ("sessionId", "detectionType");

-- Index สำหรับ behavior_feature_logs session + time query
CREATE INDEX IF NOT EXISTS idx_behavior_feature_logs_session_time 
  ON behavior_feature_logs ("sessionId", "timestamp");

-- Composite indexes สำหรับ model benchmark logs (ใช้ใน admin session detail)
CREATE INDEX IF NOT EXISTS idx_mediapipe_logs_session_time
  ON model_mediapipe_logs ("sessionId", "timestamp");

CREATE INDEX IF NOT EXISTS idx_yolov8_logs_session_time
  ON model_yolov8_logs ("sessionId", "timestamp");

CREATE INDEX IF NOT EXISTS idx_dlib_logs_session_time
  ON model_dlib_logs ("sessionId", "timestamp");

CREATE INDEX IF NOT EXISTS idx_openface_logs_session_time
  ON model_openface_logs ("sessionId", "timestamp");

-- Index สำหรับ tracking_sessions status query (ใช้ใน autoCloseStaleSessions)
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_status_start
  ON tracking_sessions ("status", "startTime");
