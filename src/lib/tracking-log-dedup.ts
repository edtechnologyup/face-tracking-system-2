import type { DetectionType, Prisma } from '@prisma/client'

type JsonObject = Record<string, unknown>

/** Stable key per logical event — used for append-only dedup across 15s syncs. */
export function buildTrackingLogFingerprint(
  detectionType: DetectionType,
  detectionData: JsonObject | null | undefined
): string | null {
  if (!detectionData || typeof detectionData !== 'object') return null

  switch (detectionType) {
    case 'FACE_ORIENTATION': {
      const direction = detectionData.direction
      const startTime = detectionData.startTime
      const endTime = detectionData.endTime
      if (typeof direction !== 'string' || typeof startTime !== 'string') return null
      return `O:${direction}:${startTime}:${endTime ?? ''}`
    }
    case 'FACE_DETECTION_LOSS': {
      const startTime = detectionData.startTime
      const endTime = detectionData.endTime
      if (typeof startTime !== 'string') return null
      return `L:${startTime}:${endTime ?? ''}:${String(detectionData.isMismatch ?? false)}`
    }
    case 'SECURITY_VIOLATION': {
      const violationType = detectionData.violationType
      const timestamp = detectionData.timestamp
      if (typeof violationType !== 'string' || typeof timestamp !== 'string') return null
      return `S:${violationType}:${timestamp}`
    }
    default:
      return null
  }
}

export function fingerprintFromExistingLog(log: {
  detectionType: DetectionType
  detectionData: unknown
}): string | null {
  if (!log.detectionData || typeof log.detectionData !== 'object' || Array.isArray(log.detectionData)) {
    return null
  }
  return buildTrackingLogFingerprint(log.detectionType, log.detectionData as JsonObject)
}

/** Keep only logs whose fingerprint is not already stored for this session. */
export function filterNewTrackingLogs<
  T extends Pick<Prisma.TrackingLogCreateManyInput, 'detectionType' | 'detectionData'>,
>(logsData: T[], existingFingerprints: ReadonlySet<string>): T[] {
  const seen = new Set(existingFingerprints)
  const batch = new Set<string>()
  const result: T[] = []

  for (const log of logsData) {
    const fp = buildTrackingLogFingerprint(
      log.detectionType as DetectionType,
      log.detectionData as JsonObject
    )
    if (!fp) {
      result.push(log)
      continue
    }
    if (seen.has(fp) || batch.has(fp)) continue
    batch.add(fp)
    result.push(log)
  }

  return result
}
