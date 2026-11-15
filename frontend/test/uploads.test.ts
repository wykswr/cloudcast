import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeUpload, initUpload, signUploadPart } from '../src/lib/api'
import {
  UploadSession,
  getUploadError,
  isAbortError,
  isVideoFile,
  multipartUpload,
  probeVideoMetadata,
  titleFromFileName,
} from '../src/lib/uploads'
import type { UploadState } from '../src/types'

vi.mock('../src/lib/api', () => ({
  initUpload: vi.fn(),
  signUploadPart: vi.fn(),
  completeUpload: vi.fn(),
}))

const MB = 1024 * 1024
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(initUpload).mockResolvedValue({ uploadId: 'upload', videoId: 'video' })
  vi.mocked(signUploadPart).mockImplementation(async ({ partNumber }) => ({
    presignedUrl: `https://s3.example.com/part-${partNumber}`,
  }))
  vi.mocked(completeUpload).mockResolvedValue({ status: 'processing' })
  fetchMock.mockImplementation(async (url) => {
    const part = String(url).split('-').pop()
    // Finish later parts first to prove completion order does not depend on timing.
    await new Promise((resolve) => setTimeout(resolve, 10 - Number(part)))
    return new Response(null, { headers: { ETag: `"etag-${part}"` } })
  })
})

describe('multipartUpload', () => {
  it('uploads 10 MB parts in parallel and completes with them in order', async () => {
    const file = new File([new Uint8Array(25 * MB)], 'clip.bin')
    const progress: UploadState[] = []

    await expect(
      multipartUpload({ file, title: 'Clip', onProgress: (state) => progress.push(state) }),
    ).resolves.toEqual({ videoId: 'video' })

    expect(initUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'clip.bin',
        contentType: 'application/octet-stream',
        title: 'Clip',
        sizeBytes: 25 * MB,
      }),
    )
    const sizes = fetchMock.mock.calls.map(([, init]) => (init?.body as Blob).size)
    expect(sizes.sort()).toEqual([10 * MB, 10 * MB, 5 * MB].sort())
    expect(completeUpload).toHaveBeenCalledWith({
      videoId: 'video',
      uploadId: 'upload',
      parts: [
        { etag: 'etag-1', partNumber: 1 },
        { etag: 'etag-2', partNumber: 2 },
        { etag: 'etag-3', partNumber: 3 },
      ],
    })
    expect(progress.at(-2)).toMatchObject({ stage: 'uploading', percent: 99 })
    expect(progress.at(-1)).toMatchObject({ stage: 'success', percent: 100, videoId: 'video' })
  })

  it('still sends one empty part for a zero-byte file', async () => {
    await multipartUpload({ file: new File([], 'empty.bin'), title: '', onProgress: () => {} })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(completeUpload).toHaveBeenCalledWith(
      expect.objectContaining({ parts: [{ etag: 'etag-1', partNumber: 1 }] }),
    )
  })

  it('retries a part twice, then fails without completing', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }))
    const file = new File([new Uint8Array(MB)], 'clip.bin')
    await expect(
      multipartUpload({ file, title: 'Clip', onProgress: () => {}, retryDelayScale: 0 }),
    ).rejects.toThrow('Upload failed on part 1')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(completeUpload).not.toHaveBeenCalled()
  })

  it('recovers when a retried part goes through', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(new Response(null, { headers: { ETag: '"etag-1"' } }))
    const file = new File([new Uint8Array(MB)], 'clip.bin')
    await multipartUpload({ file, title: 'Clip', onProgress: () => {}, retryDelayScale: 0 })
    expect(completeUpload).toHaveBeenCalledWith(
      expect.objectContaining({ parts: [{ etag: 'etag-1', partNumber: 1 }] }),
    )
  })

  it('pauses mid-upload and resumes with only the missing parts', async () => {
    const controller = new AbortController()
    const progress: UploadState[] = []
    fetchMock.mockImplementation(async (url, init) => {
      const part = String(url).split('-').pop()
      // Part 1 finishes; pause while the others are still in flight.
      if (part === '1') {
        setTimeout(() => controller.abort(), 0)
        return new Response(null, { headers: { ETag: '"etag-1"' } })
      }
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 50)
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
      return new Response(null, { headers: { ETag: `"etag-${part}"` } })
    })
    const file = new File([new Uint8Array(25 * MB)], 'clip.bin')
    const session = new UploadSession(file, 'Clip', (state) => progress.push(state))

    const paused = await session.run(controller.signal).catch((error) => error)
    expect(isAbortError(paused)).toBe(true)
    expect(session.uploadedBytes).toBe(10 * MB)
    expect(completeUpload).not.toHaveBeenCalled()

    fetchMock.mockClear()
    fetchMock.mockImplementation(async (url) => {
      const part = String(url).split('-').pop()
      return new Response(null, { headers: { ETag: `"etag-${part}"` } })
    })
    await expect(session.run()).resolves.toEqual({ videoId: 'video' })
    expect(initUpload).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.map(([url]) => String(url)).sort()).toEqual([
      'https://s3.example.com/part-2',
      'https://s3.example.com/part-3',
    ])
    expect(vi.mocked(completeUpload).mock.calls[0][0].parts.map((p) => p.partNumber)).toEqual([
      1, 2, 3,
    ])
    expect(progress.at(-1)).toMatchObject({ stage: 'success', sentBytes: 25 * MB })
  })

  it('stops before starting, and during a retry wait, when paused', async () => {
    const file = new File([new Uint8Array(MB)], 'clip.bin')
    const aborted = new AbortController()
    aborted.abort()
    const early = await multipartUpload({
      file,
      title: 'Clip',
      onProgress: () => {},
      signal: aborted.signal,
    }).catch((error) => error)
    expect(isAbortError(early)).toBe(true)
    expect(initUpload).not.toHaveBeenCalled()

    const controller = new AbortController()
    fetchMock.mockImplementation(async () => {
      setTimeout(() => controller.abort(), 0)
      throw new TypeError('network down')
    })
    const waiting = await multipartUpload({
      file,
      title: 'Clip',
      onProgress: () => {},
      signal: controller.signal,
    }).catch((error) => error)
    expect(isAbortError(waiting)).toBe(true)
    expect(isAbortError(new Error('x'))).toBe(false)
  })
})

describe('upload helpers', () => {
  it('skips metadata probing for non-video files', async () => {
    expect(await probeVideoMetadata(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toEqual(
      {},
    )
  })

  it('reads duration and dimensions from a video element, best-effort', async () => {
    const element = {} as {
      src?: string
      duration: number
      videoWidth: number
      videoHeight: number
      onloadedmetadata?: () => void
      onerror?: () => void
    }
    vi.stubGlobal('document', { createElement: () => element })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:clip', revokeObjectURL: vi.fn() })
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' })

    const loaded = probeVideoMetadata(file)
    Object.assign(element, { duration: 12.5, videoWidth: 1920, videoHeight: 1080 })
    element.onloadedmetadata?.()
    expect(await loaded).toEqual({ durationSeconds: 12.5, sourceWidth: 1920, sourceHeight: 1080 })

    const streaming = probeVideoMetadata(file)
    Object.assign(element, { duration: Infinity, videoWidth: 0, videoHeight: 0 })
    element.onloadedmetadata?.()
    expect(await streaming).toEqual({
      durationSeconds: undefined,
      sourceWidth: undefined,
      sourceHeight: undefined,
    })

    const failed = probeVideoMetadata(file)
    element.onerror?.()
    expect(await failed).toEqual({})
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3)
    vi.unstubAllGlobals()
  })

  it('recognises video files and suggests titles', () => {
    expect(isVideoFile({ name: 'clip.bin', type: 'video/mp4' })).toBe(true)
    expect(isVideoFile({ name: 'IMG_4410.MOV', type: '' })).toBe(true)
    expect(isVideoFile({ name: 'IMG_4412.HEIC', type: 'image/heic' })).toBe(false)
    expect(titleFromFileName('Drone_Squamish_4K.mov')).toBe('Drone Squamish 4K')
    expect(titleFromFileName('team-offsite recap.final.mp4')).toBe('team-offsite recap.final')
    expect(titleFromFileName('.mp4')).toBe('.mp4')
  })

  it('turns errors into an error upload state', () => {
    expect(getUploadError(new Error('Quota exceeded'))).toEqual({
      stage: 'error',
      message: 'Quota exceeded',
      percent: 0,
    })
  })
})
