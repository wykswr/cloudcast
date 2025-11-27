export type AuthMode = 'sign-in' | 'sign-up' | 'confirm'

export type AuthUser = {
  id: string
  email?: string | null
}

export type VideoItem = {
  id: string
  title?: string | null
  status: 'uploading' | 'processing' | 'ready' | 'failed' | string
  createdAt: number
  s3KeyHls?: string | null
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
