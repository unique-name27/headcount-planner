/**
 * Surface ids (docs/PLAN.md 8.3): every thing a mode can show, limit or hide has one. They are plain
 * strings with a kind before the first colon ("view:plan", "tab:plan.positions",
 * "figure:home-unit-openings", "metric:plan.cost.loaded", "action:request.trade"), branded so a
 * typo'd literal does not pass where a surface is expected. Build them with `S`.
 *
 * The kinds: `view`, `tab`, `page`, `figure`, `metric`, `kpi`, `drill`, `column`, `dataset`,
 * `help` (`help:article:<id>`, `help:tour:<id>` and Help's other parts), `settings`, `masthead`,
 * `filter`, `export`, `pay`, `leave`, `cost`, `action`, `item`, `ui`, and the frame's `header`,
 * `focus`, `data` (Data room tabs) and `shortcut`. The template app's `ask`, `overlay`, `org`,
 * `person` and `tools` kinds are not in Phase 1. Every id the plan names is listed in `./ids`.
 *
 * Pure. Frozen in the M2 freeze (docs/CONTRACTS-M2.md).
 */
import type { DatasetKey, PageKey, ViewKey } from '@/data/schema'
import type { FilterDimension } from '@/data/scope'
import type { SettingsSection } from '@/data/settings'
import type { ActionId, DrillKind } from './ids'

export type SurfaceId = string & { readonly __surface: true }

/** Make a surface id from its text (for ids that come from data: the inventory, a test). */
export const surface = (id: string): SurfaceId => id as SurfaceId

/** The kind of a surface: the part before the first colon ("view", "help", "action"). */
export const kindOf = (s: string): string => {
  const i = s.indexOf(':')
  return i < 0 ? s : s.slice(0, i)
}

/** The rest after the kind: "view:plan" → "plan". */
export const restOf = (s: string): string => {
  const i = s.indexOf(':')
  return i < 0 ? '' : s.slice(i + 1)
}

/** Controls in the masthead and the page frame. */
export type MastheadControl =
  | 'wordmark'
  | 'company'
  /** The Mode button: "Manager: Priya Raman", "Finance mode"; Acting as is picked from its menu. */
  | 'mode'
  /** "Pay amounts shown · Hide" while HR admin's switch is on. */
  | 'pay-tags'
  /** "Read only: Headcount Planner is open in another tab." */
  | 'read-only'
  | 'actions'
  | 'audit'
  | 'data'
  /**
   * The Workspace menu (M3 freeze): Save a Shareable file, Export requests, Export for a manager,
   * Open a shared file, Import requests, and in HR admin the Full file and Import (Replace or Merge),
   * each item by its own `action:` decision (docs/PLAN.md 5.5, 8.3).
   */
  | 'workspace'
  | 'settings'
  | 'help'
  | 'skip'

/** Controls in the filter row (docs/PLAN.md 9.2): its controls, the two pickers and one menu per dimension. */
export type FilterControl =
  | 'saved-views'
  | 'period'
  /** The version picker (`ver`). */
  | 'version'
  /** The comparison picker (`vs`). */
  | 'compare'
  | FilterDimension
  | 'exclude'
  | 'chain'
  | 'in-scope'
  | 'standard'
  | 'chips'
  | 'reset'

/**
 * Exports that are not actions. The figure CSV and Excel, the whole-view workbook, the deck, the
 * long CSV, the load file and the workspace files are `action:export.*` (docs/PLAN.md 8.3).
 */
export type ExportKind = 'link' | 'records' | 'action-list' | 'data-room' | 'formulas'

/** Pay (docs/PLAN.md 8.3): the switch, one person's amounts, exact totals over 5+, rounded totals. */
export type PayPart = 'switch' | 'amounts' | 'exact' | 'rounded'

/** Leave (docs/PLAN.md 7.7 and 8.3): the one scope count, or leave per person. */
export type LeavePart = 'counts' | 'people'

/**
 * Cost (docs/PLAN.md 8.3): band estimates (trade cards included), monthly cost, and the component
 * family (cost by component, cost incl. SBC, the exit run rate and freeze savings amounts).
 */
export type CostSurfacePart = 'band' | 'monthly' | 'component'

/** Filter to and Leave out in the records panel, Focus on on findings and position cards. */
export type FocusPart = 'filter-to' | 'leave-out' | 'leave-out-leader' | 'finding'

export type ShortcutKey = 'help' | 'keys' | 'tabs' | 'tour'

/**
 * Shared parts: "trade-weights" (weights, ratio, credit and standard heads, in basis points only,
 * never USD; 11.6), "tier-badge", "edit-definition", "route-link", "attention-lists" (Needs
 * attention and Waiting on others), "kpi-delta-company".
 */
export type UiPart =
  | 'trade-weights'
  | 'tier-badge'
  | 'edit-definition'
  | 'route-link'
  | 'attention-lists'
  | 'kpi-delta-company'

export const S = {
  view: (key: ViewKey | string) => surface(`view:${key}`),
  tab: (view: ViewKey | string, tab: string) => surface(`tab:${view}.${tab}`),
  figure: (id: string) => surface(`figure:${id}`),
  metric: (id: string) => surface(`metric:${id}`),
  /** A KPI tile by its id; `decide` reads its metric from `info.metric`. */
  kpi: (id: string) => surface(`kpi:${id}`),
  page: (page: PageKey) => surface(`page:${page}`),
  /** A Data room tab ("quality", "lists"). */
  data: (tab: string) => surface(`data:${tab}`),
  settings: (section: SettingsSection | 'device-files' | string) => surface(`settings:${section}`),
  article: (id: string) => surface(`help:article:${id}`),
  tour: (id: string) => surface(`help:tour:${id}`),
  /** Other parts of Help: "search", "report", "shortcuts", "whats-new", "links", "learn-more". */
  help: (part: string) => surface(`help:${part}`),
  filter: (control: FilterControl) => surface(`filter:${control}`),
  /** A view's header actions, or "scope" (the scope line) and "about". */
  header: (what: ViewKey | 'scope' | 'about' | string) => surface(`header:${what}`),
  export: (kind: ExportKind) => surface(`export:${kind}`),
  drill: (kind: DrillKind | string) => surface(`drill:${kind}`),
  /** One standard column of a drill kind's records ("column:reqs.offerBase"). */
  column: (kind: DrillKind | string, key: string) => surface(`column:${kind}.${key}`),
  focus: (what: FocusPart) => surface(`focus:${what}`),
  dataset: (key: DatasetKey | string) => surface(`dataset:${key}`),
  masthead: (control: MastheadControl) => surface(`masthead:${control}`),
  shortcut: (key: ShortcutKey) => surface(`shortcut:${key}`),
  /** Action center items whose id starts with this ("requests:approve:"). */
  item: (prefix: string) => surface(`item:${prefix}`),
  pay: (part: PayPart) => surface(`pay:${part}`),
  leave: (part: LeavePart) => surface(`leave:${part}`),
  cost: (part: CostSurfacePart) => surface(`cost:${part}`),
  /** An action (docs/PLAN.md 8.3): "action:request.approve". */
  action: (id: ActionId) => surface(`action:${id}`),
  ui: (part: UiPart) => surface(`ui:${part}`),
} as const
