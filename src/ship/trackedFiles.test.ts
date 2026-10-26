/**
 * Synthetic data only in the repo (docs/PLAN.md 1, principle 6): `npm run verify` fails first when
 * git tracks, or would pick up, a workbook, CSV or workspace file outside src/data/sample/. The rule
 * is pure (scripts/trackedFiles.mjs); .gitignore keeps the same files out of `git add`.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DATA_FILE, SAMPLE_DIR, strayDataFiles } from '../../scripts/trackedFiles.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('strayDataFiles', () => {
  it('flags workbooks, CSVs and workspace files outside the sample folder, in any case', () => {
    const stray = [
      'budget.xlsx',
      'REPORT.XLSX',
      'data/q3.xlsm',
      'old.xls',
      'exports/headcount.csv',
      'exports/headcount.CSV',
      'raw/workers.tsv',
      'plan.hcplan.json',
      'Shared/FY27.HCPLAN.JSON',
      'src/data/positions.csv',
      'src/data/sampler/x.csv',
      'docs\\people.xlsx',
    ]
    expect(strayDataFiles(stray)).toEqual(stray)
  })

  it('allows the synthetic sample folder and every other file', () => {
    const fine = [
      `${SAMPLE_DIR}raw/positions.csv`,
      `${SAMPLE_DIR}fixtures/manager-a.hcplan.json`,
      'src\\data\\sample\\raw\\comp.xlsx',
      'package.json',
      'package-lock.json',
      'src/data/sample/README.md',
      'docs/PLAN.md',
      'headcount-planner.html',
      'notes.json',
      'plan.hcplan.json.md',
      'csv-parser.ts',
    ]
    expect(strayDataFiles(fine)).toEqual([])
    expect(SAMPLE_DIR).toBe('src/data/sample/')
    expect(DATA_FILE.flags).toContain('i')
  })
})

describe('the gate', () => {
  it('is the first verify step, over tracked files and untracked files that are not ignored', () => {
    const verify = read('scripts/verify.mjs')
    expect(verify).toContain("from './trackedFiles.mjs'")
    expect(verify).toMatch(/const steps = \[\s*\['No data files in git', noDataFiles\]/)
    expect(verify).toContain("gitFiles(['--others', '--exclude-standard'])")
    expect(verify).toMatch(/spawnSync\('git', \['ls-files', '-z'/)
    // Every step runs even after a failure, then the table, then exit 1 on any failure.
    expect(verify).toContain('process.exit(results.every((r) => r.ok) ? 0 : 1)')
  })

  it('has a .gitignore that leaves every such file out, except in the sample folder', () => {
    const lines = read('.gitignore').split(/\r?\n/)
    for (const ext of ['xlsx', 'xlsm', 'xls', 'csv', 'tsv']) {
      expect(lines, ext).toContain(`*.${ext}`)
      expect(lines, ext).toContain(`!src/data/sample/**/*.${ext}`)
    }
    expect(lines).toContain('*.hcplan.json')
    expect(lines).toContain('!src/data/sample/**/*.hcplan.json')
    for (const l of ['node_modules', 'dist', 'dist-single', 'dist-artifact', '.env', '.env.*'])
      expect(lines, l).toContain(l)
  })

  const git = (...args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  const inRepo = git('rev-parse', '--is-inside-work-tree').stdout?.trim() === 'true'

  it.skipIf(!inRepo)('is what git itself ignores in this checkout', () => {
    const ignored = (p: string) => git('check-ignore', '-q', '--no-index', p).status === 0
    for (const p of [
      'budget.xlsx',
      'exports/heads.csv',
      'raw/w.tsv',
      'a.hcplan.json',
      'headcount-planner.html',
    ])
      expect(ignored(p), p).toBe(true)
    for (const p of ['src/data/sample/raw/positions.csv', 'src/data/sample/x.hcplan.json', 'src/main.tsx'])
      expect(ignored(p), p).toBe(false)
  })
})
