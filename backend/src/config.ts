import { z } from 'zod'

const envSchema = z.object({
  AWS_REGION: z.string().default('us-east-1'),
  RAW_UPLOADS_BUCKET: z.string().min(1),
  PROCESSED_VIDEOS_BUCKET: z.string().min(1),
  VIDEOS_TABLE: z.string().min(1),
  USERS_TABLE: z.string().min(1),
  VIDEO_ID_INDEX: z.string().default('VideoIdIndex'),
  S3_ENDPOINT_URL: z.string().optional(),
  DYNAMODB_ENDPOINT_URL: z.string().optional(),
  CLOUDFRONT_DOMAIN: z.string().min(1),
  CLOUDFRONT_KEY_ID: z.string().min(1),
  CLOUDFRONT_PRIVATE_KEY_SSM_NAME: z.string().min(1),
  COGNITO_USER_POOL_ID: z.string().min(1),
  COGNITO_CLIENT_ID: z.string().min(1),
  JWKS_CACHE_SECONDS: z.coerce.number().int().default(3600),
  MULTIPART_URL_EXPIRATION_SECONDS: z.coerce.number().int().default(3600),
  STREAM_URL_TTL_MINUTES: z.coerce.number().int().default(60),
  STORAGE_QUOTA_BYTES: z.coerce
    .number()
    .int()
    .default(20 * 1024 ** 3),
  CORS_ALLOW_ORIGINS: z.string().default('http://localhost:5173'),
  PORT: z.coerce.number().int().default(8000),
})
export type Settings = z.infer<typeof envSchema>
export function getSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  return envSchema.parse(env)
}
