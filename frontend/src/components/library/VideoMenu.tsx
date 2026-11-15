import { useCallback, useRef, useState } from 'react'
import { useDismiss } from '../../hooks/useDismiss'
import type { VideoActions } from '../../hooks/useVideoActions'
import { displayTitle } from '../../utils/status'
import type { VideoItem } from '../../types'
import { HeartIcon, LinkIcon, MoreIcon, PencilIcon, TrashIcon } from '../common/icons'

/** The "…" menu on a video: rename, copy link, favorite, delete. */
function VideoMenu({ video, actions }: { video: VideoItem; actions: VideoActions }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  const run = (action: (video: VideoItem) => void) => () => {
    setOpen(false)
    action(video)
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${displayTitle(video)}`}
        className="icon-btn"
      >
        <MoreIcon />
      </button>
      {open ? (
        <div
          role="menu"
          className="cc-rise absolute top-full right-0 z-20 mt-1 flex w-56 flex-col rounded-xl border border-line bg-white p-1.5 shadow-pop"
        >
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={run(actions.startRename)}
          >
            <PencilIcon className="size-4" />
            Rename
          </button>
          {video.status === 'ready' ? (
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={run(actions.copyLink)}
            >
              <LinkIcon className="size-4" />
              Copy link
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={run(actions.toggleFavorite)}
          >
            <HeartIcon className="size-4" />
            {video.favorite ? 'Remove from favorites' : 'Add to favorites'}
          </button>
          <div className="my-1 h-px bg-[#ecece8]" />
          <button
            type="button"
            role="menuitem"
            className="menu-item text-bad"
            onClick={run(actions.askDelete)}
          >
            <TrashIcon className="size-4" />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default VideoMenu
