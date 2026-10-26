/**
 * Finance > Versions (docs/PLAN.md 6.5, 6.6, 9.4), read only in M2: every version with its state,
 * lock date, hash and engine version (and whether the hash still verifies), and the back-dated
 * adjustments the month closes posted.
 *
 * Outside HR admin with the switch: hire and exit adjustments list by position with no amount;
 * "Other HRIS change" shows only as a count per posted month, when it is 5 or more ("—" otherwise,
 * no drill); adjustment amounts show only as sums by posted month over 5 or more costed people and 5
 * or more contributors (7.2 rules 1 and 5). HRBP and Leader see counts only (rounded modes show no
 * monthly cost, 7.3); Manager mode shows none. The amounts and the "Other HRIS change" count show at
 * company level only, never under a filter or a scope (lead decision D-FIN (d), PLAN change C33,
 * review RF-3: every unit but one, or a level exclusion, less the company gave 1 or 2 people's
 * back-dated changes).
 *
 * Readings taken here (views-2 builder, M2):
 *  - An adjustment is in scope when its position is (an adjustment with no position: when its person
 *    is in the scoped workers).
 *  - A posted month's costed people are the distinct people its adjustments are about; its
 *    contributors the distinct positions (or people with no position) whose amount moves by more
 *    than half a cent. The "Other HRIS change" count reads the same minimum as costed people
 *    (`cost.guard.minCosted`).
 *  - Drill rows never carry an adjustment's amounts: each row's delta is a copy with every amount 0
 *    and no person, so a crawl of the records holds no one's pay.
 *  - A posted month is a row only when it lists a hire or exit or holds 5 or more other HRIS
 *    changes, so 1 to 4 other changes (a back-dated unpaid leave among them) move no row, count or
 *    note (C26). A leave change still counts as a contributor once a month's sum shows (7.2 rule 5).
 *  - Company level (C33 (d)): outside HR admin with the switch, a month's amount and its "Other HRIS
 *    change" count are built once from every adjustment, with no filter or scope, and show only in
 *    a context with no org filter and no scope (`ctx.isCompany`). Under a filter or a scope both
 *    read "—" with `COMPANY_ONLY_NOTE` (or the filter's own reason, `costFit`), and a month is a row
 *    when it lists a hire or exit in scope or is a row of the company's, so neither a row nor a
 *    count moves with the filter. Hires and exits still list by position, in scope.
 *  - The Locked versions tile counts the shown fiscal year's locked versions (a retired Working is
 *    not one); a version's records never carry its lines.
 */

import type { Column } from '@/charts/types'
import type { Kpi } from '@/components/types'
import { DIFF_EPS, differenceNote } from '@/cost/differences'
import { costFit, NO_AMOUNTS_NOTE } from '@/cost/fit'
import { hiddenNote, SHOWS_IN_FINANCE_NOTE } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import type { Month } from '@/data/schema'
import { calcInput, calcStep } from '@/drill/calc'
import { workerNames } from '@/drill/seats'
import { drillSpec } from '@/drill/types'
import { formatMonth } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { ADJUSTMENT_REASON, verifyClose } from '@/plan/engine/close'
import { isLocked, verifyLock } from '@/plan/engine/versions'
import type { Adjustment, AnyVersion, LockedVersion, MonthClose, Version } from '@/plan/types'
import { ID as FORECAST_ID } from '@/views/forecast/metrics'
import type { FigureData } from '../../types'
import { ID } from '../metrics'
import { ACCURACY_COMPANY_NOTE, forecastAccuracyOf, NO_ACCURACY_TEXT } from './accuracy'
import type { FinancePrep } from './base'
import { FINANCE_FIGURES } from './figures'
import type { AdjustmentListRow, AdjustmentMonthRow, CloseRow, FinanceVersions, VersionRow } from './index'
import { versionWrites } from './writes'

const verified = new WeakMap<LockedVersion, boolean>()
const closeVerified = new WeakMap<MonthClose, boolean>()

/** A close's hash still verifies (memoized per close object). */
function closeVerifies(c: MonthClose): boolean {
  let hit = closeVerified.get(c)
  if (hit === undefined) {
    hit = verifyClose(c)
    closeVerified.set(c, hit)
  }
  return hit
}

/** The month closes, newest first: month, when, who, the hash and whether it still verifies. */
export function closeRows(ctx: AnalyticsContext): CloseRow[] {
  const names = workerNames(ctx)
  return [...(ctx.plan?.closes ?? [])]
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .map((c) => ({
      month: c.month,
      closedAt: c.closedAt,
      closedBy: names.get(c.by) ?? c.by,
      hash: c.hash,
      verifies: closeVerifies(c),
      verifiesText: closeVerifies(c) ? 'Hash still verifies' : 'Hash differs',
    }))
}

/** A locked version's hash still verifies (memoized per version object: the check hashes every line). */
export function verifies(v: LockedVersion): boolean {
  let hit = verified.get(v)
  if (hit === undefined) {
    hit = verifyLock(v)
    verified.set(v, hit)
  }
  return hit
}

const KIND_ORDER = { budget: 0, reforecast: 1, working: 2 } as const

/** A version as a record: its facts, never its lines, assumptions or rates. */
export function versionFacts(v: AnyVersion): Version {
  return {
    versionId: v.versionId,
    name: v.name,
    kind: v.kind,
    fiscalYear: v.fiscalYear,
    grid: { from: v.grid.from, to: v.grid.to },
    proration: v.proration,
    state: v.state,
    createdAt: v.createdAt,
    lockedAt: v.lockedAt,
    lockedBy: v.lockedBy,
    engineVersion: v.engineVersion,
    parentId: v.parentId,
    hash: v.hash,
  }
}

/** Every version, by fiscal year, then Budget, reforecasts and Working. */
export function versionRows(ctx: AnalyticsContext): VersionRow[] {
  const names = workerNames(ctx)
  return [...ctx.versions]
    .sort(
      (a, b) =>
        a.fiscalYear.localeCompare(b.fiscalYear) ||
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        (a.lockedAt ?? '9999').localeCompare(b.lockedAt ?? '9999') ||
        a.versionId.localeCompare(b.versionId),
    )
    .map((v) => ({
      versionId: v.versionId,
      name: v.name,
      kind: v.kind,
      fiscalYear: v.fiscalYear,
      state: v.state,
      lockedAt: v.lockedAt,
      lockedBy: v.lockedBy ? (names.get(v.lockedBy) ?? v.lockedBy) : null,
      hash: v.state === 'locked' ? v.hash : null,
      verifies: isLocked(v) ? verifies(v) : null,
      engineVersion: v.engineVersion,
      verifiesText: isLocked(v)
        ? verifies(v)
          ? 'Hash still verifies'
          : 'Hash differs'
        : 'Working, not locked',
    }))
}

/** Why a filtered or scoped context shows no adjustment amount or "Other HRIS change" count (C33 (d)). */
export const COMPANY_ONLY_NOTE = 'Other HRIS changes and adjustment amounts show for the whole company only.'

/**
 * The month closes' subtitle in the glossary's words (Actual, HRIS estimate; month-end; review CP-9).
 */
export const CLOSES_SUBTITLE = 'Actual (HRIS estimate) at each month-end close, each with a checksum'

/** The adjustments in scope. */
export function adjustmentsInScope(p: FinancePrep): Adjustment[] {
  const workers = new Set(p.ctx.data.workers.map((w) => w.employeeId))
  return (p.ctx.plan?.adjustments ?? []).filter((a) =>
    a.positionId ? p.selected.has(a.positionId) : workers.has(a.delta.employeeId),
  )
}

/** An adjustment as a drill record: its amounts 0 and no person. */
function blankAdjustment(a: Adjustment): Adjustment {
  const z = { base: 0, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0 }
  return {
    ...a,
    delta: {
      ...a.delta,
      employeeId: '',
      heads: 0,
      fte: 0,
      active: 0,
      local: { ...z },
      usd: { ...z, equity: 0, loaded: 0 },
    },
  }
}

/** One posted month's facts over a list of adjustments. */
interface MonthFacts {
  hires: number
  exits: number
  others: number
  /** Distinct people the adjustments are about. */
  people: number
  /** Distinct positions (or people with none) whose amount moves by more than half a cent. */
  moved: number
  usd: number
}

function byPostedMonth(list: readonly Adjustment[]): Map<Month, MonthFacts> {
  const groups = new Map<Month, Adjustment[]>()
  for (const a of list) {
    const l = groups.get(a.postedIn)
    if (l) l.push(a)
    else groups.set(a.postedIn, [a])
  }
  const out = new Map<Month, MonthFacts>()
  for (const [month, rows] of groups) {
    const hires = rows.filter((a) => a.kind === 'hire').length
    const exits = rows.filter((a) => a.kind === 'exit').length
    const moved = new Set<string>()
    let usd = 0
    for (const a of rows) {
      usd += a.delta.usd.loaded
      if (Math.abs(a.delta.usd.loaded) > DIFF_EPS) moved.add(a.positionId ?? `person:${a.delta.employeeId}`)
    }
    out.set(month, {
      hires,
      exits,
      others: rows.length - hires - exits,
      people: new Set(rows.map((a) => a.delta.employeeId)).size,
      moved: moved.size,
      usd,
    })
  }
  return out
}

/**
 * Back-dated adjustments by posted month, guarded per 6.6 and C33 (d). A posted month is a row when
 * it lists a back-dated hire or exit, or holds 5 or more other HRIS changes (any change, with the
 * switch): a month whose only postings are 1 to 4 other HRIS changes (a pay, comp, FTE or leave
 * change) shows nothing at all, since a row of its own, or the tile's count of posted months, would
 * say that such a change happened (C26: a back-dated unpaid leave moves no row, count or note).
 * Outside the switch the amount and the "Other HRIS change" count are the company's, shown at
 * company level only (see the module comment).
 */
function monthRows(p: FinancePrep, list: readonly Adjustment[]): AdjustmentMonthRow[] {
  const min = p.rules.minCosted
  const minContributors = p.rules.minContributors
  const open = p.mode === 'open'
  const scoped = byPostedMonth(list)
  // The company's months, from every adjustment (no filter, no scope): what the amounts and counts read.
  const company = open ? scoped : byPostedMonth(p.ctx.plan?.adjustments ?? [])
  const atCompany = open || p.ctx.isCompany
  const fit =
    p.mode === 'exact' ? costFit(p.ctx.filters, p.ctx.access.scope, p.ctx.mode, p.ctx.access.switchOn) : null
  // A row: a month with a hire or exit in scope, or with 5 or more other changes in the company (so
  // no filter or scope moves a row by its own count of other changes); with the switch, every month.
  const months = new Set<Month>()
  if (open) for (const m of scoped.keys()) months.add(m)
  else {
    for (const [m, f] of scoped) if (f.hires + f.exits > 0) months.add(m)
    for (const [m, f] of company) if (f.others >= min) months.add(m)
  }
  const out: AdjustmentMonthRow[] = []
  for (const postedIn of [...months].sort()) {
    const here = scoped.get(postedIn) ?? { hires: 0, exits: 0, others: 0, people: 0, moved: 0, usd: 0 }
    const whole = company.get(postedIn) ?? here
    let amountUsd: number | null = null
    let reason: string | null = null
    if (p.mode === 'none') reason = NO_AMOUNTS_NOTE
    else if (!atCompany) reason = fit ?? COMPANY_ONLY_NOTE
    else if (p.mode === 'rounded') reason = SHOWS_IN_FINANCE_NOTE
    else if (!open && whole.people < min) reason = hiddenNote(min)
    else if (!open && whole.moved < minContributors) reason = differenceNote(minContributors)
    else amountUsd = whole.usd
    out.push({
      postedIn,
      month: postedIn,
      hires: here.hires,
      exits: here.exits,
      other: open ? here.others : atCompany && whole.others >= min ? whole.others : null,
      amountUsd,
      // The positions that moved, only where the amount shows (a count under 5 names a change).
      contributors: amountUsd == null ? null : whole.moved,
      reason,
    })
  }
  return out
}

/** Months as words: "Jul to Sep 2026", "Jul 2026". */
function monthsWords(months: readonly Month[]): string {
  if (!months.length) return ''
  const first = formatMonth(months[0])
  const last = formatMonth(months[months.length - 1])
  if (months.length === 1) return first
  return first.slice(-4) === last.slice(-4) ? `${first.slice(0, 3)} to ${last}` : `${first} to ${last}`
}

/**
 * Forecast accuracy (cost) on Finance > Versions (docs/PLAN.md 6.9, R14, section 12; review SA-1): the
 * fiscal year's latest reforecast against the months closed since its lock (./accuracy.ts, the one
 * engine Forecast > Variance reads too). Company
 * level only; 5 or more costed people (guard class G); rounded and Manager modes hide the tile by
 * policy, and read "—" here as well.
 */
function accuracyKpi(p: FinancePrep): Kpi {
  const { ctx } = p
  const acc = forecastAccuracyOf(ctx, p.fiscalYear)
  const min = p.rules.minCosted
  const reason = !acc
    ? null
    : p.mode === 'none'
      ? NO_AMOUNTS_NOTE
      : p.mode === 'rounded'
        ? SHOWS_IN_FINANCE_NOTE
        : !ctx.isCompany
          ? ACCURACY_COMPANY_NOTE
          : p.mode === 'exact' && acc.costed < min
            ? hiddenNote(min)
            : null
  const value = acc && !reason ? acc.cost : null
  const months = acc ? monthsWords(acc.months.map((m) => m.month)) : ''
  const shown = value != null && acc != null
  return {
    id: 'finance-forecast-accuracy',
    metricId: FORECAST_ID.accuracyCost,
    label: 'Forecast accuracy (cost)',
    value,
    format: 'pct',
    ...(reason ? { suppressed: true, suppressedNote: reason } : {}),
    note: acc ? `${acc.versionName} against the actual for ${months}` : NO_ACCURACY_TEXT,
    definition: p.definition(FORECAST_ID.accuracyCost),
    calc: () =>
      acc
        ? {
            title: 'Forecast accuracy (cost)',
            subtitle: `${acc.versionName} against the actual for ${months} · whole company`,
            metricId: FORECAST_ID.accuracyCost,
            value,
            format: 'pct',
            inputs: acc.months.flatMap((m) => [
              calcInput(
                `${formatMonth(m.month)} forecast`,
                shown ? m.forecastUsd : null,
                'money',
                `${acc.versionName}'s stored forecast, loaded cost`,
              ),
              calcInput(
                `${formatMonth(m.month)} actual`,
                shown ? m.actualUsd : null,
                'money',
                'The month close, loaded cost',
              ),
            ]),
            steps: shown
              ? [
                  calcStep(
                    `Forecast, ${months}`,
                    acc.months.map((m) => fmt(m.forecastUsd, 'money')).join(' + '),
                    acc.forecastUsd,
                    'money',
                  ),
                  calcStep(
                    `Actual, ${months}`,
                    acc.months.map((m) => fmt(m.actualUsd, 'money')).join(' + '),
                    acc.actualUsd,
                    'money',
                  ),
                  calcStep(
                    'Accuracy = 1 − |forecast − actual| ÷ actual',
                    `1 − |${fmt(acc.forecastUsd, 'money')} − ${fmt(acc.actualUsd, 'money')}| ÷ ${fmt(acc.actualUsd, 'money')}`,
                    value,
                    'pct',
                  ),
                ]
              : [calcStep('Forecast accuracy (cost)', '—', null, 'pct')],
            uses: p.uses(FORECAST_ID.accuracyCost),
          }
        : null,
    uses: p.uses(FORECAST_ID.accuracyCost),
  }
}

/** Finance > Versions. */
export function versionsTab(p: FinancePrep): FinanceVersions {
  const { ctx } = p
  const rows = versionRows(ctx)
  const inScope = adjustmentsInScope(p)
  const listed = inScope.filter((a): a is Adjustment & { kind: 'hire' | 'exit' } => a.kind !== 'other')
  const listRows: AdjustmentListRow[] = listed.map((a) => ({
    id: a.id,
    postedIn: a.postedIn,
    forMonth: a.forMonth,
    positionId: a.positionId,
    kind: a.kind,
    reason: ADJUSTMENT_REASON[a.kind],
  }))
  const months = monthRows(p, inScope)
  const locked = ctx.versions.filter((v) => v.fiscalYear === p.fiscalYear && v.state === 'locked')
  const versionColumns: Column<VersionRow>[] = [
    { key: 'name', label: 'Version' },
    { key: 'kind', label: 'Kind' },
    { key: 'fiscalYear', label: 'Fiscal year' },
    { key: 'state', label: 'State' },
    { key: 'lockedAt', label: 'Locked', format: 'date' },
    { key: 'lockedBy', label: 'Locked by' },
    { key: 'hash', label: 'Lock hash' },
    { key: 'verifiesText', label: 'Check' },
    { key: 'engineVersion', label: 'Engine version' },
  ]
  const kpis: Kpi[] = [
    {
      id: 'finance-versions-locked',
      metricId: ID.versionsLocked,
      label: 'Locked versions',
      value: locked.length,
      format: 'int',
      note: `${p.fiscalYear}: ${locked.map((v) => v.name).join(', ') || 'none yet'}`,
      definition: p.definition(ID.versionsLocked),
      drill: () =>
        drillSpec({
          kind: 'versions',
          title: `Locked versions of ${p.fiscalYear}`,
          rows: locked.map(versionFacts),
          uses: p.uses(ID.versionsLocked),
        }),
      uses: p.uses(ID.versionsLocked),
    },
    {
      id: 'finance-close-adjustments',
      metricId: ID.closeAdjustments,
      label: 'Back-dated hires and exits',
      value: listed.length,
      format: 'int',
      note: plural(months.length, 'posted month'),
      definition: p.definition(ID.closeAdjustments),
      drill: () =>
        drillSpec({
          kind: 'adjustments',
          title: 'Back-dated hires and exits',
          subtitle: p.ctx.scopeLabel,
          rows: listed.map(blankAdjustment),
          note: 'By position, with no amount. Other HRIS changes show only as a count per posted month.',
          uses: p.uses(ID.closeAdjustments),
        }),
      uses: p.uses(ID.closeAdjustments),
    },
    accuracyKpi(p),
  ]
  return {
    kpis,
    writes: versionWrites(p),
    versions: figure(
      p,
      FINANCE_FIGURES.versions,
      ID.versionsLocked,
      'Versions',
      'State, lock date, hash and engine version',
      rows,
      versionColumns,
      rows.length ? null : 'No versions in the plan.',
    ),
    closes: figure(
      p,
      FINANCE_FIGURES.closes,
      ID.closeAdjustments,
      'Month closes',
      CLOSES_SUBTITLE,
      closeRows(ctx),
      [
        { key: 'month', label: 'Month' },
        { key: 'closedAt', label: 'Closed', format: 'date' },
        { key: 'closedBy', label: 'Closed by' },
        { key: 'hash', label: 'Hash' },
        { key: 'verifiesText', label: 'Check' },
      ],
      ctx.plan?.closes.length ? null : 'No month is closed yet.',
    ),
    adjustments: figure(
      p,
      FINANCE_FIGURES.adjustments,
      ID.closeAdjustments,
      'Back-dated hires and exits',
      'Posted in the first open month after a close, by position, with no amount',
      listRows,
      [
        { key: 'postedIn', label: 'Posted in' },
        { key: 'forMonth', label: 'For month' },
        { key: 'positionId', label: 'Position ID' },
        { key: 'kind', label: 'Kind' },
        { key: 'reason', label: 'Reason' },
      ],
      listRows.length ? null : 'No back-dated hire or exit.',
    ),
    adjustmentsByMonth: figure(
      p,
      FINANCE_FIGURES.adjustmentsByMonth,
      ID.closeAdjustments,
      'Back-dated adjustments by posted month',
      'Other HRIS changes show as a count of 5 or more; amounts only as sums by month',
      months,
      [
        { key: 'postedIn', label: 'Posted in' },
        { key: 'hires', label: 'Hires', format: 'int' },
        { key: 'exits', label: 'Exits', format: 'int' },
        { key: 'other', label: 'Other HRIS changes', format: 'int' },
        { key: 'amountUsd', label: 'Amount (USD)', format: 'money', cost: true },
        { key: 'reason', label: 'Note' },
      ],
      months.length ? null : 'No back-dated hire or exit. Other HRIS changes show from 5 in a month.',
    ),
  }
}

/** A figure's data. */
export function figure<Row extends object>(
  p: FinancePrep,
  id: string,
  metric: string,
  title: string,
  subtitle: string,
  rows: readonly Row[],
  columns: readonly Column<Row>[],
  empty: string | null,
  note: string | null = null,
): FigureData<Row> {
  return { id, metric, title, subtitle, rows, columns, note, empty, uses: p.uses(metric) }
}
