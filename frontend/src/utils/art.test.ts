import { describe, expect, it } from 'vitest'
import { videoArt } from './art'

describe('videoArt', () => {
  it('is deterministic for a given id', () => {
    expect(videoArt('abc-123')).toEqual(videoArt('abc-123'))
  })

  it('returns a gradient and an emoji from the known sets', () => {
    const { gradient, emoji } = videoArt('some-video-id')
    expect(gradient).toMatch(/^linear-gradient\(135deg,/)
    expect(emoji).toBeTruthy()
    expect([...emoji].length).toBeGreaterThan(0)
  })

  it('produces different art for different ids', () => {
    // Across a spread of ids we expect more than one distinct rendering.
    const seen = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(
        (id) => videoArt(id).gradient + videoArt(id).emoji,
      ),
    )
    expect(seen.size).toBeGreaterThan(1)
  })
})
