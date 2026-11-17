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

/**
 * Width for a progress bar, so a bar that has only just started still shows a sliver. Unknown
 * progress fills the bar; it then carries the moving stripes alone.
 */
export function barWidth(percent: number | undefined): string {
  return percent === undefined ? '100%' : `${Math.min(100, Math.max(2, percent))}%`
}

export function displayTitle(video: Pick<VideoItem, 'title'>): string {
  return video.title?.trim() || 'Untitled video'
}
