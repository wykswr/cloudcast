import { randomUUID } from 'node:crypto'
import { CompleteMultipartUploadCommand, CreateMultipartUploadCommand, UploadPartCommand } from '@aws-sdk/client-s3'
import type { S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { UploadInitRequest, UploadPart } from '@cloudcast/contracts'
import type { AuthenticatedUser } from '../auth'
import type { Settings } from '../config'
import { ApiError, awsOperation } from '../errors'
import type { VideoRepository } from './videos'

export function manifestKey(userId: string, videoId: string, rawKey: string): string {
  const filename = rawKey.slice(rawKey.lastIndexOf('/') + 1)
  const dot = filename.lastIndexOf('.')
  const stem = dot < 0 ? filename : filename.slice(0, dot)
  return `${userId}/${videoId}/hls/${stem}.m3u8`
}

export type PartPresigner = (s3: S3Client, command: UploadPartCommand, options: { expiresIn: number }) => Promise<string>

export class UploadService {
  constructor(private s3: S3Client, private repository: VideoRepository, private settings: Settings, private presign: PartPresigner = getSignedUrl) {}
  async initiateUpload(user: AuthenticatedUser, payload: UploadInitRequest) {
    await this.repository.ensureUserRecord(user)
    if (payload.sizeBytes != null) await this.repository.reserveStorage(user.id, payload.sizeBytes)
    const videoId = randomUUID()
    const rawKey = `${user.id}/${videoId}/raw/${payload.filename}`
    const title = payload.title || payload.filename
    const metadata: Record<string, string> = { video_id: videoId, user_id: user.id, title }
    if (payload.sourceWidth != null) metadata.source_width = String(payload.sourceWidth)
    if (payload.sourceHeight != null) metadata.source_height = String(payload.sourceHeight)
    const response = await awsOperation('Unable to initiate upload with S3', () => this.s3.send(new CreateMultipartUploadCommand({
      Bucket: this.settings.RAW_UPLOADS_BUCKET, Key: rawKey, ContentType: payload.contentType, Metadata: metadata,
    })), false)
    if (!response.UploadId) throw new ApiError(502, 'Unable to initiate upload with S3')
    await this.repository.createUploadRecord({
      user_id: user.id, id: videoId, title, s3_key_raw: rawKey, upload_id: response.UploadId,
      status: 'uploading', created_at: Math.floor(Date.now() / 1000), favorite: false,
      ...(payload.sizeBytes != null ? { size_bytes: payload.sizeBytes } : {}),
      ...(payload.durationSeconds != null ? { duration_seconds: Math.trunc(payload.durationSeconds) } : {}),
      ...(payload.sourceWidth != null ? { source_width: payload.sourceWidth } : {}),
      ...(payload.sourceHeight != null ? { source_height: payload.sourceHeight } : {}),
    })
    return { uploadId: response.UploadId, videoId }
  }
  private async activeUpload(user: AuthenticatedUser, videoId: string, uploadId: string) {
    const video = await this.repository.getVideo(user.id, videoId)
    if (!video) throw new ApiError(404, 'Video not found')
    if (video.upload_id !== uploadId) throw new ApiError(400, 'Upload session does not match')
    if (video.status !== 'uploading') throw new ApiError(409, 'Upload is not active')
    return video
  }
  async presignPart(user: AuthenticatedUser, videoId: string, uploadId: string, partNumber: number) {
    const video = await this.activeUpload(user, videoId, uploadId)
    return awsOperation('Unable to generate presigned URL', () => this.presign(this.s3, new UploadPartCommand({
      Bucket: this.settings.RAW_UPLOADS_BUCKET, Key: video.s3_key_raw, UploadId: uploadId, PartNumber: partNumber,
    }), { expiresIn: this.settings.MULTIPART_URL_EXPIRATION_SECONDS }), false)
  }
  async completeUpload(user: AuthenticatedUser, videoId: string, uploadId: string, parts: UploadPart[]) {
    const video = await this.activeUpload(user, videoId, uploadId)
    if (!parts.length) throw new ApiError(400, 'No upload parts provided')
    const sortedParts = parts.map(part => ({ ETag: part.etag, PartNumber: part.partNumber })).sort((a, b) => a.PartNumber - b.PartNumber)
    const hlsKey = video.s3_key_hls || manifestKey(user.id, videoId, video.s3_key_raw)
    await awsOperation('Unable to complete upload', () => this.s3.send(new CompleteMultipartUploadCommand({
      Bucket: this.settings.RAW_UPLOADS_BUCKET, Key: video.s3_key_raw, UploadId: uploadId, MultipartUpload: { Parts: sortedParts },
    })), false)
    await this.repository.markProcessing(user.id, videoId, hlsKey)
  }
}
