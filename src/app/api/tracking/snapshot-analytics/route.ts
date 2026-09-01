import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { L2CSGazeDetector, predictGazeHeuristic } from '@/lib/engines/l2cs-gaze-detector'
import { MiniFASNetLivenessDetector } from '@/lib/engines/minifas-liveness'
import { rateLimit } from '@/lib/utils/rate-limiter'
import {
  labelBehaviorFromFeatures,
  scenarioToViolationType,
  type AttentionState,
} from '@/lib/behavior-rule-labeler'
import { estimateOcclusion } from '@/lib/distance-occlusion'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      sessionId,
      snapshotImage, // Base64 encoded snapshot frame
      violationType, // 'MULTI_FACE_DETECTED' | 'LOOKING_AWAY_EXCEEDED' | 'FACE_LOSS'
      landmarks,     // Facial landmarks array from MediaPipe
      yaw = 0,
      pitch = 0,
      faceCount = 1,
      brightnessMean = 0.5,
      faceDistanceCm = null,
      hasFace = true,
    } = body

    // Rate limiting: จำกัด 15 requests per session, refill 2 tokens/s (ปกติเรียกทุก 20 วินาที)
    if (sessionId) {
      const { allowed } = rateLimit(`snapshot:${sessionId}`, 15, 2)
      if (!allowed) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
      }
    }

    if (!snapshotImage && !landmarks) {
      return NextResponse.json(
        { error: 'ต้องมี snapshotImage หรือ landmarks สำหรับประมวลผล Phase 3 Deep Analytics' },
        { status: 400 }
      )
    }

    // 1. Run L2CS-Net 3D Eye Gaze Estimation
    const gazeDetector = new L2CSGazeDetector()
    const gazeResult =
      predictGazeHeuristic(landmarks) ??
      gazeDetector.predictGaze({} as HTMLVideoElement, landmarks)

    // Override pitch/yaw if passed directly from client
    if (typeof yaw === 'number' && Math.abs(yaw) > Math.abs(gazeResult.gazeYaw)) {
      gazeResult.gazeYaw = yaw
    }
    if (typeof pitch === 'number' && Math.abs(pitch) > Math.abs(gazeResult.gazePitch)) {
      gazeResult.gazePitch = pitch
    }

    // 2. Run MiniFASNet Anti-Spoofing & Liveness Verification
    const livenessDetector = new MiniFASNetLivenessDetector()
    const livenessResult = livenessDetector.evaluateLiveness({} as HTMLVideoElement, landmarks)

    const occlusionEstimate = estimateOcclusion({ landmarks })
    const now = Date.now()
    const attentionState: AttentionState = { direction: 'CENTER', startTime: now }
    const ruleLabel = labelBehaviorFromFeatures({
      now,
      hasFace: Boolean(hasFace),
      faceCount: typeof faceCount === 'number' ? faceCount : 1,
      yaw,
      pitch,
      occlusionScore: occlusionEstimate.score,
      brightnessMean: typeof brightnessMean === 'number' ? brightnessMean : 0.5,
      faceDistanceCm: typeof faceDistanceCm === 'number' ? faceDistanceCm : null,
      qualityReady: true,
      hasGaze: true,
      landmarkCount: Array.isArray(landmarks) ? landmarks.length : 0,
      attentionState,
      naturalReadingState: { startTime: null, yawSamples: [] },
    })

    const derivedViolation =
      violationType ||
      scenarioToViolationType(ruleLabel.scenario) ||
      (gazeResult.isLookingOffScreen ? 'LOOKING_AWAY_EXCEEDED' : 'ROUTINE_ANALYTICS')

    // 3. Construct Deep Security Report Payload
    const analyticsReport = {
      timestamp: new Date().toISOString(),
      violationType: derivedViolation,
      behaviorLabel: {
        scenario: ruleLabel.scenario,
        validPhases: ruleLabel.validPhases,
        phase: 'NATURAL_TASK',
        isValid: ruleLabel.isValid,
        invalidReason: ruleLabel.invalidReason,
        direction: ruleLabel.direction,
        durationLookingMs: ruleLabel.durationLookingMs,
      },
      gazeAnalytics: {
        pitch: gazeResult.gazePitch,
        yaw: gazeResult.gazeYaw,
        direction: gazeResult.gazeDirection,
        isLookingOffScreen: gazeResult.isLookingOffScreen,
        gazeVector: gazeResult.gazeVector,
        screenLookTarget: gazeResult.screenCoordinateEstimate
      },
      antiSpoofingAnalytics: {
        livenessScore: livenessResult.livenessScore,
        isRealPerson: livenessResult.isRealPerson,
        attackTypeDetected: livenessResult.attackTypeDetected,
        recommendation: livenessResult.recommendation
      },
      occlusionAnalytics: {
        score: occlusionEstimate.score,
        confidence: occlusionEstimate.confidence,
        method: occlusionEstimate.method,
      },
      snapshotCaptured: !!snapshotImage,
      snapshotSizeKb: snapshotImage ? Number((snapshotImage.length / 1024).toFixed(1)) : 0
    }

    // 4. Save to Database via Prisma if sessionId is provided
    let savedLogId: string | null = null
    if (sessionId) {
      try {
        const detectionType =
          derivedViolation === 'FACE_LOSS'
            ? 'FACE_DETECTION_LOSS'
            : derivedViolation === 'MULTI_FACE_DETECTED'
              ? 'SECURITY_VIOLATION'
              : 'FACE_ORIENTATION'
        const logEntry = await prisma.trackingLog.create({
          data: {
            sessionId,
            detectionType,
            confidence: gazeResult.confidence,
            detectionData: {
              ...analyticsReport,
              snapshotImage: snapshotImage ? `${snapshotImage.substring(0, 100)}...[Truncated Base64]` : null
            }
          }
        })
        savedLogId = logEntry.id
        console.log(`✅ [Phase 3 Deep Analytics] บันทึกลง PostgreSQL สำเร็จ (Log ID: ${savedLogId})`)
      } catch (dbErr) {
        console.warn('⚠️ [Database Notice] ไม่สามารถบันทึก DB ได้ (sessionId ไม่พบบน DB หรืออยู่ในโหมดทดสอบ):', dbErr instanceof Error ? dbErr.message : dbErr)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'ประมวลผล Phase 3 Deep Analytics สำเร็จ',
      savedLogId,
      analyticsReport
    })

  } catch (error) {
    console.error('❌ Snapshot Analytics API Error:', error)
    return NextResponse.json(
      {
        error: 'เกิดข้อผิดพลาดในการประมวลผล Phase 3 Deep Analytics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
