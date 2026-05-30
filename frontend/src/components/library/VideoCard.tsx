import { useNavigate } from 'react-router-dom'
import StatusBadge from '../common/StatusBadge'
import { useVideos } from '../../context/videos-context'
import { videoArt } from '../../utils/art'
import { formatBytes, formatDuration, formatRelative } from '../../utils/format'
import type { VideoItem } from '../../types'

type VideoCardProps = {
  video: VideoItem
  onRename: (video: VideoItem) => void
  onDelete: (video: VideoItem) => void
}

function VideoCard({ video, onRename, onDelete }: VideoCardProps) {
  const navigate = useNavigate()
  const { toggleFavorite } = useVideos()
  const { gradient, emoji } = videoArt(video.id)
  const ready = video.status === 'ready'
  const duration = formatDuration(video.durationSeconds)

  const meta =
    video.status === 'processing'
      ? 'cooking your video…'
      : video.status === 'uploading'
        ? 'uploading…'
        : video.status === 'failed'
          ? 'tap to retry'
          : [formatRelative(video.createdAt), formatBytes(video.sizeBytes)]
              .filter((p) => p && p !== '—')
              .join(' · ')

  const openWatch = () => {
    if (ready) navigate(`/watch/${video.id}`)
  }

  return (
    <div className="group relative overflow-hidden rounded-[20px] bg-white shadow-[0_14px_30px_-18px_rgba(167,139,250,0.5)] transition hover:-translate-y-1.5 hover:shadow-[0_24px_44px_-18px_rgba(255,93,143,0.5)]">
      <div
        onClick={openWatch}
        className={`relative grid aspect-video place-items-center text-4xl ${ready ? 'cursor-pointer' : ''}`}
        style={{ background: gradient }}
      >
        <span aria-hidden>{emoji}</span>

        <div className="absolute left-2.5 top-2.5">
          <StatusBadge status={video.status} />
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            void toggleFavorite(video)
          }}
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white text-[15px] shadow-[0_4px_10px_rgba(0,0,0,0.1)]"
          title={video.favorite ? 'Unfavorite' : 'Favorite'}
        >
          {video.favorite ? '♥' : '♡'}
        </button>

        {duration && (
          <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-[rgba(40,20,50,0.6)] px-1.5 py-0.5 text-[10px] font-bold text-white">
            {duration}
          </span>
        )}

        {ready && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
            <span className="grid size-12 place-items-center rounded-full bg-white/90 text-xl text-sakura-pink-deep">
              ▶
            </span>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 p-3.5">
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm">{video.title || 'Untitled clip'}</h4>
          <p className="mt-0.5 text-[11px] text-sakura-ink-soft">{meta}</p>
        </div>
        <button
          onClick={() => onRename(video)}
          className="rounded-lg px-1 py-0.5 text-base text-sakura-ink-soft hover:bg-[#fff3f8]"
          title="Rename"
        >
          ✏️
        </button>
        <button
          onClick={() => onDelete(video)}
          className="rounded-lg px-1 py-0.5 text-base text-sakura-ink-soft hover:bg-[#fff3f8]"
          title="Delete"
        >
          🗑️
        </button>
      </div>
    </div>
  )
}

export default VideoCard
