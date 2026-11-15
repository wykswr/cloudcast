import { useCallback, useEffect, useState } from 'react'
import type { VideoListFilter, VideoListOrder } from '@cloudcast/contracts'
import { fetchVideoPage } from '../lib/api'
import { useLibrary } from '../context/library-context'
import { formatError } from '../utils/format'
import { isInFlight } from '../utils/status'
import type { VideoItem } from '../types'
import { useInFlightPolling } from './useInFlightPolling'

export type VideoPageParams = {
  filter: VideoListFilter
  q?: string
  order?: VideoListOrder
  pageSize?: number
}

type Loaded = {
  key: string
  items: VideoItem[]
  cursor: string | null
  error: string | null
}

/** Whether a video still belongs in a filtered view after it changed. */
function stillMatches(video: VideoItem, filter: VideoListFilter) {
  if (filter === 'favorites') return video.favorite
  if (filter === 'in-progress') return isInFlight(video)
  if (filter === 'ready') return video.status === 'ready'
  return true
}

/**
 * A server-paged library list: the first page loads whenever the filter, search or order changes,
 * `loadMore` appends the next one, and edits made anywhere in the app are applied in place.
 */
export function useVideoPage({ filter, q = '', order = 'newest', pageSize = 24 }: VideoPageParams) {
  const { subscribe } = useLibrary()
  const [reloads, setReloads] = useState(0)
  const key = JSON.stringify([filter, q.trim(), order, pageSize, reloads])
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchVideoPage({ filter, q, order, limit: pageSize }).then(
      (page) => {
        if (!cancelled) setLoaded({ key, items: page.items, cursor: page.nextCursor, error: null })
      },
      (error) => {
        if (!cancelled) setLoaded({ key, items: [], cursor: null, error: formatError(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, filter, q, order, pageSize])

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'added') {
          setReloads((n) => n + 1)
          return
        }
        setLoaded((current) => {
          if (!current) return current
          const items =
            event.type === 'deleted'
              ? current.items.filter((video) => video.id !== event.id)
              : current.items.flatMap((video) => {
                  if (video.id !== event.video.id) return [video]
                  return stillMatches(event.video, filter) ? [event.video] : []
                })
          return { ...current, items }
        })
      }),
    [subscribe, filter],
  )

  const loading = loaded?.key !== key
  const items = loaded?.items ?? []
  useInFlightPolling(items)

  const cursor = loading ? null : (loaded?.cursor ?? null)
  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const page = await fetchVideoPage({ filter, q, order, limit: pageSize, cursor })
      setLoaded((current) => {
        if (!current || current.key !== key) return current
        const seen = new Set(current.items.map((video) => video.id))
        return {
          ...current,
          items: [...current.items, ...page.items.filter((video) => !seen.has(video.id))],
          cursor: page.nextCursor,
        }
      })
    } catch (error) {
      setMoreError(formatError(error))
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, loadingMore, filter, q, order, pageSize, key])

  const reload = useCallback(() => setReloads((n) => n + 1), [])

  return {
    items,
    /** True until the current filter/search has its first page (the previous items stay visible). */
    loading,
    /** True only before anything has loaded at all. */
    initialLoading: loaded === null,
    error: loading ? null : (loaded?.error ?? null),
    hasMore: cursor !== null,
    loadMore,
    loadingMore,
    moreError,
    reload,
  }
}
