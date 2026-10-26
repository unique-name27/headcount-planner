/**
 * The Action center engine (docs/PLAN.md 9.6; the template app's actions engine, pure, no React): it
 * collects every view's `actions(ctx)`, keeps the items the mode lists and the scope holds
 * (src/access/items.ts `itemsShown`, `itemInScope`), orders them, and splits them into the mode's
 * Needs attention and Waiting on others by `ITEM_ROUTING` (`roleItems`). The homes and My team read
 * the same split, so every count agrees. Marks (Snooze, Mark handled; localStorage `hcp:actions`) are
 * the page's; approval items are `snoozeOnly`.
 *
 * The page is not a ViewDef: it is reached from the masthead (`#actions`). It reads the view registry
 * through `ViewSource`s it is handed, so no view imports this folder's `index.tsx` (the import rules,
 * src/ship/imports.test.ts); views may import this engine.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md). `OpenAction` extends src/access/items.ts
 * `RoutedItem` with `item: ActionItem`, which checks at compile time that every item has the fields
 * the routing reads. The views-3 builder filled the bodies (./collect.ts and the modules beside it)
 * and added exports.
 */
import type { RoutedItem } from '@/access/items'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { type Collected, collectionOf, type OpenAction, type ViewSource } from './collect'
import { type RoleView, roleView } from './roles'
import { actionKpis } from './summary'

export {
  type BelowStandard,
  type CollectError,
  type Collected,
  cachedCollect,
  collectionOf,
  collectUncached,
  compareActions,
  foldMatters,
  type HiddenReason,
  isTeamName,
  type OpenAction,
  runView,
  sizeOf,
  usesOf,
  type ViewRun,
  type ViewSource,
} from './collect'
export { DUE_BUCKETS, type DueBucket, daysToDue, dueBucket, dueBucketLabel, dueText } from './due'
export { type ActionFilters, filterActions, isFiltering, matchesFilters, NO_FILTERS } from './filters'
export { groupByOwner, type OwnerBlock, type OwnerGroup, ownerCount } from './group'
export { idKind, KIND_LABEL, kindFromId, kindOf } from './kind'
export {
  hashKey,
  type ItemStatus,
  isOpen,
  type Mark,
  type Marks,
  type MarksState,
  type MarkTarget,
  markKeyOf,
  marksFile,
  marksWithin,
  mergeMarks,
  mergeMarksWithin,
  readMarksFile,
  STORAGE_KEY,
  snapshotOf,
  statusOf,
  withHandled,
  withReopened,
  withSnapshot,
  withSnoozed,
} from './marks'
export { askOf, composeNote, DEFAULT_ASK, firstName, greeting, NAGGING, NOTE_MAX_ITEMS } from './note'
export {
  countedOf,
  lensFor,
  listHeader,
  listsLine,
  NEEDS_SHOWN,
  nothingWaiting,
  practiceOf,
  type RoleView,
  roleView,
  showsLists,
  whereOf,
} from './roles'
export {
  countOf,
  foldRoleLists,
  isMine,
  isRollup,
  kindsOf,
  listWords,
  ownersOf,
  QUEUE_FOLD_AT,
  ROLLUP_PREFIX,
  type RollupSpec,
  rollupOf,
  unfold,
} from './rollups'
export {
  drillRows,
  EXPORT_COLUMNS,
  type ExportRow,
  exportRows,
  itemsDrill,
  SEVERITY_ORDER,
  SEVERITY_WORD,
  statusText,
} from './rows'
export { type ActionSettings, settingsOf } from './settings'
export { BLOCKS_PERSON, blocksPerson, severityOf } from './severity'
export {
  type ActionCounts,
  actionKpis,
  countActions,
  type OwnerDueRow,
  type OwnerTableRow,
  ownerDueRows,
  ownerTableRows,
  severityLine,
  type ViewCountRow,
  viewRows,
} from './summary'

/** Compile-time check that an open item has every field the routing reads (`roleItems`). */
const _routed: (a: OpenAction) => RoutedItem = (a) => a
void _routed

/** The Action center for a context: what the mode lists, its key figures and its two lists. */
export interface ActionsModel {
  /** Every item the mode lists inside the scope, open in this browser, ordered (exposure, severity, due, size, owner, id). */
  items: readonly OpenAction[]
  /** Open, overdue, due soon, critical, owners with open items (`ID` in ../metrics), each drilling to its items. */
  kpis: Kpi[]
  needs: readonly OpenAction[]
  waiting: readonly OpenAction[]
  /** Items in neither list (said as a count). */
  left: number
  /** The mode shows the two lists (every mode but HR admin, which lists every item). */
  lists: boolean
  /** Roll-ups marked handled or snoozed in this browser. */
  parked: readonly OpenAction[]
  /** The masthead's number: Needs attention in a role mode, every open item in HR admin; and its critical ones. */
  count: number
  critical: number
  /** The collection behind it (every listed item before marks, the views that failed, the items folded). */
  collected: Collected
}

/**
 * The mark keys of every item the mode lists inside its scope, and of the mode's roll-ups over them:
 * what a marks file saved in this mode may carry, and what one loaded here may change (the M2
 * review, RM-4). Cached per context with the model.
 */
export function listedMarkKeys(ctx: AnalyticsContext, views: readonly ViewSource[]): ReadonlySet<string> {
  const m = actionsModel(ctx, views)
  let keys = listed.get(m)
  if (!keys) {
    const out = new Set<string>()
    for (const a of m.collected.items) out.add(a.markKey)
    // With every item open, each roll-up the mode makes is in its lists.
    for (const a of [...m.needs, ...m.waiting, ...m.parked]) out.add(a.markKey)
    keys = out
    listed.set(m, keys)
  }
  return keys
}

const listed = new WeakMap<ActionsModel, ReadonlySet<string>>()

/** Every view's items for the context, shown and in scope, ordered; a view whose `actions` throws is left out. Cached per context. */
export function collectActions(ctx: AnalyticsContext, views: readonly ViewSource[]): readonly OpenAction[] {
  return collectionOf(ctx, views).items
}

const models = new WeakMap<AnalyticsContext, Map<string, ActionsModel>>()

/** The page's model; `isOpen` applies the browser's marks (every item is open when not given). */
export function actionsModel(
  ctx: AnalyticsContext,
  views: readonly ViewSource[],
  isOpen?: (a: OpenAction) => boolean,
): ActionsModel {
  const collected = collectionOf(ctx, views)
  const build = (): ActionsModel => {
    const view: RoleView = roleView(collected, ctx, isOpen ?? (() => true))
    const items = isOpen ? collected.items.filter(isOpen) : collected.items
    const counted = view.lists ? view.needs : items
    return {
      items,
      kpis: actionKpis(counted, ctx),
      needs: view.needs,
      waiting: view.waiting,
      left: view.left,
      lists: view.lists,
      parked: view.parked,
      count: view.count,
      critical: view.critical,
      collected,
    }
  }
  // With every item open the model is the same for a context: cache it (the masthead and the homes).
  if (isOpen) return build()
  let byViews = models.get(ctx)
  if (!byViews) {
    byViews = new Map()
    models.set(ctx, byViews)
  }
  const key = views
    .filter((v) => v.actions)
    .map((v) => v.key)
    .join(',')
  let out = byViews.get(key)
  if (!out) {
    out = build()
    byViews.set(key, out)
  }
  return out
}
