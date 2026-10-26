/**
 * Roll-ups for a role's two lists (the template app's rollups.ts, with HCP's folds). A role reads its
 * work, not every record behind it: items of one kind that other people hold fold into one line with
 * the count, who holds them and the oldest, and the line's About opens the items. Folding happens
 * after the role split (`roleItems`), per mode, so HR admin's full list and every view keep their own
 * items:
 *
 *  - **HRBP (Needs attention):** the unit's items held by others (requests waiting on another
 *    approver's step, managers who have not sent their ranked asks, Planned seats with no req) fold
 *    per owner group and kind from two ("Managers: 41 requests waiting on a step, with 17 managers");
 *    the HRBP's own steps, and critical items, stay one line each.
 *  - **HRBP (Waiting on others):** one line per owner group and kind, as the template app's.
 *  - **Finance (Needs attention):** company-wide items held by others (backfill flags, frozen
 *    openings, reconciliation exceptions) fold per owner group and kind from three; Finance's own
 *    steps stay one line each.
 *  - **Manager and Leader:** their lists are their own items: nothing folds.
 *
 * A roll-up is an `OpenAction` with `members`: its id is stable ('rollup:<key>'), so Mark handled
 * and Snooze keep to it, and its fingerprint is its members, so a handled roll-up opens again when an
 * item joins or leaves it. Its severity is its worst member's, its due date the earliest. A roll-up
 * of approval items is Snooze only, as they are. Pure.
 */
import { itemKindOf, type RoleLens } from '@/access/items'
import type { Mode } from '@/access/modes'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { dateWords } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { ACTION_OWNER_LABEL, type ActionItem, type ActionOwnerRole } from '@/views/types'
import type { OpenAction } from './collect'
import { daysToDue } from './due'
import { kindOf } from './kind'
import { hashKey, markKeyOf } from './marks'
import { itemsDrill } from './rows'

/** Items of one kind held by others fold into one line from this many (Finance). */
export const QUEUE_FOLD_AT = 3

/** The prefix of every roll-up's id. */
export const ROLLUP_PREFIX = 'rollup:'

type Ctx = Pick<AnalyticsContext, 'asOf' | 'scopeLabel'>

export const isRollup = (a: Pick<OpenAction, 'id'>): boolean => a.id.startsWith(ROLLUP_PREFIX)

/* ───────────── words ───────────── */

/** Count nouns by kind label, singular and plural. */
const NOUN: Readonly<Record<string, readonly [string, string]>> = {
  'Request to decide': ['request to decide', 'requests to decide'],
  'Request waiting on a step': ['request waiting on a step', 'requests waiting on a step'],
  'Request sent back': ['request sent back', 'requests sent back'],
  'Ranked asks not sent': ['manager with ranked asks not sent', 'managers with ranked asks not sent'],
  'Backfill on a new position': ['backfill on a new position', 'backfills on new positions'],
  'Backfill with no exit': ['backfill with no exit', 'backfills with no exit'],
  'Trade credit about to lapse': [
    'org with trade credit about to lapse',
    'orgs with trade credit about to lapse',
  ],
  'Planned seat with no req': ['planned seat with no req', 'planned seats with no req'],
  'Opening past target start': ['opening past target start', 'openings past target start'],
  'Opening under a freeze': ['opening under a freeze', 'openings under a freeze'],
  'Req on an ended seat': ['req on an ended seat', 'reqs on ended seats'],
  'Sub-org over target': ['sub-org over target', 'sub-orgs over target'],
  'Reconciliation exception': ['reconciliation exception', 'reconciliation exceptions'],
  'Envelope exception': ['envelope exception', 'envelope exceptions'],
  'Cycle stage due': ['cycle stage due', 'cycle stages due'],
}

/** The kind label of an item, as the Action center names it. */
const labelOf = (a: OpenAction): string => kindOf(a.item, a.viewLabel)

/** "3 requests to decide", or "3 Plan items" for a kind not named above. */
export function countOf(n: number, label: string): string {
  const noun = NOUN[label]
  return noun ? plural(n, noun[0], noun[1]) : plural(n, `${label.toLowerCase()} item`)
}

/** Owner group nouns for "with 17 managers", "across 2 HR business partners". */
const ROLE_NOUN: Readonly<Record<ActionOwnerRole, readonly [string, string]>> = {
  manager: ['manager', 'managers'],
  hrbp: ['HR business partner', 'HR business partners'],
  leader: ['leader', 'leaders'],
  finance: ['person in Finance', 'people in Finance'],
}

/** "a, b and c". */
export function listWords(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/** Who holds a set of items: "Dana Ito", "Dana Ito and Sam Lee", "17 managers and 2 leaders". */
export function ownersOf(members: readonly OpenAction[]): string {
  const byKey = new Map<string, OpenAction>()
  for (const a of members) if (!byKey.has(a.ownerKey)) byKey.set(a.ownerKey, a)
  const owners = [...byKey.values()]
  if (owners.length <= 3) return listWords(owners.map((a) => a.ownerName))
  const byRole = new Map<ActionOwnerRole, number>()
  for (const a of owners) byRole.set(a.role, (byRole.get(a.role) ?? 0) + 1)
  return listWords(
    [...byRole].sort((x, y) => y[1] - x[1]).map(([r, n]) => plural(n, ROLE_NOUN[r][0], ROLE_NOUN[r][1])),
  )
}

/** "29 requests waiting on a step and 4 managers with ranked asks not sent". */
export function kindsOf(members: readonly OpenAction[]): string {
  const n = new Map<string, number>()
  for (const a of members) n.set(labelOf(a), (n.get(labelOf(a)) ?? 0) + 1)
  return listWords([...n].sort((x, y) => y[1] - x[1]).map(([label, k]) => countOf(k, label)))
}

/** Days the most overdue member is overdue, or null when none is. */
function oldestOverdue(members: readonly OpenAction[], asOf: string): number | null {
  let worst: number | null = null
  for (const a of members) {
    const d = daysToDue(a.item.due, asOf)
    if (d != null && d < 0 && (worst == null || -d > worst)) worst = -d
  }
  return worst
}

const overdueCount = (members: readonly OpenAction[], asOf: string) =>
  members.filter((a) => (daysToDue(a.item.due, asOf) ?? 0) < 0).length

/** "; 3 overdue, the oldest by 41 d", or "; the first is due 8 Oct", or "". */
function dueTail(members: readonly OpenAction[], asOf: string): string {
  const over = overdueCount(members, asOf)
  const oldest = oldestOverdue(members, asOf)
  if (over && oldest != null)
    return over === members.length
      ? `; the oldest is ${fmt(oldest, 'days')} overdue`
      : `; ${fmt(over, 'int')} overdue, the oldest by ${fmt(oldest, 'days')}`
  const first = members
    .map((a) => a.item.due)
    .filter((d): d is string => !!d)
    .sort()[0]
  return first ? `; the first is due ${dateWords(first, asOf)}` : ''
}

/* ───────────── one roll-up ───────────── */

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2, good: 3 } as const

export interface RollupSpec {
  /** Stable among roll-ups. */
  key: string
  what: string
  /** What the About cell says (it opens the items). */
  subject: string
  /** The kind of work, for "What is waiting, by kind". */
  kind: string
  /** The polite ask Copy note uses, when the line is copied whole. */
  note?: string
  /** The items drill's title. */
  title: string
  /** Who it waits on when its members have more than one owner: their group, or a phrase. */
  owner?: Pick<OpenAction, 'role' | 'ownerName'>
}

/**
 * One line for its members, most pressing first. Its owner is theirs when they share one; else the
 * spec's (an owner group, or a phrase such as "17 managers and 2 leaders").
 */
export function rollupOf(members: readonly OpenAction[], spec: RollupSpec, ctx: Ctx): OpenAction {
  const first = members[0]
  const worst = [...members].sort(
    (a, b) => SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity],
  )[0]
  const dues = members
    .map((a) => a.item.due)
    .filter((d): d is string => !!d)
    .sort()
  const one = new Set(members.map((a) => a.ownerKey)).size === 1
  const views = new Set(members.map((a) => a.item.view))
  const tabs = new Set(members.map((a) => a.item.tab ?? ''))
  const sameTab = views.size === 1 && tabs.size === 1
  const role = one ? first.role : (spec.owner?.role ?? first.role)
  const ownerName = one ? first.ownerName : (spec.owner?.ownerName ?? ownersOf(members))
  const uses = new Set<FieldRef>()
  for (const a of members) for (const u of a.item.uses ?? []) uses.add(u)
  const id = `${ROLLUP_PREFIX}${spec.key}`
  const list = [...members]
  const item: ActionItem = {
    id,
    kind: spec.kind,
    ownerRole: role,
    ownerId: one ? first.ownerId : null,
    ownerName,
    due: dues[0] ?? null,
    severity: worst.item.severity,
    what: spec.what,
    subject: { kind: 'none', label: spec.subject },
    view: first.item.view,
    ...(sameTab && first.item.tab ? { tab: first.item.tab } : {}),
    drill: () => itemsDrill(ctx, spec.title, list),
    ...(spec.note ? { note: spec.note } : {}),
    ...(uses.size ? { uses: [...uses] } : {}),
    // A handled roll-up opens again when an item joins or leaves it.
    size: members.length,
    fingerprint: `${members.length}:${hashKey(
      members
        .map((a) => `${a.markKey}|${a.item.fingerprint ?? ''}`)
        .sort()
        .join('\u0001'),
    )}`,
    ...(members.some((a) => a.item.exposure) ? { exposure: true } : {}),
    ...(members.every((a) => a.item.snoozeOnly) ? { snoozeOnly: true as const } : {}),
    closesWhen: 'Each of its items closed, handled or snoozed',
    // A roll-up names its org through its first member; the scope test already ran on each member.
    place: first.item.place,
  }
  const below = members.every((a) => a.below) ? first.below : null
  return {
    item,
    id,
    markKey: markKeyOf(id),
    role,
    roleLabel: ACTION_OWNER_LABEL[role],
    // An owner group's roll-ups share one owner block ("Managers"); a phrase is its own.
    ownerKey: one ? first.ownerKey : spec.owner ? `group:${role}` : `group:${spec.key}`,
    ownerId: item.ownerId ?? null,
    ownerName,
    viewLabel: views.size === 1 ? first.viewLabel : 'Several views',
    tabLabel: sameTab ? first.tabLabel : null,
    from: views.size === 1 ? (sameTab ? first.from : first.viewLabel) : 'Several views',
    requesterId: null,
    approverId: null,
    isTeam: one ? first.isTeam : true,
    positionId: null,
    below,
    alsoFrom: [],
    members: list,
  }
}

/* ───────────── folding a list ───────────── */

/**
 * Fold the groups `keyOf` names (null leaves an item alone) that reach `min` members: each group
 * becomes the line `make` builds, at its first member's place in the list. `make` may return the
 * members unchanged (an array) to leave a group alone.
 */
export function foldBy(
  list: readonly OpenAction[],
  keyOf: (a: OpenAction) => string | null,
  min: number,
  make: (key: string, members: OpenAction[]) => OpenAction | readonly OpenAction[],
): OpenAction[] {
  const groups = new Map<string, OpenAction[]>()
  for (const a of list) {
    const k = keyOf(a)
    if (k == null) continue
    const g = groups.get(k)
    if (g) g.push(a)
    else groups.set(k, [a])
  }
  const out: OpenAction[] = []
  const done = new Set<string>()
  for (const a of list) {
    const k = keyOf(a)
    const g = k == null ? undefined : groups.get(k)
    if (k == null || !g || g.length < min) {
      out.push(a)
      continue
    }
    if (done.has(k)) continue
    done.add(k)
    const made = make(k, g)
    if (Array.isArray(made)) out.push(...made)
    else out.push(made as OpenAction)
  }
  return out
}

/** The item is the person's own: they own it, decide its step or raised its request. */
export function isMine(
  lens: RoleLens,
  a: Pick<OpenAction, 'ownerId' | 'approverId' | 'requesterId'>,
): boolean {
  const me = lens.me?.id
  if (!me) return false
  return a.ownerId === me || a.approverId === me || a.requesterId === me
}

/** The id's view and kind ('requests:waiting'). */
const kindKey = (a: OpenAction) => itemKindOf(a.id) ?? a.id

/**
 * One line per owner group and kind for the items others hold, from `min`: "Managers: 41 requests
 * waiting on a step, with 17 managers; 30 overdue, the oldest by 9 d". The person's own items and
 * critical items stay one by one.
 */
function foldOthers(
  list: readonly OpenAction[],
  lens: RoleLens,
  ctx: Ctx,
  prefix: string,
  min: number,
): OpenAction[] {
  return foldBy(
    list,
    (a) =>
      a.members || isMine(lens, a) || a.item.severity === 'critical'
        ? null
        : `${prefix}:${a.role}:${kindKey(a)}`,
    min,
    (key, members) => {
      const role = members[0].role
      const label = labelOf(members[0])
      const owners = new Set(members.map((a) => a.ownerKey)).size
      const with_ =
        owners === 1
          ? ` with ${members[0].ownerName}`
          : owners === members.length
            ? `, each with its own ${ROLE_NOUN[role][0]}`
            : ` with ${plural(owners, ROLE_NOUN[role][0], ROLE_NOUN[role][1])}`
      return rollupOf(
        members,
        {
          key,
          what: `${countOf(members.length, label)}${with_}${dueTail(members, ctx.asOf)}`,
          subject: `${ACTION_OWNER_LABEL[role]}: ${countOf(members.length, label).replace(/^[\d,]+ /, '')}`,
          kind: label,
          title: `${ACTION_OWNER_LABEL[role]}: ${label.toLowerCase()}`,
          owner: { role, ownerName: ACTION_OWNER_LABEL[role] },
        },
        ctx,
      )
    },
  )
}

/* ───────────── per mode ───────────── */

/** A mode's two lists with its roll-ups (the lists as `roleItems` split them, most pressing first). */
export function foldRoleLists(
  lists: { needs: readonly OpenAction[]; waiting: readonly OpenAction[] },
  lens: RoleLens,
  ctx: Ctx,
): { needs: OpenAction[]; waiting: OpenAction[] } {
  const mode: Mode = lens.mode
  let needs = [...lists.needs]
  let waiting = [...lists.waiting]
  if (mode === 'hrbp') {
    needs = foldOthers(needs, lens, ctx, 'hrbp:needs', 2)
    waiting = foldOthers(waiting, lens, ctx, 'hrbp:waiting', 2)
  } else if (mode === 'finance') needs = foldOthers(needs, lens, ctx, 'finance:needs', QUEUE_FOLD_AT)
  return { needs, waiting }
}

/** Every item a list holds, a roll-up's members in its place. */
export const unfold = (list: readonly OpenAction[]): OpenAction[] =>
  list.flatMap((a) => (a.members ? [...a.members] : [a]))
