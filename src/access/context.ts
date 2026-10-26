/**
 * `ctx.access` (docs/PLAN.md 8): the mode, its scope, its Acting as pick, its pay and leave views and
 * `decide` bound to them, carried on the analytics context so engines and UI that hold only `ctx` ask
 * the policy the same way. An off-screen render with its own provider (a whole-view export, the leak
 * crawler) gets its own answers. Hooks read this, never the mode store.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md). `accessFor` is built in the freeze (the template
 * app's memo wiring; its `decide` and `can` call the policy, which the access builder fills), so the
 * analytics context can carry `access` from M2's first day. The access builder filled `accessClamp`
 * (`scopeFor`, then `clampFilters`, then the tree's narrowing), which `buildContext` uses by default.
 */
import type { ScopeClamp } from '@/data/context'
import type { EffectiveLists } from '@/data/lists/types'
import type { Datasets, Mode } from '@/data/schema'
import type { Filters } from '@/data/scope'
import type { MetricsApi } from '@/metrics/types'
import { NO_PICK_LABEL, PICK_BEFORE_CHANGES } from './copy'
import { LEAVE_OF, type LeaveView } from './leave'
import type { ActingAs, ModePicks } from './modes'
import { PAY_OF, type PayView } from './pay'
import { type At, type DecideInfo, type Decision, decide, policyVersion } from './policy'
import { clampFilters } from './scopes/clamp'
import { scopeFor } from './scopes/index'
import { scopeLabelOf } from './scopes/label'
import { holdingsOn } from './scopes/people'
import { requestSeats } from './scopes/records'
import type { ScopeLock, TreeScope, UnitScope } from './scopes/types'
import type { SurfaceId } from './surfaces'

export interface AccessContext {
  mode: Mode
  /** The scope the mode holds (a tree or a unit); null in the modes without one and for a company-wide leader. */
  scope: ScopeLock | null
  /**
   * A scoped mode without a usable pick (none yet, or the remembered one is not in the loaded data):
   * the scope holds nobody, so every view is empty until one is picked.
   */
  unset: boolean
  /** The mode's Acting as pick: who the person using the app acts as (audit `by`, approvals, 8.4). */
  actingAs: ActingAs | null
  /** The mode's pay view (7.1). */
  pay: PayView
  /** The mode's leave view (7.7). */
  leave: LeaveView
  /** "Show pay amounts" is on (HR admin only; memory only, off on every mode change). */
  switchOn: boolean
  /** decide() bound to this mode, for engines and UI that hold only ctx. */
  decide: (surface: SurfaceId | string, at?: At, info?: DecideInfo) => Decision
  /** Anything but hidden. */
  can: (surface: SurfaceId | string, at?: At, info?: DecideInfo) => boolean
}

/** What a context is built for: the mode, every mode's pick and the switch. */
export interface AccessInput {
  mode: Mode
  picks?: ModePicks
  switchOn?: boolean
}

type MetricLookup = Pick<MetricsApi, 'def'> | null

const bound = new WeakMap<object, Map<string, AccessContext>>()
const NO_METRICS = {}

/** A key for a scope's content, so equal scopes share one entry and the cache stays small. */
function scopeKey(s: ScopeLock | null): string {
  if (!s) return ''
  return s.kind === 'tree'
    ? `tree:${s.rootPersonId}:${s.size}:${s.positionIds.size}`
    : `unit:${s.unit}:${s.size}:${s.positionIds.size}`
}

/**
 * The access context for a mode and scope. A metric's views come from the dictionary, so a metric
 * listed only on hidden views is hidden. Memoized per dictionary, mode, scope, `unset`, pick, switch
 * and policy version.
 */
export function accessFor(
  mode: Mode,
  scope: ScopeLock | null = null,
  metrics: MetricLookup = null,
  unset = false,
  extra: { actingAs?: ActingAs | null; switchOn?: boolean } = {},
): AccessContext {
  const actingAs = extra.actingAs ?? null
  const switchOn = mode === 'hr-admin' && !!extra.switchOn
  const holder: object = metrics ?? NO_METRICS
  let byKey = bound.get(holder)
  if (!byKey) {
    byKey = new Map()
    bound.set(holder, byKey)
  }
  const pick = actingAs ? `${actingAs.personId}:${actingAs.unit ?? ''}:${actingAs.name}` : ''
  const key = `${mode}|${scopeKey(scope)}|${unset}|${pick}|${switchOn}|${policyVersion()}`
  const hit = byKey.get(key)
  if (hit && hit.scope === scope) return hit
  const metricViews = metrics ? (id: string) => metrics.def(id)?.views : undefined
  const decideHere = (s: SurfaceId | string, at?: At, info?: DecideInfo): Decision =>
    decide(mode, s, at, metricViews && !info?.metricViews ? { ...info, metricViews } : info)
  const out: AccessContext = {
    mode,
    scope,
    unset,
    actingAs,
    pay: PAY_OF[mode],
    leave: LEAVE_OF[mode],
    switchOn,
    decide: decideHere,
    can: (s, at, info) => decideHere(s, at, info).access !== 'hidden',
  }
  byKey.set(key, out)
  return out
}

/**
 * Why a change cannot be made yet (docs/PLAN.md 8.2): every mode's writes wait for an Acting as pick
 * (it signs the audit `by` and the approval identity), and a scoped mode's for one the loaded data
 * still has. Null when changes may be made.
 */
export function writeBlock(access: Pick<AccessContext, 'actingAs' | 'unset'>): string | null {
  return !access.actingAs || access.unset ? PICK_BEFORE_CHANGES : null
}

/** HR admin with no scope and no pick: what a context gets when no mode is given (tests, the gallery). */
export const ADMIN_ACCESS: AccessContext = accessFor('hr-admin')

/**
 * The scope clamp the provider passes to `buildContext` (src/data/context.tsx `ScopeClamp`): for the
 * context's mode, `scopeFor(mode, picks, env)` then `clampFilters`, the datasets narrowed to the
 * scope, its label, and `scope` and `unset` for `ctx.access`. The same function for the same picks
 * and lists (memoized), so the provider rebuilds nothing when they are unchanged.
 */
export function accessClamp(picks: ModePicks, lists: EffectiveLists | null): ScopeClamp {
  const key: object = lists ?? NO_LISTS
  let byLists = clamps.get(picks)
  if (!byLists) {
    byLists = new WeakMap()
    clamps.set(picks, byLists)
  }
  const hit = byLists.get(key)
  if (hit) return hit
  const clamp: ScopeClamp = ({ mode, filters, all, positionIndex, asOf, atoms }) => {
    const { scope, unset } = scopeFor(mode, picks, { positionIndex, asOf, all, lists, atoms })
    const kept = clampFilters(filters, scope, mode)
    const held = holdingsOn(all.workers, asOf)
    const nameOf = (positionId: string) => {
      const p = held.holderOf.get(positionId)
      return p ? held.nameOf.get(p) : undefined
    }
    const label = unset ? NO_PICK_LABEL[mode] : scope ? scopeLabelOf(scope, kept, nameOf) : undefined
    const tree = scope?.kind === 'tree' ? scope : null
    const unit = scope?.kind === 'unit' && !unset && onlyUnitPin(kept, scope.unit) ? scope : null
    return {
      filters: kept,
      scope,
      unset,
      scoped: !!scope || unset,
      ...(label ? { label } : {}),
      ...(tree ? { narrow: (data: Datasets) => narrowTree(data, tree) } : {}),
      ...(unit ? { narrow: (data: Datasets) => withUnitRequests(data, all, unit) } : {}),
    }
  }
  byLists.set(key, clamp)
  return clamp
}

const NO_LISTS = {}
const clamps = new WeakMap<ModePicks, WeakMap<object, ScopeClamp>>()

/** The filters are the unit's own pin and nothing else (the period aside). */
const onlyUnitPin = (f: Filters, unit: string): boolean =>
  !f.leaderId &&
  f.businessUnit.length === 1 &&
  f.businessUnit[0] === unit &&
  !Object.keys(f.modes).length &&
  !f.department.length &&
  !f.costCenter.length &&
  !f.location.length &&
  !f.level.length &&
  !f.legalEntity.length &&
  !f.country.length &&
  !f.currency.length

const withUnit = new WeakMap<Datasets, WeakMap<UnitScope, Datasets>>()

/**
 * A unit's requests, and the ones of another unit that touch one of its positions (a transfer into
 * the unit, a trade getting seats in it): rule 1 shows them in full to the HRBP of each unit they
 * touch (8.4), so the receiving HRBP's queue and approvals hold them. Only while the filters are the
 * unit's own pin, so a narrower filter keeps its rows exactly.
 */
export function withUnitRequests(data: Datasets, all: Datasets, scope: UnitScope): Datasets {
  let byScope = withUnit.get(data)
  if (!byScope) {
    byScope = new WeakMap()
    withUnit.set(data, byScope)
  }
  const hit = byScope.get(scope)
  if (hit) return hit
  const have = new Set(data.requests)
  const extra = new Set(
    all.requests.filter((r) => {
      if (have.has(r)) return false
      const { touched, orgs } = requestSeats(r as unknown as Record<string, unknown>)
      return [...touched, ...orgs].some((id) => scope.positionIds.has(id))
    }),
  )
  const out: Datasets = extra.size
    ? { ...data, requests: all.requests.filter((r) => have.has(r) || extra.has(r)) }
    : data
  byScope.set(scope, out)
  return out
}

/** The rows that pass, or the same array when every row does. */
function keep<T>(rows: readonly T[], ok: (r: T) => boolean): T[] {
  const out = rows.filter(ok)
  return out.length === rows.length ? (rows as T[]) : out
}

const narrowed = new WeakMap<Datasets, WeakMap<TreeScope, Datasets>>()

/**
 * The datasets inside a tree once the leader filter holds its root seat: everything about the root
 * seats themselves and the person acting is left out (R23), so a Manager's own seat, pay, reqs and
 * the requests that touch it never reach Manager mode (Manager C). Org rows (targets, freezes) stay.
 */
export function narrowTree(data: Datasets, scope: TreeScope): Datasets {
  if (!scope.rootPositionIds.size) return data
  let byScope = narrowed.get(data)
  if (!byScope) {
    byScope = new WeakMap()
    narrowed.set(data, byScope)
  }
  const hit = byScope.get(scope)
  if (hit) return hit
  const roots = scope.rootPositionIds
  const me = scope.rootPersonId
  const workers = keep(data.workers, (w) => w.employeeId !== me && !(w.positionId && roots.has(w.positionId)))
  const out: Datasets = {
    ...data,
    positions: keep(data.positions, (r) => !roots.has(r.positionId)),
    workers,
    comp: keep(data.comp, (c) => c.employeeId !== me),
    reqs: keep(data.reqs, (r) => !(r.positionId && roots.has(r.positionId))),
    requests: keep(
      data.requests,
      (r) => !requestSeats(r as unknown as Record<string, unknown>).touched.some((id) => roots.has(id)),
    ),
  }
  byScope.set(scope, out)
  return out
}
