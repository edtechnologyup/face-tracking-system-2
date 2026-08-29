import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/utils/rate-limiter'

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
    const { allowed } = rateLimit(`behavior:${sessionId}`, 30, 3)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    if (!logs || !Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json(
        { error: 'No logs provided or invalid format' },
        { status: 400 }
      )
    }

    // Cap batch size to prevent oversized payloads crashing the server
    const MAX_BATCH_SIZE = 100
    const safeLogs = logs.slice(0, MAX_BATCH_SIZE)

    // Prepare data for batch insert
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logsData = safeLogs.map((log: any) => ({
      sessionId: sessionId,
      participantCode: log.participantCode || null,
      timestamp: log.timestamp ? new Date(log.timestamp) : new Date(),
      elapsedMs: log.elapsedMs ?? 0,
      sampleIndex: log.sampleIndex ?? 0,
      scenario: log.scenario ?? null,
      
      phase: Array.isArray(log.phase) ? log.phase : (log.phase ? [log.phase] : []),
      
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
      blurScore: log.blurScore ?? null,
      occlusionScore: log.occlusionScore ?? null,
      
      cameraWidth: log.cameraWidth ?? null,
      cameraHeight: log.cameraHeight ?? null,
      cameraFps: log.cameraFps ?? null,
      
      isValid: log.isValid !== undefined ? Boolean(log.isValid) : true,
      invalidReason: log.invalidReason ?? null,
      pipelineVersion: log.pipelineVersion ?? null,
      featureSchemaVersion: log.featureSchemaVersion ?? null,
    }))

    // Use createMany to insert all logs at once for maximum performance
    const result = await prisma.behaviorFeatureLog.createMany({
      data: logsData
    })

    return NextResponse.json({
      success: true,
      message: `Successfully saved ${result.count} behavior feature logs`,
      count: result.count
    })

  } catch (error: unknown) {
    console.error('Error saving behavior feature logs:', error)
    return NextResponse.json(
      { 
        error: 'Failed to save behavior feature logs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
