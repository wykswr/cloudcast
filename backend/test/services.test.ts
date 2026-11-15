import { describe, expect, it, vi } from 'vitest'
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  S3Client,
  CompleteMultipartUploadCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import {
  VideoRepository,
  VideoService,
  decodeCursor,
  encodeCursor,
  listFilter,
  matchesListQuery,
} from '../src/services/videos'
import type { PartPresigner } from '../src/services/uploads'
import { UploadService } from '../src/services/uploads'
import { ApiError } from '../src/errors'
import { settings, user, video, mockAwsSend } from './fixtures'

function setup() {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: settings.AWS_REGION }))
  const s3 = new S3Client({ region: settings.AWS_REGION })
  const dbSend = mockAwsSend(db)
  const s3Send = mockAwsSend(s3)
  const repository = new VideoRepository(db, settings)
  return {
    dbSend,
    s3Send,
    repository,
    videos: new VideoService(repository, settings, s3),
    uploads: new UploadService(s3, repository, settings),
    s3,
  }
}
describe('DynamoDB/video services', () => {
  it('reserves quota atomically and maps conditional failures to 413', async () => {
    const { repository, dbSend } = setup()
    dbSend.mockResolvedValue({})
    await repository.reserveStorage(user.id, 50)
    const command = dbSend.mock.calls[0][0] as unknown as UpdateCommand
    expect(command.input.ExpressionAttributeValues).toEqual({
      ':size': 50,
      ':allowed': settings.STORAGE_QUOTA_BYTES - 50,
    })
    expect(command.input.ConditionExpression).toContain('storage_used_bytes <= :allowed')
    await expect(
      repository.reserveStorage(user.id, settings.STORAGE_QUOTA_BYTES + 1),
    ).rejects.toMatchObject({ status: 413 })
    dbSend.mockRejectedValue(
      Object.assign(new Error('quota'), { name: 'ConditionalCheckFailedException' }),
    )
    await expect(repository.reserveStorage(user.id, 50)).rejects.toMatchObject({
      status: 413,
      detail: 'Upload would exceed your storage quota',
    })
  })
  it('reads every query page, sorts newest first, and reconciles storage', async () => {
    const { repository, dbSend } = setup()
    dbSend
      .mockResolvedValueOnce({
        Items: [{ ...video, id: 'older', created_at: 1, size_bytes: 5 }],
        LastEvaluatedKey: { user_id: 'owner', id: 'older' },
      })
      .mockResolvedValueOnce({ Items: [{ ...video, id: 'newer', size_bytes: 10 }] })
      .mockResolvedValueOnce({})
    expect(await repository.reconcileUserStorage('owner')).toBe(15)
    expect((dbSend.mock.calls[1][0] as unknown as QueryCommand).input.ExclusiveStartKey).toEqual({
      user_id: 'owner',
      id: 'older',
    })
    expect(
      (dbSend.mock.calls[2][0] as unknown as UpdateCommand).input.ExpressionAttributeValues,
    ).toEqual({ ':total': 15 })
    dbSend.mockResolvedValueOnce({
      Items: [
        { ...video, created_at: 1 },
        { ...video, id: 'newer' },
      ],
    })
    expect((await repository.listVideos('owner'))[0].id).toBe('newer')
  })
  it('hides other owners and does not mutate their records', async () => {
    const { videos, dbSend, s3Send } = setup()
    dbSend.mockResolvedValue({ Items: [{ ...video, user_id: 'other' }] })
    await expect(videos.updateVideo(user, 'video', { title: 'x' })).rejects.toMatchObject({
      status: 404,
    })
    await expect(videos.deleteVideo(user, 'video')).rejects.toMatchObject({ status: 404 })
    expect(dbSend.mock.calls.every(([command]) => command instanceof QueryCommand)).toBe(true)
    expect(s3Send).not.toHaveBeenCalled()
  })
  it('does not update null/empty fields and preserves false favorites', async () => {
    const { videos, dbSend } = setup()
    dbSend.mockResolvedValueOnce({ Items: [video] })
    expect(await videos.updateVideo(user, 'video', { title: null, favorite: null })).toEqual(video)
    expect(dbSend).toHaveBeenCalledTimes(1)
    dbSend
      .mockResolvedValueOnce({ Items: [video] })
      .mockResolvedValueOnce({ Attributes: { ...video, favorite: false } })
    await videos.updateVideo(user, 'video', { favorite: false, title: ' Beach DAY ' })
    const command = dbSend.mock.calls[2][0] as unknown as UpdateCommand
    expect(command.input.ExpressionAttributeNames).toEqual({
      '#f0': 'title',
      '#f1': 'title_search',
      '#f2': 'favorite',
    })
    expect(command.input.ExpressionAttributeValues).toEqual({
      ':v0': ' Beach DAY ',
      ':v1': 'beach day',
      ':v2': false,
    })
    expect(command.input.ReturnValues).toBe('ALL_NEW')
  })
  it('deletes paginated media before the record, then reconciles quota', async () => {
    const { videos, dbSend, s3Send } = setup()
    dbSend
      .mockResolvedValueOnce({ Items: [video] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({})
    s3Send
      .mockResolvedValueOnce({
        Contents: Array.from({ length: 1001 }, (_, i) => ({ Key: `raw-${i}` })),
        IsTruncated: true,
        NextContinuationToken: 'next',
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Contents: [{ Key: 'last' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Contents: [{ Key: 'hls' }] })
      .mockResolvedValueOnce({})
    await videos.deleteVideo(user, 'video')
    expect(
      (s3Send.mock.calls[1][0] as unknown as DeleteObjectsCommand).input.Delete?.Objects,
    ).toHaveLength(1000)
    expect(
      (s3Send.mock.calls[2][0] as unknown as DeleteObjectsCommand).input.Delete?.Objects,
    ).toHaveLength(1)
    expect(
      (s3Send.mock.calls[3][0] as unknown as ListObjectsV2Command).input.ContinuationToken,
    ).toBe('next')
    expect((s3Send.mock.calls[5][0] as unknown as ListObjectsV2Command).input).toMatchObject({
      Bucket: 'processed',
      Prefix: 'owner/video/hls/',
    })
    expect(dbSend.mock.calls[1][0]).toBeInstanceOf(DeleteCommand)
    expect(
      (dbSend.mock.calls[3][0] as unknown as UpdateCommand).input.ExpressionAttributeValues,
    ).toEqual({ ':total': 0 })
  })
  it('falls back to the conventional HLS prefix when no manifest key was recorded', async () => {
    const { videos, dbSend, s3Send } = setup()
    dbSend
      .mockResolvedValueOnce({ Items: [{ ...video, s3_key_hls: null }] })
      .mockResolvedValue({ Items: [] })
    s3Send.mockResolvedValue({})
    await videos.deleteVideo(user, 'video')
    expect((s3Send.mock.calls[1][0] as unknown as ListObjectsV2Command).input).toMatchObject({
      Bucket: 'processed',
      Prefix: 'owner/video/hls/',
    })
  })
  it('rejects invalid stored records on reads and skips them in listings', async () => {
    const { repository, videos, dbSend } = setup()
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {})
    dbSend.mockResolvedValueOnce({ Items: [{ ...video, status: 'archived' }] })
    await expect(videos.loadOwnedVideo(user, 'video')).rejects.toMatchObject({
      status: 500,
      detail: 'Stored video record is invalid',
    })
    dbSend.mockResolvedValueOnce({
      Items: [{ ...video, id: 'broken', created_at: 'yesterday' }, video],
    })
    expect((await repository.listVideos('owner')).map((item) => item.id)).toEqual(['video'])
    expect(logging).toHaveBeenCalledTimes(2)
    logging.mockRestore()
  })
  it('leaves the record when media deletion fails and maps AWS errors', async () => {
    const { videos, dbSend, s3Send } = setup()
    dbSend.mockResolvedValue({ Items: [video] })
    s3Send
      .mockResolvedValueOnce({ Contents: [{ Key: 'raw' }] })
      .mockResolvedValueOnce({ Errors: [{ Message: 'Denied' }] })
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(videos.deleteVideo(user, 'video')).rejects.toMatchObject({
      status: 502,
      detail: 'Unable to delete media objects: Denied',
    })
    expect(dbSend).toHaveBeenCalledTimes(1)
    logging.mockRestore()
  })
})
describe('Multipart uploads', () => {
  it('initializes user/quota, writes metadata and retains timestamps/whole-second duration', async () => {
    const { uploads, dbSend, s3Send } = setup()
    dbSend.mockResolvedValue({})
    s3Send.mockResolvedValue({ UploadId: 'upload' })
    const response = await uploads.initiateUpload(user, {
      filename: 'holiday.final.mp4',
      contentType: 'video/mp4',
      sizeBytes: 100,
      durationSeconds: 2.8,
      sourceWidth: 1920,
      sourceHeight: 1080,
    })
    const item = (dbSend.mock.calls[2][0] as unknown as PutCommand).input.Item!
    expect(item).toMatchObject({
      id: response.videoId,
      user_id: 'owner',
      upload_id: 'upload',
      status: 'uploading',
      size_bytes: 100,
      duration_seconds: 2,
      source_width: 1920,
      favorite: false,
      title: 'holiday.final.mp4',
      title_search: 'holiday.final.mp4',
    })
    expect(item.created_at).toBeCloseTo(Date.now() / 1000, -1)
    expect(s3Send.mock.calls[0][0].input).toMatchObject({
      Metadata: {
        video_id: response.videoId,
        user_id: 'owner',
        title: 'holiday.final.mp4',
        source_width: '1920',
        source_height: '1080',
      },
    })
  })
  it('does not call S3 when quota reservation fails', async () => {
    const { uploads, repository, s3Send } = setup()
    vi.spyOn(repository, 'ensureUserRecord').mockResolvedValue(undefined)
    vi.spyOn(repository, 'reserveStorage').mockRejectedValue(new ApiError(413, 'quota'))
    await expect(
      uploads.initiateUpload(user, { filename: 'x', contentType: 'v', sizeBytes: 100 }),
    ).rejects.toMatchObject({ status: 413 })
    expect(s3Send).not.toHaveBeenCalled()
  })
  it.each([
    [undefined, 404],
    [{ ...video, upload_id: 'other', status: 'uploading' }, 400],
    [{ ...video, upload_id: 'upload', status: 'processing' }, 409],
  ])('rejects invalid sessions before signing or completing', async (record, status) => {
    const { uploads, dbSend, s3Send } = setup()
    dbSend.mockResolvedValue({ Item: record })
    await expect(uploads.presignPart(user, 'video', 'upload', 1)).rejects.toMatchObject({ status })
    await expect(
      uploads.completeUpload(user, 'video', 'upload', [{ partNumber: 1, etag: 'a' }]),
    ).rejects.toMatchObject({ status })
    expect(s3Send).not.toHaveBeenCalled()
  })
  it('presigns exact part details without requiring checksums', async () => {
    const { repository, dbSend, s3 } = setup()
    dbSend.mockResolvedValue({ Item: { ...video, status: 'uploading', upload_id: 'upload' } })
    const presign = vi.fn<PartPresigner>().mockResolvedValue('signed')
    const uploads = new UploadService(s3, repository, settings, presign)
    expect(await uploads.presignPart(user, 'video', 'upload', 3)).toBe('signed')
    expect(presign.mock.calls[0][1].input).toMatchObject({
      Bucket: 'raw',
      Key: video.s3_key_raw,
      UploadId: 'upload',
      PartNumber: 3,
    })
    expect(presign.mock.calls[0][2]).toEqual({ expiresIn: 3600 })
  })
  it('sorts completion parts and marks processing only after successful S3 completion', async () => {
    const { uploads, dbSend, s3Send } = setup()
    dbSend
      .mockResolvedValueOnce({
        Item: { ...video, status: 'uploading', upload_id: 'upload', s3_key_hls: undefined },
      })
      .mockResolvedValueOnce({})
    s3Send.mockResolvedValue({})
    await uploads.completeUpload(user, 'video', 'upload', [
      { partNumber: 2, etag: 'b' },
      { partNumber: 1, etag: 'a' },
    ])
    expect(
      (s3Send.mock.calls[0][0] as unknown as CompleteMultipartUploadCommand).input.MultipartUpload
        ?.Parts,
    ).toEqual([
      { ETag: 'a', PartNumber: 1 },
      { ETag: 'b', PartNumber: 2 },
    ])
    expect((dbSend.mock.calls[1][0] as unknown as UpdateCommand).input).toMatchObject({
      UpdateExpression: 'SET #status = :processing, s3_key_hls = :hls REMOVE upload_id',
      ExpressionAttributeValues: { ':hls': 'owner/video/hls/holiday.final.m3u8' },
    })
    expect(s3Send.mock.invocationCallOrder[0]).toBeLessThan(dbSend.mock.invocationCallOrder[1])
  })
  it('rejects empty parts and maps S3 failures without marking processing', async () => {
    const { uploads, dbSend, s3Send } = setup()
    dbSend.mockResolvedValue({ Item: { ...video, status: 'uploading', upload_id: 'upload' } })
    await expect(uploads.completeUpload(user, 'video', 'upload', [])).rejects.toMatchObject({
      status: 400,
    })
    expect(s3Send).not.toHaveBeenCalled()
    s3Send.mockRejectedValue(new Error('S3 failed'))
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      uploads.completeUpload(user, 'video', 'upload', [{ partNumber: 1, etag: 'a' }]),
    ).rejects.toMatchObject({ status: 502, detail: 'Unable to complete upload' })
    expect(dbSend.mock.calls.every(([command]) => !(command instanceof UpdateCommand))).toBe(true)
    logging.mockRestore()
  })
})

describe('Library pages, search and summary', () => {
  const at = (id: string, created_at: number, extra: Record<string, unknown> = {}) => ({
    ...video,
    id,
    created_at,
    ...extra,
  })
  const queryInput = (call: unknown[]) => (call[0] as QueryCommand).input

  it('reads one index page newest first and hands back a cursor for the next', async () => {
    const { videos, dbSend } = setup()
    const lastKey = { user_id: 'owner', id: 'b', created_at: 90 }
    dbSend.mockResolvedValueOnce({ Items: [at('a', 100), at('b', 90)], LastEvaluatedKey: lastKey })
    const page = await videos.listVideoPage(user, { limit: 2, filter: 'all', order: 'newest' })
    expect(page.items.map((v) => v.id)).toEqual(['a', 'b'])
    expect(page.nextCursor).toBe(encodeCursor(lastKey))
    expect(queryInput(dbSend.mock.calls[0])).toMatchObject({
      IndexName: 'UserCreatedIndex',
      KeyConditionExpression: 'user_id = :user_id',
      ExpressionAttributeValues: { ':user_id': 'owner' },
      ScanIndexForward: false,
      Limit: 2,
    })
    expect(queryInput(dbSend.mock.calls[0]).FilterExpression).toBeUndefined()

    dbSend.mockResolvedValueOnce({ Items: [at('c', 80)] })
    const next = await videos.listVideoPage(user, {
      limit: 2,
      filter: 'all',
      order: 'oldest',
      cursor: page.nextCursor!,
    })
    expect(next).toEqual({ items: [at('c', 80)], nextCursor: null })
    expect(queryInput(dbSend.mock.calls[1])).toMatchObject({
      ExclusiveStartKey: lastKey,
      ScanIndexForward: true,
    })
  })

  it('reads ahead for filtered searches, trims to the page size and stops after a few rounds', async () => {
    const { repository, dbSend } = setup()
    dbSend
      .mockResolvedValueOnce({
        Items: [at('a', 100)],
        LastEvaluatedKey: { user_id: 'owner', id: 'x', created_at: 95 },
      })
      .mockResolvedValueOnce({
        Items: [at('b', 90), at('c', 80)],
        LastEvaluatedKey: { user_id: 'owner', id: 'y', created_at: 70 },
      })
    const page = await repository.listVideoPage('owner', {
      limit: 2,
      filter: 'favorites',
      order: 'newest',
      q: ' Lis ',
    })
    expect(page.items.map((v) => v.id)).toEqual(['a', 'b'])
    expect(decodeCursor(page.nextCursor!, 'owner')).toEqual({
      user_id: 'owner',
      id: 'b',
      created_at: 90,
    })
    expect(queryInput(dbSend.mock.calls[0])).toMatchObject({
      Limit: 100,
      FilterExpression:
        'favorite = :favorite AND (contains(title_search, :q) OR contains(title, :q_raw))',
      ExpressionAttributeValues: {
        ':user_id': 'owner',
        ':favorite': true,
        ':q': 'lis',
        ':q_raw': 'Lis',
      },
    })

    dbSend.mockReset()
    dbSend.mockResolvedValue({
      Items: [],
      LastEvaluatedKey: { user_id: 'owner', id: 'z', created_at: 1 },
    })
    const sparse = await repository.listVideoPage('owner', {
      limit: 5,
      filter: 'ready',
      order: 'newest',
    })
    expect(dbSend).toHaveBeenCalledTimes(5)
    expect(sparse.items).toEqual([])
    expect(sparse.nextCursor).not.toBeNull()
  })

  it('builds filters for every library view', () => {
    expect(listFilter('all')).toEqual({ values: {} })
    expect(listFilter('in-progress')).toEqual({
      expression: '#status IN (:uploading, :processing)',
      names: { '#status': 'status' },
      values: { ':uploading': 'uploading', ':processing': 'processing' },
    })
    expect(listFilter('ready', '   ')).toEqual({
      expression: '#status = :ready',
      names: { '#status': 'status' },
      values: { ':ready': 'ready' },
    })
    const fav = { ...video, favorite: true, title: 'Lisbon Rooftop' }
    expect(matchesListQuery(fav, 'favorites', 'rooftop')).toBe(true)
    expect(matchesListQuery(fav, 'favorites', 'beach')).toBe(false)
    expect(matchesListQuery(video, 'favorites')).toBe(false)
    expect(matchesListQuery({ ...video, status: 'processing' }, 'in-progress')).toBe(true)
    expect(matchesListQuery(video, 'in-progress')).toBe(false)
    expect(matchesListQuery({ ...video, status: 'failed' }, 'ready')).toBe(false)
    expect(matchesListQuery({ ...video, title: null }, 'all', 'x')).toBe(false)
  })

  it('rejects malformed cursors and cursors from another user', async () => {
    const { repository, dbSend } = setup()
    const query = { limit: 5, filter: 'all', order: 'newest' } as const
    for (const cursor of ['not-base64!', Buffer.from('{"id":1}').toString('base64url')])
      await expect(repository.listVideoPage('owner', { ...query, cursor })).rejects.toMatchObject({
        status: 400,
        detail: 'Invalid page cursor',
      })
    const theirs = encodeCursor({ user_id: 'other', id: 'v', created_at: 1 })
    await expect(
      repository.listVideoPage('owner', { ...query, cursor: theirs }),
    ).rejects.toMatchObject({ status: 400 })
    expect(dbSend).not.toHaveBeenCalled()
  })

  it('pages in memory when the index is not deployed yet', async () => {
    const { repository, dbSend } = setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const missing = Object.assign(new Error('The table does not have the specified index'), {
      name: 'ValidationException',
    })
    const rows = [
      at('a', 100, { title: 'Beach day' }),
      at('c', 90, { title: 'Beach night' }),
      at('b', 90, { title: 'beach walk' }),
      at('d', 50, { title: 'Garden' }),
    ]
    dbSend.mockRejectedValueOnce(missing).mockResolvedValueOnce({ Items: rows })
    const first = await repository.listVideoPage('owner', {
      limit: 2,
      filter: 'all',
      order: 'newest',
      q: 'BEACH',
    })
    expect(first.items.map((v) => v.id)).toEqual(['a', 'c'])
    expect(queryInput(dbSend.mock.calls[1]).IndexName).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)

    dbSend.mockRejectedValueOnce(missing).mockResolvedValueOnce({ Items: rows })
    const second = await repository.listVideoPage('owner', {
      limit: 2,
      filter: 'all',
      order: 'newest',
      q: 'beach',
      cursor: first.nextCursor!,
    })
    expect(second).toEqual({ items: [rows[2]], nextCursor: null })

    dbSend.mockRejectedValueOnce(missing).mockResolvedValueOnce({ Items: rows })
    const oldest = await repository.listVideoPage('owner', {
      limit: 3,
      filter: 'all',
      order: 'oldest',
    })
    expect(oldest.items.map((v) => v.id)).toEqual(['d', 'b', 'c'])
    warn.mockRestore()
  })

  it('maps other query failures to a 502', async () => {
    const { repository, dbSend } = setup()
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {})
    dbSend.mockRejectedValueOnce(new Error('throttled'))
    await expect(
      repository.listVideoPage('owner', { limit: 5, filter: 'all', order: 'newest' }),
    ).rejects.toMatchObject({ status: 502, detail: 'Unable to list videos: throttled' })
    logging.mockRestore()
  })

  it('summarizes counts and storage across pages using a narrow projection', async () => {
    const { videos, dbSend } = setup()
    dbSend
      .mockResolvedValueOnce({
        Items: [
          { status: 'ready', favorite: true, size_bytes: 10 },
          { status: 'uploading', size_bytes: 5 },
        ],
        LastEvaluatedKey: { user_id: 'owner', id: 'x' },
      })
      .mockResolvedValueOnce({ Items: [{ status: 'processing', favorite: false }] })
      .mockResolvedValueOnce({})
    expect(await videos.getSummary(user)).toEqual({
      total: 3,
      favorites: 1,
      inProgress: 2,
      storageUsedBytes: 15,
      storageQuotaBytes: settings.STORAGE_QUOTA_BYTES,
    })
    expect(queryInput(dbSend.mock.calls[0])).toMatchObject({
      ProjectionExpression: '#status, favorite, size_bytes',
      ExpressionAttributeNames: { '#status': 'status' },
    })
    expect(queryInput(dbSend.mock.calls[1]).ExclusiveStartKey).toEqual({
      user_id: 'owner',
      id: 'x',
    })
    expect(await videos.getSummary(user)).toMatchObject({ total: 0, storageUsedBytes: 0 })
  })
})
