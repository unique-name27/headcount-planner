/**
 * Shared preparation for the Plan view's model (the template app's base.ts): the scope, the version
 * shown and its comparison, the dates heads and openings are read on, the windows, the guard's
 * settings, and the dictionary's wording. Built once per analytics context.
 *
 * Readings taken here (views-1 builder, M2):
 *  - Seats are read on the as-of date (openings, statuses, past start, actual heads). Approved
 *    heads count on the as-of date when it falls in the shown version's fiscal year, else on that
 *    year's last day (FY28 Working shows its year-end plan, R1). Positions are shared plan state:
 *    every version reads the positions as they are now; a version's own figures are its lines.
 *  - Plan heads compare with actual heads at the last closed month-end (Home and Plan, PLAN 12's
 *    window for `plan.heads.actual`), else at the as-of month's end before the first close.
 *  - The period picker's window is the shown version's fiscal year's (`periodWindow`'s
 *    `fiscalYear`, as the header's `ctx.window`): FY28 Working's `fy` is FY28, and its `ytd` and
 *    `qtd` are empty ("FY28 has not started yet") until FY28 starts. A window's months are its
 *    calendar months inside the version's grid; cost is monthly, so a custom range counts whole
 *    months.
 *  - In rounded modes cost to date (`ytd`, `qtd` and Loaded cost YTD) ends at the month-end of the
 *    last close on or before the as-of date (7.3b, C21): never the as-of date's open month, and
 *    never a close after the as-of date. With no such close it covers no month, and the figure reads
 *    "—" with the reason. Heads to date (hires) keep `ytdMonths`.
 */
import type { Definition } from '@/charts/types'
import { type AnalyticsContext, compareDeltaLabel } from '@/data/context'
import { fiscalYearOf, fyRange, monthEnd, monthKey, monthRange, monthsOf, periodWindow } from '@/data/fiscal'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { FiscalYear, ISODate, Month } from '@/data/schema'
import { addDays, formatDate, formatMonth } from '@/lib/dates'
import { uses as usesOf } from '@/metrics/fields'
import type { AnyVersion, LockedVersion } from '@/plan/types'
import {
  comparisonOf,
  gridMonths,
  type LastClose,
  lastCloseOf,
  lastCloseOnOrBefore,
  type PlanScope,
  perContext,
  scopeOf,
} from './core'
import { type GuardEnv, guardEnvOf } from './guarded'
import { scopeUses } from './lineage'
import { type PlanSettings, settingsOf } from './settings'
import { definitionsOf, definitionText } from './wording'

export interface Prep {
  ctx: AnalyticsContext
  set: PlanSettings
  scope: PlanScope
  env: GuardEnv
  version: AnyVersion | null
  /** The shown version's fiscal year (the as-of date's when there is no version). */
  fiscalYear: FiscalYear
  /** The comparison version; null for a target comparison. */
  comparison: LockedVersion | null
  /** "vs FY27 Budget", "vs plan of record (Q1 Reforecast)", "vs FY28 target". */
  vs: string
  /** The day seats are read on (openings, statuses, past start): the as-of date. */
  on: ISODate
  /** The day approved heads are counted on: the as-of date in the version's fiscal year, else its year end. */
  headsOn: ISODate
  lastClose: LastClose | null
  /** The month-end plan heads compare with actual heads at. */
  planMonth: Month
  /** The version's grid months. */
  grid: readonly Month[]
  /** The fiscal year's twelve months. */
  fyMonths: readonly Month[]
  /** From the fiscal year's start through the last closed month (or the as-of month), inside the grid: heads to date. */
  ytdMonths: readonly Month[]
  /**
   * Cost to date: `ytdMonths`, except in rounded modes, where it ends at the last close on or before
   * the as-of date and is empty when there is none (7.3b).
   */
  costYtdMonths: readonly Month[]
  /** Rounded modes: the last close on or before the as-of date, which cost to date ends at; else null. */
  costClose: LastClose | null
  /** Why the period picker's window covers no month ("No closed month in this period yet"), else null. */
  windowEmpty: string | null
  /** The period picker's months, inside the grid. */
  windowMonths: readonly Month[]
  /** The period in words ("FY27", "FY27 year to date"). */
  windowName: string
  /** "30 Sep 2026". */
  onLabel: string
  /** `headsOn` in words. */
  headsOnLabel: string
  /** The definition of a metric, from the dictionary with your changes. */
  text: (id: string) => string
  /** Figure datasheet rows for these metrics. */
  defs: (...ids: string[]) => Definition[]
  /** A lineage plus the fields the active filters read. */
  uses: (...groups: readonly (readonly FieldRef[])[]) => FieldRef[]
}

export const prepare = perContext((ctx): Prep => {
  const version = ctx.version
  const fiscalYear = version?.fiscalYear ?? fiscalYearOf(ctx.asOf)
  const fy = fyRange(fiscalYear)
  const on = ctx.asOf
  const headsOn = ctx.asOf >= fy.start && ctx.asOf <= fy.end ? ctx.asOf : fy.end
  const lastClose = lastCloseOf(ctx.plan)
  const grid = version ? gridMonths(version) : monthsOf(fiscalYear)
  const gridSet = new Set(grid)
  const fyMonths = monthsOf(fiscalYear)
  const through: Month = lastClose ? lastClose.month : monthKey(ctx.asOf)
  const ytdMonths = fyMonths.filter((m) => m <= through && gridSet.has(m))
  const planMonth: Month = headsOn === ctx.asOf ? (lastClose?.month ?? monthKey(ctx.asOf)) : monthKey(headsOn)
  const env = guardEnvOf(ctx)
  const rounded = env.mode === 'rounded'
  const costClose = rounded ? lastCloseOnOrBefore(ctx.plan, ctx.asOf) : null
  const costYtdMonths = !rounded
    ? ytdMonths
    : costClose
      ? fyMonths.filter((m) => m <= costClose.month && gridSet.has(m))
      : []
  const f = ctx.filters
  // Rounded modes: to-date windows end at the cost close; with none, before the year starts, so
  // they cover no month (periodWindow's "No closed month in this period yet").
  // The window of the shown version's fiscal year, as the header's (`ctx.window`, review UI-3): FY28
  // Working's `fy` is FY28, and its year and quarter to date are empty until FY28 starts.
  const w = periodWindow(f.period, ctx.asOf, {
    customStart: f.customStart,
    customEnd: f.customEnd,
    fiscalYear,
    ...(rounded
      ? { closedThrough: costClose?.date ?? addDays(fyRange(fiscalYearOf(ctx.asOf)).start, -1) }
      : {}),
  })
  const windowName = w.name
  const windowMonths: Month[] = w.empty
    ? []
    : monthRange(monthKey(w.start), monthKey(w.end)).filter((m) => gridSet.has(m))
  const filterRefs = scopeUses(f)
  return {
    ctx,
    set: settingsOf(ctx.metrics),
    scope: scopeOf(ctx),
    env,
    version,
    fiscalYear,
    comparison: comparisonOf(ctx),
    vs: compareDeltaLabel(ctx.compare),
    on,
    headsOn,
    lastClose,
    planMonth,
    grid,
    fyMonths,
    ytdMonths,
    costYtdMonths,
    costClose,
    windowEmpty: w.empty
      ? w.label
      : windowMonths.length
        ? null
        : 'No month of this period is in the version shown.',
    windowMonths,
    windowName,
    onLabel: formatDate(on),
    headsOnLabel: formatDate(headsOn),
    text: (id) => definitionText(ctx.metrics, id),
    defs: (...ids) => definitionsOf(ctx.metrics, ...ids),
    uses: (...groups) => usesOf(...groups, filterRefs),
  }
})

/** "Sep 2026". */
export const monthLabel = (m: Month): string => formatMonth(`${m}-01`)

/** The month-end of a month, as a date. */
export const endOf = (m: Month): ISODate => monthEnd(m)
