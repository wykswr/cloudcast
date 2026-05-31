# Repository Guidelines

## Project Structure & Module Organization

CloudCast is a full-stack AWS video hosting proof of concept. `backend/` contains the FastAPI service: app code in `backend/app/`, Lambda entry points in `backend/main.py` and `backend/lambda_handler.py`, and tests in `backend/tests/unit` and `backend/tests/integration`. `frontend/` contains the React 19 + Vite + TypeScript app under `frontend/src/`; colocate Vitest files as `*.test.ts` or `*.test.tsx`. Infrastructure lives in `template.yaml`, `samconfig.toml`, and `tasks/workflow.asl.json`; docs live in `docs/`.

## Build, Test, and Development Commands

- `cd backend && uv sync`: install Python 3.11+ dependencies.
- `cd backend && AWS_PROFILE=personal uv run uvicorn main:app --reload`: run the API on port 8000.
- `cd backend && uv run pytest`: run backend tests.
- `cd frontend && pnpm install`: install frontend dependencies.
- `cd frontend && pnpm dev`: run Vite on port 5173.
- `cd frontend && pnpm build`: type-check and build.
- `cd frontend && pnpm lint && pnpm test`: run ESLint and Vitest.
- `sam build && sam deploy --profile personal`: build and deploy AWS infrastructure.

## Coding Style & Naming Conventions

Backend code uses Python snake_case modules, functions, and Pydantic fields, while API payloads expose camelCase aliases; keep `backend/app/schemas.py`, `frontend/src/types.ts`, and API clients aligned. Assemble backend services through FastAPI `Depends` providers instead of constructing boto3 clients or services in routes. Frontend code uses TypeScript, React function components, PascalCase component filenames, and ESLint flat config in `frontend/eslint.config.js`.

## Testing Guidelines

Use pytest for backend tests and Vitest with Testing Library for frontend tests. Keep unit coverage near changed services/components, and add integration tests when route behavior, auth, storage, or DynamoDB contracts change. Name backend files `test_*.py`; name frontend tests `*.test.ts` or `*.test.tsx`.

## Commit & Pull Request Guidelines

Recent history uses short, imperative subjects such as `Add architecture and design documentation` and `Redesign frontend as ACG-themed app`. Keep commits focused. Pull requests should include a summary, test results, linked issues when applicable, screenshots for UI changes, and notes for AWS/SAM or environment-variable changes.

## Security & Configuration Tips

Do not commit `.env` files, CloudFront private keys, Cognito secrets, or AWS credentials. Use `.env.example` files as templates. The default AWS profile is `personal`; pass `--profile personal` to `aws` and `sam` unless intentionally targeting another account.
