import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

type TouchControlsProps = {
  videoRef: RefObject<HTMLVideoElement | null>
  fullscreenRef: RefObject<HTMLElement | null>
  /** CSS fullscreen, used where the Fullscreen API can't take the player (iPhone Safari). */
  pseudoFullscreen: boolean
  onPseudoFullscreenChange: (active: boolean) => void
}

type Gesture = {
  pointerId: number
  startX: number
  startY: number
  startTime: number
  seeking: boolean
}

type SeekPreview = {
  target: number
  delta: number
}

/** Max gap between two taps to count as a double tap. */
const DOUBLE_TAP_MS = 280
/** Horizontal travel before a touch turns into a seek gesture. */
const SWIPE_THRESHOLD_PX = 12
/** Swiping across the full player width seeks this far (or the whole clip, if shorter). */
const FULL_SWIPE_SECONDS = 120
const CONTROLS_HIDE_MS = 3000

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
    </svg>
  )
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
    </svg>
  )
}

function FullscreenIcon({ exit }: { exit: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="h-5 w-5"
      aria-hidden
    >
      {exit ? (
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      ) : (
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      )}
    </svg>
  )
}

/**
 * Touch-first overlay for the player: single tap shows/hides the controls,
 * double tap toggles playback, horizontal swipe scrubs.
 */
function TouchControls({
  videoRef,
  fullscreenRef,
  pseudoFullscreen,
  onPseudoFullscreenChange,
}: TouchControlsProps) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [seekPreview, setSeekPreview] = useState<SeekPreview | null>(null)
  const [flash, setFlash] = useState<{ playing: boolean; key: number } | null>(null)
  const [nativeFullscreen, setNativeFullscreen] = useState(false)
  const fullscreen = nativeFullscreen || pseudoFullscreen
  // Bumped on every control interaction so the auto-hide countdown restarts.
  const [activity, setActivity] = useState(0)

  const gestureRef = useRef<Gesture | null>(null)
  const lastTapRef = useRef(0)
  const singleTapTimer = useRef<number | undefined>(undefined)
  const hideTimer = useRef<number | undefined>(undefined)
  const flashTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const syncPlaying = () => setPlaying(!video.paused)
    const syncTime = () => setCurrentTime(video.currentTime)
    const syncDuration = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0)

    video.addEventListener('play', syncPlaying)
    video.addEventListener('pause', syncPlaying)
    video.addEventListener('timeupdate', syncTime)
    video.addEventListener('seeked', syncTime)
    video.addEventListener('durationchange', syncDuration)
    video.addEventListener('loadedmetadata', syncDuration)
    return () => {
      video.removeEventListener('play', syncPlaying)
      video.removeEventListener('pause', syncPlaying)
      video.removeEventListener('timeupdate', syncTime)
      video.removeEventListener('seeked', syncTime)
      video.removeEventListener('durationchange', syncDuration)
      video.removeEventListener('loadedmetadata', syncDuration)
    }
  }, [videoRef])

  useEffect(() => {
    const onChange = () =>
      setNativeFullscreen(document.fullscreenElement === fullscreenRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [fullscreenRef])

  // Keep the controls up while paused or scrubbing; fade them out during playback.
  useEffect(() => {
    window.clearTimeout(hideTimer.current)
    if (!controlsVisible || !playing || seekPreview) return
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS)
    return () => window.clearTimeout(hideTimer.current)
  }, [controlsVisible, playing, seekPreview, activity])

  useEffect(
    () => () => {
      window.clearTimeout(singleTapTimer.current)
      window.clearTimeout(flashTimer.current)
    },
    [],
  )

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().catch(() => {})
    } else {
      video.pause()
    }
  }

  const togglePlayWithFlash = () => {
    const video = videoRef.current
    if (!video) return
    const willPlay = video.paused
    togglePlay()
    window.clearTimeout(flashTimer.current)
    setFlash({ playing: willPlay, key: Date.now() })
    flashTimer.current = window.setTimeout(() => setFlash(null), 600)
  }

  const seekTo = (seconds: number) => {
    const video = videoRef.current
    if (!video || !duration) return
    video.currentTime = Math.min(Math.max(seconds, 0), duration)
    setCurrentTime(video.currentTime)
  }

  const toggleFullscreen = async () => {
    const container = fullscreenRef.current
    if (pseudoFullscreen) {
      onPseudoFullscreenChange(false)
      return
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {})
      return
    }
    if (container && document.fullscreenEnabled) {
      try {
        await container.requestFullscreen()
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (o: string) => Promise<void>
        }
        await orientation.lock?.('landscape').catch(() => {})
      } catch {
        // Ignore: the browser refused fullscreen.
      }
      return
    }
    // iPhone Safari can only fullscreen the <video> element itself, which hands control to
    // the system player and drops our gestures, so cover the viewport with the player instead.
    onPseudoFullscreenChange(true)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || gestureRef.current) return
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: videoRef.current?.currentTime ?? 0,
      seeking: false,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId || !duration) return

    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    if (!gesture.seeking) {
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return
      gesture.seeking = true
      event.currentTarget.setPointerCapture(event.pointerId)
      window.clearTimeout(singleTapTimer.current)
      lastTapRef.current = 0
    }

    const width = event.currentTarget.clientWidth || 1
    const span = Math.min(duration, FULL_SWIPE_SECONDS)
    const target = Math.min(Math.max(gesture.startTime + (dx / width) * span, 0), duration)
    setSeekPreview({ target, delta: target - gesture.startTime })
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null

    if (gesture.seeking) {
      if (seekPreview) seekTo(seekPreview.target)
      setSeekPreview(null)
      setControlsVisible(true)
      return
    }

    const now = performance.now()
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      window.clearTimeout(singleTapTimer.current)
      lastTapRef.current = 0
      togglePlayWithFlash()
      return
    }

    lastTapRef.current = now
    singleTapTimer.current = window.setTimeout(() => {
      setControlsVisible((visible) => !visible)
    }, DOUBLE_TAP_MS)
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return
    gestureRef.current = null
    setSeekPreview(null)
  }

  const shownTime = seekPreview?.target ?? currentTime
  const showControls = controlsVisible || !playing || seekPreview !== null

  return (
    <>
      {/* Gesture surface. pan-y keeps vertical page scrolling (none in fullscreen, where there is
          no page to scroll) and both disable double-tap zoom. */}
      <div
        className={`absolute inset-0 z-10 select-none [-webkit-touch-callout:none] ${
          fullscreen ? '[touch-action:none]' : '[touch-action:pan-y]'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(event) => event.preventDefault()}
        aria-hidden
      />

      {seekPreview ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center pb-14">
          <div className="rounded-2xl bg-black/65 px-5 py-3 text-center text-white backdrop-blur">
            <div className="font-display text-2xl font-bold">
              {seekPreview.delta >= 0 ? '+' : '−'}
              {formatTime(Math.abs(seekPreview.delta))}
            </div>
            <div className="text-xs tabular-nums text-white/75">
              {formatTime(seekPreview.target)} / {formatTime(duration)}
            </div>
          </div>
        </div>
      ) : null}

      {flash ? (
        <div
          key={flash.key}
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
        >
          <div className="grid h-16 w-16 animate-[ping_0.6s_ease-out_1] place-items-center rounded-full bg-black/55 text-white">
            {flash.playing ? <PlayIcon className="h-8 w-8" /> : <PauseIcon className="h-8 w-8" />}
          </div>
        </div>
      ) : null}

      <div
        className={`absolute inset-x-0 bottom-0 z-30 rounded-b-[inherit] bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-8 text-white transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={shownTime}
          disabled={!duration}
          onChange={(event) => {
            seekTo(Number(event.target.value))
            setActivity((n) => n + 1)
          }}
          className="block h-6 w-full cursor-pointer accent-sakura-pink"
          aria-label="Seek"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full"
            onClick={() => {
              togglePlay()
              setActivity((n) => n + 1)
            }}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
          </button>
          <span className="text-xs tabular-nums text-white/85">
            {formatTime(shownTime)} / {formatTime(duration)}
          </span>
          <button
            type="button"
            className="ml-auto grid h-9 w-9 place-items-center rounded-full"
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            <FullscreenIcon exit={fullscreen} />
          </button>
        </div>
      </div>
    </>
  )
}

export default TouchControls
