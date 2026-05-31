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
} from './api'

vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: vi.fn() }))

const mockSession = vi.mocked(fetchAuthSession)

const makeResponse = (
  body: unknown,
  { ok = true, status = 200 }: { ok?: boolean; status?: number } = {},
) => ({
  ok,
  status,
  text: async () => (body === null ? '' : JSON.stringify(body)),
})

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  // Default: a valid id token is available.
  mockSession.mockResolvedValue({
    tokens: { idToken: { toString: () => 'id-token' } },
  } as never)
  fetchMock.mockResolvedValue(makeResponse({ items: [] }))
})

describe('apiRequest auth + transport', () => {
  it('attaches a bearer id token and JSON content-type', async () => {
    await fetchVideos()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/videos')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer id-token')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('falls back to the access token when no id token is present', async () => {
    mockSession.mockResolvedValue({
      tokens: { accessToken: { toString: () => 'access-token' } },
    } as never)
    await fetchVideos()
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer access-token',
    )
  })

  it('throws and skips the request when there is no token', async () => {
    mockSession.mockResolvedValue({ tokens: {} } as never)
    await expect(fetchVideos()).rejects.toThrow('Sign in to continue')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('unwraps the items array from the list response', async () => {
    fetchMock.mockResolvedValue(makeResponse({ items: [{ id: 'v1' }] }))
    await expect(fetchVideos()).resolves.toEqual([{ id: 'v1' }])
  })

  it('surfaces the error detail from a non-OK response', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ detail: 'Video not found' }, { ok: false, status: 404 }),
    )
    await expect(requestStream('v1')).rejects.toThrow('Video not found')
  })

  it('falls back to a status message when no detail is given', async () => {
    fetchMock.mockResolvedValue(makeResponse(null, { ok: false, status: 500 }))
    await expect(requestStream('v1')).rejects.toThrow(
      'Request failed with status 500',
    )
  })

  it('returns null for an empty body', async () => {
    fetchMock.mockResolvedValue(makeResponse(null))
    await expect(
      completeUpload({ videoId: 'v', uploadId: 'u', parts: [] }),
    ).resolves.toBeNull()
  })
})

describe('endpoint methods and paths', () => {
  it('POSTs upload init with the payload body', async () => {
    fetchMock.mockResolvedValue(makeResponse({ uploadId: 'u', videoId: 'v' }))
    await initUpload({ filename: 'a.mp4', contentType: 'video/mp4', title: 'A' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/videos/upload/init')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toMatchObject({ filename: 'a.mp4' })
  })

  it('POSTs sign-part', async () => {
    fetchMock.mockResolvedValue(makeResponse({ presignedUrl: 'https://x' }))
    await signUploadPart({ videoId: 'v', uploadId: 'u', partNumber: 2 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/videos/upload/sign-part')
    expect(JSON.parse(init.body).partNumber).toBe(2)
  })

  it('PATCHes a video update', async () => {
    fetchMock.mockResolvedValue(makeResponse({ id: 'v1', favorite: true }))
    await updateVideo('v1', { favorite: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/videos/v1')
    expect(init.method).toBe('PATCH')
  })

  it('DELETEs a video', async () => {
    fetchMock.mockResolvedValue(makeResponse({ status: 'deleted' }))
    await removeVideo('v1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/videos/v1')
    expect(init.method).toBe('DELETE')
  })
})
