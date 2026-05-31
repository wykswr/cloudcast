import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeUpload, initUpload, signUploadPart } from './api'
import { multipartUpload } from './uploads'

vi.mock('./api', () => ({
  initUpload: vi.fn(),
  signUploadPart: vi.fn(),
  completeUpload: vi.fn(),
}))

const mockInit = vi.mocked(initUpload)
const mockSign = vi.mocked(signUploadPart)
const mockComplete = vi.mocked(completeUpload)

const CHUNK_SIZE = 10 * 1024 * 1024

/**
 * A lightweight File stand-in. `slice` returns a stub carrying only `.size`
 * (fetch is mocked, so the body bytes are never read), which lets us simulate
 * arbitrarily large multi-part uploads without allocating real memory. A
 * non-video `type` makes probeVideoMetadata resolve immediately (no real DOM).
 */
const makeFile = (size: number): File =>
  ({
    name: 'clip.bin',
    type: '',
    size,
    slice: (start: number, end: number) =>
      ({ size: Math.max(0, (end ?? size) - (start ?? 0)) }) as Blob,
  }) as unknown as File

let inFlight = 0
let maxInFlight = 0
const fetchMock = vi.fn(async (url: string) => {
  inFlight += 1
  maxInFlight = Math.max(maxInFlight, inFlight)
  await new Promise((r) => setTimeout(r, 0)) // let sibling workers overlap
  inFlight -= 1
  const partNumber = url.split('/').pop()
  return {
    ok: true,
    headers: { get: () => `"etag-${partNumber}"` },
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  inFlight = 0
  maxInFlight = 0
  vi.stubGlobal('fetch', fetchMock)
  mockInit.mockResolvedValue({ uploadId: 'up', videoId: 'vid' })
  mockSign.mockImplementation(async ({ partNumber }) => ({
    presignedUrl: `https://put/${partNumber}`,
  }))
  mockComplete.mockResolvedValue(undefined as never)
})

describe('multipartUpload', () => {
  it('uploads a small single-part file end to end', async () => {
    const onProgress = vi.fn()
    const result = await multipartUpload({
      file: makeFile(1000),
      title: 'Clip',
      onProgress,
    })

    expect(result).toEqual({ videoId: 'vid' })
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'clip.bin',
        contentType: 'application/octet-stream',
        title: 'Clip',
        sizeBytes: 1000,
      }),
    )
    expect(mockSign).toHaveBeenCalledTimes(1)
    expect(mockSign).toHaveBeenCalledWith({
      videoId: 'vid',
      uploadId: 'up',
      partNumber: 1,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockComplete).toHaveBeenCalledWith({
      videoId: 'vid',
      uploadId: 'up',
      parts: [{ etag: 'etag-1', partNumber: 1 }],
    })

    const last = onProgress.mock.calls.at(-1)![0]
    expect(last).toMatchObject({ stage: 'success', percent: 100 })
  })

  it('still creates one part for a zero-byte file', async () => {
    await multipartUpload({ file: makeFile(0), title: 'Empty', onProgress: vi.fn() })
    expect(mockSign).toHaveBeenCalledTimes(1)
    expect(mockComplete.mock.calls[0][0].parts).toEqual([
      { etag: 'etag-1', partNumber: 1 },
    ])
  })

  it('chunks a multi-part file and completes with parts sorted ascending', async () => {
    await multipartUpload({
      file: makeFile(2 * CHUNK_SIZE + 10),
      title: 'Big',
      onProgress: vi.fn(),
    })

    expect(mockSign).toHaveBeenCalledTimes(3)
    const parts = mockComplete.mock.calls[0][0].parts
    expect(parts.map((p) => p.partNumber)).toEqual([1, 2, 3])
    expect(parts.map((p) => p.etag)).toEqual(['etag-1', 'etag-2', 'etag-3'])
  })

  it('caps concurrent uploads at 4', async () => {
    await multipartUpload({
      file: makeFile(5 * CHUNK_SIZE + 1), // 6 parts
      title: 'Big',
      onProgress: vi.fn(),
    })
    expect(mockSign).toHaveBeenCalledTimes(6)
    expect(maxInFlight).toBeGreaterThan(1) // genuinely parallel
    expect(maxInFlight).toBeLessThanOrEqual(4) // but capped
  })

  it('rejects when a part PUT fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      headers: { get: () => '' },
    })
    await expect(
      multipartUpload({ file: makeFile(1000), title: 'Clip', onProgress: vi.fn() }),
    ).rejects.toThrow('Upload failed on part 1')
  })
})
