/**
 * Pay views (docs/PLAN.md 7.1): who sees which amounts.
 *
 * - `switch` (HR admin): with "Show pay amounts" off, Finance's exact rules and filter rule (7.5);
 *   with it on, per-person amounts and exact totals with no guard.
 * - `exact` (Finance): exact totals over 5 or more costed people, one cost-center fold per unit,
 *   never one person's pay.
 * - `rounded` (HRBP, Leader): $0.1M round-down per cost atom, `sumRounded`, groups under 5 left out,
 *   whole-atom filters, periods fy, ytd and qtd only.
 * - `none` (Manager): heads and band-cost status words only; no amounts anywhere.
 *
 * "Show pay amounts" is session-only memory, never persisted, and turns off on every mode change; only
 * HR admin has it. `showCostIn` does not copy the template app's refusal of every scoped mode
 * (docs/PLAN.md 1.1): HRBP and Leader see rounded cost under the atom rules.
 *
 * Pure. Frozen in the M2 freeze (docs/CONTRACTS-M2.md). Built in the freeze: `PAY_OF`, `payView`,
 * `showPayIn`, `showCostIn`, `roundedIn` (PLAN 7.1 gives their bodies) and `guardModeIn` (the same
 * table read for `src/cost/`, which cannot import this module); the access builder filled
 * `payDecisions` and added `costDecisions` (8.3's `cost:*` rows).
 */

import type { GuardMode } from '@/cost/guard'
import type { Mode } from '@/data/schema'
import { MODE_NAME } from './modes'
import { type Decision, hidden, limited, SHOWN } from './policy/types'

export type PayView = 'switch' | 'exact' | 'rounded' | 'none'

/** Each mode's pay view (docs/PLAN.md 7.1 and 8.1). */
export const PAY_OF: Readonly<Record<Mode, PayView>> = {
  manager: 'none',
  hrbp: 'rounded',
  leader: 'rounded',
  finance: 'exact',
  'hr-admin': 'switch',
}

/** The mode's pay view (no overrides in Phase 1; the template app's slot for them is gone). */
export const payView = (mode: Mode): PayView => PAY_OF[mode]

/** Per-person amounts may show: HR admin with "Show pay amounts" on. */
export const showPayIn = (mode: Mode, switchOn: boolean): boolean => PAY_OF[mode] === 'switch' && switchOn

/** Cost totals may show (under the mode's guard): every mode but Manager. The switch does not matter. */
export const showCostIn = (mode: Mode, _switchOn: boolean): boolean => PAY_OF[mode] !== 'none'

/** Cost is rounded per atom: HRBP and Leader. The switch does not matter. */
export const roundedIn = (mode: Mode, _switchOn: boolean): boolean => PAY_OF[mode] === 'rounded'

/**
 * How the cost guard treats amounts in a mode (src/cost/guard.ts `GuardMode`): 'none' (Manager),
 * 'rounded' (HRBP, Leader), 'exact' (Finance, and HR admin with the switch off, 7.5), 'open' (HR
 * admin with the switch on: per-person amounts, no minimum).
 */
export function guardModeIn(mode: Mode, switchOn: boolean): GuardMode {
  switch (PAY_OF[mode]) {
    case 'none':
      return 'none'
    case 'rounded':
      return 'rounded'
    case 'exact':
      return 'exact'
    case 'switch':
      return switchOn ? 'open' : 'exact'
  }
}

/** The `pay:*` surfaces (docs/PLAN.md 8.3's money table). */
export type PaySurface = 'pay:switch' | 'pay:amounts' | 'pay:exact' | 'pay:rounded'

/**
 * The `pay:*` decisions of a mode, from its pay view, each L and H with 8.3's reason ("Manager mode
 * shows no amounts.", "Groups of 5 or more costed people.", "Rounded down to $0.1M per team, at QTD,
 * YTD and full year; groups under 5 left out."). The policy tables spread these.
 */
export function payDecisions(mode: Mode): Readonly<Record<PaySurface, Decision>> {
  switch (PAY_OF[mode]) {
    case 'switch':
      return {
        'pay:switch': SHOWN,
        'pay:amounts': limited(SWITCH_ON),
        'pay:exact': SHOWN,
        'pay:rounded': hidden('HR admin mode shows exact totals, never rounded ones.'),
      }
    case 'exact':
      return {
        'pay:switch': hidden("Finance mode shows totals, never one person's pay."),
        'pay:amounts': hidden("Finance mode shows totals, never one person's pay."),
        'pay:exact': limited('Groups of 5 or more costed people.'),
        'pay:rounded': hidden('Finance mode shows exact totals over 5 or more costed people.'),
      }
    case 'rounded': {
      const name = MODE_NAME[mode]
      return {
        'pay:switch': hidden(`${name} mode shows totals rounded to $0.1M.`),
        'pay:amounts': hidden(`${name} mode never shows one person's pay.`),
        'pay:exact': hidden(`${name} mode rounds totals down to $0.1M per team.`),
        'pay:rounded': limited(ROUNDED_HOW),
      }
    }
    case 'none':
      return {
        'pay:switch': hidden(NO_AMOUNTS),
        'pay:amounts': hidden(NO_AMOUNTS),
        'pay:exact': hidden(NO_AMOUNTS),
        'pay:rounded': hidden(NO_AMOUNTS),
      }
  }
}

/** What the switch does to a per-person surface in HR admin mode. */
export const SWITCH_ON = 'With Show pay amounts on.'
/** Manager mode's one sentence for every money surface. */
export const NO_AMOUNTS = 'Manager mode shows no amounts.'
/** HRBP and Leader's rounded totals (docs/PLAN.md 8.3). */
export const ROUNDED_HOW =
  'Rounded down to $0.1M per team, at QTD, YTD and full year; groups under 5 left out.'

/** The `cost:*` surfaces (docs/PLAN.md 8.3's money table). */
export type CostSurface = 'cost:band' | 'cost:monthly' | 'cost:component'

/**
 * The `cost:*` decisions of a mode, from its pay view: band estimates show wherever any amount does
 * (never in Manager mode); monthly cost and the component family (cost by component, incl. SBC, the
 * exit run rate and freeze savings amounts) show only where totals are exact (Finance, HR admin).
 */
export function costDecisions(mode: Mode): Readonly<Record<CostSurface, Decision>> {
  switch (PAY_OF[mode]) {
    case 'none':
      return {
        'cost:band': hidden('Managers see heads and standard heads, never amounts.'),
        'cost:monthly': hidden(NO_AMOUNTS),
        'cost:component': hidden(NO_AMOUNTS),
      }
    case 'rounded':
      return {
        'cost:band': SHOWN,
        'cost:monthly': hidden('Monthly cost shows as heads in this mode.'),
        'cost:component': hidden(COMPONENT_HOW),
      }
    default:
      return { 'cost:band': SHOWN, 'cost:monthly': SHOWN, 'cost:component': SHOWN }
  }
}

/** Why rounded modes leave out components, incl. SBC, the exit run rate and freeze savings amounts. */
export const COMPONENT_HOW = 'This mode shows loaded cost at QTD, YTD and full year only.'
