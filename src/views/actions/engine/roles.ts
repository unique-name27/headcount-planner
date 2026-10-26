/**
 * Each mode's two lists over the Action center's collection (docs/PLAN.md 9.6; the template app's
 * roles.ts): "Needs attention" (the role's own items) and "Waiting on others" (its area, owned by
 * someone else), split by `roleItems` and `ITEM_ROUTING` (src/access/items.ts). One function for every
 * reader, so the masthead count, the page, the homes and My team agree for one context.
 *
 * HR admin lists every item in the owner sheets (no two lists): it routes nothing, so its Needs
 * attention is empty and the masthead counts every open item. Pure.
 */
import { lensOf, type RoleLens, roleItems } from '@/access/items'
import { scopeOfAccess } from '@/access/scopes/records'
import type { AnalyticsContext } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { ACTION_OWNER_LABEL } from '@/views/types'
import type { Collected, OpenAction } from './collect'
import { foldRoleLists } from './rollups'

/** Items Needs attention lists before "Show all". */
export const NEEDS_SHOWN = 15

type Ctx = Pick<AnalyticsContext, 'access' | 'asOf'>

/** The lens for a context: its mode and its Acting as person. */
export const lensFor = (ctx: Ctx): RoleLens => lensOf(ctx.access, ctx.asOf)

/** The mode shows "Needs attention" and "Waiting on others" (every mode but HR admin). */
export const showsLists = (access: Ctx['access']): boolean => access.can('ui:attention-lists')

export interface RoleView {
  /** The mode shows the two lists; false in HR admin (every item in owner sheets). */
  lists: boolean
  /** Every open item the mode lists, never rolled up. */
  open: OpenAction[]
  /** Needs attention, most pressing first, with its roll-ups. */
  needs: OpenAction[]
  /** Waiting on others, with its roll-ups. */
  waiting: OpenAction[]
  /** Roll-ups marked handled or snoozed in this browser (for the Handled and snoozed list). */
  parked: OpenAction[]
  /** Open items the mode lists in neither list (said as a count). */
  left: number
  /** The masthead's number: Needs attention in a role mode, every open item in HR admin. */
  count: number
  /** The critical items among them, for the masthead's tooltip. */
  critical: number
}

/**
 * The two lists over the open items of a collection (`isOpen` says which are open in this browser),
 * with each mode's roll-ups (`rollups.ts`): a roll-up holds the open items it folds, and is itself
 * open unless it was marked (and has not changed since).
 */
export function roleView(
  collected: Pick<Collected, 'items'>,
  ctx: Ctx & Pick<AnalyticsContext, 'scopeLabel'>,
  isOpen: (a: OpenAction) => boolean,
): RoleView {
  const lens = lensFor(ctx)
  const split = roleItems(collected.items.filter(isOpen), lens)
  const folded = foldRoleLists(split, lens, ctx)
  const parked = [...folded.needs, ...folded.waiting].filter((a) => a.members && !isOpen(a))
  const needs = folded.needs.filter((a) => !a.members || isOpen(a))
  const waiting = folded.waiting.filter((a) => !a.members || isOpen(a))
  const lists = showsLists(ctx.access)
  const counted = countedOf({ lists, needs, open: split.listed })
  return {
    lists,
    open: split.listed,
    needs,
    waiting,
    parked,
    left: split.left,
    count: counted.length,
    critical: counted.filter((a) => a.item.severity === 'critical').length,
  }
}

/** What a mode's counts count: Needs attention in a role mode (the masthead's number), every open item in HR admin. */
export const countedOf = (v: Pick<RoleView, 'lists' | 'needs' | 'open'>): OpenAction[] =>
  v.lists ? v.needs : v.open

/* ───────── wording ───────── */

/** The owner group each mode's Needs attention is for, when no one is picked. */
const PRACTICE: Readonly<Record<Ctx['access']['mode'], string>> = {
  manager: ACTION_OWNER_LABEL.manager,
  hrbp: ACTION_OWNER_LABEL.hrbp,
  leader: ACTION_OWNER_LABEL.leader,
  finance: ACTION_OWNER_LABEL.finance,
  'hr-admin': 'HR admin',
}

/** Who Needs attention is for: the Acting as person by name, else the mode's owner group. */
export function practiceOf(ctx: Ctx): string {
  return lensFor(ctx).me?.name ?? PRACTICE[ctx.access.mode]
}

/** Where: "across the company", "in Silicon Engineering", "in Dana Ito's org". */
export function whereOf(ctx: Ctx): string {
  const s = scopeOfAccess(ctx.access)
  return s ? `in ${s.label}` : 'across the company'
}

/** The header line in a role mode: "Open items for Dana Ito in Silicon Engineering, as of 30 Sep 2026". */
export function listHeader(ctx: Ctx): string {
  return `Open items for ${practiceOf(ctx)} ${whereOf(ctx)}, as of ${formatDate(ctx.asOf)}`
}

/** What the two lists hold, after the header line. */
export const listsLine = (): string =>
  'Needs attention is yours; Waiting on others is in your area, with someone else.'

/** "Nothing is waiting on Dana Ito in Silicon Engineering." */
export const nothingWaiting = (ctx: Ctx): string =>
  `Nothing is waiting on ${practiceOf(ctx)} ${whereOf(ctx)}.`
