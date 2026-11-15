import { useEffect } from 'react'
import { fetchVideo } from '../lib/api'
import { useLibrary } from '../context/library-context'
import { isInFlight } from '../utils/status'
import type { VideoItem } from '../types'

const POLL_MS = 5000

/** Re-checks videos that are uploading or getting ready, and reports any whose status changed. */
export function useInFlightPolling(videos: VideoItem[]) {
  const { reportVideo } = useLibrary()
  const watching = videos
    .filter(isInFlight)
    .map((video) => `${video.id}:${video.status}`)
    .join(',')

  useEffect(() => {
    if (!watching) return
    const entries = watching.split(',').map((pair) => pair.split(':'))
    const timer = window.setInterval(async () => {
      for (const [id, status] of entries) {
        try {
          const fresh = await fetchVideo(id)
          if (fresh.status !== status) reportVideo(fresh)
        } catch {
          // Try again on the next tick.
        }
      }
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [watching, reportVideo])
}
