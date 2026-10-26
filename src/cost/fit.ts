/**
 * Whether cost can show under the filters and period (docs/PLAN.md 7.3b, 7.4, 7.5 and 9.2, change
 * C33). Filters stay free for heads; a cost figure asks `costFit` and, with a reason, shows heads and
 * the reason.
 *
 * - Rounded modes (HRBP, Leader): every filter other than period, version and comparison selects a
 *   union of atoms (unit, department, leader), and the period is `fy`, `ytd` or `qtd` (`ytd` and
 *   `qtd` end at the last closed month-end). A level, location, cost center, legal entity, country or
 *   currency filter gives `ROUNDED_FILTER_NOTE`; `month` or `custom` (a month bar's "Filter to this"
 *   included) gives `ROUNDED_PERIOD_NOTE`. A `qtd` or `ytd` window that covers fewer than two closed
 *   months (`opts.windowMonths`: a quarter's first close, or April's) is one month's cost per atom,
 *   so it gives `ROUNDED_SHORT_WINDOW_NOTE` (review RR-3).
 * - Finance, and HR admin with the switch off (lead decision D-FIN, PLAN change C33): cost filters
 *   are whole business units, plus version and period. A cost-center, legal-entity, country or
 *   currency filter still narrows head counts, but a cost figure under it gives
 *   `FINANCE_FILTER_NOTE`: cost centers, countries, legal entities and currencies are rows of each
 *   unit's one fold (`financeFold`), never filters of a cost figure, because the joint-classes test
 *   (costUnions.slow.test.ts) can guarantee whole units only (reviews RF-2 and RF-5: two cost-center
 *   selections gave one hire's sign-on, and bridge steps of 1 to 4 positions). Finance's leader,
 *   department, level and location filters (the clamp clears them) give the same note; in HR admin a
 *   leader, department, level or location filter gives `SWITCH_FILTER_NOTE`. Switch on: null.
 * - Manager: `NO_AMOUNTS_NOTE` (no cost ever shows).
 *
 * Readings taken here (cost guard builder, M2; finance-guard fix, C33):
 *  - The mode's pay view is written out here (manager none, HRBP and Leader rounded, Finance exact,
 *    HR admin the switch), because cost/ never imports access/ at runtime; `fit.test.ts` checks it
 *    against src/access/pay.ts `guardModeIn` for every mode.
 *  - A filter counts as set when it lists a value, in Include or Exclude mode. Rounded modes check
 *    the filters before the period (the filter note names both conditions).
 *  - Rounded modes: a department or leader selection must also be a whole union of atoms. `costFit`
 *    checks it when it can: a Leader's leader filter on a direct sub-org that cuts an atom
 *    (`SubOrg.atoms` null in the scope), and, given `opts.atoms` and `opts.selected` (the positions
 *    the scope and the org filters select), `isUnionOfAtoms` over them. Either failure gives
 *    `WHOLE_TEAMS_NOTE`.
 *  - Exact modes: a unit filter, included or excluded, is whole units and shows; any other filter
 *    dimension hides cost (above). `opts.shownCostCenters` is no longer read (C33).
 *  - Exact modes read any period: Finance sees months.
 *
 * Pure. Reads no amount, so no minimum or step. `ScopeLock` is a type import from
 * src/access/scopes/types (the one access import cost/ may make, docs/PLAN.md 4). Frozen in the M2
 * freeze (docs/CONTRACTS-M2.md); `costFit` filled by the cost guard builder, and `fit.test.ts` covers
 * every period preset in every mode.
 */
import type { ScopeLock } from '@/access/scopes/types'
import type { Mode, Month } from '@/data/schema'
import type { Filters, ListDimension } from '@/data/scope'
import { type AtomIndex, isUnionOfAtoms } from './atoms'

export const ROUNDED_FILTER_NOTE =
  'Cost shows for whole departments and teams, by quarter, year to date and full year. Clear the location and level filters to see it.'

export const ROUNDED_PERIOD_NOTE =
  'Cost shows for the quarter to date, year to date and full year in this mode.'

/** Rounded modes: a `qtd` or `ytd` window of fewer than two closed months (review RR-3). */
export const ROUNDED_SHORT_WINDOW_NOTE =
  'Cost shows for the quarter to date and year to date once they cover two closed months in this mode.'

/**
 * Finance, and HR admin with the switch off (C33): a cost figure under a cost-center, legal-entity,
 * country or currency filter (in Finance, under any filter but a unit's).
 */
export const FINANCE_FILTER_NOTE =
  "Cost shows for whole business units. Cost centers, countries, legal entities and currencies are rows of each unit's breakdown."

export const SWITCH_FILTER_NOTE = 'Turn on Show pay amounts to see cost for this filter.'

export const NO_AMOUNTS_NOTE = 'Manager mode shows no amounts.'

/** Rounded modes: a selection or a row that is not a whole union of cost atoms (7.3a). */
export const WHOLE_TEAMS_NOTE = 'Cost shows for whole departments and teams in this mode.'

/** Exact modes: a row that cuts a cost center the unit's fold shows, or holds part of a unit's Other (7.4). */
export const WHOLE_CENTERS_NOTE = 'Cost shows for whole cost centers and units in this mode.'

/** What `costFit` reads besides the filters, scope, mode and switch. */
export interface CostFitOptions {
  /**
   * Finance and HR admin with the switch off: the cost centers the units' folds show. No longer read:
   * since C33 no cost-center filter shows cost (kept so callers still type-check).
   */
  shownCostCenters?: ReadonlySet<string> | null
  /** Rounded modes: the last close's atom index, to check that the selection is a union of atoms. */
  atoms?: AtomIndex | null
  /** Rounded modes: the positions the scope and the org filters select (with `atoms`). */
  selected?: ReadonlySet<string> | null
  /** Rounded modes: a position's manager position, for positions created since the close. */
  managerOf?: (positionId: string) => string | null
  /**
   * Rounded modes: the months the period picker's window covers (the Plan view's `windowMonths`,
   * which end at the last close on or before the as-of date). A `qtd` or `ytd` window of fewer than
   * two gives `ROUNDED_SHORT_WINDOW_NOTE`; not given, it is not checked.
   */
  windowMonths?: readonly Month[] | null
}

/** How cost/ reads a mode's pay view (the same table as src/access/pay.ts, checked by fit.test.ts). */
const PAY: Readonly<Record<Mode, 'none' | 'rounded' | 'exact' | 'switch'>> = {
  manager: 'none',
  hrbp: 'rounded',
  leader: 'rounded',
  finance: 'exact',
  'hr-admin': 'switch',
}

/** The periods rounded modes show cost for. */
const ROUNDED_PERIODS: ReadonlySet<string> = new Set(['fy', 'ytd', 'qtd'])

const isSet = (f: Filters, dim: ListDimension): boolean => (f[dim]?.length ?? 0) > 0

/** The dimensions that select a share of a unit's fold (since C33 a cost figure under any of them shows heads). */
const SHARE_DIMS: readonly ListDimension[] = ['costCenter', 'legalEntity', 'country', 'currency']

/**
 * Exact modes: whether the filters select a share of their units (a cost-center, legal-entity,
 * country, currency or department filter), so a cost figure would be the sum of the units' shown
 * cost centers and no Other shows (`GuardInput.partial`, 7.4 and 7.5). Since C33 `costFit` gives a
 * reason under every such filter, so no cost figure shows a share.
 */
export const isPartialCostFilter = (filters: Filters): boolean =>
  [...SHARE_DIMS, 'department' as const].some((d) => isSet(filters, d))

/** The reason cost cannot show under the filters and period, or null when it can (see the module comment). */
export function costFit(
  filters: Filters,
  scope: ScopeLock | null,
  mode: Mode,
  switchOn: boolean,
  opts: CostFitOptions = {},
): string | null {
  switch (PAY[mode]) {
    case 'none':
      return NO_AMOUNTS_NOTE
    case 'rounded':
      return roundedFit(filters, scope, opts)
    case 'exact':
      return exactFit(filters, false)
    case 'switch':
      return switchOn ? null : exactFit(filters, true)
  }
}

function roundedFit(filters: Filters, scope: ScopeLock | null, opts: CostFitOptions): string | null {
  for (const d of ['level', 'location', 'costCenter', 'legalEntity', 'country', 'currency'] as const)
    if (isSet(filters, d)) return ROUNDED_FILTER_NOTE
  const orgPicked = filters.leaderId != null || isSet(filters, 'department')
  if (filters.leaderId != null && scope?.kind === 'tree') {
    const sub = scope.subOrgs.find((s) => s.positionId === filters.leaderId)
    if (sub && sub.atoms === null) return WHOLE_TEAMS_NOTE
  }
  if (orgPicked && opts.atoms && opts.selected && !isUnionOfAtoms(opts.selected, opts.atoms, opts.managerOf))
    return WHOLE_TEAMS_NOTE
  if (!ROUNDED_PERIODS.has(filters.period)) return ROUNDED_PERIOD_NOTE
  // A to-date window of one closed month is that month's cost per atom (RR-3, C21).
  if ((filters.period === 'qtd' || filters.period === 'ytd') && opts.windowMonths != null)
    if (opts.windowMonths.length < 2) return ROUNDED_SHORT_WINDOW_NOTE
  return null
}

/**
 * Exact modes (C33): whole business units only. A unit filter, included or excluded, shows; a
 * leader, department, level or location filter gives Finance's note (the switch note in HR admin);
 * a cost-center, legal-entity, country or currency filter gives `FINANCE_FILTER_NOTE` in both.
 */
function exactFit(filters: Filters, hrAdmin: boolean): string | null {
  const orgNote = hrAdmin ? SWITCH_FILTER_NOTE : FINANCE_FILTER_NOTE
  if (filters.leaderId != null || isSet(filters, 'level') || isSet(filters, 'location')) return orgNote
  if (isSet(filters, 'department')) return orgNote
  if (SHARE_DIMS.some((d) => isSet(filters, d))) return FINANCE_FILTER_NOTE
  return null
}
