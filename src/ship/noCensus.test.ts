/**
 * The template app is copied, never named (docs/PLAN.md 1, principle 1, and 16.1): its name appears
 * nowhere in src, scripts or the build and config files, in any letter case, in file contents or
 * file names. The needle is built from two halves so this file never contains it. Docs (docs/,
 * README.md, ARCHITECTURE.md) may name it; nothing else may.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const NEEDLE = new RegExp(['cen', 'sus'].join(''), 'i')
/** This file: the plan gives the test this name, so it is the one file name allowed to hold it. */
const SELF = `src/ship/no${['Cen', 'sus'].join('')}.test.ts`

/** Folders scanned whole, and single files at the project root. */
const FOLDERS = ['src', 'scripts']
const FILES = [
  'vite.config.ts',
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'biome.json',
  '.gitignore',
  '.gitattributes',
  '.claude/launch.json',
  'Launch Headcount Planner.bat',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/')

function scanned(): string[] {
  const out: string[] = []
  for (const f of FOLDERS) walk(join(ROOT, f), out)
  for (const f of FILES) if (existsSync(join(ROOT, f))) out.push(join(ROOT, f))
  return out
}

describe('the template name', () => {
  const files = scanned()

  it('scans the folders and files it should', () => {
    const names = files.map(rel)
    for (const f of [
      'vite.config.ts',
      'index.html',
      'package.json',
      'scripts/verify.mjs',
      'src/main.tsx',
      SELF,
    ])
      expect(names, f).toContain(f)
  })

  it('appears in no file name but this test’s own', () => {
    const hits = files.map(rel).filter((n) => n !== SELF && NEEDLE.test(n))
    expect(hits).toEqual([])
  })

  it('appears in no file', () => {
    const hits: string[] = []
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (NEEDLE.test(line)) hits.push(`${rel(f)}:${i + 1}`)
      })
    }
    expect(hits).toEqual([])
  })

  it('is matched in any letter case', () => {
    const word = ['cen', 'sus'].join('')
    for (const s of [word, word.toUpperCase(), `${word[0].toUpperCase()}${word.slice(1)}`, `use_${word}X`])
      expect(NEEDLE.test(s), s).toBe(true)
    expect(NEEDLE.test('censor us')).toBe(false)
  })
})
