# AGENTS.md

This file provides repository-specific guidance for OpenAI Codex and other coding agents working in this repository.

## Project overview

CloudCast is an AWS-backed video hosting proof of concept. Users authenticate with Cognito, upload large videos through S3 multipart upload, raw files trigger a Step Functions -> MediaConvert transcode to HLS, and playback is served from CloudFront using signed URLs.

For deeper context, see `docs/ARCHITECTURE.md` and `docs/DESIGN.md`.

## Commands

Run commands from the indicated package directory unless noted otherwise.

### Backend: `backend/`

FastAPI + uv, Python 3.11+.

```bash
uv sync
AWS_PROFILE=personal uv run uvicorn main:app --reload   # local dev server on :8000
```

There is currently no backend test suite or linter configured.

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
sam build && sam deploy --profile personal      # backend + all infra from template.yaml
./deploy_frontend.sh                            # builds frontend, syncs to S3, invalidates CloudFront
```

Always pass `--profile personal` to `sam` and `aws` commands. This stack lives in the `personal` AWS profile. `deploy_frontend.sh` already sets `AWS_PROFILE=personal` internally.

See `README.md` for the one-time CloudFront signing-key setup in SSM. Those `aws ssm put-parameter` commands also need `--profile personal`. Deploys fail without that signing key.

## Working conventions for Codex

- Prefer small, focused diffs. Do not rewrite unrelated code.
- Preserve the backend dependency-injection pattern. Do not instantiate services or boto3 clients inside routes.
- Keep backend Pydantic schemas and frontend TypeScript API types in sync.
- Keep backend S3 key derivation and Step Functions key derivation in sync.
- Do not commit secrets, private keys, `.env` files, or local AWS credentials.
- When adding deployment or AWS commands, include `--profile personal` unless the command is run by `deploy_frontend.sh`.
- When changing auth, upload, processing, playback, or DynamoDB ownership logic, check the related backend, frontend, infra, and workflow files together.
- If tests are unavailable for an affected backend path, state what manual verification was performed or what remains unverified.

## Architecture notes

### Backend deployment shape

The backend is one FastAPI app deployed two ways:

- Local development uses `uvicorn main:app`.
- Lambda uses `lambda_handler.handler`, a Mangum adapter in `backend/lambda_handler.py` wrapping the same `app`.

API Gateway has a Cognito authorizer, but the app also verifies the JWT itself.

### Dependency injection

`create_app()` in `backend/main.py` builds AWS clients and services once in the lifespan startup and stores them on `app.state.container` as `AppContainer`, a dataclass.

Routes should get collaborators through `Depends` shims in:

- `backend/app/api/dependencies.py`
- `backend/app/auth.py`

To add a new service:

1. Wire it in the lifespan startup.
2. Add a field to `AppContainer` in `backend/app/container.py`.
3. Expose a `Depends` accessor.
4. Use the accessor from routes.

Do not construct services or boto3 clients directly in route handlers.

### Auth model

Auth has two tiers:

- `UserDep` requires a valid Cognito token.
- `AdminUserDep` additionally requires the `admin` group claim.

All write, upload, and stream endpoints are admin-only. Only `GET /videos` is plain-user.

Token verification in `backend/app/auth.py` fetches Cognito JWKS, caches it, checks the RS256 signature and issuer, and manually matches `aud` / `client_id` with `verify_aud=False`.

### DynamoDB video model

The Videos table uses:

- Partition key: `user_id`
- Sort key: `id`, the video UUID
- GSI: `VideoIdIndex`, used by `get_video_by_id` to look up a video without the owner

Ownership is enforced in code through `assert_owner`, which returns 404 rather than 403 on owner mismatch.

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

`stem` is the original filename without its extension.

The backend derives the HLS key in `complete_upload` in `backend/app/services/uploads.py`. The Step Functions `MarkReady` state independently derives it in `tasks/workflow.asl.json`.

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

`CloudFrontURLSigner` in `backend/app/services/cloudfront.py` loads the RSA private key from SSM with `WithDecryption=True`. It also unescapes literal `\n` sequences.

The signer creates a wildcard policy over the full HLS prefix:

```text
.../hls/*
```

The wildcard policy lets the master manifest, variant playlists, and segments share one token.

CloudFront signing uses SHA1 + PKCS1v15, which is CloudFront's required scheme.

### API contract

The API uses camelCase over the wire.

Pydantic schemas in `backend/app/schemas.py` define snake_case Python fields with camelCase aliases, such as:

- `videoId`
- `uploadId`
- `partNumber`

Frontend TypeScript types in `frontend/src/types.ts` and API helpers in `frontend/src/lib/api.ts` mirror those aliases.

When changing a schema, update the matching frontend types and API calls in the same change.

## Configuration

Backend configuration is handled by `pydantic-settings` in `backend/app/config.py` and is read from environment variables or `backend/.env`. See `backend/.env.example`.

Local emulator override settings include:

- `DYNAMODB_ENDPOINT_URL`
- `S3_ENDPOINT_URL`

The frontend reads `VITE_*` variables for Cognito IDs and API base URL. `frontend/src/amplify.ts` configures Cognito auth.

When deployed, `template.yaml` injects bucket names, table names, Cognito IDs, and CloudFront domain/key settings into the Lambda environment. The same `Settings` fields are populated from CloudFormation rather than `.env`.
