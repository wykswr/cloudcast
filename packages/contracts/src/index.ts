import { z } from 'zod'

/** Lifecycle: uploading -> processing -> ready | failed. */
export const VideoStatusSchema = z.enum(['uploading', 'processing', 'ready', 'failed'])

export const UploadInitRequestSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  title: z.string().nullish(),
  sizeBytes: z.number().int().min(0).nullish(),
  durationSeconds: z.number().min(0).nullish(),
  sourceWidth: z.number().int().min(1).nullish(),
  sourceHeight: z.number().int().min(1).nullish(),
})
export const UploadInitResponseSchema = z.object({ uploadId: z.string(), videoId: z.string() })
export const SignPartRequestSchema = z.object({
  videoId: z.string(),
  uploadId: z.string(),
  partNumber: z.number().int().min(1),
})
export const SignPartResponseSchema = z.object({ presignedUrl: z.string() })
export const UploadPartSchema = z.object({ etag: z.string(), partNumber: z.number().int().min(1) })
export const CompleteUploadRequestSchema = z.object({
  videoId: z.string(),
  uploadId: z.string(),
  parts: z.array(UploadPartSchema),
})
export const CompleteUploadResponseSchema = z.object({ status: z.literal('processing') })
export const VideoItemSchema = z.object({
  id: z.string(),
  title: z.string().nullable().default(null),
  status: VideoStatusSchema,
  createdAt: z.number().int(),
  s3KeyHls: z.string().nullable().default(null),
  sizeBytes: z.number().int().nullable().default(null),
  durationSeconds: z.number().nullable().default(null),
  sourceWidth: z.number().int().nullable().default(null),
  sourceHeight: z.number().int().nullable().default(null),
  favorite: z.boolean().default(false),
})
export const VideoListResponseSchema = z.object({ items: z.array(VideoItemSchema) })
export const UpdateVideoRequestSchema = z.object({
  title: z.string().nullish(),
  favorite: z.boolean().nullish(),
})
export const StreamResponseSchema = z.object({ streamUrl: z.string() })
export const DeleteVideoResponseSchema = z.object({ status: z.literal('deleted') })
export const ErrorResponseSchema = z.object({ detail: z.string() })

export type VideoStatus = z.infer<typeof VideoStatusSchema>
export type UploadInitRequest = z.infer<typeof UploadInitRequestSchema>
export type UploadInitResponse = z.infer<typeof UploadInitResponseSchema>
export type SignPartRequest = z.infer<typeof SignPartRequestSchema>
export type UploadPartRequest = SignPartRequest
export type SignPartResponse = z.infer<typeof SignPartResponseSchema>
export type UploadPart = z.infer<typeof UploadPartSchema>
export type CompleteUploadRequest = z.infer<typeof CompleteUploadRequestSchema>
export type CompleteUploadResponse = z.infer<typeof CompleteUploadResponseSchema>
export type VideoItem = z.infer<typeof VideoItemSchema>
export type VideoListResponse = z.infer<typeof VideoListResponseSchema>
export type UpdateVideoRequest = z.infer<typeof UpdateVideoRequestSchema>
export type StreamResponse = z.infer<typeof StreamResponseSchema>
export type DeleteVideoResponse = z.infer<typeof DeleteVideoResponseSchema>
