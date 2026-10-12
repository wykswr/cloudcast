# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Repository architecture, commands, AWS profile requirements, dependency injection, and API conventions are documented in [AGENTS.md](AGENTS.md). Follow that guidance for this pnpm/TypeScript workspace. Deeper background is in `docs/ARCHITECTURE.md` and `docs/DESIGN.md`.

## Running tests

`pnpm test` runs Vitest across the workspace (`backend/test/`, `frontend/test/`, and `scripts/test/`, per the root `vitest.config.ts`). `pnpm test:coverage` also enforces the per-area coverage floors in that config, as CI does. Frontend tests run in Node without a DOM, so they cover `lib/`, `utils/`, and pure helpers rather than components. To run a subset from the repo root:

```bash
pnpm vitest run backend/test/auth.test.ts      # one file
pnpm vitest run -t "manifest naming"           # by test name
```

`backend/test/workflow.test.ts` evaluates the JSONata expression in `tasks/workflow.asl.json` against `manifestKey` in `backend/src/services/uploads.ts`. It fails if the backend and Step Functions HLS key derivation drift apart, so run it after touching either side.

## Gotchas

- Use `pnpm run deploy`, not `pnpm deploy`; the latter is pnpm's built-in command.
- `sam` and `aws` commands need `--profile personal` (see AGENTS.md).
- `pnpm typecheck` also type-checks `scripts/`, which is separate from the backend and frontend projects.
- Run `pnpm format` before finishing; CI fails on `pnpm format:check`. Markdown and YAML are excluded from Prettier.
