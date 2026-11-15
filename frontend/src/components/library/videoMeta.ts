import { formatBytes, formatRelative } from '../../utils/format'
import type { VideoItem } from '../../types'

/** The grey line under a video title. */
export function videoMeta(video: VideoItem): string {
  const size = formatBytes(video.sizeBytes)
  switch (video.status) {
    case 'uploading':
      return size === '—' ? 'Uploading' : `Uploading · ${size}`
    case 'processing':
      return size === '—' ? 'Almost ready to watch' : `Almost ready to watch · ${size}`
    case 'failed':
      return 'This video couldn’t be prepared'
    default:
      return [formatRelative(video.createdAt), size].filter((part) => part !== '—').join(' · ')
  }
}
