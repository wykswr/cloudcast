import { displayTitle } from '../../utils/status'
import type { VideoItem } from '../../types'
import { HeartFilledIcon, HeartIcon } from '../common/icons'

/** Heart on a thumbnail: shown on hover (always on touch screens, and once favorited). */
function FavoriteButton({ video, onToggle }: { video: VideoItem; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={video.favorite}
      aria-label={
        video.favorite
          ? `Remove ${displayTitle(video)} from favorites`
          : `Add ${displayTitle(video)} to favorites`
      }
      className={`absolute top-1.5 right-1.5 z-10 grid size-11 place-items-center transition-opacity active:scale-90 ${
        video.favorite
          ? 'opacity-100'
          : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
      }`}
    >
      <span className="grid size-9 place-items-center rounded-full bg-white/95 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
        {video.favorite ? (
          <HeartFilledIcon className="size-[18px] text-heart" />
        ) : (
          <HeartIcon className="size-[18px] text-ink" />
        )}
      </span>
    </button>
  )
}

export default FavoriteButton
