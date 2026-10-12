import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeUpload, initUpload, signUploadPart } from '../src/lib/api'
import { getUploadError, multipartUpload, probeVideoMetadata } from '../src/lib/uploads'
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

  it('fails without completing when a part upload is rejected', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }))
    const file = new File([new Uint8Array(MB)], 'clip.bin')
    await expect(multipartUpload({ file, title: 'Clip', onProgress: () => {} })).rejects.toThrow(
      'Upload failed on part 1',
    )
    expect(completeUpload).not.toHaveBeenCalled()
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

  it('turns errors into an error upload state', () => {
    expect(getUploadError(new Error('Quota exceeded'))).toEqual({
      stage: 'error',
      message: 'Quota exceeded',
      percent: 0,
    })
  })
})
