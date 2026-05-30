import { useEffect, useRef } from 'react'
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

/**
 * HLS player that re-attaches CloudFront signed query params to every request
 * (master manifest, variant playlists, segments) so key-group validation passes.
 */
function VideoPlayer({ src }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

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
      hls.loadSource(manifestUrl)
      hls.attachMedia(video)
      return () => hls.destroy()
    }

    video.src = manifestUrl
    return () => video.removeAttribute('src')
  }, [src])

  return (
    <div
      className="rounded-[22px] p-3"
      style={{
        background: 'linear-gradient(160deg,#2a2235,#191322)',
        boxShadow: '0 22px 50px -24px rgba(89,40,120,0.6)',
      }}
    >
      <video
        ref={videoRef}
        controls
        className="aspect-video w-full rounded-[14px] bg-black"
      />
    </div>
  )
}

export default VideoPlayer
