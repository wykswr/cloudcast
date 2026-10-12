import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import type { S3Client } from '@aws-sdk/client-s3'
import { VideoItemSchema, VideoStatusSchema } from '@cloudcast/contracts'
import type { UpdateVideoRequest, VideoItem } from '@cloudcast/contracts'
import { z } from 'zod'
import type { AuthenticatedUser } from '../auth'
import type { Settings } from '../config'
import { ApiError, awsOperation } from '../errors'
import { logger } from '../logger'

/** A Videos table item. Attribute names stay snake_case; the API maps them in `toVideoItem`. */
export const VideoRecordSchema = z.object({
  user_id: z.string(),
  id: z.string(),
  status: VideoStatusSchema,
  created_at: z.number(),
  title: z.string().nullish(),
  s3_key_raw: z.string(),
  s3_key_hls: z.string().nullish(),
  upload_id: z.string().optional(),
  size_bytes: z.number().optional(),
  duration_seconds: z.number().optional(),
  source_width: z.number().optional(),
  source_height: z.number().optional(),
  favorite: z.boolean().optional(),
})
export type VideoRecord = z.infer<typeof VideoRecordSchema>

/** Validates an item read from DynamoDB, which the Step Functions workflow also writes. */
function safeParseRecord(item: unknown): VideoRecord | undefined {
  const result = VideoRecordSchema.safeParse(item)
  if (result.success) return result.data
  logger.error('Invalid video record in DynamoDB', { issues: result.error.issues })
  return undefined
}

function parseRecord(item: unknown): VideoRecord {
  const record = safeParseRecord(item)
  if (!record) throw new ApiError(500, 'Stored video record is invalid')
  return record
}

export function toVideoItem(video: VideoRecord): VideoItem {
  return VideoItemSchema.parse({
    id: video.id,
    title: video.title,
    status: video.status,
    createdAt: video.created_at,
    s3KeyHls: video.s3_key_hls,
    sizeBytes: video.size_bytes,
    durationSeconds: video.duration_seconds,
    sourceWidth: video.source_width,
    sourceHeight: video.source_height,
    favorite: video.favorite,
  })
}

export class VideoRepository {
  constructor(
    private db: DynamoDBDocumentClient,
    private settings: Settings,
  ) {}

  async ensureUserRecord(user: AuthenticatedUser) {
    await awsOperation('Unable to persist user record', () =>
      this.db.send(
        new UpdateCommand({
          TableName: this.settings.USERS_TABLE,
          Key: { id: user.id },
          UpdateExpression:
            'SET email = if_not_exists(email, :email), created_at = if_not_exists(created_at, :created_at)',
          ExpressionAttributeValues: {
            ':email': user.email || `user-${user.id}`,
            ':created_at': Math.floor(Date.now() / 1000),
          },
        }),
      ),
    )
  }

  async reserveStorage(userId: string, sizeBytes: number) {
    const quota = this.settings.STORAGE_QUOTA_BYTES
    if (sizeBytes > quota) throw new ApiError(413, 'File exceeds your storage quota')
    await awsOperation('Unable to reserve storage', async () => {
      try {
        await this.db.send(
          new UpdateCommand({
            TableName: this.settings.USERS_TABLE,
            Key: { id: userId },
            UpdateExpression: 'ADD storage_used_bytes :size',
            ConditionExpression:
              'attribute_not_exists(storage_used_bytes) OR storage_used_bytes <= :allowed',
            ExpressionAttributeValues: { ':size': sizeBytes, ':allowed': quota - sizeBytes },
          }),
        )
      } catch (error) {
        if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
          throw new ApiError(413, 'Upload would exceed your storage quota')
        }
        throw error
      }
    })
  }

  async reconcileUserStorage(userId: string) {
    const videos = await this.listVideos(userId)
    const total = videos.reduce((sum, video) => sum + (video.size_bytes || 0), 0)
    await awsOperation('Unable to reconcile storage', () =>
      this.db.send(
        new UpdateCommand({
          TableName: this.settings.USERS_TABLE,
          Key: { id: userId },
          UpdateExpression: 'SET storage_used_bytes = :total',
          ExpressionAttributeValues: { ':total': total },
        }),
      ),
    )
    return total
  }

  async createUploadRecord(item: VideoRecord) {
    await awsOperation('Unable to persist upload record', () =>
      this.db.send(new PutCommand({ TableName: this.settings.VIDEOS_TABLE, Item: item })),
    )
  }

  async getVideo(userId: string, videoId: string): Promise<VideoRecord | undefined> {
    const result = await awsOperation('Unable to read video record', () =>
      this.db.send(
        new GetCommand({
          TableName: this.settings.VIDEOS_TABLE,
          Key: { user_id: userId, id: videoId },
        }),
      ),
    )
    return result.Item && parseRecord(result.Item)
  }

  async getVideoById(videoId: string): Promise<VideoRecord | undefined> {
    const result = await awsOperation('Unable to read video record', () =>
      this.db.send(
        new QueryCommand({
          TableName: this.settings.VIDEOS_TABLE,
          IndexName: this.settings.VIDEO_ID_INDEX,
          KeyConditionExpression: 'id = :id',
          ExpressionAttributeValues: { ':id': videoId },
          Limit: 1,
        }),
      ),
    )
    const item = result.Items?.[0]
    return item && parseRecord(item)
  }

  async listVideos(userId: string): Promise<VideoRecord[]> {
    const items: VideoRecord[] = []
    let startKey: Record<string, unknown> | undefined
    do {
      const result = await awsOperation('Unable to list videos', () =>
        this.db.send(
          new QueryCommand({
            TableName: this.settings.VIDEOS_TABLE,
            KeyConditionExpression: 'user_id = :user_id',
            ExpressionAttributeValues: { ':user_id': userId },
            ExclusiveStartKey: startKey,
          }),
        ),
      )
      // Skip (and log) invalid items so one bad record does not hide the whole library.
      for (const item of result.Items || []) {
        const record = safeParseRecord(item)
        if (record) items.push(record)
      }
      startKey = result.LastEvaluatedKey
    } while (startKey)
    return items.sort((a, b) => b.created_at - a.created_at)
  }

  async markProcessing(userId: string, videoId: string, hlsKey: string) {
    await awsOperation('Unable to update video status', () =>
      this.db.send(
        new UpdateCommand({
          TableName: this.settings.VIDEOS_TABLE,
          Key: { user_id: userId, id: videoId },
          UpdateExpression: 'SET #status = :processing, s3_key_hls = :hls REMOVE upload_id',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':processing': 'processing', ':hls': hlsKey },
        }),
      ),
    )
  }

  async updateFields(
    userId: string,
    videoId: string,
    fields: Record<string, string | boolean>,
  ): Promise<VideoRecord> {
    const names: Record<string, string> = {}
    const values: Record<string, string | boolean> = {}
    const clauses = Object.entries(fields).map(([key, value], i) => {
      names[`#f${i}`] = key
      values[`:v${i}`] = value
      return `#f${i} = :v${i}`
    })
    const result = await awsOperation('Unable to update video record', () =>
      this.db.send(
        new UpdateCommand({
          TableName: this.settings.VIDEOS_TABLE,
          Key: { user_id: userId, id: videoId },
          UpdateExpression: `SET ${clauses.join(', ')}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: 'ALL_NEW',
        }),
      ),
    )
    return parseRecord(result.Attributes)
  }

  assertOwner(userId: string, video: VideoRecord) {
    // 404 rather than 403 so callers cannot probe for other users' video IDs.
    if (video.user_id !== userId) throw new ApiError(404, 'Video not found')
  }

  async deleteVideo(userId: string, videoId: string) {
    await awsOperation('Unable to delete video record', () =>
      this.db.send(
        new DeleteCommand({
          TableName: this.settings.VIDEOS_TABLE,
          Key: { user_id: userId, id: videoId },
        }),
      ),
    )
  }
}

export class VideoService {
  constructor(
    private repository: VideoRepository,
    private settings: Settings,
    private s3: S3Client,
  ) {}

  async listUserVideos(user: AuthenticatedUser) {
    return this.repository.listVideos(user.id)
  }

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
    if (!Object.keys(fields).length) return video
    return this.repository.updateFields(user.id, videoId, fields)
  }

  async deleteVideo(user: AuthenticatedUser, videoId: string) {
    const video = await this.loadOwnedVideo(user, videoId)
    await this.deleteS3Prefix(this.settings.RAW_UPLOADS_BUCKET, `${user.id}/${videoId}/`)
    const hlsKey = video.s3_key_hls
    const hlsPrefix = hlsKey?.includes('/')
      ? hlsKey.slice(0, hlsKey.lastIndexOf('/') + 1)
      : `${user.id}/${videoId}/hls/`
    await this.deleteS3Prefix(this.settings.PROCESSED_VIDEOS_BUCKET, hlsPrefix)
    await this.repository.deleteVideo(user.id, videoId)
    await this.repository.reconcileUserStorage(user.id)
  }

  private async deleteS3Prefix(bucket: string, prefix: string) {
    await awsOperation('Unable to delete media objects', async () => {
      let continuationToken: string | undefined
      do {
        const page = await this.s3.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        )
        const objects = (page.Contents || []).flatMap((item) =>
          item.Key ? [{ Key: item.Key }] : [],
        )
        // DeleteObjects accepts at most 1000 keys per request.
        for (let start = 0; start < objects.length; start += 1000) {
          const result = await this.s3.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: objects.slice(start, start + 1000), Quiet: true },
            }),
          )
          if (result.Errors?.length) {
            throw new Error(result.Errors[0].Message || 'S3 object deletion failed')
          }
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (continuationToken)
    })
  }
}
