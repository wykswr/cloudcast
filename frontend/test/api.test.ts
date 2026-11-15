import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAuthSession } from 'aws-amplify/auth'
import {
  completeUpload,
  fetchSummary,
  fetchVideo,
  fetchVideoPage,
  initUpload,
  removeVideo,
  requestStream,
  signUploadPart,
  updateVideo,
  videoListPath,
} from '../src/lib/api'

vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: vi.fn() }))

const session = (idToken?: string) =>
  ({ tokens: idToken ? { idToken: { toString: () => idToken } } : undefined }) as Awaited<
    ReturnType<typeof fetchAuthSession>
  >

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  vi.mocked(fetchAuthSession).mockResolvedValue(session('id-token'))
})

describe('API client', () => {
  it('sends the Cognito ID token and JSON body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'v1' })))
    await updateVideo('v1', { title: 'New' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8000/videos/v1')
    expect(init).toMatchObject({
      method: 'PATCH',
      headers: { Authorization: 'Bearer id-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New' }),
    })
  })

  it('maps each call to its endpoint', async () => {
    fetchMock.mockImplementation(async () => new Response('{}'))
    await fetchVideo('v 1')
    await fetchSummary()
    await requestStream('v1')
    await removeVideo('v1')
    await initUpload({ filename: 'a.mp4', contentType: 'video/mp4' })
    await signUploadPart({ videoId: 'v1', uploadId: 'u', partNumber: 1 })
    await completeUpload({ videoId: 'v1', uploadId: 'u', parts: [] })
    expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toEqual([
      'GET http://localhost:8000/videos/v%201',
      'GET http://localhost:8000/videos/summary',
      'GET http://localhost:8000/videos/v1/stream',
      'DELETE http://localhost:8000/videos/v1',
      'POST http://localhost:8000/videos/upload/init',
      'POST http://localhost:8000/videos/upload/sign-part',
      'POST http://localhost:8000/videos/upload/complete',
    ])
  })

  it('requests library pages and defaults a missing cursor to null', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ items: [{ id: 'v1' }] })))
    expect(await fetchVideoPage({ filter: 'favorites', q: ' lis ', limit: 24 })).toEqual({
      items: [{ id: 'v1' }],
      nextCursor: null,
    })
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/videos?limit=24&q=lis&filter=favorites',
    )
  })

  it('leaves defaults and blanks out of list query strings', () => {
    expect(videoListPath()).toBe('/videos')
    expect(videoListPath({ filter: 'all', order: 'newest', q: '   ' })).toBe('/videos')
    expect(videoListPath({ cursor: 'a b', order: 'oldest', filter: 'in-progress' })).toBe(
      '/videos?cursor=a+b&filter=in-progress&order=oldest',
    )
  })

  it('surfaces the API detail message, or the status when there is none', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Video not found' }), { status: 404 }),
    )
    await expect(fetchVideoPage()).rejects.toThrow('Video not found')
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    await expect(fetchVideoPage()).rejects.toThrow('Request failed with status 502')
  })

  it('refuses to call the API without a session', async () => {
    vi.mocked(fetchAuthSession).mockResolvedValue(session())
    await expect(fetchVideoPage()).rejects.toThrow('Sign in to continue')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
