/**
 * The long CSV's rows in every mode (docs/PLAN.md 14.1 items 3 and 4, 7.2, 7.3, 7.4; CONTRACTS-M4 3,
 * finance-export): the rows `longCsvOf` builds from the guarded model, checked against item 3's rules
 * (src/lib/export/longCsv.ts `longRowProblems`, and the same rules written out here), the partition
 * of each period's positions, Manager mode's heads-only rows, the 20-person cost center fixture, and
 * the control totals matched to the screen models (every home that reads version or forecast lines,
 * Plan Overview, Forecast Variance and the bridge) with no total minus the shown rows giving a hidden
 * group or component.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { isUnionOfAtoms } from '@/cost/atoms'
import { hiddenNote } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import { monthEnd } from '@/data/fiscal'
import {
  type AnyLongRow,
  isAmountRow,
  LONG_CSV_COLUMNS,
  LONG_HEADS_COLUMNS,
  LONG_WINDOWS,
  type LongRow,
  longCsvText,
  longRowProblems,
  ROUNDED_HEADS_REASON,
} from '@/lib/export/longCsv'
import type { AnyVersion, PlanLine } from '@/plan/types'
import { ctxAs, leakSample, sampleCtx, withDatasets, withReq, withWorker } from '@/testkit/sample'
import { prepare as prepareForecast } from '@/views/forecast/engine/base'
import { bridgeWindow } from '@/views/forecast/engine/bridge'
import { lineFte } from '@/views/forecast/engine/heads'
import { yearEndHeads } from '@/views/forecast/engine/kpis'
import { forecastRunOf } from '@/views/forecast/engine/run'
import { varianceTable } from '@/views/forecast/engine/variance'
import { homeModel } from '@/views/home/engine'
import { planModel } from '@/views/plan/engine'
import { prepare as preparePlan } from '@/views/plan/engine/base'
import {
  comparisonOf,
  costSeatOf,
  managerOfIn,
  placementOf,
  scopeOf,
  shownLines,
} from '@/views/plan/engine/core'
import { costIdsOf, guardFigure, membersOf } from '@/views/plan/engine/guarded'
import { ID as PLAN } from '@/views/plan/metrics'
import { FORECAST_RATES_LINE, longCsvOf, longMetaOf, longPeriodsOf } from './longCsv'

/** The modes and picks the rows are read in (the Leader also as the CEO, company-wide). */
type Case = { label: string; ctx: () => AnalyticsContext }

function ceoId(): string {
  const s = leakSample()
  const root = s.datasets.positions.find((p) => !p.managerPositionId && p.status === 'Filled')
  const w = s.datasets.workers.find((x) => x.positionId === root?.positionId && !x.terminationDate)
  if (!w) throw new Error('The sample has no CEO.')
  return w.employeeId
}

const CASES: Case[] = [
  { label: 'Finance', ctx: () => sampleCtx('finance') },
  { label: 'HR admin', ctx: () => sampleCtx('hr-admin') },
  { label: 'HR admin, pay shown', ctx: () => sampleCtx('hr-admin', { showPay: true }) },
  { label: 'HRBP', ctx: () => sampleCtx('hrbp') },
  { label: 'Leader', ctx: () => sampleCtx('leader') },
  { label: 'Leader as the CEO', ctx: () => ctxAs('leader', ceoId()) },
  { label: 'Manager', ctx: () => sampleCtx('manager') },
]

/** Rounded modes: each org row's cost positions, as the rows name them (department, sub-org or scope). */
function orgIds(ctx: AnalyticsContext): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (k: string, id: string) => {
    const s = out.get(k) ?? new Set<string>()
    s.add(id)
    out.set(k, s)
  }
  const cost = costIdsOf(ctx)
  const scope = ctx.access.scope
  if (scope?.kind === 'tree') {
    const placed = new Set<string>()
    for (const s of scope.subOrgs)
      for (const id of s.positionIds)
        if (cost.has(id)) {
          add(s.label, id)
          placed.add(id)
        }
    for (const id of cost) if (!placed.has(id)) add(ctx.scopeLabel, id)
    return out
  }
  const place = placementOf(ctx)
  for (const id of cost) {
    const r = place.get(id)
    if (r) add(r.department ?? r.businessUnit, id)
  }
  return out
}

const isUnionIn = (ctx: AnalyticsContext) => {
  const ids = orgIds(ctx)
  const managerOf = managerOfIn(ctx)
  return (org: string): boolean => {
    const set = ids.get(org)
    return !!set && isUnionOfAtoms(set, ctx.guard.atoms, managerOf)
  }
}

/** Σ over a period's rows. */
const sumOf = (rows: readonly AnyLongRow[], period: string, f: (r: AnyLongRow) => number | null): number =>
  rows.filter((r) => r.period === period).reduce((a, r) => a + (f(r) ?? 0), 0)

const near = (a: number | null | undefined, b: number | null | undefined, eps = 0.02): boolean =>
  a != null && b != null && Math.abs(a - b) <= eps

describe('the long CSV keeps item 3 in every mode', () => {
  const read = new Map<string, { ctx: AnalyticsContext; rows: readonly AnyLongRow[] }>()
  beforeAll(() => {
    for (const c of CASES) {
      const ctx = c.ctx()
      read.set(c.label, { ctx, rows: longCsvOf(ctx).rows })
    }
  }, 120_000)

  it('finds no break of the rules in any mode (longRowProblems), and reads rows in each', () => {
    for (const c of CASES) {
      const { ctx, rows } = read.get(c.label) as { ctx: AnalyticsContext; rows: readonly AnyLongRow[] }
      expect(rows.length, c.label).toBeGreaterThan(10)
      expect(longRowProblems(rows, { mode: ctx.guard.mode, isUnion: isUnionIn(ctx) }), c.label).toEqual([])
    }
  })

  it('HRBP and Leader: every amount is a QTD, YTD or FY loaded USD amount of a whole union of atoms', () => {
    let amounts = 0
    for (const label of ['HRBP', 'Leader', 'Leader as the CEO']) {
      const { ctx, rows } = read.get(label) as { ctx: AnalyticsContext; rows: readonly AnyLongRow[] }
      expect(ctx.guard.mode).toBe('rounded')
      const union = isUnionIn(ctx)
      const step = ctx.guard.rules.floorUsd
      for (const r of rows) {
        if (!isAmountRow(r)) throw new Error(`${label}: a row with no amount columns`)
        if (r.amountUsd == null) {
          expect(r.suppressed, `${label} ${r.period} ${r.org}`).toBe('Yes')
          expect(r.suppressedReason, `${label} ${r.period} ${r.org}`).not.toBe('')
          if (!(LONG_WINDOWS as readonly string[]).includes(r.period))
            expect(r.suppressedReason).toBe(ROUNDED_HEADS_REASON)
          continue
        }
        amounts++
        const where = `${label} ${r.period} ${r.org}`
        expect((LONG_WINDOWS as readonly string[]).includes(r.period), where).toBe(true)
        expect(r.component, where).toBe('loaded')
        expect(r.costCenter, where).toBe('')
        expect(r.account, where).toBe('')
        expect(r.currency, where).toBe('USD')
        expect(r.amountLocal, where).toBeNull()
        expect(r.rate, where).toBeNull()
        expect(union(r.org), where).toBe(true)
        // The screen's sumRounded value: whole steps.
        expect(Math.abs(r.amountUsd / step - Math.round(r.amountUsd / step)), where).toBeLessThan(1e-9)
      }
    }
    expect(amounts).toBeGreaterThan(10)
  })

  it('Manager: heads and FTE rows only, with no amount key and no rate set, and a file with no amount column', () => {
    const { ctx, rows } = read.get('Manager') as { ctx: AnalyticsContext; rows: readonly AnyLongRow[] }
    const allowed = new Set(LONG_HEADS_COLUMNS.map((c) => c.key))
    for (const r of rows) for (const k of Object.keys(r)) expect(allowed.has(k), k).toBe(true)
    const v = ctx.version as AnyVersion
    const text = longCsvText(rows, longMetaOf(ctx, v), { mode: 'none', totals: longCsvOf(ctx).totals })
    const lines = text.replace(/^﻿/, '').split('\r\n')
    expect(lines).toContain(LONG_HEADS_COLUMNS.map((c) => c.label).join(','))
    expect(text).not.toMatch(/amountUsd|amountLocal|rateSet|\$|\b(USD|EUR|ILS|INR|TWD|CNY|CAD|VND)\b/)
  })

  it('every other mode writes every column, Finance and HR admin with local currencies, and the open file splits components', () => {
    for (const label of ['Finance', 'HR admin', 'HR admin, pay shown']) {
      const { rows } = read.get(label) as { ctx: AnalyticsContext; rows: readonly AnyLongRow[] }
      const amount = rows.filter((r): r is LongRow => isAmountRow(r) && r.amountUsd != null)
      expect(new Set(amount.map((r) => r.currency)).size, label).toBeGreaterThan(3)
      for (const r of amount)
        expect(Object.keys(r).sort(), label).toEqual(LONG_CSV_COLUMNS.map((c) => c.key).sort())
      const comps = new Set(amount.map((r) => r.component))
      if (label === 'HR admin, pay shown') {
        expect([...comps].sort()).toEqual([
          'base',
          'benefits',
          'bonus',
          'burden',
          'equity',
          'oneTime',
          'vacancy',
        ])
        expect(amount.every((r) => r.suppressed === '' && !r.costCenter.startsWith('Other'))).toBe(true)
        expect(
          amount
            .filter((r) => r.component !== 'loaded')
            .every((r) => r.account !== '' || r.component === 'vacancy'),
        ).toBe(true)
      } else {
        // C33 (b): a cost-center cell is never whole units, so it shows loaded cost only, with the guard's reason.
        expect([...comps]).toEqual(['loaded'])
        for (const r of amount) {
          expect(r.account).toBe('')
          expect(r.suppressedReason).toBe('Components show for whole units and the company.')
        }
        // The Other rows are USD only, with no local amount or rate.
        for (const r of amount.filter((x) => x.costCenter.startsWith('Other ('))) {
          expect(r.currency).toBe('USD')
          expect(r.amountLocal).toBeNull()
          expect(r.rate).toBeNull()
        }
      }
    }
  })

  it('a local amount is the same lines as its USD amount: local × rate is the USD amount where a rate shows', () => {
    let checked = 0
    for (const label of ['Finance', 'HR admin', 'HR admin, pay shown']) {
      const { rows } = read.get(label) as { ctx: AnalyticsContext; rows: readonly AnyLongRow[] }
      for (const r of rows) {
        if (!isAmountRow(r) || r.amountUsd == null || r.amountLocal == null) continue
        if (r.currency === 'USD') expect(r.amountLocal, label).toBeCloseTo(r.amountUsd, 4)
        if (r.rate == null) continue
        expect(
          Math.abs(r.amountLocal * r.rate - r.amountUsd),
          `${label} ${r.period} ${r.costCenter}`,
        ).toBeLessThan(0.02)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it("rows partition each period's positions: Σ heads is the scope's plan heads, a cell's heads on its first row only", () => {
    for (const c of CASES) {
      const { ctx, rows } = read.get(c.label) as { ctx: AnalyticsContext; rows: readonly AnyLongRow[] }
      const v = ctx.version as AnyVersion
      const lines = shownLines(ctx, v)
      const ids = scopeOf(ctx).ids
      for (const p of longPeriodsOf(ctx, v)) {
        const last = p.months[p.months.length - 1]
        let heads = 0
        const fteByMonth = new Map<string, number>()
        for (const l of lines) {
          if (!ids.has(l.positionId)) continue
          if (l.month === last) heads += l.heads
          if (p.months.includes(l.month)) fteByMonth.set(l.month, (fteByMonth.get(l.month) ?? 0) + lineFte(l))
        }
        const days = (m: string) => +monthEnd(m).slice(8, 10)
        const fte =
          p.months.reduce((a, m) => a + (fteByMonth.get(m) ?? 0) * days(m), 0) /
          p.months.reduce((a, m) => a + days(m), 0)
        expect(
          sumOf(rows, p.key, (r) => r.heads),
          `${c.label} ${p.key} heads`,
        ).toBeCloseTo(heads, 6)
        expect(
          sumOf(rows, p.key, (r) => r.fte),
          `${c.label} ${p.key} FTE`,
        ).toBeCloseTo(fte, 6)
      }
      const seen = new Set<string>()
      for (const r of rows) {
        const cell = `${r.period}|${r.org}|${r.costCenter}`
        if (seen.has(cell)) expect(r.heads, `${c.label} ${cell}`).toBeNull()
        else expect(r.heads, `${c.label} ${cell}`).not.toBeNull()
        seen.add(cell)
      }
    }
  })

  it("periods: the version's grid, then QTD and YTD ending at the last close, then FY; FY28 has no year to date yet", () => {
    const ctx = sampleCtx('finance')
    const v = ctx.version as AnyVersion
    const keys = longPeriodsOf(ctx, v).map((p) => p.key)
    expect(keys.slice(0, 18)).toEqual(
      ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].concat(
        ['10', '11', '12'].map((m) => `2026-${m}`),
        ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((m) => `2027-${m}`),
      ),
    )
    expect(keys.slice(18)).toEqual(['QTD', 'YTD', 'FY'])
    const by = new Map(longPeriodsOf(ctx, v).map((p) => [p.key, p.months]))
    expect(by.get('QTD')).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(by.get('YTD')).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
    expect(by.get('FY')?.length).toBe(12)
    const fy28 = ctx.versions.find((x) => x.versionId === 'fy28-working') as AnyVersion
    expect(
      longPeriodsOf(ctx, fy28)
        .map((p) => p.key)
        .filter((k) => k.length === 2 || k.length === 3),
    ).toEqual(['FY'])
  })

  it('reads every version and the forecast, each row repeating its facts', () => {
    const ctx = sampleCtx('finance')
    const budget = longCsvOf(ctx, { versionId: 'fy27-budget' })
    expect(budget.rows.length).toBeGreaterThan(100)
    for (const r of budget.rows) {
      expect(r.version).toBe('FY27 Budget')
      expect(r.lockHash).toMatch(/^sha256-[0-9a-f]{64}$/)
      expect(r.asOf).toBe(ctx.asOf)
    }
    const fc = longCsvOf(ctx, { source: 'forecast' })
    for (const r of fc.rows) if (isAmountRow(r)) expect(r.rateSet).toBe(FORECAST_RATES_LINE)
    expect(longCsvOf(ctx, { versionId: 'no-such-version' }).empty).toBe('No version to read.')
  })
})

describe("a 20-person cost center's October hire with a sign-on and relocation (7.2 rule 1, C17)", () => {
  // REQ-4246: an accepted offer on P-2499 in 1320-SJC (San Jose, USD; 21 employees at 30 Sep 2026),
  // moved to start on 19 Oct 2026 with a sign-on and a relocation, so October's one-time cell holds
  // one hire's sign-on plus relocation.
  const SIGN_ON = 20_000
  const RELOCATION = 12_000
  const CC = '1320-SJC'
  let fin: AnalyticsContext
  let open: AnalyticsContext
  beforeAll(() => {
    const s = withReq(leakSample(), 'REQ-4246', {
      startDate: '2026-10-19',
      signOnBonus: SIGN_ON,
      relocation: RELOCATION,
      agencyFee: null,
    })
    fin = sampleCtx('finance', { sample: s })
    open = sampleCtx('hr-admin', { sample: s, showPay: true })
  }, 120_000)

  it('Finance shows October as one loaded row, and no row equals the sign-on plus relocation', () => {
    const rows = longCsvOf(fin).rows.filter(isAmountRow)
    const october = rows.filter((r) => r.period === '2026-10' && r.costCenter === CC)
    expect(october).toHaveLength(1)
    expect(october[0].component).toBe('loaded')
    expect(october[0].account).toBe('')
    expect(october[0].currency).toBe('USD')
    expect(october[0].amountUsd).not.toBeNull()
    expect(october[0].heads ?? 0).toBeGreaterThanOrEqual(20)
    const oneTime = SIGN_ON + RELOCATION
    for (const r of rows) {
      expect(near(r.amountUsd, oneTime, 0.5), `${r.period} ${r.costCenter}`).toBe(false)
      expect(near(r.amountLocal, oneTime, 0.5), `${r.period} ${r.costCenter}`).toBe(false)
    }
    // The control: with pay shown (no guard), the same cell's one-time row holds the hire's sign-on
    // and relocation, so the fixture plants what the Finance file must not show.
    const shown = longCsvOf(open).rows.filter(isAmountRow)
    const cell = shown.find((r) => r.period === '2026-10' && r.costCenter === CC && r.component === 'oneTime')
    expect(cell?.amountUsd ?? 0).toBeGreaterThanOrEqual(oneTime - 0.5)
  })
})

describe('a leave flipped between paid and unpaid (C26, C34)', () => {
  const keys = (rows: readonly AnyLongRow[]) =>
    rows.map((r) =>
      isAmountRow(r)
        ? [
            r.period,
            r.org,
            r.costCenter,
            r.component,
            r.currency,
            r.rate,
            r.suppressed,
            r.suppressedReason,
            r.amountUsd === null,
            r.amountLocal === null,
          ]
        : [r.period, r.org, r.costCenter],
    )

  it('changes no row, currency, rate, flag or reason for anyone on leave, only amounts already shown', () => {
    const s = leakSample()
    const onLeave = s.datasets.workers.filter((w) => w.onLeave === true && w.positionId && !w.terminationDate)
    expect(onLeave.length).toBeGreaterThan(0)
    for (const mode of ['finance', 'hrbp'] as const) {
      const base = longCsvOf(sampleCtx(mode)).rows
      for (const w of onLeave) {
        const flipped = withWorker(s, w.employeeId, { leavePaid: w.leavePaid === false })
        expect(keys(longCsvOf(sampleCtx(mode, { sample: flipped })).rows), `${mode} ${w.employeeId}`).toEqual(
          keys(base),
        )
      }
    }
  }, 120_000)

  it('keeps a cell in two currencies in USD when the only person paid in one goes on unpaid leave', () => {
    // A 1320-SJC holder paid in EUR (the cell's only EUR lines), on leave: paid, then unpaid. Unpaid,
    // their open months cost nothing, which must not make the cell a one-currency row.
    const s = leakSample()
    const w = s.datasets.workers.find(
      (x) =>
        x.workerType === 'Employee' &&
        !x.terminationDate &&
        !x.assignmentEnd &&
        s.datasets.positions.some((p) => p.positionId === x.positionId && p.costCenter === '1320-SJC'),
    )
    if (!w) throw new Error('No 1320-SJC holder.')
    const comp = s.datasets.comp.map((c) => (c.employeeId === w.employeeId ? { ...c, currency: 'EUR' } : c))
    const eur = withDatasets(s, { comp })
    const paid = withWorker(eur, w.employeeId, { onLeave: true, leavePaid: true })
    const unpaid = withWorker(eur, w.employeeId, { onLeave: true, leavePaid: false })
    const a = longCsvOf(sampleCtx('finance', { sample: paid })).rows
    const b = longCsvOf(sampleCtx('finance', { sample: unpaid })).rows
    const cell = a.filter(
      (r): r is LongRow => isAmountRow(r) && r.costCenter === '1320-SJC' && r.period === '2026-12',
    )
    expect(cell).toHaveLength(1)
    expect(cell[0].currency).toBe('USD')
    expect(cell[0].amountLocal).toBeNull()
    expect(keys(b)).toEqual(keys(a))
  }, 120_000)
})

describe('control totals match the screen models in every mode (14.1 item 4)', () => {
  const read = new Map<string, AnalyticsContext>()
  beforeAll(() => {
    for (const c of CASES) read.set(c.label, c.ctx())
  }, 120_000)

  /** The loaded control total of a period (exact: Σ of the rows; rounded: the screen's sumRounded). */
  const loadedOf = (ctx: AnalyticsContext, opts: Parameters<typeof longCsvOf>[1], period: string) =>
    longCsvOf(ctx, opts).totals.find((t) => t.period === period)?.loadedUsd ?? null
  const headsOf = (ctx: AnalyticsContext, opts: Parameters<typeof longCsvOf>[1], period: string) =>
    longCsvOf(ctx, opts).totals.find((t) => t.period === period)?.heads ?? null
  const fteOf = (ctx: AnalyticsContext, opts: Parameters<typeof longCsvOf>[1], period: string) =>
    longCsvOf(ctx, opts).totals.find((t) => t.period === period)?.fte ?? null

  it('Plan Overview: Loaded cost YTD is the YTD loaded total, and the plan heads beside Actual heads its comparison’s', () => {
    let checked = 0
    for (const c of CASES) {
      const ctx = read.get(c.label) as AnalyticsContext
      const p = preparePlan(ctx)
      const kpis = planModel(ctx).overview.kpis
      const cost = kpis.find((k) => k.metricId === PLAN.costLoaded)
      if (ctx.guard.mode === 'none') expect(cost, c.label).toBeUndefined()
      else {
        expect(cost?.value, c.label).not.toBeNull()
        expect(near(cost?.value as number, loadedOf(ctx, {}, 'YTD')), c.label).toBe(true)
        checked++
      }
      const actual = kpis.find((k) => k.metricId === PLAN.headsActual)
      const cmp = comparisonOf(ctx)
      if (actual && cmp && actual.delta != null) {
        const planHeads = (actual.value as number) - actual.delta
        expect(headsOf(ctx, { versionId: cmp.versionId }, p.planMonth), c.label).toBeCloseTo(planHeads, 6)
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(10)
  })

  it('Forecast Variance: the scope’s heads, FTE and cost, actual and comparison, in every window', () => {
    let cells = 0
    for (const c of CASES) {
      const ctx = read.get(c.label) as AnalyticsContext
      const p = prepareForecast(ctx)
      const t = varianceTable(p)
      const cmp = p.comparison
      if (!cmp) continue
      const keyOf = (w: string) => (w === 'qtd' || w === 'ytd' || w === 'fy' ? w.toUpperCase() : w)
      for (const r of t.rows) {
        if (r.orgKey !== 'scope') continue
        const period = keyOf(r.windowKey)
        const sides: [number | null, Parameters<typeof longCsvOf>[1]][] = [
          [r.actual, { source: 'forecast' }],
          [r.comparison, { versionId: cmp.versionId }],
        ]
        for (const [screen, opts] of sides) {
          if (screen == null) continue
          const where = `${c.label} ${r.measure} ${period} ${opts?.source ?? opts?.versionId}`
          if (r.measure === 'heads') expect(headsOf(ctx, opts, period), where).toBeCloseTo(screen, 6)
          else if (r.measure === 'fte') expect(fteOf(ctx, opts, period), where).toBeCloseTo(screen, 5)
          else expect(near(loadedOf(ctx, opts, period), screen), where).toBe(true)
          cells++
        }
      }
    }
    expect(cells).toBeGreaterThan(300)
  })

  it('the bridge: its start is the comparison’s FY loaded total and its end the forecast’s (exact modes)', () => {
    for (const label of ['Finance', 'HR admin', 'HR admin, pay shown']) {
      const ctx = read.get(label) as AnalyticsContext
      const p = prepareForecast(ctx)
      const w = bridgeWindow(p, p.fyMonths)
      const cmp = p.comparison
      expect(w.reason, label).toBeNull()
      expect(near(w.start, loadedOf(ctx, { versionId: cmp?.versionId }, 'FY'), 0.05), label).toBe(true)
      expect(near(w.end, loadedOf(ctx, { source: 'forecast' }, 'FY'), 0.05), label).toBe(true)
    }
  })

  it('the bridge in rounded modes: start and end are whole steps no further from the totals than its kept atoms allow', () => {
    for (const label of ['HRBP', 'Leader']) {
      const ctx = read.get(label) as AnalyticsContext
      const p = prepareForecast(ctx)
      const w = bridgeWindow(p, p.fyMonths)
      const step = ctx.guard.rules.floorUsd
      const start = loadedOf(ctx, { versionId: p.comparison?.versionId }, 'FY') as number
      const end = loadedOf(ctx, { source: 'forecast' }, 'FY') as number
      // The bridge keeps atoms with 5 or more costed people on both sides, so it can only leave
      // atoms out of the one-side totals: never more than the totals, and every value a whole step.
      for (const [v, total] of [
        [w.start, start],
        [w.end, end],
      ] as const) {
        expect(v, label).not.toBeNull()
        expect((v as number) <= total + 1e-6, label).toBe(true)
        expect(Math.abs((v as number) / step - Math.round((v as number) / step))).toBeLessThan(1e-9)
      }
    }
  })

  it('the homes: Unit plan’s plan heads, Rollup’s year-end heads, Plan vs actual’s full-year cost and its comparison', () => {
    const hrbp = read.get('HRBP') as AnalyticsContext
    const unit = homeModel(hrbp)
    const cmp = comparisonOf(hrbp)
    const last = preparePlan(hrbp).lastClose?.month as string
    expect(unit?.hero.comparison?.value).not.toBeNull()
    expect(headsOf(hrbp, { versionId: cmp?.versionId }, last)).toBeCloseTo(
      unit?.hero.comparison?.value as number,
      6,
    )

    for (const label of ['Leader', 'Leader as the CEO']) {
      const leader = read.get(label) as AnalyticsContext
      const rollup = homeModel(leader)
      const p = prepareForecast(leader)
      const fyEnd = p.fyMonths[p.fyMonths.length - 1]
      // The hero counts the leader's own seats beside the scope's (RC-3); the rows hold the scope's.
      const own = yearEndHeads(p).own
      expect((headsOf(leader, { source: 'forecast' }, fyEnd) as number) + own, label).toBeCloseTo(
        rollup?.hero.value as number,
        6,
      )
    }

    const fin = read.get('Finance') as AnalyticsContext
    const home = homeModel(fin)
    expect(near(home?.hero.value as number, loadedOf(fin, { source: 'forecast' }, 'FY'))).toBe(true)
    const budget = comparisonOf(fin)
    expect(
      near(home?.hero.comparison?.value as number, loadedOf(fin, { versionId: budget?.versionId }, 'FY')),
    ).toBe(true)
  })

  it('no control total, or screen total less the shown rows, equals a hidden group of 1 to 4 or a hidden component', () => {
    for (const c of CASES) {
      const ctx = read.get(c.label) as AnalyticsContext
      if (ctx.guard.mode === 'none' || ctx.guard.mode === 'open') continue
      const v = ctx.version as AnyVersion
      const model = longCsvOf(ctx)
      const lines = shownLines(ctx, v)
      const seatOf = costSeatOf(ctx)
      for (const p of model.periods.filter((x) => x.window || x.key === '2026-09' || x.key === '2026-10')) {
        const shown = model.rows.filter(
          (r): r is LongRow => r.period === p.key && isAmountRow(r) && r.amountUsd != null,
        )
        const sum = shown.reduce((a, r) => a + (r.amountUsd as number), 0)
        const members = membersOf(ctx, lines, p.months)
        const screen = guardFigure(ctx, { members, version: v }).total.totalUsd
        const control = model.totals.find((t) => t.period === p.key)?.loadedUsd ?? null
        // What a reader could take away: each hidden group's exact amount (1 to 4 costed people) and
        // each position's one-time amount (sign-ons, relocations, agency fees, severance).
        const hidden: number[] = []
        const byGroup = new Map<string, { people: Set<string>; usd: number }>()
        const oneTime = new Map<string, number>()
        for (const l of lines) {
          if (!p.months.includes(l.month) || !l.positionId) continue
          const seat = seatOf(l.positionId)
          if (!seat) continue
          const k =
            ctx.guard.mode === 'rounded'
              ? (seat.department ?? seat.businessUnit)
              : `${seat.businessUnit}|${seat.costCenter}`
          const g = byGroup.get(k) ?? { people: new Set<string>(), usd: 0 }
          g.usd += l.usd.loaded
          if (l.holderId && l.basis !== 'band' && l.active > 0) g.people.add(l.holderId)
          byGroup.set(k, g)
          if (Math.abs(l.usd.oneTime) >= 0.005)
            oneTime.set(l.positionId, (oneTime.get(l.positionId) ?? 0) + l.usd.oneTime)
        }
        for (const g of byGroup.values()) if (g.people.size >= 1 && g.people.size <= 4) hidden.push(g.usd)
        hidden.push(...oneTime.values())
        const residues = [
          ...(screen != null ? [screen - sum] : []),
          ...(control != null ? [control, control - sum] : []),
        ].filter((x) => Math.abs(x) >= 0.5)
        for (const r of residues)
          for (const h of hidden) expect(near(r, h, 0.5), `${c.label} ${p.key}: ${r} equals ${h}`).toBe(false)
        // Exact modes: the shown rows are the screen's total, so nothing is left to difference out.
        if (ctx.guard.mode === 'exact' && screen != null)
          expect(near(screen, sum, 0.05), `${c.label} ${p.key}`).toBe(true)
      }
    }
  })

  it('a hidden cell reads "—" with its reason, never 0 (Finance under a country filter: heads only)', () => {
    const ctx = sampleCtx('finance', { filters: { country: ['Taiwan'] } })
    const m = longCsvOf(ctx)
    expect(m.rows.length).toBeGreaterThan(0)
    for (const r of m.rows) {
      if (!isAmountRow(r)) throw new Error('Finance rows carry amount columns')
      expect(r.amountUsd).toBeNull()
      expect(r.amountLocal).toBeNull()
      expect(r.suppressed).toBe('Yes')
      expect(r.suppressedReason).not.toBe('')
      expect(r.suppressedReason).not.toBe(hiddenNote(5))
    }
    // Heads still narrow to the filter.
    const all = longCsvOf(sampleCtx('finance'))
    expect(m.totals[0].heads).toBeLessThan(all.totals[0].heads)
  })

  it('the forecast source reads the Working forecast’s lines, whose seats are the scope’s', () => {
    const ctx = read.get('Finance') as AnalyticsContext
    const run = forecastRunOf(ctx, ctx.version)
    expect(run).not.toBeNull()
    const lines = (run?.lines ?? []) as readonly PlanLine[]
    const ids = scopeOf(ctx).ids
    const fyEnd = prepareForecast(ctx).fyMonths.at(-1)
    const heads = lines
      .filter((l) => l.month === fyEnd && ids.has(l.positionId))
      .reduce((a, l) => a + l.heads, 0)
    expect(headsOf(ctx, { source: 'forecast' }, fyEnd as string)).toBeCloseTo(heads, 6)
  })
})

describe('GL accounts fall back from the department to the unit to the company (5.2, review SA-7)', () => {
  it('reads an org and a department row for the open file’s component rows, the company’s elsewhere', () => {
    const s = leakSample()
    const base = s.datasets.assumptions.find(
      (r) =>
        r.table === 'glAccount' && r.version === 'fy27-working' && r.key === 'base' && !(r.org ?? '').trim(),
    )
    if (!base) throw new Error('The sample has no company GL account for base.')
    const plain = sampleCtx('hr-admin', { showPay: true })
    const seatOf = costSeatOf(plain)
    // Each Silicon Engineering cost center's department (a cost center nests in one).
    const deptOf = new Map<string, string | null>()
    for (const id of placementOf(plain).keys()) {
      const seat = seatOf(id)
      if (seat?.businessUnit !== 'Silicon Engineering') continue
      const known = deptOf.get(seat.costCenter)
      deptOf.set(seat.costCenter, known === undefined || known === seat.department ? seat.department : null)
    }
    const dept = [...deptOf.values()].find((d): d is string => !!d)
    if (!dept) throw new Error('Silicon Engineering has no department.')
    const over = withDatasets(s, {
      assumptions: [
        ...s.datasets.assumptions,
        { ...base, org: 'Silicon Engineering', value: 999_999 },
        { ...base, org: dept, value: 888_888 },
      ],
    })
    const rows = longCsvOf(sampleCtx('hr-admin', { sample: over, showPay: true })).rows.filter(isAmountRow)
    const seen = { dept: 0, unit: 0, company: 0, bonus: 0 }
    for (const r of rows) {
      if (r.component === 'bonus' && r.org === 'Silicon Engineering') {
        // A component no override names keeps the company's account.
        expect(r.account, `${r.period} ${r.costCenter} bonus`).toBe('6110')
        seen.bonus++
      }
      if (r.component !== 'base') continue
      if (r.org !== 'Silicon Engineering') {
        expect(r.account, `${r.org} ${r.costCenter}`).toBe('6100')
        seen.company++
      } else if (deptOf.get(r.costCenter) === dept) {
        expect(r.account, `${r.period} ${r.costCenter}`).toBe('888888')
        seen.dept++
      } else {
        expect(r.account, `${r.period} ${r.costCenter}`).toBe('999999')
        seen.unit++
      }
    }
    // Non-vacuity: every level was read.
    expect(seen.dept).toBeGreaterThan(0)
    expect(seen.unit).toBeGreaterThan(0)
    expect(seen.company).toBeGreaterThan(0)
    expect(seen.bonus).toBeGreaterThan(0)
  }, 120_000)
})
