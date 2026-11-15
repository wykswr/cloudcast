import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { useDismiss } from '../../hooks/useDismiss'
import { formatClock } from '../../utils/format'
import {
  Back10Icon,
  CheckIcon,
  Forward10Icon,
  FullscreenIcon,
  MutedIcon,
  PauseIcon,
  PipIcon,
  PlayIcon,
  SlidersIcon,
  VolumeIcon,
} from '../common/icons'
import { usePlaybackState } from './useTouchControls'

export type QualityOption = { level: number; label: string }

type DesktopControlsProps = {
  videoRef: RefObject<HTMLVideoElement | null>
  frameRef: RefObject<HTMLElement | null>
  qualities: QualityOption[]
  /** -1 is automatic. */
  quality: number
  /** What automatic is playing right now, e.g. "1080p". */
  autoLabel?: string
  onQuality: (level: number) => void
}

const SPEEDS = [0.5, 1, 1.25, 1.5, 2]
const HIDE_MS = 2500
const SKIP_SECONDS = 10

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

/** Mouse-and-keyboard controls drawn over the video; they fade out while it plays. */
function DesktopControls({
  videoRef,
  frameRef,
  qualities,
  quality,
  autoLabel,
  onQuality,
}: DesktopControlsProps) {
  const { playing, currentTime, setCurrentTime, duration } = usePlaybackState(videoRef)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [menuOpen, setMenuOpen] = useState(false)
  const [active, setActive] = useState(true)
  const [hover, setHover] = useState<number | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const hideTimer = useRef<number | undefined>(undefined)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  useDismiss(menuRef, menuOpen, closeMenu)

  const wake = useCallback(() => {
    setActive(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setActive(false), HIDE_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(hideTimer.current), [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const sync = () => setMuted(video.muted)
    video.addEventListener('volumechange', sync)
    return () => video.removeEventListener('volumechange', sync)
  }, [videoRef])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [frameRef])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play().catch(() => {})
    else video.pause()
  }, [videoRef])

  const seekTo = useCallback(
    (seconds: number) => {
      const video = videoRef.current
      if (!video || !duration) return
      video.currentTime = Math.min(Math.max(seconds, 0), duration)
      setCurrentTime(video.currentTime)
    },
    [videoRef, duration, setCurrentTime],
  )

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (video) video.muted = !video.muted
  }, [videoRef])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void frameRef.current?.requestFullscreen().catch(() => {})
  }, [frameRef])

  const togglePip = () => {
    const video = videoRef.current
    if (!video) return
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {})
    else void video.requestPictureInPicture?.().catch(() => {})
  }

  const setRate = (rate: number) => {
    const video = videoRef.current
    if (video) video.playbackRate = rate
    setSpeed(rate)
  }

  // Keyboard shortcuts for the whole watch page, except while typing in a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return
      const video = videoRef.current
      if (!video) return
      const key = event.key.toLowerCase()
      if (key === ' ' || key === 'k') {
        // Space on a focused button should press it, not also toggle playback.
        if (key === ' ' && (event.target as HTMLElement).tagName === 'BUTTON') return
        event.preventDefault()
        togglePlay()
      } else if (key === 'arrowleft' || key === 'j') {
        event.preventDefault()
        seekTo(video.currentTime - SKIP_SECONDS)
      } else if (key === 'arrowright' || key === 'l') {
        event.preventDefault()
        seekTo(video.currentTime + SKIP_SECONDS)
      } else if (key === 'm') {
        toggleMute()
      } else if (key === 'f') {
        toggleFullscreen()
      } else {
        return
      }
      wake()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [videoRef, togglePlay, seekTo, toggleMute, toggleFullscreen, wake])

  const ratioAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / (rect.width || 1)))
  }

  const progress = duration ? (currentTime / duration) * 100 : 0
  const shown = active || !playing || menuOpen
  const pipSupported = typeof document !== 'undefined' && document.pictureInPictureEnabled
  const currentQuality =
    quality === -1
      ? `Auto${autoLabel ? ` (${autoLabel})` : ''}`
      : (qualities.find((option) => option.level === quality)?.label ?? 'Auto')

  return (
    <div
      className={`absolute inset-0 ${shown ? '' : 'cursor-none'}`}
      onMouseMove={wake}
      onMouseLeave={() => setActive(false)}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        className="absolute inset-0 cursor-[inherit] bg-transparent"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
      />

      {!playing ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute top-1/2 left-1/2 grid size-[76px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.3)] transition-transform hover:scale-105"
        >
          <PlayIcon className="size-[30px]" />
        </button>
      ) : null}

      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-2.5 bg-linear-to-t from-black/75 to-transparent px-4 pt-10 pb-3 text-white transition-opacity duration-200 ${
          shown ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div
          className="group/seek relative cursor-pointer py-1.5"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            seekTo(ratioAt(event) * duration)
          }}
          onPointerMove={(event) => {
            setHover(ratioAt(event))
            if (event.buttons === 1) seekTo(ratioAt(event) * duration)
          }}
          onPointerLeave={() => setHover(null)}
        >
          {hover !== null && duration ? (
            <span
              className="font-tabular pointer-events-none absolute bottom-6 -translate-x-1/2 rounded-md bg-black/80 px-2 py-1 text-xs font-semibold"
              style={{ left: `${hover * 100}%` }}
            >
              {formatClock(hover * duration)}
            </span>
          ) : null}
          <div
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${formatClock(currentTime)} of ${formatClock(duration)}`}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.stopPropagation()
              if (event.key === 'ArrowLeft') seekTo(currentTime - 5)
              if (event.key === 'ArrowRight') seekTo(currentTime + 5)
            }}
            className="relative h-[5px] rounded-full bg-white/25 transition-[height] group-hover/seek:h-2"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[#4f6bff]"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -mt-[7px] -ml-[7px] size-3.5 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.4)]"
              style={{ left: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg hover:bg-white/15"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <PauseIcon className="size-[22px]" /> : <PlayIcon className="size-[22px]" />}
          </button>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg hover:bg-white/15"
            onClick={() => seekTo(currentTime - SKIP_SECONDS)}
            aria-label="Back 10 seconds"
          >
            <Back10Icon className="size-[22px]" />
          </button>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg hover:bg-white/15"
            onClick={() => seekTo(currentTime + SKIP_SECONDS)}
            aria-label="Forward 10 seconds"
          >
            <Forward10Icon className="size-[22px]" />
          </button>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg hover:bg-white/15"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <MutedIcon className="size-[22px]" /> : <VolumeIcon className="size-[22px]" />}
          </button>
          <span className="font-tabular ml-1.5 text-[13px]">
            {formatClock(currentTime)}{' '}
            <span className="text-white/70">/ {formatClock(duration)}</span>
          </span>

          <div ref={menuRef} className="relative ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Playback settings"
              className="flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold hover:bg-white/15"
            >
              <SlidersIcon className="size-5" />
              <span className="hidden sm:inline">
                {speed === 1 ? '1×' : `${speed}×`} · {currentQuality}
              </span>
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 bottom-12 z-10 flex w-[260px] flex-col gap-3 rounded-xl border border-white/10 bg-[rgba(20,22,26,0.96)] p-3"
              >
                <div className="flex flex-col gap-1.5">
                  <span className="px-1.5 text-xs text-white/70">Playback speed</span>
                  <div className="grid grid-cols-5 gap-1">
                    {SPEEDS.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        role="menuitemradio"
                        aria-checked={speed === rate}
                        onClick={() => setRate(rate)}
                        className={`h-[34px] rounded-lg text-[13px] font-semibold ${
                          speed === rate
                            ? 'bg-white text-ink'
                            : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                      >
                        {rate}×
                      </button>
                    ))}
                  </div>
                </div>
                {qualities.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="px-1.5 pb-1 text-xs text-white/70">Quality</span>
                    {[{ level: -1, label: 'Auto' }, ...qualities].map((option) => (
                      <button
                        key={option.level}
                        type="button"
                        role="menuitemradio"
                        aria-checked={quality === option.level}
                        onClick={() => onQuality(option.level)}
                        className="flex h-9 items-center justify-between rounded-lg px-2 text-[13px] hover:bg-white/10"
                      >
                        <span>
                          {option.label}{' '}
                          <span className="text-white/60">
                            {option.level === -1 ? 'best for your connection' : ''}
                          </span>
                        </span>
                        {quality === option.level ? (
                          <CheckIcon className="size-4 text-accent-light" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {pipSupported ? (
              <button
                type="button"
                className="grid size-10 place-items-center rounded-lg hover:bg-white/15"
                onClick={togglePip}
                aria-label="Picture in picture"
              >
                <PipIcon className="size-5" />
              </button>
            ) : null}
            <button
              type="button"
              className="grid size-10 place-items-center rounded-lg hover:bg-white/15"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            >
              <FullscreenIcon exit={fullscreen} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DesktopControls
