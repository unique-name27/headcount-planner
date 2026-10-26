/**
 * Drill-down (docs/PLAN.md 9.5; the template app's drill/types.ts with HCP's kinds): every counted
 * number opens exactly the records it counts (`rows.length === value`), every weighted number opens
 * rows with a "Counts as" column whose sum is the figure (`weight`), and every modeled number opens a
 * calculation card (./calc.ts). Rows that name a position open its position card.
 *
 * A view hands over the records behind a number plus a title; the drill panel turns them into a
 * readable, sortable, exportable table with the standard columns of that kind (src/drill/records.ts).
 * The mode decides each kind (`drill:<kind>`) and the columns it hides (`column:<kind>.<key>`,
 * docs/PLAN.md 8.3): amount columns are `pay: true`, the band estimate `band: true`, component
 * columns follow `cost:component`, leave columns show in HR admin only.
 *
 * Records that 8.4's person-level rules shape per row are handed over already shaped: a request is a
 * `RequestRecord` (limited rows carry only position ID, title, level and org; ./requestRecord.ts
 * builds them), an audit row an `AuditRow` from `auditView`, a cost group a guarded `CostRow`. A
 * request hidden by rule 3 is never a row.
 *
 * Types and three tiny helpers. Frozen in the M2 freeze (docs/CONTRACTS-M2.md). `DrillRecordMap`'s
 * keys are exactly src/access/ids.ts `DRILL_KINDS` (the policy decides each one; checked below at
 * compile time and in src/views/contracts.test.ts). `DrillSource` lives here, not in Drill.tsx, so the
 * engines and the shared shapes import no React; Drill.tsx re-exports it.
 */
import type { DrillKind } from '@/access/ids'
import type { Column } from '@/charts/types'
import type { Severity } from '@/components/types'
import type { CostRow } from '@/cost/guard'
import type { FieldRef } from '@/data/quality/fieldRef'
import type {
  AssumptionRow,
  DatasetKey,
  FreezeRow,
  ISODate,
  ISODateTime,
  Level,
  ReasonCode,
  ReqRow,
  RequestState,
  RequestType,
  TargetRow,
  WorkerRow,
} from '@/data/schema'
import type { Filters } from '@/data/scope'
import type { ReconException } from '@/plan/engine/reconcile'
import type {
  Adjustment,
  Assignment,
  AuditRow,
  PlanLine,
  Position,
  StepRoleCode,
  Version,
} from '@/plan/types'
import type { CalcSpec } from './calc'

export type { DrillKind } from '@/access/ids'

/* ───────────── records shaped per viewer ───────────── */

/**
 * A request as the viewer may see it (docs/PLAN.md 8.4), flat so a table's columns read it. 'full'
 * (rule 1, and rule 2a's transfer viewers) carries every field; 'limited' (rule 2: a Leader or
 * Finance on an Elimination or a change to a Filled seat) carries only the request and position IDs,
 * the type and state, the title, level and org: every other field is null. A Backfill names the
 * leaver's position, never the leaver (rule 4). No amount but the band estimate, and that only where
 * `cost:band` shows (never in Manager mode). No comment text: comments go through `commentVisible`
 * where they are shown.
 */
export interface RequestRecord {
  requestId: string
  view: 'full' | 'limited'
  type: RequestType
  state: RequestState
  positionId: string | null
  jobTitle: string | null
  level: Level | null
  businessUnit: string
  department: string | null
  /** The org it sits under, as a position ID (names never key a row). */
  managerPositionId: string
  /* full only (null when limited) */
  requesterId: string | null
  requesterName: string | null
  reasonCode: ReasonCode | null
  location: string | null
  fte: number | null
  /** The proposed start or the date the change takes effect. */
  startDate: ISODate | null
  submittedAt: ISODateTime | null
  /** The step waiting on a decision: its number, role and approver, and the days it has waited. */
  stepN: number | null
  stepRole: StepRoleCode | null
  approverId: string | null
  approverName: string | null
  daysInStep: number | null
  /** Transfers (rule 2a): the moving person's name, from, to and effective date. Never an amount. */
  transferPersonName: string | null
  fromPositionId: string | null
  toPositionId: string | null
  toManagerPositionId: string | null
  effectiveDate: ISODate | null
  /** Trades: weights in basis points of a standard head (`ui:trade-weights`), never USD. */
  giveBp: number | null
  getBp: number | null
  creditBp: number | null
  /** Whole seats received. */
  count: number | null
  /** The band estimate (annual, USD at plan rates) where `cost:band` shows; null otherwise. */
  bandEstimateUsd: number | null
  /**
   * Why a limited row's band estimate is empty (src/lib/export/suppressedFlag.ts `WHY_KEY`: written
   * "Yes" and this sentence in every export's Suppressed and Why columns, 14.1 item 2; review EX-9).
   * Only on a limited row.
   */
  __why?: string
  /** The tracker after approval (from `reqs`): dates only, an accepted offer included. */
  reqOpened: ISODate | null
  interviewing: ISODate | null
  offerAccepted: ISODate | null
  started: ISODate | null
}

/**
 * An Action center item as a record (kind `actionItems`): what is open, who it waits on and when.
 * The About cell opens the item's own records (`subjectDrill`); a row opens the position it is about.
 */
export interface ActionItemRow {
  /** Stable item id (internal; never shown or exported). */
  id: string
  severity: Severity
  /** "Critical", "Watch", "Note". */
  severityLabel: string
  what: string
  /** What the item is about: a position, a request, an org. */
  subject: string
  /** The position the item is about, when it names one. */
  positionId: string | null
  subjectDrill: DrillSource
  /** The owner group: "Managers", "HR business partners". */
  ownerGroup: string
  /** The person it waits on. */
  owner: string
  due: ISODate | null
  /** "4 d overdue", "Due in 3 d", "Due today", "No due date". */
  dueText: string
  /** The view it comes from: "Requests · Approvals". */
  from: string
  /** "Open", "Snoozed until 11 Oct 2026". */
  status: string
}

/** An owner in the Action center (kind `actionOwners`): one row per person, with their open items. */
export interface ActionOwnerRow {
  owner: string
  /** The owner groups they appear in, in owner-group order. */
  ownerGroup: string
  /** The person's employee ID, when known. */
  personId: string | null
  items: number
  overdue: number
  critical: number
  /** Opens this owner's open items. */
  itemsDrill: DrillSource
}

/* ───────────── the kinds ───────────── */

/**
 * The records each drill kind shows (docs/PLAN.md 8.3; docs/notes ux 5.2 plus versions and
 * adjustments). Plan and dataset records are the engines' own types; the three shaped kinds above
 * and `costGroups` (a guarded group total, never one person) are built for the viewer.
 */
export interface DrillRecordMap {
  /** Heads, approved heads, openings; a row opens the position card. */
  positions: Position
  /** Position × version × month; amount columns are `pay: true`. */
  planLines: PlanLine
  assignments: Assignment
  /** Not in plan and reconciliation; leave columns show in HR admin only. */
  workers: WorkerRow
  /** Openings by stage and age; offer amounts are `pay: true`, an accepted offer shows its date. */
  reqs: ReqRow
  requests: RequestRecord
  targets: TargetRow
  freezes: FreezeRow
  assumptions: AssumptionRow
  /** A version's facts (name, state, lock date, hash, engine version), never its lines. */
  versions: Version
  /** Back-dated adjustments by position; amounts only as sums by posted month (Finance > Versions). */
  adjustments: Adjustment
  /** `auditView` output: no `seq`, `prevHash` or `hash` outside HR admin. */
  audit: AuditRow
  exceptions: ReconException
  /** Guarded group totals (`breakdown` rows): components follow `cost:component`. */
  costGroups: CostRow
  actionItems: ActionItemRow
  actionOwners: ActionOwnerRow
}

type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

/** Compile-time check: `DrillRecordMap`'s keys are exactly `DRILL_KINDS` (src/access/ids.ts). */
export const DRILL_RECORD_KINDS: Exactly<keyof DrillRecordMap, DrillKind> = true

/**
 * The dataset whose tier a drill kind's panel shows (and whose Quality panel it opens). Plan-state
 * kinds take the dataset they are built from: lines, versions, exceptions and Action center items the
 * positions; adjustments the workers (HRIS changes); audit rows the requests; cost groups the pay.
 */
export const DRILL_DATASET: Readonly<Record<DrillKind, DatasetKey>> = {
  positions: 'positions',
  planLines: 'positions',
  assignments: 'workers',
  workers: 'workers',
  reqs: 'reqs',
  requests: 'requests',
  targets: 'targets',
  freezes: 'freezes',
  assumptions: 'assumptions',
  versions: 'positions',
  adjustments: 'workers',
  audit: 'requests',
  exceptions: 'positions',
  costGroups: 'comp',
  actionItems: 'positions',
  actionOwners: 'positions',
}

/** The dataset a drill kind's records come from (for its tier and its Quality panel). */
export const drillDataset = (kind: DrillKind): DatasetKey => DRILL_DATASET[kind]

/* ───────────── the spec ───────────── */

export interface DrillExtra<R> {
  /** Extra columns shown after the standard ones ("Days waiting", "Counts as"). */
  columns: Column[]
  /** Values for the extra columns, keyed by column key. (Bivariant so a typed spec fits DrillSpec.) */
  values: { bivarianceHack(row: R): Record<string, unknown> }['bivarianceHack']
}

export interface DrillSpec<K extends DrillKind = DrillKind> {
  kind: K
  /** What the number is, in plain words: "Openings past target start in Silicon Engineering". */
  title: string
  /** Window and scope: "As of 30 Sep 2026 · Silicon Engineering". */
  subtitle?: string
  rows: readonly DrillRecordMap[K][]
  extra?: DrillExtra<DrillRecordMap[K]>
  /** Standard column keys to leave out. */
  hide?: string[]
  /** One-line explanation of how the rows were selected. */
  note?: string
  /** What one row stands for, singular and plural, when the kind's own word would mislead. */
  noun?: readonly [string, string]
  /** The fields the drilled number is computed from (its figure's `uses`): the panel's tier. */
  uses?: readonly FieldRef[]
  /**
   * A weighted number (docs/PLAN.md 9.5: average FTE, probability-weighted starts, half-month heads,
   * asks with eliminations subtracted): what each row counts as, shown as a "Counts as" column. The
   * weights add up to the figure, exactly, before display rounding (tested); a counted number leaves
   * it out and has `rows.length === value`.
   */
  weight?: { bivarianceHack(row: DrillRecordMap[K]): number }['bivarianceHack']
  /**
   * The scope that reproduces the group this number counts ("Filter to this" and "Leave out"), set
   * only where the rows form a group of a filter dimension (`groupFilter`).
   */
  filter?: DrillFilter
  /** What the reader calls the filter's group, when it is not just its values. */
  filterLabel?: string
  /** One action that shows the counted thing where it lives, beside the records. */
  action?: DrillAction
}

/** A button in the records panel that takes the reader from the records to the counted thing. */
export interface DrillAction {
  label: string
  run: () => void
}

/** The filter a drill sets: the same shape findings use for "Focus on". */
export type DrillFilter = Partial<Filters>

/** Build a typed spec without repeating the kind's record type. */
export function drillSpec<K extends DrillKind>(spec: DrillSpec<K>): DrillSpec<K> {
  return spec
}

/** The records behind a number, or a function that gathers them on click. */
export type DrillSource = DrillSpec | (() => DrillSpec | null) | null | undefined

/** The spec behind a source, or null. */
export function resolveDrill(src: DrillSource): DrillSpec | null {
  if (!src) return null
  return typeof src === 'function' ? src() : src
}

/**
 * One sheet in the drill stack (src/drill/store.ts): a record list, a position card, or a
 * calculation card. A number inside the panel pushes its sheet on top; Back walks out again.
 */
export type DrillEntry =
  | { type: 'records'; spec: DrillSpec }
  | { type: 'position'; positionId: string }
  | { type: 'calc'; spec: CalcSpec }

declare module '@/charts/types' {
  interface DrillRegistry {
    source: DrillSource
  }
}
