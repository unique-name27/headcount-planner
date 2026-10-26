/**
 * The Plan view's model (docs/PLAN.md 9.1 and 9.4): positions, heads, openings and transfers for the
 * scope, the version shown and its comparison, every amount through the cost guard
 * (src/cost/guard.ts, `ctx.guard`). One model per analytics context (`planModel`, cached in a
 * `WeakMap<AnalyticsContext, PlanModel>`); `ui/model.ts` is `useMemo(() => planModel(ctx), [ctx])`.
 *
 * Other views read it: the HRBP home re-links Overview's and Openings' tiles and draws
 * `overview.openingsByStage` (`home-unit-openings`); the Finance home re-links Overview's Actual
 * heads and Openings' frozen openings (9.3).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md). The interfaces list what other builders read; the
 * views-1 builder may add fields, never rename or retype these. Row types may gain fields.
 */
import type { CostRow } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import type { ISODate, Level, Month, PositionStatus, ReqStage, RequestState } from '@/data/schema'
import { fmt } from '@/lib/format'
import type { FigureData, Headline, OverviewModel, TabModel } from '../../types'
import { ID } from '../metrics'
import { prepare } from './base'
import { PLAN_FIGURES } from './figures'
import { planFindings } from './findings'
import { seatsOnDay } from './heads'
import { openingsKpis, overviewKpis, positionsKpis, transfersKpis } from './kpis'
import { FIGURE } from './lineage'
import { openingsByAge, openingsTable } from './openingsTab'
import { costByUnit, headsByMonth, headsByUnit, openingsByStage, positionsByStatus } from './overview'
import { positionChanges, positionsGridFigure } from './positionsTab'
import { transferDrafts, transfersTable } from './transfers'

/* ───────────── rows ───────────── */

/** Heads by month: actual heads at each closed month-end against the shown version's and the comparison's plan heads. */
export interface HeadsByMonthRow {
  month: Month
  /** "Sep 2026". */
  label: string
  /** Actual heads at the month-end; null for months not closed yet. */
  actual: number | null
  /** The shown version's plan heads. */
  plan: number | null
  /** The comparison version's plan heads; null for a target comparison. */
  comparison: number | null
}

/** Heads by a group (unit, department, level, location). */
export interface HeadsByGroupRow {
  key: string
  label: string
  /** Null on the "Not in plan" row: people with no position hold no approved head. */
  approved: number | null
  actual: number
  plan: number | null
  comparison: number | null
}

/** Positions by status at the as-of date. */
export interface StatusCountRow {
  status: PositionStatus
  count: number
}

/** Openings (Open and Planned seats) by tracker stage; 'Planned' for seats with no req yet. */
export interface OpeningsStageRow {
  stage: ReqStage | 'Planned'
  label: string
  count: number
}

/** Openings by age band (days since opened). */
export interface OpeningsAgeRow {
  key: string
  /** "0 to 30 days". */
  label: string
  count: number
}

/** One opening in Plan > Openings' table. An accepted offer shows its date only. */
export interface OpeningRow {
  positionId: string
  title: string | null
  level: Level
  businessUnit: string
  department: string | null
  location: string
  status: PositionStatus
  stage: ReqStage | 'Planned'
  reqId: string | null
  daysInStage: number | null
  targetStart: ISODate | null
  pastStart: boolean
  frozen: boolean
  noReq: boolean
  offerAccepted: ISODate | null
}

/**
 * One position in Plan > Positions' grid: positions × months of the shown version, one cell per month
 * (the status at the month-end; heads 1 when Filled). The band estimate shows where `cost:band` does
 * (never Manager, `band: true`), standard heads in every mode (`ui:trade-weights`), and a per-position
 * cost only for HR admin with the switch (`pay: true`, null otherwise).
 */
export interface PositionGridRow {
  positionId: string
  title: string | null
  level: Level
  location: string
  businessUnit: string
  department: string | null
  fte: number
  /** The status at the as-of date. */
  status: PositionStatus
  /** The position's weight in standard heads (`plan.trade.weight`, bp ÷ 10,000). */
  standardHeads: number | null
  bandEstimateUsd: number | null
  costAnnualUsd: number | null
  /**
   * The seat's latest "Changed by your HRBP" note as the viewer may read it (./notes.ts, 9.4: the
   * manager sees it on the seat), or null. An addition of the plan-ui builder (M3).
   */
  hrbpNote: string | null
  /** One cell per month of the version's grid ('2026-04'), in grid order. */
  readonly [month: Month]: PositionStatus
}

/** One transfer (docs/PLAN.md 10.5): names per 8.4 rule 2a, never an amount. */
export interface TransferRow {
  requestId: string
  state: RequestState
  kind: 'position' | 'internal'
  personName: string | null
  fromPositionId: string
  fromOrg: string
  toPositionId: string | null
  toOrg: string
  effectiveDate: ISODate | null
  /** "HRBP (step 2 of 3)", or the final state. */
  step: string
}

/**
 * One "Changed by your HRBP" note as a row (./notes.ts): Plan > Positions' changes and My team's list.
 * No amount (the reason is refused at entry with one, 8.4 rule 5). An addition of the plan-ui builder (M3).
 */
export interface HrbpChangeRow {
  [key: string]: unknown
  positionId: string
  title: string | null
  /** When the change was made (the audit entry's day). */
  on: ISODate
  /** "Changed by your HRBP: start moved from Jan to Mar". */
  change: string
  reason: string | null
}

/**
 * One of the Acting as person's own transfer drafts (they processed it, or it is raised for them), so
 * the HRBP who processed it can submit it from Plan > Transfers. Names per 8.4 rule 2a, never an
 * amount. An addition of the plan-ui builder (M3).
 */
export interface TransferDraftRow {
  requestId: string
  kind: 'position' | 'internal'
  personName: string | null
  fromPositionId: string
  fromOrg: string
  /** The receiving seat (an internal move) or manager position (a position move). */
  toPositionId: string | null
  toOrg: string
  effectiveDate: ISODate | null
  /** "Yes" when the draft moves both orgs' targets too. */
  moveBudget: boolean
}

/* ───────────── tabs ───────────── */

export interface PlanOverview extends OverviewModel {
  headsByMonth: FigureData<HeadsByMonthRow>
  headsByUnit: FigureData<HeadsByGroupRow>
  positionsByStatus: FigureData<StatusCountRow>
  /** Loaded cost by unit, guarded (the guard's rows: Other last; amounts null where hidden). */
  costByUnit: FigureData<CostRow>
  openingsByStage: FigureData<OpeningsStageRow>
}

export interface PlanPositions extends TabModel {
  /** The shown version's grid months, in order (the grid rows' month keys). */
  months: readonly Month[]
  grid: FigureData<PositionGridRow>
  /** "Changed by your HRBP" notes on the scope's seats, newest first (an addition of the plan-ui builder, M3). */
  changes: FigureData<HrbpChangeRow>
}

export interface PlanOpenings extends TabModel {
  byStage: FigureData<OpeningsStageRow>
  byAge: FigureData<OpeningsAgeRow>
  table: FigureData<OpeningRow>
}

export interface PlanTransfers extends TabModel {
  table: FigureData<TransferRow>
  /** The Acting as person's own transfer drafts, to submit (an addition of the plan-ui builder, M3). */
  drafts: FigureData<TransferDraftRow>
}

export interface PlanModel {
  overview: PlanOverview
  positions: PlanPositions
  openings: PlanOpenings
  transfers: PlanTransfers
}

/** The Plan view's model for a context (cached per context). */
export function planModel(ctx: AnalyticsContext): PlanModel {
  let m = cache.get(ctx)
  if (!m) {
    m = computePlan(ctx)
    cache.set(ctx, m)
  }
  return m
}

const cache = new WeakMap<AnalyticsContext, PlanModel>()

/** Builds the model; `planModel` caches it per context. */
export function computePlan(ctx: AnalyticsContext): PlanModel {
  const p = prepare(ctx)
  return {
    overview: {
      kpis: overviewKpis(p),
      findings: planFindings(p),
      headsByMonth: headsByMonth(p),
      headsByUnit: headsByUnit(p),
      positionsByStatus: positionsByStatus(p),
      costByUnit: costByUnit(p),
      openingsByStage: openingsByStage(p),
    },
    positions: {
      kpis: positionsKpis(p),
      months: p.grid,
      grid: positionsGridFigure(p),
      changes: positionChanges(p),
    },
    openings: {
      kpis: openingsKpis(p),
      byStage: openingsByStage(p, PLAN_FIGURES.openingsStage),
      byAge: openingsByAge(p),
      table: openingsTable(p),
    },
    transfers: {
      kpis: transfersKpis(p),
      table: transfersTable(p),
      drafts: transferDrafts(p),
    },
  }
}

/** The folder tab's number: approved heads (9.1). Cheap: it reads the seats only, never a version's lines. */
export function planHeadline(ctx: AnalyticsContext): Headline {
  const p = prepare(ctx)
  const day = seatsOnDay(p, p.headsOn)
  return {
    value: fmt(day.approved.length, 'int'),
    label: 'approved heads',
    metricId: ID.headsApproved,
    uses: p.uses(FIGURE.approved),
  }
}
