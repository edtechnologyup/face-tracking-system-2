import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limiter'
import { validateBehaviorLogBatch } from '@/lib/pipeline-qa'
import { aggregateScenarioCounts } from '@/lib/behavior-rule-labeler'

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId')
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    const logs = await prisma.behaviorFeatureLog.findMany({
      where: { sessionId },
      select: { scenario: true, isValid: true, invalidReason: true, timestamp: true },
      orderBy: { timestamp: 'asc' },
    })

    const scenarios = logs.map((l) => l.scenario)
    const scenarioCounts = aggregateScenarioCounts(scenarios)
    const validCount = logs.filter((l) => l.isValid).length
    const invalidReasons = aggregateScenarioCounts(
      logs.filter((l) => !l.isValid).map((l) => l.invalidReason)
    )

    return NextResponse.json({
      success: true,
      sessionId,
      totalSamples: logs.length,
      validCount,
      invalidCount: logs.length - validCount,
      scenarioCounts,
      invalidReasonCounts: invalidReasons,
    })
  } catch (error: unknown) {
    console.error('Error fetching behavior analytics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch behavior analytics' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, logs } = body

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing sessionId' },
        { status: 400 }
      )
    }

    // Rate limiting: จำกัด 30 requests per session, refill 3 tokens/s (ปกติเรียกทุก 5 วินาที)
    const { allowed } = await checkRateLimit({
      key: `behavior:${sessionId}`,
      ...RATE_LIMITS.behaviorFeatures,
    })
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    if (!logs || !Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json(
        { error: 'No logs provided or invalid format' },
        { status: 400 }
      )
    }

    const session = await prisma.trackingSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    })
    if (!session) {
      return NextResponse.json(
        { error: 'Tracking session not found', code: 'SESSION_NOT_FOUND' },
        { status: 404 }
      )
    }

    // Cap batch size to prevent oversized payloads crashing the server
    const MAX_BATCH_SIZE = 100
    const safeLogs = logs.slice(0, MAX_BATCH_SIZE)

    const qaReport = validateBehaviorLogBatch(safeLogs)
    if (!qaReport.valid) {
      console.warn('[behavior-features QA]', qaReport.summary, qaReport.issues.slice(0, 5))
    }

    // Prepare data for batch insert
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logsData = safeLogs.map((log: any) => ({
      sessionId: sessionId,
      participantCode: log.participantCode || null,
      timestamp: log.timestamp ? new Date(log.timestamp) : new Date(),
      elapsedMs: log.elapsedMs ?? 0,
      sampleIndex: log.sampleIndex ?? 0,
      scenario: log.scenario ?? null,
      
      phase: log.phase ?? 'NATURAL_TASK',
      validPhases: Array.isArray(log.validPhases) ? log.validPhases : [],
      
      faceDetected: Boolean(log.faceDetected),
      faceCount: log.faceCount ?? null,
      faceConfidence: log.faceConfidence ?? null,
      bboxX: log.bboxX ?? null,
      bboxY: log.bboxY ?? null,
      bboxWidth: log.bboxWidth ?? null,
      bboxHeight: log.bboxHeight ?? null,
      faceCenterX: log.faceCenterX ?? null,
      faceCenterY: log.faceCenterY ?? null,
      faceDistanceCm: log.faceDistanceCm ?? null,
      
      headYaw: log.headYaw ?? null,
      headPitch: log.headPitch ?? null,
      headRoll: log.headRoll ?? null,
      headPoseConfidence: log.headPoseConfidence ?? null,
      
      gazeYaw: log.gazeYaw ?? null,
      gazePitch: log.gazePitch ?? null,
      gazeConfidence: log.gazeConfidence ?? null,
      gazeLeftX: log.gazeLeftX ?? null,
      gazeLeftY: log.gazeLeftY ?? null,
      gazeLeftZ: log.gazeLeftZ ?? null,
      gazeRightX: log.gazeRightX ?? null,
      gazeRightY: log.gazeRightY ?? null,
      gazeRightZ: log.gazeRightZ ?? null,
      
      leftEAR: log.leftEAR ?? null,
      rightEAR: log.rightEAR ?? null,
      leftEyeOpenness: log.leftEyeOpenness ?? null,
      rightEyeOpenness: log.rightEyeOpenness ?? null,
      
      landmarkCount: log.landmarkCount ?? null,
      landmarkConfidence: log.landmarkConfidence ?? null,
      actionUnitsJson: log.actionUnitsJson ? JSON.parse(JSON.stringify(log.actionUnitsJson)) : null,
      
      yoloConfidence: log.yoloConfidence ?? null,
      mediapipeConfidence: log.mediapipeConfidence ?? null,
      dlibConfidence: log.dlibConfidence ?? null,
      openfaceConfidence: log.openfaceConfidence ?? null,
      
      brightnessMean: log.brightnessMean ?? null,
      contrastScore: log.contrastScore ?? null,
      sharpnessScore: log.sharpnessScore ?? log.blurScore ?? null,
      occlusionScore: log.occlusionScore ?? null,
      
      cameraWidth: log.cameraWidth ?? null,
      cameraHeight: log.cameraHeight ?? null,
      detectionFps: log.detectionFps ?? log.cameraFps ?? null,
      cameraStreamFps: log.cameraStreamFps ?? null,
      sampleRateHz: log.sampleRateHz ?? null,

      trackingProfile: log.trackingProfile ?? null,
      userAgent: log.userAgent ?? null,
      researchEligible:
        log.researchEligible !== undefined ? Boolean(log.researchEligible) : null,
      
      isValid: log.isValid !== undefined ? Boolean(log.isValid) : true,
      invalidReason: log.invalidReason ?? null,
      pipelineVersion: log.pipelineVersion ?? null,
      featureSchemaVersion: log.featureSchemaVersion ?? null,
      featureProvenance: log.featureProvenance ? JSON.parse(JSON.stringify(log.featureProvenance)) : null,
    }))

    // Use createMany to insert all logs at once for maximum performance
    const result = await prisma.behaviorFeatureLog.createMany({
      data: logsData
    })

    return NextResponse.json({
      success: true,
      message: `Successfully saved ${result.count} behavior feature logs`,
      count: result.count,
      qa: {
        valid: qaReport.valid,
        errorCount: qaReport.summary.errorCount,
        warnCount: qaReport.summary.warnCount,
      },
    })

  } catch (error: unknown) {
    console.error('Error saving behavior feature logs:', error)

    const prismaCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: string }).code)
        : null

    if (prismaCode === 'P2022') {
      return NextResponse.json(
        {
          error: 'Database schema out of date (missing column on behavior_feature_logs)',
          details:
            'Run: npm run db:catch-up',
          code: 'P2022',
        },
        { status: 503 }
      )
    }

    if (prismaCode === 'P2003') {
      return NextResponse.json(
        { error: 'Tracking session not found', code: 'SESSION_NOT_FOUND' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { 
        error: 'Failed to save behavior feature logs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
