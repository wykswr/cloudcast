import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchVideos,
  removeVideo,
  requestStream,
  updateVideo,
} from '../lib/api'
import { multipartUpload } from '../lib/uploads'
import { formatError } from '../utils/format'
import type { VideoItem } from '../types'
import { VideosContext, type VideosContextValue } from './videos-context'

const POLL_INTERVAL_MS = 5000
const ACTIVE_STATUSES = new Set(['uploading', 'processing'])

export function VideosProvider({ children }: { children: ReactNode }) {
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const initialised = useRef(false)

  const reload = useCallback(async () => {
    try {
      const items = await fetchVideos()
      setVideos(items)
      setError(null)
    } catch (err) {
      setError(formatError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load.
  useEffect(() => {
    if (initialised.current) return
    initialised.current = true
    void reload()
  }, [reload])

  // Poll while anything is still uploading/processing so cards flip to ready.
  const hasActive = videos.some((v) => ACTIVE_STATUSES.has(v.status))
  useEffect(() => {
    if (!hasActive) return
    const id = window.setInterval(() => void reload(), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [hasActive, reload])

  const toggleFavorite = useCallback(async (video: VideoItem) => {
    const next = !video.favorite
    // Optimistic update; revert on failure.
    setVideos((prev) =>
      prev.map((v) => (v.id === video.id ? { ...v, favorite: next } : v)),
    )
    try {
      await updateVideo(video.id, { favorite: next })
    } catch (err) {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === video.id ? { ...v, favorite: video.favorite } : v,
        ),
      )
      setError(formatError(err))
    }
  }, [])

  const renameVideo = useCallback(async (video: VideoItem, title: string) => {
    const previous = video.title
    // Optimistic update; revert on failure.
    setVideos((prev) =>
      prev.map((v) => (v.id === video.id ? { ...v, title } : v)),
    )
    try {
      await updateVideo(video.id, { title })
    } catch (err) {
      setVideos((prev) =>
        prev.map((v) => (v.id === video.id ? { ...v, title: previous } : v)),
      )
      setError(formatError(err))
      throw err
    }
  }, [])

  const deleteVideo = useCallback(async (videoId: string) => {
    await removeVideo(videoId)
    setVideos((prev) => prev.filter((v) => v.id !== videoId))
  }, [])

  const getStreamUrl = useCallback(async (videoId: string) => {
    const data = await requestStream(videoId)
    return data.streamUrl
  }, [])

  const upload = useCallback<VideosContextValue['upload']>(
    async ({ file, title, onProgress }) => {
      await multipartUpload({ file, title, onProgress })
      await reload()
    },
    [reload],
  )

  const value = useMemo(
    () => ({
      videos,
      loading,
      error,
      reload,
      toggleFavorite,
      renameVideo,
      deleteVideo,
      getStreamUrl,
      upload,
    }),
    [videos, loading, error, reload, toggleFavorite, renameVideo, deleteVideo, getStreamUrl, upload],
  )

  return <VideosContext value={value}>{children}</VideosContext>
}
