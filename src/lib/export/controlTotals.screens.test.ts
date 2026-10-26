/**
 * Control totals against the screen model (docs/PLAN.md 14.1 item 4), for every home, Plan >
 * Overview, Forecast > Variance and the Bridge in every mode (HR admin with and without Show pay
 * amounts): the long rows a screen's own partition rows give (an org per row, heads at the window's
 * last month-end, FTE averaged over it, loaded cost; Forecast > Variance's measures, as the long CSV
 * reads them) make control totals equal to the screen's totals, period by period. In HRBP and Leader
 * mode the loaded total is the screen's rounded total (`sumRounded`), never a sum of the rounded rows,
 * and is stated only at QTD, YTD and full year; in Manager mode there is none.
 *
 * And no control total, or screen total minus the shown rows, equals a hidden group of 1 to 4: in the
 * rounded modes what the shown rows leave over is a whole number of $0.1M steps (what `sumRounded`
 * adds), so it holds no one's exact amount; in Finance and HR admin with the switch off the units
 * add up to the scope to the cent, and a unit minus its departments is its one Other, which holds 0 or
 * 5 or more costed people by the departments' own notes. The long CSV's own rows come from the guarded
 * model (src/views/finance/engine/longCsv.ts) and are matched in finance-export's tests; these check
 * the totals arithmetic against what the screens show.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { MODES } from '@/access/modes'
import type { GuardMode } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import type { Mode } from '@/data/schema'
import { COST_STEP } from '@/lib/costRounding'
import { sampleCtx } from '@/testkit/sample'
import { forecastModel, type VarianceRow } from '@/views/forecast/engine'
import { homeModel } from '@/views/home/engine'
import { planModel } from '@/views/plan/engine'
import { prepare } from '@/views/plan/engine/base'
import { planCost } from '@/views/plan/engine/cost'
import { teamModel } from '@/views/team/engine'
import { type ControlTotal, controlTotals } from './controlTotals'
import { type AnyLongRow, LONG_WINDOWS, type LongRow, longRowProblems, ROUNDED_HEADS_REASON } from './longCsv'

const FACTS = {
  version: 'FY27 Working',
  lockHash: 'Working, not locked',
  asOf: '2026-09-30',
  proration: 'Daily',
}
const WINDOW_PERIOD: Readonly<Record<string, string>> = { qtd: 'QTD', ytd: 'YTD', fy: 'FY' }
/** A variance window's key as a long CSV period: 'QTD', 'YTD', 'FY' or the month. */
const periodOf = (windowKey: string): string => WINDOW_PERIOD[windowKey] ?? windowKey
const isWindow = (period: string): boolean => (LONG_WINDOWS as readonly string[]).includes(period)

/** One org of a screen's partition in one period. */
interface Part {
  org: string
  heads: number | null
  fte: number | null
  usd: number | null
  reason?: string | null
}

/** The long rows a screen's partition rows give for one period, as the mode's long CSV writes them. */
function longRows(mode: GuardMode, period: string, parts: readonly Part[]): AnyLongRow[] {
  return parts.map((p) => {
    const base = { ...FACTS, period, org: p.org, costCenter: '', heads: p.heads, fte: p.fte }
    if (mode === 'none') return base
    // Rounded modes carry amounts at QTD, YTD and full year only.
    const shows = mode !== 'rounded' || isWindow(period)
    const usd = shows ? p.usd : null
    const row: LongRow = {
      ...base,
      account: '',
      component: 'loaded',
      currency: 'USD',
      amountLocal: null,
      rate: null,
      amountUsd: usd,
      suppressed: usd === null ? 'Yes' : '',
      suppressedReason: usd === null ? (shows ? (p.reason ?? 'Hidden') : ROUNDED_HEADS_REASON) : '',
      rateSet: '',
    }
    return row
  })
}

/** One period's control totals from a screen's partition, the screen's own scope total handed in. */
function totalsOf(
  mode: GuardMode,
  period: string,
  parts: readonly Part[],
  screenLoaded: number | null,
): ControlTotal {
  const rows = longRows(mode, period, parts)
  const [t] = controlTotals({ rows, mode, roundedLoaded: new Map([[period, screenLoaded]]) })
  return t
}

/* ───────────── Forecast > Variance as partitions ───────────── */

interface Window {
  period: string
  scope: Part
  /** The orgs of one level, each with its heads, FTE and cost in the window. */
  levels: Map<VarianceRow['level'], Part[]>
}

/** The variance table read as one partition per level and window (the scope row apart). */
function varianceWindows(rows: readonly (VarianceRow & { windowKey: string })[]): Window[] {
  const out = new Map<string, Window>()
  const orgs = new Map<string, Part>()
  for (const r of rows) {
    const period = periodOf(r.windowKey)
    let w = out.get(period)
    if (!w) {
      w = { period, scope: { org: '', heads: null, fte: null, usd: null }, levels: new Map() }
      out.set(period, w)
    }
    const key = `${period}|${r.orgKey}`
    let part = orgs.get(key)
    if (!part) {
      part = { org: r.org, heads: null, fte: null, usd: null }
      orgs.set(key, part)
      if (r.level === 'company') w.scope = part
      else w.levels.set(r.level, [...(w.levels.get(r.level) ?? []), part])
    }
    if (r.measure === 'heads') part.heads = r.actual
    else if (r.measure === 'fte') part.fte = r.actual
    else {
      part.usd = r.actual
      part.reason = r.reason
    }
  }
  return [...out.values()]
}

/** The comparison side of the same table (the bridge's start). */
function comparisonWindows(rows: readonly (VarianceRow & { windowKey: string })[]): Window[] {
  return varianceWindows(rows.map((r) => ({ ...r, actual: r.comparison })))
}

const sum = (xs: readonly (number | null)[]): number => xs.reduce<number>((s, x) => s + (x ?? 0), 0)

/* ───────────── the modes ───────────── */

interface Case {
  name: string
  mode: Mode
  showPay: boolean
}
const CASES: Case[] = [
  ...MODES.map((mode) => ({ name: mode, mode, showPay: false })),
  { name: 'hr-admin with pay amounts shown', mode: 'hr-admin', showPay: true },
]

describe.each(CASES)('control totals against the screens in $name', ({ mode, showPay }) => {
  let ctx: AnalyticsContext
  let guard: GuardMode
  let windows: Window[]
  let rows: (VarianceRow & { windowKey: string })[]
  beforeAll(() => {
    ctx = sampleCtx(mode, { showPay })
    guard = ctx.guard.mode
    rows = forecastModel(ctx).variance.rows.rows as (VarianceRow & { windowKey: string })[]
    windows = varianceWindows(rows)
  }, 120_000)

  /** The FY or YTD control totals of the variance's unit partition. */
  const unitTotals = (period: string, side: Window[] = windows): ControlTotal => {
    const w = side.find((x) => x.period === period)
    if (!w) throw new Error(`No ${period} window`)
    return totalsOf(guard, period, w.levels.get('unit') ?? [], w.scope.usd)
  }

  it('Forecast > Variance: every window of the unit rows gives the scope row', () => {
    expect(windows.length).toBeGreaterThanOrEqual(15)
    for (const w of windows) {
      const units = w.levels.get('unit') ?? []
      expect(units.length, w.period).toBeGreaterThan(0)
      const t = totalsOf(guard, w.period, units, w.scope.usd)
      expect(t.heads, `${w.period} heads`).toBeCloseTo(w.scope.heads ?? 0, 6)
      expect(t.fte, `${w.period} FTE`).toBeCloseTo(w.scope.fte ?? 0, 6)
      if (guard === 'none') {
        expect(t.loadedUsd, w.period).toBeNull()
        expect(t.usdByComponent, w.period).toBeNull()
        expect(w.scope.usd, w.period).toBeNull()
      } else if (guard === 'rounded') {
        // The screen's rounded total at QTD, YTD and FY; nothing at a month.
        expect(t.loadedUsd, w.period).toBe(isWindow(w.period) ? w.scope.usd : null)
        expect(t.usdByComponent, w.period).toBeNull()
        const shown = new Set(units.filter((u) => u.usd !== null).map((u) => u.org))
        const problems = longRowProblems(longRows(guard, w.period, units), {
          mode: 'rounded',
          isUnion: (org) => shown.has(org),
        })
        expect(problems, w.period).toEqual([])
      } else {
        // Exact: the units add up to the scope, to the cent.
        expect(
          units.every((u) => u.usd !== null),
          w.period,
        ).toBe(true)
        expect(t.loadedUsd ?? Number.NaN, w.period).toBeCloseTo(w.scope.usd ?? Number.NaN, 2)
      }
    }
  })

  it('the Bridge: the full-year control totals open and close it', () => {
    const steps = forecastModel(ctx).bridge.steps
    if (guard === 'none') {
      expect(steps.rows).toEqual([])
      expect(unitTotals('FY').loadedUsd).toBeNull()
      return
    }
    const start = steps.rows.find((r) => r.kind === 'start')?.value ?? null
    const end = steps.rows.find((r) => r.kind === 'end')?.value ?? null
    const moves = sum(steps.rows.filter((r) => r.kind !== 'start' && r.kind !== 'end').map((r) => r.value))
    const fy = unitTotals('FY')
    const fyComparison = unitTotals('FY', comparisonWindows(rows))
    expect(start).not.toBeNull()
    expect(end).not.toBeNull()
    expect(fy.loadedUsd ?? Number.NaN).toBeCloseTo(end ?? Number.NaN, 2)
    expect(fyComparison.loadedUsd ?? Number.NaN).toBeCloseTo(start ?? Number.NaN, 2)
    expect((start ?? 0) + moves).toBeCloseTo(end ?? 0, 2)
  })

  it('Plan > Overview: its unit rows give the strip and the cost breakdown', () => {
    const plan = planModel(ctx).overview
    const tile = (id: string) => plan.kpis.find((k) => k.id === id)
    const units = plan.headsByUnit.rows
    const heads = totalsOf(
      guard,
      'FY',
      units.map((u) => ({ org: u.label, heads: u.approved, fte: null, usd: null })),
      null,
    )
    expect(heads.heads).toBe(tile('approved')?.value)
    expect(sum(units.map((u) => u.actual))).toBe(tile('actual')?.value)

    const byUnit = planCost(prepare(ctx)).byUnit
    const costRows = plan.costByUnit.rows
    const total = byUnit?.total.totalUsd ?? null
    const t = totalsOf(
      guard,
      'FY',
      costRows.map((r) => ({ org: r.label, heads: null, fte: null, usd: r.totalUsd, reason: r.reason })),
      total,
    )
    const ytd = tile('cost-ytd')
    if (guard === 'none') {
      expect(t.loadedUsd).toBeNull()
      expect(ytd).toBeUndefined()
      return
    }
    expect(total).not.toBeNull()
    if (guard === 'rounded') {
      expect(t.loadedUsd).toBe(total)
      expect(ytd?.value).toBe(unitTotals('YTD').loadedUsd)
    } else {
      // Exact: the rows, Other included, add up to the breakdown's total.
      expect(t.loadedUsd ?? Number.NaN).toBeCloseTo(total ?? Number.NaN, 2)
      expect(ytd?.value ?? Number.NaN).toBeCloseTo(unitTotals('YTD').loadedUsd ?? Number.NaN, 2)
    }
  })

  it("the mode's home: its hero and key figures are the control totals", () => {
    const fy = unitTotals('FY')
    const home = homeModel(ctx)
    const tile = (id: string) => home?.kpis.find((k) => k.id === id)?.value
    switch (mode) {
      case 'manager': {
        // My team: heads and FTE only; its allocation and filled seats are the plan's unit rows.
        expect(home).toBeNull()
        const team = teamModel(ctx)
        const units = planModel(ctx).overview.headsByUnit.rows
        const t = totalsOf(
          guard,
          'FY',
          units.map((u) => ({ org: u.label, heads: u.approved, fte: null, usd: null })),
          null,
        )
        expect(team.kpis.find((k) => k.id === 'team-allocation')?.value).toBe(t.heads)
        expect(team.kpis.find((k) => k.id === 'team-filled')?.value).toBe(sum(units.map((u) => u.actual)))
        expect(t.loadedUsd).toBeNull()
        break
      }
      case 'hrbp': {
        // Unit plan: actual heads at the last closed month-end are the year to date's.
        expect(home?.slug).toBe('unit')
        expect(home?.hero.value).toBe(unitTotals('YTD').heads)
        expect(tile('year-end-heads')).toBeCloseTo(fy.heads, 6)
        expect(tile('cost-full-year')).toBe(fy.loadedUsd)
        break
      }
      case 'leader': {
        expect(home?.slug).toBe('rollup')
        expect(tile('cost-vs-target')).toBe(fy.loadedUsd)
        // The year-end heads hero also counts the leader's own seats (review RC-3): at most one head
        // per root seat over the org's full-year heads.
        const scope = ctx.access.scope
        const roots = scope?.kind === 'tree' ? scope.rootPositionIds.size : 0
        const over = (home?.hero.value ?? 0) - fy.heads
        expect(over).toBeGreaterThanOrEqual(-1e-9)
        expect(over).toBeLessThanOrEqual(roots + 1e-9)
        break
      }
      case 'finance': {
        expect(home?.slug).toBe('fin')
        if (home?.slug !== 'fin') return
        expect(home.hero.value ?? Number.NaN).toBeCloseTo(fy.loadedUsd ?? Number.NaN, 2)
        // My list and cost by unit: the units' full-year cost, adding up to the same total.
        expect(sum(home.costByUnit.rows.map((r) => r.actual))).toBeCloseTo(fy.loadedUsd ?? Number.NaN, 2)
        expect(sum(home.list.rows.map((r) => r.actual))).toBeCloseTo(fy.loadedUsd ?? Number.NaN, 2)
        const end = home.bridge.rows.find((r) => r.kind === 'end')?.value ?? null
        expect(end ?? Number.NaN).toBeCloseTo(fy.loadedUsd ?? Number.NaN, 2)
        break
      }
      case 'hr-admin':
        // HR admin opens on the Data room: there is no role home to match.
        expect(home).toBeNull()
        break
    }
  })

  it('leaves no hidden group of 1 to 4 in a control total or in a screen total minus its shown rows', () => {
    if (guard === 'none') {
      for (const w of windows)
        expect(totalsOf(guard, w.period, w.levels.get('unit') ?? [], null).loadedUsd).toBeNull()
      return
    }
    if (guard === 'rounded') {
      // What the shown rows leave over is whole $0.1M steps: no one's exact amount.
      let residues = 0
      for (const w of windows) {
        if (!isWindow(w.period) || w.scope.usd === null) continue
        for (const [level, parts] of w.levels) {
          const shown = parts.filter((p) => p.usd !== null)
          if (!shown.length) continue
          const residue = w.scope.usd - sum(shown.map((p) => p.usd))
          expect(Math.abs(residue % COST_STEP), `${w.period} ${level}`).toBe(0)
          if (residue !== 0) residues++
          // The totals state the screen's total whatever the rows add up to, and no component.
          const t = totalsOf(guard, w.period, parts, w.scope.usd)
          expect(t.loadedUsd, `${w.period} ${level}`).toBe(w.scope.usd)
          expect(t.usdByComponent).toBeNull()
        }
      }
      const byUnit = planCost(prepare(ctx)).byUnit
      const left =
        (byUnit?.total.totalUsd ?? 0) - sum(planModel(ctx).overview.costByUnit.rows.map((r) => r.totalUsd))
      expect(Math.abs(left % COST_STEP)).toBe(0)
      // Not vacuous: some shown rows leave a step over, and the totals still state the screen's total.
      expect(residues).toBeGreaterThan(0)
      return
    }
    // Exact modes: the units add up to the scope, and a unit minus its departments is its Other.
    const unitOf = new Map<string, Set<string>>()
    for (const p of ctx.data.positions)
      if (p.department) unitOf.set(p.department, (unitOf.get(p.department) ?? new Set()).add(p.businessUnit))
    let checked = 0
    let others = 0
    for (const w of windows) {
      const units = w.levels.get('unit') ?? []
      expect(sum(units.map((u) => u.usd))).toBeCloseTo(w.scope.usd ?? Number.NaN, 2)
      const departments = w.levels.get('department') ?? []
      for (const u of units) {
        const inUnit = departments.filter((d) => {
          const set = unitOf.get(d.org)
          return set?.size === 1 && set.has(u.org)
        })
        if (!inUnit.length) continue
        const people = sum(inUnit.map((d) => leftOut(d.reason)))
        const residue = (u.usd ?? 0) - sum(inUnit.map((d) => d.usd))
        checked++
        if (people > 0) others++
        if (guard === 'open') {
          // Show pay amounts on: no folds, so the departments add up to their unit.
          expect(people, `${w.period} ${u.org}`).toBe(0)
          expect(residue, `${w.period} ${u.org}`).toBeCloseTo(0, 2)
        } else {
          // The unit's one Other: 0 or 5 or more costed people.
          expect(people === 0 || people >= 5, `${w.period} ${u.org}: ${people} people`).toBe(true)
          if (people === 0) expect(residue, `${w.period} ${u.org}`).toBeCloseTo(0, 2)
          else expect(residue, `${w.period} ${u.org}`).toBeGreaterThan(0)
        }
      }
    }
    // Not vacuous: QTD, YTD and FY list departments, and with the switch off some unit has an Other.
    const withDepartments = windows.filter((w) => w.levels.has('department')).length
    expect(withDepartments).toBeGreaterThanOrEqual(3)
    expect(checked).toBeGreaterThanOrEqual(withDepartments * 5)
    if (guard === 'exact') expect(others).toBeGreaterThan(0)
  })
})

/** "9 people in cost centers under 5 are left out" → 9; 0 when the note is not there. */
function leftOut(reason: string | null | undefined): number {
  const m = /(\d[\d,]*) (?:people|person) in cost centers under 5 (?:are|is) left out/.exec(reason ?? '')
  return m ? Number(m[1].replace(/,/g, '')) : 0
}
