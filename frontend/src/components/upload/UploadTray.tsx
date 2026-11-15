import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useUploads } from '../../context/uploads-context'
import { isFinished, isSending, type QueueItem } from '../../lib/upload-queue'
import { formatBytes } from '../../utils/format'
import { ChevronDownIcon, UploadIcon } from '../common/icons'

function detail(item: QueueItem) {
  switch (item.stage) {
    case 'queued':
      return 'Waiting to upload'
    case 'uploading':
      return `Uploading · ${formatBytes(item.sentBytes)} of ${formatBytes(item.size)}`
    case 'paused':
      return 'Paused'
    case 'error':
      return 'Upload stopped. Open uploads to try again.'
    case 'processing':
      return 'Getting it ready to play'
    case 'ready':
      return 'Ready to watch'
    default:
      return item.error ?? ''
  }
}

/**
 * Corner panel that follows people around the app while their uploads run. Hidden on the upload
 * page itself, which shows the same list in full.
 */
function UploadTray() {
  const { items, summary, clearFinished } = useUploads()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(true)

  const visible = items.filter((item) => item.stage !== 'draft' && item.stage !== 'skipped')
  if (pathname.startsWith('/upload') || visible.length === 0) return null

  const active = summary.inProgress
  const title = active
    ? `${active} ${active === 1 ? 'video' : 'videos'} in progress${
        visible.some((item) => isSending(item.stage)) ? ` · ${summary.percent}%` : ''
      }`
    : 'Uploads finished'

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-28 z-30 flex h-11 items-center gap-2.5 rounded-full bg-ink px-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(20,22,26,0.25)] md:right-6 md:bottom-6"
      >
        <UploadIcon className="size-4" />
        {title}
      </button>
    )
  }

  return (
    <section
      aria-label="Uploads"
      className="fixed right-4 bottom-28 z-30 w-[340px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[14px] border border-line bg-white shadow-float md:right-6 md:bottom-6"
    >
      <div className="flex items-center justify-between bg-ink py-2.5 pr-2 pl-4 text-white">
        <span className="text-sm font-semibold">{title}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Minimize uploads"
          className="grid size-8 place-items-center rounded-lg hover:bg-white/10"
        >
          <ChevronDownIcon />
        </button>
      </div>
      <ul className="m-0 max-h-[280px] list-none overflow-y-auto p-0">
        {visible.map((item) => {
          const showBar = isSending(item.stage) || item.stage === 'processing'
          return (
            <li key={item.key} className="flex flex-col gap-2 border-t border-[#ecece8] px-4 py-3">
              <div className="flex justify-between gap-2 text-[13px]">
                <span className="truncate font-semibold">{item.title}</span>
                {isSending(item.stage) ? (
                  <span className="font-tabular shrink-0 text-ink-2">{item.percent}%</span>
                ) : null}
              </div>
              {showBar ? (
                <div className="h-1 overflow-hidden rounded-full bg-[#ecece8]">
                  <div
                    className={`h-full rounded-full ${
                      item.stage === 'processing'
                        ? 'cc-busy w-full bg-warn-bar'
                        : item.stage === 'uploading'
                          ? 'bg-accent'
                          : 'bg-[#9aa0aa]'
                    }`}
                    style={item.stage === 'processing' ? undefined : { width: `${item.percent}%` }}
                  />
                </div>
              ) : null}
              <span
                className={`text-xs ${
                  item.stage === 'error' || item.stage === 'failed' ? 'text-bad' : 'text-ink-3'
                }`}
              >
                {item.stage === 'ready' && item.videoId ? (
                  <>
                    Ready to watch ·{' '}
                    <Link to={`/watch/${item.videoId}`} className="font-semibold text-accent">
                      Watch
                    </Link>
                  </>
                ) : (
                  detail(item)
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-between gap-2 border-t border-[#ecece8] bg-panel px-3 py-2">
        <Link to="/upload" className="px-1 text-[13px] font-semibold text-accent">
          Open uploads
        </Link>
        {visible.some((item) => isFinished(item.stage)) ? (
          <button
            type="button"
            onClick={clearFinished}
            className="h-8 rounded-lg px-2 text-[13px] font-semibold text-ink-2 hover:bg-hover"
          >
            Clear finished
          </button>
        ) : null}
      </div>
    </section>
  )
}

export default UploadTray
