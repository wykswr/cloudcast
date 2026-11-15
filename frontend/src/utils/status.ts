import type { VideoItem, VideoStatus } from '../types'

/** Uploading or getting ready: not playable yet, so the app keeps checking on it. */
export function isInFlight(video: Pick<VideoItem, 'status'>): boolean {
  return video.status === 'uploading' || video.status === 'processing'
}

/** Plain-language status for people, not the pipeline's names. */
export const STATUS_LABELS: Record<VideoStatus, string> = {
  uploading: 'Uploading',
  processing: 'Getting ready',
  ready: 'Ready',
  failed: 'Failed',
}

export function displayTitle(video: Pick<VideoItem, 'title'>): string {
  return video.title?.trim() || 'Untitled video'
}
