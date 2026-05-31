import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatBytes,
  formatDuration,
  formatError,
  formatRelative,
} from './format'

describe('formatBytes', () => {
  it('returns a dash for missing or non-positive values', () => {
    expect(formatBytes(0)).toBe('—')
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(undefined)).toBe('—')
    expect(formatBytes(-5)).toBe('—')
  })

  it('formats raw bytes with no decimals', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('uses one decimal place for small magnitudes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB')
  })

  it('rounds when the value is >= 100', () => {
    expect(formatBytes(150 * 1024)).toBe('150 KB')
  })

  it('caps the unit at TB', () => {
    expect(formatBytes(1024 ** 5)).toBe('1024 TB')
  })
})

describe('formatDuration', () => {
  it('returns null for missing or non-positive values', () => {
    expect(formatDuration(0)).toBeNull()
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(undefined)).toBeNull()
  })

  it('formats minutes:seconds with zero padding', () => {
    expect(formatDuration(59)).toBe('0:59')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(600)).toBe('10:00')
  })

  it('formats hours:minutes:seconds when over an hour', () => {
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(3661)).toBe('1:01:01')
  })
})

describe('formatRelative', () => {
  const NOW = new Date('2026-05-30T12:00:00Z').getTime()

  afterEach(() => {
    vi.useRealTimers()
  })

  const at = (offsetMs: number) => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    return (NOW - offsetMs) / 1000
  }

  it('handles the recent buckets', () => {
    expect(formatRelative(at(0))).toBe('just now')
    expect(formatRelative(at(5 * 60_000))).toBe('5 min ago')
    expect(formatRelative(at(60 * 60_000))).toBe('1 hour ago')
    expect(formatRelative(at(3 * 60 * 60_000))).toBe('3 hours ago')
    expect(formatRelative(at(24 * 60 * 60_000))).toBe('yesterday')
    expect(formatRelative(at(3 * 24 * 60 * 60_000))).toBe('3 days ago')
  })

  it('falls back to an absolute date beyond a week', () => {
    const result = formatRelative(at(10 * 24 * 60 * 60_000))
    expect(result).not.toMatch(/ago|just now|yesterday/)
  })
})

describe('formatError', () => {
  it('returns the message of an Error', () => {
    expect(formatError(new Error('boom'))).toBe('boom')
  })

  it('returns a generic message for non-Error values', () => {
    expect(formatError('nope')).toBe('Something went wrong')
    expect(formatError(null)).toBe('Something went wrong')
  })
})
