/**
 * State for the upload page and tray. Pure, so the transitions are testable; the provider that
 * owns it (UploadsContext) runs the actual uploads.
 *
 * draft -> queued -> uploading <-> paused -> processing -> ready | failed
 *                        \-> error (retry resumes)            skipped: not a video
 */
export type QueueStage =
  | 'draft'
  | 'queued'
  | 'uploading'
  | 'paused'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'error'
  | 'skipped'

export type QueueItem = {
  key: string
  name: string
  size: number
  title: string
  stage: QueueStage
  percent: number
  sentBytes: number
  videoId?: string
  error?: string
}

export type QueueAction =
  | { type: 'add'; items: QueueItem[] }
  | { type: 'title'; key: string; title: string }
  | { type: 'start' }
  | { type: 'stage'; key: string; stage: QueueStage; error?: string }
  | { type: 'progress'; key: string; percent: number; sentBytes: number; videoId?: string }
  | { type: 'remove'; key: string }
  | { type: 'clear-finished' }

const FINISHED: QueueStage[] = ['ready', 'failed', 'skipped']
/** Stages that still need this tab: uploading or waiting to upload. */
const SENDING: QueueStage[] = ['queued', 'uploading', 'paused', 'error']

export function isFinished(stage: QueueStage) {
  return FINISHED.includes(stage)
}

export function isSending(stage: QueueStage) {
  return SENDING.includes(stage)
}

export function queueReducer(items: QueueItem[], action: QueueAction): QueueItem[] {
  const patch = (key: string, change: Partial<QueueItem>) =>
    items.map((item) => (item.key === key ? { ...item, ...change } : item))
  switch (action.type) {
    case 'add':
      return [...items, ...action.items]
    case 'title':
      return patch(action.key, { title: action.title })
    case 'start':
      return items.map((item) =>
        item.stage === 'draft'
          ? { ...item, stage: 'queued', title: item.title.trim() || item.name }
          : item,
      )
    case 'stage':
      return patch(action.key, { stage: action.stage, error: action.error })
    case 'progress':
      return items.map((item) =>
        item.key === action.key
          ? {
              ...item,
              percent: action.percent,
              sentBytes: action.sentBytes,
              videoId: action.videoId ?? item.videoId,
            }
          : item,
      )
    case 'remove':
      return items.filter((item) => item.key !== action.key)
    case 'clear-finished':
      return items.filter((item) => !isFinished(item.stage))
  }
}

/** The next item to upload, if nothing is uploading right now (one file at a time). */
export function nextToUpload(items: QueueItem[]): QueueItem | undefined {
  if (items.some((item) => item.stage === 'uploading')) return undefined
  return items.find((item) => item.stage === 'queued')
}

export type QueueSummary = {
  drafts: number
  /** Queued, uploading, paused, errored or getting ready. */
  inProgress: number
  ready: number
  /** Upload progress across files still sending, 0-100. */
  percent: number
}

export function summarizeQueue(items: QueueItem[]): QueueSummary {
  const sending = items.filter((item) => isSending(item.stage))
  const total = sending.reduce((sum, item) => sum + item.size, 0)
  const sent = sending.reduce((sum, item) => sum + item.sentBytes, 0)
  return {
    drafts: items.filter((item) => item.stage === 'draft').length,
    inProgress: items.filter((item) => isSending(item.stage) || item.stage === 'processing').length,
    ready: items.filter((item) => item.stage === 'ready').length,
    percent: total > 0 ? Math.min(100, Math.floor((sent / total) * 100)) : 0,
  }
}
