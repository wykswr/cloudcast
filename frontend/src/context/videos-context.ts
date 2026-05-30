import { createContext, use } from 'react'
import type { UploadState, VideoItem } from '../types'

export type VideosContextValue = {
  videos: VideoItem[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  toggleFavorite: (video: VideoItem) => Promise<void>
  renameVideo: (video: VideoItem, title: string) => Promise<void>
  deleteVideo: (videoId: string) => Promise<void>
  getStreamUrl: (videoId: string) => Promise<string>
  upload: (params: {
    file: File
    title: string
    onProgress: (state: UploadState) => void
  }) => Promise<void>
}

export const VideosContext = createContext<VideosContextValue | null>(null)

export function useVideos(): VideosContextValue {
  const ctx = use(VideosContext)
  if (!ctx) throw new Error('useVideos must be used within VideosProvider')
  return ctx
}
