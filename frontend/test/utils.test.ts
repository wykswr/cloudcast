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
  formatLongDate,
  formatRelative,
  qualityBadge,
} from '../src/utils/format'
import { videoArt } from '../src/utils/art'
import { STATUS_LABELS, displayTitle, isInFlight } from '../src/utils/status'
import { initials } from '../src/utils/user'
import {
  STRENGTH_LABELS,
  isValidEmail,
  passwordRules,
  passwordScore,
  sanitizeCode,
} from '../src/utils/validation'

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

  it('formats long dates and quality badges', () => {
    expect(formatLongDate(Date.UTC(2026, 10, 13, 12) / 1000)).toBe('Nov 13, 2026')
    expect(qualityBadge(null)).toBeNull()
    expect(qualityBadge(480)).toBeNull()
    expect(qualityBadge(1080)).toBe('HD')
    expect(qualityBadge(2160)).toBe('4K')
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

describe('status labels', () => {
  it('uses plain words and a fallback title', () => {
    expect(STATUS_LABELS.processing).toBe('Getting ready')
    expect(displayTitle({ title: '  Beach day ' })).toBe('Beach day')
    expect(displayTitle({ title: null })).toBe('Untitled video')
    expect(displayTitle({ title: '   ' })).toBe('Untitled video')
  })
})

describe('initials', () => {
  it('uses the first letters of the email name', () => {
    expect(initials('alex.kim@example.com')).toBe('AK')
    expect(initials('sam@example.com')).toBe('SA')
    expect(initials(null)).toBe('ME')
  })
})

describe('validation', () => {
  it('checks emails', () => {
    expect(isValidEmail(' you@example.com ')).toBe(true)
    expect(isValidEmail('you@example')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('scores passwords against the account policy', () => {
    expect(passwordScore('')).toBe(0)
    expect(STRENGTH_LABELS[passwordScore('')]).toBe('Too weak')
    expect(passwordRules('abc12345').map((rule) => rule.ok)).toEqual([true, true, false, false])
    expect(passwordScore('Abc12345!')).toBe(4)
    expect(STRENGTH_LABELS[passwordScore('Abc12345!')]).toBe('Strong')
  })

  it('keeps only the digits of a one-time code', () => {
    expect(sanitizeCode('12 34-56 78')).toBe('123456')
    expect(sanitizeCode('ab1', 4)).toBe('1')
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
    expect(videoArt('abc').sky).toMatch(/^#[0-9a-f]{6}$/)
    const ids = Array.from({ length: 20 }, (_, i) => `video-${i}`)
    expect(new Set(ids.map((id) => videoArt(id).sky)).size).toBeGreaterThan(1)
    for (const id of ids) {
      const { sunLeft, sunTop } = videoArt(id)
      expect(sunLeft).toBeGreaterThanOrEqual(14)
      expect(sunLeft).toBeLessThan(74)
      expect(sunTop).toBeGreaterThanOrEqual(16)
      expect(sunTop).toBeLessThan(38)
    }
  })
})
