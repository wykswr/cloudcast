import type { ReactNode } from 'react'
import { videoArt } from '../../utils/art'

type ThumbnailProps = {
  videoId: string
  className?: string
  /** Overlays (badges, buttons) drawn on top of the art. */
  children?: ReactNode
  /** Grows the art slightly when the surrounding `group` is hovered. */
  zoomOnHover?: boolean
}

/** Placeholder poster frame: a flat two-tone landscape that stays the same for each video. */
function Thumbnail({ videoId, className = '', children, zoomOnHover = false }: ThumbnailProps) {
  const art = videoArt(videoId)
  return (
    <div className={`relative aspect-video overflow-hidden bg-line ${className}`}>
      <div
        aria-hidden
        className={`absolute inset-0 transition-transform duration-300 ${zoomOnHover ? 'group-hover:scale-[1.03]' : ''}`}
        style={{ background: `linear-gradient(180deg, ${art.sky} 0 60%, ${art.ground} 60%)` }}
      >
        <span
          className="absolute aspect-square w-[18%] rounded-full"
          style={{ background: art.sun, left: `${art.sunLeft}%`, top: `${art.sunTop}%` }}
        />
      </div>
      {children}
    </div>
  )
}

export default Thumbnail
