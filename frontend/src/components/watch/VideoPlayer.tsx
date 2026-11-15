import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Hls from 'hls.js'
import type { HlsConfig, LoaderContext, LoaderConfiguration, LoaderCallbacks } from 'hls.js'
import DesktopControls, { type QualityOption } from './DesktopControls'
import TouchControls from './TouchControls'

type VideoPlayerProps = {
  src: string
  onEnded?: () => void
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
 * Touch screens get gesture controls; mice and keyboards get the desktop bar.
 */
function VideoPlayer({ src, onEnded }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const isTouch = useIsTouchDevice()
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false)
  const [qualities, setQualities] = useState<QualityOption[]>([])
  const [quality, setQuality] = useState(-1)
  const [autoLabel, setAutoLabel] = useState<string | undefined>(undefined)

  // iOS paints the safe-area insets (notch, home bar) with the page background, so match the
  // player while it covers the viewport.
  useEffect(() => {
    if (!pseudoFullscreen) return
    const targets = [document.documentElement, document.body]
    const previous = targets.map((el) => el.style.backgroundColor)
    targets.forEach((el) => (el.style.backgroundColor = '#000'))
    return () => targets.forEach((el, i) => (el.style.backgroundColor = previous[i]))
  }, [pseudoFullscreen])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !onEnded) return
    video.addEventListener('ended', onEnded)
    return () => video.removeEventListener('ended', onEnded)
  }, [onEnded])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

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
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const options = hls.levels
          .map((level, index) => ({ level: index, height: level.height }))
          .filter((option) => option.height > 0)
          .sort((a, b) => b.height - a.height)
          .map((option) => ({ level: option.level, label: `${option.height}p` }))
        setQualities(options)
        setQuality(-1)
      })
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const height = hls.levels[data.level]?.height
        setAutoLabel(height ? `${height}p` : undefined)
      })
      hls.loadSource(manifestUrl)
      hls.attachMedia(video)
      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    }

    // Safari plays HLS natively and picks the quality itself.
    video.src = manifestUrl
    return () => {
      video.removeAttribute('src')
      video.load()
    }
  }, [src])

  const chooseQuality = (level: number) => {
    const hls = hlsRef.current
    if (hls) hls.currentLevel = level
    setQuality(level)
  }

  return (
    <div
      ref={frameRef}
      data-fullscreen={pseudoFullscreen || undefined}
      className="relative overflow-hidden rounded-2xl bg-black shadow-[0_24px_60px_rgba(0,0,0,0.18)] data-fullscreen:fixed data-fullscreen:inset-0 data-fullscreen:z-50 [&:fullscreen,&[data-fullscreen]]:grid [&:fullscreen,&[data-fullscreen]]:place-items-center [&:fullscreen,&[data-fullscreen]]:rounded-none"
    >
      <video
        ref={videoRef}
        playsInline
        className="block aspect-video w-full bg-black [:is(:fullscreen,[data-fullscreen])>&]:aspect-auto [:is(:fullscreen,[data-fullscreen])>&]:h-full [:is(:fullscreen,[data-fullscreen])>&]:object-contain"
      />
      {isTouch ? (
        <TouchControls
          videoRef={videoRef}
          fullscreenRef={frameRef}
          pseudoFullscreen={pseudoFullscreen}
          onPseudoFullscreenChange={setPseudoFullscreen}
        />
      ) : (
        <DesktopControls
          videoRef={videoRef}
          frameRef={frameRef}
          qualities={qualities}
          quality={quality}
          autoLabel={autoLabel}
          onQuality={chooseQuality}
        />
      )}
    </div>
  )
}

export default VideoPlayer
