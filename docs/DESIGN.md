# Product Design Document: CloudCast

## 1\. Project Overview

**Goal:** Build a functional Proof of Concept (PoC) for CloudCast, a secure video hosting platform. Users can authenticate, upload video files securely, and stream them back via a high-performance CDN.

**Core Value:** Demonstrates the ability to handle heavy media files in a serverless-style architecture without crashing the backend, while securing content so it cannot be stolen or hotlinked.

**Developer Feasibility:** Designed for one developer. Features are strictly limited to the "Happy Path" to ensure completion.

## 2\. Tech Stack

### Frontend

  * **Framework:** React (Vite)
  * **Language:** TypeScript
  * **Styling:** Tailwind CSS
  * **Auth SDK:** AWS Amplify Auth (easiest wrapper for Cognito)
  * **Video Player:** Video.js or ReactPlayer

### Backend (Hono)

  * **Environment Manager:** pnpm workspace (one root lockfile)
  * **Framework:** Hono (TypeScript) - Async endpoints, local Node.js server and Lambda adapter
  * **Database:** Amazon DynamoDB (Serverless NoSQL database, native AWS integration)
  * **AWS SDK:** AWS SDK v3 (S3, DynamoDB, SSM, presigning)
  * **Auth Validation:** jose with cached Cognito JWKS

### Infrastructure (AWS)

  * **IaC Tool:** AWS SAM (Serverless Application Model) - Manages S3, Lambda, Step Functions, DynamoDB, and event-driven resources
  * **Auth Provider:** Amazon Cognito (User Pools) - Defined in SAM template
  * **Database:** Amazon DynamoDB - NoSQL tables defined in SAM template
  * **Storage:** Amazon S3 (Two buckets: `raw-uploads`, `processed-videos`) - Created via SAM
  * **CDN:** Amazon CloudFront (Connected to `processed-videos`) - Configured in SAM template
  * **Transcoding:** AWS Elemental MediaConvert
  * **Orchestration:** AWS Step Functions - Coordinates the video processing workflow using optimized AWS service integrations (no Lambda required)
  * **Compute:**
      * **API Hosting:** API Gateway + Lambda (Node.js 24)
  * **Event Processing:** S3 Event Notifications trigger Step Functions execution

## 3\. Feature Scope (MVP)

### In Scope (The "Happy Path")

  * **User Authentication:** Sign Up / Login via AWS Cognito (Email/Password)
  * **Secure Upload (\< 20GB):**
      * Support for large files using S3 Multipart Upload
      * Frontend splits file into chunks (e.g., 10MB parts)
      * Backend orchestrates the upload session
  * **Automated Processing:**
      * Uploaded video is automatically converted to HLS (`.m3u8`) format
  * **Secure Streaming:**
      * User clicks play
      * Backend generates a short-lived CloudFront Signed URL
  * **Video List:** Simple dashboard showing the user's own videos

### Out of Scope (Do NOT build these for PoC)

  * Social features (Likes, Comments, Sharing)
  * User Profiles / Avatars
  * Complex Transcoding (4K, HDR, Watermarks)
  * Search functionality
  * **CloudFront Signed Cookies:** *Reason:* Requires a live custom domain and complex local DNS spoofing to test. Signed URLs achieve the same security and work on localhost.

## 4\. Architecture & Data Flow

### A. The Upload Flow (Multipart for Large Files)

Since files can be 20GB, a single PUT request will fail. We must use **Multipart Upload**.

**1. Initiate:**

  * React requests `POST /videos/upload/init` with filename/type
  * Hono calls `CreateMultipartUploadCommand` and returns an `uploadId` + `videoId`

**2. Upload Parts (Loop):**

  * React slices the file into chunks (10 MB)
  * For each chunk, React requests `POST /videos/upload/sign-part` (params: `uploadId`, `partNumber`)
  * Hono returns a Presigned PUT URL for that specific part
  * React uploads the chunk directly to S3

**3. Complete:**

  * React sends `POST /videos/upload/complete` with the list of ETags from S3
  * Hono calls `CompleteMultipartUploadCommand` to assemble the file

### B. The Processing Flow (Step Functions with Optimized Integrations)

**1. Trigger (S3 Event via SAM):**

  * S3 (Raw Bucket) detects new completed object $\rightarrow$ Triggers **Step Functions Execution** (configured via SAM S3 event).
  * Step Functions receives the S3 event payload including bucket name, object key, and can extract `video_id` from the object key.

**2. Step 1 - Start Transcoding (MediaConvert SDK Integration):**

  * Step Functions directly calls **AWS MediaConvert API** using optimized service integration.
  * **Task Type:** `aws-sdk:mediaconvert:createJob`
  * **Crucial:** Passes the `video_id` in the MediaConvert **UserMetadata** field (so it persists through the job).
  * **Settings:** Convert to HLS. Output to `processed-videos` bucket with structured path.
  * **Returns:** MediaConvert Job ID and ARN in the state output.
  * **Permissions:** SAM grants Step Functions execution role permissions for MediaConvert and S3.
  * **No Lambda overhead:** Direct API integration is faster and more cost-effective.

**3. Step 2 - Wait & Poll (MediaConvert SDK Integration with Sync Pattern):**

  * Step Functions uses **.sync** callback pattern with MediaConvert.
  * **Alternative:** Use optimized polling with `aws-sdk:mediaconvert:getJob` in a loop:
    * Step Functions calls **MediaConvert GetJob API** directly with the Job ID.
    * **Returns:** Job status (`SUBMITTED`, `PROGRESSING`, `COMPLETE`, `ERROR`).
    * **Choice State:** If `PROGRESSING`, enter Wait State (30 seconds) then loop back.
    * If `COMPLETE`, proceed to next step.
    * If `ERROR` or `CANCELED`, transition to error handling.
  * **No Lambda required:** Step Functions manages the polling loop natively.

**4. Step 3 - Update Database (DynamoDB SDK Integration):**

  * Step Functions directly calls **DynamoDB UpdateItem API** using optimized service integration.
  * **Task Type:** `aws-sdk:dynamodb:updateItem`
  * **Operation:**
    * Uses `video_id` from the input (extracted from S3 event or MediaConvert UserMetadata).
    * Constructs the composite key: `user_id` (from metadata) and `id` (video_id).
    * Updates the item with `status = 'ready'` and `s3_key_hls = 'path/to/playlist.m3u8'`.
    * Uses **UpdateExpression** to set attributes atomically.
  * **Permissions:** SAM grants Step Functions execution role permissions for DynamoDB.
  * **No Lambda overhead:** Direct DynamoDB integration eliminates cold starts and reduces cost.

**5. Error Handling:**

  * Step Functions includes **Catch** blocks to handle failures at each step.
  * On failure, Step Functions directly updates DynamoDB using `aws-sdk:dynamodb:updateItem` to mark video status as `failed`.
  * **Alternative:** Catch blocks can trigger SNS notifications for monitoring using `aws-sdk:sns:publish`.

### C. The Playback Flow (Secure)

1.  User requests to watch Video X
2.  Hono checks if User owns Video X
3.  Hono uses a CloudFront Private Key to sign the video URL
4.  **Result:** `https://cdn.xyz.net/video.m3u8?signature=abc...&expires=123...`
5.  React loads this URL into Video.js

## 5\. Database Schema (DynamoDB)

### Table: `Users`

  * **Partition Key:** `id` (String) - Matches Cognito Sub ID (e.g., uuid-v4)
  * **Attributes:**
    * `email` (String)
    * `created_at` (Number - Unix timestamp)

### Table: `Videos`

  * **Partition Key:** `user_id` (String) - User's Cognito Sub ID
  * **Sort Key:** `id` (String) - Video UUID
  * **Attributes:**
    * `title` (String)
    * `s3_key_raw` (String) - Path to original file
    * `s3_key_hls` (String) - Path to processed `.m3u8` playlist
    * `status` (String) - Values: `uploading`, `processing`, `ready`, `failed`
    * `upload_id` (String, Optional) - To track active multipart uploads
    * `created_at` (Number - Unix timestamp)
  * **Global Secondary Index (GSI):** `VideoIdIndex`
    * **Partition Key:** `id` (String) - Enables direct lookup by video ID
    * **Projection:** ALL

## 6\. API Endpoints (Hono)

### Auth

  * **Middleware:** Verify `Authorization: Bearer <token>` using Cognito keys

### Uploads (Multipart)

  * `POST /videos/upload/init` $\rightarrow$ Returns `{ uploadId, videoId }`
  * `POST /videos/upload/sign-part` $\rightarrow$ Returns `{ presignedUrl }`
  * `POST /videos/upload/complete` $\rightarrow$ Returns `{ status: "processing" }`

### Streaming

  * `GET /videos` $\rightarrow$ List user videos
  * `GET /videos/{video_id}/stream` $\rightarrow$ Returns `{ streamUrl: "https://..." }` (CloudFront Signed)

*(Note: The Webhook endpoint has been removed as Lambda now updates the DB directly)*

## 7\. Development Milestones (Step-by-Step)

### Phase 1: The "Infrastructure Setup with SAM" (Days 1-2)

  * **SAM Init:** Use existing SAM project in `/tasks` directory or create new CloudCast-specific SAM app.
  * **SAM Template:** Define S3 buckets (raw-uploads, processed-videos) with appropriate policies and CORS.
  * **DynamoDB Tables:** Add Users and Videos tables to SAM template with GSI for video lookup.
  * **Cognito:** Add Cognito User Pool and User Pool Client to SAM template.
  * **Deploy SAM:** Run `pnpm deploy:stack --guided` to create S3, DynamoDB, Cognito, and Lambda infrastructure.
  * **Backend Environment:** `pnpm install --frozen-lockfile` from the repository root; API contracts are shared Zod schemas.
  * **Lambda Setup:** Bundle the TypeScript API with esbuild; SAM references the output with `SkipBuild: true`.

### Phase 2: The "Multipart Upload API" (Days 3-5)

  * **S3 Buckets:** Already created by SAM with CORS enabled.
  * **Hono API:** Run locally with `pnpm dev:backend`; deploy the bundled handler to Lambda.
  * **API Endpoints:** Implement Init, Sign-Part, Complete logic in Hono.
  * **Frontend:** Set up React (local dev with Vite), integrate Amplify Auth, implement chunking loop for S3 multipart uploads.

### Phase 3: The "Processing Pipeline with Step Functions" (Days 6-8)

  * **Step Functions State Machine:** Define in SAM template using AWS SDK optimized integrations:
    * **CreateJob Task:** `aws-sdk:mediaconvert:createJob` - Start transcoding
    * **Wait State:** Fixed 30-second delay
    * **GetJob Task:** `aws-sdk:mediaconvert:getJob` - Check job status
    * **Choice State:** Route based on job status (PROGRESSING → loop, COMPLETE → next, ERROR → fail)
    * **UpdateItem Task:** `aws-sdk:dynamodb:updateItem` - Update video status to `ready`
  * **S3 Event Trigger:** Configure S3 raw-uploads bucket to trigger Step Functions execution directly.
  * **IAM Permissions:** SAM template defines Step Functions execution role with policies for:
    * MediaConvert: `CreateJob`, `GetJob`, `DescribeEndpoints`
    * S3: `GetObject`, `PutObject` (for input/output buckets)
    * DynamoDB: `UpdateItem` (for Videos table)
  * **Parameters:** Pass DynamoDB table names and S3 bucket names via Step Functions definition (no environment variables needed).
  * **Error Handling:** Add Catch blocks in Step Functions to update DynamoDB status to `failed` on errors.
  * **No Lambda Code:** Entire workflow uses native AWS SDK integrations - no custom code to deploy or maintain.
  * **Deploy & Test:** `pnpm deploy:stack`, monitor Step Functions execution in AWS Console and CloudWatch Logs.

### Phase 4: The "Secure Streaming" (Days 9-10)

  * **CloudFront:** Add CloudFront distribution to SAM template, connected to processed-videos bucket.
  * **Origin Access Identity:** Configure in SAM to restrict S3 access to CloudFront only.
  * **CloudFront Key:** Generate RSA key pair, store the private key in SSM SecureString.
  * **API Enhancement:** Update Hono to generate CloudFront signed URLs.
  * **Frontend:** Build React app with Vite, integrate Video.js with signed URLs from Hono API.
