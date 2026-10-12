import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FULL_SWIPE_SECONDS,
  SWIPE_THRESHOLD_PX,
  isSeekSwipe,
  swipeSeekTarget,
} from '../src/components/watch/gestures'
import {
  formatBytes,
  formatClock,
  formatDuration,
  formatError,
  formatRelative,
} from '../src/utils/format'
import { videoArt } from '../src/utils/art'
import { isInFlight } from '../src/utils/status'

afterEach(() => vi.useRealTimers())

describe('format utils', () => {
  it('formats player clocks and durations', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65.9)).toBe('1:05')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(-3)).toBe('0:00')
    expect(formatClock(Number.NaN)).toBe('0:00')
    expect(formatDuration(59.6)).toBe('1:00')
    expect(formatDuration(0)).toBeNull()
    expect(formatDuration(null)).toBeNull()
  })

  it('formats byte sizes', () => {
    expect(formatBytes(undefined)).toBe('—')
    expect(formatBytes(0)).toBe('—')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(150 * 1024 ** 2)).toBe('150 MB')
    expect(formatBytes(1024 ** 5)).toBe('1024 TB')
  })

  it('formats relative times', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10T12:00:00Z'))
    const ago = (seconds: number) => Date.now() / 1000 - seconds
    expect(formatRelative(ago(10))).toBe('just now')
    expect(formatRelative(ago(5 * 60))).toBe('5 min ago')
    expect(formatRelative(ago(3600))).toBe('1 hour ago')
    expect(formatRelative(ago(5 * 3600))).toBe('5 hours ago')
    expect(formatRelative(ago(30 * 3600))).toBe('yesterday')
    expect(formatRelative(ago(3 * 86400))).toBe('3 days ago')
    expect(formatRelative(ago(30 * 86400))).toMatch(/Dec/)
  })

  it('formats unknown errors generically', () => {
    expect(formatError(new Error('Nope'))).toBe('Nope')
    expect(formatError('string')).toBe('Something went wrong')
  })
})

describe('isInFlight', () => {
  it('is true only before the clip is ready or failed', () => {
    expect(isInFlight({ status: 'uploading' })).toBe(true)
    expect(isInFlight({ status: 'processing' })).toBe(true)
    expect(isInFlight({ status: 'ready' })).toBe(false)
    expect(isInFlight({ status: 'failed' })).toBe(false)
  })
})

describe('touch gestures', () => {
  it('treats only clearly horizontal movement as a seek', () => {
    expect(isSeekSwipe(SWIPE_THRESHOLD_PX - 1, 0)).toBe(false)
    expect(isSeekSwipe(SWIPE_THRESHOLD_PX, 0)).toBe(true)
    expect(isSeekSwipe(-20, 5)).toBe(true)
    expect(isSeekSwipe(20, 30)).toBe(false)
  })

  it('maps swipe distance to a clamped playback position', () => {
    // A full-width swipe covers FULL_SWIPE_SECONDS on a long clip...
    expect(swipeSeekTarget(100, 400, 400, 3600)).toBe(100 + FULL_SWIPE_SECONDS)
    // ...or the whole clip when it is shorter.
    expect(swipeSeekTarget(0, 200, 400, 60)).toBe(30)
    expect(swipeSeekTarget(10, -400, 400, 3600)).toBe(0)
    expect(swipeSeekTarget(50, 400, 400, 60)).toBe(60)
    // An unmeasured (zero-width) player must not divide by zero.
    expect(swipeSeekTarget(5, 10, 0, 60)).toBe(60)
  })
})

describe('videoArt', () => {
  it('derives stable placeholder art from the video id', () => {
    expect(videoArt('abc')).toEqual(videoArt('abc'))
    expect(videoArt('abc').gradient).toMatch(/^linear-gradient/)
    const ids = Array.from({ length: 20 }, (_, i) => `video-${i}`)
    expect(new Set(ids.map((id) => videoArt(id).emoji)).size).toBeGreaterThan(1)
  })
})
