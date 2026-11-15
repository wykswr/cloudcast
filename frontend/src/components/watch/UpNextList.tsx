import { Link } from 'react-router-dom'
import { formatDuration, formatRelative } from '../../utils/format'
import { displayTitle } from '../../utils/status'
import type { VideoItem } from '../../types'
import Thumbnail from '../common/Thumbnail'

type UpNextListProps = {
  videos: VideoItem[]
  loading: boolean
  autoplay: boolean
  onAutoplayChange: (on: boolean) => void
  dark: boolean
}

function UpNextList({ videos, loading, autoplay, onAutoplayChange, dark }: UpNextListProps) {
  return (
    <aside className="flex max-w-full min-w-0 flex-[1_1_320px] flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-base font-semibold">Up next</h2>
        <label
          className={`flex cursor-pointer items-center gap-2.5 text-[13px] ${dark ? 'text-night-muted' : 'text-ink-2'}`}
        >
          Autoplay
          <button
            type="button"
            role="switch"
            aria-checked={autoplay}
            onClick={() => onAutoplayChange(!autoplay)}
            className={`relative h-6 w-10 rounded-full transition-colors ${
              autoplay ? 'bg-accent' : dark ? 'bg-[#3a3f48]' : 'bg-[#c9c9c2]'
            }`}
          >
            <span
              className={`absolute top-[3px] size-[18px] rounded-full bg-white transition-[left] ${
                autoplay ? 'left-[19px]' : 'left-[3px]'
              }`}
            />
          </button>
        </label>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-3 p-1.5" aria-hidden>
              <div className="cc-skeleton aspect-video w-[148px] shrink-0 rounded-lg" />
              <div className="flex flex-1 flex-col gap-2 pt-1">
                <div className="cc-skeleton h-3.5 w-4/5 rounded-md" />
                <div className="cc-skeleton h-3 w-1/2 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <p className={`m-0 text-sm ${dark ? 'text-night-muted' : 'text-ink-3'}`}>
          Nothing else to watch yet.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {videos.map((video, index) => {
            const duration = formatDuration(video.durationSeconds)
            return (
              <Link
                key={video.id}
                to={`/watch/${video.id}`}
                className={`flex gap-3 rounded-[10px] p-1.5 no-underline ${
                  dark ? 'text-night-ink hover:bg-white/5' : 'text-ink hover:bg-black/5'
                }`}
              >
                <Thumbnail videoId={video.id} className="w-[148px] shrink-0 rounded-lg">
                  {duration ? (
                    <span className="font-tabular absolute right-1.5 bottom-1.5 rounded bg-[rgba(14,16,20,0.8)] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      {duration}
                    </span>
                  ) : null}
                  {index === 0 && autoplay ? (
                    <span className="absolute top-1.5 left-1.5 rounded bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      Next
                    </span>
                  ) : null}
                </Thumbnail>
                <div className="flex min-w-0 flex-col gap-1 pt-0.5">
                  <span className="line-clamp-2 text-sm leading-snug font-semibold">
                    {displayTitle(video)}
                  </span>
                  <span className={`text-xs ${dark ? 'text-night-muted' : 'text-ink-3'}`}>
                    {formatRelative(video.createdAt)}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </aside>
  )
}

export default UpNextList
