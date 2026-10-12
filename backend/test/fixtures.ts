import { vi } from 'vitest'
import { getSettings } from '../src/config'
import type { AppContainer } from '../src/container'
import type { VideoRecord } from '../src/services/videos'

export const settings = getSettings({
  RAW_UPLOADS_BUCKET: 'raw',
  PROCESSED_VIDEOS_BUCKET: 'processed',
  VIDEOS_TABLE: 'videos',
  USERS_TABLE: 'users',
  CLOUDFRONT_DOMAIN: 'media.example.com',
  CLOUDFRONT_KEY_ID: 'key-id',
  CLOUDFRONT_PRIVATE_KEY_SSM_NAME: '/test/key',
  COGNITO_USER_POOL_ID: 'pool',
  COGNITO_CLIENT_ID: 'client',
})
export const user = { id: 'owner', email: 'owner@example.com', groups: ['admin'] }
export const video: VideoRecord = {
  id: 'video',
  user_id: 'owner',
  title: 'Title',
  status: 'ready',
  created_at: 100,
  s3_key_raw: 'owner/video/raw/holiday.final.mp4',
  s3_key_hls: 'owner/video/hls/holiday.final.m3u8',
}
export function mockContainer(): AppContainer {
  return {
    settings,
    tokenVerifier: { verify: vi.fn().mockResolvedValue(user) },
    streamSigner: { sign: vi.fn().mockResolvedValue('https://media.example.com/signed') },
    uploadService: {
      initiateUpload: vi.fn().mockResolvedValue({ uploadId: 'upload', videoId: 'video' }),
      presignPart: vi.fn().mockResolvedValue('https://s3.example.com/signed'),
      completeUpload: vi.fn().mockResolvedValue(undefined),
    },
    videoService: {
      listUserVideos: vi.fn().mockResolvedValue([video]),
      loadOwnedVideo: vi.fn().mockResolvedValue(video),
      updateVideo: vi.fn().mockResolvedValue(video),
      deleteVideo: vi.fn().mockResolvedValue(undefined),
    },
  }
}

// Narrow the SDK callback overload to the promise-based send used by these services.
export function mockAwsSend(client: unknown) {
  return vi.spyOn(
    client as {
      send(command: { input: Record<string, unknown> }): Promise<Record<string, unknown>>
    },
    'send',
  )
}
