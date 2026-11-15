import { createContext, use } from 'react'
import type { QueueItem, QueueSummary } from '../lib/upload-queue'

export type UploadsContextValue = {
  items: QueueItem[]
  summary: QueueSummary
  addFiles: (files: Iterable<File>) => void
  setTitle: (key: string, title: string) => void
  /** Queues every draft; files upload one after another. */
  startAll: () => void
  pause: (key: string) => void
  resume: (key: string) => void
  /** Removes an item, cancelling (and cleaning up) an upload that has not finished. */
  remove: (key: string) => void
  clearFinished: () => void
  /** Upload progress for a video this tab is uploading, if any. */
  progressFor: (videoId: string) => number | undefined
}

export const UploadsContext = createContext<UploadsContextValue | null>(null)

export function useUploads(): UploadsContextValue {
  const ctx = use(UploadsContext)
  if (!ctx) throw new Error('useUploads must be used within UploadsProvider')
  return ctx
}
