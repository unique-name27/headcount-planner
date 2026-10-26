/**
 * Which Action center items a mode lists, and whose they are (docs/PLAN.md 9.6; the template app's
 * items.ts and policy/routing.ts). Items are the producing views' pure `actions(ctx)` output; ids are
 * `<view>:<kind>:<record>`; no amount in `what` or `note`.
 *
 * 1. What the mode lists (`itemsShown`): an item is listed when the mode shows its view, its tab, its
 *    subject's drill kind and its id prefix (`item:<view>:<kind>:`).
 * 2. The scope (`itemInScope`): an item about a position, request or org inside the scope.
 * 3. Whose it is (`roleItems`): `ITEM_ROUTING` sends each kind to a mode's Needs attention or Waiting
 *    on others list. A home's Needs attention lists only the mode's `needs`, so every item 9.3 promises
 *    for a home routes to `needs` in that mode (`roleItems.test.ts`). For the approver,
 *    `requests:waiting` replaces that request's `requests:approve` item (one line per request).
 *    Approval items close by request state; "Mark handled" is off for them (Snooze only).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); the access builder filled the bodies, with the
 * route matching in ./policy/routing.ts. `ItemFacts` is what these functions read of an item; the UX
 * layer's `ActionItem` (src/views/types.ts) must have these fields. `ITEM_ROUTING` is data. HR admin
 * routes nothing: its Action center lists every item it shows, all of them in `left`.
 */
import type { ISODate, Mode } from '@/data/schema'
import type { AccessContext } from './context'
import { type DrillKind, ITEM_KINDS, type ItemKind } from './ids'
import { listOf } from './policy/routing'
import { scopeOfAccess } from './scopes/records'

export { ITEM_KINDS, type ItemKind } from './ids'

/** What the routing reads of an Action center item. */
export interface ItemFacts {
  /** `<view>:<kind>:<record>`. */
  id: string
  view: string
  tab?: string
  /** The record the item is about: its drill kind and id, or none. */
  subject: { kind: DrillKind | 'none'; id?: string | null }
  /** Where it sits, for the scope test. */
  place?: { positionId?: string | null; businessUnit?: string | null; department?: string | null } | null
}

/** Who in a mode an item is for. */
export type ItemWho =
  /** Anyone the mode's scope covers (an HRBP for any request in the unit). */
  | 'any'
  /** The Acting as person is the step's approver. */
  | 'approver'
  /** The Acting as person raised the request. */
  | 'requester'
  /** The Acting as person owns the item (the manager of the seat or team, the leader of the parent org). */
  | 'owner'

export interface ItemRoute {
  list: 'needs' | 'waiting'
  who: ItemWho
}

/**
 * Docs/PLAN.md 9.6's "Mode lists" column, kind by kind: the modes that list it and on which list.
 * A kind with no entry for a mode is left out of both lists in that mode (counted in `left`). HR
 * admin's home is the Data room, so it routes nothing; its Action center lists every item it shows.
 */
export const ITEM_ROUTING: Readonly<Record<ItemKind, Readonly<Partial<Record<Mode, readonly ItemRoute[]>>>>> =
  {
    'requests:approve': {
      manager: [{ list: 'needs', who: 'approver' }],
      hrbp: [{ list: 'needs', who: 'approver' }],
      leader: [{ list: 'needs', who: 'approver' }],
      finance: [{ list: 'needs', who: 'approver' }],
    },
    'requests:waiting': {
      manager: [
        { list: 'needs', who: 'approver' },
        { list: 'waiting', who: 'requester' },
      ],
      hrbp: [{ list: 'needs', who: 'any' }],
      leader: [{ list: 'needs', who: 'approver' }],
      finance: [{ list: 'needs', who: 'approver' }],
    },
    'requests:sent-back': {
      manager: [{ list: 'needs', who: 'requester' }],
      hrbp: [{ list: 'needs', who: 'requester' }],
      leader: [{ list: 'needs', who: 'requester' }],
    },
    'requests:not-submitted': {
      manager: [{ list: 'needs', who: 'owner' }],
      hrbp: [{ list: 'needs', who: 'any' }],
    },
    'requests:backfill-new-position': {
      hrbp: [{ list: 'needs', who: 'any' }],
      finance: [{ list: 'needs', who: 'any' }],
    },
    'requests:backfill-no-exit': {
      hrbp: [{ list: 'needs', who: 'any' }],
      finance: [{ list: 'needs', who: 'any' }],
    },
    'plan:planned-no-req': {
      manager: [{ list: 'needs', who: 'owner' }],
      hrbp: [{ list: 'needs', who: 'any' }],
    },
    'plan:past-start': {
      hrbp: [{ list: 'waiting', who: 'any' }],
    },
    'plan:frozen-opening': {
      hrbp: [{ list: 'needs', who: 'any' }],
      finance: [{ list: 'needs', who: 'any' }],
    },
    'plan:req-on-eliminated': {
      hrbp: [{ list: 'needs', who: 'any' }],
      manager: [{ list: 'waiting', who: 'any' }],
    },
    'targets:suborg-over': {
      leader: [{ list: 'needs', who: 'owner' }],
      hrbp: [{ list: 'waiting', who: 'any' }],
    },
    'finance:reconcile': {
      hrbp: [{ list: 'needs', who: 'any' }],
      finance: [{ list: 'needs', who: 'any' }],
    },
    'finance:envelope-exception': {
      finance: [{ list: 'needs', who: 'any' }],
    },
    'finance:cycle-due': {
      finance: [{ list: 'needs', who: 'any' }],
    },
    'requests:trade-credit-lapse': {
      manager: [{ list: 'needs', who: 'owner' }],
      hrbp: [{ list: 'waiting', who: 'any' }],
    },
  }

/** An item's kind (`<view>:<kind>`) from its id, or null for an id no kind starts. */
export function itemKindOf(id: string): ItemKind | null {
  // The longest kind first, so no kind can shadow a longer one that starts with it.
  for (const k of KINDS_LONGEST_FIRST) if (id === k || id.startsWith(`${k}:`)) return k
  return null
}

const KINDS_LONGEST_FIRST: readonly ItemKind[] = [...ITEM_KINDS].sort((a, b) => b.length - a.length)

/** The record part of an item id ("R-1025" in "requests:approve:R-1025"), or '' for none. */
export function itemRecordOf(id: string): string {
  const k = itemKindOf(id)
  return k && id.length > k.length ? id.slice(k.length + 1) : ''
}

/** Whether an item is listed in this mode (its view, tab, subject kind and id prefix). */
export function itemShown(access: Pick<AccessContext, 'can'>, item: ItemFacts): boolean {
  if (!access.can(`item:${item.id}`)) return false
  if (!access.can(`view:${item.view}`)) return false
  if (item.tab && !access.can(`tab:${item.view}.${item.tab}`)) return false
  if (item.subject.kind !== 'none' && !access.can(`drill:${item.subject.kind}`)) return false
  return true
}

/** The items a mode lists, the same array when every one is. */
export function itemsShown<T extends ItemFacts>(
  access: Pick<AccessContext, 'can' | 'mode'>,
  items: readonly T[],
): T[] {
  const out = items.filter((i) => itemShown(access, i))
  return out.length === items.length ? (items as T[]) : out
}

/** Whether an item is about the scope (its position, request or org inside it); true without a scope. */
export function itemInScope(access: Pick<AccessContext, 'scope'>, item: ItemFacts): boolean {
  const s = scopeOfAccess(access)
  if (!s) return true
  const seat = item.place?.positionId ?? (isSeatKind(item.subject.kind) ? (item.subject.id ?? null) : null)
  if (s.kind === 'tree') {
    // An org item names the org's head seat, which may be the tree's own root (a manager's asks).
    if (seat) return s.positionIds.has(seat) || s.rootPositionIds.has(seat)
    return false
  }
  if (seat && s.positionIds.has(seat)) return true
  return item.place?.businessUnit === s.unit
}

/** Subject kinds whose id is a position ID. */
const isSeatKind = (kind: DrillKind | 'none'): boolean => kind === 'positions'

/** Who is looking: the mode, its Acting as person and the date items are judged on. */
export interface RoleLens {
  mode: Mode
  me: { id: string | null; name: string } | null
  asOf: ISODate
}

/** What `roleItems` reads from a collected item (the Action center's open item fits). */
export interface RoutedItem {
  item: ItemFacts
  /** The owner's employee ID, given or matched on the roster. */
  ownerId: string | null
  ownerName: string
  /** For request items: the requester and the step's approver (8.4 rule 6: rows the viewer may see only). */
  requesterId?: string | null
  approverId?: string | null
}

export interface RoleLists<T> {
  /** Every item the mode lists, in the order given. */
  listed: T[]
  /** "Needs attention": the mode's `needs` routes, most pressing first. */
  needs: T[]
  /** "Waiting on others": the mode's `waiting` routes. */
  waiting: T[]
  /** Items in neither list (said as a count, never shown). */
  left: number
}

/** The lens for an access context: its mode and its Acting as person. */
export function lensOf(access: Pick<AccessContext, 'mode' | 'actingAs'>, asOf: ISODate): RoleLens {
  const a = access.actingAs
  return { mode: access.mode, me: a ? { id: a.personId, name: a.name } : null, asOf }
}

/** Split the items a mode lists into its two lists by `ITEM_ROUTING`. Order is kept. */
export function roleItems<T extends RoutedItem>(items: readonly T[], lens: RoleLens): RoleLists<T> {
  const routed = items.map((a) => {
    const kind = itemKindOf(a.item.id)
    const routes = kind ? ITEM_ROUTING[kind][lens.mode] : undefined
    const list = listOf(routes, {
      me: lens.me,
      ownerId: a.ownerId,
      ownerName: a.ownerName,
      requesterId: a.requesterId ?? null,
      approverId: a.approverId ?? null,
    })
    return { a, kind, list }
  })
  // For the approver, a request's `requests:waiting` item replaces its `requests:approve` item.
  const waitingNeeds = new Set(
    routed
      .filter((r) => r.kind === 'requests:waiting' && r.list === 'needs')
      .map((r) => itemRecordOf(r.a.item.id)),
  )
  const listed: T[] = []
  const needs: T[] = []
  const waiting: T[] = []
  let left = 0
  for (const r of routed) {
    if (r.kind === 'requests:approve' && waitingNeeds.has(itemRecordOf(r.a.item.id))) continue
    listed.push(r.a)
    if (r.list === 'needs') needs.push(r.a)
    else if (r.list === 'waiting') waiting.push(r.a)
    else left++
  }
  return { listed, needs, waiting, left }
}
