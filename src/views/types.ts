/**
 * The view contract (docs/PLAN.md 9; the template app's views/types.ts with HCP's changes). A view is
 * a `ViewDef`: a React `View({ tab })`, a pure `headline(ctx)`, the datasets it reads and, for the
 * views that raise Action center items, a pure `actions(ctx)`. Every number a view shows comes from
 * its pure `<key>Model(ctx)` (src/views/<key>/engine/index.ts, cached per context), so tests and the
 * leak crawler (src/testkit/crawl.ts) read the numbers people see; components render the model and
 * compute nothing. The building blocks below (`FigureData`, `TabModel`, `OverviewModel`,
 * `HeroModel`) are what every model is made of.
 *
 * HCP's changes: no Settings feature switches on tabs (the template's `feature` and
 * `withFeatureTabs` are gone); Action center owners are the four approval roles; an item's `place`
 * is required and names its position and org (the HRBP, Leader and Finance lenses, and the scope
 * test in src/access/items.ts); an item carries the requester and approver the routing reads
 * (src/access/items.ts `ITEM_ROUTING`); no item carries an amount (docs/PLAN.md 7.2 rule 6, 9.6).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md). `ActionItem` has every field
 * src/access/items.ts `ItemFacts` reads (src/views/actions/engine `OpenAction` checks it at compile
 * time). `withAccessTabs` is built (the template's, unchanged).
 */
import type { ComponentType } from 'react'
import type { Column } from '@/charts/types'
import type { Finding, Kpi, Severity } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { DatasetKey, ISODate, ViewKey } from '@/data/schema'
import type { CalcSource } from '@/drill/calc'
import type { DrillKind, DrillSource } from '@/drill/types'
import type { Format } from '@/lib/format'

/* ───────────── views and tabs ───────────── */

export interface ViewTab {
  key: string
  label: string
  /**
   * The tab has parts named in the address after a colon (`#finance.assumptions:trade-rates`), and
   * the view gets the whole address to pick one; each part is decided on its own
   * (src/access/ids.ts `TAB_PARTS`).
   */
  parts?: true
}

/**
 * The view with only the tabs the mode shows (`tab:<view>.<tab>`, docs/PLAN.md 8.3); the same object
 * when every tab is shown.
 */
export function withAccessTabs(view: ViewDef, access: Pick<AnalyticsContext['access'], 'can'>): ViewDef {
  const tabs = view.tabs.filter((t) => access.can(`tab:${view.key}.${t.key}`))
  return tabs.length === view.tabs.length ? view : { ...view, tabs }
}

/** The live number printed on a view's folder tab (9.1's "Folder headline"). Must be cheap to compute. */
export interface Headline {
  value: string
  label: string
  /** The metric dictionary entry the number comes from. */
  metricId?: string
  spark?: (number | null)[]
  /** The fields the number is computed from; the folder tab gates it on the data standard like any KPI. */
  uses?: readonly FieldRef[]
}

/** A view's key numbers and readout, read without rendering it (kept for parity; no HCP reader in Phase 1). */
export interface ViewSummary {
  kpis: Kpi[]
  findings: Finding[]
}

/* ───────────── Action center ───────────── */

/** Who an open item waits on: the approval roles (docs/PLAN.md 9.6 owners). */
export type ActionOwnerRole = 'manager' | 'hrbp' | 'leader' | 'finance'

/** Owner groups in the Action center's order. */
export const ACTION_OWNER_ROLES: readonly ActionOwnerRole[] = ['manager', 'hrbp', 'leader', 'finance']

/** Plain names for owner groups (sentence case). */
export const ACTION_OWNER_LABEL: Readonly<Record<ActionOwnerRole, string>> = {
  manager: 'Managers',
  hrbp: 'HR business partners',
  leader: 'Leaders',
  finance: 'Finance',
}

/** What an item is about: a position, a request, a req or an org, by drill kind and id. */
export interface ActionSubject {
  /** The kind of record (drill kind), or 'none' for an item about a group (an org, a manager's asks). */
  kind: DrillKind | 'none'
  /** The record's id: a position ID, request ID or req ID. */
  id?: string
  /** What the reader sees: "P-2589 Senior verification engineer", "Request R-1025". Never a name 8.4 hides. */
  label: string
}

/**
 * Where an item sits (docs/PLAN.md 9.6: every item has `place`): the position it is about, and its
 * unit and department, for the scope test (`itemInScope`) and the lenses. An org item (a sub-org over
 * target, a manager who has not submitted) names the org's head seat.
 */
export interface ActionPlace {
  positionId: string | null
  businessUnit: string | null
  department: string | null
  costCenter?: string | null
  location?: string | null
  legalEntity?: string | null
}

/**
 * One open item a view hands the Action center (docs/PLAN.md 9.6). Ids are
 * `<view>:<kind>:<record>` (the kinds in src/access/ids.ts `ITEM_KINDS`). Wording: a plain
 * description of the state, never a nagging verb, no amount in `what` or `note` (7.2 rule 6), and
 * nothing 8.4 hides from the people who read it (a hidden request raises no item at all, rule 3).
 */
export interface ActionItem {
  /** Stable across recomputes, so Snooze and Mark handled stick: '<view>:<kind>:<record id>'. */
  id: string
  ownerRole: ActionOwnerRole
  /** Employee ID of the owner when known (the step's approver, the manager, the HRBP, the leader). */
  ownerId?: string | null
  /** The owner as shown: a person's name. */
  ownerName: string
  /** For request items: the requester and the step's approver, which the mode lists route on (`ITEM_ROUTING`). */
  requesterId?: string | null
  approverId?: string | null
  /** When it is due; past dates are overdue. Every item has `due` or `closesWhen` (tested). */
  due?: ISODate | null
  severity: Severity
  /** What is open, in plain words without imperatives and without a closing full stop. */
  what: string
  subject: ActionSubject
  /** The view the item comes from, and the tab that explains it. */
  view: ViewKey
  tab?: string
  /** The records behind the item. */
  drill?: DrillSource
  /** One or two plain sentences of context, or a polite ask for the copied note. No amount. */
  note?: string
  /** The fields the item is computed from, so the Action center gates it on the data standard. */
  uses?: readonly FieldRef[]
  /** What kind of work it is, in a plain category-level label ("Approval", "Reconciliation"). */
  kind?: string
  /** The same matter across views: one item survives, the others fold into it. Built from IDs, never labels. */
  matter?: string
  /** Changes when the item's content changes: a handled mark with another fingerprint reopens. */
  fingerprint?: string
  /** How many records the item is about, so undated items of one severity list the larger first. */
  size?: number
  /** Always false in Phase 1 (HCP has no legal-exposure kinds); kept for the ported severity rubric. */
  exposure?: boolean
  /** The record that would close it: "Closes when the imported req's status is Filled or Cancelled". */
  closesWhen?: string
  place: ActionPlace
  /** Items a role's list may fold into one line, keyed alike, with the batch's name in a sentence. */
  batch?: { key: string; label: string }
  /** The item worded for the person it waits on, for Copy note. */
  forOwner?: { what: string; subject?: string; due?: ISODate | null }
  /**
   * Approval items close by request state: "Mark handled" is off for them and only Snooze shows
   * (docs/PLAN.md 9.6), so a browser mark never hides a decision that is still needed.
   */
  snoozeOnly?: true
}

export interface ViewDef {
  key: ViewKey
  /** Tab label, e.g. "Plan". */
  label: string
  /** The page title (h1) when it is not the label: the Home view names the role's home ("Unit plan"). */
  title?: (ctx: AnalyticsContext) => string
  /** The view draws no figures in this context (Home in a mode with no role home). */
  figureless?: (ctx: AnalyticsContext) => boolean
  /** Sub-tabs; the first one is the default (src/access/ids.ts `VIEW_TABS`, a test keeps them equal). */
  tabs: ViewTab[]
  View: ComponentType<{ tab: string }>
  headline: (ctx: AnalyticsContext) => Headline
  /** Datasets the view reads (docs/PLAN.md 9.1), for the badges, empty states and `DATASETS[].usedBy`. */
  datasets: DatasetKey[]
  /** Controls rendered at the right of the view header. */
  HeaderActions?: ComponentType
  summary?: (ctx: AnalyticsContext) => ViewSummary
  /** The view's open items for the Action center, from its engine (no React). Homes and My team have none. */
  actions?: (ctx: AnalyticsContext) => ActionItem[]
}

/* ───────────── what models are made of ───────────── */

/**
 * One figure's data as a model hands it over: the rows the chart draws, the table shows and every
 * export writes, and the words around them. The guard has already run: a hidden amount is null in
 * the row and the column carries its money flag (`pay`, `cost` or `band`), so `visibleColumns` and
 * the leak crawler see the same thing. `columns` may carry `drill` and `calc` per cell.
 */
export interface FigureData<Row extends object> {
  /** The figure id (`<view>-<thing>`, a home's `home-<slug>-<thing>`), from the view's engine/figures.ts. */
  id: string
  /** The metric dictionary entry the figure shows. */
  metric: string
  title: string
  subtitle?: string
  rows: readonly Row[]
  columns: readonly Column<Row>[]
  /** The muted footnote ("12 people in groups under 5 are left out", "As of 30 Sep 2026"). */
  note?: string | null
  /** Why there is nothing to draw ("FY28 has no locked version yet."), or null to draw `rows`. */
  empty: string | null
  uses: readonly FieldRef[]
}

/** A tab's key figures strip. Only Overview tabs have the 5-to-7 rule (9.1); others may be empty. */
export interface TabModel {
  kpis: Kpi[]
}

/** An Overview tab (plan, forecast): 5 to 7 KPIs, then the Readout (span 4) beside the lead figure (span 8). */
export interface OverviewModel extends TabModel {
  findings: Finding[]
}

/** One part of a hero's split bar; the parts add up to the hero's value where they are given (tested). */
export interface HeroPart {
  key: string
  label: string
  count: number
  drill?: DrillSource
}

/** A home's hero (docs/PLAN.md 9.3): one number, its words, its split and its comparison. */
export interface HeroModel {
  /** The hero's figure id (`team-left-to-fill`, `home-unit-heads-vs-plan`). */
  id: string
  metric: string
  title: string
  subtitle?: string
  value: number | null
  format: Format
  /** The words beside the number: "left to fill", "heads at 30 Sep". */
  label: string
  parts: readonly HeroPart[]
  /** What it compares with ("vs FY27 target"), for a "vs" hero. */
  comparison?: { label: string; value: number | null } | null
  drill?: DrillSource
  calc?: CalcSource
  note?: string | null
  /** Why the value reads "—" (the guard's reason), else null. */
  reason?: string | null
  uses: readonly FieldRef[]
}
