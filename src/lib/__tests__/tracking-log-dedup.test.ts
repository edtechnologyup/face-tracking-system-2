import { describe, expect, it } from 'vitest'
import {
  buildTrackingLogFingerprint,
  filterNewTrackingLogs,
} from '@/lib/tracking-log-dedup'

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
