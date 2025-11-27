import {
  type CompleteUploadRequest,
  initUpload,
  signUploadPart,
  completeUpload,
} from './api'
import type { UploadState } from '../types'
import { formatError } from '../utils/format'

const CHUNK_SIZE = 10 * 1024 * 1024

type MultipartUploadParams = {
  file: File
  title: string
  onProgress: (state: UploadState) => void
}

export const multipartUpload = async ({
  file,
  title,
  onProgress,
}: MultipartUploadParams) => {
  const { uploadId, videoId } = await initUpload({
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    title,
  })

  const parts: CompleteUploadRequest['parts'] = []
  let uploadedBytes = 0
  let partNumber = 1

  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE)

    onProgress({
      stage: 'uploading',
      message: `Signing part ${partNumber}`,
      percent: Math.round((uploadedBytes / file.size) * 100),
      videoId,
    })

    const { presignedUrl } = await signUploadPart({
      videoId,
      uploadId,
      partNumber,
    })

    const putResponse = await fetch(presignedUrl, {
      method: 'PUT',
      body: chunk,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
    })

    if (!putResponse.ok) {
      throw new Error(`Upload failed on part ${partNumber}`)
    }

    const etag = (putResponse.headers.get('ETag') || '').replace(/"/g, '')
    parts.push({ etag, partNumber })

    uploadedBytes += chunk.size
    const percent = Math.min(
      99,
      Math.round((uploadedBytes / file.size) * 100),
    )

    onProgress({
      stage: 'uploading',
      message: `Uploaded part ${partNumber}`,
      percent,
      videoId,
    })

    partNumber += 1
  }

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
