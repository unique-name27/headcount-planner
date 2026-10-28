/**
 * Plan > Recruiting summary's model (docs/PLAN.md 9.8, change C38): one screen to show the head of
 * recruiting, for the mode's own scope (Manager: the tree strictly below the manager's seat, R23;
 * HRBP: the unit; Leader: the org; Finance: the company under its filters; HR admin), in heads only.
 *
 * It is Plan > Hiring's numbers on one page, read from the same engine run and the same forecast
 * (./hiringModel.ts `hiringBuiltOf`): approved heads, current heads, open to hire, future starts and
 * projected attrition are Plan > Hiring's own values, and hiring velocity is its 3-month hire pace.
 * Every count Plan > Hiring also shows is counted the same way and opens the same records; the
 * approved heads and current heads tiles open a calculation card of this tab's that lists Plan >
 * Hiring's records for that cell (current heads uses Plan > Hiring's own card in Manager mode when
 * someone is not in plan). Projected starts, projected heads and the gap to approved heads are this
 * tab's own: projected starts are the forecast's starts on Open and Planned seats with no signed
 * offer, at their fill rate, and its modeled backfills (./hiringData.ts `projectedStartsOf`), labelled
 * a model and always apart from future starts (signed offers).
 *
 * Like Plan > Hiring it is its own model, not a `PlanModel` field (it reads the forecast), cached per
 * context (`planRecruitingModel`); `ui/model.ts` `usePlanRecruiting` wraps it and the leak crawl reads
 * it under tab `plan.recruiting` (src/views/tabModels.ts). The rules it keeps are Plan > Hiring's
 * (./hiringTab.ts): heads only, 8.4, exits never leave, drills under the mode's rules.
 */
import type { DeckNumber } from '@/charts/types'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { FiscalYear, Month } from '@/data/schema'
import { fmt, plural } from '@/lib/format'
import type { FigureData, TabModel } from '../../types'
import { ID } from '../metrics'
import type { QuarterKey } from './hiringTab'
import { computeRecruiting } from './recruitingModel'

/* ───────────── the seven numbers ───────────── */

/** The strip in order (9.8 item 1): each tile's id (src/access/ids.ts `RECRUITING_KPI_IDS`), metric and label. */
export const RECRUITING_KPIS = [
  { id: 'recruiting-approved', metricId: ID.hiringApprovedByQuarter, label: 'Approved heads' },
  { id: 'recruiting-current', metricId: ID.hiringCurrentHeads, label: 'Current heads' },
  { id: 'recruiting-open', metricId: ID.hiringOpen, label: 'Open to hire' },
  { id: 'recruiting-future', metricId: ID.hiringAcceptedStarts, label: 'Future starts' },
  { id: 'recruiting-projected', metricId: ID.recruitingProjectedStarts, label: 'Projected starts' },
  { id: 'recruiting-attrition', metricId: ID.hiringExpectedExits, label: 'Projected attrition' },
  { id: 'recruiting-velocity', metricId: ID.hiringPace, label: 'Hiring velocity' },
] as const

export type RecruitingKpiId = (typeof RECRUITING_KPIS)[number]['id']

/** The words that keep the two kinds of start apart (9.8 Words). */
export const FUTURE_STARTS_NOTE = 'Signed offers, by start date'
export const PROJECTED_STARTS_NOTE = 'Model: fill rate, time to fill and backfills'
/** Where no Working forecast exists, so projected starts and modeled exits are not known. */
export const NO_FORECAST_NOTE = 'No Working forecast yet'
/** Projected attrition's note with no Working forecast: it holds the known exits alone. */
export const KNOWN_EXITS_ONLY_NOTE = 'Known exits only: no Working forecast yet'

/** A gap that rounds to 0.0: projected heads meet approved heads (review RU-15). */
export const ON_APPROVED_TEXT = 'On approved heads'

/** A gap below 0 at a quarter end: "Short by 2.4"; above 0: "Over by 1.0"; one decimal; 0.0: "On approved heads". */
export function gapText(gap: number): string {
  const shown = fmt(Math.abs(gap), 'num1')
  if (shown === fmt(0, 'num1')) return ON_APPROVED_TEXT
  return gap < 0 ? `Short by ${shown}` : `Over by ${shown}`
}

/* ───────────── the chart ───────────── */

/**
 * One month of "Heads and hiring by month" (`plan-recruiting-months`): a closed month's actual hires,
 * exits and heads at its end; a month that ended on or before the as-of date but is not closed yet
 * (`ended`, review RN-1), the same from the HRIS; or a month ahead's future starts (signed offers),
 * moves in, projected starts (the model), projected attrition (known and modeled exits) and projected
 * heads at its end. The month that holds a mid-month as-of date also carries its actual hires and
 * exits to the as-of date (review RU-5), so its bars net to the line's step. The rare terms of
 * projected heads (a last day on the as-of date, a signed offer past its start date, a pre-hire;
 * reviews RN-2 to RN-4) ride on the first month they count in. Approved heads (at the fiscal year
 * end) ride on every row as the chart's reference line. A field a month's kind does not fill is null,
 * and so are projected starts and projected heads with no Working forecast.
 */
export interface RecruitingMonthRow {
  [key: string]: unknown
  month: Month
  /** "Oct 2026". */
  label: string
  kind: 'actual' | 'ended' | 'ahead'
  /** "Closed", "Ended, not closed", "Actual to 15 Oct, then ahead" or "Ahead". */
  kindText: string
  /** Hires in the month (closed or ended), or to the as-of date (the as-of month ahead). */
  hires: number | null
  exits: number | null
  heads: number | null
  futureStarts: number | null
  movesIn: number | null
  /** People in current heads whose last day is the as-of date: out from the first month ahead. */
  leaving: number | null
  /** Signed offers past their start date that the HRIS has not recorded: in from the first month ahead. */
  pastStart: number | null
  /** Hires the HRIS already holds, starting in the month, with no signed offer on their seat. */
  preHires: number | null
  projectedStarts: number | null
  projectedExits: number | null
  projectedHeads: number | null
  approved: number | null
}

/* ───────────── the quarter table ───────────── */

/**
 * One quarter ahead of "By quarter ahead" (`plan-recruiting-quarters`, a quarter Plan > Hiring reads
 * as ahead that ends after the as-of date): approved heads by its end and, from the as-of date to its
 * end, the future starts, moves in, projected starts and projected attrition, then projected heads at its
 * end and the gap to approved heads. The counts are Plan > Hiring's A(q), S(q), M(q) and E(q) exactly.
 * Projected starts, projected heads and the gap are null with no Working forecast.
 */
export interface RecruitingQuarterRow {
  [key: string]: unknown
  key: QuarterKey
  /** "Q3, Oct to Dec". */
  label: string
  approved: number | null
  futureStarts: number | null
  movesIn: number | null
  /** From the as-of date to the quarter end, as the month rows' terms. */
  leaving: number | null
  pastStart: number | null
  preHires: number | null
  projectedStarts: number | null
  projectedExits: number | null
  projectedHeads: number | null
  /** projectedHeads − approved. */
  gap: number | null
  /** "Short by 2.4", "Over by 1.0", "On approved heads", or null with no projection. */
  gapNote: string | null
}

/* ───────────── where hiring happened ───────────── */

/** How many places each list of "Where hiring happened" shows (9.8 item 4). */
export const WHERE_TOP = 5

/** Places beyond the top 5 with as many hires as the fifth (review RN-7): how many, and their hires. */
export interface WhereTie {
  tied: number
  hires: number
}

/**
 * The line under a list of "Where hiring happened": "and 4 more locations", and where places beyond
 * the cut have as many hires as the fifth, "and 4 more locations, 1 tied with the fifth at 3 hires".
 */
export function whereMoreText(
  more: number,
  tie: WhereTie | null,
  noun: readonly [string, string],
): string | null {
  if (more <= 0) return null
  const base = `and ${more} more ${more === 1 ? noun[0] : noun[1]}`
  return tie && tie.tied > 0
    ? `${base}, ${tie.tied} tied with the fifth at ${plural(tie.hires, 'hire')}`
    : base
}

/**
 * One place of "Where hiring happened" (`plan-recruiting-where`): a location or a department, its
 * hires over the last 3 closed months (Plan > Hiring's C37 table's sub-total) and their pace.
 */
export interface RecruitingWhereRow {
  [key: string]: unknown
  key: string
  kind: 'location' | 'department'
  /** "Location" or "Department". */
  kindText: string
  name: string
  hires: number
  perMonth: number | null
}

/* ───────────── the tab ───────────── */

export interface PlanRecruiting extends TabModel {
  fiscalYear: FiscalYear
  /** The seven tiles of `RECRUITING_KPIS`, in order (fewer when the mode hides a metric). */
  kpis: Kpi[]
  months: FigureData<RecruitingMonthRow>
  quarters: FigureData<RecruitingQuarterRow>
  where: FigureData<RecruitingWhereRow>
  /** The places beyond the top 5 of each list: "and 3 more locations". */
  whereMore: { locations: number; departments: number }
  /** The places beyond the top 5 tied with the fifth, by list (null: no tie at the cut, RN-7). */
  whereTies: { locations: WhereTie | null; departments: WhereTie | null }
  /**
   * The tiles' numbers as text, before the data standard's gates (9.8 item 5). The slide never prints
   * these: the screen builds its numbers with each tile's gate (ui/Recruiting.tsx `summaryNumbersOf`),
   * so a tile the strip holds back prints "—" and why there too.
   */
  deckNumbers: readonly DeckNumber[]
}

/** Plan > Recruiting summary's model for a context, cached per context (./recruitingModel.ts builds it). */
export function planRecruitingModel(ctx: AnalyticsContext): PlanRecruiting {
  let m = cache.get(ctx)
  if (!m) {
    m = computeRecruiting(ctx)
    cache.set(ctx, m)
  }
  return m
}

const cache = new WeakMap<AnalyticsContext, PlanRecruiting>()
