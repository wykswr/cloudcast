import { useEffect, useRef } from 'react'
import Hls from 'hls.js'
import type {
  HlsConfig,
  LoaderContext,
  LoaderConfiguration,
  LoaderCallbacks,
} from 'hls.js'

type HlsPlayerProps = {
  src: string
  title?: string | null
}

function HlsPlayer({ src, title }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) {
      return
    }

    const srcUrl = new URL(src)
    const manifestUrl = srcUrl.toString()
    const tokenQuery = srcUrl.searchParams.toString()
    // Base URL of the HLS folder so relative variant/segment requests resolve
    // against the CloudFront origin, not the app origin.
    const baseUrl = new URL('./', srcUrl)

    if (Hls.isSupported()) {
      // Attach signed query parameters to every HLS request (master, variants, segments)
      // so CloudFront key group validation succeeds.
      const SignedLoader = class extends Hls.DefaultConfig.loader {
        constructor(config: HlsConfig) {
          super(config)
        }
        load(
          context: LoaderContext,
          config: LoaderConfiguration,
          callbacks: LoaderCallbacks<LoaderContext>
        ) {
          if (context.url) {
            const url = new URL(context.url, baseUrl)
            if (tokenQuery) {
              const params = new URLSearchParams(tokenQuery)
              params.forEach((value, key) => {
                url.searchParams.set(key, value)
              })
            }
            context.url = url.toString()
          }
          super.load(context, config, callbacks)
        }
      }

      const hls = new Hls({ enableWorker: true, loader: SignedLoader })
      hls.loadSource(manifestUrl)
      hls.attachMedia(video)

      return () => {
        hls.destroy()
      }
    }

    video.src = manifestUrl
    return () => {
      video.removeAttribute('src')
    }
  }, [src])

  return (
    <div>
      <div className="mb-2 flex items-center text-sm text-slate-300">
        <div className="font-semibold">{title ?? 'HLS Stream'}</div>
      </div>
      <video
        ref={videoRef}
        controls
        className="aspect-video w-full rounded-xl bg-black ring-2 ring-slate-800"
      />
    </div>
  )
}

export default HlsPlayer
