import { fetchAuthSession } from 'aws-amplify/auth'
import type { VideoItem } from '../types'

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
).replace(/\/$/, '')

type ApiRequestOptions = {
  method?: string
  body?: unknown
}

async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const session = await fetchAuthSession()
  const token =
    session.tokens?.idToken?.toString() ??
    session.tokens?.accessToken?.toString()

  if (!token) {
    throw new Error('Sign in to continue')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    const detail =
      (data as { detail?: string } | null)?.detail ??
      `Request failed with status ${response.status}`
    throw new Error(detail)
  }

  return data as T
}

type VideoListResponse = {
  items: VideoItem[]
}

type StreamResponse = {
  streamUrl: string
}

export type UploadInitRequest = {
  filename: string
  contentType: string
  title: string
}

export type UploadInitResponse = {
  uploadId: string
  videoId: string
}

export type UploadPartRequest = {
  videoId: string
  uploadId: string
  partNumber: number
}

export type UploadPart = {
  etag: string
  partNumber: number
}

export type CompleteUploadRequest = {
  videoId: string
  uploadId: string
  parts: UploadPart[]
}

export type SignPartResponse = {
  presignedUrl: string
}

export const fetchVideos = async (): Promise<VideoItem[]> => {
  const data = await apiRequest<VideoListResponse>('/videos')
  return data.items
}

export const requestStream = async (
  videoId: string,
): Promise<StreamResponse> => {
  return apiRequest(`/videos/${videoId}/stream`)
}

export const removeVideo = async (videoId: string) => {
  return apiRequest<{ status: string }>(`/videos/${videoId}`, {
    method: 'DELETE',
  })
}

export const initUpload = async (payload: UploadInitRequest) => {
  return apiRequest<UploadInitResponse>('/videos/upload/init', {
    method: 'POST',
    body: payload,
  })
}

export const signUploadPart = async (payload: UploadPartRequest) => {
  return apiRequest<SignPartResponse>('/videos/upload/sign-part', {
    method: 'POST',
    body: payload,
  })
}

export const completeUpload = async (payload: CompleteUploadRequest) => {
  return apiRequest('/videos/upload/complete', {
    method: 'POST',
    body: payload,
  })
}
