import { fileURLToPath, URL } from 'node:url'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { DEV_SERVER_DENY } from './scripts/devServer.mjs'
import { ONE_FILE_BUDGET } from './scripts/oneFile.mjs'

// `npm run build:single` emits one self-contained headcount-planner.html (double-click to open, no
// server): every script, style and font inline, so it opens from file:// with no network request,
// within ONE_FILE_BUDGET bytes (scripts/oneFile.mjs; scripts/check-single.mjs checks the built page).
// Run Vite only through the npm scripts: they start Node with --max-semi-space-size=64, which stops
// a random crash of Node 24 while the React Compiler step runs (ARCHITECTURE.md).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    ...(mode === 'single' ? [viteSingleFile({ removeViteModuleLoader: true })] : []),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Never serve a secret or a workspace file: Vite's own list plus *.hcplan.json (scripts/devServer.mjs).
  server: { fs: { deny: DEV_SERVER_DENY } },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    // kB. The one file is one chunk, so its warning is the page's budget.
    chunkSizeWarningLimit: mode === 'single' ? ONE_FILE_BUDGET / 1000 : 4000,
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
  test: {
    environment: 'node',
    // The default 5 s timeout was too short under a full parallel run. A test whose work is known to
    // be long (the Excel round trips in src/data/import/templates.slow.test.ts, the LP) sets its own.
    testTimeout: 30_000,
    // Test workers start with the same young-generation size as the Vite runs (package.json). Without
    // it, fork workers on Node 24 sometimes exit with an access violation in the slow crawls.
    execArgv: ['--max-semi-space-size=64'],
    // HCP_TEST_WORKERS caps the parallel workers (for example on a machine that is unstable under a
    // full load); unset, Vitest picks its own count.
    ...(process.env.HCP_TEST_WORKERS ? { maxWorkers: Number(process.env.HCP_TEST_WORKERS) } : {}),
    // Three projects. `unit` runs in parallel. `slow` (*.slow.test.ts: the LP, attack, unions and
    // crawl tests and the whole-sample Excel round trip) runs one file at a time, alongside `unit`.
    // Time budgets ("runs in under 300 ms") live in *.perf.test.ts and run one file at a time once
    // the others are done, so they never compete with the parallel run for the CPU.
    // `npx vitest run` runs all three; `npx vitest run --project perf` runs only the budgets.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.perf.test.ts', 'src/**/*.slow.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'slow',
          include: ['src/**/*.slow.test.ts'],
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'perf',
          include: ['src/**/*.perf.test.ts'],
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
}))
