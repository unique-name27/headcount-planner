/**
 * Plan > Recruiting summary's model on the sample (docs/PLAN.md 9.8, change C38): per mode (Managers
 * A, B and C, HRBP, Leader, Finance, HR admin with "Show pay amounts" off and on, and the edge cases:
 * FY28 shown, a year that is over, no Working forecast, no closed month), the seven tiles in
 * `RECRUITING_KPIS` order with their metric ids; every number Plan > Hiring's for the same context
 * and each card the card Plan > Hiring opens; projected starts recomputed from the forecast run's
 * expected starts and modeled backfills over the months E reads; projected heads H + S + M +
 * projected starts − E at every month end and quarter end; the months ahead adding up to the quarter
 * table and the tiles; every counted cell's records holding its number and every card's last step its
 * value; every drill hiding `HIRING_DRILL_HIDE` and Manager mode listing no worker and nothing at or
 * above the manager's seat; no amount, band or leave fact anywhere the tab reaches (cards, records,
 * rows and CSV); where hiring happened as Plan > Hiring's top 5 sub-totals; the one slide's numbers
 * the tiles as shown; the model cached per context; Manager C's model the same with and without the
 * confidential Elimination on C's own seat; and no salary, offer amount or leave change moving
 * anything. The build review's fixes have their own cases in ./recruitingReview.test.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { HIRING_DRILL_HIDE, HIRING_DRILL_KINDS, type HiringDrillKind, RECRUITING_KPI_IDS } from '@/access/ids'
import type { Column } from '@/charts/types'
import { kpiValueText } from '@/components/kpiModel'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf, monthEnd, monthKey, shiftMonth } from '@/data/fiscal'
import type { ISODate, Mode, Month, PositionRow } from '@/data/schema'
import { type CalcSpec, calcProblems, resolveCalc, sameResult, weightSum } from '@/drill/calc'
import { buildDrillTable } from '@/drill/records'
import { type DrillSource, type DrillSpec, resolveDrill } from '@/drill/types'
import { moneyOpts } from '@/lib/export/columns'
import { csvField, toCsv } from '@/lib/export/csv'
import { fromRow } from '@/plan/engine/requests'
import { workingOf } from '@/plan/engine/versions'
import { amountsIn, cellsOf, isAmountKey } from '@/testkit/leaks'
import { withoutRequest, withPlan, withReq, withSalaryDelta, withWorker } from '@/testkit/sample'
import { forecastFlows } from '@/views/forecast/engine/heads'
import type { FigureData } from '../../types'
import { ID } from '../metrics'
import { type CtxOptions, sample, sampleCtx } from './fixtures'
import { hiringForecast, hiringPrepOf } from './hiringData'
import { hiringBuiltOf } from './hiringModel'
import { type HiringQuarterRow, type PlanHiring, planHiringModel, QUARTER_KEYS } from './hiringTab'
import {
  FUTURE_STARTS_NOTE,
  gapText,
  NO_FORECAST_NOTE,
  type PlanRecruiting,
  PROJECTED_STARTS_NOTE,
  planRecruitingModel,
  RECRUITING_KPIS,
  type RecruitingMonthRow,
  WHERE_TOP,
} from './recruitingTab'
import { expectPlainCopy, wordsOf } from './testing'

beforeAll(() => {
  sample()
}, 60_000)

/* ───────────── what the tab reaches ───────────── */

interface Reached {
  drills: { where: string; spec: DrillSpec; value: number | null }[]
  cards: { where: string; spec: CalcSpec; value: number | null }[]
}

const FIGURES = (m: PlanRecruiting) => [m.months, m.quarters, m.where] as const

function reach(m: PlanRecruiting): Reached {
  const out: Reached = { drills: [], cards: [] }
  const addDrill = (where: string, src: DrillSource, value: number | null = null) => {
    const spec = resolveDrill(src)
    if (spec) out.drills.push({ where, spec, value })
  }
  const addCard = (where: string, src: unknown, value: number | null | undefined) => {
    const spec = resolveCalc(src as never)
    if (!spec) return
    out.cards.push({ where, spec, value: value === undefined ? spec.value : value })
    addDrill(`${where} rows`, spec.rows)
  }
  for (const k of m.kpis) {
    addDrill(`tile ${k.id}`, k.drill, k.value)
    addDrill(`tile ${k.id} note`, k.noteDrill)
    addCard(`tile ${k.id}`, k.calc, k.value)
  }
  for (const fig of FIGURES(m)) {
    const cols = fig.columns as readonly Column[]
    for (const r of fig.rows as readonly Record<string, unknown>[])
      for (const c of cols) {
        const v = r[c.key]
        const value = typeof v === 'number' ? v : null
        const where = `${fig.id} ${String(r.key ?? r.month)} ${c.key}`
        if (c.drill) addDrill(where, c.drill(r) as DrillSource, value)
        if (c.calc) addCard(where, c.calc(r), value)
      }
  }
  return out
}

/** Every string a reader meets in the model, its records (visible columns) and its cards. */
function textsOf(ctx: AnalyticsContext, m: PlanRecruiting, r: Reached = reach(m)): string[] {
  const out: string[] = []
  const walk = (v: unknown, depth = 0) => {
    if (depth > 8 || v == null) return
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) for (const x of v) walk(x, depth + 1)
    else if (typeof v === 'object') for (const x of Object.values(v)) walk(x, depth + 1)
  }
  // The slide's values are the tiles' counts as the strip writes them ("1,610"): the heads-only test
  // holds each to its tile, whose format is a count; their labels and notes are read here.
  walk({ ...m, deckNumbers: m.deckNumbers.map((n) => ({ label: n.label, note: n.note })) })
  for (const c of r.cards) walk({ ...c.spec, rows: undefined })
  for (const d of r.drills) {
    const t = buildDrillTable(d.spec, ctx)
    walk([d.spec.title, d.spec.subtitle, d.spec.note, t.columns.map((c) => c.label)])
    for (const row of t.rows) for (const c of t.columns) walk(row[c.key])
  }
  return out
}

/** Every key a reader meets in the model and its records' visible columns. */
function keysOf(ctx: AnalyticsContext, m: PlanRecruiting, r: Reached = reach(m)): string[] {
  const out = new Set<string>()
  const walk = (v: unknown, depth = 0) => {
    if (depth > 8 || v == null || typeof v !== 'object') return
    if (Array.isArray(v)) for (const x of v) walk(x, depth + 1)
    else
      for (const [k, x] of Object.entries(v)) {
        out.add(k)
        walk(x, depth + 1)
      }
  }
  walk(m)
  for (const c of r.cards) walk({ ...c.spec, rows: undefined })
  for (const d of r.drills) for (const c of buildDrillTable(d.spec, ctx).columns) out.add(c.key)
  return [...out]
}

/** A drill as a reader meets it: its kind, words, hidden keys, visible cells and weights. */
function drillSig(ctx: AnalyticsContext, d: DrillSpec | null, opts: { title?: boolean } = {}) {
  if (!d) return null
  const t = buildDrillTable(d, ctx)
  const w = d.weight as ((row: unknown) => number) | undefined
  return {
    kind: d.kind,
    title: opts.title === false ? null : d.title,
    subtitle: d.subtitle ?? null,
    note: d.note ?? null,
    hide: d.hide ?? [],
    columns: t.columns.map((c) => c.key),
    rows: t.rows.map((row) => t.columns.map((c) => row[c.key])),
    weights: w ? (d.rows as readonly unknown[]).map((row) => w(row)) : null,
  }
}

/** A card as a reader meets it, its records included (the title left out when asked). */
function cardSig(ctx: AnalyticsContext, src: unknown, opts: { title?: boolean } = {}): string | null {
  const spec = resolveCalc(src as never)
  if (!spec) return null
  return JSON.stringify({
    ...spec,
    title: opts.title === false ? null : spec.title,
    rows: drillSig(ctx, resolveDrill(spec.rows as DrillSource), opts),
  })
}

/** A stable text of everything the tab reaches: the model, its cards and its records. */
function signature(ctx: AnalyticsContext, m: PlanRecruiting): string {
  const r = reach(m)
  return JSON.stringify({
    m,
    cards: r.cards.map((c) => [c.where, { ...c.spec, rows: undefined }]),
    drills: r.drills.map((d) => [d.where, drillSig(ctx, d.spec)]),
  })
}

/* ───────────── the cases ───────────── */

const MODES: readonly Mode[] = ['manager', 'hrbp', 'leader', 'finance', 'hr-admin']
const CASES: readonly { name: string; mode: Mode; opts: CtxOptions }[] = [
  ...MODES.map((mode) => ({ name: mode === 'manager' ? 'manager A' : mode, mode, opts: {} })),
  { name: 'manager B', mode: 'manager', opts: { persona: 'manager-b' } },
  { name: 'manager C', mode: 'manager', opts: { persona: 'manager-c' } },
  { name: 'hr-admin with pay amounts', mode: 'hr-admin', opts: { showPay: true } },
  {
    name: 'hr-admin, Silicon Engineering',
    mode: 'hr-admin',
    opts: { filters: { businessUnit: ['Silicon Engineering'] } },
  },
  { name: 'leader CFO', mode: 'leader', opts: { persona: 'leader-cfo' } },
  // A mid-month as-of date (HR admin's override): October's month-end is still ahead.
  { name: 'hr-admin on 15 Oct 2026', mode: 'hr-admin', opts: { asOf: '2026-10-15' } },
]

/** The sample with FY27 Working retired: FY27 has no Working forecast. */
const noWorking = () => {
  const s = sample()
  return withPlan(s, {
    versions: s.plan.versions.map((v) =>
      v.versionId === 'fy27-working' ? ({ ...v, state: 'retired' } as typeof v) : v,
    ),
  })
}
const noClose = () => withPlan(sample(), { closes: [] })

interface Case {
  name: string
  ctx: () => AnalyticsContext
}

const EDGES: readonly Case[] = [
  { name: 'FY28 shown, HR admin', ctx: () => sampleCtx('hr-admin', { version: 'fy28-working' }) },
  { name: 'FY28 shown, HRBP', ctx: () => sampleCtx('hrbp', { version: 'fy28-working' }) },
  { name: 'FY28 shown, manager A', ctx: () => sampleCtx('manager', { version: 'fy28-working' }) },
  {
    name: 'FY27 over at 15 Apr 2027',
    ctx: () => sampleCtx('hr-admin', { asOf: '2027-04-15', version: 'fy27-working' }),
  },
  { name: 'no Working forecast, HR admin', ctx: () => sampleCtx('hr-admin', { sample: noWorking() }) },
  { name: 'no Working forecast, manager A', ctx: () => sampleCtx('manager', { sample: noWorking() }) },
  { name: 'no closed month, HR admin', ctx: () => sampleCtx('hr-admin', { sample: noClose() }) },
  { name: 'no closed month, HRBP', ctx: () => sampleCtx('hrbp', { sample: noClose() }) },
]

const ALL: readonly Case[] = [
  ...CASES.map((c) => ({ name: c.name, ctx: () => sampleCtx(c.mode, c.opts) })),
  ...EDGES,
]
const each = (cases: readonly Case[]) => cases.map((c) => [c.name, c] as const)

const tile = (m: { kpis: readonly Kpi[] }, id: string) => m.kpis.find((k) => k.id === id)
const hrow = (m: PlanHiring, key: string) => m.quarters.rows.find((r) => r.key === key) as HiringQuarterRow
const col = <R>(fig: { columns: readonly Column<R>[] }, key: string) =>
  fig.columns.find((c) => c.key === key) as Column<R>
const drillOf = <R>(fig: { columns: readonly Column<R>[] }, key: string, r: R): DrillSpec | null =>
  resolveDrill(col(fig, key)?.drill?.(r) as DrillSource)
const calcOf = <R>(fig: { columns: readonly Column<R>[] }, key: string, r: R): unknown =>
  col(fig, key)?.calc?.(r)
const close = (a: number | null | undefined, b: number | null | undefined, where: string) => {
  if (a == null || b == null) expect(a ?? null, where).toBe(b ?? null)
  else expect(Math.abs(a - b), `${where}: ${a} for ${b}`).toBeLessThan(1e-9)
}

/* ───────────── independent readings ───────────── */

/**
 * Projected starts by month, recomputed from the forecast runs Plan > Hiring reads (Manager mode: the
 * tree's own cohort): each expected start on an Open or Planned seat in scope at its probability, in
 * its month or, when the run dates it in its last actual month or before, its first projected month
 * (where the run counts its heads from), plus the run's modeled backfills; over the months E reads
 * (the input's forecast months whose month-end is after the as-of date), each from the run that month
 * comes from (a later year shown: the as-of year's Working before the shown grid). Null with no
 * Working forecast. The sample has no move in, so no seat is left out for one.
 */
function projectedByMonth(ctx: AnalyticsContext): Map<Month, number> | null {
  const h = hiringPrepOf(ctx)
  const ids = h.p.scope.ids
  const shown = hiringForecast(ctx, ids)
  if (!shown.run) return null
  const asOfYear = fiscalYearOf(ctx.asOf)
  const v = shown.run.version.fiscalYear !== asOfYear ? workingOf(ctx.versions, asOfYear) : null
  const before = v ? hiringForecast(ctx, ids, v) : null
  const gridStart = shown.run.months[0]
  const out = new Map<Month, number>()
  for (const f of h.input.forecast) {
    const m = f.month
    if (monthEnd(m) <= ctx.asOf) continue
    const fp = before?.run && m < gridStart ? before : shown
    const run = fp.run
    if (!run) continue
    const first = shiftMonth(run.actualThrough, 1)
    // The first month whose month-end is after the as-of date (review RN-1).
    const aheadFrom =
      monthEnd(monthKey(ctx.asOf)) > ctx.asOf ? monthKey(ctx.asOf) : shiftMonth(monthKey(ctx.asOf), 1)
    let openings = 0
    for (const [id, starts] of run.starts) {
      if (!ids.has(id)) continue
      for (const x of starts) {
        if (x.kind !== 'open' && x.kind !== 'planned') continue
        const dated = [monthKey(x.start), first, aheadFrom].reduce((a, y) => (y > a ? y : a))
        if (dated === m) openings += x.probability
      }
    }
    out.set(m, openings + (forecastFlows(fp).get(m)?.modeledBackfills ?? 0))
  }
  return out
}

/** Σ projected starts by month from the as-of date to a day (the months whose month-end is by then). */
const projectedTo = (by: Map<Month, number>, end: ISODate): number =>
  [...by].reduce((a, [m, v]) => (monthEnd(m) <= end ? a + v : a), 0)

/**
 * H, S, M and E to a day, read from the engine's input with no engine function, and the rare terms
 * of projected heads (reviews RN-2 to RN-4): D, people in current heads whose last day is the as-of
 * date; L, signed offers past their start date; K, pre-hires the HRIS holds (each 0 on the as-of date).
 */
function termsTo(ctx: AnalyticsContext, end: ISODate) {
  const b = hiringBuiltOf(ctx)
  const input = b.h.input
  const asOf = ctx.asOf
  const S = new Set(input.offers.filter((o) => o.startDate > asOf && o.startDate <= end).map((o) => o.reqId))
  const M = new Set(input.moves.filter((o) => o.startDate > asOf && o.startDate <= end).map((o) => o.moveId))
  const known = input.exits.filter((e) => e.on > asOf && e.on <= end).length
  const modeled = input.forecast
    .filter((f) => monthEnd(f.month) > asOf && monthEnd(f.month) <= end)
    .reduce((a, f) => a + f.modeledExits, 0)
  const after = end > asOf
  const D = after ? [...b.h.current.values()].filter((x) => x.row.terminationDate === asOf).length : 0
  const L = after ? new Set(input.offers.filter((o) => o.startDate <= asOf).map((o) => o.reqId)).size : 0
  const K = [...b.h.preHires.values()].filter((x) => x.start <= end).length
  return { H: input.people.length, S: S.size, M: M.size, E: known + modeled, D, L, K }
}

/* ───────────── the seven numbers ───────────── */

describe('the seven numbers', () => {
  it.each(each(ALL))(
    'are the seven of 9.8 in order, each with its metric, lineage and calculation card (%s)',
    (_, c) => {
      const ctx = c.ctx()
      const m = planRecruitingModel(ctx)
      expect(m.kpis.map((k) => k.id)).toEqual([...RECRUITING_KPI_IDS])
      expect(m.kpis.map((k) => k.id)).toEqual(RECRUITING_KPIS.map((k) => k.id))
      expect(m.kpis.map((k) => k.metricId)).toEqual(RECRUITING_KPIS.map((k) => k.metricId))
      expect(m.kpis.map((k) => k.metricId)).toEqual([
        ID.hiringApprovedByQuarter,
        ID.hiringCurrentHeads,
        ID.hiringOpen,
        ID.hiringAcceptedStarts,
        ID.recruitingProjectedStarts,
        ID.hiringExpectedExits,
        ID.hiringPace,
      ])
      const fy = m.fiscalYear
      const bb = hiringBuiltOf(ctx)
      // A year that does not hold the as-of date names the span of its flow tiles (review RU-10).
      const toEnd = bb.otherYear && !bb.over ? ` to ${fy} end` : ''
      expect(m.kpis.map((k) => k.label)).toEqual([
        `Approved heads, ${fy}`,
        'Current heads',
        `Open to hire, ${fy}`,
        `Future starts${toEnd}`,
        `Projected starts${toEnd}`,
        `Projected attrition${toEnd}`,
        'Hiring velocity',
      ])
      for (const k of m.kpis) {
        expect(k.tab, k.id).toBe('recruiting')
        expect(k.uses?.length, k.id).toBeGreaterThan(0)
        expect(k.definition, k.id).toBe(ctx.metrics.def(k.metricId as string)?.definition)
        expect(ctx.access.can(`metric:${k.metricId}`), k.id).toBe(true)
        const card = resolveCalc(k.calc as never)
        const drill = resolveDrill(k.drill as DrillSource)
        // Every tile opens a calculation card, in a year that is over too (review RS-1, 9.8 item 1).
        expect(card, k.id).not.toBeNull()
        if (card) {
          expect(calcProblems(card), k.id).toEqual([])
          expect(sameResult(card.value, k.value, card.format), `${k.id}: ${card.value} for ${k.value}`).toBe(
            true,
          )
          if (k.value == null) expect(k.calcWhenEmpty, k.id).toBe(true)
        }
        if (drill && k.value != null) {
          if (drill.weight) expect(weightSum(drill as never), k.id).toBeCloseTo(k.value, 9)
          else expect(drill.rows.length, k.id).toBe(k.value)
        }
      }
    },
  )

  it.each(each(ALL))('are Plan > Hiring’s numbers for the same context (%s)', (_, c) => {
    const ctx = c.ctx()
    const m = planRecruitingModel(ctx)
    const hm = planHiringModel(ctx)
    const b = hiringBuiltOf(ctx)
    const t = b.r.table
    const last = QUARTER_KEYS[QUARTER_KEYS.length - 1]
    const firstAhead = QUARTER_KEYS.find((_, i) => t.quarters[i].kind === 'ahead')
    expect(m.fiscalYear).toBe(hm.fiscalYear)
    // Approved heads: the last quarter's A (null when the year is over, as Plan > Hiring's cell).
    expect(tile(m, 'recruiting-approved')?.value).toBe(hrow(hm, 'approved')?.[last] ?? null)
    expect(tile(m, 'recruiting-approved')?.value).toBe(b.over ? null : t.quarters[3].approved)
    // Current heads: Plan > Hiring's current heads, its cell in every quarter ahead.
    expect(tile(m, 'recruiting-current')?.value).toBe(t.heads.total)
    if (firstAhead) expect(tile(m, 'recruiting-current')?.value).toBe(hrow(hm, 'current')?.[firstAhead])
    expect(tile(m, 'recruiting-open')?.value).toBe(tile(hm, 'hiring-open')?.value)
    expect(tile(m, 'recruiting-future')?.value).toBe(tile(hm, 'hiring-accepted')?.value)
    // Projected attrition: the last quarter's E, known and modeled (0 when the year is over: none to come, RU-7).
    expect(tile(m, 'recruiting-attrition')?.value).toBe(b.over ? 0 : (hrow(hm, 'exits')?.[last] ?? null))
    expect(tile(m, 'recruiting-velocity')?.value).toBe(tile(hm, 'hiring-pace')?.value)
    // The velocity's note is Plan > Hiring's paces: the 6-month pace and the last 3 months' hires.
    const v = b.r.velocity.paces
    if (v.hires3 != null && v.hires6 != null)
      expect(tile(m, 'recruiting-velocity')?.note).toBe(
        `6-month pace ${v.hires6.toFixed(1)}; ${b.pace.hires} ${b.pace.hires === 1 ? 'hire' : 'hires'} in 3 months`,
      )
  })

  it.each(each(ALL))('open the cards and records Plan > Hiring opens (%s)', (_, c) => {
    const ctx = c.ctx()
    const m = planRecruitingModel(ctx)
    const hm = planHiringModel(ctx)
    const b = hiringBuiltOf(ctx)
    const same = (a: string, h: string) =>
      expect(cardSig(ctx, tile(m, a)?.calc), a).toBe(cardSig(ctx, tile(hm, h)?.calc))
    same('recruiting-open', 'hiring-open')
    same('recruiting-future', 'hiring-accepted')
    same('recruiting-velocity', 'hiring-pace')
    if (b.over) return
    const q4 = hrow(hm, 'approved')
    const hq = hm.quarters as unknown as { columns: readonly Column<HiringQuarterRow>[] }
    // Approved heads: a card (review RS-1) that lists the year-end column's records; no drill on the tile.
    const approved = tile(m, 'recruiting-approved')
    expect(approved?.drill).toBeUndefined()
    const approvedCard = resolveCalc(approved?.calc as never) as CalcSpec
    expect(drillSig(ctx, resolveDrill(approvedCard.rows as DrillSource))).toEqual(
      drillSig(ctx, drillOf(hq, 'q4', q4)),
    )
    // Current heads: a card listing the records (or, in Manager mode with someone not in plan,
    // Plan > Hiring's own card) of a column ahead.
    const ahead = QUARTER_KEYS.find((_, i) => b.r.table.quarters[i].kind === 'ahead') as string
    const cur = hrow(hm, 'current')
    expect(tile(m, 'recruiting-current')?.drill).toBeUndefined()
    // Its card is Plan > Hiring's where that cell has one; else a card that lists the same records (RS-1).
    const hiringCard = calcOf(hq, ahead, cur)
    if (hiringCard) expect(cardSig(ctx, tile(m, 'recruiting-current')?.calc)).toBe(cardSig(ctx, hiringCard))
    else {
      const card = resolveCalc(tile(m, 'recruiting-current')?.calc as never) as CalcSpec
      expect(drillSig(ctx, resolveDrill(card.rows as DrillSource))).toEqual(
        drillSig(ctx, drillOf(hq, ahead, cur)),
      )
    }
    // Projected attrition: the year-end column's expected exits card, under the tab's own title.
    expect(cardSig(ctx, tile(m, 'recruiting-attrition')?.calc, { title: false })).toBe(
      cardSig(ctx, calcOf(hq, 'q4', hrow(hm, 'exits')), { title: false }),
    )
    // The quarter table's counts open Plan > Hiring's cells for the same quarter.
    for (const r of m.quarters.rows) {
      expect(drillSig(ctx, drillOf(m.quarters, 'approved', r)), r.key).toEqual(
        drillSig(ctx, drillOf(hq, r.key, hrow(hm, 'approved'))),
      )
      expect(drillSig(ctx, drillOf(m.quarters, 'futureStarts', r)), r.key).toEqual(
        drillSig(ctx, drillOf(hq, r.key, hrow(hm, 'accepted'))),
      )
      expect(cardSig(ctx, calcOf(m.quarters, 'projectedExits', r), { title: false }), r.key).toBe(
        cardSig(ctx, calcOf(hq, r.key, hrow(hm, 'exits')), { title: false }),
      )
    }
    // The chart's closed months open Plan > Hiring's velocity records, and its months ahead the same signed offers.
    const vel = hm.velocity as unknown as {
      rows: readonly (Record<string, unknown> & { month: string; kind: string })[]
      columns: readonly Column<Record<string, unknown>>[]
    }
    for (const r of m.months.rows) {
      const hr = vel.rows.find((x) => x.month === r.month)
      if (!hr) continue
      const pairs: [keyof RecruitingMonthRow & string, string][] =
        r.kind === 'actual'
          ? [
              ['hires', 'hires'],
              ['exits', 'exits'],
            ]
          : r.kind === 'ended'
            ? []
            : [['futureStarts', 'hires']]
      for (const [a, h] of pairs) {
        const x = drillSig(ctx, drillOf(m.months, a, r), { title: false })
        const y = drillSig(ctx, drillOf(vel, h, hr), { title: false })
        const rows = (d: typeof x) => d?.rows.map((row) => JSON.stringify(row)).sort() ?? null
        expect(rows(x), `${r.month} ${a}`).toEqual(rows(y))
        expect(x?.kind ?? null, `${r.month} ${a}`).toBe(y?.kind ?? null)
      }
    }
  })
})

/* ───────────── projected starts ───────────── */

describe('projected starts', () => {
  it.each(each(ALL))(
    'are the forecast’s openings at their fill rate and its modeled backfills, over the months E reads (%s)',
    (_, c) => {
      const ctx = c.ctx()
      const m = planRecruitingModel(ctx)
      const b = hiringBuiltOf(ctx)
      const by = projectedByMonth(ctx)
      const t = tile(m, 'recruiting-projected')
      if (!by) {
        expect([t?.value, t?.note]).toEqual(
          b.over ? [0, `${m.fiscalYear} is over`] : [null, NO_FORECAST_NOTE],
        )
        for (const r of [...m.months.rows, ...m.quarters.rows])
          expect(r.projectedStarts, String(r.key ?? r.month)).toBeNull()
        return
      }
      if (b.over) {
        expect([t?.value, t?.note]).toEqual([0, `${m.fiscalYear} is over`])
        return
      }
      expect(t?.note).toBe(PROJECTED_STARTS_NOTE)
      close(t?.value as number, projectedTo(by, b.h.fyEnd), 'tile')
      for (const r of m.months.rows.filter((x) => x.kind === 'ahead'))
        close(r.projectedStarts, by.get(r.month) ?? 0, r.month)
      for (const r of m.quarters.rows) {
        const q = b.r.table.quarters[QUARTER_KEYS.indexOf(r.key)]
        close(r.projectedStarts, projectedTo(by, q.end), r.key)
      }
      // The sample has no move in, so no seat is left out of the recompute for one.
      expect(b.h.input.moves).toEqual([])
    },
  )

  it.each(each(ALL))(
    'never count a signed offer: no projected start sits on a seat with one (%s)',
    (_, c) => {
      const ctx = c.ctx()
      const h = hiringPrepOf(ctx)
      const offered = new Set(h.input.offers.map((o) => o.positionId))
      expect([...offered].every((id) => h.seats.get(id)?.acceptedStart != null)).toBe(true)
      for (const p of h.projected?.values() ?? [])
        for (const id of p.openingSeats.keys()) expect(offered.has(id), `${p.month} ${id}`).toBe(false)
      // The forecast does model the signed offers as starts (kind offer): none of them is in projected starts.
      const run = hiringForecast(ctx, h.p.scope.ids).run
      if (run && offered.size)
        expect(
          [...run.starts.values()].flat().some((x) => x.kind === 'offer' && offered.has(x.positionId)),
        ).toBe(true)
    },
  )

  it('pins the sample: Silicon Engineering, the leader’s org and the company', () => {
    const pin = (ctx: AnalyticsContext) => {
      const m = planRecruitingModel(ctx)
      return m.kpis.map((k) => (k.value == null ? null : Math.round(k.value * 100) / 100))
    }
    expect(pin(sampleCtx('hrbp'))).toEqual([604, 556, 39, 9, 47.26, 23.75, 4.33])
    expect(pin(sampleCtx('leader'))).toEqual([603, 555, 39, 9, 47.24, 23.71, 4.33])
    expect(pin(sampleCtx('finance'))).toEqual([1610, 1456, 132, 22, 161.71, 79.93, 13])
    expect(pin(sampleCtx('hr-admin'))).toEqual(pin(sampleCtx('finance')))
    const se = planRecruitingModel(sampleCtx('hrbp')).quarters.rows
    expect(se.map((r) => [r.key, r.approved, r.futureStarts, r.gapNote])).toEqual([
      ['q3', 590, 9, 'Short by 12.0'],
      ['q4', 604, 9, 'Short by 15.5'],
    ])
    expect(se.map((r) => Math.round((r.projectedHeads as number) * 10) / 10)).toEqual([578.0, 588.5])
  })
})

/* ───────────── projected heads and the months ahead ───────────── */

describe('projected heads', () => {
  it.each(each(ALL))(
    'are H − D + S + L + K + M + projected starts − E at every month end and quarter end (%s)',
    (_, c) => {
      const ctx = c.ctx()
      const m = planRecruitingModel(ctx)
      const b = hiringBuiltOf(ctx)
      const by = projectedByMonth(ctx)
      const heads = (end: ISODate) => {
        const x = termsTo(ctx, end)
        return by ? x.H - x.D + x.S + x.L + x.K + x.M + projectedTo(by, end) - x.E : null
      }
      // H is Plan > Hiring's current heads.
      expect(termsTo(ctx, ctx.asOf).H).toBe(b.r.table.heads.total)
      for (const r of m.months.rows.filter((x) => x.kind === 'ahead')) {
        const end = monthEnd(r.month)
        close(r.projectedHeads, heads(end), r.month)
        // The month's own terms: the differences of the projection at its end and the month before's.
        const prev = r.month === monthKey(ctx.asOf) ? ctx.asOf : monthEnd(shiftMonth(r.month, -1))
        const from = prev < ctx.asOf ? ctx.asOf : prev
        const a = termsTo(ctx, from)
        const z = termsTo(ctx, end)
        expect(r.futureStarts, r.month).toBe(z.S - a.S)
        expect(r.movesIn, r.month).toBe(z.M - a.M)
        close(r.projectedExits, z.E - a.E, r.month)
        expect(r.approved, r.month).toBe(tile(m, 'recruiting-approved')?.value ?? null)
      }
      for (const r of m.quarters.rows) {
        const q = b.r.table.quarters[QUARTER_KEYS.indexOf(r.key)]
        const x = termsTo(ctx, q.end)
        // The counts are Plan > Hiring's A(q), S(q), M(q) and E(q).
        expect([r.approved, r.futureStarts, r.movesIn], r.key).toEqual([q.approved, q.accepted, q.movesIn])
        expect([r.futureStarts, r.movesIn], r.key).toEqual([x.S, x.M])
        close(r.projectedExits, q.expectedExits?.total ?? null, r.key)
        close(r.projectedExits, x.E, r.key)
        close(r.projectedHeads, heads(q.end), r.key)
        const gap = r.projectedHeads == null || r.approved == null ? null : r.projectedHeads - r.approved
        close(r.gap, gap, `${r.key} gap`)
        expect(r.gapNote, r.key).toBe(gap == null ? null : gapText(gap))
        // "Q3, Oct to Dec"; "Q1 FY28, Apr to Jun" in a year that does not hold the as-of date (RU-10).
        expect(r.label, r.key).toMatch(
          b.otherYear
            ? /^Q[1-4] FY\d\d, [A-Z][a-z]{2} to [A-Z][a-z]{2}$/
            : /^Q[1-4], [A-Z][a-z]{2} to [A-Z][a-z]{2}$/,
        )
        expect(q.kind === 'ahead' && q.end > ctx.asOf, r.key).toBe(true)
      }
      // Every quarter ahead that ends after the as-of date has its row.
      expect(m.quarters.rows.map((r) => r.key)).toEqual(
        QUARTER_KEYS.filter(
          (_, i) => b.r.table.quarters[i].kind === 'ahead' && b.r.table.quarters[i].end > ctx.asOf,
        ),
      )
    },
  )

  it.each(each(ALL))(
    'add up month by month to the quarter table and, at the year end, to the tiles (%s)',
    (_, c) => {
      const ctx = c.ctx()
      const m = planRecruitingModel(ctx)
      const b = hiringBuiltOf(ctx)
      const ahead = m.months.rows.filter((r) => r.kind === 'ahead')
      // The months ahead: from the first month-end after the as-of date to the year end, none when it is over.
      const months: Month[] = []
      if (!b.over)
        for (
          let x =
            monthEnd(monthKey(ctx.asOf)) > ctx.asOf ? monthKey(ctx.asOf) : shiftMonth(monthKey(ctx.asOf), 1);
          x <= monthKey(b.h.fyEnd);
          x = shiftMonth(x, 1)
        )
          months.push(x)
      expect(ahead.map((r) => r.month)).toEqual(months)
      const upTo = (end: ISODate, k: 'futureStarts' | 'movesIn' | 'projectedStarts' | 'projectedExits') =>
        ahead.filter((r) => monthEnd(r.month) <= end).reduce((a, r) => a + (r[k] ?? 0), 0)
      for (const r of m.quarters.rows) {
        const end = b.r.table.quarters[QUARTER_KEYS.indexOf(r.key)].end
        expect(upTo(end, 'futureStarts'), r.key).toBe(r.futureStarts)
        expect(upTo(end, 'movesIn'), r.key).toBe(r.movesIn)
        if (r.projectedStarts != null) close(upTo(end, 'projectedStarts'), r.projectedStarts, r.key)
        close(upTo(end, 'projectedExits'), r.projectedExits, r.key)
        const atEnd = ahead.find((x) => x.month === monthKey(end))
        close(atEnd?.projectedHeads, r.projectedHeads, `${r.key} heads`)
      }
      if (ahead.length) {
        expect(upTo(b.h.fyEnd, 'futureStarts')).toBe(tile(m, 'recruiting-future')?.value)
        const p = tile(m, 'recruiting-projected')?.value
        if (p != null) close(upTo(b.h.fyEnd, 'projectedStarts'), p, 'projected')
        close(upTo(b.h.fyEnd, 'projectedExits'), tile(m, 'recruiting-attrition')?.value, 'attrition')
        const lastQ = m.quarters.rows.at(-1)
        close(ahead.at(-1)?.projectedHeads, lastQ?.projectedHeads, 'year-end heads')
      }
      // The closed months are Plan > Hiring's: its velocity's actual months, with heads at each month-end.
      const actual = b.r.velocity.months.filter((x) => x.kind === 'actual')
      const headsAt = new Map(b.h.input.headsAt.map((x) => [x.month, x.heads]))
      expect(
        m.months.rows.filter((r) => r.kind === 'actual').map((r) => [r.month, r.hires, r.exits, r.heads]),
      ).toEqual(actual.map((x) => [x.month, x.hires, x.exits, headsAt.get(x.month) ?? null]))
      const ended = m.months.rows.filter((r) => r.kind === 'ended')
      expect(m.months.rows.map((r) => r.kind)).toEqual([
        ...actual.map(() => 'actual'),
        ...ended.map(() => 'ended'),
        ...ahead.map(() => 'ahead'),
      ])
      // The ended months run from the last closed month to the as-of date, every month-end on or before it.
      for (const r of ended) expect(monthEnd(r.month) <= ctx.asOf, r.month).toBe(true)
      // A month-end as-of date: each month ahead's projected exits are Plan > Hiring's velocity month's.
      if (monthEnd(monthKey(ctx.asOf)) === ctx.asOf)
        for (const r of ahead) {
          const v = b.r.velocity.months.find((x) => x.month === r.month && x.kind === 'forecast')
          if (v) close(r.projectedExits, v.exits, r.month)
        }
    },
  )
})

/* ───────────── records and cards ───────────── */

describe('records and cards', () => {
  it.each(each(ALL))('hold their numbers (%s)', (_, c) => {
    const ctx = c.ctx()
    const m = planRecruitingModel(ctx)
    const r = reach(m)
    expect(r.cards.length).toBeGreaterThan(3)
    for (const d of r.drills) {
      if (d.value == null) continue
      if (d.spec.weight)
        expect(Math.abs((weightSum(d.spec as never) ?? 0) - d.value), d.where).toBeLessThan(1e-6)
      else expect(d.spec.rows.length, d.where).toBe(d.value)
    }
    for (const card of r.cards) {
      expect(calcProblems(card.spec), card.where).toEqual([])
      expect(
        sameResult(card.spec.value, card.value, card.spec.format),
        `${card.where}: ${card.spec.value} for ${card.value}`,
      ).toBe(true)
    }
    // Every number of the figures opens its records or its card.
    for (const fig of FIGURES(m))
      for (const row of fig.rows as readonly Record<string, unknown>[])
        for (const cl of fig.columns as readonly Column[]) {
          if (typeof row[cl.key] !== 'number' || cl.key === 'approved') continue
          const opens =
            !!resolveDrill(cl.drill?.(row) as DrillSource) || !!resolveCalc(cl.calc?.(row) as never)
          expect(opens, `${fig.id} ${String(row.key ?? row.month)} ${cl.key}`).toBe(true)
        }
  })

  it.each(each(ALL))(
    'hide every amount, band and leave column, and keep to the kinds the mode lists (%s)',
    (_, c) => {
      const ctx = c.ctx()
      const r = reach(planRecruitingModel(ctx))
      const manager = ctx.access.mode === 'manager'
      const scope = hiringPrepOf(ctx).p.scope.ids
      for (const d of r.drills) {
        const kind = d.spec.kind as HiringDrillKind
        expect(HIRING_DRILL_KINDS as readonly string[], d.where).toContain(kind)
        expect(ctx.access.can(`drill:${kind}`), `${d.where} ${kind}`).toBe(true)
        for (const key of HIRING_DRILL_HIDE[kind])
          expect(d.spec.hide ?? [], `${d.where} ${key}`).toContain(key)
        const table = buildDrillTable(d.spec, ctx)
        const shown = table.columns.map((x) => x.key)
        for (const key of HIRING_DRILL_HIDE[kind]) expect(shown, `${d.where} ${key}`).not.toContain(key)
        for (const row of table.rows)
          for (const key of HIRING_DRILL_HIDE[kind]) expect(key in row, `${d.where} row ${key}`).toBe(false)
        if (manager) {
          // Manager mode lists no worker, and no seat outside the tree strictly below the manager's.
          expect(kind, d.where).not.toBe('workers')
          for (const row of d.spec.rows as readonly { positionId?: string | null }[])
            if (row.positionId) expect(scope.has(row.positionId), `${d.where} ${row.positionId}`).toBe(true)
        }
      }
    },
  )

  it('Manager mode: nothing about the manager’s own seat or above (8.4)', () => {
    const s = sample()
    for (const persona of ['manager-a', 'manager-b', 'manager-c'] as const) {
      const ctx = sampleCtx('manager', { persona })
      const me = s.personas.find((p) => p.key === persona)?.employeeId
      const own = s.datasets.workers.find((w) => w.employeeId === me && w.positionId)?.positionId as string
      expect(own, persona).toBeTruthy()
      expect(hiringPrepOf(ctx).p.scope.ids.has(own), persona).toBe(false)
      const r = reach(planRecruitingModel(ctx))
      for (const d of r.drills)
        for (const row of d.spec.rows as readonly { positionId?: string | null }[])
          expect(row.positionId, `${persona} ${d.where}`).not.toBe(own)
      for (const card of r.cards)
        expect(JSON.stringify({ ...card.spec, rows: null }), persona).not.toContain(own)
    }
  })

  it('projected starts open seats (never a req), future starts open signed offers (reqs, dates only)', () => {
    const ctx = sampleCtx('hrbp')
    const m = planRecruitingModel(ctx)
    const r = reach(m)
    const kinds = (prefix: string) =>
      new Set(r.drills.filter((d) => d.where.includes(prefix)).map((d) => d.spec.kind))
    expect(kinds('projectedStarts rows')).toEqual(new Set(['positions']))
    expect(kinds('tile recruiting-projected rows')).toEqual(new Set(['positions']))
    expect(kinds('futureStarts')).toEqual(new Set(['reqs']))
    expect(kinds('tile recruiting-future rows')).toEqual(new Set(['reqs']))
  })
})

/* ───────────── heads only ───────────── */

describe('heads only', () => {
  it.each(each(ALL))('no amount, band or leave fact reaches anything the tab shows (%s)', (_, c) => {
    const ctx = c.ctx()
    const m = planRecruitingModel(ctx)
    const r = reach(m)
    const texts = textsOf(ctx, m, r)
    expect(texts.length).toBeGreaterThan(50)
    const hits = texts.flatMap((t) => amountsIn(t).map((a) => `${a} in "${t.slice(0, 80)}"`))
    expect(hits.slice(0, 5)).toEqual([])
    const keys = keysOf(ctx, m, r).filter((k) => isAmountKey(k) || /offer(?!ed)|salary|leave|^pay/i.test(k))
    // A req's "Offer accepted" date is a date, the one offer field the module shows.
    expect(keys.filter((k) => k !== 'offerAcceptedDate')).toEqual([])
    if (ctx.access.mode === 'manager' || ctx.access.mode === 'finance') {
      const titles = new Set(sample().datasets.positions.map((p) => p.title ?? ''))
      expect(texts.filter((t) => /\bleave\b/i.test(t) && !titles.has(t)).slice(0, 3)).toEqual([])
    }
    const uses = new Set(
      [
        ...m.kpis.flatMap((k) => k.uses ?? []),
        ...FIGURES(m).flatMap((f) => f.uses ?? []),
        ...r.cards.flatMap((x) => x.spec.uses ?? []),
      ].flat(),
    )
    for (const ref of uses)
      expect(
        /^comp\.|offerBase|offerCurrency|signOnBonus|relocation|agencyFee|onLeave|leavePaid/.test(ref),
        ref,
      ).toBe(false)
    // The one slide's numbers: words with no amount, each value a tile's count as the strip writes it.
    expect(m.deckNumbers.flatMap((n) => [n.label, n.note ?? ''].flatMap((t) => amountsIn(t)))).toEqual([])
    for (const [i, n] of m.deckNumbers.entries()) {
      expect(['int', 'num1'], n.label).toContain(m.kpis[i].format)
      expect(n.value, n.label).toBe(kpiValueText(m.kpis[i]))
    }
  })

  it.each(each(ALL))(
    'writes each figure through the export layer with its columns and no amount (%s)',
    (_, c) => {
      const ctx = c.ctx()
      const m = planRecruitingModel(ctx)
      for (const fig of FIGURES(m)) {
        const csv = toCsv({ columns: fig.columns as never, rows: fig.rows as never }, moneyOpts(ctx))
        const lines = csv.replace(/^﻿/, '').trimEnd().split('\r\n')
        expect(lines[0], fig.id).toBe(fig.columns.map((x) => csvField(x.label)).join(','))
        expect(lines.length - 1, fig.id).toBe(fig.rows.length)
        expect(lines[0], fig.id).not.toMatch(/Suppressed|Why/)
        expect(
          cellsOf(csv, ',').flatMap((x) => amountsIn(x)),
          fig.id,
        ).toEqual([])
      }
    },
  )

  it('moves nothing a reader sees when a salary, an offer amount or a leave flag changes, in every mode', () => {
    const s = sample()
    const team = s.datasets.workers.filter(
      (w) => w.positionId && ['P-1999', 'P-2000', 'P-2001'].includes(w.positionId),
    )
    const offer = s.datasets.reqs.find((q) => q.positionId === 'P-2372' && q.stage === 'Offer accepted')
    expect(team.length === 3 && offer).toBeTruthy()
    const changed = [
      withSalaryDelta(s, team[0].employeeId, 7_500),
      withReq(s, offer?.reqId as string, {
        offerBase: (offer?.offerBase ?? 0) + 7_500,
        signOnBonus: 12_000,
        agencyFee: 9_000,
      }),
      withWorker(s, team[1].employeeId, { onLeave: true, leavePaid: false }),
    ]
    for (const c of [
      ...MODES.map((mode) => ({ mode, opts: {} as CtxOptions })),
      { mode: 'manager' as Mode, opts: { persona: 'manager-b' } as CtxOptions },
      { mode: 'hr-admin' as Mode, opts: { showPay: true } as CtxOptions },
    ]) {
      const base = sampleCtx(c.mode, c.opts)
      const want = signature(base, planRecruitingModel(base))
      for (const x of changed) {
        const ctx = sampleCtx(c.mode, { ...c.opts, sample: x })
        expect(signature(ctx, planRecruitingModel(ctx)), `${c.mode} ${JSON.stringify(c.opts)}`).toBe(want)
      }
    }
  }, 300_000)
})

/* ───────────── Managers A, B and C ───────────── */

describe('Managers A, B and C (13.3)', () => {
  const pin = (ctx: AnalyticsContext) =>
    planRecruitingModel(ctx).kpis.map((k) => (k.value == null ? null : Math.round(k.value * 100) / 100))

  it('pins the three teams: Manager A 9 approved, 7 heads, 2 open; B 1 future start; C nothing open', () => {
    expect(pin(sampleCtx('manager'))).toEqual([9, 7, 2, 0, 2.14, 0.59, 0])
    expect(pin(sampleCtx('manager', { persona: 'manager-b' }))).toEqual([5, 3, 1, 1, 1.02, 0.22, 0])
    expect(pin(sampleCtx('manager', { persona: 'manager-c' }))).toEqual([7, 7, 0, 0, 0.22, 0.36, 0])
    // No hire in the last 3 months on any of the three teams: where hiring happened says so.
    for (const persona of ['manager-a', 'manager-b', 'manager-c'] as const) {
      const m = planRecruitingModel(sampleCtx('manager', { persona }))
      expect(m.where.rows, persona).toEqual([])
      expect(m.where.empty, persona).toBe('No hire in Jul 2026 to Sep 2026.')
    }
  })

  it('gives Manager C the same tab with and without the confidential Elimination on C’s own seat', () => {
    const s = sample()
    const without = withoutRequest(s, s.planted.managerCElimination).sample
    const a = sampleCtx('manager', { persona: 'manager-c' })
    const b = sampleCtx('manager', { persona: 'manager-c', sample: without })
    expect(signature(b, planRecruitingModel(b))).toBe(signature(a, planRecruitingModel(a)))
    expect(s.datasets.requests.some((r) => r.requestId === s.planted.managerCElimination)).toBe(true)
  })

  it('gives Manager C the same tab with that Elimination approved: its rows never reach C’s forecast', () => {
    const s = sample()
    const id = s.planted.managerCElimination
    const req = s.datasets.requests.find((r) => r.requestId === id)
    if (!req?.positionId || !req.startDate) throw new Error('The sample has no Elimination of C’s seat.')
    const on = req.startDate
    const base = s.datasets.positions
      .filter((r) => r.positionId === req.positionId && r.effectiveDate <= on)
      .sort((x, y) => (x.effectiveDate < y.effectiveDate ? -1 : 1))
      .at(-1) as PositionRow
    const approved = withPlan(s, {
      requests: [
        ...s.plan.requests.filter((r) => r.requestId !== id),
        { ...fromRow(req), state: 'Approved' },
      ],
      overlay: {
        ...s.plan.overlay,
        positions: [
          ...s.plan.overlay.positions,
          {
            ...base,
            effectiveDate: '2027-01-01',
            status: 'Eliminated',
            endDate: on,
            endReason: 'Eliminated',
            sourceRequestId: id,
          },
        ],
      },
    })
    const before = sampleCtx('manager', { persona: 'manager-c' })
    const after = sampleCtx('manager', { persona: 'manager-c', sample: approved })
    expect(signature(after, planRecruitingModel(after))).toBe(signature(before, planRecruitingModel(before)))
    // Control: HR admin sees the approval: C's seat leaves the approved heads by the year end.
    const admin = (x?: typeof s) =>
      tile(planRecruitingModel(sampleCtx('hr-admin', x ? { sample: x } : {})), 'recruiting-approved')?.value
    expect(admin(approved)).toBe((admin() as number) - 1)
  })
})

/* ───────────── where hiring happened ───────────── */

describe('where hiring happened', () => {
  it.each(each(ALL))(
    'is the top 5 of Plan > Hiring’s location and department sub-totals, with the right "more" and the same records (%s)',
    (_, c) => {
      const ctx = c.ctx()
      const m = planRecruitingModel(ctx)
      const hm = planHiringModel(ctx)
      const f = m.where
      expect([f.id, f.metric, f.title]).toEqual([
        'plan-recruiting-where',
        ID.hiringRecentHires,
        'Where hiring happened',
      ])
      const recent = hm.recent
      const hcol = recent as unknown as { columns: readonly Column<Record<string, unknown>>[] }
      for (const kind of ['location', 'department'] as const) {
        const subs = recent.rows.filter((r) => r.kind === kind && r.total > 0)
        const shown = f.rows.filter((r) => r.kind === kind)
        expect(shown.length, kind).toBe(recent.empty ? 0 : Math.min(WHERE_TOP, subs.length))
        expect(m.whereMore[kind === 'location' ? 'locations' : 'departments'], kind).toBe(
          Math.max(0, subs.length - WHERE_TOP),
        )
        // By hires, most first; a tie keeps Plan > Hiring's order; nothing left out has more hires.
        const order = (key: string) => recent.rows.findIndex((r) => r.key === key)
        for (let i = 1; i < shown.length; i++) {
          const [x, y] = [shown[i - 1], shown[i]]
          expect(
            x.hires > y.hires || (x.hires === y.hires && order(x.key) < order(y.key)),
            `${kind} ${i}`,
          ).toBe(true)
        }
        const keys = new Set(shown.map((r) => r.key))
        const least = Math.min(...shown.map((r) => r.hires))
        for (const r of subs) if (!keys.has(r.key)) expect(r.total, r.key).toBeLessThanOrEqual(least)
        for (const r of shown) {
          const src = recent.rows.find((x) => x.key === r.key) as (typeof recent.rows)[number]
          expect(src, r.key).toBeTruthy()
          expect([r.name, r.hires, r.perMonth, r.kindText]).toEqual([
            kind === 'location' ? src.location : src.department,
            src.total,
            src.perMonth,
            kind === 'location' ? 'Location' : 'Department',
          ])
          // The same records and card as Plan > Hiring's total and hires per month for that sub-total.
          expect(drillSig(ctx, drillOf(f, 'hires', r)), r.key).toEqual(
            drillSig(ctx, drillOf(hcol, 'total', src)),
          )
          expect(cardSig(ctx, calcOf(f, 'hires', r)), r.key).toBe(cardSig(ctx, calcOf(hcol, 'total', src)))
          const card = resolveCalc(calcOf(f, 'perMonth', r) as never) as CalcSpec
          expect([card.value, card.metricId], r.key).toEqual([r.perMonth, ID.hiringPace])
          expect(cardSig(ctx, card), r.key).toBe(cardSig(ctx, calcOf(hcol, 'perMonth', src)))
        }
      }
      expect(f.empty).toBe(recent.empty ?? null)
    },
  )
})

/* ───────────── the one slide ───────────── */

describe('the deck', () => {
  it.each(each(ALL))('numbers are the tiles as the strip shows them: value, label and note (%s)', (_, c) => {
    const m = planRecruitingModel(c.ctx())
    expect(m.deckNumbers).toEqual(
      m.kpis.map((k) => ({ label: k.label, value: kpiValueText(k), ...(k.note ? { note: k.note } : {}) })),
    )
    expect(m.deckNumbers).toHaveLength(7)
  })
})

/* ───────────── the model ───────────── */

describe('the model', () => {
  it('is cached per context and rebuilt for another, reading Plan > Hiring’s own reading', () => {
    const ctx = sampleCtx('hrbp')
    expect(planRecruitingModel(ctx)).toBe(planRecruitingModel(ctx))
    expect(planRecruitingModel(sampleCtx('hrbp'))).not.toBe(planRecruitingModel(ctx))
    expect(hiringBuiltOf(ctx)).toBe(hiringBuiltOf(ctx))
    expect(hiringBuiltOf(ctx).h).toBe(hiringPrepOf(ctx))
  })

  it('has its figures in page order, each with its metric and lineage', () => {
    const m = planRecruitingModel(sampleCtx('hrbp'))
    expect(FIGURES(m).map((f) => [f.id, f.metric])).toEqual([
      ['plan-recruiting-months', ID.recruitingProjectedHeads],
      ['plan-recruiting-quarters', ID.recruitingGap],
      ['plan-recruiting-where', ID.hiringRecentHires],
    ])
    for (const f of FIGURES(m)) expect(f.uses?.length, f.id).toBeGreaterThan(0)
    expect(m.months.title).toBe('Heads and hiring by month')
    expect(m.quarters.title).toBe('By quarter ahead')
  })

  it.each(each(ALL))(
    'keeps the copy rules, and keeps future starts and projected starts apart (%s)',
    (_, c) => {
      const ctx = c.ctx()
      const m = planRecruitingModel(ctx)
      const figs = FIGURES(m) as unknown as readonly FigureData<Record<string, unknown>>[]
      const words = wordsOf({
        kpis: m.kpis.map((k) => ({ label: k.label, note: k.note, formula: k.formula })),
        figures: figs.map((f) => ({
          title: f.title,
          subtitle: f.subtitle,
          note: f.note,
          empty: f.empty,
          labels: f.columns.map((x) => x.label),
        })),
        rows: [
          m.quarters.rows.map((r) => [r.label, r.gapNote]),
          m.months.rows.map((r) => [r.label, r.kindText]),
        ],
        where: m.where.rows.map((r) => r.kindText),
        deck: m.deckNumbers,
        cards: reach(m).cards.map((x) => ({
          title: x.spec.title,
          note: x.spec.note,
          inputs: x.spec.inputs.map((i) => i.label),
          steps: x.spec.steps.map((s) => [s.label, s.expression]),
        })),
      })
      expect(words.length).toBeGreaterThan(40)
      expectPlainCopy(words, c.name)
      for (const w of words) {
        expect(/\p{Extended_Pictographic}/u.test(w), w).toBe(false)
        // Plain counts: "1 hire", "2 heads".
        expect(/(^|[^\d.,])1 (heads|hires|exits|seats|offers|people|starts|moves)\b/.test(w), w).toBe(false)
        expect(/headcount to hire/i.test(w), w).toBe(false)
      }
      for (const t of [
        ...m.kpis.map((k) => k.label),
        ...figs.flatMap((f) => [f.title, ...f.columns.map((x) => x.label)]),
      ])
        expect(/^[A-Z0-9]/.test(t), t).toBe(true)
      // A tile's note is one line: no full stop inside it or at its end, and its parts are joined
      // by semicolons with no capital after one ("Hires a month, 3-month pace; 6-month pace 4.5; ...").
      for (const k of m.kpis)
        if (k.note) expect(/\.(\s|$)|; \p{Lu}/u.test(k.note), `${k.id}: ${k.note}`).toBe(false)
      // "Future starts" (signed offers) and "Projected starts" (the model), apart and named so.
      const b = hiringBuiltOf(ctx)
      const toEnd = b.otherYear && !b.over ? ` to ${m.fiscalYear} end` : ''
      expect([tile(m, 'recruiting-future')?.label, tile(m, 'recruiting-projected')?.label]).toEqual([
        `Future starts${toEnd}`,
        `Projected starts${toEnd}`,
      ])
      if (!b.over) {
        expect(tile(m, 'recruiting-future')?.note).toBe(FUTURE_STARTS_NOTE)
        expect([PROJECTED_STARTS_NOTE, NO_FORECAST_NOTE]).toContain(tile(m, 'recruiting-projected')?.note)
      }
      for (const fig of [m.months, m.quarters] as readonly { columns: readonly Column[] }[]) {
        const labels = fig.columns.map((x) => x.label)
        expect(labels).toContain('Future starts (signed offers)')
        expect(labels).toContain('Projected starts (model)')
      }
      // Every start the strip, the slide and the figures name is a future start or a projected start.
      const named = [
        ...m.kpis.flatMap((k) => [k.label, k.note ?? '']),
        ...m.deckNumbers.flatMap((n) => [n.label, n.note ?? '']),
        ...figs.flatMap((f) => [
          f.title,
          f.subtitle ?? '',
          f.note ?? '',
          f.empty ?? '',
          ...f.columns.map((x) => x.label),
        ]),
      ]
      for (const t of named)
        expect(/\bstarts?\b/i.test(t.replace(/\b(future|projected) starts?\b|\bstart date\b/gi, '')), t).toBe(
          false,
        )
    },
  )
})

/* ───────────── edge cases ───────────── */

describe('edge cases', () => {
  it('FY28 shown: FY28’s quarters, the months ahead from the as-of date, projected starts from FY27 Working before FY28’s grid', () => {
    const ctx = sampleCtx('hr-admin', { version: 'fy28-working' })
    const m = planRecruitingModel(ctx)
    const hm = planHiringModel(ctx)
    expect(m.fiscalYear).toBe('FY28')
    expect(tile(m, 'recruiting-approved')?.label).toBe('Approved heads, FY28')
    expect(tile(m, 'recruiting-approved')?.note).toBe('By 31 Mar 2028')
    expect(tile(m, 'recruiting-approved')?.value).toBe(hrow(hm, 'approved')?.q4)
    expect(m.quarters.rows.map((r) => r.key)).toEqual(['q1', 'q2', 'q3', 'q4'])
    const ahead = m.months.rows.filter((r) => r.kind === 'ahead')
    expect([ahead[0].month, ahead.at(-1)?.month, ahead.length]).toEqual(['2026-10', '2028-03', 18])
    // Before FY28's grid (April 2027) projected starts are FY27 Working's; from it, FY28 Working's.
    const fy27 = planRecruitingModel(sampleCtx('hr-admin'))
    for (const r of ahead.filter((x) => x.month < '2027-04')) {
      const own = fy27.months.rows.find((x) => x.month === r.month)
      close(r.projectedStarts, own?.projectedStarts, r.month)
      close(r.projectedExits, own?.projectedExits, r.month)
    }
    const q1 = m.quarters.rows[0]
    close(
      q1.projectedStarts,
      (tile(fy27, 'recruiting-projected')?.value as number) +
        ahead
          .filter((x) => x.month >= '2027-04' && x.month <= '2027-06')
          .reduce((a, x) => a + (x.projectedStarts ?? 0), 0),
      'Q1 FY28',
    )
    expect(ahead.filter((x) => x.month >= '2027-04').every((x) => (x.projectedStarts ?? 0) > 0)).toBe(true)
    // The independent recompute reads the same 18 months, each from one forecast.
    expect(projectedByMonth(ctx)?.size).toBe(18)
  })

  it('a year that is over (15 Apr 2027, FY27): "FY27 is over", no quarter or month ahead, the paces still read', () => {
    const ctx = sampleCtx('hr-admin', { asOf: '2027-04-15', version: 'fy27-working' })
    const m = planRecruitingModel(ctx)
    const hm = planHiringModel(ctx)
    expect(m.kpis.map((k) => [k.id, k.value, k.note])).toEqual([
      ['recruiting-approved', null, 'FY27 is over'],
      ['recruiting-current', hiringBuiltOf(ctx).r.table.heads.total, 'On 15 Apr 2027'],
      ['recruiting-open', 0, 'FY27 is over'],
      ['recruiting-future', 0, 'FY27 is over'],
      ['recruiting-projected', 0, 'FY27 is over'],
      ['recruiting-attrition', 0, 'FY27 is over'],
      ['recruiting-velocity', tile(hm, 'hiring-pace')?.value, tile(m, 'recruiting-velocity')?.note],
    ])
    expect(m.quarters.rows).toEqual([])
    expect(m.quarters.empty).toBe('Every quarter of FY27 is over.')
    expect(m.months.rows.length).toBeGreaterThan(0)
    // Closed months, then the months ended since the last close (review RN-1), and no approved line.
    expect(m.months.rows.every((r) => r.kind !== 'ahead' && r.approved == null)).toBe(true)
    expect(m.months.rows.filter((r) => r.kind === 'ended').map((r) => r.month)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
    ])
    expect(m.deckNumbers.map((n) => n.value)).toEqual(
      m.kpis.map((k) => (k.value == null ? '—' : kpiValueText(k))),
    )
  })

  it('no Working forecast: projected starts read "No Working forecast yet", nothing throws', () => {
    for (const mode of ['hr-admin', 'manager', 'hrbp'] as const) {
      const ctx = sampleCtx(mode, { sample: noWorking() })
      expect(hiringForecast(ctx, hiringPrepOf(ctx).p.scope.ids).run, mode).toBeNull()
      const m = planRecruitingModel(ctx)
      const t = tile(m, 'recruiting-projected')
      expect([t?.value, t?.note, t?.calcWhenEmpty], mode).toEqual([null, NO_FORECAST_NOTE, true])
      const card = resolveCalc(t?.calc as never) as CalcSpec
      expect([card.value, calcProblems(card)], mode).toEqual([null, []])
      expect(card.steps[0].label, mode).toBe(NO_FORECAST_NOTE)
      expect(m.months.note, mode).toMatch(/^No Working forecast yet: /)
      // The rest of the tab still reads Plan > Hiring's numbers.
      expect(tile(m, 'recruiting-open')?.value, mode).toBe(tile(planHiringModel(ctx), 'hiring-open')?.value)
      expect(reach(m).cards.length, mode).toBeGreaterThan(3)
    }
  })

  it('no closed month: no closed month on the chart, no pace, and the quarters from the as-of date', () => {
    const ctx = sampleCtx('hr-admin', { sample: noClose() })
    const m = planRecruitingModel(ctx)
    expect(m.months.rows.filter((r) => r.kind === 'actual')).toEqual([])
    expect(m.months.subtitle).toMatch(/^The future starts \(signed offers\) and projected starts \(model\)/)
    expect(tile(m, 'recruiting-velocity')?.value).toBeNull()
    expect(tile(m, 'recruiting-attrition')?.note).toBe('Attrition (heads) needs 12 closed months')
    expect(m.quarters.rows.map((r) => r.key)).toEqual(['q3', 'q4'])
    expect(m.where.rows).toEqual([])
  })
})
