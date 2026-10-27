/**
 * Plan > Hiring's model (docs/PLAN.md 9.7, changes C36 and C37): open to hire by quarter, hiring
 * velocity and the hires of the last 3 closed months by department and location, for the mode's own scope (Manager: the tree strictly below the manager's seat, R23; HRBP: the unit;
 * Leader: the org; Finance: the company under its filters; HR admin), in heads only.
 *
 * It is its own model, not a `PlanModel` field: it reads the forecast's exits, and the plan model's
 * budget (under 400 ms, docs/PLAN.md 16.2) must not carry a forecast run. One model per analytics
 * context (`planHiringModel`, cached in a `WeakMap`); `ui/model.ts` `usePlanHiring` wraps it. The
 * leak crawl reads it under tab `plan.hiring`, and the HRBP and Leader homes and My team re-link its
 * Open to hire tile by metric id (src/views/home/engine/figures.ts `HIRING_KEY_FIGURE`,
 * src/views/team/engine/figures.ts `TEAM_HIRING`).
 *
 * The rules it keeps (9.7 Privacy):
 *  - Heads only, in every mode, HR admin with "Show pay amounts" on included: no amount, band
 *    estimate, offer amount or leave fact in a tile, figure, card, drill, finding or export. The
 *    engine input (`hiringInputOf`) carries dates, IDs and head counts only (src/plan/engine/hiring.ts
 *    `HIRING_INPUT_KEYS`), and every drill hides src/access/ids.ts `HIRING_DRILL_HIDE`'s columns.
 *  - 8.4: nothing about a Manager's own seat or above; a request rule 3 hides from the viewer never
 *    moves a count (the counts read approved Working seats, never pending requests).
 *  - Exits are last days in the HRIS, never leave; people on leave stay in current heads and are
 *    never split out.
 *  - Counted numbers drill to exactly their rows (seats as positions, people as workers where the
 *    mode lists them and else the seats they hold, future starts as reqs with dates only, moves in
 *    as the seats they move into); modeled
 *    ones (expected exits, to reach plan, the paces, attrition, months to close) open a calculation
 *    card whose last step is the value.
 *
 * Frozen in the hiring freeze (docs/CONTRACTS-HIRING.md): ids, labels, row keys and shapes are data;
 * the tab builder filled `hiringInputOf` (./hiringData.ts) and `planHiringModel` (./hiringModel.ts
 * builds it, ./hiringDrills.ts its records) and may add fields, never rename or retype these.
 */
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { FiscalYear, Month } from '@/data/schema'
import { type Format, fmt } from '@/lib/format'
import type { HiringInput } from '@/plan/engine/hiring'
import type { FigureData, TabModel } from '../../types'
import { ID } from '../metrics'
import { hiringPrepOf } from './hiringData'
import { computeHiring } from './hiringModel'

/* ───────────── key figures ───────────── */

/**
 * The key figure strip in order (9.7 screen 1): each tile's id (src/access/ids.ts `HIRING_KPI_IDS`),
 * metric and label. "Open to hire" names the fiscal year (`hiringOpenLabel`), so the homes' re-linked
 * tile reads "Open to hire, FY27" too.
 */
export const HIRING_KPIS = [
  { id: 'hiring-open', metricId: ID.hiringOpen, label: 'Open to hire' },
  { id: 'hiring-accepted', metricId: ID.hiringAcceptedStarts, label: 'Future starts' },
  { id: 'hiring-pace', metricId: ID.hiringPace, label: 'Hires per month, 3-month pace' },
  { id: 'hiring-exit-pace', metricId: ID.hiringExitPace, label: 'Exits per month, 3-month pace' },
  { id: 'hiring-net-pace', metricId: ID.hiringNetPace, label: 'Net hiring pace' },
  { id: 'hiring-months-to-close', metricId: ID.hiringMonthsToClose, label: 'Months to close at this pace' },
] as const

/** The headline tile's label: "Open to hire, FY27". */
export const hiringOpenLabel = (fiscalYear: FiscalYear): string => `Open to hire, ${fiscalYear}`

/* ───────────── the quarter table ───────────── */

export const QUARTER_KEYS = ['q1', 'q2', 'q3', 'q4'] as const
export type QuarterKey = (typeof QUARTER_KEYS)[number]

export type HiringRowKey =
  | 'approved'
  | 'current'
  | 'accepted'
  | 'moves'
  | 'open'
  | 'new'
  | 'exits'
  | 'toReach'
  | 'needed'
  | 'hires'
  | 'exitsActual'

/**
 * The quarter table's rows in order (9.7 screen 2): the rows for the quarters ahead, then the closed
 * quarters' hires and exits. `ahead` rows fill the quarters ahead; `history` rows fill the closed
 * quarters (greyed), whose Current heads cell is the actual heads at the quarter end. Moves in by
 * quarter end (C37) shows only when a quarter ahead holds one (`ONLY_WHEN_NOT_ZERO`).
 */
export const HIRING_ROWS: readonly {
  key: HiringRowKey
  label: string
  metric: string
  format: Format
  ahead: boolean
  history: boolean
}[] = [
  {
    key: 'approved',
    label: 'Approved heads by quarter end',
    metric: ID.hiringApprovedByQuarter,
    format: 'int',
    ahead: true,
    history: false,
  },
  {
    key: 'current',
    label: 'Current heads',
    metric: ID.hiringCurrentHeads,
    format: 'int',
    ahead: true,
    history: true,
  },
  {
    key: 'accepted',
    label: 'Future starts by quarter end',
    metric: ID.hiringAcceptedStarts,
    format: 'int',
    ahead: true,
    history: false,
  },
  {
    key: 'moves',
    label: 'Moves in by quarter end',
    metric: ID.hiringMovesIn,
    format: 'int',
    ahead: true,
    history: false,
  },
  {
    key: 'open',
    label: 'Open to hire',
    metric: ID.hiringOpenByQuarter,
    format: 'int',
    ahead: true,
    history: false,
  },
  {
    key: 'new',
    label: 'New to hire in the quarter',
    metric: ID.hiringNewByQuarter,
    format: 'int',
    ahead: true,
    history: false,
  },
  {
    key: 'exits',
    label: 'Expected exits by quarter end',
    metric: ID.hiringExpectedExits,
    format: 'num1',
    ahead: true,
    history: false,
  },
  {
    key: 'toReach',
    label: 'To hire to reach plan',
    metric: ID.hiringToReachPlan,
    format: 'num1',
    ahead: true,
    history: false,
  },
  {
    key: 'needed',
    label: 'Hires needed per month',
    metric: ID.hiringNeededPace,
    format: 'num1',
    ahead: true,
    history: false,
  },
  {
    key: 'hires',
    label: 'Hires in the quarter',
    metric: ID.hiringHiresByMonth,
    format: 'int',
    ahead: false,
    history: true,
  },
  {
    key: 'exitsActual',
    label: 'Exits in the quarter',
    metric: ID.hiringExitsByMonth,
    format: 'int',
    ahead: false,
    history: true,
  },
]

/** Rows the quarter table shows only when one of their cells is not 0 (C37: Moves in by quarter end). */
export const ONLY_WHEN_NOT_ZERO: ReadonlySet<HiringRowKey> = new Set<HiringRowKey>(['moves'])

/** The table's note on its closed quarters. */
export const HISTORY_NOTE =
  'Closed quarters show actual heads at the quarter end, and the quarter’s hires and exits.'

/** A negative open to hire (over plan): "Over by 1", never a hiring target. */
export const overByText = (n: number): string => `Over by ${Math.abs(n)}`
/** Hires needed a month against the 3-month pace. */
export const ON_PACE_TEXT = 'On pace'
/** "Behind by 0.7 a month": the caller formats the number (num1). */
export const behindByText = (shown: string): string => `Behind by ${shown} a month`
/** What a gap under 0.05 a month reads as, where one decimal would show "0.0". */
export const UNDER_A_TENTH = 'less than 0.1'
/**
 * The behind note for a gap in hires a month (`HiringQuarter.behindBy`): "Behind by 0.7 a month", and
 * "Behind by less than 0.1 a month" for a gap one decimal would round to 0.0, so a quarter that is
 * behind never reads as behind by nothing.
 */
export function behindByGap(gap: number): string {
  const shown = fmt(gap, 'num1')
  return behindByText(shown === fmt(0, 'num1') ? UNDER_A_TENTH : shown)
}
/** Months to close when exits match or outrun hires. */
export const NOT_CLOSING_TEXT = 'Not closing at this pace: exits match or outrun hires.'
/** My team's and the homes' note on the two counts (9.7 Homes). */
export const OPEN_TO_HIRE_NOTE =
  'Left to fill counts Open and Planned seats. Open to hire is approved heads less current heads and the future starts to come.'

/**
 * One row of the quarter table: a measure across the fiscal year's quarters. A cell is null where
 * the row does not fill that quarter (an ahead row in a closed quarter, and the reverse).
 */
export interface HiringQuarterRow {
  [key: string]: unknown
  key: HiringRowKey
  label: string
  metric: string
  format: Format
  q1: number | null
  q2: number | null
  q3: number | null
  q4: number | null
  /** Words beside a cell: "Over by 1" on a negative open to hire, "On pace" or "Behind by 0.7 a month". */
  notes: Partial<Record<QuarterKey, string>>
}

/** One bar of open to hire by quarter (`plan-hiring-open`): the quarters ahead; closed quarters carry null. */
export interface HiringOpenRow {
  [key: string]: unknown
  key: QuarterKey
  /** "Q3". */
  label: string
  kind: 'history' | 'ahead'
  open: number | null
  /** "Over by 1" when open is below 0. */
  note: string | null
}

/**
 * One month of hiring velocity (`plan-hiring-velocity`): actual hires and exits, or a month ahead's
 * future starts (signed offers by start month, whole people, C37) and expected exits.
 */
export interface HiringVelocityRow {
  [key: string]: unknown
  month: Month
  /** "Oct 2025". */
  label: string
  kind: 'actual' | 'forecast'
  hires: number
  exits: number
  net: number
}

/** What a row of the recent hires table is: a department and location, a sub-total or the total. */
export type HiringRecentKind = 'pair' | 'department' | 'location' | 'total'

/** The words a sub-total or total row puts in the column it sums over. */
export const ALL_DEPARTMENTS = 'All departments'
export const ALL_LOCATIONS = 'All locations'
/** A seat with no department (the department column's words for it). */
export const NO_DEPARTMENT = 'No department'

/**
 * One row of Hires in the last 3 months, by location and department (`plan-hiring-recent`, C37): a
 * department and location that had a hire, a department's or a location's sub-total, or the total.
 * `m1` to `m3` are the last 3 closed months, oldest first (`months` on the figure's model).
 */
export interface HiringRecentRow {
  [key: string]: unknown
  key: string
  kind: HiringRecentKind
  department: string
  location: string
  m1: number
  m2: number
  m3: number
  total: number
  /** total ÷ 3; null without 3 closed months. */
  perMonth: number | null
}

/* ───────────── the tab ───────────── */

export interface PlanHiring extends TabModel {
  /** The fiscal year shown, whose quarters are the table's columns. */
  fiscalYear: FiscalYear
  /** The six tiles of `HIRING_KPIS`, in order. */
  kpis: Kpi[]
  /** The readout: 0 to 3 findings, positions not people, no amount. */
  findings: Finding[]
  quarters: FigureData<HiringQuarterRow>
  openByQuarter: FigureData<HiringOpenRow>
  velocity: FigureData<HiringVelocityRow>
  /** The pace note under the velocity chart (3- and 6-month paces, attrition in heads), or null. */
  paceNote: string | null
  /** Hires in the last 3 months, by location and department (C37). */
  recent: FigureData<HiringRecentRow>
  /** The months of `recent`'s `m1` to `m3` columns, oldest first (empty with no closed month). */
  recentMonths: readonly Month[]
}

/** The engine's input for a context: heads, dates and IDs only, over the mode's scope (./hiringData.ts). */
export function hiringInputOf(ctx: AnalyticsContext): HiringInput {
  return hiringPrepOf(ctx).input
}

/** Plan > Hiring's model for a context, cached per context (./hiringModel.ts builds it). */
export function planHiringModel(ctx: AnalyticsContext): PlanHiring {
  let m = cache.get(ctx)
  if (!m) {
    m = computeHiring(ctx)
    cache.set(ctx, m)
  }
  return m
}

const cache = new WeakMap<AnalyticsContext, PlanHiring>()
