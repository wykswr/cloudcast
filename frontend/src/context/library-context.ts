import { createContext, use } from 'react'
import type { LibrarySummary } from '@cloudcast/contracts'
import type { VideoItem } from '../types'

/** Changes every open list and page applies to its own copy of the videos. */
export type LibraryEvent =
  | { type: 'updated'; video: VideoItem }
  | { type: 'deleted'; id: string }
  /** A new video exists (an upload started); lists reload their first page. */
  | { type: 'added' }

export type LibraryContextValue = {
  summary: LibrarySummary | null
  refreshSummary: () => Promise<void>
  subscribe: (listener: (event: LibraryEvent) => void) => () => void
  /** Tells every list about a video someone fetched fresh (e.g. its status changed). */
  reportVideo: (video: VideoItem) => void
  announceAdded: () => void
  toggleFavorite: (video: VideoItem) => Promise<void>
  renameVideo: (video: VideoItem, title: string) => Promise<void>
  deleteVideo: (video: Pick<VideoItem, 'id'>) => Promise<void>
  getStreamUrl: (videoId: string) => Promise<string>
}

export const LibraryContext = createContext<LibraryContextValue | null>(null)

export function useLibrary(): LibraryContextValue {
  const ctx = use(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider')
  return ctx
}
