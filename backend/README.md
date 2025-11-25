# CloudCast Backend (FastAPI)

FastAPI service that powers CloudCast multipart uploads, video metadata storage in DynamoDB, and signed playback URLs through CloudFront.

## Features
- Cognito JWT verification for all routes (ID or Access tokens).
- Multipart upload orchestration: init, presigned URLs per part, and completion.
- Video metadata persistence in DynamoDB with a `VideoIdIndex` GSI.
- CloudFront signed URLs for secure HLS playback.
- Simple `/health` endpoint for load balancers.

## Configuration
The app uses environment variables (via `pydantic-settings`). Typical `.env`:

```env
AWS_REGION=us-east-1

RAW_UPLOADS_BUCKET=raw-uploads-bucket-name
PROCESSED_VIDEOS_BUCKET=processed-videos-bucket-name
VIDEOS_TABLE=Videos
USERS_TABLE=Users
VIDEO_ID_INDEX=VideoIdIndex

COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_abc123
COGNITO_CLIENT_ID=your_client_id

CLOUDFRONT_DOMAIN=dxxxx.cloudfront.net
CLOUDFRONT_KEY_ID=APKAXXXXX
# Either provide an inline PEM or a path to the key file
CLOUDFRONT_PRIVATE_KEY_PATH=/secure/path/cloudfront_private_key.pem
# CLOUDFRONT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."

MULTIPART_URL_EXPIRATION_SECONDS=3600
STREAM_URL_TTL_MINUTES=60
```

## Running Locally
```bash
cd backend
uv pip install -e .
uvicorn main:app --reload
```

Use an Authorization header (`Bearer <token>`) from Cognito/Amplify for all `/videos/*` routes.

## API Surface
- `POST /videos/upload/init` → `{ uploadId, videoId }`
- `POST /videos/upload/sign-part` → `{ presignedUrl }`
- `POST /videos/upload/complete` → `{ status: "processing" }`
- `GET /videos` → `{ items: [...] }`
- `GET /videos/{video_id}/stream` → `{ streamUrl }`
- `GET /health` → `{ status: "ok" }`

The raw upload key pattern is `<user_id>/<video_id>/raw/<filename>`; the HLS output is expected at `<user_id>/<video_id>/hls/playlist.m3u8` (updated to the final path by the processing pipeline).
