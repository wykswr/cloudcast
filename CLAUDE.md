# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Repository architecture, commands, AWS profile requirements, dependency injection, and API conventions are documented in [AGENTS.md](AGENTS.md). Follow that guidance for this pnpm/TypeScript workspace. Deeper background is in `docs/ARCHITECTURE.md` and `docs/DESIGN.md`.

## Running tests

`pnpm test` runs Vitest across the workspace (`backend/test/` and `scripts/test/`; there is no `vitest.config`). To run a subset from the repo root:

```bash
pnpm vitest run backend/test/auth.test.ts      # one file
pnpm vitest run -t "manifest naming"           # by test name
```

`backend/test/workflow.test.ts` evaluates the JSONata expression in `tasks/workflow.asl.json` against `manifestKey` in `backend/src/services/uploads.ts`. It fails if the backend and Step Functions HLS key derivation drift apart, so run it after touching either side.

## Gotchas

- Use `pnpm run deploy`, not `pnpm deploy`; the latter is pnpm's built-in command.
- `sam` and `aws` commands need `--profile personal` (see AGENTS.md).
- `pnpm typecheck` also type-checks `scripts/`, which is separate from the backend and frontend projects.
