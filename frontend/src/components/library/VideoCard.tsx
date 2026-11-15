import { Link } from 'react-router-dom'
import { useUploads } from '../../context/uploads-context'
import type { VideoActions } from '../../hooks/useVideoActions'
import { formatDuration } from '../../utils/format'
import { displayTitle, isInFlight } from '../../utils/status'
import type { VideoItem } from '../../types'
import Thumbnail from '../common/Thumbnail'
import { AlertIcon, PlayIcon } from '../common/icons'
import FavoriteButton from './FavoriteButton'
import VideoMenu from './VideoMenu'
import { videoMeta } from './videoMeta'

function VideoCard({ video, actions }: { video: VideoItem; actions: VideoActions }) {
  const { progressFor } = useUploads()
  const ready = video.status === 'ready'
  const title = displayTitle(video)
  const duration = formatDuration(video.durationSeconds)
  const percent = video.status === 'uploading' ? progressFor(video.id) : undefined

  return (
    <article className="group relative flex min-w-0 flex-col gap-3">
      <Thumbnail videoId={video.id} className="rounded-xl" zoomOnHover={ready}>
        {ready ? (
          <>
            <Link
              to={`/watch/${video.id}`}
              aria-label={`Play ${title}`}
              className="absolute inset-0 grid place-items-center"
            >
              <span className="grid size-[52px] place-items-center rounded-full bg-white/95 text-ink opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <PlayIcon className="size-[22px]" />
              </span>
            </Link>
            {duration ? (
              <span className="font-tabular pointer-events-none absolute right-2 bottom-2 rounded-md bg-[rgba(14,16,20,0.78)] px-1.5 py-0.5 text-xs font-semibold text-white">
                {duration}
              </span>
            ) : null}
          </>
        ) : null}

        {isInFlight(video) ? (
          <div className="absolute inset-0 flex flex-col justify-end gap-2 bg-[rgba(14,16,20,0.55)] p-3 text-white">
            <div className="flex justify-between text-xs font-semibold">
              <span>{video.status === 'uploading' ? 'Uploading' : 'Getting it ready'}</span>
              {percent !== undefined ? <span className="font-tabular">{percent}%</span> : null}
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/25">
              <div
                className={`cc-busy h-full rounded-full ${video.status === 'uploading' ? 'bg-[#7d93ff]' : 'bg-[#f0a250]'}`}
                style={{ width: percent !== undefined ? `${percent}%` : '100%' }}
              />
            </div>
          </div>
        ) : null}

        {video.status === 'failed' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-bad-soft text-bad">
            <AlertIcon className="size-[26px]" />
            <span className="text-[13px] font-semibold">Something went wrong</span>
            <button
              type="button"
              onClick={() => actions.askDelete(video)}
              className="h-[34px] rounded-lg border border-[#e8bfb6] bg-white px-3.5 text-[13px] font-semibold text-bad"
            >
              Delete
            </button>
          </div>
        ) : null}

        <FavoriteButton video={video} onToggle={() => actions.toggleFavorite(video)} />
      </Thumbnail>

      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="m-0 truncate text-[15px] font-semibold">
            {ready ? (
              <Link to={`/watch/${video.id}`} className="text-ink no-underline hover:underline">
                {title}
              </Link>
            ) : (
              title
            )}
          </h3>
          <span className={`text-[13px] ${video.status === 'failed' ? 'text-bad' : 'text-ink-3'}`}>
            {videoMeta(video)}
          </span>
        </div>
        <VideoMenu video={video} actions={actions} />
      </div>
    </article>
  )
}

export function VideoCardSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-2.5">
      <div className="cc-skeleton aspect-video rounded-xl" />
      <div className="cc-skeleton h-3.5 w-3/4 rounded-md" />
      <div className="cc-skeleton h-3 w-[45%] rounded-md" />
    </div>
  )
}

export default VideoCard
