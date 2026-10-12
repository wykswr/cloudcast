import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'
import { ApiError } from '../src/errors'
import { mockContainer, user, video } from './fixtures'

function setup() {
  const container = mockContainer()
  const app = createApp(container)
  const request = (path: string, method = 'GET', body?: unknown) =>
    app.request(path, {
      method,
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  return { container, app, request }
}

describe('Hono API', () => {
  it('serves health, all documented endpoints, bearer security, and documentation', async () => {
    const { app } = setup()
    expect(await (await app.request('/health')).json()).toEqual({ status: 'ok' })
    const spec = await (await app.request('/openapi.json')).json()
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        '/health',
        '/videos',
        '/videos/upload/init',
        '/videos/upload/sign-part',
        '/videos/upload/complete',
        '/videos/{videoId}',
        '/videos/{videoId}/stream',
      ]),
    )
    expect(spec.components.securitySchemes.BearerAuth.scheme).toBe('bearer')
    expect(
      spec.paths['/videos/upload/init'].post.requestBody.content['application/json'].schema
        .required,
    ).toEqual(['filename', 'contentType'])
    expect(await (await app.request('/docs')).text()).toContain('./openapi.json')
    expect(await (await app.request('/redoc')).text()).toContain('spec-url="./openapi.json"')
    expect((await app.request('/docs/')).headers.get('location')).toBe('../docs')
  })
  it('returns camelCase fields with explicit nullable defaults', async () => {
    const { request } = setup()
    const response = await request('/videos')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [
        {
          id: 'video',
          title: 'Title',
          status: 'ready',
          createdAt: 100,
          s3KeyHls: video.s3_key_hls,
          sizeBytes: null,
          durationSeconds: null,
          sourceWidth: null,
          sourceHeight: null,
          favorite: false,
        },
      ],
    })
  })
  it('requires authentication and propagates verifier failures', async () => {
    const { app, request, container } = setup()
    expect((await app.request('/videos')).status).toBe(401)
    vi.mocked(container.tokenVerifier.verify).mockRejectedValue(
      new ApiError(503, 'Unable to fetch Cognito JWKS'),
    )
    const response = await request('/videos')
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ detail: 'Unable to fetch Cognito JWKS' })
  })
  it('allows ordinary users to list but rejects all admin operations', async () => {
    const { request, container } = setup()
    vi.mocked(container.tokenVerifier.verify).mockResolvedValue({ ...user, groups: [] })
    expect((await request('/videos')).status).toBe(200)
    for (const [path, method, payload] of [
      ['/videos/video/stream', 'GET', undefined],
      ['/videos/video', 'DELETE', undefined],
      ['/videos/video', 'PATCH', {}],
      ['/videos/upload/init', 'POST', { filename: 'x', contentType: 'video/mp4' }],
      ['/videos/upload/sign-part', 'POST', { videoId: 'video', uploadId: 'upload', partNumber: 1 }],
      ['/videos/upload/complete', 'POST', { videoId: 'video', uploadId: 'upload', parts: [] }],
    ] as const)
      expect((await request(path, method, payload)).status).toBe(403)
    expect(container.streamSigner.sign).not.toHaveBeenCalled()
    expect(container.uploadService.initiateUpload).not.toHaveBeenCalled()
  })
  it('accepts only camelCase request fields', async () => {
    const { request, container } = setup()
    expect(
      (
        await request('/videos/upload/init', 'POST', {
          filename: 'x.mp4',
          content_type: 'video/mp4',
        })
      ).status,
    ).toBe(422)
    expect(
      (
        await request('/videos/upload/sign-part', 'POST', {
          video_id: 'video',
          upload_id: 'upload',
          part_number: 1,
        })
      ).status,
    ).toBe(422)
    expect(container.uploadService.initiateUpload).not.toHaveBeenCalled()
    expect(container.uploadService.presignPart).not.toHaveBeenCalled()
    const result = await request('/videos/upload/complete', 'POST', {
      videoId: 'video',
      uploadId: 'upload',
      parts: [{ etag: 'etag', partNumber: 1 }],
    })
    expect(await result.json()).toEqual({ status: 'processing' })
    expect(container.uploadService.completeUpload).toHaveBeenCalledWith(user, 'video', 'upload', [
      { etag: 'etag', partNumber: 1 },
    ])
  })
  it.each([
    { filename: 'x', contentType: 'v', sizeBytes: -1 },
    { filename: 'x', contentType: 'v', durationSeconds: -0.1 },
    { filename: 'x', contentType: 'v', sourceWidth: 0 },
    { filename: 'x', contentType: 'v', sourceHeight: 1.5 },
    { filename: 'x' },
  ])('rejects invalid upload metadata: %j', async (payload) => {
    const { request, container } = setup()
    expect((await request('/videos/upload/init', 'POST', payload)).status).toBe(422)
    expect(container.uploadService.initiateUpload).not.toHaveBeenCalled()
  })
  it('rejects malformed JSON and invalid part numbers', async () => {
    const { request, app } = setup()
    expect(
      (
        await request('/videos/upload/sign-part', 'POST', {
          videoId: 'x',
          uploadId: 'y',
          partNumber: 0,
        })
      ).status,
    ).toBe(422)
    expect(
      (
        await app.request('/videos/upload/init', {
          method: 'POST',
          headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
          body: '{',
        })
      ).status,
    ).toBe(422)
  })
  it('rejects non-JSON bodies even when every field is optional', async () => {
    const { app, container } = setup()
    const response = await app.request('/videos/video', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'text/plain' },
      body: '{}',
    })
    expect(response.status).toBe(422)
    expect(container.videoService.updateVideo).not.toHaveBeenCalled()
  })
  it('hides unexpected errors behind a logged 500', async () => {
    const { request, container } = setup()
    vi.mocked(container.videoService.listUserVideos).mockRejectedValue(new Error('boom'))
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await request('/videos')
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ detail: 'Internal Server Error' })
    const entry = JSON.parse(logging.mock.calls[0][0] as string)
    expect(entry).toMatchObject({
      level: 'error',
      message: 'Unhandled request error',
      method: 'GET',
      path: '/videos',
      error: { message: 'boom' },
    })
    logging.mockRestore()
  })
  it('preserves stream state errors, signed URL response, and signing errors', async () => {
    const { request, container } = setup()
    expect(await (await request('/videos/video/stream')).json()).toEqual({
      streamUrl: 'https://media.example.com/signed',
    })
    vi.mocked(container.videoService.loadOwnedVideo).mockResolvedValue({
      ...video,
      status: 'processing',
    })
    expect((await request('/videos/video/stream')).status).toBe(409)
    vi.mocked(container.videoService.loadOwnedVideo).mockResolvedValue(video)
    vi.mocked(container.streamSigner.sign).mockRejectedValue(new Error('SSM failed'))
    const response = await request('/videos/video/stream')
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ detail: 'Unable to sign stream URL' })
  })
  it('preserves 404/405 responses before authentication for unmatched requests', async () => {
    const { app } = setup()
    const response = await app.request('/videos', { method: 'PUT' })
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ detail: 'Method Not Allowed' })
    expect((await app.request('/videos/unknown/path')).status).toBe(404)
  })
  it('supports updates and deletes, and maps ownership errors', async () => {
    const { request, container } = setup()
    expect((await request('/videos/video', 'PATCH', { favorite: false, title: null })).status).toBe(
      200,
    )
    expect(container.videoService.updateVideo).toHaveBeenCalledWith(user, 'video', {
      favorite: false,
      title: null,
    })
    expect(await (await request('/videos/video', 'DELETE')).json()).toEqual({ status: 'deleted' })
    vi.mocked(container.videoService.updateVideo).mockRejectedValue(
      new ApiError(404, 'Video not found'),
    )
    expect((await request('/videos/video', 'PATCH', {})).status).toBe(404)
  })
  it('reflects allowed preflight headers with credentials and excludes disallowed origins', async () => {
    const { app } = setup()
    const response = await app.request('/videos', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(response.headers.get('access-control-allow-headers')).toBe('authorization,content-type')
    expect(
      (await app.request('/health', { headers: { Origin: 'https://evil.example' } })).headers.get(
        'access-control-allow-origin',
      ),
    ).toBeNull()
    const disallowed = await app.request('/videos', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    })
    expect(disallowed.headers.get('access-control-allow-origin')).toBeNull()
  })
})
