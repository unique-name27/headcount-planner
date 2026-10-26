// Publishes the one-file build to GitHub Pages (the gh-pages branch).
//   npm run deploy   ->   builds headcount-planner.html, then pushes it as index.html to gh-pages
// The file list is in scripts/pagesFiles.mjs. The branch is built in a throwaway repository under
// the system temp folder and force-pushed as a single commit; only the listed files are staged, by
// name (never `git add -A`). It refuses, with a plain message, when the project has no commit yet,
// no `origin` remote, no one-file build, or a one-file build that would not open on its own from
// file:// or is over its size budget (scripts/oneFile.mjs).
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_NAME, APP_SLUG, ONE_FILE } from './brand.mjs'
import { oneFileProblems } from './oneFile.mjs'
import { pagesFiles } from './pagesFiles.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'inherit' })
/** A git answer, or null when git refuses (no commit, no remote). */
const gitAnswer = (args) => {
  try {
    return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return null
  }
}
const refuse = (why) => {
  console.error(`Not published. ${why}`)
  process.exit(1)
}

const files = pagesFiles()
const sha = gitAnswer(['rev-parse', '--short', 'HEAD'])
if (!sha) refuse('This repository has no commit yet. Commit on main first, then deploy again.')
const remote = gitAnswer(['remote', 'get-url', 'origin'])
if (!remote) refuse('This repository has no remote named origin. Create the GitHub repository first.')
for (const f of files)
  if (f.from && !existsSync(path.join(root, f.from)))
    refuse(`${f.from} is missing. Run npm run build:single, then deploy again.`)
for (const f of files) {
  if (!f.from?.endsWith('.html')) continue
  const [problem] = oneFileProblems(readFileSync(path.join(root, f.from), 'utf8'))
  if (problem)
    refuse(`${f.from} would not open on its own. ${problem} Run npm run build:single, then deploy again.`)
}

const dir = mkdtempSync(path.join(tmpdir(), `${APP_SLUG}-pages-`))
try {
  for (const f of files)
    if (f.from) copyFileSync(path.join(root, f.from), path.join(dir, f.to))
    else writeFileSync(path.join(dir, f.to), '')
  git(['init', '-q', '-b', 'gh-pages'], dir)
  // Explicit staging: exactly the listed files, by name.
  git(['add', '--', ...files.map((f) => f.to)], dir)
  git(['commit', '-q', '-m', `Publish ${APP_NAME} (one-file build of main@${sha})`], dir)
  git(['push', '-q', '-f', remote, 'gh-pages'], dir)
  console.log(
    `Published ${files.map((f) => f.to).join(', ')} from ${ONE_FILE}. GitHub Pages updates in about a minute.`,
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}
