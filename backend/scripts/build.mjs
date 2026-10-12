import { build } from 'esbuild'
import { rm } from 'node:fs/promises'
await rm(new URL('../dist', import.meta.url), { recursive: true, force: true })
await build({
  entryPoints: ['src/lambda.ts'],
  outfile: 'dist/lambda.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  // Some AWS credential providers still use CommonJS require internally.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
})
