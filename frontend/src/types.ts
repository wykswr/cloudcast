export type AuthMode = 'sign-in' | 'sign-up' | 'confirm'

export type AuthUser = {
  id: string
  email?: string | null
}

export type { VideoItem, VideoStatus } from '@cloudcast/contracts'

export type UploadState = {
  stage: 'idle' | 'uploading' | 'success' | 'error'
  message?: string
  percent: number
  videoId?: string
}

export type UploadFormState = {
  title: string
  file: File | null
}

export type StreamSelection = {
  url: string
  title?: string | null
  videoId: string
}
