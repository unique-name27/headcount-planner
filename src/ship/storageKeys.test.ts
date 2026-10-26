/**
 * Storage keys (docs/PLAN.md 5.4): src/app/storageKeys.ts lists every `hcp:` key literal written in
 * src (a source scan of every .ts and .tsx file but tests and the registry itself), each with where
 * it lives and what it holds, and every key the plan names is listed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { describeKey, isKnownName, NOT_STORAGE_NAMES, STORAGE_KEYS } from '../app/storageKeys'

const SRC = fileURLToPath(new URL('..', import.meta.url))
const REGISTRY = 'app/storageKeys.ts'

/** Every .ts and .tsx file under src, except tests and the registry. */
function sources(dir = SRC, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__snapshots__') continue
      sources(p, out)
    } else if (
      /\.tsx?$/.test(name) &&
      !/\.test\.tsx?$/.test(name) &&
      relative(SRC, p).replace(/\\/g, '/') !== REGISTRY
    )
      out.push(p)
  }
  return out
}

/**
 * The `hcp:` names written in the source as string literals: "hcp:mode", the fixed head of a
 * template ("hcp:dataset:" from `hcp:dataset:${k}`), and prefixes joined to a variable
 * ("hcp:audit:" + n).
 */
function literalNames(): Set<string> {
  const out = new Set<string>()
  for (const p of sources()) {
    const text = readFileSync(p, 'utf8')
    for (const m of text.matchAll(/['"`](hcp:[A-Za-z0-9:_./-]*)(\$\{|['"`])/g)) out.add(m[1])
  }
  return out
}

/** The keys docs/PLAN.md 5.4 names, each of which must be listed. */
const PLAN_KEYS: readonly [string, 'localStorage' | 'IndexedDB'][] = [
  ['hcp:dataset:', 'IndexedDB'],
  ['hcp:versions:', 'IndexedDB'],
  ['hcp:raw:', 'IndexedDB'],
  ['hcp:profile:', 'IndexedDB'],
  ['hcp:plan', 'IndexedDB'],
  ['hcp:audit:', 'IndexedDB'],
  ['hcp:settings', 'localStorage'],
  ['hcp:filters', 'localStorage'],
  ['hcp:views', 'localStorage'],
  ['hcp:lists', 'localStorage'],
  ['hcp:metrics', 'localStorage'],
  ['hcp:mode', 'localStorage'],
  ['hcp:help', 'localStorage'],
  ['hcp:actions', 'localStorage'],
]

describe('storage keys', () => {
  it('describes every hcp: literal in the source', () => {
    const names = literalNames()
    // The scan finds the names it should (it is not vacuous): the brand's prefix and lock, timings.
    for (const k of ['hcp:', 'hcp:writer', 'hcp:headline:']) expect(names, k).toContain(k)
    const unknown = [...names].filter((n) => !isKnownName(n))
    expect(unknown).toEqual([])
  })

  it('lists every key the plan names, where the plan keeps it', () => {
    for (const [key, where] of PLAN_KEYS) {
      const def = STORAGE_KEYS.find((d) => d.key === key)
      expect(def, key).toBeDefined()
      expect(def?.where, key).toEqual([where])
      expect(!!def?.prefix, key).toBe(key.endsWith(':'))
    }
  })

  it('lists every key once, each with where and what, and nothing in sessionStorage', () => {
    const keys = STORAGE_KEYS.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const d of STORAGE_KEYS) {
      expect(d.key.startsWith('hcp:'), d.key).toBe(true)
      expect(d.holds.trim(), d.key).not.toBe('')
      expect(d.where.length, d.key).toBeGreaterThan(0)
      expect(d.holds.includes('—'), d.key).toBe(false)
      expect(d.holds.includes('!'), d.key).toBe(false)
      // docs/PLAN.md 5.4: "sessionStorage: none".
      expect(d.where, d.key).not.toContain('sessionStorage')
    }
    for (const n of NOT_STORAGE_NAMES) {
      expect(n.name.startsWith('hcp:'), n.name).toBe(true)
      expect(n.what.includes('—'), n.name).toBe(false)
    }
  })

  it('describes keys by exact name or the longest prefix', () => {
    expect(describeKey('hcp:mode')?.key).toBe('hcp:mode')
    expect(describeKey('hcp:dataset:positions')?.where).toEqual(['IndexedDB'])
    expect(describeKey('hcp:raw:positions:v1')?.key).toBe('hcp:raw:')
    expect(describeKey('hcp:audit:3')?.key).toBe('hcp:audit:')
    expect(describeKey('hcp:nope')).toBeNull()
    expect(isKnownName('hcp:headline:plan')).toBe(true)
    expect(isKnownName('hcp:dataset:')).toBe(true)
    expect(isKnownName('hcp:showPay')).toBe(false)
    expect(isKnownName('hcp:nope:deeper')).toBe(false)
  })
})
