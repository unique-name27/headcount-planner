/**
 * My team's house rules, read from its source (docs/PLAN.md 7.6, 9.3 and 16.2 "team rules": no cost
 * imports in My team): every Figure names its metric and fields before any arrow in its props; the
 * page draws exactly `TEAM_FIGURES`; no em dash sits in a sentence and nothing reads as a nagging ask;
 * and the folder never imports the cost guard, the cost engine, the forecast or Finance views or any
 * module that shows money, never names a pay, offer or leave field, and never marks a column as an
 * amount or formats one as money. Budget status reads band cost inside the engine and shows words
 * and heads only.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TEAM_FIGURES } from './engine/figures'
import { view } from './index'

const dir = new URL('./', import.meta.url)
const files = [
  'index.tsx',
  ...readdirSync(new URL('./ui/', dir)).map((f) => `ui/${f}`),
  ...readdirSync(new URL('./engine/', dir)).map((f) => `engine/${f}`),
].filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('testkit.ts'))
const text = (f: string) => readFileSync(new URL(f, dir), 'utf8')
/** A Figure's or KPI strip's id, written as a literal before any other prop that holds a ">". */
const FIGURE_ID = /<(?:Figure|KpiStrip)\s[^>]*?\bid="([a-z0-9-]+)"/g

/** Imports My team never makes: the cost guard and engines, the views that show money, money exports. */
const BANNED_IMPORTS = [
  '@/cost/',
  '@/plan/engine/cost',
  '@/plan/engine/close',
  '@/plan/engine/forecast',
  '@/plan/engine/bridge',
  '@/plan/engine/variance',
  '@/lib/costRounding',
  '@/lib/export/money',
  '@/views/finance',
  '@/views/forecast',
  '@/views/whatif',
  '@/metrics/costGuard',
]

/** Fields and switches of pay, offers and leave (8.3 `pay: true`, 7.7), and measures Manager mode never reads. */
const BANNED_NAMES = [
  'baseSalary',
  'offerBase',
  'signOnBonus',
  'relocation',
  'agencyFee',
  'targetBonusPct',
  'onLeave',
  'leavePaid',
  'showPay',
  'showCost',
  'performance',
  'bandEstimate',
]

describe('My team source', () => {
  it('declares a metric and its lineage on every Figure, before any arrow in its props', () => {
    let count = 0
    for (const file of files.filter((f) => f.endsWith('.tsx'))) {
      for (const f of text(file).split('<Figure').slice(1)) {
        if (!/^\s/.test(f)) continue
        count++
        const props = f.slice(0, f.indexOf('>'))
        expect(props, file).toMatch(/\bmetric=\{/)
        expect(props, file).toMatch(/\buses=\{/)
      }
    }
    expect(count).toBeGreaterThanOrEqual(4)
  })

  it('draws exactly its figure ids', () => {
    const ui = files
      .filter((f) => f.startsWith('ui/'))
      .map(text)
      .join('\n')
    // Figure and strip ids are written as literals (docs/CONTRACTS-M2.md 4), so the scan sees them.
    const drawn = new Set([...ui.matchAll(FIGURE_ID)].map((m) => m[1]))
    expect([...drawn].sort()).toEqual(Object.values(TEAM_FIGURES).sort())
    expect(ui).not.toMatch(/id=\{TEAM_FIGURES\./)
  })

  it('writes no em dash into a sentence, no exclamation mark and no nagging verb', () => {
    for (const f of files) {
      const t = text(f)
      expect(t, f).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
      expect(t, f).not.toMatch(/'[^'\n]*!'/)
      expect(t, f).not.toMatch(/['"`][^'"`\n]*\b(chase|nag|ping|hound|remind|unblock)\w*/i)
    }
  })

  it('imports no cost or pay module and names no pay, offer or leave field', () => {
    for (const f of files) {
      const t = text(f)
      for (const banned of BANNED_IMPORTS) expect(t.includes(`'${banned}`), `${f}: ${banned}`).toBe(false)
      for (const banned of BANNED_NAMES)
        expect(new RegExp(`\\b${banned}\\b`).test(t), `${f}: ${banned}`).toBe(false)
    }
  })

  it('marks no column as an amount and formats nothing as money', () => {
    for (const f of files) {
      const t = text(f)
      expect(t, f).not.toMatch(/\b(pay|cost|band):\s*true\b/)
      expect(t, f).not.toMatch(/['"](money|moneyFull|moneyM)['"]/)
    }
  })

  it('raises no Action center items of its own (9.6)', () => {
    expect(view.actions).toBeUndefined()
  })
})
