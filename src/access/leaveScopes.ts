/**
 * The leave count a mode shows (docs/PLAN.md 7.7, change C25): `plan.leave.onLeave`, one count of the
 * people on leave in the mode's whole scope at the as-of date, in HRBP and Leader mode only.
 *
 * Acting as is free, so whether a scope's count shows is decided over every HRBP and Leader scope at
 * once: each HRBP pick's unit, each leader pick's tree, and the company for a CEO, CFO or CHRO pick
 * (`leaveScopesOf`). `leaveShown` keeps the scopes with 5 or more on leave whose classes of people on
 * leave each hold 0 or 5 or more, once per data load and as-of date (memoized here). A scope that
 * shows reads its count only with no filter but its own pin and the default period (`leaveFit`).
 *
 * The minimum is the locked `privacy.leaveCounts` setting (`minLeaveCountOf`), never a constant. Leave
 * never changes who is costed: the cost guard never reads anything here. Integration addition (M2):
 * the views-1 builder left the tile out until this helper existed.
 */
import type { AnalyticsContext } from '@/data/context'
import type { ISODate } from '@/data/schema'
import { minLeaveCountOf } from '@/metrics/privacy'
import { LEAVE_FIT_NOTE, LEAVE_OF, type LeaveScope, leaveFit, leaveShown, peopleOnLeave } from './leave'
import { contextLists } from './lists'
import { NO_PICKS } from './modes'
import { actingAsOptions, type ScopeEnv, type ScopeLock, scopeFor } from './scopes'

/** A scope's key among the leave scopes: "company", "unit:<unit>" or "tree:<root seats>". */
export const leaveScopeKey = (scope: ScopeLock | null): string =>
  !scope
    ? 'company'
    : scope.kind === 'unit'
      ? `unit:${scope.unit}`
      : `tree:${[...scope.rootPositionIds].sort().join('+')}`

/** Every HRBP and Leader scope on the env's as-of date, as leave scopes (unset picks left out). */
export function leaveScopesOf(env: ScopeEnv): LeaveScope[] {
  const out = new Map<string, LeaveScope>()
  let everyone: ReadonlySet<string> | null = null
  for (const mode of ['hrbp', 'leader'] as const)
    for (const o of actingAsOptions(mode, env)) {
      const r = scopeFor(mode, { ...NO_PICKS, [mode]: o.pick }, env)
      if (r.unset) continue
      const key = leaveScopeKey(r.scope)
      if (out.has(key)) continue
      everyone ??= new Set(env.all.workers.map((w) => w.employeeId))
      out.set(key, { key, personIds: r.scope ? r.scope.personIds : everyone })
    }
  return [...out.values()]
}

interface LeaveLoad {
  /** The scopes whose count shows (`leaveShown`). */
  shown: ReadonlySet<string>
  /** The people on leave on the as-of date. */
  onLeave: ReadonlySet<string>
}

let nextId = 1
const ids = new WeakMap<object, number>()
const idOf = (o: object | null | undefined): number => {
  if (!o) return 0
  let k = ids.get(o)
  if (!k) {
    k = nextId++
    ids.set(o, k)
  }
  return k
}
const loads = new WeakMap<object, Map<string, LeaveLoad>>()

/** The shown leave scopes and the people on leave, once per data load, as-of date, lists and minimum. */
function leaveLoadOf(ctx: AnalyticsContext, min: number): LeaveLoad {
  const lists = contextLists(ctx)
  const key = `${ctx.asOf}|${idOf(ctx.all.positions)}|${idOf(lists)}|${idOf(ctx.guard.atoms)}|${min}`
  let byKey = loads.get(ctx.all.workers)
  if (!byKey) {
    byKey = new Map()
    loads.set(ctx.all.workers, byKey)
  }
  let hit = byKey.get(key)
  if (!hit) {
    const env: ScopeEnv = {
      positionIndex: ctx.positionIndex,
      asOf: ctx.asOf,
      all: ctx.all,
      lists,
      atoms: ctx.guard.atoms,
    }
    const scopes = leaveScopesOf(env)
    hit = {
      shown: leaveShown(scopes, ctx.asOf, { workers: ctx.all.workers, min }),
      onLeave: peopleOnLeave(ctx.all.workers, ctx.asOf),
    }
    byKey.set(key, hit)
  }
  return hit
}

/** What the leave count reads in a context. */
export interface LeaveCount {
  /** The count, or null when it reads "—". */
  value: number | null
  /** Why it reads "—", else null. */
  reason: string | null
  /** The whole scope it counts: the HRBP's unit, the leader's org, or the company. */
  scopeLabel: string
  asOf: ISODate
  /** The smallest count shown. */
  min: number
}

/**
 * The mode's leave count (see the module comment); null in a mode with no leave count (Manager,
 * Finance: no leave data at all; HR admin, who reads leave in the Data room and per person with the
 * switch on).
 */
export function leaveCountOf(ctx: AnalyticsContext): LeaveCount | null {
  const a = ctx.access
  if (LEAVE_OF[a.mode] !== 'counts') return null
  const min = minLeaveCountOf(ctx.metrics)
  const scope = a.scope
  const scopeLabel = !scope ? 'the company' : scope.kind === 'unit' ? scope.unit : scope.label
  const base = { scopeLabel, asOf: ctx.asOf, min }
  if (a.unset) return { ...base, value: null, reason: LEAVE_FIT_NOTE }
  const fit = leaveFit(ctx.filters, ctx.filters.period, scope)
  if (fit) return { ...base, value: null, reason: fit }
  const load = leaveLoadOf(ctx, min)
  if (!load.shown.has(leaveScopeKey(scope)))
    return { ...base, value: null, reason: `Hidden to protect anonymity (n < ${min})` }
  let n = 0
  if (!scope) n = load.onLeave.size
  else for (const id of load.onLeave) if (scope.personIds.has(id)) n++
  return { ...base, value: n, reason: null }
}
