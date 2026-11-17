import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import FocusLayout from '../components/layout/FocusLayout'
import StatusBadge from '../components/common/StatusBadge'
import {
  AlertIcon,
  HeartFilledIcon,
  HeartIcon,
  LinkIcon,
  MoonIcon,
  PencilIcon,
  TrashIcon,
  UploadIcon,
} from '../components/common/icons'
import UpNextList from '../components/watch/UpNextList'
import VideoPlayer from '../components/watch/VideoPlayer'
import { useLibrary } from '../context/library-context'
import { usePersistentState } from '../hooks/usePersistentState'
import { useVideo } from '../hooks/useVideo'
import { useVideoActions } from '../hooks/useVideoActions'
import { useVideoPage } from '../hooks/useVideoPage'
import { formatBytes, formatError, formatLongDate, qualityBadge } from '../utils/format'
import { barWidth, displayTitle } from '../utils/status'

const UP_NEXT_LIMIT = 8

type Stream = { id: string; url: string | null; error: string | null }

/** Stands in for the player while the video is loading, not ready, or unavailable. */
function PlayerPanel({ tone = 'dark', children }: { tone?: 'dark' | 'bad'; children: ReactNode }) {
  return (
    <div
      className={`flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl p-6 text-center ${
        tone === 'bad'
          ? 'border border-[#f1cfc7] bg-bad-soft text-[#8f2614]'
          : 'bg-ink text-night-ink'
      }`}
    >
      {children}
    </div>
  )
}

const kbd = (dark: boolean) =>
  `inline-block min-w-5 rounded-[5px] border px-1.5 py-px text-center text-xs font-semibold ${
    dark
      ? 'border-night-line bg-[#22262d] text-night-ink'
      : 'border-line-strong bg-[#f2f2ef] text-ink'
  }`

function WatchPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { getStreamUrl } = useLibrary()
  const { video, loading, error } = useVideo(id)
  const [dark, setDark] = usePersistentState('cc.watch.lightsOff', false)
  const [autoplay, setAutoplay] = usePersistentState('cc.watch.autoplay', true)
  const upNextPage = useVideoPage({ filter: 'ready', pageSize: UP_NEXT_LIMIT + 1 })
  const upNext = upNextPage.items.filter((item) => item.id !== id).slice(0, UP_NEXT_LIMIT)
  const { actions, dialogs } = useVideoActions(() => navigate('/'))
  const [stream, setStream] = useState<Stream | null>(null)
  const [streamAttempt, setStreamAttempt] = useState(0)

  const ready = video?.status === 'ready'
  useEffect(() => {
    if (!id || !ready) return
    let cancelled = false
    getStreamUrl(id).then(
      (url) => {
        if (!cancelled) setStream({ id, url, error: null })
      },
      (err) => {
        if (!cancelled) setStream({ id, url: null, error: formatError(err) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, ready, getStreamUrl, streamAttempt])
  const current = stream?.id === id ? stream : null

  const next = upNext[0]
  const onEnded = useCallback(() => {
    if (autoplay && next) navigate(`/watch/${next.id}`)
  }, [autoplay, next, navigate])

  const muted = dark ? 'text-night-muted' : 'text-ink-2'
  const actionButton = `btn h-10 border ${
    dark
      ? 'border-night-line bg-night-panel text-night-ink hover:bg-[#20242b]'
      : 'border-line-strong bg-white text-ink hover:bg-[#f2f2ef]'
  }`

  let player: ReactNode
  if (loading) {
    player = <div className="cc-skeleton aspect-video rounded-2xl" aria-label="Loading video" />
  } else if (!video) {
    player = (
      <PlayerPanel>
        <span className="text-[15px] font-semibold">We couldn’t find this video</span>
        <span className="text-[13px] text-night-muted">
          {error === 'Video not found' ? 'It may have been deleted.' : error}
        </span>
        <Link to="/" className="btn btn-primary mt-1 no-underline">
          Back to library
        </Link>
      </PlayerPanel>
    )
  } else if (video.status === 'failed') {
    player = (
      <PlayerPanel tone="bad">
        <AlertIcon className="size-[26px]" />
        <span className="text-[15px] font-semibold">We couldn’t get this video ready</span>
        <span className="text-[13px]">
          The file may be damaged or in a format we can’t play. Try saving it again from your camera
          or editing app.
        </span>
        <button
          type="button"
          className="btn btn-danger mt-1"
          onClick={() => actions.askDelete(video)}
        >
          Delete video
        </button>
      </PlayerPanel>
    )
  } else if (!ready) {
    player = (
      <PlayerPanel>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-night-line">
          <div
            className="cc-busy h-full rounded-full bg-[#f0a250]"
            style={{ width: barWidth(video.processingPercent ?? undefined) }}
          />
        </div>
        <span className="text-[15px] font-semibold">
          {video.status === 'uploading'
            ? 'Still uploading…'
            : video.processingPercent != null
              ? `Getting your video ready · ${video.processingPercent}%`
              : 'Getting your video ready'}
        </span>
        <span className="text-[13px] text-night-muted">
          This page will start playing on its own when it’s ready.
        </span>
      </PlayerPanel>
    )
  } else if (current?.error) {
    player = (
      <PlayerPanel>
        <span className="text-[15px] font-semibold">This video won’t play right now</span>
        <span className="text-[13px] text-night-muted">{current.error}</span>
        <button
          type="button"
          className="btn btn-secondary mt-1"
          onClick={() => setStreamAttempt((n) => n + 1)}
        >
          Try again
        </button>
      </PlayerPanel>
    )
  } else if (current?.url) {
    player = <VideoPlayer key={current.url} src={current.url} onEnded={onEnded} />
  } else {
    player = <div className="cc-skeleton aspect-video rounded-2xl" aria-label="Loading video" />
  }

  const badge = qualityBadge(video?.sourceHeight)

  return (
    <FocusLayout
      dark={dark}
      actions={
        <>
          <button
            type="button"
            onClick={() => setDark(!dark)}
            aria-pressed={dark}
            className={actionButton}
          >
            <MoonIcon />
            <span className="hidden sm:inline">Lights {dark ? 'on' : 'off'}</span>
          </button>
          <Link to="/upload" className="btn btn-primary h-10 no-underline" aria-label="Upload">
            <UploadIcon className="size-4" />
            <span className="hidden sm:inline">Upload</span>
          </Link>
        </>
      }
    >
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-start gap-7 px-0 pb-16 sm:p-6">
        <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-5">
          <div className="sm:contents [&>*]:max-sm:rounded-none">{player}</div>

          {video ? (
            <div className="flex flex-col gap-3.5 px-4 sm:px-0">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
                  <h1 className="m-0 font-display text-[22px] font-semibold tracking-[-0.02em] sm:text-[26px]">
                    {displayTitle(video)}
                  </h1>
                  <div className={`flex flex-wrap items-center gap-2 text-sm ${muted}`}>
                    <StatusBadge status={video.status} />
                    <span>Uploaded {formatLongDate(video.createdAt)}</span>
                    {video.sizeBytes ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{formatBytes(video.sizeBytes)}</span>
                      </>
                    ) : null}
                    {badge ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{badge}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
                  <button
                    type="button"
                    onClick={() => actions.toggleFavorite(video)}
                    aria-pressed={video.favorite}
                    className={`${actionButton} ${
                      video.favorite
                        ? dark
                          ? 'border-[#5a2a27] bg-[#2a1716]'
                          : 'border-[#f2c7c2] bg-[#fdf0ee]'
                        : ''
                    }`}
                  >
                    {video.favorite ? (
                      <HeartFilledIcon className="size-[18px] text-heart" />
                    ) : (
                      <HeartIcon />
                    )}
                    {video.favorite ? 'Favorited' : 'Favorite'}
                  </button>
                  {ready ? (
                    <button
                      type="button"
                      onClick={() => actions.copyLink(video)}
                      className={actionButton}
                    >
                      <LinkIcon />
                      Copy link
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => actions.startRename(video)}
                    className={actionButton}
                  >
                    <PencilIcon />
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => actions.askDelete(video)}
                    aria-label="Delete video"
                    className={`${actionButton} w-10 shrink-0 px-0 ${dark ? 'text-[#ff8a78]' : 'text-bad'}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>

              {ready ? (
                <div
                  className={`hidden flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-3.5 py-3 text-[13px] md:flex [@media(hover:none)]:hidden ${
                    dark
                      ? 'border-[#22262d] bg-[#14171c] text-night-muted'
                      : 'border-line bg-white text-ink-2'
                  }`}
                >
                  <span className="font-semibold">Shortcuts</span>
                  <span>
                    <kbd className={kbd(dark)}>Space</kbd> Play / pause
                  </span>
                  <span>
                    <kbd className={kbd(dark)}>←</kbd> <kbd className={kbd(dark)}>→</kbd> Skip 10s
                  </span>
                  <span>
                    <kbd className={kbd(dark)}>M</kbd> Mute
                  </span>
                  <span>
                    <kbd className={kbd(dark)}>F</kbd> Full screen
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </main>

        <div className="flex min-w-0 flex-[1_1_320px] px-4 sm:px-0">
          <UpNextList
            videos={upNext}
            loading={upNextPage.initialLoading}
            autoplay={autoplay}
            onAutoplayChange={setAutoplay}
            dark={dark}
          />
        </div>
      </div>
      {dialogs}
    </FocusLayout>
  )
}

export default WatchPage
