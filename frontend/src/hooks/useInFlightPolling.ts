import { useEffect } from 'react'
import { fetchVideo } from '../lib/api'
import { useLibrary } from '../context/library-context'
import { isInFlight } from '../utils/status'
import type { VideoItem } from '../types'

const POLL_MS = 5000

/**
 * Re-checks videos that are uploading or getting ready, and reports any whose status or
 * processing progress changed.
 */
export function useInFlightPolling(videos: VideoItem[]) {
  const { reportVideo } = useLibrary()
  const watching = videos
    .filter(isInFlight)
    .map((video) => `${video.id}:${video.status}:${video.processingPercent ?? ''}`)
    .join(',')

  useEffect(() => {
    if (!watching) return
    const entries = watching.split(',').map((entry) => entry.split(':'))
    const timer = window.setInterval(async () => {
      for (const [id, status, percent] of entries) {
        try {
          const fresh = await fetchVideo(id)
          if (fresh.status !== status) reportVideo(fresh)
          else if (String(fresh.processingPercent ?? '') !== percent) {
            reportVideo(fresh, { summary: false })
          }
        } catch {
          // Try again on the next tick.
        }
      }
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [watching, reportVideo])
}
