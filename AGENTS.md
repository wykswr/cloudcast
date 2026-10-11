# AGENTS.md

This file provides repository-specific guidance for OpenAI Codex and other coding agents working in this repository.

## Project overview

CloudCast is an AWS-backed video hosting proof of concept. Users authenticate with Cognito, upload large videos through S3 multipart upload, raw files trigger a Step Functions -> MediaConvert transcode to HLS, and playback is served from CloudFront using signed URLs.

For deeper context, see `docs/ARCHITECTURE.md` and `docs/DESIGN.md`.

## Commands

Run workspace commands from the repository root; frontend commands may also run from `frontend/`.

### Backend: `backend/`

Hono + TypeScript, Node.js 24, pnpm workspace. Install dependencies from the repository root.

```bash
pnpm install --frozen-lockfile
AWS_PROFILE=personal pnpm dev:backend   # local dev server on :8000
```

From the root, use `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest), and `pnpm build`. Backend tests use injected collaborators and mocked AWS calls.

### Frontend: `frontend/`

React 19 + Vite + TypeScript + pnpm.

```bash
pnpm install
pnpm dev        # Vite dev server on :5173
pnpm build      # tsc -b && vite build
pnpm lint       # eslint
```

### Deploy

SAM default stack: `cloudcast`.
Default region: `us-west-2`.

```bash
pnpm run deploy          # SAM stack, then frontend
pnpm deploy:backend      # Shared SAM stack (backend + workflow + infrastructure)
pnpm deploy:workflow     # Same SAM stack deployment
pnpm deploy:frontend     # Builds frontend, syncs to S3, invalidates CloudFront
pnpm run deploy --dry-run # Prints commands without AWS calls
```

Always pass `--profile personal` to `sam` and `aws` commands. This stack lives in the `personal` AWS profile. Node deployment commands in `scripts/` pass `--profile personal` and `--region` explicitly to every AWS/SAM command. Use `pnpm run deploy` rather than pnpm's built-in `pnpm deploy` command.

See `README.md` for the one-time CloudFront signing-key setup in SSM. Those `aws ssm put-parameter` commands also need `--profile personal`. Deploys fail without that signing key.

## Working conventions for Codex

- Prefer small, focused diffs. Do not rewrite unrelated code.
- Preserve the backend dependency-injection pattern. Do not instantiate services or AWS SDK clients inside routes.
- Define API schemas/types in `packages/contracts`; import these contracts in both backend and frontend.
- Keep backend S3 key derivation and Step Functions key derivation in sync.
- Do not commit secrets, private keys, `.env` files, or local AWS credentials.
- When adding deployment or AWS commands, include `--profile personal` including commands run by the Node deployment tooling.
- When changing auth, upload, processing, playback, or DynamoDB ownership logic, check the related backend, frontend, infra, and workflow files together.
- If tests are unavailable for an affected backend path, state what manual verification was performed or what remains unverified.

## Architecture notes

### Backend deployment shape

The backend is one Hono app deployed two ways:

- Local development uses `backend/src/server.ts` and `@hono/node-server` on port 8000.
- Lambda uses `backend/src/lambda.ts` and `@hono/aws-lambda`; esbuild produces `backend/dist/lambda.mjs`.
- SAM uses Node.js 24, handler `lambda.handler`, and the prebuilt bundle (`SkipBuild: true`). `pnpm build:sam` rebuilds it before running SAM with profile `personal`.

API Gateway has a Cognito authorizer, but the app also verifies the JWT itself.

### Dependency injection

`createContainer()` in `backend/src/container.ts` builds AWS clients and services once. `createApp(container)` in `backend/src/app.ts` injects collaborators into route factories. The Lambda handler caches its adapter/container across warm invocations.

To add a service, wire it in `createContainer`, add it to `AppContainer`, and use the injected collaborator in routes. Never construct services or AWS clients in route handlers. Tests can provide structural mocks through `AppContainer`.

### Auth model

Auth has two tiers:

- User middleware requires a valid Cognito token.
- Admin middleware additionally requires the `admin` group claim.

All write, upload, and stream endpoints are admin-only. Only `GET /videos` is plain-user.

Token verification in `backend/src/auth.ts` fetches Cognito JWKS, caches it, checks the RS256 signature and issuer, and manually matches `aud` / `client_id` using `jose`.

### DynamoDB video model

The Videos table uses:

- Partition key: `user_id`
- Sort key: `id`, the video UUID
- GSI: `VideoIdIndex`, used by `getVideoById` to look up a video without the owner

Ownership is enforced in code through `assertOwner`, which returns 404 rather than 403 on owner mismatch.

Video status lifecycle:

```text
uploading -> processing -> ready | failed
```

### Upload to playback flow

The backend and Step Functions workflow must agree on S3 key conventions.

Raw video key in the raw bucket:

```text
{user_id}/{video_id}/raw/{filename}
```

HLS manifest key in the processed bucket:

```text
{user_id}/{video_id}/hls/{stem}.m3u8
```

`stem` is the original filename with only its final extension removed, preserving earlier dots.

The backend derives the HLS key in `manifestKey` / `completeUpload` in `backend/src/services/uploads.ts`. The Step Functions `MarkReady` state independently derives it in `tasks/workflow.asl.json`.

If you change naming on one side, change it on the other. Otherwise, the database value for `s3_key_hls` will not match the actual transcoded output.

Multipart upload flow:

1. `upload/init` creates the S3 multipart upload and DB record.
2. `upload/sign-part` signs each 10 MB chunk.
3. `upload/complete` completes the multipart upload.

Client upload logic lives in `frontend/src/lib/uploads.ts`. The 10 MB chunk size is set there as `CHUNK_SIZE`.

### Processing workflow

Processing is event-driven and is not called by the backend.

`complete_multipart_upload` lands the object in the raw bucket. The raw bucket emits an EventBridge `Object Created` event. Step Functions runs `tasks/workflow.asl.json` using JSONata query language, calls `mediaconvert:createJob.sync`, and then writes `status=ready` directly to DynamoDB.

Failures are handled through the workflow `Catch` path, which writes `status=failed`.

The backend does not poll processing state. The frontend polls `GET /videos` for status updates.

### Signed playback

`GET /videos/{id}/stream` requires `status=ready`.

`CloudFrontURLSigner` in `backend/src/services/cloudfront.ts` loads the RSA private key from SSM with `WithDecryption: true`. It also unescapes literal `\n` sequences.

The signer creates a wildcard policy over the full HLS prefix:

```text
.../hls/*
```

The wildcard policy lets the master manifest, variant playlists, and segments share one token.

CloudFront signing uses SHA1 + PKCS1v15, to preserve the existing signing scheme.

### API contract

The API uses camelCase over the wire.

Shared Zod schemas and inferred TypeScript types live in `packages/contracts/src/index.ts`. The frontend imports API types from `@cloudcast/contracts`. Backend request normalization also accepts the legacy snake_case aliases; camelCase wins if both are provided. DynamoDB records retain their snake_case field names.

Swagger UI is at `/docs`, ReDoc at `/redoc`, and the generated OpenAPI schema at `/openapi.json`. Relative documentation links preserve the API Gateway stage prefix.

## Configuration

Backend configuration is validated with Zod in `backend/src/config.ts` and is read from environment variables. The local Node server loads `backend/.env` with dotenv; Lambda uses its injected environment. See `backend/.env.example`.

Local emulator override settings include:

- `DYNAMODB_ENDPOINT_URL`
- `S3_ENDPOINT_URL`

The frontend reads `VITE_*` variables for Cognito IDs and API base URL. `frontend/src/amplify.ts` configures Cognito auth.

When deployed, `template.yaml` injects bucket names, table names, Cognito IDs, and CloudFront domain/key settings into the Lambda environment. The same `Settings` fields are populated from CloudFormation rather than `.env`.
