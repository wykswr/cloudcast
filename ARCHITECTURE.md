# CloudCast Architecture

> A secure video hosting platform with authenticated uploads and protected HLS streaming.

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Infrastructure Components](#infrastructure-components)
- [Data Flow](#data-flow)
- [Directory Structure](#directory-structure)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Security Model](#security-model)

---

## Overview

CloudCast is a serverless-style video hosting platform that enables:

- **Authenticated multipart uploads** for large video files (up to 20GB)
- **Automated video transcoding** to HLS format via AWS MediaConvert
- **Secure playback** using CloudFront signed URLs

### Tech Stack

| Layer          | Technology                                      |
|----------------|------------------------------------------------|
| Frontend       | React 19, TypeScript, Vite, Tailwind CSS, hls.js |
| Backend API    | FastAPI (Python), boto3                         |
| Authentication | AWS Cognito (User Pools) + AWS Amplify SDK      |
| Storage        | Amazon S3 (raw + processed buckets)             |
| Database       | Amazon DynamoDB                                 |
| CDN            | Amazon CloudFront (with signed URLs)            |
| Transcoding    | AWS Elemental MediaConvert                      |
| Orchestration  | AWS Step Functions                              |
| IaC            | AWS SAM (Serverless Application Model)          |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   FRONTEND                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  React + TypeScript + Vite                                               │    │
│  │  ├── AWS Amplify Auth (Cognito SDK)                                     │    │
│  │  ├── Multipart Upload Client (chunked to S3)                            │    │
│  │  └── HLS.js Video Player                                                │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTP/HTTPS
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                  BACKEND API                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  FastAPI Server                                                          │    │
│  │  ├── JWT Verification (Cognito JWKS)                                    │    │
│  │  ├── Upload Service (S3 multipart orchestration)                        │    │
│  │  ├── Video Service (DynamoDB CRUD)                                      │    │
│  │  └── CloudFront Signer (RSA signed URLs)                                │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
            ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
            │   Cognito    │    │   DynamoDB   │    │      S3      │
            │  User Pool   │    │   Tables     │    │   Buckets    │
            └──────────────┘    └──────────────┘    └──────────────┘
                                                           │
                                                           │ EventBridge
                                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             PROCESSING PIPELINE                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  AWS Step Functions State Machine                                        │    │
│  │  ├── ExtractContext (Parse S3 event)                                    │    │
│  │  ├── CreateMediaConvertJob (Transcode to HLS)                           │    │
│  │  ├── MarkReady (Update DynamoDB on success)                             │    │
│  │  └── MarkFailed (Update DynamoDB on error)                              │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                                ┌──────────────┐
                                │  CloudFront  │
                                │     CDN      │
                                └──────────────┘
```

---

## Infrastructure Components

### AWS Resources (Defined in SAM Template)

| Resource                  | Type                            | Purpose                                      |
|---------------------------|--------------------------------|----------------------------------------------|
| `UserPool`                | Cognito User Pool              | User authentication and identity             |
| `UserPoolClient`          | Cognito User Pool Client       | Frontend auth integration                    |
| `RawUploadsBucket`        | S3 Bucket                      | Stores original uploaded video files         |
| `ProcessedVideosBucket`   | S3 Bucket                      | Stores transcoded HLS video segments         |
| `UsersTable`              | DynamoDB Table                 | User metadata storage                        |
| `VideosTable`             | DynamoDB Table                 | Video metadata and processing status         |
| `MediaConvertRole`        | IAM Role                       | Permissions for MediaConvert jobs            |
| `ProcessingStateMachine`  | Step Functions State Machine   | Orchestrates video processing workflow       |
| `CloudFrontOAC`           | CloudFront Origin Access Control| Secures S3 access to CloudFront only        |
| `CloudFrontDistribution`  | CloudFront Distribution        | CDN for secure video delivery                |

### S3 Bucket Structure

```
cloudcast-raw-{env}/
└── {user_id}/
    └── {video_id}/
        └── raw/
            └── {original_filename}

cloudcast-processed-{env}/
└── {user_id}/
    └── {video_id}/
        └── hls/
            ├── playlist.m3u8
            └── playlist_720p_*.ts
```

---

## Data Flow

### 1. Upload Flow (Multipart)

```
┌──────────┐     POST /videos/upload/init      ┌──────────┐
│          │ ─────────────────────────────────▶│          │
│          │     { uploadId, videoId }         │          │
│          │ ◀─────────────────────────────────│          │
│          │                                   │          │
│          │     POST /videos/upload/sign-part │          │
│ Frontend │ ─────────────────────────────────▶│ Backend  │───▶ DynamoDB
│          │     { presignedUrl }              │  (API)   │     (Videos)
│          │ ◀─────────────────────────────────│          │
│          │                                   │          │
│          │        PUT (chunk data)           │          │
│          │ ───────────────────────────────────────────────▶ S3 (Raw)
│          │        { ETag }                   │          │
│          │ ◀───────────────────────────────────────────────
│          │                                   │          │
│          │     POST /videos/upload/complete  │          │
│          │ ─────────────────────────────────▶│          │
│          │     { status: "processing" }      │          │
│          │ ◀─────────────────────────────────│          │
└──────────┘                                   └──────────┘
```

**Sequence:**

1. **Initiate** – Frontend requests upload session → Backend creates S3 multipart upload + DynamoDB record
2. **Sign Parts** – For each 10MB chunk, frontend requests presigned URL → uploads directly to S3
3. **Complete** – Frontend sends part ETags → Backend completes S3 multipart upload, marks status as `processing`

### 2. Processing Flow (Step Functions)

```
S3 Raw Bucket                    EventBridge                   Step Functions
     │                                │                              │
     │  Object Created Event          │                              │
     └───────────────────────────────▶│                              │
                                      │  Trigger State Machine       │
                                      └─────────────────────────────▶│
                                                                     │
                                                                     ▼
                                                           ┌─────────────────┐
                                                           │ ExtractContext  │
                                                           │ (Parse S3 key)  │
                                                           └────────┬────────┘
                                                                    │
                                                                    ▼
                                                    ┌───────────────────────────────┐
                                                    │   CreateMediaConvertJob       │
                                                    │   (aws-sdk:mediaconvert)      │
                                                    │   - Input: S3 raw key         │
                                                    │   - Output: HLS to processed  │
                                                    │   - UserMetadata: video_id    │
                                                    └───────────────┬───────────────┘
                                                                    │
                                           ┌────────────────────────┴────────────────────────┐
                                           │                                                 │
                                    Success│                                                 │Error
                                           ▼                                                 ▼
                                 ┌─────────────────┐                               ┌─────────────────┐
                                 │   MarkReady     │                               │   MarkFailed    │
                                 │   (DynamoDB)    │                               │   (DynamoDB)    │
                                 │   status=ready  │                               │   status=failed │
                                 └─────────────────┘                               └─────────────────┘
```

**MediaConvert Configuration:**

- **Input:** Original video from raw bucket
- **Output:** HLS playlist (`.m3u8`) + segments (`.ts`) to processed bucket
- **Settings:** H.264 video codec, AAC audio, 720p @ QVBR quality level 7

### 3. Playback Flow (Secure Streaming)

```
┌──────────┐    GET /videos/{id}/stream    ┌──────────┐
│          │ ─────────────────────────────▶│          │
│          │                               │          │
│          │                               │ Backend  │───▶ DynamoDB (verify ownership)
│          │                               │          │
│          │    { streamUrl: signed URL }  │          │───▶ CloudFront Signer
│          │ ◀─────────────────────────────│          │     (RSA private key)
│ Frontend │                               └──────────┘
│          │
│  (HLS.js)│     GET https://cdn.../hls/playlist.m3u8?Signature=...
│          │ ──────────────────────────────────────────────────────▶ CloudFront
│          │                                                              │
│          │     HLS segments (.ts)                                       │
│          │ ◀──────────────────────────────────────────────────────────▶│
└──────────┘                                                        S3 (Processed)
```

**Security:**

- CloudFront validates signed URL (expiration + signature)
- Origin Access Control restricts S3 access to CloudFront only
- Signed URLs expire after configurable TTL (default: 60 minutes)

---

## Directory Structure

```
cloudcast/
├── DESIGN.md              # Product design document
├── ARCHITECTURE.md        # This file
│
├── backend/               # FastAPI application
│   ├── main.py           # App entry point, route definitions
│   ├── pyproject.toml    # Python dependencies (uv/pip)
│   └── app/
│       ├── auth.py       # Cognito JWT verification
│       ├── aws.py        # boto3 client factories
│       ├── config.py     # Pydantic settings (env vars)
│       ├── schemas.py    # Request/response Pydantic models
│       └── services/
│           ├── uploads.py    # Multipart upload orchestration
│           ├── videos.py     # DynamoDB repository + service
│           └── cloudfront.py # RSA URL signing
│
├── frontend/              # React SPA
│   ├── package.json      # npm dependencies
│   ├── vite.config.ts    # Vite build configuration
│   └── src/
│       ├── main.tsx      # App bootstrap + Amplify init
│       ├── amplify.ts    # AWS Amplify configuration
│       ├── App.tsx       # Main component (auth, upload, player)
│       └── index.css     # Tailwind CSS entry
│
└── tasks/                 # AWS SAM infrastructure
    ├── template.yaml     # CloudFormation/SAM template
    ├── workflow.asl.json # Step Functions definition (ASL + JSONata)
    └── samconfig.toml    # SAM deployment configuration
```

---

## API Reference

### Base URL

```
http://localhost:8000  (development)
```

### Authentication

All `/videos/*` endpoints require:

```
Authorization: Bearer <Cognito ID Token>
```

### Endpoints

| Method | Path                        | Description                          |
|--------|----------------------------|--------------------------------------|
| GET    | `/health`                  | Health check                         |
| POST   | `/videos/upload/init`      | Start multipart upload session       |
| POST   | `/videos/upload/sign-part` | Get presigned URL for chunk upload   |
| POST   | `/videos/upload/complete`  | Finalize multipart upload            |
| GET    | `/videos`                  | List user's videos                   |
| GET    | `/videos/{video_id}/stream`| Get signed streaming URL             |

### Request/Response Schemas

**POST /videos/upload/init**
```json
// Request
{ "filename": "demo.mp4", "contentType": "video/mp4", "title": "My Video" }

// Response
{ "uploadId": "abc123", "videoId": "uuid-v4" }
```

**POST /videos/upload/sign-part**
```json
// Request
{ "videoId": "uuid", "uploadId": "abc123", "partNumber": 1 }

// Response
{ "presignedUrl": "https://s3...?X-Amz-Signature=..." }
```

**POST /videos/upload/complete**
```json
// Request
{ "videoId": "uuid", "uploadId": "abc123", "parts": [{ "etag": "...", "partNumber": 1 }] }

// Response
{ "status": "processing" }
```

**GET /videos**
```json
// Response
{
  "items": [
    {
      "id": "uuid",
      "title": "My Video",
      "status": "ready",
      "createdAt": 1700000000,
      "s3KeyHls": "user_id/video_id/hls/playlist.m3u8"
    }
  ]
}
```

**GET /videos/{video_id}/stream**
```json
// Response
{ "streamUrl": "https://cdn.../hls/playlist.m3u8?Signature=..." }
```

---

## Database Schema

### DynamoDB Tables

#### Users Table (`CloudCast-Users-{env}`)

| Attribute    | Type   | Key Type      |
|-------------|--------|---------------|
| `id`        | String | Partition Key |
| `email`     | String |               |
| `created_at`| Number |               |

#### Videos Table (`CloudCast-Videos-{env}`)

| Attribute     | Type   | Key Type      |
|--------------|--------|---------------|
| `user_id`    | String | Partition Key |
| `id`         | String | Sort Key      |
| `title`      | String |               |
| `s3_key_raw` | String |               |
| `s3_key_hls` | String |               |
| `status`     | String |               |
| `upload_id`  | String | (temporary)   |
| `created_at` | Number |               |

**Global Secondary Index:** `VideoIdIndex`
- Partition Key: `id` (enables lookup by video ID without knowing user)

**Status Values:**
- `uploading` – Multipart upload in progress
- `processing` – MediaConvert job running
- `ready` – HLS available for streaming
- `failed` – Processing error occurred

---

## Security Model

### Authentication Layer

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Amplify   │─────▶│   Cognito   │─────▶│    JWT      │
│     SDK     │      │  User Pool  │      │   Token     │
└─────────────┘      └─────────────┘      └─────────────┘
                                                │
                                                ▼
                                        ┌─────────────┐
                                        │   FastAPI   │
                                        │   (JWKS)    │
                                        └─────────────┘
```

- Frontend uses AWS Amplify to authenticate with Cognito
- Backend validates JWT tokens using Cognito JWKS endpoint
- User identity (`sub` claim) used for resource ownership

### Content Protection

| Asset               | Protection Method                          |
|--------------------|-------------------------------------------|
| Raw uploads (S3)   | Presigned URLs (part-level, time-limited) |
| Processed videos   | CloudFront signed URLs + OAC              |
| S3 buckets         | Block public access enabled               |

### IAM Permissions

- **MediaConvert Role:** Read from raw bucket, write to processed bucket
- **Step Functions Role:** MediaConvert API, DynamoDB UpdateItem, EventBridge
- **CloudFront OAC:** GetObject on processed bucket only

---

## Environment Configuration

### Backend Environment Variables

| Variable                      | Description                              |
|------------------------------|------------------------------------------|
| `AWS_REGION`                 | AWS region (default: us-east-1)          |
| `RAW_UPLOADS_BUCKET`         | S3 bucket for raw uploads                |
| `PROCESSED_VIDEOS_BUCKET`    | S3 bucket for HLS output                 |
| `VIDEOS_TABLE`               | DynamoDB table name                      |
| `USERS_TABLE`                | DynamoDB table name                      |
| `COGNITO_USER_POOL_ID`       | Cognito User Pool ID                     |
| `COGNITO_CLIENT_ID`          | Cognito App Client ID                    |
| `COGNITO_REGION`             | Cognito region                           |
| `CLOUDFRONT_DOMAIN`          | CloudFront distribution domain           |
| `CLOUDFRONT_KEY_ID`          | CloudFront key pair ID                   |
| `CLOUDFRONT_PRIVATE_KEY`     | RSA private key (inline or path)         |

### Frontend Environment Variables

| Variable                    | Description                |
|----------------------------|----------------------------|
| `VITE_API_BASE_URL`        | Backend API URL            |
| `VITE_COGNITO_REGION`      | Cognito region             |
| `VITE_COGNITO_USER_POOL_ID`| Cognito User Pool ID       |
| `VITE_COGNITO_CLIENT_ID`   | Cognito App Client ID      |

---

## Deployment

### Prerequisites

- AWS CLI configured with appropriate credentials
- AWS SAM CLI installed
- Node.js 18+ and npm
- Python 3.11+ and uv (or pip)

### Deploy Infrastructure

```bash
cd tasks
sam build
sam deploy --guided  # First time
sam deploy           # Subsequent deploys
```

### Run Backend (Development)

```bash
cd backend
uv sync              # Install dependencies
AWS_PROFILE=<profile> fastapi dev main.py
```

### Run Frontend (Development)

```bash
cd frontend
npm install
npm run dev
```

---

## Monitoring

- **Step Functions:** Execution history in AWS Console
- **MediaConvert:** Job status and metrics in MediaConvert Console
- **CloudWatch Logs:** Backend logs (if deployed to EC2/Lambda)
- **DynamoDB:** Video status field tracks processing state
