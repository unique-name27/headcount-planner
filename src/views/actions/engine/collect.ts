/**
 * Collects every view's open items (`ViewDef.actions`) for the Action center, once per analytics
 * context (docs/PLAN.md 9.6; the template app's collect.ts, adapted):
 *
 *  - each view runs on its own; one that throws (or is still being built) is listed in `errors` and
 *    the rest still show;
 *  - the mode lists only the items of the views, tabs, record kinds and item kinds it shows
 *    (`itemsShown`);
 *  - a scoped mode (a Manager's tree, a Leader's org, an HRBP's unit) keeps the items about its scope
 *    (`itemInScope`) and the items that are the Acting as person's own wherever they sit: the steps
 *    waiting on them, the requests they raised, the items they own (the template app's "wide run",
 *    narrowed to the person, since HCP's views compute their items over the data the person may see);
 *  - items about the same matter fold into one (`foldMatters`): a request's `requests:waiting` item
 *    carries the matter of its `requests:approve` item, so a request is one line in every list, HR
 *    admin's included (9.6: "the request is not listed twice");
 *  - one severity rubric (`severityOf`);
 *  - items whose data is below the on-screen standard still show: workflow is not a statistic. Each
 *    is tagged with its tier and counted (`below`), with what holds it back;
 *  - owners named only by name are matched to the people in the data, so one person is one owner
 *    across views.
 *
 * Results are cached per context and per set of source views, so the masthead, the page, the homes
 * and My team share one collection. Pure: no React.
 */
import { itemInScope, itemsShown } from '@/access/items'
import { gateFor, subjectOf } from '@/components/tier/tierModel'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Tier } from '@/data/quality/tier'
import type { DatasetKey, ISODate, ViewKey } from '@/data/schema'
import { timed } from '@/lib/timing'
import {
  ACTION_OWNER_LABEL,
  ACTION_OWNER_ROLES,
  type ActionItem,
  type ActionOwnerRole,
  type ViewTab,
} from '@/views/types'
import { daysToDue } from './due'
import { markKeyOf } from './marks'
import { settingsOf } from './settings'
import { severityOf } from './severity'

/** What the collector reads of a view: a `ViewDef` fits. */
export interface ViewSource {
  key: ViewKey
  label: string
  tabs: readonly ViewTab[]
  datasets: readonly DatasetKey[]
  actions?: (ctx: AnalyticsContext) => ActionItem[]
}

/** The data behind an item is below the on-screen standard: it is listed, tagged with its tier. */
export interface BelowStandard {
  tier: Tier
  /** What holds it back: "Requests steps". */
  subject: string
  dataset: DatasetKey | null
}

/** One open item as the page, the homes and My team list it. */
export interface OpenAction {
  item: ActionItem
  id: string
  /** The key a mark is kept under (stable across recomputes). */
  markKey: string
  role: ActionOwnerRole
  /** "Managers", "HR business partners". */
  roleLabel: string
  /** 'id:<employeeId>' for a known person, else 'name:<owner>'. */
  ownerKey: string
  ownerId: string | null
  ownerName: string
  viewLabel: string
  tabLabel: string | null
  /** "Requests · Approvals". */
  from: string
  /** For request items: the requester and the step's approver (the routing reads them). */
  requesterId?: string | null
  approverId?: string | null
  /** The owner is an owner group with no named person ("HR business partners"), not a person. */
  isTeam: boolean
  /** The position the item is about, when it names one in the data (opens its position card). */
  positionId: string | null
  /** Its data is below the on-screen standard (shown, with its tier); null when it meets it. */
  below: BelowStandard | null
  /** Other views that raised the same matter, folded into this item. */
  alsoFrom: readonly string[]
  /**
   * A roll-up's items (`rollups.ts`): a role's list shows one line for them, and its About opens
   * them. Absent on an item a view raised.
   */
  members?: readonly OpenAction[]
}

/** Items from data below the standard, by what holds them back. */
export interface HiddenReason {
  subject: string
  dataset: DatasetKey | null
  tier: Tier
  count: number
}

export interface CollectError {
  view: ViewKey
  label: string
  message: string
}

export interface Collected {
  /** Every listed item, the most severe and the most overdue first (`compareActions`). */
  items: OpenAction[]
  /** Items whose data is below the on-screen standard: listed with their tier, counted here. */
  below: { count: number; reasons: HiddenReason[] }
  /** Items folded into another item about the same matter. */
  folded: number
  /** Views whose items could not be computed. */
  errors: CollectError[]
  /** Views that contribute items (have `actions`). */
  sources: number
}

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2, good: 3 } as const

/** Owner names that are an owner group rather than a person. */
const TEAM_NAMES = new Set(Object.values(ACTION_OWNER_LABEL).map((n) => n.toLowerCase()))

export const isTeamName = (name: string): boolean => TEAM_NAMES.has(name.trim().toLowerCase())

/* ───────────── one view at a time (cached per context) ───────────── */

export interface ViewRun {
  items: ActionItem[]
  error: CollectError | null
}

const viewRuns = new WeakMap<AnalyticsContext, Map<ViewKey, ViewRun>>()

/** One view's items for one context, cached; a view that throws is reported, not fatal. */
export function runView(ctx: AnalyticsContext, v: ViewSource): ViewRun {
  let byView = viewRuns.get(ctx)
  if (!byView) {
    byView = new Map()
    viewRuns.set(ctx, byView)
  }
  const hit = byView.get(v.key)
  if (hit) return hit
  let run: ViewRun
  try {
    run = { items: timed(`hcp:actions:${v.key}`, () => v.actions?.(ctx) ?? []), error: null }
  } catch (err) {
    run = {
      items: [],
      error: { view: v.key, label: v.label, message: err instanceof Error ? err.message : String(err) },
    }
  }
  byView.set(v.key, run)
  return run
}

/* ───────────── order ───────────── */

/** How many records an item is about (`ActionItem.size`), for the order of undated items. */
export const sizeOf = (i: Pick<ActionItem, 'size'>): number => i.size ?? 0

/**
 * Legal exposure first, then severity, then the most overdue (earliest due); among items with no
 * due date, the one about more records first; then owner, then id.
 */
export function compareActions(a: OpenAction, b: OpenAction): number {
  return (
    (b.item.exposure ? 1 : 0) - (a.item.exposure ? 1 : 0) ||
    SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity] ||
    (a.item.due ?? '9999').localeCompare(b.item.due ?? '9999') ||
    (!a.item.due && !b.item.due ? sizeOf(b.item) - sizeOf(a.item) : 0) ||
    a.ownerName.localeCompare(b.ownerName) ||
    a.id.localeCompare(b.id)
  )
}

/* ───────────── same matter ───────────── */

/** The view that owns a matter, by the matter's prefix. HCP's matters fold within the view that raises them. */
const MATTER_VIEW: Readonly<Record<string, ViewKey>> = {
  request: 'requests',
}

interface Folded {
  items: ActionItem[]
  also: Map<ActionItem, ActionItem[]>
  folded: number
}

/** One item per matter: the most severe (else the owning view's), carrying the others' exposure and severity. */
export function foldMatters(items: readonly ActionItem[]): Folded {
  const groups = new Map<string, ActionItem[]>()
  for (const i of items) {
    if (!i.matter) continue
    const g = groups.get(i.matter)
    if (g) g.push(i)
    else groups.set(i.matter, [i])
  }
  const also = new Map<ActionItem, ActionItem[]>()
  const replace = new Map<ActionItem, ActionItem | null>()
  let folded = 0
  for (const [matter, g] of groups) {
    if (g.length < 2) continue
    const owner = MATTER_VIEW[matter.split(':')[0]]
    const ranked = [...g].sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        (a.due ?? '9999').localeCompare(b.due ?? '9999'),
    )
    // Within one view the most pressing survives (a request waiting 5+ days over its approval item).
    const own = g.filter((i) => i.view === owner)
    const keep = own.length && own.length < g.length ? own[0] : ranked[0]
    const others = g.filter((i) => i !== keep)
    const worst = ranked[0].severity
    const merged: ActionItem = {
      ...keep,
      severity: SEVERITY_RANK[worst] < SEVERITY_RANK[keep.severity] ? worst : keep.severity,
      ...(g.some((i) => i.exposure) ? { exposure: true } : {}),
      due: keep.due ?? ranked.find((i) => i.due)?.due ?? null,
    }
    replace.set(keep, merged)
    also.set(merged, others)
    for (const o of others) replace.set(o, null)
    folded += others.length
  }
  if (!folded) return { items: [...items], also, folded }
  const out: ActionItem[] = []
  for (const i of items) {
    const r = replace.get(i)
    if (r === null) continue
    out.push(r ?? i)
  }
  return { items: out, also, folded }
}

/* ───────────── collect ───────────── */

const keyOfViews = (views: readonly ViewSource[]): string =>
  views
    .filter((v) => v.actions)
    .map((v) => v.key)
    .join(',')

const cache = new WeakMap<AnalyticsContext, Map<string, Collected>>()

/** The collection for this context when it is already assembled; null while it is not. */
export function cachedCollect(ctx: AnalyticsContext, views: readonly ViewSource[]): Collected | null {
  return cache.get(ctx)?.get(keyOfViews(views)) ?? null
}

/**
 * Every listed item in scope, with owners resolved, folded by matter, rated by the one rubric and
 * tagged by the data standard. Cached per context and set of source views.
 */
export function collectionOf(ctx: AnalyticsContext, views: readonly ViewSource[]): Collected {
  let byViews = cache.get(ctx)
  if (!byViews) {
    byViews = new Map()
    cache.set(ctx, byViews)
  }
  const key = keyOfViews(views)
  let out = byViews.get(key)
  if (!out) {
    out = collectUncached(ctx, views)
    byViews.set(key, out)
  }
  return out
}

const names = new WeakMap<AnalyticsContext['all']['workers'], ReadonlyMap<string, string | null>>()

/** Employee IDs by name (lower case), for owners named only by name; a name two people share matches no one. */
function ownerLookup(ctx: AnalyticsContext): (name: string) => string | null {
  let byName = names.get(ctx.all.workers)
  if (!byName) {
    const m = new Map<string, string | null>()
    for (const w of ctx.all.workers) {
      if (!w.name || !w.employeeId) continue
      const k = w.name.trim().toLowerCase()
      const had = m.get(k)
      if (had === undefined) m.set(k, w.employeeId)
      else if (had !== w.employeeId) m.set(k, null)
    }
    byName = m
    names.set(ctx.all.workers, byName)
  }
  const found = byName
  return (name) => found.get(name.trim().toLowerCase()) ?? null
}

/** The item is the Acting as person's own: they own it, approve its step or raised its request. */
function isMine(i: ActionItem, me: string | null, ownerId: string | null): boolean {
  if (!me) return false
  return ownerId === me || i.approverId === me || i.requesterId === me
}

export function collectUncached(ctx: AnalyticsContext, views: readonly ViewSource[]): Collected {
  const byKey = new Map(views.map((v) => [v.key, v]))
  const look = ownerLookup(ctx)
  const settings = settingsOf(ctx.metrics)
  const me = ctx.access.actingAs?.personId ?? null
  const resolve = (i: ActionItem): string | null =>
    i.ownerId ?? (i.ownerName && !isTeamName(i.ownerName) ? look(i.ownerName) : null)

  const sources = views.filter((v) => v.actions)
  const raw: ActionItem[] = []
  const errors: CollectError[] = []
  for (const v of sources) {
    const r = runView(ctx, v)
    raw.push(...r.items)
    if (r.error) errors.push(r.error)
  }

  // The mode lists only the items of the views, tabs, records and kinds it shows (docs/PLAN.md 9.6),
  // inside its scope or the person's own.
  const listed = itemsShown(ctx.access, raw).filter(
    (i) => itemInScope(ctx.access, i) || isMine(i, me, resolve(i)),
  )

  const seen = new Set<string>()
  const unique: ActionItem[] = []
  for (const i of listed) {
    if (seen.has(i.id)) continue
    seen.add(i.id)
    unique.push(i)
  }
  const { items: one, also, folded } = foldMatters(unique)

  const items: OpenAction[] = []
  const below = new Map<string, HiddenReason>()
  let belowCount = 0
  for (const i0 of one) {
    const severity = severityOf(i0, ctx.asOf, settings.blockedDays)
    const i = weekly(severity === i0.severity ? i0 : { ...i0, severity }, ctx.asOf)
    const view = byKey.get(i.view)
    // Workflow is not a statistic: an item below the standard is listed, tagged with its tier.
    const gate = gateFor(ctx.quality, ctx.standard, i.uses, view?.datasets ?? [])
    let tag: BelowStandard | null = null
    if (gate && !gate.shown) {
      belowCount++
      const subject = subjectOf(gate.limiting) ?? 'The data behind it'
      tag = { tier: gate.tier, subject, dataset: gate.limiting.dataset }
      const k = `${subject}|${gate.tier}`
      const r = below.get(k)
      if (r) r.count++
      else below.set(k, { subject, dataset: gate.limiting.dataset, tier: gate.tier, count: 1 })
    }
    const others = also.get(i0) ?? []
    const here = fromOf(i, view)
    const alsoFrom = [...new Set(others.map((o) => fromOf(o, byKey.get(o.view))))].filter((f) => f !== here)
    items.push(openAction(i, view, resolve(i), ctx, tag, alsoFrom))
  }
  items.sort(compareActions)
  return {
    items,
    below: { count: belowCount, reasons: [...below.values()].sort((a, b) => b.count - a.count) },
    folded,
    errors,
    sources: sources.length,
  }
}

/**
 * A breach still in force changes every week: its fingerprint carries the weeks overdue, so an item
 * marked handled comes back while the breach goes on (kept from the template app; HCP raises no
 * legal exposure in Phase 1).
 */
function weekly(i: ActionItem, asOf: ISODate): ActionItem {
  if (!i.exposure) return i
  const d = daysToDue(i.due, asOf)
  if (d == null || d >= 0) return i
  return { ...i, fingerprint: `${i.fingerprint ? `${i.fingerprint}|` : ''}week ${Math.floor(-d / 7)}` }
}

function fromOf(i: ActionItem, view: ViewSource | undefined): string {
  const viewLabel = view?.label ?? i.view
  const tabLabel = i.tab ? (view?.tabs.find((t) => t.key === i.tab)?.label ?? null) : null
  return tabLabel ? `${viewLabel} · ${tabLabel}` : viewLabel
}

function openAction(
  i: ActionItem,
  view: ViewSource | undefined,
  ownerId: string | null,
  ctx: AnalyticsContext,
  below: BelowStandard | null,
  alsoFrom: readonly string[],
): OpenAction {
  const role: ActionOwnerRole = (ACTION_OWNER_ROLES as readonly string[]).includes(i.ownerRole)
    ? i.ownerRole
    : 'hrbp'
  const ownerName = i.ownerName?.trim() || ACTION_OWNER_LABEL[role]
  const isTeam = !ownerId && isTeamName(ownerName)
  const viewLabel = view?.label ?? i.view
  const tabLabel = i.tab ? (view?.tabs.find((t) => t.key === i.tab)?.label ?? null) : null
  const seat = i.place.positionId ?? (i.subject.kind === 'positions' ? (i.subject.id ?? null) : null)
  return {
    item: i,
    id: i.id,
    markKey: markKeyOf(i.id),
    role,
    roleLabel: ACTION_OWNER_LABEL[role],
    ownerKey: ownerId ? `id:${ownerId}` : `name:${ownerName.toLowerCase()}`,
    ownerId,
    ownerName,
    viewLabel,
    tabLabel,
    from: tabLabel ? `${viewLabel} · ${tabLabel}` : viewLabel,
    requesterId: i.requesterId ?? null,
    approverId: i.approverId ?? null,
    isTeam,
    positionId: seat && ctx.positionIndex.byId.has(seat) ? seat : null,
    below,
    alsoFrom,
  }
}

/** The fields a set of items reads, for the tier of a count over them. */
export function usesOf(items: readonly OpenAction[]): FieldRef[] {
  const out = new Set<FieldRef>()
  for (const a of items) for (const u of a.item.uses ?? []) out.add(u)
  return [...out]
}
