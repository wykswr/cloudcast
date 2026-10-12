import type { VideoItem } from '../types'

/** Uploading or transcoding: not playable yet, and the library keeps polling for it. */
export function isInFlight(video: Pick<VideoItem, 'status'>): boolean {
  return video.status === 'uploading' || video.status === 'processing'
}
