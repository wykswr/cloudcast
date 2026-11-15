import { type CompleteUploadRequest, initUpload, signUploadPart, completeUpload } from './api'
import type { UploadState } from '../types'
import { formatError } from '../utils/format'

const CHUNK_SIZE = 10 * 1024 * 1024
// Number of parts uploaded in parallel. S3 multipart parts are independent
// PUTs, so several in flight at once saturates the connection far better than
// uploading them one at a time.
const UPLOAD_CONCURRENCY = 4

// A part that fails (a dropped connection, a timeout) is tried again after these waits.
const RETRY_DELAYS_MS = [1000, 3000]

type UploadOptions = {
  /** Scales the waits between retries; tests pass 0. */
  retryDelayScale?: number
}

type MultipartUploadParams = UploadOptions & {
  file: File
  title: string
  onProgress: (state: UploadState) => void
  signal?: AbortSignal
}

type VideoMetadata = {
  durationSeconds?: number
  sourceWidth?: number
  sourceHeight?: number
}

type Chunk = { partNumber: number; chunk: Blob }

/**
 * Read playback metadata from a local video file via a throwaway <video>
 * element. Best-effort: resolves to undefined if the browser can't read it.
 */
export const probeVideoMetadata = (file: File): Promise<VideoMetadata> =>
  new Promise((resolve) => {
    if (!file.type.startsWith('video/')) {
      resolve({})
      return
    }
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    const cleanup = () => URL.revokeObjectURL(url)
    video.onloadedmetadata = () => {
      cleanup()
      resolve({
        durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined,
        sourceWidth: video.videoWidth || undefined,
        sourceHeight: video.videoHeight || undefined,
      })
    }
    video.onerror = () => {
      cleanup()
      resolve({})
    }
    video.src = url
  })

/** True for the error a paused (aborted) upload rejects with. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function abortError() {
  return new DOMException('Upload paused', 'AbortError')
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(abortError())
    })
  })
}

/** Slices the file into multipart parts; a zero-byte file still needs one empty part. */
function sliceFile(file: File): Chunk[] {
  const chunks: Chunk[] = []
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    chunks.push({ partNumber: chunks.length + 1, chunk: file.slice(offset, offset + CHUNK_SIZE) })
  }
  if (chunks.length === 0) chunks.push({ partNumber: 1, chunk: file.slice(0, 0) })
  return chunks
}

/**
 * A multipart upload that can be paused and resumed. `run` uploads whatever parts are still
 * missing; aborting its signal stops new parts and cancels the ones in flight, keeping the
 * finished parts, so the next `run` carries on from there.
 */
export class UploadSession {
  videoId?: string
  private uploadId?: string
  private readonly chunks: Chunk[]
  private readonly finished = new Map<number, string>()
  private sentBytes = 0
  private readonly file: File
  private readonly title: string
  private readonly onProgress: (state: UploadState) => void
  private readonly retryDelayScale: number

  constructor(
    file: File,
    title: string,
    onProgress: (state: UploadState) => void,
    options: UploadOptions = {},
  ) {
    this.file = file
    this.title = title
    this.onProgress = onProgress
    this.retryDelayScale = options.retryDelayScale ?? 1
    this.chunks = sliceFile(file)
  }

  /** Bytes in finished parts. */
  get uploadedBytes() {
    return this.sentBytes
  }

  private report() {
    const total = this.file.size || 1
    this.onProgress({
      stage: 'uploading',
      message: 'Uploading',
      percent: Math.min(99, Math.round((this.sentBytes / total) * 100)),
      sentBytes: this.sentBytes,
      videoId: this.videoId,
    })
  }

  private async start(signal?: AbortSignal) {
    if (this.videoId && this.uploadId) return
    const { durationSeconds, sourceWidth, sourceHeight } = await probeVideoMetadata(this.file)
    if (signal?.aborted) throw abortError()
    const { uploadId, videoId } = await initUpload({
      filename: this.file.name,
      contentType: this.file.type || 'application/octet-stream',
      title: this.title,
      sizeBytes: this.file.size,
      durationSeconds,
      sourceWidth,
      sourceHeight,
    })
    this.uploadId = uploadId
    this.videoId = videoId
    this.report()
  }

  /** Uploads one part, retrying a couple of times before giving up. */
  private async uploadPart(part: Chunk, signal?: AbortSignal) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.sendPart(part, signal)
        return
      } catch (error) {
        if (isAbortError(error) || attempt >= RETRY_DELAYS_MS.length) throw error
        await wait(RETRY_DELAYS_MS[attempt] * this.retryDelayScale, signal)
      }
    }
  }

  private async sendPart({ partNumber, chunk }: Chunk, signal?: AbortSignal) {
    const { presignedUrl } = await signUploadPart({
      videoId: this.videoId!,
      uploadId: this.uploadId!,
      partNumber,
    })
    if (signal?.aborted) throw abortError()
    const response = await fetch(presignedUrl, {
      method: 'PUT',
      body: chunk,
      headers: { 'Content-Type': this.file.type || 'application/octet-stream' },
      signal,
    })
    if (!response.ok) throw new Error(`Upload failed on part ${partNumber}`)
    this.finished.set(partNumber, (response.headers.get('ETag') || '').replace(/"/g, ''))
    this.sentBytes += chunk.size
    this.report()
  }

  async run(signal?: AbortSignal): Promise<{ videoId: string }> {
    if (signal?.aborted) throw abortError()
    await this.start(signal)

    const pending = this.chunks.filter(({ partNumber }) => !this.finished.has(partNumber))
    // Worker pool: each worker pulls the next part off a shared cursor until the
    // queue is drained, capping in-flight uploads at UPLOAD_CONCURRENCY.
    let cursor = 0
    const worker = async () => {
      while (cursor < pending.length) {
        if (signal?.aborted) throw abortError()
        const next = pending[cursor]
        cursor += 1
        await this.uploadPart(next, signal)
      }
    }
    const workerCount = Math.min(UPLOAD_CONCURRENCY, pending.length)
    await Promise.all(Array.from({ length: workerCount }, () => worker()))
    if (signal?.aborted) throw abortError()

    // S3 requires parts ordered by part number on completion; the pool may finish
    // them out of order.
    const parts: CompleteUploadRequest['parts'] = [...this.finished.entries()]
      .sort(([a], [b]) => a - b)
      .map(([partNumber, etag]) => ({ etag, partNumber }))
    await completeUpload({ videoId: this.videoId!, uploadId: this.uploadId!, parts })

    this.onProgress({
      stage: 'success',
      message: 'Upload complete',
      percent: 100,
      sentBytes: this.file.size,
      videoId: this.videoId,
    })
    return { videoId: this.videoId! }
  }
}

/** Uploads a whole file in one go. */
export const multipartUpload = ({
  file,
  title,
  onProgress,
  signal,
  ...options
}: MultipartUploadParams) => new UploadSession(file, title, onProgress, options).run(signal)

export const getUploadError = (error: unknown): UploadState => ({
  stage: 'error',
  message: formatError(error),
  percent: 0,
})

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|mkv|webm|avi|wmv|mpg|mpeg|3gp|mts|m2ts)$/i

/** Whether a picked file looks like a video we can accept. */
export function isVideoFile(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type.startsWith('video/') || VIDEO_EXTENSIONS.test(file.name)
}

/** A friendly starting title from a file name: no extension, separators turned into spaces. */
export function titleFromFileName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '')
  return stem.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || name
}
