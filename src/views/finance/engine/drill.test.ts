/**
 * Counted figures equal the rows their drill opens (docs/PLAN.md 9.5, 16.1; the template app's
 * per-view drill test): every tile of the Finance view, in every mode, on FY27 and FY28 and under
 * filters; every calculation card keeps its rules; and the model's words keep the copy rules (14.3:
 * sentence case, no em dash between words, no "!", no mode words, never "tamper-proof") and carry no
 * amount.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { BANNED_HASH_WORDS } from '@/access/copy'
import { FY28_WORKING } from '@/data/sample'
import type { Mode } from '@/data/schema'
import { MemoryStorage } from '@/testkit/memoryStorage'
import {
  expectCardHolds,
  expectCellsHold,
  expectDrillHolds,
  expectNoMoneyText,
  expectPlainCopy,
  wordsOf,
} from '@/views/plan/engine/testing'
import { sample, sampleCtx } from '@/views/targets/engine/fixtures'
import { financeActions } from './actions'
import { type FinanceModel, financeModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const ALL: readonly Mode[] = ['manager', 'hrbp', 'leader', 'finance', 'hr-admin']

beforeAll(() => {
  sample()
}, 60_000)

const kpisOf = (m: FinanceModel) => [
  ...m.versions.kpis,
  ...m.assumptions.kpis,
  ...m.freezes.kpis,
  ...m.reconcile.kpis,
  ...m.export.kpis,
]
const figuresOf = (m: FinanceModel) => [
  m.versions.versions,
  m.versions.closes,
  m.versions.adjustments,
  m.versions.adjustmentsByMonth,
  m.assumptions.values,
  ...(m.assumptions.tradeRates ? [m.assumptions.tradeRates] : []),
  m.freezes.freezes,
  m.freezes.openings,
  m.reconcile.exceptions,
]

function expectHolds(m: FinanceModel, where: string): void {
  for (const k of kpisOf(m)) {
    expectDrillHolds(k, where)
    expectCardHolds(k.calc, where)
    expectCardHolds(k.deltaCalc, where)
  }
  for (const f of figuresOf(m)) expectCellsHold(f, where)
}

describe('Finance drills hold their numbers', () => {
  it('in every mode, on FY27 and FY28', () => {
    for (const version of [null, FY28_WORKING])
      for (const mode of ALL) expectHolds(financeModel(sampleCtx(mode, { version })), `${mode} ${version}`)
  })

  it('under the filters Finance takes', () => {
    for (const filters of [
      { businessUnit: ['Corporate'] },
      { country: ['Taiwan'] },
      { costCenter: ['1550-HSZ'] },
    ]) {
      const m = financeModel(sampleCtx('finance', { filters }))
      expectHolds(m, JSON.stringify(filters))
      // A filter keeps the exceptions of its seats only (story 7's 9 are the whole company's).
      expect(m.reconcile.kpis[0].value as number).toBeLessThanOrEqual(9)
    }
  })
})

describe('Finance words', () => {
  it('keep the copy rules and carry no amount, in every mode, items included', () => {
    for (const mode of ALL) {
      const ctx = sampleCtx(mode)
      const m = financeModel(ctx)
      const kpis = kpisOf(m)
      const words = wordsOf({
        kpis: kpis.map((k) => ({
          label: k.label,
          note: k.note,
          formula: k.formula,
          suppressedNote: k.suppressedNote,
        })),
        figures: figuresOf(m).map((f) => ({
          title: f.title,
          subtitle: f.subtitle,
          note: f.note,
          empty: f.empty,
          labels: f.columns.map((c) => c.label),
        })),
        items: financeActions(ctx).map((i) => ({ what: i.what, note: i.note, closesWhen: i.closesWhen })),
      })
      expect(words.length, mode).toBeGreaterThan(20)
      expectPlainCopy(words, mode)
      expectNoMoneyText(kpis, mode)
      for (const w of words)
        for (const b of BANNED_HASH_WORDS) expect(w.toLowerCase().includes(b), `${mode}: ${w}`).toBe(false)
    }
  })
})
