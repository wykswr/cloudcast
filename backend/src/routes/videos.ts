import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import {
  CompleteUploadRequestSchema,
  CompleteUploadResponseSchema,
  DeleteVideoResponseSchema,
  ErrorResponseSchema,
  SignPartRequestSchema,
  SignPartResponseSchema,
  StreamResponseSchema,
  UpdateVideoRequestSchema,
  UploadInitRequestSchema,
  UploadInitResponseSchema,
  VideoItemSchema,
  VideoListResponseSchema,
} from '@cloudcast/contracts'
import type { AppContainer, AppEnv } from '../container'
import { ApiError } from '../errors'
import { requireAdmin, requireUser } from '../middleware/auth'
import { requireJsonBody } from '../middleware/json-body'
import { toVideoItem } from '../services/videos'

const json = <T extends z.ZodType>(schema: T, description = 'Successful response') => ({
  content: { 'application/json': { schema } },
  description,
})
const body = <T extends z.ZodType>(schema: T) => ({
  required: true,
  content: { 'application/json': { schema } },
})
const errors = {
  400: json(ErrorResponseSchema, 'Invalid upload session or empty parts'),
  401: json(ErrorResponseSchema, 'Authentication required'),
  403: json(ErrorResponseSchema, 'Admin privileges required'),
  404: json(ErrorResponseSchema, 'Video not found'),
  409: json(ErrorResponseSchema, 'Video or upload is not in the required state'),
  413: json(ErrorResponseSchema, 'Storage quota exceeded'),
  422: json(ErrorResponseSchema, 'Request validation failed'),
  502: json(ErrorResponseSchema, 'AWS operation failed'),
  503: json(ErrorResponseSchema, 'Unable to fetch Cognito JWKS'),
}
const params = z.object({
  videoId: z.string().openapi({ param: { name: 'videoId', in: 'path' } }),
})
const common = { tags: ['videos'], security: [{ BearerAuth: [] }] }

const listVideosRoute = createRoute({
  ...common,
  method: 'get',
  path: '/',
  responses: { 200: json(VideoListResponseSchema), ...errors },
})
const initUploadRoute = createRoute({
  ...common,
  method: 'post',
  path: '/upload/init',
  middleware: [requireAdmin, requireJsonBody],
  request: { body: body(UploadInitRequestSchema) },
  responses: { 200: json(UploadInitResponseSchema), ...errors },
})
const signPartRoute = createRoute({
  ...common,
  method: 'post',
  path: '/upload/sign-part',
  middleware: [requireAdmin, requireJsonBody],
  request: { body: body(SignPartRequestSchema) },
  responses: { 200: json(SignPartResponseSchema), ...errors },
})
const completeUploadRoute = createRoute({
  ...common,
  method: 'post',
  path: '/upload/complete',
  middleware: [requireAdmin, requireJsonBody],
  request: { body: body(CompleteUploadRequestSchema) },
  responses: { 200: json(CompleteUploadResponseSchema), ...errors },
})
const updateVideoRoute = createRoute({
  ...common,
  method: 'patch',
  path: '/{videoId}',
  middleware: [requireAdmin, requireJsonBody],
  request: { params, body: body(UpdateVideoRequestSchema) },
  responses: { 200: json(VideoItemSchema), ...errors },
})
const deleteVideoRoute = createRoute({
  ...common,
  method: 'delete',
  path: '/{videoId}',
  middleware: [requireAdmin],
  request: { params },
  responses: { 200: json(DeleteVideoResponseSchema), ...errors },
})
const streamRoute = createRoute({
  ...common,
  method: 'get',
  path: '/{videoId}/stream',
  middleware: [requireAdmin],
  request: { params },
  responses: { 200: json(StreamResponseSchema), ...errors },
})

export function videoRoutes({
  tokenVerifier,
  uploadService,
  videoService,
  streamSigner,
}: AppContainer) {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ detail: 'Request validation failed' }, 422)
    },
  })
  app.use('*', requireUser(tokenVerifier))

  app.openapi(listVideosRoute, async (c) => {
    const videos = await videoService.listUserVideos(c.get('user'))
    return c.json({ items: videos.map(toVideoItem) }, 200)
  })

  app.openapi(initUploadRoute, async (c) => {
    return c.json(await uploadService.initiateUpload(c.get('user'), c.req.valid('json')), 200)
  })

  app.openapi(signPartRoute, async (c) => {
    const { videoId, uploadId, partNumber } = c.req.valid('json')
    const presignedUrl = await uploadService.presignPart(
      c.get('user'),
      videoId,
      uploadId,
      partNumber,
    )
    return c.json({ presignedUrl }, 200)
  })

  app.openapi(completeUploadRoute, async (c) => {
    const { videoId, uploadId, parts } = c.req.valid('json')
    await uploadService.completeUpload(c.get('user'), videoId, uploadId, parts)
    return c.json({ status: 'processing' as const }, 200)
  })

  app.openapi(updateVideoRoute, async (c) => {
    const { videoId } = c.req.valid('param')
    const video = await videoService.updateVideo(c.get('user'), videoId, c.req.valid('json'))
    return c.json(toVideoItem(video), 200)
  })

  app.openapi(deleteVideoRoute, async (c) => {
    await videoService.deleteVideo(c.get('user'), c.req.valid('param').videoId)
    return c.json({ status: 'deleted' as const }, 200)
  })

  app.openapi(streamRoute, async (c) => {
    const { videoId } = c.req.valid('param')
    const video = await videoService.loadOwnedVideo(c.get('user'), videoId)
    if (video.status !== 'ready' || !video.s3_key_hls) {
      throw new ApiError(409, 'Video not ready for streaming')
    }
    try {
      return c.json({ streamUrl: await streamSigner.sign(video.s3_key_hls) }, 200)
    } catch (error) {
      throw new ApiError(502, 'Unable to sign stream URL', { cause: error })
    }
  })

  return app
}
