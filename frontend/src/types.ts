export type AuthMode = 'sign-in' | 'sign-up' | 'confirm'

export type AuthUser = {
  id: string
  email?: string | null
}

export type VideoStatus = 'uploading' | 'processing' | 'ready' | 'failed'

export type VideoItem = {
  id: string
  title?: string | null
  status: VideoStatus | string
  createdAt: number
  s3KeyHls?: string | null
  sizeBytes?: number | null
  durationSeconds?: number | null
  favorite?: boolean
}

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
