export type AuthMode = 'sign-in' | 'sign-up' | 'confirm' | 'forgot' | 'reset'

export type AuthUser = {
  id: string
  email?: string | null
}

export type { VideoItem, VideoStatus } from '@cloudcast/contracts'

export type UploadState = {
  stage: 'idle' | 'uploading' | 'success' | 'error'
  message?: string
  percent: number
  /** Bytes in finished parts. */
  sentBytes?: number
  videoId?: string
}
