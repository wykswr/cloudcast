import { fetchAuthSession } from 'aws-amplify/auth'
import type {
  LibrarySummary,
  VideoItem,
  VideoListQuery,
  VideoListResponse,
  StreamResponse,
  UploadInitRequest,
  UploadInitResponse,
  UploadPartRequest,
  CompleteUploadRequest,
  SignPartResponse,
  UpdateVideoRequest,
  CompleteUploadResponse,
  DeleteVideoResponse,
} from '@cloudcast/contracts'
export type {
  UploadInitRequest,
  UploadInitResponse,
  UploadPartRequest,
  UploadPart,
  CompleteUploadRequest,
  SignPartResponse,
  UpdateVideoRequest,
} from '@cloudcast/contracts'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(
  /\/$/,
  '',
)

type ApiRequestOptions = {
  method?: string
  body?: unknown
}

async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString() ?? session.tokens?.accessToken?.toString()

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

/** Query string for a library page; empty and default values are left out. */
export function videoListPath(query: VideoListQuery = {}): string {
  const params = new URLSearchParams()
  if (query.limit != null) params.set('limit', String(query.limit))
  if (query.cursor) params.set('cursor', query.cursor)
  const q = query.q?.trim()
  if (q) params.set('q', q)
  if (query.filter && query.filter !== 'all') params.set('filter', query.filter)
  if (query.order && query.order !== 'newest') params.set('order', query.order)
  const search = params.toString()
  return search ? `/videos?${search}` : '/videos'
}

export const fetchVideoPage = async (query: VideoListQuery = {}): Promise<VideoListResponse> => {
  const data = await apiRequest<VideoListResponse>(videoListPath(query))
  return { items: data.items, nextCursor: data.nextCursor ?? null }
}

export const fetchVideo = async (videoId: string): Promise<VideoItem> => {
  return apiRequest<VideoItem>(`/videos/${encodeURIComponent(videoId)}`)
}

export const fetchSummary = async (): Promise<LibrarySummary> => {
  return apiRequest<LibrarySummary>('/videos/summary')
}

export const requestStream = async (videoId: string): Promise<StreamResponse> => {
  return apiRequest(`/videos/${videoId}/stream`)
}

export const removeVideo = async (videoId: string) => {
  return apiRequest<DeleteVideoResponse>(`/videos/${videoId}`, {
    method: 'DELETE',
  })
}

export const updateVideo = async (
  videoId: string,
  payload: UpdateVideoRequest,
): Promise<VideoItem> => {
  return apiRequest<VideoItem>(`/videos/${videoId}`, {
    method: 'PATCH',
    body: payload,
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
  return apiRequest<CompleteUploadResponse>('/videos/upload/complete', {
    method: 'POST',
    body: payload,
  })
}
