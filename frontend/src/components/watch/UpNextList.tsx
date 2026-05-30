import { useNavigate } from 'react-router-dom'
import { videoArt } from '../../utils/art'
import { formatDuration, formatRelative } from '../../utils/format'
import type { VideoItem } from '../../types'

type UpNextListProps = {
  videos: VideoItem[]
}

function UpNextList({ videos }: UpNextListProps) {
  const navigate = useNavigate()

  return (
    <aside>
      <h3 className="mb-3 flex items-center gap-1.5 text-[15px]">Up next ☁️</h3>
      {videos.length === 0 && (
        <p className="text-sm text-sakura-ink-soft">Nothing else here yet ♡</p>
      )}
      {videos.map((video) => {
        const { gradient, emoji } = videoArt(video.id)
        const duration = formatDuration(video.durationSeconds)
        return (
          <button
            key={video.id}
            onClick={() => navigate(`/watch/${video.id}`)}
            className="flex w-full gap-3 rounded-2xl p-2 text-left transition hover:bg-white"
          >
            <div
              className="relative grid aspect-video w-26 flex-shrink-0 place-items-center rounded-[10px] text-xl"
              style={{ background: gradient, width: '6.5rem' }}
            >
              <span aria-hidden>{emoji}</span>
              {duration && (
                <span className="absolute bottom-1 right-1 rounded-md bg-[rgba(40,20,50,0.6)] px-1.5 py-0.5 text-[9px] text-white">
                  {duration}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[13px] leading-tight">
                {video.title || 'Untitled clip'}
              </b>
              <small className="text-[11px] text-sakura-ink-soft">
                {formatRelative(video.createdAt)}
              </small>
            </div>
          </button>
        )
      })}
    </aside>
  )
}

export default UpNextList
