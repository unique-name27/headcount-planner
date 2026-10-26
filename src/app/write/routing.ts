/**
 * Routing for the write path and the screens that preview it (docs/PLAN.md 7.2 rule 8, 8.4 rule 8,
 * 10.2, 11.4, C19; M3 freeze): the chain context `chainFor` reads for a request, and the guarded asks
 * the out-of-plan test, the cycle's envelope check, the over-target flags and the gap after approval
 * compare with a target. One computation for every mode (routing is mode-independent): the org's
 * guarded asks cost is the cost guard's rounded figure (`sumRounded` over the org's cost atoms, each
 * atom's filled and band parts rounded apart, atoms under the minimum left out; the reading of
 * src/data/sample/routing.ts `guardedAsksCost`, generalized to any loaded data), never an exact HRIS
 * sum; when the org is not a whole union of atoms, or its rounded cost reads "—", only heads compare
 * (`cost: null`). It leaves out the request being routed and every request 8.4 rule 3 hides from that
 * request's requester (one touching the requester's own seat or a seat above it).
 *
 * Read by: src/app/write/context.ts (`env.transitionContext`), Requests > New's chain preview and
 * Approvals' gap after approval (src/views/requests/engine/), Requests > Cycle's envelope check. Pure.
 *
 * Readings taken here (core, M3):
 *  - The org a request is tested against is the nearest at or above each place it touches with a
 *    target for its fiscal year (targets.ts `targetFor`): the request's own place; for a trade the
 *    giving org and the receiving org; for a transfer the from seat and the receiving side. Places
 *    under one target make one check, with the request's head and band effect on that org.
 *  - Each unit's HRBP is the Units list's HRBP column; each unit's leader is the person the Units
 *    list's Owner names (an employee ID, else a name holding a seat on the as-of date); the Finance
 *    approver is the first person of the Roles list's Finance role. Leader seats follow the Levels
 *    list (src/data/lists/roles.ts `leaderLevels`) unless a seat's own `leaderLevel` says otherwise.
 *  - A move past a sub-org's cost envelope (Finance's 'envelope-exception' step) is a Transfer that
 *    does not move its budget into a receiving org whose target is a sub-org's (leader-keyed) and
 *    that the move pushes past its target in heads or in the guarded asks cost.
 *  - A like-for-like Backfill keeps the seat's level, location and FTE, on a seat the plan of record
 *    has a line for.
 *  - A request is out of plan for a locked cycle when it is raised outside an open cycle while its
 *    fiscal year's cycle record is Locked.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the bodies.
 */
import { contextLists } from '@/access/lists'
import { holdingsOn, upward } from '@/access/scopes/people'
import { isUnionOfAtoms } from '@/cost/atoms'
import type { AnalyticsContext } from '@/data/context'
import { leaderLevels, rolePeople, unitHrbps } from '@/data/lists/roles'
import type { EffectiveLists } from '@/data/lists/types'
import { chainOrgOf, guardedAsksCost } from '@/data/sample/routing'
import {
  type FiscalYear,
  type ISODate,
  isLeaderLevel,
  type Level,
  PENDING_REQUEST_STATES,
  type TargetRow,
} from '@/data/schema'
import { requestsOf } from '@/drill/seats'
import type { ChainContext, ChainOrg, ChainSeat, PlanCheck } from '@/plan/engine/chain'
import { asks, bandEffect, headEffect, targetDateOf, targetFor } from '@/plan/engine/targets'
import { targetKey } from '@/plan/engine/transfer'
import { planOfRecord } from '@/plan/engine/versions'
import type { HcRequest, OrgMatch, SeatPlace } from '@/plan/types'
import { bandEstimateOf, fiscalYearOfRequest } from '@/views/requests/engine/planYear'
import { PARAM as REQUESTS_PARAM } from '@/views/requests/metrics'
import {
  asksContextOf,
  latestRows,
  managerOfLatest,
  type OrgDef,
  orgOfTarget,
  workingFrame,
  workingLines,
} from '@/views/targets/engine/working'
import { effectiveRequests } from './expiry'
import { tradeQuoteOf } from './quote'

/** An org's guarded asks at a target date (7.2 rule 8). */
export interface GuardedAsks {
  /** Asks in heads at the target date (6.9 `asks`, pending requests by their head effect). */
  heads: number
  /** The guarded asks cost, USD (rounded per atom); null when only heads compare. */
  cost: number | null
}

export interface GuardedAsksInput {
  org: OrgMatch
  fiscalYear: FiscalYear
  targetDate: ISODate
  /** Requests left out of the pending ones counted (the request routed, and what rule 3 hides from its requester). */
  without: ReadonlySet<string>
}

/* ───────────── the org as routing reads it ───────────── */

const NO_LISTS = {}
const orgMemo = new WeakMap<object, WeakMap<object, Map<string, ChainOrg>>>()

/** The person a Units list Owner names: an employee ID, else the name of someone holding a seat on the date. */
function ownerOf(ctx: AnalyticsContext, owner: unknown): string | null {
  if (typeof owner !== 'string' || !owner.trim()) return null
  const o = owner.trim()
  const held = holdingsOn(ctx.all.workers, ctx.asOf)
  if (held.seatsOf.has(o)) return o
  for (const [id, name] of held.nameOf) if (name === o && held.seatsOf.has(id)) return id
  return null
}

/** The leader threshold in force (`requests.chain.leaderThreshold`). */
export function leaderThresholdOf(ctx: Pick<AnalyticsContext, 'metrics'>): number {
  return ctx.metrics.num(REQUESTS_PARAM.leaderThresholdUsd.metricId, REQUESTS_PARAM.leaderThresholdUsd.key)
}

/** The org `chainFor` reads on the as-of date (memoized per data, lists and date). */
export function chainOrgOfContext(ctx: AnalyticsContext): ChainOrg {
  const lists: EffectiveLists | null = contextLists(ctx)
  let byLists = orgMemo.get(ctx.all)
  if (!byLists) {
    byLists = new WeakMap()
    orgMemo.set(ctx.all, byLists)
  }
  let byKey = byLists.get(lists ?? NO_LISTS)
  if (!byKey) {
    byKey = new Map()
    byLists.set(lists ?? NO_LISTS, byKey)
  }
  const threshold = leaderThresholdOf(ctx)
  const key = `${ctx.asOf}|${threshold}`
  const hit = byKey.get(key)
  if (hit) return hit
  const units = new Map<string, { hrbpId: string | null; leaderId: string | null }>()
  const hrbps = lists ? unitHrbps(lists) : new Map<string, string>()
  for (const v of lists?.businessUnit.values ?? [])
    if (!v.retired)
      units.set(v.value, { hrbpId: hrbps.get(v.value) ?? null, leaderId: ownerOf(ctx, v.attrs?.owner) })
  const finance = lists ? (rolePeople(lists, 'Finance')[0] ?? null) : null
  const base = chainOrgOf(ctx.all, ctx.asOf, units, finance)
  const levels: ReadonlySet<Level> = lists ? leaderLevels(lists) : new Set()
  const latest = latestRows(ctx.all.positions)
  const seats = new Map<string, ChainSeat>()
  for (const [id, s] of base.seats) {
    const own = latest.get(id)?.leaderLevel
    const leaderSeat =
      own === true || (own !== false && (lists ? levels.has(s.level) : isLeaderLevel(s.level)))
    seats.set(id, leaderSeat === s.leaderSeat ? s : { ...s, leaderSeat })
  }
  const out: ChainOrg = { ...base, seats, leaderThresholdUsd: threshold }
  byKey.set(key, out)
  return out
}

/* ───────────── rule 3 from the requester's side ───────────── */

const hiddenMemo = new WeakMap<AnalyticsContext, Map<string, ReadonlySet<string>>>()

/** The seats a request names (its seat, a trade's give seats, a transfer's from seat). */
const touched = (r: HcRequest): string[] =>
  [r.positionId, ...(r.trade?.givePositionIds ?? []), r.transfer?.fromPositionId].filter(
    (x): x is string => !!x,
  )

/** The requests 8.4 rule 3 hides from a request's requester (its own seat, or a seat above it). */
export function hiddenFromRequester(ctx: AnalyticsContext, req: HcRequest): ReadonlySet<string> {
  let byPerson = hiddenMemo.get(ctx)
  if (!byPerson) {
    byPerson = new Map()
    hiddenMemo.set(ctx, byPerson)
  }
  const hit = byPerson.get(req.requesterId)
  if (hit) return hit
  const seats = holdingsOn(ctx.all.workers, ctx.asOf).seatsOf.get(req.requesterId) ?? []
  const atOrAbove = new Set<string>()
  for (const s of seats) for (const up of upward(s, ctx.positionIndex)) atOrAbove.add(up)
  const out = new Set<string>()
  if (atOrAbove.size)
    for (const r of requestsOf(ctx)) if (touched(r).some((id) => atOrAbove.has(id))) out.add(r.requestId)
  byPerson.set(req.requesterId, out)
  return out
}

/* ───────────── guarded asks ───────────── */

const pending = (r: HcRequest): boolean => PENDING_REQUEST_STATES.includes(r.state)

/** The positions an org holds, by each position's latest row on a date (an OrgMatch's members). */
function membersOf(ctx: AnalyticsContext, org: OrgMatch, on: ISODate): Set<string> {
  const out = new Set<string>()
  for (const [id, r] of latestRows(ctx.all.positions))
    if (
      org(
        {
          positionId: id,
          managerPositionId: r.managerPositionId ?? null,
          businessUnit: r.businessUnit,
          department: r.department ?? null,
          costCenter: r.costCenter,
        },
        on,
      )
    )
      out.add(id)
  return out
}

/** Guarded asks over an org's members (see the module comment). */
function asksOver(
  ctx: AnalyticsContext,
  org: OrgMatch,
  members: ReadonlySet<string>,
  fy: FiscalYear,
  targetDate: ISODate,
  without: ReadonlySet<string>,
): GuardedAsks {
  const frame = workingFrame(ctx, fy)
  const actx = asksContextOf(ctx, frame)
  // D-EXPIRY: an expired Draft or Sent back request is not pending, so it is no ask.
  const counted = effectiveRequests(ctx).filter((r) => pending(r) && !without.has(r.requestId))
  const heads = asks(org, targetDate, counted, actx).heads
  if (!frame.version) return { heads, cost: null }
  const latest = latestRows(ctx.all.positions)
  const live = new Set([...members].filter((id) => latest.get(id)?.status !== 'Eliminated'))
  const managerOf = managerOfLatest(ctx.all.positions)
  if (!isUnionOfAtoms(live, ctx.guard.atoms, managerOf)) return { heads, cost: null }
  const lines = workingLines(ctx, frame).filter((l) => members.has(l.positionId))
  const min = ctx.guard.rules.minCosted
  const g = guardedAsksCost({
    lines,
    requests: counted,
    fiscalYear: fy,
    org,
    ctx: actx,
    index: ctx.guard.atoms,
    managerOf,
    minCosted: min,
  })
  // A rounded cost with no atom of the minimum reads "—": only heads compare.
  return { heads, cost: g.atoms.some((a) => a.costedPeople >= min) ? g.cost : null }
}

/** An org's guarded asks (heads, and cost under 7.2 rule 8, or null). */
export function guardedAsksOf(ctx: AnalyticsContext, input: GuardedAsksInput): GuardedAsks {
  return asksOver(
    ctx,
    input.org,
    membersOf(ctx, input.org, input.targetDate),
    input.fiscalYear,
    input.targetDate,
    input.without,
  )
}

/** A target org's guarded asks (its OrgDef holds its members already). */
export function targetAsksOf(
  ctx: AnalyticsContext,
  org: OrgDef,
  fy: FiscalYear,
  targetDate: ISODate,
  without: ReadonlySet<string>,
): GuardedAsks {
  return asksOver(ctx, org.match, org.positionIds, fy, targetDate, without)
}

/* ───────────── the chain context ───────────── */

/** The places a request touches, for its out-of-plan checks (see the module comment). */
function placesOf(ctx: AnalyticsContext, req: HcRequest): SeatPlace[] {
  const latest = latestRows(ctx.all.positions)
  const seatPlace = (id: string | null | undefined): SeatPlace | null => {
    const r = id ? latest.get(id) : undefined
    return r && id
      ? {
          positionId: id,
          managerPositionId: r.managerPositionId ?? null,
          businessUnit: r.businessUnit,
          department: r.department ?? null,
          costCenter: r.costCenter,
        }
      : null
  }
  const under = (manager: string | null | undefined): SeatPlace | null => {
    const m = manager ? latest.get(manager) : undefined
    return m && manager
      ? {
          positionId: null,
          managerPositionId: manager,
          businessUnit: m.businessUnit,
          department: m.department ?? null,
          costCenter: m.costCenter,
        }
      : null
  }
  const own: SeatPlace = {
    positionId: req.type === 'New role' || req.type === 'Trade' ? null : req.positionId,
    managerPositionId: req.managerPositionId || null,
    businessUnit: req.businessUnit,
    department: req.department,
    costCenter: req.costCenter,
  }
  if (req.type === 'Trade' && req.trade) {
    const t = req.trade
    const giving = under(t.giveOrgPositionId) ?? seatPlace(t.givePositionIds[0])
    return [giving, own].filter((p): p is SeatPlace => !!p)
  }
  if (req.type === 'Transfer' && req.transfer) {
    const t = req.transfer
    const from = seatPlace(t.fromPositionId)
    const to = t.kind === 'position' ? under(t.toManagerPositionId) : seatPlace(t.toPositionId)
    return [from, to].filter((p): p is SeatPlace => !!p)
  }
  return [own]
}

/** The checks of a request against the targets of the orgs it touches (7.2 rule 8, 10.2). */
function checksOf(
  ctx: AnalyticsContext,
  req: HcRequest,
  fy: FiscalYear,
  without: ReadonlySet<string>,
): { checks: PlanCheck[]; envelope: boolean } {
  const targets = ctx.all.targets
  const latest = latestRows(ctx.all.positions)
  const up = (id: string): string[] => {
    const out: string[] = []
    const seen = new Set<string>([id])
    let cur = latest.get(id)?.managerPositionId ?? null
    while (cur && !seen.has(cur)) {
      out.push(cur)
      seen.add(cur)
      cur = latest.get(cur)?.managerPositionId ?? null
    }
    return out
  }
  const frame = workingFrame(ctx, fy)
  const actx = asksContextOf(ctx, frame)
  const byKey = new Map<string, TargetRow | null>()
  const places = placesOf(ctx, req)
  for (const p of places) {
    const t = targetFor(p, targets, fy, up)
    byKey.set(t ? targetKey(t) : `none|${p.businessUnit}`, t)
  }
  const checks: PlanCheck[] = []
  let envelope = false
  const receiving = places.at(-1)
  const receivingKey = receiving ? targetFor(receiving, targets, fy, up) : null
  for (const t of byKey.values()) {
    if (!t) {
      checks.push({ org: null, target: null, asks: { heads: 0, cost: null }, effect: { heads: 0, cost: 0 } })
      continue
    }
    const org = orgOfTarget(ctx.all.positions, t)
    const date = targetDateOf(t)
    const a = targetAsksOf(ctx, org, fy, date, without)
    const effect = {
      heads: headEffect(req, org.match, date, actx),
      cost: bandEffect(req, org.match, fy, actx),
    }
    checks.push({
      org: org.key,
      target: { heads: t.targetHeads, cost: t.targetCost ?? null },
      asks: { heads: a.heads, cost: a.cost },
      effect,
    })
    if (
      req.type === 'Transfer' &&
      !req.transfer?.moveBudget &&
      t.leaderPositionId &&
      receivingKey &&
      targetKey(receivingKey) === targetKey(t)
    ) {
      const overHeads = a.heads + effect.heads > t.targetHeads
      const overCost = t.targetCost != null && a.cost != null && a.cost + effect.cost > t.targetCost
      envelope ||= overHeads || overCost
    }
  }
  return { checks, envelope }
}

/** The chain context for a request as it stands (org, facts and every check `chainFor` reads). */
export function chainContextOf(ctx: AnalyticsContext, req: HcRequest): ChainContext {
  const org = chainOrgOfContext(ctx)
  const fy = fiscalYearOfRequest(req, ctx.asOf)
  const without = new Set([...hiddenFromRequester(ctx, req), req.requestId])
  const { checks, envelope } = checksOf(ctx, req, fy, without)
  // The leader threshold reads the request's band estimate: a trade's, its quote's get seats.
  let band: number | null = null
  if (req.type === 'Trade' && req.trade && req.level && req.location && req.startDate) {
    const t = req.trade
    const q = tradeQuoteOf(
      ctx,
      {
        give: t.givePositionIds,
        creditUsedBp: t.creditUsedBp,
        giveOrgPositionId: t.giveOrgPositionId,
        get: {
          level: req.level,
          location: req.location,
          fte: req.fte ?? 1,
          orgPositionId: req.managerPositionId,
          businessUnit: req.businessUnit,
          jobFamily: t.jobFamily,
          start: req.startDate,
          count: t.count > 0 ? t.count : 'max',
          partTimeRest: t.partTimeRest,
        },
        ...(req.exception ? { freezeException: { reason: req.exception.reason } } : {}),
      },
      { exceptRequestId: req.requestId },
    )
    band = q.get.length ? q.getBandUsd : bandEstimateOf(req, ctx)
  } else if (req.type !== 'Transfer') band = bandEstimateOf(req, ctx)
  const cycle = req.cycleId ? ctx.plan?.cycles.find((c) => c.cycleId === req.cycleId) : null
  const inOpenCycle = !!cycle && cycle.stage !== 'Locked'
  const cycleLocked =
    !inOpenCycle && !!ctx.plan?.cycles.some((c) => c.fiscalYear === fy && c.stage === 'Locked')
  let likeForLikeBackfill = false
  if (req.type === 'Backfill' && req.positionId) {
    const row = latestRows(ctx.all.positions).get(req.positionId)
    const por = planOfRecord(ctx.versions, fy)
    const inRecord = !!por && por.lines.positionId.dict.includes(req.positionId)
    likeForLikeBackfill =
      !!row &&
      inRecord &&
      (req.level ?? row.level) === row.level &&
      (req.location ?? row.location) === row.location &&
      (req.fte ?? row.fte ?? 1) === (row.fte ?? 1)
  }
  return {
    org,
    facts: { bandEstimateUsd: band, checks, cycleLocked, likeForLikeBackfill, envelopeException: envelope },
  }
}
