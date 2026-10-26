/**
 * Whose an Action center item is, per mode (docs/PLAN.md 9.6; the template app's policy/routing.ts):
 * the matching rules the routing table (`ITEM_ROUTING`, src/access/items.ts, plain data) is read
 * with, and the routing snapshot's text. Each kind has, per mode, an ordered list of routes; the
 * first route whose `who` holds for the item decides its list: `needs` ("Needs attention") or
 * `waiting` ("Waiting on others"). An item no route matches is left out of the mode's lists
 * (counted, never shown).
 *
 * - `any`: anyone the mode's scope covers (an HRBP for any request in the unit);
 * - `approver`: the Acting as person is the step's approver;
 * - `requester`: the Acting as person raised the request;
 * - `owner`: the Acting as person owns the item (by employee ID, else by name).
 *
 * This is not the route guard (that is `routeDecision` in ./index.ts). Pure: no React, no registry,
 * and no import of the table itself, so items.ts can import this module.
 */
import type { Mode } from '../modes'

/** The lists an item can be on. */
export type ItemList = 'needs' | 'waiting'

/** Who in a mode an item is for (src/access/items.ts `ItemWho`). */
export type RouteWho = 'any' | 'approver' | 'requester' | 'owner'

/** One route of a kind in a mode. */
export interface RouteRule {
  list: ItemList
  who: RouteWho
}

/** What a route reads of an item and the person looking. */
export interface RouteFacts {
  /** The Acting as person; null while the mode's pick is to be made. */
  me: { id: string | null; name: string } | null
  ownerId: string | null
  ownerName: string
  requesterId?: string | null
  approverId?: string | null
}

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Whether one route's `who` holds. A lens with nobody picked matches only `any`. */
export function whoHolds(who: RouteWho, f: RouteFacts): boolean {
  if (who === 'any') return true
  const me = f.me
  if (!me) return false
  switch (who) {
    case 'approver':
      return !!me.id && !!f.approverId && me.id === f.approverId
    case 'requester':
      return !!me.id && !!f.requesterId && me.id === f.requesterId
    case 'owner':
      if (me.id && f.ownerId) return me.id === f.ownerId
      return !!me.name && !!f.ownerName && sameName(me.name, f.ownerName)
  }
}

/** The list the first matching route names, or null when none does. */
export function listOf(routes: readonly RouteRule[] | undefined, f: RouteFacts): ItemList | null {
  for (const r of routes ?? []) if (whoHolds(r.who, f)) return r.list
  return null
}

const LETTER: Readonly<Record<ItemList, string>> = { needs: 'N', waiting: 'W' }
const WHO: Readonly<Record<RouteWho, string>> = {
  any: 'any',
  approver: 'apr',
  requester: 'req',
  owner: 'own',
}

/**
 * The routing table as text for its snapshot (`access-routing.txt`): one line per kind, one column
 * per mode, each route as its list letter (N needs, W waiting) and who ("N:apr W:req"), "-" for none.
 */
export function routingText(
  table: Readonly<Record<string, Readonly<Partial<Record<Mode, readonly RouteRule[]>>>>>,
  modes: readonly Mode[],
  column: Readonly<Record<Mode, string>>,
): string {
  const cell = (rs: readonly RouteRule[] | undefined) =>
    rs?.length ? rs.map((r) => `${LETTER[r.list]}:${WHO[r.who]}`).join(' ') : '-'
  const rows = Object.entries(table).map(([kind, byMode]) => [kind, ...modes.map((m) => cell(byMode[m]))])
  const head = ['Kind', ...modes.map((m) => column[m])]
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const fmt = (r: readonly string[]) =>
    r
      .map((x, i) => x.padEnd(widths[i]))
      .join('  ')
      .trimEnd()
  const top = fmt(head)
  return `${[top, '-'.repeat(top.length), ...rows.map(fmt)].join('\n')}\n`
}
