import { describe, expect, it } from 'vitest'
import {
  buildTrackingLogFingerprint,
  filterNewTrackingLogs,
  filterOrientationEventsForTrackingLog,
  isSustainedOrientationEvent,
} from '@/lib/tracking-log-dedup'
import { SUSTAINED_DURATION_SEC } from '@/lib/cbmi-parameters'

describe('isSustainedOrientationEvent', () => {
  it('requires duration >= SUSTAINED_DURATION_SEC', () => {
    expect(isSustainedOrientationEvent(SUSTAINED_DURATION_SEC)).toBe(true)
    expect(isSustainedOrientationEvent(SUSTAINED_DURATION_SEC - 0.01)).toBe(false)
    expect(isSustainedOrientationEvent(undefined)).toBe(false)
  })
})

describe('filterOrientationEventsForTrackingLog', () => {
  it('keeps completed non-CENTER events at or above 2 seconds', () => {
    const filtered = filterOrientationEventsForTrackingLog([
      { direction: 'CENTER', endTime: '10:00:02', duration: 5, isActive: false },
      { direction: 'LEFT', endTime: '10:00:02', duration: 1.9, isActive: false },
      { direction: 'RIGHT', endTime: '10:00:05', duration: 2, isActive: false },
      { direction: 'DOWN', endTime: undefined, duration: 3, isActive: false },
      { direction: 'UP', endTime: '10:00:08', duration: 4, isActive: true },
    ])
    expect(filtered.map((e) => e.direction)).toEqual(['RIGHT'])
  })
})

describe('buildTrackingLogFingerprint', () => {
  it('orientation uses direction + start/end HH:mm:ss', () => {
    const fp = buildTrackingLogFingerprint('FACE_ORIENTATION', {
      direction: 'LEFT',
      startTime: '10:44:31',
      endTime: '10:44:32',
      duration: 1,
    })
    expect(fp).toBe('O:LEFT:10:44:31:10:44:32')
  })

  it('security violation uses violationType + ISO timestamp', () => {
    const fp = buildTrackingLogFingerprint('SECURITY_VIOLATION', {
      violationType: 'LOOKING_AWAY_EXCEEDED',
      timestamp: '2026-08-27T03:44:53.659Z',
      message: 'test',
    })
    expect(fp).toBe('S:LOOKING_AWAY_EXCEEDED:2026-08-27T03:44:53.659Z')
  })

  it('face loss uses start/end + mismatch flag', () => {
    const fp = buildTrackingLogFingerprint('FACE_DETECTION_LOSS', {
      startTime: '10:44:35',
      endTime: '10:44:36',
      isMismatch: false,
    })
    expect(fp).toBe('L:10:44:35:10:44:36:false')
  })
})

describe('filterNewTrackingLogs', () => {
  it('drops duplicates against DB and within the same batch', () => {
    const existing = new Set(['O:LEFT:10:44:31:10:44:32'])
    const logs = [
      {
        detectionType: 'FACE_ORIENTATION' as const,
        detectionData: {
          direction: 'LEFT',
          startTime: '10:44:31',
          endTime: '10:44:32',
        },
      },
      {
        detectionType: 'FACE_ORIENTATION' as const,
        detectionData: {
          direction: 'RIGHT',
          startTime: '10:44:34',
          endTime: '10:44:36',
        },
      },
      {
        detectionType: 'FACE_ORIENTATION' as const,
        detectionData: {
          direction: 'RIGHT',
          startTime: '10:44:34',
          endTime: '10:44:36',
        },
      },
    ]

    const filtered = filterNewTrackingLogs(logs, existing)
    expect(filtered).toHaveLength(1)
    expect((filtered[0].detectionData as { direction: string }).direction).toBe('RIGHT')
  })
})
