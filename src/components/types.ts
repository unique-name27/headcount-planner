/**
 * The shapes every view model returns and the shared components render (the template app's
 * components/types.ts with HCP's changes, docs/PLAN.md 9): a KPI tile opens its records (`drill`) or,
 * for a modeled number, its calculation card (`calc`); a readout finding lists positions, never
 * people (`FindingPosition`), so no name sits beside a cost or an elimination.
 *
 * Every KPI on a tab or home has `metricId`, `uses` and a `drill` or `calc` (a test per view), and
 * every "vs" figure names its comparison (`deltaLabel` from `compareDeltaLabel`, src/data/context.tsx).
 * Missing or hidden values are null (rendering "—"), never 0. Amounts on a tile come from the cost
 * guard's output (src/cost/guard.ts), and none is ever written into `note`, `formula`, a finding's
 * `title` or `detail` (docs/PLAN.md 7.2 rule 6).
 *
 * Types only. Frozen in the M2 freeze (docs/CONTRACTS-M2.md). src/access/numbers.ts reads `metricId`,
 * `positions` and `positionsTotal` (`kpisInMode`, `findingsInMode`).
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import type { RouteView } from '@/data/schema'
import type { Filters } from '@/data/scope'
import type { CalcSource } from '@/drill/calc'
import type { DrillSource } from '@/drill/types'
import type { Format } from '@/lib/format'

/**
 * A tab of another view a tile opens: Plan > Openings' "Hires YTD" re-linked onto the HRBP home
 * opens Plan, Openings. The producer names it, so shared components never import the view registry.
 */
export interface ViewLink {
  view: RouteView
  tab?: string
  /** Where it goes, for the accessible name: "Plan, Openings". */
  label: string
}

/** A headline number. Missing data is `null` (renders "—"), never 0. */
export interface Kpi {
  id: string
  /**
   * The metric dictionary entry this tile shows ('plan.heads.approved'). Its info popover reads the
   * definition from the dictionary, and the mode hides the tile when it hides the metric
   * (`kpisInMode`). A strip has at most one tile per metric id: homes re-link tiles by it (9.3).
   */
  metricId?: string
  label: string
  value: number | null
  format: Format
  /** Change vs the comparison, in the same unit as value; null when the guard hides it (7.2 rule 5). */
  delta?: number | null
  /** What the delta compares against: "vs FY27 Budget", "vs plan of record (Q1 Reforecast)", "vs FY28 target". */
  deltaLabel?: string
  /**
   * Why a tile that names its comparison has no change (`delta` null): "FY28 has no locked version
   * yet." (docs/PLAN.md 9.2). The change row shows "—", the comparison and this. An addition to the
   * M2 freeze; without it a target comparison's reason is used (src/components/kpiModel.ts `emptyDelta`).
   */
  deltaEmpty?: string
  /** Which direction is good; null = neutral (delta shown in gray). */
  goodDirection?: 'up' | 'down' | null
  /** Only color the delta when it clears the materiality gate. */
  deltaMaterial?: boolean
  /** Up to ~12 points, oldest first; the last point is the current period. Never a monthly cost series in rounded modes. */
  spark?: (number | null)[]
  /** Short sub-line under the value, e.g. "24 heads, 27.40 standard heads". No amount (7.2 rule 6). */
  note?: string
  /** Shown instead of the value: "Hidden to protect anonymity (n < 5)", a fit reason, "Shows in Finance mode." */
  suppressed?: boolean
  /** The reason under a suppressed value (the guard's `reason`). */
  suppressedNote?: string
  /** Tab to open when the tile is clicked. */
  tab?: string
  /** A tab of another view to open when the tile is clicked, in place of `tab`. */
  link?: ViewLink
  /** Plain-English definition for the info popover (from the dictionary). */
  definition?: string
  /**
   * How the shown number is worked out right now, as a sentence ("1,450 Filled + 100 Open + 60
   * Planned."). The info popover shows it under the definition. No amount outside the value.
   */
  formula?: string
  /** The records behind a counted or weighted value; clicking the value opens them. */
  drill?: DrillSource
  /** The calculation card behind a modeled value (docs/PLAN.md 9.5); used when there is no `drill`. */
  calc?: CalcSource
  /**
   * The tile opens its card even when its value is "—", so the card can say why there is no value
   * (Plan > Hiring's paces and months to close, review HU-8). Off by default: elsewhere a value of
   * null can be a guarded or hidden number, whose card must not open. An addition to the contract.
   */
  calcWhenEmpty?: boolean
  /** The comparison's records (Targets > Gap for a target comparison, 9.2); clicking the change opens them. */
  deltaDrill?: DrillSource
  /** The calculation card behind a modeled change (a cost difference under 7.2 rule 5). */
  deltaCalc?: CalcSource
  /** The records behind the number in the note. */
  noteDrill?: DrillSource
  /** The fields the number is computed from; its tier is the lowest of theirs. */
  uses?: readonly FieldRef[]
}

export type Severity = 'critical' | 'warning' | 'info' | 'good'

/** A position behind a finding (docs/PLAN.md 9.5): its ID, title and a short note, never a person or an amount. */
export interface FindingPosition {
  positionId: string
  title: string
  note?: string
}

/** One generated finding in a view's readout. Wording rules: plain, sentence case, no nagging verbs, no amount. */
export interface Finding {
  id: string
  /** The metric dictionary entry the finding's number comes from, for its definition and target. */
  metricId?: string
  severity: Severity
  /** One sentence headline with the number in it: "Go-to-Market is 8 heads over the Budget at 30 Sep." */
  title: string
  /** One or two sentences of supporting facts. */
  detail?: string
  /** Suggested next step in neutral, professional wording. */
  action?: string
  /** Positions behind the finding (a short list, at most ~50), kept to the scope (`findingsInMode`). */
  positions?: FindingPosition[]
  /** How many positions the finding covers when `positions` is a capped list. */
  positionsTotal?: number
  /** Rescope the whole app to where the problem concentrates ("Focus on"). */
  filter?: Partial<Filters>
  /** What the reader calls the filter's group when it is not just its values. */
  filterLabel?: string
  /** Open this tab of the current view. */
  tab?: string
  /** The records behind the finding's number. */
  drill?: DrillSource
  /** The calculation card behind a modeled number in the finding. */
  calc?: CalcSource
  /** The fields the finding's number is computed from; its tier is the lowest of theirs. */
  uses?: readonly FieldRef[]
}
