import { createAwsClients } from './aws'
import { CognitoTokenVerifier } from './auth'
import type { TokenVerifier, AuthenticatedUser } from './auth'
import type { Settings } from './config'
import { UploadService } from './services/uploads'
import { VideoRepository, VideoService } from './services/videos'
import { CloudFrontURLSigner } from './services/cloudfront'
import type { StreamSigner } from './services/cloudfront'

export type AppContainer = {
  settings: Settings
  uploadService: Pick<UploadService, 'initiateUpload' | 'presignPart' | 'completeUpload'>
  videoService: Pick<VideoService, 'listUserVideos' | 'loadOwnedVideo' | 'updateVideo' | 'deleteVideo'>
  streamSigner: StreamSigner
  tokenVerifier: TokenVerifier
}
export type AppEnv = { Variables: { user: AuthenticatedUser } }

export function createContainer(settings: Settings): AppContainer {
  const { s3, dynamodb, ssm } = createAwsClients(settings)
  const repository = new VideoRepository(dynamodb, settings)
  return {
    settings,
    uploadService: new UploadService(s3, repository, settings),
    videoService: new VideoService(repository, settings, s3),
    streamSigner: new CloudFrontURLSigner(settings, ssm),
    tokenVerifier: new CognitoTokenVerifier(settings),
  }
}
