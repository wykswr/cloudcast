import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Hls from 'hls.js'
import type {
  HlsConfig,
  LoaderContext,
  LoaderConfiguration,
  LoaderCallbacks,
} from 'hls.js'
import TouchControls from './TouchControls'

type VideoPlayerProps = {
  src: string
}

type PlaybackQuality = {
  label: string
  detail?: string
}

function formatBitrate(bitsPerSecond?: number) {
  if (!bitsPerSecond) return undefined
  return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`
}

function formatQuality(width?: number, height?: number, bitrate?: number): PlaybackQuality {
  if (!width || !height) {
    return { label: 'Auto' }
  }

  return {
    label: `${height}p`,
    detail: formatBitrate(bitrate) ?? `${width}x${height}`,
  }
}

const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'

function subscribeTouch(onChange: () => void) {
  const query = window.matchMedia(TOUCH_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function useIsTouchDevice() {
  return useSyncExternalStore(
    subscribeTouch,
    () => window.matchMedia(TOUCH_QUERY).matches,
    () => false,
  )
}

/**
 * HLS player that re-attaches CloudFront signed query params to every request
 * (master manifest, variant playlists, segments) so key-group validation passes.
 */
function VideoPlayer({ src }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const isTouch = useIsTouchDevice()
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false)

  // iOS paints the safe-area insets (notch, home bar) with the page background, so match the
  // player while it covers the viewport.
  useEffect(() => {
    if (!pseudoFullscreen) return
    const targets = [document.documentElement, document.body]
    const previous = targets.map((el) => el.style.backgroundColor)
    targets.forEach((el) => (el.style.backgroundColor = '#000'))
    return () => targets.forEach((el, i) => (el.style.backgroundColor = previous[i]))
  }, [pseudoFullscreen])
  const [quality, setQuality] = useState<PlaybackQuality>({ label: 'Auto' })

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    setQuality({ label: 'Auto' })

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
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const level = hls.levels[data.level]
        setQuality(formatQuality(level?.width, level?.height, level?.bitrate))
      })
      hls.loadSource(manifestUrl)
      hls.attachMedia(video)
      return () => hls.destroy()
    }

    const updateNativeQuality = () => {
      setQuality(formatQuality(video.videoWidth, video.videoHeight))
    }

    video.addEventListener('loadedmetadata', updateNativeQuality)
    video.addEventListener('resize', updateNativeQuality)
    video.src = manifestUrl
    return () => {
      video.removeEventListener('loadedmetadata', updateNativeQuality)
      video.removeEventListener('resize', updateNativeQuality)
      video.removeAttribute('src')
    }
  }, [src])

  return (
    <div
      className="relative rounded-[22px] p-3"
      style={{
        background: 'linear-gradient(160deg,#2a2235,#191322)',
        boxShadow: '0 22px 50px -24px rgba(89,40,120,0.6)',
      }}
    >
      <div className="absolute right-6 top-6 z-10 flex max-w-[calc(100%-3rem)] items-center gap-2 rounded-md border border-white/15 bg-black/65 px-2.5 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur">
        <span>{quality.label}</span>
        {quality.detail ? (
          <span className="hidden font-medium text-white/65 sm:inline">{quality.detail}</span>
        ) : null}
      </div>
      <div
        ref={frameRef}
        data-fullscreen={pseudoFullscreen || undefined}
        className="relative overflow-hidden rounded-[14px] bg-black data-fullscreen:fixed data-fullscreen:inset-0 data-fullscreen:z-40 [&:fullscreen,&[data-fullscreen]]:grid [&:fullscreen,&[data-fullscreen]]:place-items-center [&:fullscreen,&[data-fullscreen]]:rounded-none"
      >
        <video
          ref={videoRef}
          controls={!isTouch}
          playsInline
          className="block aspect-video w-full bg-black [:is(:fullscreen,[data-fullscreen])>&]:h-full [:is(:fullscreen,[data-fullscreen])>&]:aspect-auto [:is(:fullscreen,[data-fullscreen])>&]:object-contain"
        />
        {isTouch ? (
          <TouchControls
            videoRef={videoRef}
            fullscreenRef={frameRef}
            pseudoFullscreen={pseudoFullscreen}
            onPseudoFullscreenChange={setPseudoFullscreen}
          />
        ) : null}
      </div>
    </div>
  )
}

export default VideoPlayer
