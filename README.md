# CloudCast

CloudCast is a full-stack, AWS-backed video hosting PoC: users authenticate with Cognito, upload large videos via S3 multipart upload, videos are transcoded to HLS with MediaConvert via Step Functions, and playback is served through CloudFront using signed URLs.

- Architecture deep dive: `ARCHITECTURE.md`
- Product/design notes: `DESIGN.md`

## Repo layout

- `template.yaml`: AWS SAM template (API Gateway + Lambda/FastAPI, Cognito, S3, DynamoDB, Step Functions, CloudFront)
- `backend/`: FastAPI app (runs locally via Uvicorn; deployed to Lambda via Mangum)
- `frontend/`: React + Vite + TypeScript app (Amplify Auth, multipart upload client, HLS playback via hls.js)
- `tasks/workflow.asl.json`: Step Functions state machine (MediaConvert job + DynamoDB status update)
- `deploy_frontend.sh`: builds and uploads the frontend to the S3/CloudFront resources created by SAM

## Prerequisites

- Python 3.11+
- Node.js 18+ (repo currently uses Node 23 locally)
- AWS CLI configured (`aws configure`) and AWS SAM CLI installed
- An AWS account/region with permissions to create: IAM, Lambda, API Gateway, Cognito, DynamoDB, S3, CloudFront, Step Functions, MediaConvert, SSM Parameters

## Local development

### Backend (FastAPI)

```bash
cd backend
cp .env.example .env
uv pip install -e .
uvicorn main:app --reload
```

The backend reads configuration from environment variables (see `backend/app/config.py`) and supports optional `DYNAMODB_ENDPOINT_URL` / `S3_ENDPOINT_URL` for local emulators.

### Frontend (Vite)

```bash
cd frontend
cp .env.example .env.local
pnpm install
pnpm dev
```

For local dev, `VITE_API_BASE_URL` typically points at `http://localhost:8000`.

## Deploy to AWS (SAM)

### 1) Create CloudFront signing keys in SSM

The SAM template expects:

- a **CloudFront public key PEM** in SSM at `CloudFrontPublicKeySsmName` (default: `/cloudcast/dev/cloudfront-public-key`)
- a **CloudFront private key PEM** in SSM at `CloudFrontPrivateKeySsmName` (default: `/cloudcast/dev/cloudfront-private-key`)

Generate a key pair:

```bash
openssl genrsa -out cloudfront_private_key.pem 2048
openssl rsa -pubout -in cloudfront_private_key.pem -out cloudfront_public_key.pem
```

Store them in SSM (recommended: public key as `String`, private key as `SecureString`):

```bash
aws ssm put-parameter --name /cloudcast/dev/cloudfront-public-key --type String --value "$(cat cloudfront_public_key.pem)" --overwrite
aws ssm put-parameter --name /cloudcast/dev/cloudfront-private-key --type SecureString --value "$(cat cloudfront_private_key.pem)" --overwrite
```

Notes:
- The backend loads the private key with `WithDecryption=True` and also supports values that contain literal `\n` sequences.
- The SAM template currently uses `{{resolve:ssm:...}}` for the public key, so the public key parameter must be a plain `String` (not `SecureString`) unless you update the template to use `ssm-secure`.
- If you change the parameter names, pass them as SAM parameters (`CloudFrontPublicKeySsmName` / `CloudFrontPrivateKeySsmName`) during deploy.

### 2) Deploy the backend + infrastructure

`samconfig.toml` is set up for a default stack named `cloudcast` (region `us-west-2`, profile `personal`). You can deploy with:

```bash
sam build
sam deploy
```

Or run a guided deploy and set parameters explicitly:

```bash
sam deploy --guided \
  --parameter-overrides \
    Env=dev \
    CorsAllowOrigin=http://localhost:5173 \
    CloudFrontPublicKeySsmName=/cloudcast/dev/cloudfront-public-key \
    CloudFrontPrivateKeySsmName=/cloudcast/dev/cloudfront-private-key
```

### 3) Deploy the frontend

This script pulls stack outputs (API URL + Cognito IDs + frontend bucket/distribution), builds the frontend, syncs it to S3, and creates a CloudFront invalidation:

```bash
./deploy_frontend.sh
```

Notes:
- The script sets `AWS_PROFILE=personal` and uses `npm install`/`npm run build` internally.
- When it finishes, it prints the CloudFront URL for the hosted frontend.

## What gets created

From `template.yaml`:

- API: API Gateway + Lambda (FastAPI via Mangum) with Cognito authorizer
- Auth: Cognito User Pool + User Pool Client
- Storage: `cloudcast-raw-{env}` and `cloudcast-processed-{env}` S3 buckets
- DB: `CloudCast-Users-{env}` and `CloudCast-Videos-{env}` DynamoDB tables (+ `VideoIdIndex` GSI)
- Processing: Step Functions state machine triggered by raw-bucket `Object Created` events (MediaConvert → DynamoDB update)
- CDN:
  - CloudFront distribution for processed HLS (uses Trusted Key Groups for signed URLs)
  - CloudFront distribution for frontend static hosting (S3 + OAC)

## Troubleshooting

- **CORS errors in the deployed API from localhost:** the API Gateway CORS origin is wired to the deployed frontend CloudFront domain. For local development, run the backend locally (recommended) or update the SAM template CORS config to include `http://localhost:5173`.
- **Step Functions “failed” status:** check the execution details for the `ProcessingStateMachine` in AWS Console (MediaConvert permissions/configuration errors show up there).
- **Signed URL playback fails:** confirm `MediaCloudFrontDomain`, `MediaCloudFrontKeyId`, and that the private key SSM parameter referenced by `CLOUDFRONT_PRIVATE_KEY_SSM_NAME` exists and decrypts.
