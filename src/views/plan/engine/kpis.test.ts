/**
 * The Plan view's tiles (docs/PLAN.md 9.1, 9.3, 9.4, 7): Overview has 5 to 7 tiles in every mode
 * that shows the tab; every tile has `metricId`, `uses` and a drill or a card; every "vs" figure
 * names its comparison; a strip has one tile per metric; the homes find the tiles they re-link; and
 * the cost tile follows the mode: no amount in Manager mode, whole $0.1M steps in HRBP and Leader
 * mode, exact over 5 or more costed people in Finance.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { calcProblems, resolveCalc } from '@/drill/calc'
import { resolveDrill } from '@/drill/types'
import { isRoundedCost } from '@/lib/costRounding'
import { HOME_KEY_FIGURES } from '@/views/home/engine/figures'
import { ID } from '../metrics'
import { type PlanModel, planModel } from '.'
import { prepare } from './base'
import { differenceCard, planCost } from './cost'
import { everyMode, sample, sampleCtx, withData } from './fixtures'
import { type PlanHiring, planHiringModel } from './hiringTab'
import { expectCardHolds } from './testing'

beforeAll(() => {
  sample()
}, 60_000)

const strips = (m: PlanModel, hiring?: PlanHiring) => ({
  overview: m.overview.kpis,
  positions: m.positions.kpis,
  openings: m.openings.kpis,
  transfers: m.transfers.kpis,
  // Plan > Hiring has its own model (9.7, H10); its strip is re-linked by the HRBP and Leader homes.
  ...(hiring ? { hiring: hiring.kpis } : {}),
})

describe('the strips', () => {
  it('holds 5 to 7 tiles on Overview in every mode that shows it, each linked and opening something', () => {
    for (const { mode, ctx } of everyMode()) {
      const m = planModel(ctx)
      const hiring = planHiringModel(ctx)
      if (ctx.access.can('tab:plan.overview')) {
        expect(m.overview.kpis.length, mode).toBeGreaterThanOrEqual(5)
        expect(m.overview.kpis.length, mode).toBeLessThanOrEqual(7)
      }
      for (const [tab, kpis] of Object.entries(strips(m, hiring))) {
        const ids = kpis.map((k) => k.metricId)
        expect(new Set(ids).size, `${mode} ${tab}`).toBe(ids.length)
        for (const k of kpis) {
          expect(k.metricId, `${mode} ${k.id}`).toBeTruthy()
          expect(k.uses?.length, `${mode} ${k.id}`).toBeGreaterThan(0)
          expect(!!k.drill || !!k.calc, `${mode} ${k.id}`).toBe(true)
          if (k.delta !== undefined) expect(k.deltaLabel, `${mode} ${k.id}`).toMatch(/^vs /)
        }
      }
    }
  })

  it('has the six Overview tiles of 9.4 for HR admin, in order', () => {
    const m = planModel(sampleCtx('hr-admin'))
    expect(m.overview.kpis.map((k) => k.metricId)).toEqual([
      ID.headsApproved,
      ID.headsActual,
      ID.openingsCount,
      ID.openingsPastStart,
      ID.fteAverage,
      ID.costLoaded,
    ])
  })

  it('ends Overview with the one leave count in HRBP and Leader mode only (7.7), its card the count alone', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const kpis = planModel(sampleCtx(mode)).overview.kpis
      const leave = kpis.at(-1)
      expect(leave?.metricId, mode).toBe(ID.leaveOnLeave)
      expect(leave?.drill, mode).toBeUndefined()
      expect(leave?.delta, mode).toBeUndefined()
      const card = resolveCalc(leave?.calc)
      expect(card?.value, mode).toBe(leave?.value)
      expect(card?.rows, mode).toBeUndefined()
      expect(calcProblems(card!), mode).toEqual([])
      const filtered = planModel(sampleCtx(mode, { filters: { location: ['Munich'] } })).overview.kpis
      expect(filtered.find((k) => k.metricId === ID.leaveOnLeave)?.value, mode).toBeNull()
    }
    for (const mode of ['manager', 'finance', 'hr-admin'] as const)
      expect(
        planModel(sampleCtx(mode)).overview.kpis.some((k) => k.metricId === ID.leaveOnLeave),
        mode,
      ).toBe(false)
  })

  it('gives the HRBP, Leader and Finance homes the plan tiles they re-link', () => {
    for (const [slug, mode] of [
      ['unit', 'hrbp'],
      ['rollup', 'leader'],
      ['fin', 'finance'],
    ] as const) {
      const ctx = sampleCtx(mode)
      const m = planModel(ctx)
      for (const f of HOME_KEY_FIGURES[slug]) {
        if (f.view !== 'plan') continue
        const tab = strips(m, planHiringModel(ctx))[f.tab as keyof ReturnType<typeof strips>]
        expect(tab?.filter((k) => k.metricId === f.metricId).length, `${slug} ${f.metricId}`).toBe(1)
      }
    }
  })
})

describe('the cost tile under the guard', () => {
  const cost = (m: PlanModel) => m.overview.kpis.find((k) => k.metricId === ID.costLoaded)

  it('is left out in Manager mode, and the positions grid carries no amount there', () => {
    const m = planModel(sampleCtx('manager'))
    expect(cost(m)).toBeUndefined()
    expect(m.positions.kpis.some((k) => k.format.startsWith('money'))).toBe(false)
    for (const r of m.positions.grid.rows) {
      expect(r.bandEstimateUsd).toBeNull()
      expect(r.costAnnualUsd).toBeNull()
    }
    for (const r of m.overview.costByUnit.rows) expect(r.totalUsd).toBeNull()
  })

  it('reads whole $0.1M steps in HRBP and Leader mode, its difference a difference of rounded totals', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const k = cost(planModel(sampleCtx(mode)))
      expect(k?.value, mode).not.toBeNull()
      expect(isRoundedCost(k?.value as number), mode).toBe(true)
      expect(isRoundedCost(k?.delta as number), mode).toBe(true)
      for (const r of planModel(sampleCtx(mode)).overview.costByUnit.rows)
        if (r.totalUsd != null) expect(isRoundedCost(r.totalUsd)).toBe(true)
    }
  })

  it('hides cost under a level filter in HRBP mode and under a month in Leader mode, heads still showing', () => {
    const level = planModel(sampleCtx('hrbp', { filters: { level: ['P4'] } }))
    expect(cost(level)?.value).toBeNull()
    expect(cost(level)?.suppressedNote).toMatch(/Clear the location and level filters/)
    expect(level.overview.kpis.find((k) => k.metricId === ID.headsApproved)?.value).toBeGreaterThan(0)
    const month = planModel(sampleCtx('leader', { filters: { period: 'month' } }))
    expect(cost(month)?.value).toBeNull()
    expect(cost(month)?.suppressedNote).toMatch(/quarter to date, year to date and full year/)
  })

  it('is exact in Finance, with no amount per position', () => {
    const m = planModel(sampleCtx('finance'))
    expect(cost(m)?.value).toBeCloseTo(124_241_878.61, 1)
    for (const r of m.positions.grid.rows) expect(r.costAnnualUsd).toBeNull()
  })

  it('shows per-position cost only for HR admin with the switch on', () => {
    const on = planModel(sampleCtx('hr-admin', { showPay: true }))
    expect(on.positions.grid.rows.some((r) => (r.costAnnualUsd ?? 0) > 0)).toBe(true)
    const off = planModel(sampleCtx('hr-admin'))
    expect(off.positions.grid.rows.every((r) => r.costAnnualUsd == null)).toBe(true)
  })

  it('names a target comparison and computes no monthly difference against it', () => {
    const m = planModel(sampleCtx('finance', { compare: 'target' }))
    const k = cost(m)
    expect(k?.deltaLabel).toBe('vs FY27 target')
    expect(k?.delta).toBeNull()
    expect(m.overview.kpis.find((x) => x.metricId === ID.headsActual)?.delta).toBeNull()
  })

  it('says on the change row why a target comparison gives no monthly or YTD change (9.2)', () => {
    const cases = [
      { opts: { compare: 'target' }, why: 'A target has no monthly plan. Pick a version to compare.' },
      { opts: { version: 'fy28-working' }, why: 'FY28 has no locked version yet.' },
    ]
    for (const { opts, why } of cases)
      for (const mode of ['hrbp', 'leader', 'finance', 'hr-admin'] as const) {
        const m = planModel(sampleCtx(mode, opts))
        const tiles = [
          m.overview.kpis.find((k) => k.metricId === ID.headsActual),
          m.openings.kpis.find((k) => k.metricId === ID.hiresYtd),
          cost(m),
        ]
        for (const k of tiles) {
          expect(k, `${mode} ${why}`).toBeDefined()
          expect(k?.delta ?? null, `${mode} ${k?.id}`).toBeNull()
          expect(k?.deltaEmpty, `${mode} ${k?.id}`).toBe(why)
        }
        // The tile's own note never words the empty state another way.
        expect(tiles[0]?.note ?? '', mode).not.toMatch(/has no monthly plan/)
      }
    // Under a version comparison there is a change, and no empty-state reason.
    const m = planModel(sampleCtx('hrbp'))
    expect(m.overview.kpis.find((k) => k.metricId === ID.headsActual)?.deltaEmpty).toBeUndefined()
  })

  it('gives the FY28 cost tile a card with its reason and a formula from the period (RC-7)', () => {
    for (const mode of ['hrbp', 'leader', 'finance'] as const) {
      const k = cost(planModel(sampleCtx(mode, { version: 'fy28-working' })))
      expect(k?.value, mode).toBeNull()
      expect(k?.formula, mode).not.toMatch(/No closed month/)
      expect(k?.formula, mode).toMatch(/^FY28 has no closed month yet\./)
      const card = resolveCalc(k?.calc)
      expect(card, mode).not.toBeNull()
      expect(calcProblems(card!), mode).toEqual([])
      expect(
        card?.steps.map((s) => s.label),
        mode,
      ).toEqual([k?.suppressedNote])
    }
  })
})

describe('a difference card (7.2 rule 5)', () => {
  it('shows its contributor count only with the difference', () => {
    const p = prepare(sampleCtx('finance'))
    const fig = planCost(p).ytd?.figure
    expect(fig).toBeDefined()
    if (!fig) return
    const card = (value: number | null, contributors: number) =>
      differenceCard(p, {
        title: 'Test',
        metricId: ID.costLoaded,
        a: fig,
        b: fig,
        aLabel: 'A',
        bLabel: 'B',
        delta: { value, contributors, band: false, reason: value == null ? 'Hidden' : null },
        uses: [],
      })
    const count = (c: ReturnType<typeof card>) => c.inputs.find((i) => /positions/i.test(i.label))?.value
    expect(count(card(null, 3))).toBeNull()
    expect(count(card(12_345, 7))).toBe(7)
    expect(calcProblems(card(null, 3))).toEqual([])
  })
})

describe('the band tile (7.2 rule 3)', () => {
  const band = (m: PlanModel) => m.positions.kpis.find((k) => k.metricId === ID.costOpenBand)
  /** The card as text, its records thunk left out. */
  const cardText = (k: ReturnType<typeof band>): string | null => {
    const c = resolveCalc(k?.calc ?? null)
    return c ? JSON.stringify({ ...c, rows: undefined }) : null
  }

  it('opens the band part alone, never the filled part beside it', () => {
    for (const mode of ['hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const k = band(planModel(sampleCtx(mode)))
      expect(k?.value, mode).toBeGreaterThan(0)
      const card = expectCardHolds(k?.calc, mode)
      expect(card?.value, mode).toBe(k?.value)
      for (const i of card?.inputs ?? []) expect(i.label, mode).not.toMatch(/filled|costed people/i)
      for (const s of card?.steps ?? []) expect(s.label, mode).not.toMatch(/filled part/i)
    }
    // Finance: the seats behind it count as their band estimates, adding up to the figure.
    const fin = expectCardHolds(band(planModel(sampleCtx('finance')))?.calc)
    expect(resolveDrill(fin?.rows ?? null)?.weight).toBeDefined()
    // HRBP: whole $0.1M steps, built from each team's band part.
    const k = band(planModel(sampleCtx('hrbp')))
    expect(isRoundedCost(k?.value as number)).toBe(true)
  })

  it('does not move with a Filled seat’s pay or leave in HRBP, Leader and Finance', () => {
    const s = sample()
    const hrbp = sampleCtx('hrbp')
    const inScope = new Set(hrbp.data.positions.map((p) => p.positionId))
    const active = (w: (typeof s.datasets.workers)[number]) =>
      w.workerType === 'Employee' &&
      !!w.positionId &&
      inScope.has(w.positionId) &&
      !w.assignmentEnd &&
      !w.terminationDate
    const paid = s.datasets.workers.find(
      (w) => active(w) && s.datasets.comp.some((c) => c.employeeId === w.employeeId),
    )
    const leave = s.datasets.workers.find((w) => active(w) && w.onLeave === true && w.leavePaid !== false)
    expect(paid).toBeDefined()
    const changed = withData({
      comp: s.datasets.comp.map((c) =>
        c.employeeId === paid?.employeeId ? { ...c, baseSalary: c.baseSalary + 7_919 } : c,
      ),
      workers: s.datasets.workers.map((w) =>
        w.employeeId === leave?.employeeId ? { ...w, leavePaid: false } : w,
      ),
    })
    for (const mode of ['hrbp', 'leader', 'finance'] as const) {
      const a = band(planModel(sampleCtx(mode)))
      const b = band(planModel(sampleCtx(mode, { sample: changed })))
      expect(b?.value, mode).toBe(a?.value)
      expect(cardText(b), mode).toBe(cardText(a))
    }
    // Control: Finance's loaded cost by unit moves with the same change.
    const total = (x: PlanModel) => x.overview.costByUnit.rows.reduce((t, r) => t + (r.totalUsd ?? 0), 0)
    expect(total(planModel(sampleCtx('finance', { sample: changed })))).not.toBeCloseTo(
      total(planModel(sampleCtx('finance'))),
      2,
    )
  })
})

describe('the period window of the shown version’s year (UI-3)', () => {
  it('reads FY28 Working’s window, empty to date until FY28 starts, as the header does', () => {
    for (const mode of ['hrbp', 'finance'] as const) {
      const fy = prepare(sampleCtx(mode, { version: 'fy28-working' }))
      expect(fy.windowName, mode).toBe('FY28')
      expect(fy.windowMonths, mode).toHaveLength(12)
      expect(fy.windowMonths[0], mode).toBe('2027-04')
      for (const period of ['ytd', 'qtd'] as const) {
        const ctx = sampleCtx(mode, { version: 'fy28-working', filters: { period } })
        const p = prepare(ctx)
        expect(p.windowMonths, `${mode} ${period}`).toEqual([])
        expect(p.windowEmpty, `${mode} ${period}`).toBe('FY28 has not started yet')
        expect(p.windowEmpty, `${mode} ${period}`).toBe(ctx.window.label)
        expect(p.windowName, `${mode} ${period}`).toMatch(/^FY28 year to date$|^Q1 FY28 to date$|FY28/)
      }
    }
  })
})

describe('standard heads', () => {
  it('show in every mode, Manager included, as weights', () => {
    for (const { mode, ctx } of everyMode()) {
      const m = planModel(ctx)
      const rows = m.positions.grid.rows.filter((r) => r.standardHeads != null)
      expect(rows.length, mode).toBeGreaterThan(0)
      const tile = m.positions.kpis.find((k) => k.metricId === ID.tradeWeight)
      expect(tile?.format, mode).toBe('num2')
      // An average full-time seat weighs about 1.00 (11.1).
      const avg = rows.reduce((a, r) => a + (r.standardHeads as number), 0) / rows.length
      expect(avg, mode).toBeGreaterThan(0.3)
      expect(avg, mode).toBeLessThan(3)
    }
  })
})
