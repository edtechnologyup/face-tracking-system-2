import { describe, expect, it } from 'vitest'
import {
  calcVideoDisplayCoordinates,
  normalizedLandmarkToCanvas,
  videoPixelToCanvas,
} from '@/lib/video-display-coordinates'

describe('calcVideoDisplayCoordinates', () => {
  const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement

  it('cover: portrait container crops wide video horizontally', () => {
    const coords = calcVideoDisplayCoordinates(video, 360, 480, 'cover')
    expect(coords.scaleY).toBe(480)
    expect(coords.scaleX).toBeGreaterThan(360)
    expect(coords.offsetX).toBeLessThan(0)
    expect(coords.offsetY).toBe(0)

    const center = videoPixelToCanvas(320, 240, coords)
    expect(center.x).toBeCloseTo(180, 0)
    expect(center.y).toBeCloseTo(240, 0)
  })

  it('contain: portrait container letterboxes vertically', () => {
    const coords = calcVideoDisplayCoordinates(video, 360, 480, 'contain')
    expect(coords.scaleX).toBe(360)
    expect(coords.scaleY).toBe(270)
    expect(coords.offsetX).toBe(0)
    expect(coords.offsetY).toBe(105)

    const center = normalizedLandmarkToCanvas(0.5, 0.5, coords)
    expect(center.x).toBeCloseTo(180, 0)
    expect(center.y).toBeCloseTo(240, 0)
  })

  it('cover: matching aspect has zero offset', () => {
    const coords = calcVideoDisplayCoordinates(video, 640, 480, 'cover')
    expect(coords.offsetX).toBe(0)
    expect(coords.offsetY).toBe(0)
    expect(coords.scaleX).toBe(640)
    expect(coords.scaleY).toBe(480)
  })
})
