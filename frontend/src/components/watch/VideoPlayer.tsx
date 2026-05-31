import { useCallback, useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import type {
  HlsConfig,
  LoaderContext,
  LoaderConfiguration,
  LoaderCallbacks,
} from 'hls.js'

type VideoPlayerProps = {
  src: string
}

type QualityLevel = {
  index: number
  width: number
  height: number
  bitrate: number
}

// -1 is hls.js' sentinel for automatic level selection.
const AUTO_LEVEL = -1
const CONTROLS_HIDE_MS = 2600

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function levelLabel(level: QualityLevel) {
  return level.height ? `${level.height}p` : `${level.width}x${level.height}`
}

function formatBitrate(bitsPerSecond?: number) {
  if (!bitsPerSecond) return undefined
  return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`
}

const ICON = 'h-[18px] w-[18px]'

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="currentColor" aria-hidden>
      <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
    </svg>
  )
}
function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="currentColor" aria-hidden>
      <path d="M4 9v6h4l5 5V4L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" />
    </svg>
  )
}
function MuteIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="currentColor" aria-hidden>
      <path d="M4 9v6h4l5 5V4L8 9H4zm15.5 3 2.3-2.3-1.4-1.4-2.3 2.3-2.3-2.3-1.4 1.4 2.3 2.3-2.3 2.3 1.4 1.4 2.3-2.3 2.3 2.3 1.4-1.4-2.3-2.3z" />
    </svg>
  )
}
function PipIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}
function EnterFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
    </svg>
  )
}
function ExitFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 4v4a1 1 0 0 1-1 1H4M15 4v4a1 1 0 0 0 1 1h4M9 20v-4a1 1 0 0 0-1-1H4M15 20v-4a1 1 0 0 1 1-1h4" />
    </svg>
  )
}

const ctrlButton =
  'grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white'

/**
 * HLS player with a custom control bar (play, scrubber, volume, quality, PiP,
 * fullscreen). Native browser controls are disabled so the quality selector can
 * live inside the same bar instead of floating over the video.
 *
 * A SignedLoader re-attaches CloudFront signed query params to every request
 * (master manifest, variant playlists, segments) so key-group validation passes.
 * Manual quality selection only works when hls.js drives playback; native HLS
 * (Safari) manages levels internally, so the menu falls back to Auto-only.
 */
function VideoPlayer({ src }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuOpenRef = useRef(false)

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [pipActive, setPipActive] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [scrubbing, setScrubbing] = useState(false)

  // Quality state
  const [levels, setLevels] = useState<QualityLevel[]>([])
  const [selectedLevel, setSelectedLevel] = useState<number>(AUTO_LEVEL)
  const [activeLevel, setActiveLevel] = useState<number>(AUTO_LEVEL)
  const [menuOpen, setMenuOpen] = useState(false)

  // Reveal controls and (re)arm the auto-hide timer; the timer is a no-op while
  // paused or while the quality menu is open.
  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      const video = videoRef.current
      if (video && !video.paused && !menuOpenRef.current) setControlsVisible(false)
    }, CONTROLS_HIDE_MS)
  }, [])

  // ---- HLS wiring ----
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    setLevels([])
    setSelectedLevel(AUTO_LEVEL)
    setActiveLevel(AUTO_LEVEL)
    setMenuOpen(false)

    const srcUrl = new URL(src)
    const manifestUrl = srcUrl.toString()
    const tokenQuery = srcUrl.searchParams.toString()
    const baseUrl = new URL('./', srcUrl)

    if (Hls.isSupported()) {
      const SignedLoader = class extends Hls.DefaultConfig.loader {
        constructor(config: HlsConfig) {
          super(config)
        }
        load(
          context: LoaderContext,
          config: LoaderConfiguration,
          callbacks: LoaderCallbacks<LoaderContext>,
        ) {
          if (context.url) {
            const url = new URL(context.url, baseUrl)
            if (tokenQuery) {
              const params = new URLSearchParams(tokenQuery)
              params.forEach((value, key) => url.searchParams.set(key, value))
            }
            context.url = url.toString()
          }
          super.load(context, config, callbacks)
        }
      }

      const hls = new Hls({ enableWorker: true, loader: SignedLoader })
      hlsRef.current = hls
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setLevels(
          data.levels.map((level, index) => ({
            index,
            width: level.width,
            height: level.height,
            bitrate: level.bitrate,
          })),
        )
      })
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        setActiveLevel(data.level)
      })
      hls.loadSource(manifestUrl)
      hls.attachMedia(video)
      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    }

    video.src = manifestUrl
    return () => {
      video.removeAttribute('src')
    }
  }, [src])

  // ---- Media element <-> state sync ----
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay = () => {
      setIsPlaying(true)
      showControls()
    }
    const onPause = () => {
      setIsPlaying(false)
      setControlsVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
    const onTimeUpdate = () => setCurrentTime(video.currentTime)
    const onDuration = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0)
    const onProgress = () => {
      const len = video.buffered.length
      setBuffered(len ? video.buffered.end(len - 1) : 0)
    }
    const onVolume = () => {
      setVolume(video.volume)
      setMuted(video.muted)
    }
    const onEnterPip = () => setPipActive(true)
    const onLeavePip = () => setPipActive(false)

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDuration)
    video.addEventListener('loadedmetadata', onDuration)
    video.addEventListener('progress', onProgress)
    video.addEventListener('volumechange', onVolume)
    video.addEventListener('enterpictureinpicture', onEnterPip)
    video.addEventListener('leavepictureinpicture', onLeavePip)
    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDuration)
      video.removeEventListener('loadedmetadata', onDuration)
      video.removeEventListener('progress', onProgress)
      video.removeEventListener('volumechange', onVolume)
      video.removeEventListener('enterpictureinpicture', onEnterPip)
      video.removeEventListener('leavepictureinpicture', onLeavePip)
    }
  }, [showControls])

  // ---- Fullscreen change (covers Esc / browser chrome) ----
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ---- Close quality menu on outside click ----
  useEffect(() => {
    menuOpenRef.current = menuOpen
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  // ---- Auto-hide controls cleanup ----
  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }, [])

  // ---- Handlers ----
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }, [])

  const seekTo = useCallback((clientX: number) => {
    const video = videoRef.current
    const track = trackRef.current
    if (!video || !track || !duration) return
    const rect = track.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const time = frac * duration
    video.currentTime = time
    setCurrentTime(time)
  }, [duration])

  const onTrackPointerDown = (event: React.PointerEvent) => {
    event.preventDefault()
    setScrubbing(true)
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    trackRef.current?.setPointerCapture(event.pointerId)
    seekTo(event.clientX)
  }
  const onTrackPointerMove = (event: React.PointerEvent) => {
    if (scrubbing) seekTo(event.clientX)
  }
  const onTrackPointerUp = (event: React.PointerEvent) => {
    setScrubbing(false)
    trackRef.current?.releasePointerCapture(event.pointerId)
    showControls()
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (video) video.muted = !video.muted
  }
  const onVolumeInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return
    const value = Number(event.target.value)
    video.volume = value
    video.muted = value === 0
  }

  const toggleFullscreen = () => {
    const container = containerRef.current
    if (!container) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void container.requestFullscreen()
  }

  const togglePip = async () => {
    const video = videoRef.current
    if (!video) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await video.requestPictureInPicture()
    } catch {
      // PiP can be blocked or unsupported; ignore.
    }
  }

  const selectLevel = (index: number) => {
    const hls = hlsRef.current
    if (hls) hls.currentLevel = index
    setSelectedLevel(index)
    setMenuOpen(false)
  }

  // ---- Derived ----
  const sortedLevels = [...levels].sort((a, b) => b.height - a.height)
  const selected = levels.find((l) => l.index === selectedLevel)
  const active = levels.find((l) => l.index === activeLevel)
  const qualityLabel = selected ? levelLabel(selected) : 'Auto'
  const qualityDetail =
    selectedLevel === AUTO_LEVEL && active
      ? levelLabel(active)
      : selected
        ? formatBitrate(selected.bitrate)
        : undefined
  const canSelectQuality = levels.length > 0

  const playedFrac = duration ? Math.min(1, currentTime / duration) : 0
  const bufferedFrac = duration ? Math.min(1, buffered / duration) : 0
  const pipSupported =
    typeof document !== 'undefined' && document.pictureInPictureEnabled

  return (
    <div
      ref={containerRef}
      className={`group relative overflow-hidden ${
        isFullscreen ? 'grid h-full place-items-center bg-black' : 'rounded-[22px] p-3'
      }`}
      style={
        isFullscreen
          ? undefined
          : {
              background: 'linear-gradient(160deg,#2a2235,#191322)',
              boxShadow: '0 22px 50px -24px rgba(89,40,120,0.6)',
            }
      }
      onPointerMove={showControls}
      onPointerLeave={() => {
        if (isPlaying && !menuOpen) setControlsVisible(false)
      }}
    >
      <video
        ref={videoRef}
        playsInline
        onClick={togglePlay}
        className={
          isFullscreen
            ? 'max-h-full w-full bg-black'
            : 'aspect-video w-full rounded-[14px] bg-black'
        }
      />

      {/* Center play affordance while paused */}
      {!isPlaying ? (
        <button
          type="button"
          aria-label="Play"
          onClick={togglePlay}
          className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/60"
        >
          <span className="ml-0.5">
            <PlayIcon />
          </span>
        </button>
      ) : null}

      {/* Control bar */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 transition-opacity duration-200 ${
          controlsVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div
          className={`flex flex-col gap-1.5 bg-linear-to-t from-black/70 via-black/45 to-transparent px-3 pb-2.5 pt-6 ${
            controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'
          } ${isFullscreen ? '' : 'mx-1 mb-1 rounded-b-[14px]'}`}
        >
          {/* Scrubber */}
          <div
            ref={trackRef}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            tabIndex={0}
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            onPointerUp={onTrackPointerUp}
            className="group/track relative flex h-4 cursor-pointer items-center"
          >
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/25">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/30"
                style={{ width: `${bufferedFrac * 100}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-sakura-pink"
                style={{ width: `${playedFrac * 100}%` }}
              />
            </div>
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition group-hover/track:opacity-100"
              style={{ left: `${playedFrac * 100}%` }}
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-1 text-white">
            <button type="button" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={togglePlay} className={ctrlButton}>
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>

            <div className="flex items-center">
              <button type="button" aria-label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} className={ctrlButton}>
                {muted || volume === 0 ? <MuteIcon /> : <VolumeIcon />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={onVolumeInput}
                aria-label="Volume"
                className="h-1 w-0 cursor-pointer accent-sakura-pink opacity-0 transition-all duration-200 group-hover:w-16 group-hover:opacity-100"
              />
            </div>

            <span className="ml-1 select-none text-xs font-semibold tabular-nums text-white/85">
              {formatTime(currentTime)} <span className="text-white/45">/ {formatTime(duration)}</span>
            </span>

            <div className="ml-auto flex items-center gap-1">
              {/* Quality menu */}
              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  disabled={!canSelectQuality}
                  onClick={() => setMenuOpen((open) => !open)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-white/85 transition hover:bg-white/15 hover:text-white disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span>{qualityLabel}</span>
                  {qualityDetail ? (
                    <span className="hidden font-medium text-white/55 sm:inline">{qualityDetail}</span>
                  ) : null}
                  {canSelectQuality ? (
                    <span className={`text-[10px] text-white/60 transition ${menuOpen ? 'rotate-180' : ''}`}>▾</span>
                  ) : null}
                </button>

                {menuOpen && canSelectQuality ? (
                  <ul className="absolute bottom-full right-0 mb-2 min-w-30 overflow-hidden rounded-md border border-white/15 bg-black/85 py-1 text-xs font-semibold text-white shadow-xl backdrop-blur">
                    <li>
                      <button
                        type="button"
                        onClick={() => selectLevel(AUTO_LEVEL)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-white/10"
                      >
                        <span>Auto</span>
                        {selectedLevel === AUTO_LEVEL ? <span className="text-sakura-pink">✓</span> : null}
                      </button>
                    </li>
                    {sortedLevels.map((level) => (
                      <li key={level.index}>
                        <button
                          type="button"
                          onClick={() => selectLevel(level.index)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-white/10"
                        >
                          <span>{levelLabel(level)}</span>
                          {selectedLevel === level.index ? <span className="text-sakura-pink">✓</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {pipSupported ? (
                <button type="button" aria-label="Picture in picture" onClick={togglePip} className={`${ctrlButton} ${pipActive ? 'text-sakura-pink' : ''}`}>
                  <PipIcon />
                </button>
              ) : null}

              <button
                type="button"
                aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
                onClick={toggleFullscreen}
                className={ctrlButton}
              >
                {isFullscreen ? <ExitFullscreenIcon /> : <EnterFullscreenIcon />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VideoPlayer
