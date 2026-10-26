/**
 * Counted figures equal the rows their drill opens (docs/PLAN.md 9.5, 16.1; the template app's
 * per-view drill test): every tile and every counted cell of the Targets view, in every mode that
 * shows it, on FY27 and FY28 and under filters; weighted cells' "Counts as" adds up to the cell; every
 * calculation card keeps its rules (its last step is its value); and the model's words keep the copy
 * rules (14.3) and carry no amount.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
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
import { targetsActions } from './actions'
import { sample, sampleCtx } from './fixtures'
import { type TargetsModel, targetsModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const SHOWN: readonly Mode[] = ['hrbp', 'leader', 'finance', 'hr-admin']

beforeAll(() => {
  sample()
}, 60_000)

const kpisOf = (m: TargetsModel) => [...m.gap.kpis, ...m.suborgs.kpis, ...m.tree.kpis]
const figuresOf = (m: TargetsModel) => [
  m.gap.rows,
  m.suborgs.rows,
  m.suborgs.unallocated,
  m.suborgs.exceptions,
  m.tree.cells,
  m.tree.costCenters,
]

/** Every tile, cell and card of a model holds its number; returns the cells checked. */
function expectHolds(m: TargetsModel, where: string): number {
  for (const k of kpisOf(m)) {
    expectDrillHolds(k, where)
    expectCardHolds(k.calc, where)
    expectCardHolds(k.deltaCalc, where)
  }
  let cells = 0
  for (const f of figuresOf(m)) {
    cells += expectCellsHold(f, where)
    for (const c of f.columns) {
      if (!c.calc) continue
      for (const r of f.rows) expectCardHolds(c.calc(r as never) as never, `${where} ${f.id} ${c.key}`)
    }
  }
  return cells
}

describe('Targets drills hold their numbers', () => {
  it('in every mode that shows Targets, on FY27 and FY28', () => {
    for (const version of [null, FY28_WORKING])
      for (const mode of SHOWN) {
        const where = `${mode} ${version ?? 'FY27'}`
        expect(expectHolds(targetsModel(sampleCtx(mode, { version })), where), where).toBeGreaterThan(5)
      }
  })

  it('under filters (rows count whole orgs; the tree counts the filtered seats)', () => {
    for (const filters of [
      { businessUnit: ['Silicon Engineering'] },
      { location: ['Bengaluru'] },
      { level: ['P3', 'P4'] },
      { department: ['Facilities'] },
    ]) {
      for (const mode of ['finance', 'hr-admin'] as const)
        expectHolds(targetsModel(sampleCtx(mode, { filters })), `${mode} ${JSON.stringify(filters)}`)
    }
  })
})

describe('Targets words', () => {
  it('keep the copy rules and carry no amount, in every mode, items included', () => {
    for (const mode of [...SHOWN, 'manager'] as const) {
      const ctx = sampleCtx(mode)
      const m = targetsModel(ctx)
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
          reasons: f.rows.slice(0, 40).map((r) => (r as { reason?: string | null }).reason ?? ''),
        })),
        items: targetsActions(ctx).map((i) => ({ what: i.what, note: i.note, closesWhen: i.closesWhen })),
      })
      expect(words.length, mode).toBeGreaterThan(20)
      expectPlainCopy(words, mode)
      expectNoMoneyText(kpis, mode)
    }
  })
})
