import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAuthSession } from 'aws-amplify/auth'
import {
  completeUpload,
  fetchVideos,
  initUpload,
  removeVideo,
  requestStream,
  signUploadPart,
  updateVideo,
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
    await requestStream('v1')
    await removeVideo('v1')
    await initUpload({ filename: 'a.mp4', contentType: 'video/mp4' })
    await signUploadPart({ videoId: 'v1', uploadId: 'u', partNumber: 1 })
    await completeUpload({ videoId: 'v1', uploadId: 'u', parts: [] })
    expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toEqual([
      'GET http://localhost:8000/videos/v1/stream',
      'DELETE http://localhost:8000/videos/v1',
      'POST http://localhost:8000/videos/upload/init',
      'POST http://localhost:8000/videos/upload/sign-part',
      'POST http://localhost:8000/videos/upload/complete',
    ])
  })

  it('unwraps list responses', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ items: [{ id: 'v1' }] })))
    expect(await fetchVideos()).toEqual([{ id: 'v1' }])
  })

  it('surfaces the API detail message, or the status when there is none', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Video not found' }), { status: 404 }),
    )
    await expect(fetchVideos()).rejects.toThrow('Video not found')
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    await expect(fetchVideos()).rejects.toThrow('Request failed with status 502')
  })

  it('refuses to call the API without a session', async () => {
    vi.mocked(fetchAuthSession).mockResolvedValue(session())
    await expect(fetchVideos()).rejects.toThrow('Sign in to continue')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
