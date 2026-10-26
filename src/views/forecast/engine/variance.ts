/**
 * Forecast > Variance (docs/PLAN.md 6.8, 9.4): org × measure (heads, average FTE, cost) × window
 * (month, QTD, YTD, FY): actual for closed months, forecast for open ones, minus the comparison
 * version. Positive cost is over. Heads and FTE are free; every cost cell is two guarded totals and
 * their difference under 7.2 rule 5 (rounded modes: QTD, YTD and FY only, whole unions of atoms; a
 * difference of rounded totals). With a target comparison it is an empty state (9.2). Pure.
 *
 * Readings taken here (views-1 builder, M2):
 *  - Orgs: the scope as a whole, its units, its departments, and a leader's direct sub-orgs. Months
 *    are listed for the scope and its units; departments and sub-orgs show QTD, YTD and FY.
 *  - A department's cost is the sum of its unit's shown cost centers in Finance and in HR admin with
 *    the switch off (a department is a union of cost centers, 7.4 and 7.5); folded centers stay in
 *    the unit's Other, and the note says how many people are left out.
 *  - Average FTE on each side is Σ FTE × active fraction of its lines over the window's months,
 *    weighted by days (variance.ts `measuresOver`). Heads are at the window's last month-end.
 */

import type { GuardedDifference } from '@/cost/differences'
import { ROUNDED_PERIOD_NOTE, WHOLE_TEAMS_NOTE } from '@/cost/fit'
import { SHOWS_IN_FINANCE_NOTE } from '@/cost/guard'
import { daysInMonth, monthKey, quarterOf } from '@/data/fiscal'
import type { Month } from '@/data/schema'
import { type CalcSpec, calcInput, calcStep } from '@/drill/calc'
import { subtitleOf } from '@/drill/subtitle'
import { type Format, fmt } from '@/lib/format'
import { emptyComparisonReason } from '@/plan/engine/variance'
import type { PlanLine } from '@/plan/types'
import { monthLabel } from '@/views/plan/engine/base'
import { placementOf, versionLinesOf } from '@/views/plan/engine/core'
import { differenceCard } from '@/views/plan/engine/cost'
import { costIdsOf, type DiffSide, guardFigure, isWholeUnion } from '@/views/plan/engine/guarded'
import { ID } from '../metrics'
import type { VarianceOrgLevel, VarianceRow, VarianceWindow } from '.'
import type { FPrep } from './base'
import { lineFte } from './heads'
import { FIGURE } from './lineage'
import { guardedDeltaOf, guardedSideOf, idsSignature } from './members'

/** One org the table lists. */
export interface VarianceOrg {
  key: string
  label: string
  level: VarianceOrgLevel
  /** The org's positions in scope. */
  ids: ReadonlySet<string>
}

/** One window: its key, label and months. */
export interface WindowDef {
  window: VarianceWindow
  key: string
  label: string
  /** The window's months: heads and average FTE read them. */
  months: readonly Month[]
  /**
   * Rounded modes, QTD and YTD: the months cost reads, ending at the last close on or before the
   * as-of date and empty with none (7.3b, C21; review RR-2). Not set where cost reads `months`.
   */
  costMonths?: readonly Month[]
}

/** A variance row with its window's key and label (the table's columns). */
export interface VarianceTableRow extends VarianceRow {
  /** The window's key: a month ('2026-09'), 'qtd', 'ytd' or 'fy'. */
  windowKey: string
  windowLabel: string
}

export interface VarianceTable {
  rows: VarianceTableRow[]
  /** Why the table is empty (a target comparison), else null. */
  empty: string | null
  orgs: readonly VarianceOrg[]
  windows: readonly WindowDef[]
  /** The guarded sides behind each cost cell, by row key, for calculation cards. */
  sides: ReadonlyMap<string, { a: DiffSide; b: DiffSide; delta: GuardedDifference }>
}

const memo = new WeakMap<FPrep, VarianceTable>()

export const rowKey = (orgKey: string, measure: string, windowKey: string): string =>
  `${orgKey}|${measure}|${windowKey}`

/** The windows of 9.4: every month of the fiscal year, then QTD, YTD and FY. */
export function windowsOf(p: FPrep): WindowDef[] {
  const months = p.fyMonths
  const through: Month = p.lastClose?.month ?? monthKey(p.ctx.asOf)
  const q = quarterOf(p.on)
  const qFrom = monthKey(q.start)
  const qTo = monthKey(q.end)
  const qtd = months.filter((m) => m >= qFrom && m <= qTo && m <= through)
  // Rounded modes: cost to date ends at the cost close (the Plan view's `costYtdMonths`), never the
  // as-of date's open month or a close after the as-of date; heads and FTE keep their own months.
  const close = p.env.mode === 'rounded' ? (p.costClose?.month ?? null) : undefined
  const costTo = (list: readonly Month[]) =>
    close === undefined ? {} : { costMonths: close === null ? [] : list.filter((m) => m <= close) }
  return [
    ...months.map((m): WindowDef => ({ window: 'month', key: m, label: monthLabel(m), months: [m] })),
    { window: 'qtd', key: 'qtd', label: `${q.label} to date`, months: qtd, ...costTo(qtd) },
    {
      window: 'ytd',
      key: 'ytd',
      label: `${p.fiscalYear} year to date`,
      months: p.ytdMonths,
      ...(close === undefined ? {} : { costMonths: p.costYtdMonths }),
    },
    { window: 'fy', key: 'fy', label: p.fiscalYear, months },
  ]
}

/** The orgs the table lists (see the module comment). */
export function orgsOf(p: FPrep): VarianceOrg[] {
  const place = placementOf(p.ctx)
  const ids = p.scope.ids
  const units = new Map<string, Set<string>>()
  const depts = new Map<string, Set<string>>()
  for (const id of ids) {
    const r = place.get(id)
    if (!r) continue
    const u = units.get(r.businessUnit) ?? new Set<string>()
    u.add(id)
    units.set(r.businessUnit, u)
    if (r.department) {
      const d = depts.get(r.department) ?? new Set<string>()
      d.add(id)
      depts.set(r.department, d)
    }
  }
  const out: VarianceOrg[] = [{ key: 'scope', label: p.ctx.scopeLabel, level: 'company', ids }]
  for (const [u, set] of [...units].sort((a, b) => a[0].localeCompare(b[0])))
    out.push({ key: `unit:${u}`, label: u, level: 'unit', ids: set })
  for (const [d, set] of [...depts].sort((a, b) => a[0].localeCompare(b[0])))
    out.push({ key: `department:${d}`, label: d, level: 'department', ids: set })
  const scope = p.ctx.access.scope
  if (scope?.kind === 'tree')
    for (const s of scope.subOrgs) {
      const set = new Set([...s.positionIds].filter((id) => ids.has(id)))
      if (set.size) out.push({ key: `subOrg:${s.positionId}`, label: s.label, level: 'subOrg', ids: set })
    }
  return out
}

interface SideFigures {
  heads: Map<Month, number>
  fte: Map<Month, number>
}

/** The months' places, for the sums by org and month. */
const indexOf = (months: ReadonlySet<Month>): Map<Month, number> => new Map([...months].map((m, i) => [m, i]))

/** Each org's position indexes by position, in org order. */
function orgsByPosition(orgs: readonly { ids: ReadonlySet<string> | null }[]): Map<string, number[]> {
  const out = new Map<string, number[]>()
  orgs.forEach((o, i) => {
    if (!o.ids) return
    for (const id of o.ids) {
      const list = out.get(id)
      if (list) list.push(i)
      else out.set(id, [i])
    }
  })
  return out
}

/**
 * Every org's heads and FTE by month over the lines, in one pass: each org adds its own positions'
 * lines in the lines' order, so its sums are the ones a pass over its positions alone gives.
 */
function figuresOf(
  lines: readonly PlanLine[],
  byPosition: ReadonlyMap<string, readonly number[]>,
  orgCount: number,
  months: ReadonlySet<Month>,
): SideFigures[] {
  // Sums by org and month in arrays (each starts at 0 and adds its lines in order, as a map from
  // nothing would), then read out by month.
  const at = indexOf(months)
  const n = at.size
  const heads = new Float64Array(orgCount * n)
  const fte = new Float64Array(orgCount * n)
  for (const l of lines) {
    const mi = at.get(l.month)
    if (mi === undefined) continue
    const orgs = byPosition.get(l.positionId)
    if (!orgs) continue
    const f = lineFte(l)
    for (const i of orgs) {
      heads[i * n + mi] += l.heads
      fte[i * n + mi] += f
    }
  }
  const out: SideFigures[] = []
  for (let i = 0; i < orgCount; i++) {
    const h = new Map<Month, number>()
    const t = new Map<Month, number>()
    for (const [m, mi] of at) {
      h.set(m, heads[i * n + mi])
      t.set(m, fte[i * n + mi])
    }
    out.push({ heads: h, fte: t })
  }
  return out
}

const avgFte = (fte: ReadonlyMap<Month, number>, months: readonly Month[]): number => {
  let num = 0
  let den = 0
  for (const m of months) {
    const d = daysInMonth(m)
    num += (fte.get(m) ?? 0) * d
    den += d
  }
  return den ? num / den : 0
}

/**
 * A variance cell's calculation card (docs/PLAN.md 9.5, a modeled number): a cost cell is the two
 * guarded totals and their difference under rule 5 (the same sides as the cell, so the card shows
 * nothing the cell does not); a heads or FTE cell its two sides and their difference.
 */
export function varianceCellCard(p: FPrep, r: VarianceTableRow): CalcSpec {
  const t = varianceTable(p)
  const title = `${MEASURE_TITLE[r.measure]}, ${r.org}, ${r.windowLabel}`
  const sides = r.measure === 'cost' ? t.sides.get(rowKey(r.orgKey, 'cost', r.windowKey)) : undefined
  if (sides)
    return differenceCard(p, {
      title,
      metricId: ID.varianceCost,
      a: sides.a.figure,
      b: sides.b.figure,
      aLabel: `${p.fiscalYear} actual and forecast`,
      bLabel: p.comparison?.name ?? 'Comparison',
      delta: sides.delta,
      noDelta: r.reason,
      uses: p.uses(FIGURE.variance),
    })
  const format: Format = r.measure === 'cost' ? (p.env.mode === 'rounded' ? 'moneyM' : 'money') : 'num1'
  const metricId =
    r.measure === 'heads' ? ID.varianceHeads : r.measure === 'fte' ? ID.varianceFte : ID.varianceCost
  return {
    title,
    subtitle: subtitleOf(r.windowLabel, p.ctx.scopeLabel, p.comparison?.name),
    metricId,
    value: r.variance,
    format,
    inputs: [
      calcInput('Actual and forecast', r.actual, format, `${p.working?.name ?? 'Working'} forecast`),
      calcInput(p.comparison?.name ?? 'Comparison', r.comparison, format, 'The comparison version'),
    ],
    steps:
      r.variance != null && r.actual != null && r.comparison != null
        ? [
            calcStep(
              'Variance = actual and forecast − comparison',
              `${fmt(r.actual, format)} − ${fmt(r.comparison, format)}`,
              r.variance,
              format,
            ),
          ]
        : [calcStep(r.reason ?? 'Hidden', '—', null, format)],
    ...(r.reason ? { note: r.reason } : {}),
    uses: p.uses(FIGURE.variance),
  }
}

const MEASURE_TITLE: Record<VarianceRow['measure'], string> = {
  heads: 'Heads variance',
  fte: 'FTE variance',
  cost: 'Cost variance',
}

export function varianceTable(p: FPrep): VarianceTable {
  const hit = memo.get(p)
  if (hit) return hit
  const windows = windowsOf(p)
  const orgs = orgsOf(p)
  const v = p.comparison
  const yearHasLocked = p.ctx.versions.some((x) => x.state === 'locked' && x.fiscalYear === p.fiscalYear)
  if (!v || !p.run) {
    const out: VarianceTable = {
      rows: [],
      empty: v ? 'No forecast for this fiscal year.' : emptyComparisonReason(p.fiscalYear, yearHasLocked),
      orgs,
      windows,
      sides: new Map(),
    }
    memo.set(p, out)
    return out
  }
  const cmpLines = versionLinesOf(p.ctx, v)
  const fyMonths = new Set(p.fyMonths)
  const rows: VarianceTableRow[] = []
  const sides = new Map<string, { a: DiffSide; b: DiffSide; delta: GuardedDifference }>()
  const env = p.env
  const place = placementOf(p.ctx)
  const roots = [...costIdsOf(p.ctx)].filter((id) => !p.scope.ids.has(id))
  const withRoots = (org: VarianceOrg): ReadonlySet<string> => {
    if (!roots.length || org.level === 'subOrg') return org.ids
    const extra = roots.filter((id) => {
      const r = place.get(id)
      return org.level === 'unit' ? org.label === r?.businessUnit : org.label === r?.department
    })
    return extra.length ? new Set([...org.ids, ...extra]) : org.ids
  }
  // Heads and FTE: every org's figures in one pass over each side's lines.
  const headsBy = orgsByPosition(orgs)
  const curFigures = figuresOf(p.lines, headsBy, orgs.length, fyMonths)
  const cmpFigures = figuresOf(cmpLines, headsBy, orgs.length, fyMonths)
  // A tree's own seats (rounded modes: the leader's atom, ./guarded.ts `costIdsOf`) count in the
  // scope's cost and in their own unit's and department's, never in a sub-org's.
  const costIdsOfOrg = orgs.map((org) => (org.level === 'company' ? null : withRoots(org)))
  // Each org's cost members are the company's members (./members.ts) kept to its positions (the cost
  // selection for the scope as a whole): the members its own filter of the cost selection's keeps,
  // in positionId order. Each side's guarded total is kept by what it is made of (`guardedSideOf`).
  const run = p.run
  const allCost = costIdsOf(p.ctx)
  const orgCost = costIdsOfOrg.map((ids) => ids ?? allCost)
  const signatureOf = new Map<number, number>()
  const orgSignature = (o: number): number => {
    let sig = signatureOf.get(o)
    if (sig === undefined) {
      sig = idsSignature(orgCost[o])
      signatureOf.set(o, sig)
    }
    return sig
  }
  for (const [o, org] of orgs.entries()) {
    const cur = curFigures[o]
    const cmp = cmpFigures[o]
    const costIds = costIdsOfOrg[o]
    const union = env.mode !== 'rounded' || org.level === 'company' || isWholeUnion(p.ctx, costIds ?? org.ids)
    for (const w of windows) {
      if (w.window === 'month' && org.level !== 'company' && org.level !== 'unit') continue
      const last = w.months[w.months.length - 1]
      const push = (
        measure: VarianceRow['measure'],
        actual: number | null,
        comparison: number | null,
        variance: number | null,
        reason: string | null,
      ) =>
        rows.push({
          orgKey: org.key,
          org: org.label,
          level: org.level,
          measure,
          window: w.window,
          actual,
          comparison,
          variance,
          reason,
          windowKey: w.key,
          windowLabel: w.label,
        })
      const ha = last ? (cur.heads.get(last) ?? 0) : 0
      const hb = last ? (cmp.heads.get(last) ?? 0) : 0
      push('heads', ha, hb, ha - hb, w.months.length ? null : 'No closed month in this window yet.')
      const fa = avgFte(cur.fte, w.months)
      const fb = avgFte(cmp.fte, w.months)
      push('fte', fa, fb, fa - fb, w.months.length ? null : 'No closed month in this window yet.')
      // Cost.
      if (env.mode === 'none') {
        push('cost', null, null, null, guardFigure(p.ctx, { members: [], version: p.working }).reason)
        continue
      }
      if (env.mode === 'rounded' && w.window === 'month') {
        push('cost', null, null, null, env.monthlyShown ? ROUNDED_PERIOD_NOTE : SHOWS_IN_FINANCE_NOTE)
        continue
      }
      if (!union) {
        push('cost', null, null, null, WHOLE_TEAMS_NOTE)
        continue
      }
      const costMonths = w.costMonths ?? w.months
      if (!costMonths.length) {
        push('cost', null, null, null, 'No closed month in this window yet.')
        continue
      }
      const partial = org.level === 'department' || undefined
      const sig = orgSignature(o)
      const a = guardedSideOf(p.ctx, run.lines, costMonths, orgCost[o], sig, p.working, partial)
      const b = guardedSideOf(p.ctx, cmpLines, costMonths, orgCost[o], sig, v, partial)
      const d = guardedDeltaOf(p.ctx, a, b)
      sides.set(rowKey(org.key, 'cost', w.key), { a, b, delta: d })
      const reason =
        d.value == null ? (d.reason ?? a.figure.reason ?? b.figure.reason) : (a.figure.note ?? null)
      push('cost', a.figure.total.totalUsd, b.figure.total.totalUsd, d.value, reason)
    }
  }
  const out: VarianceTable = { rows, empty: null, orgs, windows, sides }
  memo.set(p, out)
  return out
}
