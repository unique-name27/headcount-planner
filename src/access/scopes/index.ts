/**
 * Scopes (docs/PLAN.md 8.2): which positions and people a mode's Acting as pick holds, and who can
 * be picked.
 *
 * - Manager: anyone who holds a position that is another position's `managerPositionId` (any team
 *   size, so Manager C and the team-of-3 manager qualify). The tree is strictly below their own
 *   seats (R23).
 * - Leader: holders of leader seats (Director+ or marked in Lists). The CEO, CFO and CHRO see the
 *   company (`scope: null`, `unset: false`).
 * - HRBP: the Units list's HRBP column, one row per unit; the scope is the unit.
 * - Finance and HR admin: anyone on the Lists role columns (else any active employee); no scope.
 *   Their pick sets the audit `by` and the approval identity; writes are refused until one exists.
 *
 * A missing or gone pick gives an EMPTY scope of its kind and `unset: true`, never the company.
 * Scopes are memoized per positions and workers arrays, date, pick, lists and atom index, so a filter
 * change keeps the same scope object.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); the access builder filled the bodies, split as
 * the template app splits them (tree.ts, unit.ts, pickers.ts, label.ts, people.ts). `ScopeEnv` gains
 * two optional fields (an addition): `atoms`, the cost-atom index the sub-orgs' `atoms` read, and
 * `personas`, the sample's personas the picker lists first.
 */
import type { AtomIndex } from '@/cost/atoms'
import { unitHrbps } from '@/data/lists/roles'
import type { EffectiveLists } from '@/data/lists/types'
import type { Persona } from '@/data/sample'
import type { Datasets, ISODate, Mode, PositionRow, WorkerRow } from '@/data/schema'
import type { PositionIndex } from '@/data/scope'
import { type ActingAs, type ModePicks, SCOPE_OF } from '../modes'
import { atomsOn } from './atoms'
import { holdingsOn } from './people'
import { companyLeaderSeats, isLeaderSeat, leaderLevelSet, pickRows } from './pickers'
import { emptyTreeScope, treeScope } from './tree'
import type { ScopeLock } from './types'
import { emptyUnitScope, unitScope } from './unit'

export * from './clamp'
export * from './label'
export { NOBODY } from './nobody'
export * from './records'
export { emptyTreeScope, treeHas, treeScope } from './tree'
export * from './types'
export { emptyUnitScope, unitScope } from './unit'

/** What building a scope reads. */
export interface ScopeEnv {
  /** The position tree as of the as-of date (`ctx.positionIndex`). */
  positionIndex: PositionIndex
  asOf: ISODate
  /** Every dataset, unscoped. */
  all: Datasets
  /**
   * The lists in force: leader seats (Levels' "Leader seats" marks), each unit's HRBP (Units' HRBP
   * column), the Roles list's people. Null: the built-in rules (Director+ by level; no HRBP column,
   * so every HRBP pick is unset with uploaded data).
   */
  lists?: EffectiveLists | null
  /**
   * Seats whose holders see the whole company in Leader mode (the CEO, CFO and CHRO). Not given: the
   * access builder derives them from the data. PLAN 8.2 names the three seats but not how to find
   * them, so the builder records its reading in the M2 report.
   */
  companyLeaders?: ReadonlySet<string> | null
  /** The cost-atom index (the last close's); not given: the index at the month-end on or before the as-of date. */
  atoms?: AtomIndex | null
  /** The sample's personas, listed first in the picker (13.3); none with uploaded data. */
  personas?: readonly Persona[] | null
}

export interface ScopeResult {
  scope: ScopeLock | null
  /** The mode needs a pick it does not have (none yet, or one not in the loaded data). */
  unset: boolean
}

const NONE: ScopeResult = Object.freeze({ scope: null, unset: false })

/* ───────────── memo ───────────── */

let nextId = 1
const objectIds = new WeakMap<object, number>()
const idOf = (o: object | null | undefined): number => {
  if (!o) return 0
  let k = objectIds.get(o)
  if (!k) {
    k = nextId++
    objectIds.set(o, k)
  }
  return k
}

const memo = new WeakMap<readonly PositionRow[], WeakMap<readonly WorkerRow[], Map<string, ScopeResult>>>()

function memoized(env: ScopeEnv, key: string, build: () => ScopeResult): ScopeResult {
  let byWorkers = memo.get(env.all.positions)
  if (!byWorkers) {
    byWorkers = new WeakMap()
    memo.set(env.all.positions, byWorkers)
  }
  let byKey = byWorkers.get(env.all.workers)
  if (!byKey) {
    byKey = new Map()
    byWorkers.set(env.all.workers, byKey)
  }
  const full = `${env.asOf}|${idOf(env.lists)}|${idOf(env.atoms)}|${idOf(env.companyLeaders)}|${key}`
  let hit = byKey.get(full)
  if (!hit) {
    hit = build()
    byKey.set(full, hit)
  }
  return hit
}

/* ───────────── scopeFor ───────────── */

/** The atom index the scope's sub-orgs read. */
const atomsOf = (env: ScopeEnv): AtomIndex => env.atoms ?? atomsOn(env.all.positions, env.asOf)

/** The seats whose holders see the company in Leader mode. */
const companyOf = (env: ScopeEnv): ReadonlySet<string> =>
  env.companyLeaders ?? companyLeaderSeats(env.positionIndex)

function treeFor(mode: 'manager' | 'leader', pick: ActingAs | null, env: ScopeEnv): ScopeResult {
  if (!pick?.personId) return { scope: emptyTreeScope(null), unset: true }
  const gone: ScopeResult = { scope: emptyTreeScope(pick.personId), unset: true }
  const held = holdingsOn(env.all.workers, env.asOf)
  const seats = (held.seatsOf.get(pick.personId) ?? []).filter((s) => env.positionIndex.byId.has(s))
  if (mode === 'leader') {
    const levels = leaderLevelSet(env.lists)
    const leaderSeats = seats.filter((s) =>
      isLeaderSeat(env.positionIndex.byId.get(s) as PositionRow, levels),
    )
    if (!leaderSeats.length) return gone
    const company = companyOf(env)
    if (leaderSeats.some((s) => company.has(s))) return NONE
  } else if (!seats.some((s) => (env.positionIndex.children.get(s)?.length ?? 0) > 0)) return gone
  const scope = treeScope({
    index: env.positionIndex,
    all: env.all,
    asOf: env.asOf,
    personId: pick.personId,
    name: pick.name,
    atoms: atomsOf(env),
    kind: mode,
  })
  return scope ? { scope, unset: false } : gone
}

function unitFor(pick: ActingAs | null, env: ScopeEnv): ScopeResult {
  const unit = pick?.unit?.trim()
  if (!pick?.personId || !unit) return { scope: emptyUnitScope(null), unset: true }
  const gone: ScopeResult = { scope: emptyUnitScope(unit), unset: true }
  // The pick holds only while the Units list names this person as the unit's HRBP.
  if (!env.lists || unitHrbps(env.lists).get(unit) !== pick.personId) return gone
  const scope = unitScope(env.positionIndex, env.all, env.asOf, unit, env.lists)
  return scope.positionIds.size ? { scope, unset: false } : gone
}

/**
 * The scope a mode's pick holds (docs/PLAN.md 8.2). Finance and HR admin: `{ scope: null, unset:
 * false }`; a Leader pick of the CEO, CFO or CHRO: `{ scope: null, unset: false }`; a scoped mode
 * with no usable pick: an empty scope of its kind and `unset: true`.
 */
export function scopeFor(mode: Mode, picks: ModePicks, env: ScopeEnv): ScopeResult {
  const kind = SCOPE_OF[mode]
  if (!kind) return NONE
  const pick = picks[mode]
  const key = `${mode}|${pick?.personId ?? ''}|${pick?.unit ?? ''}|${pick?.name ?? ''}`
  return memoized(env, key, () =>
    kind === 'unit' ? unitFor(pick, env) : treeFor(mode as 'manager' | 'leader', pick, env),
  )
}

/* ───────────── Acting as ───────────── */

/** One row of the Acting as picker. */
export interface ActingAsOption {
  /** What choosing the row stores. */
  pick: ActingAs
  /** The row's second line: "Silicon Engineering · 556 people", "Director, Design Verification". */
  line: string
  /** Leader mode: a CEO, CFO or CHRO pick sees the whole company. */
  company: boolean
  /** The sample's persona for the mode (listed first, docs/PLAN.md 13.3). */
  persona: boolean
}

/** The people a mode can act as (see the module comment), personas first, then largest scope first. */
export function actingAsOptions(mode: Mode, env: ScopeEnv): readonly ActingAsOption[] {
  return pickRows(mode, {
    index: env.positionIndex,
    workers: env.all.workers,
    asOf: env.asOf,
    lists: env.lists ?? null,
    companyLeaders: companyOf(env),
    personas: env.personas ?? [],
  }).map(({ pick, line, company, persona }) => ({ pick, line, company, persona }))
}
