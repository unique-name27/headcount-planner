/**
 * The action context the write path builds from the analytics context (docs/PLAN.md 5.4, 8.2 to 8.4;
 * M3 freeze): the mode, the Acting as person (audit `by`), the clock, the unscoped datasets with
 * Working's overlay, the settings from the metric dictionary, the store's read-only flag, `decide`
 * bound to the mode, the person-level rules and the engines' inputs (src/plan/actions/types.ts).
 * Built once per analytics context and memoized; every function it holds is pure.
 *
 * - `actor`: `ctx.access.actingAs` (personId and name) with `ctx.access.mode`; with no pick the
 *   context still builds, and `writeBlock` (src/access/context.ts) refuses every action.
 * - `rules` over src/access/visibility.ts (`viewerOf`, `requestView`, `commentVisible`, `hasAmount`)
 *   and the mode's scope (`ctx.access.scope`).
 * - `env` over the engines, the drill layer's seat index (src/drill/seats.ts) and
 *   ./routing.ts; `env.assumptionEditRefusal` is src/views/finance/engine/edits.ts
 *   `assumptionEditCheck`; `env.computeLock` is ./lock.ts `lockContentOf`.
 *
 * Readings taken here (core, M3):
 *  - A new request's ID is 'R-<tag>-<n>' under the workspace's tag (`PlanState.idTag`; the M3 review's
 *    D-ID, src/plan/actions/requestIds.ts): unique across browsers, and the Acting as person's next
 *    ID never moves for a request someone else made, a hidden one included (SC-13). Its number is a
 *    keyed hash of the workspace's secret (`PlanState.idSecret`), so no ID names its requester (M3
 *    recheck). The app's store always gives the plan a tag and a secret; a context with no tag (no
 *    store behind it) numbers 'R-<n>' after the highest number in force, as before. A new freeze is
 *    'FRZ-<tag>-<n>' under the tag the same way (M3 recheck), 'FRZ-<n>' with none.
 *  - A new seat's ID is 'P-<request ID without "R-">-<n>' (the n-th seat the request adds): stable for
 *    a request, and never an ID the data holds (a letter is added when it does).
 *  - A new seat under a manager position takes the manager's unit and department, the cost center
 *    of that department at the new seat's location where the data has one (else the manager's), and
 *    the location's legal entity.
 *  - A cycle's ranked asks are counted by their requests' own business unit, heads at the unit
 *    target's date (else the year's end), in-year band at the year's Working.
 *  - Scope rules: a Manager's tree is strictly below its own seat (R23) and a new seat may report to
 *    the own seat; an HRBP's unit is the pick's unit and the Units list's; no scope reads true.
 *  - Leader Import requests (`mayMerge`, 5.5): a request merges when it touches a seat in the
 *    leader's tree, strictly below the leader's own seats (8.2), or the leader is on its chain; a
 *    request about the leader's own seat is never merged (review PV-7, 8.4 rule 3).
 *  - Pending is read at the as-of date through the engine's one helper (`isPendingNow`, D-EXPIRY):
 *    an expired Draft or Sent back request holds no seat (`pendingRequestId`).
 *  - A cycle's ranked asks (`rankedAsks`) are its pending asks but the Sent back ones: a Sent back ask
 *    is with its requester, so it is left out of the ranking and the lock (D-CYCLE).
 *  - The business date of a write (`businessAt`, R47) is the as-of date with the wall clock's time
 *    of day; `at` stays the wall clock, for the audit entry's own time.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the bodies.
 */
import { writeBlock } from '@/access/context'
import { contextLists } from '@/access/lists'
import { isLeaderSeat, leaderLevelSet } from '@/access/scopes/pickers'
import { commentVisible, hasAmount, requestView, viewerOf } from '@/access/visibility'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf, fyRange } from '@/data/fiscal'
import {
  type FiscalYear,
  type ISODateTime,
  type Month,
  type PositionRow,
  siteByLocation,
} from '@/data/schema'
import { requestsOf, seatStateOf } from '@/drill/seats'
import { businessAtOf } from '@/lib/dates'
import { nextRequestIds } from '@/plan/actions/requestIds'
import type {
  ActionContext,
  ActionEnv,
  ActionIds,
  ActionSeat,
  ActionSettings,
  PersonRules,
} from '@/plan/actions/types'
import type { ActualsInput } from '@/plan/engine/close'
import { type RankedAsk, rankAsks } from '@/plan/engine/cycle'
import { fxRatesFromAssumptions } from '@/plan/engine/fx'
import { toAssignments } from '@/plan/engine/heads'
import { reconcile } from '@/plan/engine/reconcile'
import { type ExpiryInput, isPendingNow, type TransitionContext } from '@/plan/engine/requests'
import { bandEffect, headEffect, targetDateOf } from '@/plan/engine/targets'
import { workingOf } from '@/plan/engine/versions'
import type { Actor, Assignment, HcRequest, OrgMatch, SeatOrgFields, WorkingPlan } from '@/plan/types'
import { assumptionEditCheck } from '@/views/finance/engine/edits'
import { PARAM as REQUESTS_PARAM } from '@/views/requests/metrics'
import {
  asksContextOf,
  latestRows,
  ratesFor,
  versionAssumptions,
  workingFrame,
} from '@/views/targets/engine/working'
import { subOrgSeatsOf } from '@/views/targets/engine/writes'
import { lockContentOf } from './lock'
import { tradeQuoteOf } from './quote'
import { chainContextOf } from './routing'

export interface ActionContextOptions {
  /** `PlanStore.readOnly` (or the data store's `readOnly`): a reader tab refuses every action. */
  readOnly: boolean
  /** When the change is made; the write path's clock (`new Date().toISOString()`), tests pin it. */
  at: ISODateTime
}

/** The Acting as person who signs the audit, in the context's mode (empty with no pick: writes are blocked). */
export function actorOfContext(ctx: AnalyticsContext): Actor {
  const a = ctx.access.actingAs
  return { personId: a?.personId ?? '', name: a?.name ?? '', mode: ctx.access.mode }
}

/** The action context for the analytics context's mode, Acting as person and data. */
export function actionContextOf(ctx: AnalyticsContext, opts: ActionContextOptions): ActionContext {
  return {
    mode: ctx.mode,
    actor: actorOfContext(ctx),
    at: opts.at,
    asOf: ctx.asOf,
    businessAt: businessAtOf(ctx.asOf, opts.at),
    datasets: ctx.all,
    settings: actionSettingsOf(ctx),
    readOnly: opts.readOnly,
    writeBlock: writeBlock(ctx.access),
    decide: (surface) => ctx.access.decide(surface),
    rules: personRulesOf(ctx),
    env: actionEnvOf(ctx),
  }
}

/* ───────────── the person-level rules ───────────── */

const rulesMemo = new WeakMap<AnalyticsContext, PersonRules>()

/** The seats a request names or sits under (an org's test). */
const allSeats = (req: HcRequest): string[] =>
  [
    req.positionId,
    ...(req.trade?.givePositionIds ?? []),
    req.transfer?.fromPositionId,
    req.managerPositionId,
    req.trade?.giveOrgPositionId,
    req.transfer?.toPositionId,
    req.transfer?.toManagerPositionId,
  ].filter((x): x is string => !!x)

/** The person-level rules (8.4) for the context's Acting as person, mode and scope. */
export function personRulesOf(ctx: AnalyticsContext): PersonRules {
  const hit = rulesMemo.get(ctx)
  if (hit) return hit
  const viewer = viewerOf(ctx)
  const scope = ctx.access.scope
  const unset = ctx.access.unset
  const latest = latestRows(ctx.all.positions)
  const levels = leaderLevelSet(contextLists(ctx))
  const leaderSeats = new Set(
    [...viewer.seatIds].filter((id) => {
      const r = ctx.positionIndex.byId.get(id) ?? latest.get(id)
      return !!r && isLeaderSeat(r, levels)
    }),
  )
  const seatInScope = (id: string): boolean => {
    if (unset) return false
    if (!scope) return true
    if (scope.kind === 'tree') return scope.positionIds.has(id)
    return scope.positionIds.has(id) || latest.get(id)?.businessUnit === scope.unit
  }
  const placeInScope = (managerId: string): boolean => {
    if (unset) return false
    if (!scope) return true
    if (scope.kind === 'tree') return scope.positionIds.has(managerId) || scope.rootPositionIds.has(managerId)
    return scope.positionIds.has(managerId) || latest.get(managerId)?.businessUnit === scope.unit
  }
  const unitInScope = (unit: string): boolean => {
    if (unset) return false
    if (ctx.access.mode === 'hrbp')
      return viewer.hrbpUnits.has(unit) || (scope?.kind === 'unit' && scope.unit === unit)
    if (!scope) return true
    if (scope.kind === 'unit') return scope.unit === unit
    for (const id of scope.positionIds) if (latest.get(id)?.businessUnit === unit) return true
    return false
  }
  const mayMerge = (req: HcRequest): boolean => {
    if (ctx.access.mode !== 'leader' || !scope || scope.kind !== 'tree') return true
    const me = viewer.personId
    if (me && req.steps.some((s) => s.approverId === me)) return true
    // The tree is strictly below the leader's own seats (8.2): a request about an own seat never merges.
    return allSeats(req).some((id) => scope.positionIds.has(id) && !scope.rootPositionIds.has(id))
  }
  const out: PersonRules = {
    requestView: (r) => requestView(r, viewer),
    commentVisible: (c, r) => commentVisible(c, r, viewer),
    hasAmount,
    seatInScope,
    placeInScope,
    unitInScope,
    hrbpUnits: viewer.hrbpUnits,
    ownSeats: viewer.seatIds,
    leaderSeats,
    mayMerge,
  }
  rulesMemo.set(ctx, out)
  return out
}

/* ───────────── settings ───────────── */

/** The settings the actions read, from `ctx.metrics` and `ctx.guard.rules`. */
export function actionSettingsOf(ctx: AnalyticsContext): ActionSettings {
  return {
    idleDays: ctx.metrics.num(REQUESTS_PARAM.idleDays.metricId, REQUESTS_PARAM.idleDays.key),
    minCosted: ctx.guard.rules.minCosted,
    minContributors: ctx.guard.rules.minContributors,
    leaderThresholdUsd: ctx.metrics.num(
      REQUESTS_PARAM.leaderThresholdUsd.metricId,
      REQUESTS_PARAM.leaderThresholdUsd.key,
    ),
  }
}

/* ───────────── the engines' inputs ───────────── */

const envMemo = new WeakMap<AnalyticsContext, ActionEnv>()
const assignmentsMemo = new WeakMap<object, Assignment[]>()

const assignmentsOf = (ctx: AnalyticsContext): Assignment[] => {
  let hit = assignmentsMemo.get(ctx.all.workers)
  if (!hit) {
    hit = toAssignments(ctx.all.workers)
    assignmentsMemo.set(ctx.all.workers, hit)
  }
  return hit
}

/** What the engine's expiry helper reads from the context (D-EXPIRY). */
const expiryOf = (ctx: AnalyticsContext, idleDays: number): ExpiryInput => ({
  asOf: ctx.asOf,
  idleDays,
  cycles: ctx.plan?.cycles ?? [],
})

/** The highest number after a prefix among IDs ('R-1127' gives 1127). */
function maxNumber(ids: Iterable<string>, prefix: RegExp): number {
  let max = 0
  for (const id of ids) {
    const m = prefix.exec(id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

/** New IDs for one context (see the module comment and src/plan/actions/types.ts `ActionIds`). */
function idsOf(ctx: AnalyticsContext): ActionIds {
  const requests = requestsOf(ctx)
  const ids = requests.map((r) => r.requestId)
  const tag = ctx.plan?.idTag
  // A plan with no tag (no store behind the context: tests, or storage that did not answer, where no
  // write can go through) numbers after the highest number in force, as before D-ID. The store gives
  // a tag its secret; a context with a tag and no secret (none stored yet) keys on the tag.
  const lastRequest = tag ? 0 : maxNumber(ids, /^R-(\d+)$/)
  const request = tag
    ? nextRequestIds(tag, ctx.plan?.idSecret ?? tag, ctx.access.actingAs?.personId ?? '', ids)
    : (n = 1) => `R-${lastRequest + n}`
  // Freezes number under the tag too (M3 recheck): two browsers never mint the same freeze ID, so a
  // Merge never takes one workspace's freeze for another's. With no tag, 'FRZ-<n>' as before.
  const freezes = ctx.all.freezes.map((f) => f.freezeId)
  const lastFreeze = tag
    ? maxNumber(freezes, new RegExp(`^FRZ-${tag}-(\\d+)$`))
    : maxNumber(freezes, /^FRZ-(\d+)$/)
  const freezePrefix = tag ? `FRZ-${tag}-` : 'FRZ-'
  const free = (base: string, taken: ReadonlySet<string>): string => {
    let id = base
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
    return id
  }
  return {
    request: (n = 1) => request(n),
    comment: (requestId, n) => `${requestId}-c${n}`,
    freeze: () => `${freezePrefix}${String(lastFreeze + 1).padStart(3, '0')}`,
    cycle: (fy) => free(`cycle-${fy.toLowerCase()}`, new Set(ctx.plan?.cycles.map((c) => c.cycleId) ?? [])),
    version: (fy) => free(`${fy.toLowerCase()}-working`, new Set(ctx.versions.map((v) => v.versionId))),
  }
}

/** Where a new seat under a manager position at a location sits (see the module comment). */
function placeOfManager(ctx: AnalyticsContext, managerId: string, location: string): SeatOrgFields | null {
  const latest = latestRows(ctx.all.positions)
  const m = latest.get(managerId)
  if (!m) return null
  const department = m.department ?? null
  const counts = new Map<string, number>()
  for (const r of latest.values())
    if (r.businessUnit === m.businessUnit && (r.department ?? null) === department && r.location === location)
      counts.set(r.costCenter, (counts.get(r.costCenter) ?? 0) + 1)
  let costCenter = m.costCenter
  let best = 0
  for (const [cc, n] of [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
    if (n > best) {
      best = n
      costCenter = cc
    }
  return {
    businessUnit: m.businessUnit,
    department,
    costCenter,
    legalEntity: siteByLocation.get(location)?.legalEntity ?? m.legalEntity ?? '',
  }
}

/** The engines' inputs for the context (memoized per context). */
export function actionEnvOf(ctx: AnalyticsContext): ActionEnv {
  const hit = envMemo.get(ctx)
  if (hit) return hit
  const requests = requestsOf(ctx)
  const rules = personRulesOf(ctx)
  const actor = actorOfContext(ctx)
  const asOfYear = fiscalYearOf(ctx.asOf)
  const settings = actionSettingsOf(ctx)
  const ids = idsOf(ctx)

  const expiry = expiryOf(ctx, settings.idleDays)
  const pendingOn = new Map<string, string>()
  for (const r of requests) {
    if (!isPendingNow(r, expiry)) continue
    for (const id of [r.positionId, ...(r.trade?.givePositionIds ?? []), r.transfer?.fromPositionId])
      if (id && !pendingOn.has(id)) pendingOn.set(id, r.requestId)
  }

  const seats = new Map<string, ActionSeat | null>()
  const seat = (positionId: string): ActionSeat | null => {
    if (seats.has(positionId)) return seats.get(positionId) ?? null
    let st = seatStateOf(ctx, positionId)
    if (!st) {
      // A seat whose first row starts after the as-of date: read it on its first day.
      const first = ctx.all.positions
        .filter((r) => r.positionId === positionId)
        .reduce<string | null>((d, r) => (!d || r.effectiveDate < d ? r.effectiveDate : d), null)
      st = first ? seatStateOf(ctx, positionId, first) : null
    }
    const out: ActionSeat | null = st
      ? {
          positionId,
          status: st.status,
          acceptedOffer: st.acceptedOffer != null,
          businessUnit: st.position.businessUnit,
          department: st.position.department,
          costCenter: st.position.costCenter,
          managerPositionId: st.position.managerPositionId,
          level: st.position.level,
          location: st.position.location,
          fte: st.position.fte,
          workerType: st.position.workerType,
          startDate: st.plannedStart ?? st.position.startDate,
          pendingRequestId: pendingOn.get(positionId) ?? null,
        }
      : null
    seats.set(positionId, out)
    return out
  }

  const workings = new Map<FiscalYear, WorkingPlan>()
  const used = new Set(ctx.all.positions.map((r) => r.positionId))
  const working = (fy: FiscalYear = asOfYear): WorkingPlan => {
    let w = workings.get(fy)
    if (!w) {
      const positions: readonly PositionRow[] = ctx.all.positions
      w = {
        versionId: workingOf(ctx.versions, fy)?.versionId ?? '',
        positions,
        assignments: assignmentsOf(ctx),
        newPositionId: (requestId, n) => {
          const base = `P-${requestId.replace(/^R-?/, '')}-${n}`
          if (
            !used.has(base) ||
            positions.some((r) => r.positionId === base && r.sourceRequestId === requestId)
          )
            return base
          for (const x of 'bcdefghij') if (!used.has(`${base}${x}`)) return `${base}${x}`
          return `${base}-${requestId}`
        },
        placeOf: (managerId, location) => placeOfManager(ctx, managerId, location),
        actor,
      }
      workings.set(fy, w)
    }
    return w
  }

  const cycleOpen = (req: HcRequest): boolean => {
    const c = req.cycleId ? ctx.plan?.cycles.find((x) => x.cycleId === req.cycleId) : null
    return !!c && c.stage !== 'Locked'
  }

  const transitionContext = (req: HcRequest): TransitionContext => {
    const named =
      req.type !== 'New role' && req.type !== 'Trade' && req.positionId ? seat(req.positionId) : null
    const fy = fiscalYearOf(req.transfer?.effectiveDate || req.startDate || ctx.asOf)
    let chain: TransitionContext['chain'] | null = null
    return {
      // Routing is computed only when a transition reads it (submit), never for a comment or a decision.
      get chain() {
        chain ??= chainContextOf(ctx, req)
        return chain
      },
      asOf: ctx.asOf,
      seat: named ? { status: named.status, acceptedOffer: named.acceptedOffer } : null,
      cycleOpen: cycleOpen(req),
      idleDays: settings.idleDays,
      working: working(fy),
      hasAmount,
      newCommentId: ids.comment,
    }
  }

  const asks = () => asksContextOf(ctx, workingFrame(ctx, asOfYear))

  const closeInput = (month: Month): ActualsInput => {
    const fy = fiscalYearOf(`${month}-01`)
    const w = workingOf(ctx.versions, fy) ?? workingOf(ctx.versions, asOfYear)
    if (!w) throw new Error(`There is no Working version for ${fy} to close ${month} with.`)
    const rows = versionAssumptions(ctx.all, w)
    return {
      month,
      positions: ctx.all.positions,
      workers: ctx.all.workers,
      comp: ctx.all.comp,
      reqs: ctx.all.reqs,
      assumptions: rows,
      versionId: w.versionId,
      versionName: w.name,
      rates: fxRatesFromAssumptions(rows),
    }
  }

  const rankedAsks = (cycleId: string): ReadonlyMap<string, readonly RankedAsk[]> => {
    const cycle = ctx.plan?.cycles.find((c) => c.cycleId === cycleId)
    const out = new Map<string, RankedAsk[]>()
    if (!cycle) return out
    const fy = cycle.fiscalYear
    const actx = asksContextOf(ctx, workingFrame(ctx, fy))
    const units = new Map<string, HcRequest[]>()
    for (const r of requests) {
      if (r.cycleId !== cycleId || r.state === 'Sent back' || !isPendingNow(r, expiry)) continue
      const list = units.get(r.businessUnit) ?? []
      list.push(r)
      units.set(r.businessUnit, list)
    }
    for (const [unit, list] of [...units].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const org: OrgMatch = (place) => place.businessUnit === unit
      const t = ctx.all.targets.find(
        (x) =>
          x.fiscalYear === fy &&
          x.businessUnit === unit &&
          !x.department &&
          !x.costCenter &&
          !x.leaderPositionId,
      )
      const date = t ? targetDateOf(t) : fyRange(fy).end
      const order = cycle.order?.find((o) => o.businessUnit === unit)?.requestIds
      out.set(
        unit,
        rankAsks(
          list,
          cycleId,
          (r) => headEffect(r, org, date, actx),
          (r) => bandEffect(r, org, fy, actx),
          order,
        ),
      )
    }
    return out
  }

  const seatBandUsd = (positionId: string, fy: FiscalYear): number | null => {
    const w = workingOf(ctx.versions, fy)
    const row = latestRows(ctx.all.positions).get(positionId)
    if (!w || !row) return null
    return ratesFor(ctx.all, w).bandUsd(
      { level: row.level, location: row.location, fte: row.fte ?? 1 },
      positionId,
    )
  }

  // The direct sub-orgs of a leader seat inside its own business unit (review UI-8): the very function
  // the Targets split form lists them with, so the action takes exactly what the form offers.
  const subOrgsOf = (leaderId: string): readonly string[] =>
    subOrgSeatsOf(latestRows(ctx.all.positions), leaderLevelSet(contextLists(ctx)), leaderId)

  const env: ActionEnv = {
    requests,
    seat,
    working,
    transitionContext,
    // A new quote reads the viewer's scope (the trade form); a re-quote of a request already in the
    // plan (at submit or at an approval step) re-prices it and never re-checks the requester's scope.
    quote: (ask, exceptRequestId) =>
      tradeQuoteOf(ctx, ask, exceptRequestId ? { exceptRequestId } : { inScope: rules.seatInScope }),
    get asks() {
      return asks()
    },
    assumptionEditRefusal: (edits, versionId) => assumptionEditCheck(ctx, edits, versionId),
    computeLock: (w, at) => lockContentOf(ctx, w, at),
    closeInput,
    rankedAsks,
    seatBandUsd,
    targets: (fy) => ctx.all.targets.filter((t) => t.fiscalYear === fy),
    subOrgsOf,
    exceptions: () => reconcile(ctx.all, ctx.asOf),
    ids,
  }
  envMemo.set(ctx, env)
  return env
}
