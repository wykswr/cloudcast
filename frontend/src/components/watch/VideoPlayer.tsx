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

/**
 * HLS player that re-attaches CloudFront signed query params to every request
 * (master manifest, variant playlists, segments) so key-group validation passes.
 */
function VideoPlayer({ src }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
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
      <video
        ref={videoRef}
        controls
        className="aspect-video w-full rounded-[14px] bg-black"
      />
    </div>
  )
}

export default VideoPlayer
