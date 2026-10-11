import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import { matchedRoutes } from 'hono/route'
import {
  UploadInitRequestSchema, UploadInitResponseSchema, SignPartRequestSchema, SignPartResponseSchema,
  CompleteUploadRequestSchema, CompleteUploadResponseSchema, UpdateVideoRequestSchema,
  VideoItemSchema, VideoListResponseSchema, StreamResponseSchema, DeleteVideoResponseSchema, ErrorResponseSchema,
} from '@cloudcast/contracts'
import { ApiError } from '../errors'
import type { AppContainer, AppEnv } from '../container'
import { toVideoItem } from '../services/videos'

const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } }, description: 'Successful response' })
const errors = {
  400: { ...json(ErrorResponseSchema), description: 'Invalid upload session or empty parts' },
  401: { ...json(ErrorResponseSchema), description: 'Authentication required' },
  403: { ...json(ErrorResponseSchema), description: 'Admin privileges required' },
  404: { ...json(ErrorResponseSchema), description: 'Video not found' },
  409: { ...json(ErrorResponseSchema), description: 'Video or upload is not in the required state' },
  413: { ...json(ErrorResponseSchema), description: 'Storage quota exceeded' },
  422: { ...json(ErrorResponseSchema), description: 'Request validation failed' },
  502: { ...json(ErrorResponseSchema), description: 'AWS operation failed' },
  503: { ...json(ErrorResponseSchema), description: 'Unable to fetch Cognito JWKS' },
}
const body = <T extends z.ZodType>(schema: T) => ({ required: true, content: { 'application/json': { schema } } })
const params = z.object({ videoId: z.string().openapi({ param: { name: 'videoId', in: 'path' } }) })
const security = [{ BearerAuth: [] }]

const aliases: Record<string, string> = {
  content_type: 'contentType', size_bytes: 'sizeBytes', duration_seconds: 'durationSeconds',
  source_width: 'sourceWidth', source_height: 'sourceHeight', video_id: 'videoId', upload_id: 'uploadId', part_number: 'partNumber',
}
function normalizeAliases(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeAliases)
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = { ...value }
    for (const [snake, camel] of Object.entries(aliases)) {
      if (!(camel in result) && snake in result) result[camel] = result[snake]
      delete result[snake]
    }
    if ('parts' in result) result.parts = normalizeAliases(result.parts)
    return result
  }
  return value
}

export function videoRoutes(container: AppContainer) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: (result, c) => {
    if (!result.success) return c.json({ detail: 'Request validation failed' }, 422)
  } })
  const user: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (!matchedRoutes(c).some(route => route.method !== 'ALL')) return c.notFound()
    const match = /^Bearer\s+(.+)$/i.exec(c.req.header('Authorization') || '')
    if (!match) throw new ApiError(401, 'Missing Authorization header')
    c.set('user', await container.tokenVerifier.verify(match[1]))
    await next()
  }
  const admin: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (!c.get('user').groups.includes('admin')) throw new ApiError(403, 'Admin privileges required')
    await next()
  }
  app.use('*', user)
  // Normalize legacy Python field names before OpenAPI's JSON validator reads the body.
  const normalizeBody: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (['POST', 'PATCH'].includes(c.req.method)) {
      const contentType = c.req.header('Content-Type') || ''
      if (!/^application\/json(?:;|$)/i.test(contentType)) throw new ApiError(422, 'Request validation failed')
      let payload
      try { payload = normalizeAliases(await c.req.json()) } catch { throw new ApiError(422, 'Invalid JSON body') }
      c.req.json = async <T>() => payload as T
    }
    await next()
  }
  app.openapi(createRoute({ method: 'get', path: '/', tags: ['videos'], security,
    responses: { 200: json(VideoListResponseSchema), ...errors },
  }), async c => c.json({ items: (await container.videoService.listUserVideos(c.get('user'))).map(toVideoItem) }, 200))

  app.openapi(createRoute({ method: 'post', path: '/upload/init', tags: ['videos'], security, middleware: [admin, normalizeBody],
    request: { body: body(UploadInitRequestSchema) }, responses: { 200: json(UploadInitResponseSchema), ...errors },
  }), async c => c.json(await container.uploadService.initiateUpload(c.get('user'), c.req.valid('json')), 200))
  app.openapi(createRoute({ method: 'post', path: '/upload/sign-part', tags: ['videos'], security, middleware: [admin, normalizeBody],
    request: { body: body(SignPartRequestSchema) }, responses: { 200: json(SignPartResponseSchema), ...errors },
  }), async c => {
    const payload = c.req.valid('json')
    return c.json({ presignedUrl: await container.uploadService.presignPart(c.get('user'), payload.videoId, payload.uploadId, payload.partNumber) }, 200)
  })
  app.openapi(createRoute({ method: 'post', path: '/upload/complete', tags: ['videos'], security, middleware: [admin, normalizeBody],
    request: { body: body(CompleteUploadRequestSchema) }, responses: { 200: json(CompleteUploadResponseSchema), ...errors },
  }), async c => {
    const payload = c.req.valid('json')
    await container.uploadService.completeUpload(c.get('user'), payload.videoId, payload.uploadId, payload.parts)
    return c.json({ status: 'processing' }, 200)
  })
  app.openapi(createRoute({ method: 'patch', path: '/{videoId}', tags: ['videos'], security, middleware: [admin, normalizeBody],
    request: { params, body: body(UpdateVideoRequestSchema) }, responses: { 200: json(VideoItemSchema), ...errors },
  }), async c => c.json(toVideoItem(await container.videoService.updateVideo(c.get('user'), c.req.valid('param').videoId, c.req.valid('json'))), 200))
  app.openapi(createRoute({ method: 'delete', path: '/{videoId}', tags: ['videos'], security, middleware: [admin],
    request: { params }, responses: { 200: json(DeleteVideoResponseSchema), ...errors },
  }), async c => {
    await container.videoService.deleteVideo(c.get('user'), c.req.valid('param').videoId)
    return c.json({ status: 'deleted' }, 200)
  })
  app.openapi(createRoute({ method: 'get', path: '/{videoId}/stream', tags: ['videos'], security, middleware: [admin],
    request: { params }, responses: { 200: json(StreamResponseSchema), ...errors },
  }), async c => {
    const video = await container.videoService.loadOwnedVideo(c.get('user'), c.req.valid('param').videoId)
    if (video.status !== 'ready' || !video.s3_key_hls) throw new ApiError(409, 'Video not ready for streaming')
    let streamUrl
    try { streamUrl = await container.streamSigner.sign(video.s3_key_hls) } catch (error) {
      throw new ApiError(502, 'Unable to sign stream URL', { cause: error })
    }
    return c.json({ streamUrl }, 200)
  })
  return app
}
