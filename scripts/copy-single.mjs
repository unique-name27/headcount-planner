// Copies the one-file build to the project root as headcount-planner.html (next to
// "Launch Headcount Planner.bat"). The file is git-ignored; `npm run deploy` publishes it. A build
// that would not open on its own from file://, or that is over its size budget
// (scripts/oneFile.mjs), is not copied.
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ONE_FILE } from './brand.mjs'
import { oneFileProblems } from './oneFile.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'dist-single', 'index.html')
if (!existsSync(src)) {
  console.error('dist-single/index.html not found. Run npm run build:single.')
  process.exit(1)
}
const problems = oneFileProblems(readFileSync(src, 'utf8'))
if (problems.length) {
  console.error(`Not copied to ${ONE_FILE}: dist-single/index.html would not open on its own.`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
copyFileSync(src, path.join(root, ONE_FILE))
console.log(`Wrote ${ONE_FILE}`)
