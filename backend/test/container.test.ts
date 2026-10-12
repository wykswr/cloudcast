import { describe, expect, it } from 'vitest'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { S3Client } from '@aws-sdk/client-s3'
import { createAwsClients } from '../src/aws'
import { getSettings } from '../src/config'
import { createContainer } from '../src/container'
import { CognitoTokenVerifier } from '../src/auth'
import { CloudFrontURLSigner } from '../src/services/cloudfront'
import { UploadService } from '../src/services/uploads'
import { VideoService } from '../src/services/videos'
import { settings } from './fixtures'

describe('composition root', () => {
  it('wires every collaborator without touching AWS', () => {
    const container = createContainer(settings)
    expect(container.settings).toBe(settings)
    expect(container.uploadService).toBeInstanceOf(UploadService)
    expect(container.videoService).toBeInstanceOf(VideoService)
    expect(container.streamSigner).toBeInstanceOf(CloudFrontURLSigner)
    expect(container.tokenVerifier).toBeInstanceOf(CognitoTokenVerifier)
  })
  it('honours emulator endpoint overrides', async () => {
    const { dynamodb, s3 } = createAwsClients({
      ...settings,
      S3_ENDPOINT_URL: 'http://localhost:4566',
      DYNAMODB_ENDPOINT_URL: 'http://localhost:8001',
    })
    expect(dynamodb).toBeInstanceOf(DynamoDBDocumentClient)
    expect(s3).toBeInstanceOf(S3Client)
    expect((await s3.config.endpoint?.())?.port).toBe(4566)
    expect((await dynamodb.config.endpoint?.())?.port).toBe(8001)
  })
  it('applies configuration defaults and rejects missing required settings', () => {
    expect(settings).toMatchObject({
      PORT: 8000,
      VIDEO_ID_INDEX: 'VideoIdIndex',
      STREAM_URL_TTL_MINUTES: 60,
    })
    expect(getSettings({ ...settings, PORT: '9000' } as unknown as NodeJS.ProcessEnv).PORT).toBe(
      9000,
    )
    expect(() => getSettings({})).toThrow()
  })
})
