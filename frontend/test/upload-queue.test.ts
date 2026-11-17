import { describe, expect, it } from 'vitest'
import {
  isFinished,
  isSending,
  nextToUpload,
  queueReducer,
  summarizeQueue,
  type QueueItem,
} from '../src/lib/upload-queue'

const item = (key: string, patch: Partial<QueueItem> = {}): QueueItem => ({
  key,
  name: `${key}.mp4`,
  size: 100,
  title: key,
  stage: 'draft',
  percent: 0,
  sentBytes: 0,
  ...patch,
})

describe('upload queue', () => {
  it('adds, retitles and queues drafts, falling back to the file name for blank titles', () => {
    let items = queueReducer([], {
      type: 'add',
      items: [item('a'), item('b'), item('c', { stage: 'skipped' })],
    })
    items = queueReducer(items, { type: 'title', key: 'a', title: 'Beach day' })
    items = queueReducer(items, { type: 'title', key: 'b', title: '   ' })
    items = queueReducer(items, { type: 'start' })
    expect(items.map((entry) => [entry.stage, entry.title])).toEqual([
      ['queued', 'Beach day'],
      ['queued', 'b.mp4'],
      ['skipped', 'c'],
    ])
  })

  it('tracks progress, stages and removal', () => {
    let items = [item('a', { stage: 'uploading', videoId: 'v1' }), item('b')]
    items = queueReducer(items, { type: 'progress', key: 'a', percent: 40, sentBytes: 40 })
    expect(items[0]).toMatchObject({ percent: 40, sentBytes: 40, videoId: 'v1' })
    items = queueReducer(items, {
      type: 'progress',
      key: 'b',
      percent: 1,
      sentBytes: 1,
      videoId: 'v2',
    })
    expect(items[1].videoId).toBe('v2')
    items = queueReducer(items, { type: 'stage', key: 'a', stage: 'error', error: 'Offline' })
    expect(items[0]).toMatchObject({ stage: 'error', error: 'Offline' })
    items = queueReducer(items, { type: 'remove', key: 'b' })
    expect(items.map((entry) => entry.key)).toEqual(['a'])
  })

  it('records how far processing has got', () => {
    const items = queueReducer([item('a', { stage: 'processing' }), item('b')], {
      type: 'processing',
      key: 'a',
      percent: 42,
    })
    expect(items.map((entry) => entry.processingPercent)).toEqual([42, undefined])
    // A poll that brings the same number back changes nothing, so nothing re-renders.
    expect(queueReducer(items, { type: 'processing', key: 'a', percent: 42 })).toBe(items)
  })

  it('clears only finished items', () => {
    const items = [
      item('ready', { stage: 'ready' }),
      item('failed', { stage: 'failed' }),
      item('skipped', { stage: 'skipped' }),
      item('processing', { stage: 'processing' }),
      item('draft'),
    ]
    expect(queueReducer(items, { type: 'clear-finished' }).map((entry) => entry.key)).toEqual([
      'processing',
      'draft',
    ])
    expect(isFinished('ready')).toBe(true)
    expect(isSending('paused')).toBe(true)
    expect(isSending('processing')).toBe(false)
  })

  it('uploads one file at a time, in order', () => {
    expect(
      nextToUpload([item('a', { stage: 'queued' }), item('b', { stage: 'queued' })])?.key,
    ).toBe('a')
    expect(
      nextToUpload([item('a', { stage: 'uploading' }), item('b', { stage: 'queued' })]),
    ).toBeUndefined()
    expect(
      nextToUpload([item('a', { stage: 'paused' }), item('b', { stage: 'queued' })])?.key,
    ).toBe('b')
    expect(nextToUpload([item('a')])).toBeUndefined()
  })

  it('summarizes counts and overall progress across files still sending', () => {
    expect(summarizeQueue([])).toEqual({ drafts: 0, inProgress: 0, ready: 0, percent: 0 })
    expect(
      summarizeQueue([
        item('a', { stage: 'uploading', size: 300, sentBytes: 150 }),
        item('b', { stage: 'queued', size: 100 }),
        item('c', { stage: 'processing', size: 999, sentBytes: 999 }),
        item('d', { stage: 'ready' }),
        item('e'),
      ]),
    ).toEqual({ drafts: 1, inProgress: 3, ready: 1, percent: 37 })
  })
})
