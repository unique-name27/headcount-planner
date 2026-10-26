#!/usr/bin/env node
// Headcount Planner quality gate: no data files in git, type-check, lint, the three test projects
// (unit, slow, perf), the app build and the one-file build, which must then open from file:// with
// no network request and stay under its size budget (scripts/check-single.mjs). Every step runs
// even after a failure, then a PASS/FAIL table; the exit code is 1 when any step failed.
//   npm run verify
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_NAME } from './brand.mjs'
import { strayDataFiles } from './trackedFiles.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Never `npx vite`: Node 24 can crash in the React Compiler step without the larger semi-space.
const VITE = 'node --max-semi-space-size=64 node_modules/vite/bin/vite.js'

/** The paths git lists (NUL-separated); throws when the folder is not a git repository. */
function gitFiles(args) {
  const r = spawnSync('git', ['ls-files', '-z', ...args], { cwd: root, encoding: 'utf8' })
  if (r.error || r.status !== 0)
    throw new Error(
      `git ls-files failed, so the data-file rule cannot be checked. Is this a git repository? ${r.stderr ?? ''}`.trim(),
    )
  return r.stdout.split('\0').filter(Boolean)
}

/** Step 1: no workbook, CSV or workspace file tracked, staged, or untracked and not ignored. */
function noDataFiles() {
  const tracked = strayDataFiles(gitFiles([]))
  const unignored = strayDataFiles(gitFiles(['--others', '--exclude-standard']))
  for (const p of tracked) console.error(`  Tracked data file: ${p}`)
  for (const p of unignored) console.error(`  Data file that .gitignore does not cover: ${p}`)
  if (!tracked.length && !unignored.length) console.log('  No data files outside src/data/sample/.')
  return tracked.length === 0 && unignored.length === 0
}

const steps = [
  ['No data files in git', noDataFiles],
  ['Type-check', 'npx tsc --noEmit -p .'],
  ['Lint', 'npx biome check src scripts'],
  ['Tests (unit, slow, perf)', 'npx vitest run'],
  ['App build', `${VITE} build`],
  ['One-file build', `${VITE} build --mode single && node scripts/check-single.mjs`],
]

const results = steps.map(([name, step]) => {
  const t = Date.now()
  process.stdout.write(`\n▶ ${name}\n`)
  let ok
  if (typeof step === 'function') {
    try {
      ok = step()
    } catch (err) {
      console.error(`  ${err instanceof Error ? err.message : String(err)}`)
      ok = false
    }
  } else ok = spawnSync(step, { cwd: root, shell: true, stdio: 'inherit' }).status === 0
  return { name, ok, secs: ((Date.now() - t) / 1000).toFixed(1) }
})

console.log(`\n${APP_NAME} verification`)
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name} (${r.secs}s)`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
