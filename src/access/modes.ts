/**
 * The five modes and every per-mode table (docs/PLAN.md 8.1). `Mode`, `MODES` and `isMode` are
 * declared in src/data/schema.ts (frozen in M1) and re-exported here. The pay view (`PAY_OF`) lives
 * in ./pay and the leave view (`LEAVE_OF`) in ./leave; both are re-exported here, so this module is
 * where every per-mode table can be read.
 *
 * Acting as is a pick, not sign-in (8.2): it sets the scope (Manager, Leader), the unit (HRBP), the
 * audit `by` and the approval identity. With the sample every mode's Acting as starts on its sample
 * persona (13.3); with uploaded data a scoped mode opens its picker and shows nobody until a pick is
 * made (an unset pick holds an empty scope, never the company).
 *
 * Pure data and a few tiny readers. Frozen in the M2 freeze (docs/CONTRACTS-M2.md). Built in the
 * freeze: the tables, `homeOf`, `homeViewOf`, `hasPick`; the access builder filled
 * `isOtherHomeFigure` (the template app's rule) and `modeButtonLabel`.
 */

import type { Mode, RouteView } from '@/data/schema'
import { FILTER_DIMENSIONS, type FilterDimension } from '@/data/scope'
import type { Route } from '@/data/store'
import type { ScopeKind } from './scopes/types'

export { isMode, MODES, type Mode } from '@/data/schema'
export { LEAVE_OF, type LeaveView } from './leave'
export { PAY_OF, type PayView } from './pay'
export type { ScopeKind } from './scopes/types'

/** The mode on first load: HR admin, the full mode (8.1). Also what a missing or corrupt `hcp:mode` reads as. */
export const DEFAULT_MODE: Mode = 'hr-admin'

/* ───────────── names ───────────── */

export const MODE_LABEL: Readonly<Record<Mode, string>> = {
  manager: 'Manager',
  hrbp: 'HRBP',
  leader: 'Leader',
  finance: 'Finance',
  'hr-admin': 'HR admin',
}

/** The name inside a sentence, before "mode": "HRBP mode", "HR admin mode". */
export const MODE_NAME: Readonly<Record<Mode, string>> = MODE_LABEL

/** The Mode button's short name under 640px. */
export const MODE_SHORT: Readonly<Record<Mode, string>> = {
  manager: 'Manager',
  hrbp: 'HRBP',
  leader: 'Leader',
  finance: 'Finance',
  'hr-admin': 'Admin',
}

/** The line under each mode in the Mode menu (8.1). */
export const MODE_HINT: Readonly<Record<Mode, string>> = {
  manager: "Your team's roles: get them approved and filled, and see what is left.",
  hrbp: "One business unit's plan and cycle: positions, requests, approvals and transfers.",
  leader: 'Your org against its target: approvals, sub-org targets and What if.',
  finance: 'The whole company: targets, assumptions, FX, freezes, cycles, close and locks.',
  'hr-admin': 'Everything, the Data room and imports, with pay amounts behind a switch.',
}

export type ModeGroupKey = 'business' | 'hr' | 'finance'
export interface ModeGroup {
  key: ModeGroupKey
  /** The muted heading in the Mode menu. */
  label: string
  modes: readonly Mode[]
}

/** The Mode menu's groups (8.1), in the order their first mode appears in `MODES`. */
export const MODE_GROUPS: readonly ModeGroup[] = [
  { key: 'business', label: 'Leaders and managers', modes: ['manager', 'leader'] },
  { key: 'hr', label: 'HR', modes: ['hrbp', 'hr-admin'] },
  { key: 'finance', label: 'Finance', modes: ['finance'] },
]

/* ───────────── homes ───────────── */

/** The page each mode opens on (`HOME_OF`, 8.1): My team, the role Home, or the Data room. */
export const HOME_OF: Readonly<Record<Mode, RouteView>> = {
  manager: 'team',
  hrbp: 'home',
  leader: 'home',
  finance: 'home',
  'hr-admin': 'data',
}

/** The home's name in a redirect toast: "Headcount Planner opened Unit plan instead." */
export const HOME_LABEL: Readonly<Record<Mode, string>> = {
  manager: 'My team',
  hrbp: 'Unit plan',
  leader: 'Rollup vs target',
  finance: 'Plan vs actual',
  'hr-admin': 'the Data room',
}

/**
 * The slug of each role home's figure ids (`home-<slug>-<thing>`, 8.1 and 9.3); null for the modes
 * whose home is not the Home view (My team's figures are the team view's own; HR admin opens on the
 * Data room).
 */
export const HOME_SLUG: Readonly<Record<Mode, string | null>> = {
  manager: null,
  hrbp: 'unit',
  leader: 'rollup',
  finance: 'fin',
  'hr-admin': null,
}

/** Figures every role home draws (Needs attention, Waiting on others, My list). */
export const SHARED_HOME_FIGURES: readonly string[] = ['home-attention-wait', 'home-attention', 'home-list']

/** The mode's home view (no overrides in Phase 1). */
export const homeViewOf = (mode: Mode): RouteView => HOME_OF[mode]

/** The mode's home route. */
export const homeOf = (mode: Mode): Route => ({ view: HOME_OF[mode], tab: '' })

/** A `home-` figure that belongs to another mode's home (shared home figures belong to every one). */
export function isOtherHomeFigure(mode: Mode, figureId: string): boolean {
  if (!figureId.startsWith('home-') || SHARED_HOME_FIGURES.includes(figureId)) return false
  const slug = HOME_SLUG[mode]
  return !slug || !figureId.startsWith(`home-${slug}-`)
}

/* ───────────── scopes and Acting as (8.1, 8.2) ───────────── */

/** The scope kind each mode holds; null for the modes that see the whole company (`SCOPE_OF`). */
export const SCOPE_OF: Readonly<Record<Mode, ScopeKind | null>> = {
  manager: 'tree',
  hrbp: 'unit',
  leader: 'tree',
  finance: null,
  'hr-admin': null,
}

/** Who a mode acts as (`ActingAs`): one per mode, kept when the mode changes. */
export interface ActingAs {
  personId: string
  name: string
  /** HRBP only: the unit they support. */
  unit?: string
}

/** Every mode's Acting as pick (stored at `hcp:mode` as `{ v: 1, mode, actingAs }`). */
export type ModePicks = Readonly<Record<Mode, ActingAs | null>>

export const NO_PICKS: ModePicks = Object.freeze({
  manager: null,
  hrbp: null,
  leader: null,
  finance: null,
  'hr-admin': null,
})

/** What each mode's Acting as picks, in words (8.1). */
export const PICK_LABEL: Readonly<Record<Mode, string>> = {
  manager: 'a manager',
  hrbp: 'an HRBP (one unit)',
  leader: 'a leader',
  finance: 'a Finance person',
  'hr-admin': 'an HR admin',
}

/**
 * A missing pick blocks reads (8.1): Manager, HRBP and Leader show nobody until a pick exists;
 * Finance and HR admin read without one, but refuse writes until a pick exists (8.2).
 */
export const PICK_BLOCKS_READS: Readonly<Record<Mode, boolean>> = {
  manager: true,
  hrbp: true,
  leader: true,
  finance: false,
  'hr-admin': false,
}

/** The mode has an Acting as pick (HRBP's needs its unit too). */
export const hasPick = (mode: Mode, picks: ModePicks): boolean => {
  const p = picks[mode]
  return !!p?.personId && (mode !== 'hrbp' || !!p.unit)
}

/**
 * The Mode button's text (8.1): "Manager: Priya Raman", "HRBP: Silicon Engineering", "Leader: Dana
 * Ito", "Finance mode", "HR admin mode"; a scoped mode waiting for its pick reads "<mode> mode".
 */
export function modeButtonLabel(mode: Mode, pick: ActingAs | null): string {
  if (!SCOPE_OF[mode] || !pick) return `${MODE_NAME[mode]} mode`
  if (mode === 'hrbp') return pick.unit ? `${MODE_NAME[mode]}: ${pick.unit}` : `${MODE_NAME[mode]} mode`
  return pick.name ? `${MODE_NAME[mode]}: ${pick.name}` : `${MODE_NAME[mode]} mode`
}

/* ───────────── comparison and filters (8.1, 9.2) ───────────── */

/** A mode's default comparison within the shown version's fiscal year. */
export type CompareDefault = 'budget' | 'plan-of-record'

/**
 * Each mode's default comparison (`COMPARE_DEFAULT`, 8.1): Finance compares with the fiscal year's
 * Budget, every other mode with its plan of record. A year without that version compares with its
 * target in every mode, Finance included (src/data/context.tsx `resolveCompare`, which re-exports
 * this table).
 */
export const COMPARE_DEFAULT: Readonly<Record<Mode, CompareDefault>> = {
  manager: 'plan-of-record',
  hrbp: 'plan-of-record',
  leader: 'plan-of-record',
  finance: 'budget',
  'hr-admin': 'plan-of-record',
}

/**
 * The filter dimensions each mode's filter row offers (`FILTER_DIMS_OF`, 8.1): Manager the leader,
 * level and location inside the tree; HRBP all, inside the unit; Leader all, inside the tree;
 * Finance unit, cost center, legal entity, country and currency (include only); HR admin all (with
 * the switch off, cost under them follows Finance's `costFit` with department as one more
 * one-at-a-time dimension, 7.5). The clamp (./scopes/clamp.ts) holds them.
 */
export const FILTER_DIMS_OF: Readonly<Record<Mode, readonly FilterDimension[]>> = {
  manager: ['leaderId', 'level', 'location'],
  hrbp: FILTER_DIMENSIONS,
  leader: FILTER_DIMENSIONS,
  finance: ['businessUnit', 'costCenter', 'legalEntity', 'country', 'currency'],
  'hr-admin': FILTER_DIMENSIONS,
}
