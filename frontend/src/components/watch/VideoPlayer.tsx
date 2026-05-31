import { useEffect, useRef, useState } from 'react'
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

function formatBitrate(bitsPerSecond?: number) {
  if (!bitsPerSecond) return undefined
  return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`
}

function levelLabel(level: QualityLevel) {
  return level.height ? `${level.height}p` : `${level.width}x${level.height}`
}

/**
 * HLS player that re-attaches CloudFront signed query params to every request
 * (master manifest, variant playlists, segments) so key-group validation passes.
 *
 * Exposes a resolution menu: "Auto" (adaptive bitrate) plus each variant the
 * master manifest advertises. Manual selection is only available when hls.js
 * drives playback; native HLS (Safari) manages levels internally.
 */
function VideoPlayer({ src }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const [levels, setLevels] = useState<QualityLevel[]>([])
  const [selectedLevel, setSelectedLevel] = useState<number>(AUTO_LEVEL)
  const [activeLevel, setActiveLevel] = useState<number>(AUTO_LEVEL)
  const [menuOpen, setMenuOpen] = useState(false)

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

  // Close the menu when clicking outside it.
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  const selectLevel = (index: number) => {
    const hls = hlsRef.current
    if (hls) hls.currentLevel = index
    setSelectedLevel(index)
    setMenuOpen(false)
  }

  // Levels sorted high → low for the menu; the manifest order isn't guaranteed.
  const sortedLevels = [...levels].sort((a, b) => b.height - a.height)
  const selected = levels.find((l) => l.index === selectedLevel)
  const active = levels.find((l) => l.index === activeLevel)

  const buttonLabel = selected ? levelLabel(selected) : 'Auto'
  const buttonDetail =
    selectedLevel === AUTO_LEVEL && active
      ? levelLabel(active)
      : selected
        ? formatBitrate(selected.bitrate)
        : undefined

  const canSelect = levels.length > 0

  return (
    <div
      className="relative rounded-[22px] p-3"
      style={{
        background: 'linear-gradient(160deg,#2a2235,#191322)',
        boxShadow: '0 22px 50px -24px rgba(89,40,120,0.6)',
      }}
    >
      <div ref={menuRef} className="absolute right-6 top-6 z-10 max-w-[calc(100%-3rem)]">
        <button
          type="button"
          disabled={!canSelect}
          onClick={() => setMenuOpen((open) => !open)}
          className="flex items-center gap-2 rounded-md border border-white/15 bg-black/65 px-2.5 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur transition hover:bg-black/80 disabled:cursor-default disabled:opacity-100"
        >
          <span>{buttonLabel}</span>
          {buttonDetail ? (
            <span className="hidden font-medium text-white/65 sm:inline">{buttonDetail}</span>
          ) : null}
          {canSelect ? (
            <span className={`text-[10px] text-white/60 transition ${menuOpen ? 'rotate-180' : ''}`}>
              ▾
            </span>
          ) : null}
        </button>

        {menuOpen && canSelect ? (
          <ul className="absolute right-0 mt-1.5 min-w-30 overflow-hidden rounded-md border border-white/15 bg-black/85 py-1 text-xs font-semibold text-white shadow-xl backdrop-blur">
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
                  {selectedLevel === level.index ? (
                    <span className="text-sakura-pink">✓</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <video
        ref={videoRef}
        controls
        className="aspect-video w-full rounded-[14px] bg-black"
      />
    </div>
  )
}

export default VideoPlayer
