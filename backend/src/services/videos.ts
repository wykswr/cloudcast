import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import type { S3Client } from '@aws-sdk/client-s3'
import { VideoItemSchema } from '@cloudcast/contracts'
import type { VideoItem, UpdateVideoRequest } from '@cloudcast/contracts'
import type { Settings } from '../config'
import type { AuthenticatedUser } from '../auth'
import { ApiError, awsOperation } from '../errors'

export type VideoRecord = {
  user_id: string; id: string; status: string; created_at: number;
  title?: string | null; s3_key_raw: string; s3_key_hls?: string | null;
  upload_id?: string; size_bytes?: number; duration_seconds?: number;
  source_width?: number; source_height?: number; favorite?: boolean;
}
export function toVideoItem(video: VideoRecord): VideoItem {
  return VideoItemSchema.parse({
    id: video.id, title: video.title, status: video.status, createdAt: video.created_at,
    s3KeyHls: video.s3_key_hls, sizeBytes: video.size_bytes, durationSeconds: video.duration_seconds,
    sourceWidth: video.source_width, sourceHeight: video.source_height, favorite: video.favorite,
  })
}

export class VideoRepository {
  constructor(private db: DynamoDBDocumentClient, private settings: Settings) {}
  async ensureUserRecord(user: AuthenticatedUser) {
    await awsOperation('Unable to persist user record', () => this.db.send(new UpdateCommand({
      TableName: this.settings.USERS_TABLE, Key: { id: user.id },
      UpdateExpression: 'SET email = if_not_exists(email, :email), created_at = if_not_exists(created_at, :created_at)',
      ExpressionAttributeValues: { ':email': user.email || `user-${user.id}`, ':created_at': Math.floor(Date.now() / 1000) },
    })))
  }
  async reserveStorage(userId: string, sizeBytes: number) {
    const quota = this.settings.STORAGE_QUOTA_BYTES
    if (sizeBytes > quota) throw new ApiError(413, 'File exceeds your storage quota')
    await awsOperation('Unable to reserve storage', async () => {
      try {
        await this.db.send(new UpdateCommand({
          TableName: this.settings.USERS_TABLE, Key: { id: userId },
          UpdateExpression: 'ADD storage_used_bytes :size',
          ConditionExpression: 'attribute_not_exists(storage_used_bytes) OR storage_used_bytes <= :allowed',
          ExpressionAttributeValues: { ':size': sizeBytes, ':allowed': quota - sizeBytes },
        }))
      } catch (error) {
        if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
          throw new ApiError(413, 'Upload would exceed your storage quota')
        }
        throw error
      }
    })
  }
  async reconcileUserStorage(userId: string) {
    const total = (await this.listVideos(userId)).reduce((sum, video) => sum + (video.size_bytes || 0), 0)
    await awsOperation('Unable to reconcile storage', () => this.db.send(new UpdateCommand({
      TableName: this.settings.USERS_TABLE, Key: { id: userId },
      UpdateExpression: 'SET storage_used_bytes = :total', ExpressionAttributeValues: { ':total': total },
    })))
    return total
  }
  async createUploadRecord(item: VideoRecord) {
    await awsOperation('Unable to persist upload record', () => this.db.send(new PutCommand({ TableName: this.settings.VIDEOS_TABLE, Item: item })))
  }
  async getVideo(userId: string, videoId: string): Promise<VideoRecord | undefined> {
    const result = await awsOperation('Unable to read video record', () => this.db.send(new GetCommand({
      TableName: this.settings.VIDEOS_TABLE, Key: { user_id: userId, id: videoId },
    })))
    return result.Item as VideoRecord | undefined
  }
  async getVideoById(videoId: string): Promise<VideoRecord | undefined> {
    const result = await awsOperation('Unable to read video record', () => this.db.send(new QueryCommand({
      TableName: this.settings.VIDEOS_TABLE, IndexName: this.settings.VIDEO_ID_INDEX,
      KeyConditionExpression: 'id = :id', ExpressionAttributeValues: { ':id': videoId }, Limit: 1,
    })))
    return result.Items?.[0] as VideoRecord | undefined
  }
  async listVideos(userId: string): Promise<VideoRecord[]> {
    const items: VideoRecord[] = []
    let startKey: Record<string, unknown> | undefined
    do {
      const result = await awsOperation('Unable to list videos', () => this.db.send(new QueryCommand({
        TableName: this.settings.VIDEOS_TABLE, KeyConditionExpression: 'user_id = :user_id',
        ExpressionAttributeValues: { ':user_id': userId }, ExclusiveStartKey: startKey,
      })))
      items.push(...(result.Items || []) as VideoRecord[])
      startKey = result.LastEvaluatedKey
    } while (startKey)
    return items.sort((a, b) => b.created_at - a.created_at)
  }
  async markProcessing(userId: string, videoId: string, hlsKey: string) {
    await awsOperation('Unable to update video status', () => this.db.send(new UpdateCommand({
      TableName: this.settings.VIDEOS_TABLE, Key: { user_id: userId, id: videoId },
      UpdateExpression: 'SET #status = :processing, s3_key_hls = :hls REMOVE upload_id',
      ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':processing': 'processing', ':hls': hlsKey },
    })))
  }
  async updateFields(userId: string, videoId: string, fields: Record<string, string | boolean>): Promise<VideoRecord> {
    const names: Record<string, string> = {}
    const values: Record<string, string | boolean> = {}
    const clauses = Object.entries(fields).map(([key, value], i) => {
      names[`#f${i}`] = key
      values[`:v${i}`] = value
      return `#f${i} = :v${i}`
    })
    const result = await awsOperation('Unable to update video record', () => this.db.send(new UpdateCommand({
      TableName: this.settings.VIDEOS_TABLE, Key: { user_id: userId, id: videoId },
      UpdateExpression: `SET ${clauses.join(', ')}`, ExpressionAttributeNames: names,
      ExpressionAttributeValues: values, ReturnValues: 'ALL_NEW',
    })))
    return result.Attributes as VideoRecord
  }
  assertOwner(userId: string, video: VideoRecord) {
    if (video.user_id !== userId) throw new ApiError(404, 'Video not found')
  }
  async deleteVideo(userId: string, videoId: string) {
    await awsOperation('Unable to delete video record', () => this.db.send(new DeleteCommand({
      TableName: this.settings.VIDEOS_TABLE, Key: { user_id: userId, id: videoId },
    })))
  }
}

export class VideoService {
  constructor(private repository: VideoRepository, private settings: Settings, private s3: S3Client) {}
  async listUserVideos(user: AuthenticatedUser) { return this.repository.listVideos(user.id) }
  async loadOwnedVideo(user: AuthenticatedUser, videoId: string) {
    const video = await this.repository.getVideoById(videoId)
    if (!video) throw new ApiError(404, 'Video not found')
    this.repository.assertOwner(user.id, video)
    return video
  }
  async updateVideo(user: AuthenticatedUser, videoId: string, payload: UpdateVideoRequest) {
    const video = await this.loadOwnedVideo(user, videoId)
    const fields: Record<string, string | boolean> = {}
    if (payload.title != null) fields.title = payload.title
    if (payload.favorite != null) fields.favorite = payload.favorite
    return Object.keys(fields).length ? this.repository.updateFields(user.id, videoId, fields) : video
  }
  private async deleteS3Prefix(bucket: string, prefix: string) {
    await awsOperation('Unable to delete media objects', async () => {
      let continuationToken: string | undefined
      do {
        const page = await this.s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }))
        const objects = (page.Contents || []).flatMap(item => item.Key ? [{ Key: item.Key }] : [])
        for (let start = 0; start < objects.length; start += 1000) {
          const result = await this.s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects.slice(start, start + 1000), Quiet: true } }))
          if (result.Errors?.length) throw new Error(result.Errors[0].Message || 'S3 object deletion failed')
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (continuationToken)
    })
  }
  async deleteVideo(user: AuthenticatedUser, videoId: string) {
    const video = await this.loadOwnedVideo(user, videoId)
    await this.deleteS3Prefix(this.settings.RAW_UPLOADS_BUCKET, `${user.id}/${videoId}/`)
    const hlsKey = video.s3_key_hls
    const prefix = hlsKey?.includes('/') ? hlsKey.slice(0, hlsKey.lastIndexOf('/') + 1) : `${user.id}/${videoId}/hls/`
    await this.deleteS3Prefix(this.settings.PROCESSED_VIDEOS_BUCKET, prefix)
    await this.repository.deleteVideo(user.id, videoId)
    await this.repository.reconcileUserStorage(user.id)
  }
}
