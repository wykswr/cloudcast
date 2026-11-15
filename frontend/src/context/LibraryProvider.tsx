import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LibrarySummary } from '@cloudcast/contracts'
import { fetchSummary, removeVideo, requestStream, updateVideo } from '../lib/api'
import { formatError } from '../utils/format'
import type { VideoItem } from '../types'
import { LibraryContext, type LibraryEvent } from './library-context'
import { useToast } from './toast-context'

/**
 * Owns the sidebar summary and the edits people make to videos. Lists keep their own pages and
 * subscribe here, so a rename or delete shows up everywhere at once without refetching.
 */
export function LibraryProvider({ children }: { children: ReactNode }) {
  const { notify } = useToast()
  const [summary, setSummary] = useState<LibrarySummary | null>(null)
  const listeners = useRef(new Set<(event: LibraryEvent) => void>())

  const subscribe = useCallback((listener: (event: LibraryEvent) => void) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  const emit = useCallback((event: LibraryEvent) => {
    for (const listener of listeners.current) listener(event)
  }, [])

  const refreshSummary = useCallback(async () => {
    try {
      setSummary(await fetchSummary())
    } catch {
      // Keep the last summary; lists show their own errors.
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      await refreshSummary()
    }
    void load()
  }, [refreshSummary])

  const reportVideo = useCallback(
    (video: VideoItem) => {
      emit({ type: 'updated', video })
      void refreshSummary()
    },
    [emit, refreshSummary],
  )

  const announceAdded = useCallback(() => {
    emit({ type: 'added' })
    void refreshSummary()
  }, [emit, refreshSummary])

  const toggleFavorite = useCallback(
    async (video: VideoItem) => {
      emit({ type: 'updated', video: { ...video, favorite: !video.favorite } })
      try {
        await updateVideo(video.id, { favorite: !video.favorite })
        void refreshSummary()
      } catch (error) {
        emit({ type: 'updated', video })
        notify({ message: `Couldn’t update favorites: ${formatError(error)}`, tone: 'error' })
      }
    },
    [emit, notify, refreshSummary],
  )

  const renameVideo = useCallback(
    async (video: VideoItem, title: string) => {
      emit({ type: 'updated', video: { ...video, title } })
      try {
        await updateVideo(video.id, { title })
      } catch (error) {
        emit({ type: 'updated', video })
        throw error
      }
    },
    [emit],
  )

  const deleteVideo = useCallback(
    async (video: Pick<VideoItem, 'id'>) => {
      await removeVideo(video.id)
      emit({ type: 'deleted', id: video.id })
      void refreshSummary()
    },
    [emit, refreshSummary],
  )

  const getStreamUrl = useCallback(async (videoId: string) => {
    const data = await requestStream(videoId)
    return data.streamUrl
  }, [])

  const value = useMemo(
    () => ({
      summary,
      refreshSummary,
      subscribe,
      reportVideo,
      announceAdded,
      toggleFavorite,
      renameVideo,
      deleteVideo,
      getStreamUrl,
    }),
    [
      summary,
      refreshSummary,
      subscribe,
      reportVideo,
      announceAdded,
      toggleFavorite,
      renameVideo,
      deleteVideo,
      getStreamUrl,
    ],
  )

  return <LibraryContext value={value}>{children}</LibraryContext>
}
