import { Link } from 'react-router-dom'
import type { QueueItem } from '../../lib/upload-queue'
import { formatBytes } from '../../utils/format'
import {
  AlertIcon,
  CheckIcon,
  CloseIcon,
  FilmIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
} from '../common/icons'

type UploadQueueItemProps = {
  item: QueueItem
  onTitle: (title: string) => void
  onPause: () => void
  onResume: () => void
  onRemove: () => void
}

const TONES: Partial<Record<QueueItem['stage'], string>> = {
  skipped: 'bg-bad-soft text-bad',
  error: 'bg-bad-soft text-bad',
  failed: 'bg-bad-soft text-bad',
  ready: 'bg-good-soft text-good',
  processing: 'bg-warn-soft text-warn',
}

function stageText(item: QueueItem) {
  const sent = `${formatBytes(item.sentBytes || 0)} of ${formatBytes(item.size)}`
  switch (item.stage) {
    case 'queued':
      return 'Waiting for the upload before it'
    case 'uploading':
      return `Uploading · ${item.sentBytes ? sent : 'starting'}`
    case 'paused':
      return `Paused · ${sent}`
    case 'processing':
      return 'Getting it ready to play · usually a few minutes'
    default:
      return ''
  }
}

/** One file on the upload page: editable title before upload, then progress and controls. */
function UploadQueueItem({ item, onTitle, onPause, onResume, onRemove }: UploadQueueItemProps) {
  const bad = item.stage === 'skipped' || item.stage === 'error' || item.stage === 'failed'
  const showBar = ['queued', 'uploading', 'paused', 'processing'].includes(item.stage)
  const removable = item.stage !== 'processing'
  const removeLabel = ['uploading', 'paused', 'queued', 'error'].includes(item.stage)
    ? 'Cancel upload'
    : 'Remove from list'

  return (
    <li className="cc-rise flex items-start gap-3.5 border-t border-[#f0f0ec] p-4 first:border-t-0">
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-[10px] ${TONES[item.stage] ?? 'bg-accent-soft text-accent'}`}
      >
        {bad ? (
          <AlertIcon className="size-5" />
        ) : item.stage === 'ready' ? (
          <CheckIcon className="size-5" />
        ) : (
          <FilmIcon className="size-5" />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {item.stage === 'draft' ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-3">Title</span>
            <input
              value={item.title}
              maxLength={120}
              onChange={(event) => onTitle(event.target.value)}
              className="field h-10 text-[15px] font-semibold sm:text-sm"
            />
          </label>
        ) : (
          <span className="truncate text-[15px] font-semibold">{item.title}</span>
        )}
        <span className="truncate text-xs text-ink-3">
          {item.name} · {formatBytes(item.size)}
        </span>

        {showBar ? (
          <div className="flex flex-col gap-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-[#ecece8]">
              <div
                className={`h-full rounded-full ${
                  item.stage === 'processing'
                    ? 'cc-busy w-full bg-warn-bar'
                    : item.stage === 'uploading'
                      ? 'cc-busy bg-accent'
                      : 'bg-[#9aa0aa]'
                }`}
                style={item.stage === 'processing' ? undefined : { width: `${item.percent}%` }}
              />
            </div>
            <div className="flex justify-between gap-2 text-xs">
              <span
                className={`font-medium ${
                  item.stage === 'processing'
                    ? 'text-warn'
                    : item.stage === 'uploading'
                      ? 'text-accent'
                      : 'text-ink-2'
                }`}
              >
                {stageText(item)}
              </span>
              {item.stage !== 'processing' ? (
                <span className="font-tabular text-ink-2">{item.percent}%</span>
              ) : null}
            </div>
          </div>
        ) : null}

        {bad ? (
          <span
            role={item.stage === 'error' ? 'alert' : undefined}
            className="text-[13px] text-bad"
          >
            {item.stage === 'error' ? `Upload stopped: ${item.error}` : item.error}
          </span>
        ) : null}
        {item.stage === 'ready' && item.videoId ? (
          <span className="text-[13px] font-medium text-good">
            Ready to watch ·{' '}
            <Link to={`/watch/${item.videoId}`} className="font-semibold text-accent">
              Watch now
            </Link>
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-0.5">
        {item.stage === 'uploading' ? (
          <button type="button" className="icon-btn" onClick={onPause} aria-label="Pause upload">
            <PauseIcon className="size-4" />
          </button>
        ) : null}
        {item.stage === 'paused' ? (
          <button
            type="button"
            className="icon-btn text-accent"
            onClick={onResume}
            aria-label="Resume upload"
          >
            <PlayIcon className="size-4" />
          </button>
        ) : null}
        {item.stage === 'error' ? (
          <button
            type="button"
            className="icon-btn text-accent"
            onClick={onResume}
            aria-label="Try again"
          >
            <RefreshIcon className="size-4" />
          </button>
        ) : null}
        {removable ? (
          <button type="button" className="icon-btn" onClick={onRemove} aria-label={removeLabel}>
            <CloseIcon className="size-4" />
          </button>
        ) : null}
      </div>
    </li>
  )
}

export default UploadQueueItem
