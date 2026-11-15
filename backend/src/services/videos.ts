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
import type {
  LibrarySummary,
  UpdateVideoRequest,
  VideoItem,
  VideoListFilter,
  VideoListOrder,
} from '@cloudcast/contracts'
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
  /** Lower-cased title for case-insensitive search; absent on records written before it existed. */
  title_search: z.string().optional(),
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

export type VideoPageQuery = {
  limit: number
  cursor?: string
  q?: string
  filter: VideoListFilter
  order: VideoListOrder
}
export type VideoPage = { items: VideoRecord[]; nextCursor: string | null }
export type LibraryCounts = Omit<LibrarySummary, 'storageQuotaBytes'>

/** Normalised title stored as `title_search` and compared against search terms. */
export function searchableTitle(title: string | null | undefined): string {
  return (title ?? '').trim().toLowerCase()
}

/** Position in a listing: the user/created_at index key of the last video on a page. */
const PageKeySchema = z.object({ user_id: z.string(), id: z.string(), created_at: z.number() })
type PageKey = z.infer<typeof PageKeySchema>

const pageKey = (video: PageKey): PageKey => ({
  user_id: video.user_id,
  id: video.id,
  created_at: video.created_at,
})

export function encodeCursor(key: PageKey): string {
  return Buffer.from(JSON.stringify(pageKey(key))).toString('base64url')
}

/** Rejects cursors that are malformed or were issued for another user's listing. */
export function decodeCursor(cursor: string, userId: string): PageKey {
  let key: PageKey | undefined
  try {
    key = PageKeySchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')))
  } catch {
    key = undefined
  }
  if (!key || key.user_id !== userId) throw new ApiError(400, 'Invalid page cursor')
  return key
}

const isInProgress = (status: VideoRecord['status']) =>
  status === 'uploading' || status === 'processing'

/** The same filter as `listFilter`, applied in memory. */
export function matchesListQuery(video: VideoRecord, filter: VideoListFilter, q?: string) {
  if (filter === 'favorites' && !video.favorite) return false
  if (filter === 'in-progress' && !isInProgress(video.status)) return false
  if (filter === 'ready' && video.status !== 'ready') return false
  const needle = searchableTitle(q)
  return !needle || searchableTitle(video.title).includes(needle)
}

type ListFilter = {
  expression?: string
  names?: Record<string, string>
  values: Record<string, unknown>
}

/** DynamoDB FilterExpression for a library view and an optional title search. */
export function listFilter(filter: VideoListFilter, q?: string): ListFilter {
  const clauses: string[] = []
  const names: Record<string, string> = {}
  const values: Record<string, unknown> = {}
  if (filter === 'favorites') {
    clauses.push('favorite = :favorite')
    values[':favorite'] = true
  } else if (filter === 'in-progress') {
    names['#status'] = 'status'
    clauses.push('#status IN (:uploading, :processing)')
    values[':uploading'] = 'uploading'
    values[':processing'] = 'processing'
  } else if (filter === 'ready') {
    names['#status'] = 'status'
    clauses.push('#status = :ready')
    values[':ready'] = 'ready'
  }
  const needle = searchableTitle(q)
  if (needle) {
    // Older records have no title_search, so also match their title as typed.
    clauses.push('(contains(title_search, :q) OR contains(title, :q_raw))')
    values[':q'] = needle
    values[':q_raw'] = (q ?? '').trim()
  }
  return {
    ...(clauses.length ? { expression: clauses.join(' AND ') } : {}),
    ...(Object.keys(names).length ? { names } : {}),
    values,
  }
}

/** Newest first, ties broken by id so pages never repeat or skip a video. */
function compareNewest(a: PageKey, b: PageKey) {
  if (a.created_at !== b.created_at) return b.created_at - a.created_at
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

function isMissingIndex(error: unknown) {
  return (
    error instanceof Error && error.name === 'ValidationException' && /index/i.test(error.message)
  )
}

// A filtered query reads at least this many items per request, so a sparse match (a search, a few
// favorites) does not take one round trip per item. Rounds are capped to bound a single request.
const FILTERED_READ_AHEAD = 100
const MAX_PAGE_ROUNDS = 5

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

  /**
   * One page of a user's library, newest (or oldest) first. Reads the user/created_at index so a
   * page costs only the items on it; falls back to sorting in memory if the index is not deployed.
   */
  async listVideoPage(userId: string, query: VideoPageQuery): Promise<VideoPage> {
    const start = query.cursor ? decodeCursor(query.cursor, userId) : undefined
    try {
      return await this.queryIndexPage(userId, query, start)
    } catch (error) {
      if (!isMissingIndex(error)) {
        return awsOperation('Unable to list videos', () => Promise.reject(error))
      }
      logger.warn('Videos index missing; paging in memory', {
        index: this.settings.USER_CREATED_INDEX,
      })
      return this.memoryPage(userId, query, start)
    }
  }

  private async queryIndexPage(
    userId: string,
    query: VideoPageQuery,
    start: PageKey | undefined,
  ): Promise<VideoPage> {
    const filter = listFilter(query.filter, query.q)
    const items: VideoRecord[] = []
    let startKey: Record<string, unknown> | undefined = start
    for (let round = 0; round < MAX_PAGE_ROUNDS; round += 1) {
      const remaining = query.limit - items.length
      const result = await this.db.send(
        new QueryCommand({
          TableName: this.settings.VIDEOS_TABLE,
          IndexName: this.settings.USER_CREATED_INDEX,
          KeyConditionExpression: 'user_id = :user_id',
          ExpressionAttributeValues: { ':user_id': userId, ...filter.values },
          ...(filter.expression ? { FilterExpression: filter.expression } : {}),
          ...(filter.names ? { ExpressionAttributeNames: filter.names } : {}),
          ScanIndexForward: query.order === 'oldest',
          Limit: filter.expression ? Math.max(remaining, FILTERED_READ_AHEAD) : remaining,
          ExclusiveStartKey: startKey,
        }),
      )
      for (const item of result.Items || []) {
        const record = safeParseRecord(item)
        if (record) items.push(record)
      }
      startKey = result.LastEvaluatedKey
      if (!startKey || items.length >= query.limit) break
    }
    if (items.length > query.limit) {
      const page = items.slice(0, query.limit)
      return { items: page, nextCursor: encodeCursor(page[page.length - 1]) }
    }
    return { items, nextCursor: startKey ? encodeCursor(PageKeySchema.parse(startKey)) : null }
  }

  private async memoryPage(
    userId: string,
    query: VideoPageQuery,
    start: PageKey | undefined,
  ): Promise<VideoPage> {
    const compare = (a: PageKey, b: PageKey) =>
      query.order === 'oldest' ? compareNewest(b, a) : compareNewest(a, b)
    const matching = (await this.listVideos(userId))
      .sort(compare)
      .filter(
        (video) =>
          matchesListQuery(video, query.filter, query.q) && (!start || compare(video, start) > 0),
      )
    const items = matching.slice(0, query.limit)
    const more = matching.length > items.length
    return { items, nextCursor: more ? encodeCursor(items[items.length - 1]) : null }
  }

  /** Library counts and bytes stored, reading only the attributes they need. */
  async summarize(userId: string): Promise<LibraryCounts> {
    const counts: LibraryCounts = { total: 0, favorites: 0, inProgress: 0, storageUsedBytes: 0 }
    let startKey: Record<string, unknown> | undefined
    do {
      const result = await awsOperation('Unable to summarize library', () =>
        this.db.send(
          new QueryCommand({
            TableName: this.settings.VIDEOS_TABLE,
            KeyConditionExpression: 'user_id = :user_id',
            ExpressionAttributeValues: { ':user_id': userId },
            ProjectionExpression: '#status, favorite, size_bytes',
            ExpressionAttributeNames: { '#status': 'status' },
            ExclusiveStartKey: startKey,
          }),
        ),
      )
      for (const item of result.Items || []) {
        counts.total += 1
        if (item.favorite === true) counts.favorites += 1
        if (item.status === 'uploading' || item.status === 'processing') counts.inProgress += 1
        if (typeof item.size_bytes === 'number') counts.storageUsedBytes += item.size_bytes
      }
      startKey = result.LastEvaluatedKey
    } while (startKey)
    return counts
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

  async listVideoPage(user: AuthenticatedUser, query: VideoPageQuery) {
    return this.repository.listVideoPage(user.id, query)
  }

  async getSummary(user: AuthenticatedUser): Promise<LibrarySummary> {
    const counts = await this.repository.summarize(user.id)
    return { ...counts, storageQuotaBytes: this.settings.STORAGE_QUOTA_BYTES }
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
    if (payload.title != null) {
      fields.title = payload.title
      fields.title_search = searchableTitle(payload.title)
    }
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
