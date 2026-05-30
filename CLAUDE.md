# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CloudCast is an AWS-backed video hosting PoC. Users authenticate with Cognito, upload large videos via S3 multipart upload, the raw file triggers a Step Functions → MediaConvert transcode to HLS, and playback is served from CloudFront using signed URLs. Deep dives live in `ARCHITECTURE.md` and `DESIGN.md`.

## Commands

Backend (`backend/`, FastAPI + uv, Python 3.11+):
```bash
uv sync
AWS_PROFILE=personal uv run uvicorn main:app --reload   # local dev server on :8000
```
There is no test suite or linter configured for the backend yet.

Frontend (`frontend/`, React 19 + Vite + TS, pnpm):
```bash
pnpm install
pnpm dev        # vite dev server on :5173
pnpm build      # tsc -b && vite build
pnpm lint       # eslint
```

Deploy (SAM, default stack `cloudcast`, region `us-west-2`):
```bash
sam build && sam deploy --profile personal      # backend + all infra from template.yaml
./deploy_frontend.sh                            # builds frontend, syncs to S3, invalidates CloudFront
```
**Always pass `--profile personal` to `sam` and `aws` commands** (the account this stack lives in). `deploy_frontend.sh` already sets `AWS_PROFILE=personal` internally. See README.md for the one-time CloudFront signing-key setup in SSM (deploy fails without it) — those `aws ssm put-parameter` commands also need `--profile personal`.

## Architecture

**Backend is one FastAPI app deployed two ways.** It runs locally via `uvicorn main:app`, and in Lambda via `lambda_handler.handler` (Mangum adapter in `backend/lambda_handler.py` wrapping the same `app`). API Gateway has a Cognito authorizer, but the app *also* verifies the JWT itself.

**Dependency injection via a lifespan-built container.** `create_app()` in [main.py](backend/main.py) builds all AWS clients and services once in the `lifespan` startup and stashes them on `app.state.container` (`AppContainer`, a dataclass). Routes pull collaborators through `Depends` shims in [dependencies.py](backend/app/api/dependencies.py) / [auth.py](backend/app/auth.py) — never instantiate services or boto3 clients inside a route. Add a new service by wiring it in `lifespan`, adding the field to `AppContainer` ([container.py](backend/app/container.py)), and exposing a `Depends` accessor.

**Auth has two tiers.** `UserDep` requires a valid Cognito token; `AdminUserDep` additionally requires the `admin` group claim. All write/upload/stream endpoints are admin-only; only `GET /videos` is plain-user. Token verification ([auth.py](backend/app/auth.py)) fetches Cognito JWKS (cached), checks RS256 signature + issuer, and matches `aud`/`client_id` manually with `verify_aud=False`.

**DynamoDB key model (Videos table).** Partition key `user_id`, sort key `id` (the video UUID). A GSI `VideoIdIndex` lets `get_video_by_id` look up a video without the owner. Ownership is enforced in code (`assert_owner`), which returns 404 (not 403) on mismatch. Status lifecycle: `uploading` → `processing` → `ready` | `failed`.

**The upload → playback flow spans backend + Step Functions, and the two sides must agree on S3 key conventions:**
- Raw key: `{user_id}/{video_id}/raw/{filename}` in the raw bucket.
- HLS key: `{user_id}/{video_id}/hls/{stem}.m3u8` in the processed bucket, where `stem` is the original filename minus extension.
- The backend derives this HLS key on `complete_upload` ([uploads.py](backend/app/services/uploads.py)) and the Step Functions `MarkReady` state derives it again independently ([tasks/workflow.asl.json](tasks/workflow.asl.json)). **If you change the naming on one side, change it on the other**, or the DB `s3_key_hls` won't match the actual transcoded output.
- Multipart flow: `upload/init` (creates S3 multipart + DB record) → `upload/sign-part` per 10 MB chunk → `upload/complete`. Client logic is in [frontend/src/lib/uploads.ts](frontend/src/lib/uploads.ts); 10 MB chunk size is set there as `CHUNK_SIZE`.

**Processing is event-driven, not called by the backend.** `complete_multipart_upload` lands the object in the raw bucket → the bucket emits an EventBridge `Object Created` event → Step Functions (`tasks/workflow.asl.json`, JSONata query language) runs `mediaconvert:createJob.sync` then writes `status=ready` (or `failed` via Catch) directly to DynamoDB. The backend never polls; the frontend polls `GET /videos` for status.

**Signed playback.** `GET /videos/{id}/stream` requires `status=ready`, then `CloudFrontURLSigner` ([cloudfront.py](backend/app/services/cloudfront.py)) loads the RSA private key from SSM (`WithDecryption=True`, also un-escapes literal `\n`) and signs a **wildcard policy over the whole HLS prefix** (`.../hls/*`) so the master manifest, variant playlists, and segments all share one token. Signing uses SHA1 + PKCS1v15 (CloudFront's required scheme).

**API contract uses camelCase over the wire.** Pydantic schemas ([schemas.py](backend/app/schemas.py)) define snake_case fields with camelCase aliases (`videoId`, `uploadId`, `partNumber`, etc.). The TS types in [frontend/src/types.ts](frontend/src/types.ts) and `lib/api.ts` mirror these aliases — keep them in sync when changing a schema.

## Config

Backend config is `pydantic-settings` ([config.py](backend/app/config.py)), read from env / `backend/.env` (see `.env.example`). `DYNAMODB_ENDPOINT_URL` / `S3_ENDPOINT_URL` exist for pointing at local emulators. Frontend reads `VITE_*` vars (Cognito IDs + API base URL); `amplify.ts` configures Cognito auth.

When deployed, `template.yaml` injects the bucket names, table names, Cognito IDs, and CloudFront domain/key into the Lambda environment, so the same `Settings` fields are populated from CloudFormation rather than `.env`.
