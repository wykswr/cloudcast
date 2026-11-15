import { Link } from 'react-router-dom'
import type { VideoActions } from '../../hooks/useVideoActions'
import { formatBytes, formatDuration, formatRelative } from '../../utils/format'
import { displayTitle } from '../../utils/status'
import type { VideoItem } from '../../types'
import StatusBadge from '../common/StatusBadge'
import Thumbnail from '../common/Thumbnail'
import { HeartFilledIcon, HeartIcon, PencilIcon, TrashIcon } from '../common/icons'

/** The list layout: one row per video with its details in columns. */
function VideoTable({ videos, actions }: { videos: VideoItem[]; actions: VideoActions }) {
  return (
    <div className="surface overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-2">
            <th className="px-4 py-3 font-semibold">Video</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Length</th>
            <th className="px-4 py-3 font-semibold">Size</th>
            <th className="px-4 py-3 font-semibold">Uploaded</th>
            <th className="w-[132px] px-4 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => {
            const title = displayTitle(video)
            return (
              <tr key={video.id} className="border-t border-[#ecece8] hover:bg-[#fafaf8]">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-3.5">
                    <Thumbnail videoId={video.id} className="w-28 shrink-0 rounded-lg" />
                    {video.status === 'ready' ? (
                      <Link
                        to={`/watch/${video.id}`}
                        className="font-semibold text-ink no-underline hover:underline"
                      >
                        {title}
                      </Link>
                    ) : (
                      <span className="font-semibold">{title}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={video.status} />
                </td>
                <td className="font-tabular px-4 py-2.5 whitespace-nowrap text-ink-2">
                  {formatDuration(video.durationSeconds) ?? '—'}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-ink-2">
                  {formatBytes(video.sizeBytes)}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-ink-2">
                  {formatRelative(video.createdAt)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => actions.toggleFavorite(video)}
                      aria-pressed={video.favorite}
                      aria-label={
                        video.favorite
                          ? `Remove ${title} from favorites`
                          : `Add ${title} to favorites`
                      }
                    >
                      {video.favorite ? (
                        <HeartFilledIcon className="size-[18px] text-heart" />
                      ) : (
                        <HeartIcon />
                      )}
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => actions.startRename(video)}
                      aria-label={`Rename ${title}`}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => actions.askDelete(video)}
                      aria-label={`Delete ${title}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default VideoTable
