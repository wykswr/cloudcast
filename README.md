# CloudCast

CloudCast is a full-stack, AWS-backed video hosting PoC: users authenticate with Cognito, upload large videos via S3 multipart upload, videos are transcoded to HLS with MediaConvert via Step Functions, and playback is served through CloudFront using signed URLs.

- Architecture deep dive: `docs/ARCHITECTURE.md`
- Product/design notes: `docs/DESIGN.md`

## Repo layout

- `docs/`: reference documentation (architecture and product/design notes)
- `template.yaml`: AWS SAM template (API Gateway + Lambda/Hono, Cognito, S3, DynamoDB, Step Functions, CloudFront)
- `backend/`: TypeScript Hono app (Node.js locally; official Hono adapter in Lambda)
- `packages/contracts/`: shared Zod schemas and inferred API types
- `frontend/`: React + Vite + TypeScript app (Amplify Auth, multipart upload client, HLS playback via hls.js)
- `tasks/workflow.asl.json`: Step Functions state machine (MediaConvert job + DynamoDB status update)
- `scripts/`: Node deployment commands for the SAM stack and frontend publishing

## Prerequisites

- Node.js 24 and pnpm 11.25.0
- AWS CLI configured (`aws configure --profile personal`) and AWS SAM CLI installed
- An AWS account/region with permissions to create: IAM, Lambda, API Gateway, Cognito, DynamoDB, S3, CloudFront, Step Functions, MediaConvert, SSM Parameters

Enable pnpm through Corepack once after installing or switching Node versions:

```bash
nvm use 24  # If Node is managed with nvm
corepack enable pnpm
pnpm --version
```

Corepack uses the pnpm version pinned in the root `package.json`.

## Local development


### AWS profile
The SAM template and Node deployment commands use the `personal` AWS CLI profile. If your local AWS CLI uses a different profile name, replace `personal` in the commands below with your own profile.

### Backend (Hono)

```bash
pnpm install --frozen-lockfile
cp backend/.env.example backend/.env
AWS_PROFILE=personal pnpm dev:backend
```

The backend reads configuration from environment variables (see `backend/src/config.ts`) and supports optional `DYNAMODB_ENDPOINT_URL` / `S3_ENDPOINT_URL` for local emulators.

### Frontend (Vite)

```bash
cd frontend
cp .env.example .env
pnpm dev
```

For local dev, `VITE_API_BASE_URL` typically points at `http://localhost:8000`.

## Workspace checks

Run from the repository root:

```bash
pnpm format:check   # Prettier; `pnpm format` rewrites files
pnpm typecheck
pnpm lint
pnpm test           # `pnpm test:coverage` also enforces coverage floors
pnpm build
```

CI (`.github/workflows/ci.yml`) runs the same checks on every pull request and on pushes to `master`.

`pnpm dev` starts both apps. The backend serves Swagger UI at `http://localhost:8000/docs`, ReDoc at `/redoc`, and its generated schema at `/openapi.json`. Deployed API Gateway retains its Cognito authorizer for these routes.

The Lambda bundle is built with esbuild, including AWS SDK and workspace dependencies. SAM points to `backend/dist/` with `SkipBuild: true`. Node deployment commands always rebuild it; `pnpm build:sam` prepares the artifacts without deploying.

## Deploy to AWS (SAM)

### 1. Create CloudFront signing keys in SSM

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
aws ssm put-parameter --profile personal --name /cloudcast/dev/cloudfront-public-key --type String --value "$(cat cloudfront_public_key.pem)" --overwrite
aws ssm put-parameter --profile personal --name /cloudcast/dev/cloudfront-private-key --type SecureString --value "$(cat cloudfront_private_key.pem)" --overwrite
```

Notes:
- The backend loads the private key with `WithDecryption=True` and also supports values that contain literal `\n` sequences.
- The SAM template currently uses `{{resolve:ssm:...}}` for the public key, so the public key parameter must be a plain `String` (not `SecureString`) unless you update the template to use `ssm-secure`.
- If you change the parameter names, pass them as SAM parameters (`CloudFrontPublicKeySsmName` / `CloudFrontPrivateKeySsmName`) during deploy.

### 2. Deploy the backend + infrastructure

`samconfig.toml` is set up for a default stack named `cloudcast` (region `us-west-2`, profile `personal`). You can deploy with:

```bash
pnpm deploy:stack
```

Or run a guided deploy and set parameters explicitly:

```bash
pnpm deploy:stack --guided \
  --parameter-overrides \
    Env=dev \
    CorsAllowOrigin=http://localhost:5173 \
    CloudFrontPublicKeySsmName=/cloudcast/dev/cloudfront-public-key \
    CloudFrontPrivateKeySsmName=/cloudcast/dev/cloudfront-private-key
```

### 3. Deploy the frontend

The Node command reads stack outputs once, passes the API URL and Cognito IDs to Vite, builds the frontend, syncs it to S3, and waits for a CloudFront invalidation:

```bash
pnpm deploy:frontend
```

Notes:
- Every AWS/SAM command specifies profile `personal` and region `us-west-2` by default. Frontend configuration is passed to the build without changing local `.env.production`.
- When it finishes, it prints the CloudFront URL for the hosted frontend.

### Deploy everything or preview commands

```bash
pnpm run deploy                        # Stack first, then frontend
pnpm deploy:backend                    # Shared SAM stack (backend + workflow + infrastructure)
pnpm deploy:workflow                   # Same shared SAM deployment
pnpm run deploy --dry-run               # Print commands; no subprocesses or AWS calls
pnpm deploy:frontend --stack-name cloudcast --region us-west-2
```

Use `pnpm run deploy` for the full deployment because `pnpm deploy` is pnpm's built-in package deployment command. All entry points live in `scripts/deploy.ts` and resolve paths from the repository root. The backend and workflow share one CloudFormation stack, so their commands both rebuild and deploy the complete SAM template. Unchanged stacks are successful no-ops. Install dependencies with `pnpm install --frozen-lockfile` before deploying.

## What gets created

From `template.yaml`:

- API: API Gateway + Lambda (Hono on Node.js 24) with Cognito authorizer
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

## License

[MIT](LICENSE)
