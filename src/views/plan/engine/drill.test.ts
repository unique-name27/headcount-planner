/**
 * Counted figures equal the rows their drill opens (docs/PLAN.md 9.5, 16.1): every tile, every
 * counted figure cell and every finding of the Plan view, in every mode, under filters; weighted
 * tiles' "Counts as" adds up to the value; every calculation card keeps its rules (its last step is
 * its value, its rows add up); and no tile, finding or item text carries an amount.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { weightSum } from '@/drill/calc'
import { resolveDrill } from '@/drill/types'
import { type PlanModel, planModel } from '.'
import { planActions } from './actions'
import { prepare } from './base'
import { positionOf } from './core'
import { everyMode, sample, sampleCtx } from './fixtures'
import { actualOn } from './heads'
import { NOT_IN_PLAN } from './overview'
import { expectCardHolds, expectCellsHold, expectDrillHolds, expectNoMoneyText, MONEY_TEXT } from './testing'

beforeAll(() => {
  sample()
}, 60_000)

const allKpis = (m: PlanModel) => [
  ...m.overview.kpis,
  ...m.positions.kpis,
  ...m.openings.kpis,
  ...m.transfers.kpis,
]
const figures = (m: PlanModel) => [
  m.overview.headsByMonth,
  m.overview.headsByUnit,
  m.overview.positionsByStatus,
  m.overview.costByUnit,
  m.overview.openingsByStage,
  m.openings.byStage,
  m.openings.byAge,
]

describe('drills hold their numbers', () => {
  it('in every mode', () => {
    for (const { mode, ctx } of everyMode()) {
      const m = planModel(ctx)
      for (const k of allKpis(m)) {
        expectDrillHolds(k, mode)
        expectCardHolds(k.calc, mode)
        expectCardHolds(k.deltaCalc, mode)
      }
      let cells = 0
      for (const f of figures(m)) cells += expectCellsHold(f, mode)
      expect(cells, mode).toBeGreaterThan(5)
    }
  })

  it('under filters, with a group filter on unit cells', () => {
    for (const filters of [
      { businessUnit: ['Go-to-Market'] },
      { location: ['Bengaluru'] },
      { level: ['P3', 'P4'] },
      { department: ['Facilities'] },
    ]) {
      const m = planModel(sampleCtx('hr-admin', { filters }))
      for (const k of allKpis(m)) expectDrillHolds(k, JSON.stringify(filters))
      for (const f of figures(m)) expectCellsHold(f, JSON.stringify(filters))
      for (const r of m.overview.headsByUnit.rows) {
        const drill = m.overview.headsByUnit.columns.find((c) => c.key === 'approved')?.drill?.(r)
        // The "Not in plan" row holds no approved head and has no unit to filter to (SA-6).
        if (r.key === NOT_IN_PLAN) {
          expect(drill ?? null, JSON.stringify(filters)).toBeNull()
          continue
        }
        const spec = resolveDrill(drill as never)
        expect(spec?.filter).toEqual({ businessUnit: [r.key] })
      }
    }
  })

  it('opens the positions behind each finding', () => {
    for (const { mode, ctx } of everyMode()) {
      for (const f of planModel(ctx).overview.findings) {
        const spec = resolveDrill(f.drill)
        expect(spec, `${mode} ${f.id}`).not.toBeNull()
        expect(spec?.rows.length, `${mode} ${f.id}`).toBeGreaterThan(0)
        if (f.positionsTotal != null && spec?.kind === 'positions')
          expect(spec.rows.length, `${mode} ${f.id}`).toBe(f.positionsTotal)
      }
    }
  })

  it('opens, for each heads finding, rows whose "Counts as" and the people not listed make its number', () => {
    // Finance compares with the FY27 Budget; the CFO and HR admin with the Q1 Reforecast, where
    // Systems & Software's gap has a seat on each side and three people not in the plan.
    const cases = [
      { name: 'finance', ctx: sampleCtx('finance') },
      { name: 'leader-cfo', ctx: sampleCtx('leader', { persona: 'leader-cfo' }) },
      { name: 'hr-admin', ctx: sampleCtx('hr-admin') },
    ]
    let checked = 0
    for (const { name, ctx } of cases) {
      const m = planModel(ctx)
      const p = prepare(ctx)
      // The people a positions list cannot hold, per unit: employees with no seat, and a second
      // holder of a seat already counted.
      const unlisted = new Map<string, number>()
      // Of them, the people with no seat: on the table's "Not in plan" row, not in their unit's (SA-6).
      const seatless = new Map<string, number>()
      const held = new Set<string>()
      for (const e of actualOn(p).values()) {
        const seat = e.assignment.positionId
        const unit = seat ? (positionOf(ctx, seat)?.businessUnit ?? '') : (e.worker.businessUnit ?? '')
        if (!seat) seatless.set(unit, (seatless.get(unit) ?? 0) + 1)
        if (seat && !held.has(seat)) held.add(seat)
        else unlisted.set(unit, (unlisted.get(unit) ?? 0) + 1)
      }
      const byUnit = new Map(m.overview.headsByUnit.rows.map((r) => [r.key, r]))
      for (const f of m.overview.findings) {
        if (!f.id.startsWith('heads-')) continue
        const where = `${name} ${f.id}`
        const t = /^(.+) is (\d+) heads? (over|under) /.exec(f.title)
        expect(t, where).not.toBeNull()
        const [, unit, num, side] = t as RegExpExecArray
        const n = Number(num)
        const over = side === 'over'
        // The title's number is the unit's people (its seats' actual heads and its people not in the
        // plan, whom the table lists on its own row) less the comparison's plan heads.
        const row = byUnit.get(unit)
        expect(row?.actual != null && row.comparison != null, where).toBe(true)
        const unitPeople = (row?.actual ?? 0) + (seatless.get(unit) ?? 0)
        expect(Math.abs(unitPeople - (row?.comparison ?? 0)), where).toBe(n)
        const spec = resolveDrill(f.drill)
        expect(spec?.kind, where).toBe('positions')
        expect(spec?.weight, where).toBeDefined()
        const sum = weightSum(spec as never) ?? 0
        const people = unlisted.get(unit) ?? 0
        expect(sum + (over ? people : -people), where).toBe(n)
        if (people) expect(spec?.note, where).toContain(`${people} ${people === 1 ? 'person' : 'people'}`)
        expect(spec?.rows.length, where).toBe(f.positionsTotal)
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8)
  })

  it('names the parts of Systems & Software’s gap on both comparisons', () => {
    const budget = planModel(sampleCtx('finance')).overview.findings.find(
      (f) => f.id === 'heads-under-Systems & Software',
    )
    expect(budget?.title).toBe('Systems & Software is 12 heads under the FY27 Budget at 30 Sep 2026.')
    expect(budget?.detail).toContain('15 plan heads not filled')
    expect(budget?.detail).toContain('3 people not in the plan')
    expect(weightSum(resolveDrill(budget?.drill) as never)).toBe(15)
    const q1 = planModel(sampleCtx('leader', { persona: 'leader-cfo' })).overview.findings.find(
      (f) => f.id === 'heads-under-Systems & Software',
    )
    expect(q1?.title).toBe('Systems & Software is 4 heads under the FY27 Q1 Reforecast at 30 Sep 2026.')
    const spec = resolveDrill(q1?.drill)
    // 8 plan heads not filled count 1 each, the 1 seat filled with no plan head −1: 7, less 3 people.
    expect(spec?.rows).toHaveLength(9)
    expect(weightSum(spec as never)).toBe(7)
    expect(q1?.detail).toContain(
      '8 plan heads not filled, 1 seat filled with no plan head, 3 people not in the plan',
    )
  })

  it('weighs average FTE by each assignment’s days', () => {
    const m = planModel(sampleCtx('finance'))
    const k = m.overview.kpis.find((x) => x.id === 'fte-ytd')
    const spec = resolveDrill(k?.drill)
    expect(spec?.weight).toBeDefined()
    expect(k?.value).toBeGreaterThan(1_400)
    expect(k?.value).toBeLessThan(1_456)
  })
})

describe('no amount in words', () => {
  it('in tiles, findings and items, in every mode', () => {
    for (const { mode, ctx } of everyMode()) {
      const m = planModel(ctx)
      expectNoMoneyText([...allKpis(m), ...m.overview.findings], mode)
      for (const a of planActions(ctx)) {
        expect(MONEY_TEXT.test(a.what), `${mode} ${a.id}`).toBe(false)
        expect(MONEY_TEXT.test(a.note ?? ''), `${mode} ${a.id}`).toBe(false)
      }
    }
  })
})
