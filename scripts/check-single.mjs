// Checks the one-file build (scripts/oneFile.mjs): it opens from file:// with no network request and
// stays under its size budget. `npm run verify` runs it right after the one-file build.
//   node scripts/check-single.mjs [file]      (default dist-single/index.html)
// Exit code 1, with each reason, when the page fails; 0 with its size otherwise.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { oneFileReport } from './oneFile.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.resolve(root, process.argv[2] ?? path.join('dist-single', 'index.html'))
const shown = path.relative(root, file).replace(/\\/g, '/')
if (!existsSync(file)) {
  console.error(`${shown} not found. Run npm run build:single.`)
  process.exit(1)
}
const report = oneFileReport(readFileSync(file, 'utf8'))
const n = (x) => x.toLocaleString('en-US')
const count = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`
if (report.problems.length) {
  console.error(`${shown} would not open on its own:`)
  for (const p of report.problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(
  `${shown}: ${n(report.bytes)} bytes of a ${n(report.budget)} byte budget, ${count(report.scripts, 'inline script')} and ${count(report.styles, 'inline style')}. It opens from file:// with no network request.`,
)
