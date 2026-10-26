/**
 * The Action center's metric ids (docs/PLAN.md 12: the template app's Action center metrics):
 * open, overdue, due soon and critical items, and the owners with open items. Plain data: the catalog
 * imports this file, so never React, '@/data/context', the '@/metrics' barrel, '@/metrics/catalog',
 * '@/metrics/api' or '@/metrics/testing'.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md): the ids. The views-3 builder filled `metrics` (with
 * the page's settings: how long a snooze lasts, how far ahead "due soon" looks, and when an overdue
 * item a person waits on turns critical); src/metrics/catalog.ts holds it, and src/access/ids.ts
 * `METRIC_IDS` the ids.
 *
 * Every item comes from another view's `actions(ctx)`, so the counts read the fields those items read:
 * `ITEM_USES` is their union (the Requests, Plan, Targets and Finance views' items).
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import { defineMetrics } from '@/metrics/define'
import { F, uses } from '@/metrics/fields'
import type { MetricDef } from '@/metrics/types'

export const ID = {
  itemsOpen: 'actions.items.open',
  itemsOverdue: 'actions.items.overdue',
  itemsDueSoon: 'actions.items.dueSoon',
  itemsCritical: 'actions.items.critical',
  ownersWithOpen: 'actions.owners.withOpen',
} as const
export type ActionsMetricId = (typeof ID)[keyof typeof ID]

/** The settings the engine reads through `ctx.metrics` (src/views/actions/engine/settings.ts), by role. */
export const PARAM = {
  /** How many days Snooze hides an item (7). */
  snoozeDays: { metricId: ID.itemsOpen, key: 'snoozeDays' },
  /** How many days after the as-of date count as due soon (7). */
  dueSoonDays: { metricId: ID.itemsDueSoon, key: 'days' },
  /** How many days overdue an item a person waits on may be before it is critical (14). */
  blockedDays: { metricId: ID.itemsCritical, key: 'blockedDays' },
} as const

/** Defaults, for tests and wording that names no number. */
export const DEFAULTS = { snoozeDays: 7, dueSoonDays: 7, blockedDays: 14 } as const

/**
 * The fields the views' open items read (each item declares its own `uses`; this is their union over
 * Requests, Plan, Targets and Finance: requests and their steps, cycles, seats and their reqs, the
 * Units list's HRBPs through the seats, targets and freezes).
 */
export const ITEM_USES: readonly FieldRef[] = uses(
  F.request,
  F.requestFlow,
  F.requestSeat,
  F.cycle,
  F.exception,
  F.trade,
  F.transfer,
  F.seat,
  F.tree,
  F.seatOrg,
  F.opened,
  F.ended,
  F.assignment,
  F.req,
  F.offer,
  F.freeze,
  F.target,
)

const POPULATION =
  'Items from every view in the current scope that the data standard shows. Items marked handled or snoozed in this browser are left out.'
const WINDOW = 'A snapshot on the as-of date.'
const OWNER = 'People analytics'

/** The page's dictionary entries. */
export const metrics: MetricDef[] = defineMetrics('actions', [
  {
    id: ID.itemsOpen,
    name: 'Open items',
    definition:
      'Items from every view that wait on someone: an approval, a request sent back, ranked asks not yet sent, a seat with no req, an opening past its start or a reconciliation exception. Each view decides when an item opens, with its own settings.',
    formula: 'items from every view − handled − snoozed',
    population: POPULATION,
    window: WINDOW,
    unit: 'int',
    goodDirection: 'down',
    uses: ITEM_USES,
    owner: OWNER,
    params: [
      {
        key: PARAM.snoozeDays.key,
        label: 'Snooze length',
        description:
          'How long Snooze hides an item. It comes back on its own when the time is up. Snoozes already set keep their end date.',
        type: 'days',
        default: DEFAULTS.snoozeDays,
        min: 1,
        max: 90,
        step: 1,
      },
    ],
  },
  {
    id: ID.itemsOverdue,
    name: 'Overdue items',
    definition: 'Open items whose due date is before the as-of date.',
    formula: 'open items with due date < as-of date',
    population: POPULATION,
    window: WINDOW,
    unit: 'int',
    goodDirection: 'down',
    uses: ITEM_USES,
    owner: OWNER,
  },
  {
    id: ID.itemsDueSoon,
    name: 'Due soon',
    definition:
      'Open items due on the as-of date or within the look-ahead after it. Overdue items are not counted.',
    formula: 'open items with as-of date ≤ due date ≤ as-of date + look-ahead',
    population: POPULATION,
    window: 'From the as-of date to the end of the look-ahead.',
    unit: 'int',
    goodDirection: 'down',
    uses: ITEM_USES,
    owner: OWNER,
    params: [
      {
        key: PARAM.dueSoonDays.key,
        label: 'Look-ahead',
        description: 'How many days after the as-of date count as due soon, for the tile and the Due filter.',
        type: 'days',
        default: DEFAULTS.dueSoonDays,
        min: 1,
        max: 60,
        step: 1,
      },
    ],
  },
  {
    id: ID.itemsCritical,
    name: 'Critical items',
    definition:
      'Open items a person waits on that are overdue by more than the overdue limit, and items the view that raised them rates critical by its own threshold.',
    formula: 'open items a person waits on and overdue > overdue limit, or rated critical by their view',
    population: POPULATION,
    window: WINDOW,
    unit: 'int',
    goodDirection: 'down',
    uses: ITEM_USES,
    owner: OWNER,
    params: [
      {
        key: PARAM.blockedDays.key,
        label: 'Overdue limit for a waiting person',
        description:
          'How many days overdue an item can be before it is critical when a person waits on it: a request waiting on an approval step. Below the limit it reads Watch.',
        type: 'days',
        default: DEFAULTS.blockedDays,
        min: 1,
        max: 90,
        step: 1,
      },
    ],
  },
  {
    id: ID.ownersWithOpen,
    name: 'Owners with open items',
    definition:
      'People with at least one open item. A person counts once across owner groups; an item with no named person counts under its owner group.',
    formula: 'distinct owners of open items',
    population: POPULATION,
    window: WINDOW,
    unit: 'int',
    goodDirection: null,
    uses: ITEM_USES,
    owner: OWNER,
  },
])
