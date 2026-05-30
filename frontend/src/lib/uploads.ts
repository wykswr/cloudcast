import {
  type CompleteUploadRequest,
  initUpload,
  signUploadPart,
  completeUpload,
} from './api'
import type { UploadState } from '../types'
import { formatError } from '../utils/format'

const CHUNK_SIZE = 10 * 1024 * 1024
// Number of parts uploaded in parallel. S3 multipart parts are independent
// PUTs, so several in flight at once saturates the connection far better than
// uploading them one at a time.
const UPLOAD_CONCURRENCY = 4

type MultipartUploadParams = {
  file: File
  title: string
  onProgress: (state: UploadState) => void
}

type VideoMetadata = {
  durationSeconds?: number
  sourceWidth?: number
  sourceHeight?: number
}

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
        durationSeconds: Number.isFinite(video.duration)
          ? video.duration
          : undefined,
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

export const multipartUpload = async ({
  file,
  title,
  onProgress,
}: MultipartUploadParams) => {
  const { durationSeconds, sourceWidth, sourceHeight } =
    await probeVideoMetadata(file)

  const { uploadId, videoId } = await initUpload({
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    title,
    sizeBytes: file.size,
    durationSeconds,
    sourceWidth,
    sourceHeight,
  })

  // Slice the file into independent parts up front, then upload them through a
  // small pool of workers running in parallel.
  const chunks: { partNumber: number; chunk: Blob }[] = []
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    chunks.push({
      partNumber: chunks.length + 1,
      chunk: file.slice(offset, offset + CHUNK_SIZE),
    })
  }
  // A zero-byte file still needs one (empty) part so the multipart upload can
  // be completed.
  if (chunks.length === 0) {
    chunks.push({ partNumber: 1, chunk: file.slice(0, 0) })
  }

  const parts: CompleteUploadRequest['parts'] = []
  let uploadedBytes = 0
  let completedParts = 0
  const contentType = file.type || 'application/octet-stream'

  const uploadPart = async ({
    partNumber,
    chunk,
  }: {
    partNumber: number
    chunk: Blob
  }) => {
    const { presignedUrl } = await signUploadPart({
      videoId,
      uploadId,
      partNumber,
    })

    const putResponse = await fetch(presignedUrl, {
      method: 'PUT',
      body: chunk,
      headers: { 'Content-Type': contentType },
    })

    if (!putResponse.ok) {
      throw new Error(`Upload failed on part ${partNumber}`)
    }

    const etag = (putResponse.headers.get('ETag') || '').replace(/"/g, '')
    parts.push({ etag, partNumber })

    uploadedBytes += chunk.size
    completedParts += 1

    onProgress({
      stage: 'uploading',
      message: `Uploaded ${completedParts}/${chunks.length} parts`,
      percent: Math.min(99, Math.round((uploadedBytes / file.size) * 100)),
      videoId,
    })
  }

  // Worker pool: each worker pulls the next part off a shared cursor until the
  // queue is drained, capping in-flight uploads at UPLOAD_CONCURRENCY.
  let cursor = 0
  const worker = async () => {
    while (cursor < chunks.length) {
      const next = chunks[cursor]
      cursor += 1
      await uploadPart(next)
    }
  }

  const workerCount = Math.min(UPLOAD_CONCURRENCY, chunks.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  // S3 requires parts ordered by part number on completion; the pool may finish
  // them out of order.
  parts.sort((a, b) => a.partNumber - b.partNumber)

  await completeUpload({ videoId, uploadId, parts })

  onProgress({
    stage: 'success',
    message: 'Upload complete. Processing your video...',
    percent: 100,
    videoId,
  })

  return { videoId }
}

export const getUploadError = (error: unknown): UploadState => ({
  stage: 'error',
  message: formatError(error),
  percent: 0,
})
