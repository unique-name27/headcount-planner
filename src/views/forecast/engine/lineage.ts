/**
 * What each Forecast figure and tile reads (its lineage): the forecast reads plan lines, accepted
 * offers, freezes, the tree, requests and the version's assumptions (the drivers lock with versions,
 * docs/PLAN.md 12); cost adds pay. The scope adds the fields the active filters read.
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import type { DatasetKey } from '@/data/schema'
import { F, LOADED_COST, PLAN_LINE, uses } from '@/metrics/fields'

/** The datasets the Forecast view reads (docs/PLAN.md 9.1). */
export const FORECAST_DATASETS: readonly DatasetKey[] = [
  'positions',
  'workers',
  'comp',
  'reqs',
  'assumptions',
  'freezes',
]

const FORECAST = uses(PLAN_LINE, F.opened, F.offer, F.freeze, F.tree, F.seatOrg, F.request, F.assumptions)
const FORECAST_COST = uses(FORECAST, LOADED_COST)

export const FIGURE = {
  headsByMonth: FORECAST,
  yearEnd: FORECAST,
  starts: FORECAST,
  exits: uses(FORECAST, F.assignment),
  startsExits: uses(FORECAST, F.assignment),
  cost: FORECAST_COST,
  variance: FORECAST_COST,
  bridge: FORECAST_COST,
} as const satisfies Record<string, readonly FieldRef[]>
