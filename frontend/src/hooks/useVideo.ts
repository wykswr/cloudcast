import { useEffect, useState } from 'react'
import { fetchVideo } from '../lib/api'
import { useLibrary } from '../context/library-context'
import { formatError } from '../utils/format'
import type { VideoItem } from '../types'
import { useInFlightPolling } from './useInFlightPolling'

type Loaded = { id: string; video: VideoItem | null; error: string | null }

/** One video by id, kept current with edits made elsewhere and re-checked while it gets ready. */
export function useVideo(id: string | undefined) {
  const { subscribe } = useLibrary()
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    fetchVideo(id).then(
      (video) => {
        if (!cancelled) setLoaded({ id, video, error: null })
      },
      (error) => {
        if (!cancelled) setLoaded({ id, video: null, error: formatError(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(
    () =>
      subscribe((event) => {
        setLoaded((current) => {
          if (!current?.video) return current
          if (event.type === 'deleted' && event.id === current.video.id) {
            return { ...current, video: null, error: 'Video not found' }
          }
          if (event.type === 'updated' && event.video.id === current.video.id) {
            return { ...current, video: event.video }
          }
          return current
        })
      }),
    [subscribe],
  )

  const current = loaded && loaded.id === id ? loaded : null
  const video = current?.video ?? null
  useInFlightPolling(video ? [video] : [])

  return { video, loading: id !== undefined && current === null, error: current?.error ?? null }
}
