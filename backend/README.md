# CloudCast Backend (Hono)

TypeScript API for multipart uploads, DynamoDB video metadata, Cognito authentication, and CloudFront signed playback. Node.js 24 and pnpm are required.

## Development and checks

From the repository root:

```bash
pnpm install --frozen-lockfile
cp backend/.env.example backend/.env
AWS_PROFILE=personal pnpm dev:backend
pnpm typecheck
pnpm format:check
pnpm lint
pnpm test
pnpm build:sam
```

The local server listens on `PORT` (default 8000). `pnpm dev` runs both backend and frontend. Configuration is validated in `src/config.ts`; dotenv loads the local `.env`. Lambda uses the same configuration fields from its environment. Emulator overrides are `DYNAMODB_ENDPOINT_URL` and `S3_ENDPOINT_URL`. Default region remains `us-east-1` for local configuration; SAM injects its deployment region (`us-west-2`).

`createContainer()` builds clients and services; `createApp(container)` injects them into route factories. Request middleware (Cognito user/admin checks, JSON body enforcement, CORS) lives in `src/middleware/`, and `src/docs.ts` serves the OpenAPI documentation. Logs are one JSON object per line via `src/logger.ts`. `src/lambda.ts` caches the official Hono adapter and container for warm invocations. The CloudFront RSA key is decrypted from SSM on first playback signing and cached; failed loads can be retried.

## API

| Endpoint | Response | Authorization |
| --- | --- | --- |
| `GET /health` | `{ status: "ok" }` | Public locally |
| `GET /videos` | `{ items: [...] }` | Cognito user |
| `POST /videos/upload/init` | `{ uploadId, videoId }` | Admin |
| `POST /videos/upload/sign-part` | `{ presignedUrl }` | Admin |
| `POST /videos/upload/complete` | `{ status: "processing" }` | Admin |
| `PATCH /videos/{videoId}` | Updated video | Admin + owner |
| `DELETE /videos/{videoId}` | `{ status: "deleted" }` | Admin + owner |
| `GET /videos/{videoId}/stream` | `{ streamUrl }` | Admin + owner; ready video |

Swagger UI: `/docs`. ReDoc: `/redoc`. Generated OpenAPI: `/openapi.json`. API Gateway retains its default Cognito authorizer, including health/documentation paths. Documentation links use relative URLs so `/dev/docs` loads `/dev/openapi.json`.

Schemas and inferred types are shared through `@cloudcast/contracts`. Responses use camelCase with explicit nullable metadata fields. Request bodies must be camelCase JSON. Validation failures return 422 with a `detail` string; service errors retain their existing status codes and detail messages. DynamoDB attributes remain snake_case and are validated on read; invalid items are skipped (and logged) in listings and return 500 on direct reads.

Raw keys are `{user_id}/{video_id}/raw/{filename}`. The HLS key is `{user_id}/{video_id}/hls/{stem}.m3u8`, removing only the final filename extension. Backend and JSONata workflow naming are tested together. Existing records need no migration.

## Build and deployment

`pnpm build:backend` typechecks and bundles all Lambda/workspace dependencies into `dist/lambda.mjs` with a source map. SAM uses runtime `nodejs24.x`, handler `lambda.handler`, and the prebuilt directory with `SkipBuild: true`. Use `pnpm deploy:backend` to rebuild and deploy the shared SAM stack, including the processing workflow. `pnpm build:sam` only builds; a bare SAM build does not compile TypeScript.

## Deployment smoke test

After an authorized deployment, verify:

1. Sign in as an ordinary user and list videos; confirm upload/write/playback routes reject that user with 403.
2. Sign in as an admin and upload a small video named `holiday.final.mp4`; include source dimensions and verify upload progress.
3. Confirm the video moves from uploading to processing to ready (or failed on a transcode failure), and the HLS manifest keeps `holiday.final` in its name.
4. Play the video and seek; confirm variant playlists and segments retain the CloudFront signed parameters.
5. Rename the video, toggle favorite on/off, refresh, and confirm persistence.
6. Delete it; confirm it disappears, media objects are removed, and reserved storage is reconciled.
7. Request another owner's video and confirm a 404. Exercise the documentation using authenticated requests through the deployed API stage.

Local Vitest tests mock AWS services and use generated signing keys. Live Cognito/S3/MediaConvert/CloudFront behavior remains unverified until the deployed smoke test runs.
