import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  fetchVideos,
  removeVideo,
  requestStream,
  updateVideo,
  type UpdateVideoRequest,
} from '../lib/api'
import { multipartUpload } from '../lib/uploads'
import { formatError } from '../utils/format'
import { isInFlight } from '../utils/status'
import type { VideoItem } from '../types'
import { VideosContext, type VideosContextValue } from './videos-context'

const POLL_INTERVAL_MS = 5000

type EditableFields = Pick<VideoItem, 'title' | 'favorite'>

function patchVideo(videos: VideoItem[], id: string, patch: Partial<VideoItem>) {
  return videos.map((v) => (v.id === id ? { ...v, ...patch } : v))
}

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
  const hasActive = videos.some(isInFlight)
  useEffect(() => {
    if (!hasActive) return
    const id = window.setInterval(() => void reload(), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [hasActive, reload])

  /** Applies `patch` locally, saves it, and restores the previous values if saving fails. */
  const updateOptimistically = useCallback(
    async (video: VideoItem, patch: UpdateVideoRequest & Partial<EditableFields>) => {
      const previous: Partial<EditableFields> = {}
      if ('title' in patch) previous.title = video.title
      if ('favorite' in patch) previous.favorite = video.favorite
      setVideos((prev) => patchVideo(prev, video.id, patch))
      try {
        await updateVideo(video.id, patch)
      } catch (err) {
        setVideos((prev) => patchVideo(prev, video.id, previous))
        setError(formatError(err))
        throw err
      }
    },
    [],
  )

  const toggleFavorite = useCallback(
    async (video: VideoItem) => {
      // The error is already surfaced through `error`; nothing else to do here.
      await updateOptimistically(video, { favorite: !video.favorite }).catch(() => {})
    },
    [updateOptimistically],
  )

  const renameVideo = useCallback(
    (video: VideoItem, title: string) => updateOptimistically(video, { title }),
    [updateOptimistically],
  )

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
    [
      videos,
      loading,
      error,
      reload,
      toggleFavorite,
      renameVideo,
      deleteVideo,
      getStreamUrl,
      upload,
    ],
  )

  return <VideosContext value={value}>{children}</VideosContext>
}
