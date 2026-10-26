/**
 * Manager C's routing case (docs/PLAN.md 8.4 rule 8, 11.8, 16.1 (a)): a test-local copy of the sample
 * with and without the confidential Elimination of C's seat, two tradable On hold seats added (one in
 * C's team, one under the manager below C), and C's unit's FY27 target set to its asks without the
 * Elimination, so counting the Elimination would flip a request's out-of-plan bit. Drafts (a New role
 * and a Trade for C and for the manager below C) are routed with `chainFor` and submitted with the
 * requests engine's `transition`, as the write path does (src/app/write/routing.ts, whose
 * `hiddenFromRequester` reads the same rule; src/plan/actions/managerC.scenario.test.ts walks it
 * through the actions); routing leaves out every request 8.4
 * rule 3 hides from the requester (one that touches the requester's seat or a seat above it). Trades
 * are quoted with the trade engine at the plan of record's locked rates.
 *
 * Test code only.
 */
import { hasAmount } from '@/access/visibility'
import { FY27_WORKING, type Persona, type Sample } from '@/data/sample'
import { assumptionsOf } from '@/data/sample/base'
import { AS_OF } from '@/data/sample/calendar'
import { inTreeOf, latestRows } from '@/data/sample/orgs'
import { chainOrgOf, ratesOf, unitOrg, unitPeople, workingAsksContext } from '@/data/sample/routing'
import { tradeSeatsOn } from '@/data/sample/trades'
import { versionFrame } from '@/data/sample/versions'
import { PENDING_REQUEST_STATES, type PositionRow } from '@/data/schema'
import { type TradeRates, weightBp } from '@/plan/engine/band'
import { type ChainContext, chainFor, type PlanCheck } from '@/plan/engine/chain'
import { freezeOn } from '@/plan/engine/freeze'
import { fxRatesFromAssumptions } from '@/plan/engine/fx'
import { fromRow, type TransitionContext, transition } from '@/plan/engine/requests'
import { asks, bandEffect, headEffect } from '@/plan/engine/targets'
import { creditBalance, type TradeAsk, type TradeQuote, tradeQuote } from '@/plan/engine/trade'
import type { HcRequest, Step, WorkingPlan } from '@/plan/types'
import { personaOf, withDatasets } from './sample'

/** The requests of a sample: the imported rows, with plan state's own in place of a row with the same ID. */
export function allRequests(x: Sample): HcRequest[] {
  const own = new Set(x.plan.requests.map((r) => r.requestId))
  return [...x.datasets.requests.map(fromRow).filter((r) => !own.has(r.requestId)), ...x.plan.requests]
}

const pendingOf = (all: readonly HcRequest[]) => all.filter((r) => PENDING_REQUEST_STATES.includes(r.state))

/** Working's rates and asks context on a copy (band estimates at plan rates). */
export function asksEnv(x: Sample) {
  const rows = assumptionsOf(x.datasets, FY27_WORKING)
  const rates = ratesOf(
    rows,
    fxRatesFromAssumptions(rows),
    versionFrame(FY27_WORKING),
    null,
    x.datasets.positions,
  )
  const all = allRequests(x)
  return { rates, all, asksCtx: workingAsksContext(x.datasets, rates, '2026-10', all) }
}

/** The seats at or above a seat (8.4 rule 3 from the requester's side). */
export function atOrAbove(x: Sample, seatId: string): Set<string> {
  const latest = latestRows(x.datasets.positions)
  const out = new Set<string>()
  let id: string | null | undefined = seatId
  while (id && !out.has(id)) {
    out.add(id)
    id = latest.get(id)?.managerPositionId
  }
  return out
}

/** A request touches a seat set (its seat, a trade's give seats, a transfer's from seat). */
export const touches = (r: HcRequest, seats: ReadonlySet<string>): boolean =>
  [r.positionId, ...(r.trade?.givePositionIds ?? []), r.transfer?.fromPositionId].some(
    (id) => !!id && seats.has(id),
  )

export interface RoutingCase {
  c: Persona
  /** The manager below C (holds a seat in C's team that others report to). */
  below: { personId: string; seat: string }
  unit: string
  targetHeads: number
  targetDate: string
  withIt: Sample
  without: Sample
  /** The On hold seats added: C's, and the one under the manager below C. */
  giveSeats: readonly [string, string]
  at: string
}

/** An On hold seat added after generation, under a manager seat, like one of its reports. */
function onHoldSeat(like: PositionRow, positionId: string, manager: string): PositionRow {
  return {
    ...like,
    positionId,
    managerPositionId: manager,
    status: 'On hold',
    level: 'P4',
    title: 'Supply Chain Analyst',
    effectiveDate: '2026-08-03',
    startDate: '2027-01-04',
  }
}

/** The case on a pair of samples (with the Elimination, without it). */
export function routingCase(s: Sample, withIt: Sample, without: Sample): RoutingCase {
  const c = personaOf(s, 'manager-c')
  const d = s.datasets
  const belowSeat = d.positions.find(
    (q) =>
      q.managerPositionId === c.positionId && d.positions.some((r) => r.managerPositionId === q.positionId),
  )?.positionId as string
  const belowId = d.workers.find((w) => w.positionId === belowSeat && !w.assignmentEnd)?.employeeId as string
  const like = d.positions.find((q) => q.managerPositionId === c.positionId) as PositionRow
  const giveSeats = ['P-9901', 'P-9902'] as const
  const seats = (x: Sample) =>
    withDatasets(x, {
      positions: [
        ...x.datasets.positions,
        onHoldSeat(like, giveSeats[0], c.positionId),
        onHoldSeat(like, giveSeats[1], belowSeat),
      ],
    })
  const a = seats(withIt)
  const b = seats(without)
  const unit = c.businessUnit
  const target0 = d.targets.find(
    (t) => t.fiscalYear === 'FY27' && t.businessUnit === unit && !t.department && !t.leaderPositionId,
  )
  const targetDate = target0?.targetDate || '2027-03-31'
  const e0 = asksEnv(b)
  const targetHeads = asks(unitOrg(unit), targetDate, pendingOf(e0.all), e0.asksCtx).heads
  const setTarget = (x: Sample): Sample =>
    withDatasets(x, {
      targets: x.datasets.targets.map((t) => (t === target0 ? { ...t, targetHeads, targetCost: null } : t)),
    })
  return {
    c,
    below: { personId: belowId, seat: belowSeat },
    unit,
    targetHeads,
    targetDate,
    withIt: setTarget(a),
    without: setTarget(b),
    giveSeats,
    at: `${s.asOf}T10:00:00.000Z`,
  }
}

/** A New role under the requester's seat, and a Trade of their On hold seat for one P3 San Jose seat. */
export function drafts(s: Sample, k: RoutingCase, x: Sample): { req: HcRequest; seat: string }[] {
  const e = asksEnv(x)
  const S = s.standardHead.FY27
  const out: { req: HcRequest; seat: string }[] = []
  for (const [n, requester, seat, give] of [
    [1, k.c.employeeId, k.c.positionId, k.giveSeats[0]],
    [2, k.below.personId, k.below.seat, k.giveSeats[1]],
  ] as const) {
    const base: HcRequest = {
      requestId: `R-99${n}0`,
      type: 'New role',
      state: 'Draft',
      reasonCode: 'Growth',
      requesterId: requester,
      submittedById: null,
      submittedAt: null,
      updatedAt: k.at,
      positionId: null,
      managerPositionId: seat,
      businessUnit: k.unit,
      department: k.c.department,
      costCenter: s.datasets.positions.find((q) => q.positionId === seat)?.costCenter ?? null,
      level: 'P3',
      location: 'San Jose',
      jobTitle: 'Supply Chain Planner',
      fte: 1,
      startDate: '2026-12-01',
      priority: null,
      cycleId: null,
      confidential: false,
      exception: null,
      steps: [],
      comments: [],
      changes: null,
      trade: null,
      transfer: null,
      outcome: null,
    }
    out.push({ req: base, seat })
    const giveBp = weightBp(e.rates.bandUsd({ level: 'P4', location: 'San Jose', fte: 1 }, give) as number, S)
    const getBp = weightBp(e.rates.bandUsd({ level: 'P3', location: 'San Jose', fte: 1 }, seat) as number, S)
    out.push({
      seat,
      req: {
        ...base,
        requestId: `R-99${n}1`,
        type: 'Trade',
        reasonCode: 'Level mix',
        startDate: '2027-01-04',
        trade: {
          givePositionIds: [give],
          giveOrgPositionId: seat,
          creditUsedBp: 0,
          count: 1,
          jobFamily: 'Supply Chain',
          partTimeRest: false,
          restFte: null,
          rateVersion: FY27_WORKING,
          rateHash: null,
          giveBp,
          getBp,
          creditBp: giveBp - getBp,
        },
      },
    })
  }
  return out
}

/**
 * The steps a draft gets on a copy: `chainFor` with the unit's out-of-plan check (rule 8: requests
 * the requester may not see by rule 3 left out), stored by `transition`'s submit. `countHidden`
 * routes with the hidden requests counted too, the wrong reading a control needs.
 */
export function submitSteps(
  s: Sample,
  k: RoutingCase,
  x: Sample,
  draft: HcRequest,
  seat: string,
  countHidden = false,
): Step[] {
  const e = asksEnv(x)
  const hidden = atOrAbove(x, seat)
  const org = unitOrg(k.unit)
  const counted = pendingOf(e.all).filter(
    (r) => r.requestId !== draft.requestId && (countHidden || !touches(r, hidden)),
  )
  const check: PlanCheck = {
    org: k.unit,
    target: { heads: k.targetHeads, cost: null },
    asks: { heads: asks(org, k.targetDate, counted, e.asksCtx).heads, cost: null },
    effect: {
      heads: headEffect(draft, org, k.targetDate, e.asksCtx),
      cost: bandEffect(draft, org, 'FY27', e.asksCtx),
    },
  }
  const band =
    draft.level && draft.location
      ? e.rates.bandUsd(
          { level: draft.level, location: draft.location, fte: draft.fte ?? 1 },
          draft.managerPositionId,
        )
      : null
  const chain: ChainContext = {
    org: chainOrgOf(x.datasets, s.asOf, unitPeople(s.world, AS_OF), personaOf(s, 'finance-fpa').employeeId),
    facts: {
      bandEstimateUsd: band,
      checks: [check],
      cycleLocked: false,
      likeForLikeBackfill: false,
      envelopeException: false,
    },
  }
  if (countHidden) return chainFor(draft, chain)
  const tctx: TransitionContext = {
    chain,
    asOf: s.asOf,
    seat: null,
    cycleOpen: false,
    idleDays: 60,
    working: {} as WorkingPlan,
    hasAmount,
    newCommentId: (id, n) => `${id}-c${n}`,
  }
  const name = x.datasets.workers.find((w) => w.employeeId === draft.requesterId)?.name ?? ''
  const done = transition(
    draft,
    { kind: 'submit', onBehalfOf: null },
    { personId: draft.requesterId, name, mode: 'manager' },
    k.at,
    tctx,
  )
  if ('refused' in done) throw new Error(`${draft.requestId}: ${done.refused}`)
  return done.request.steps as Step[]
}

/* ───────────── trade quotes ───────────── */

/** The plan of record's locked trade rates (the bands, loads and plan FX trades are priced at, 11.2). */
export const recordRates = (x: Sample): TradeRates =>
  ratesOf(x.locks.q1.assumptions, x.locks.q1.rates, x.locks.q1, x.locks.q1.hash, x.datasets.positions)

/** A quote as Requests > New and the What if trade lever read it (the same engine and seat list). */
export function quote(x: Sample, ask: TradeAsk, requests: readonly HcRequest[] = allRequests(x)): TradeQuote {
  const q1 = x.locks.q1
  const latest = latestRows(x.datasets.positions)
  const inTree = inTreeOf(x.datasets.positions)
  return tradeQuote(ask, tradeSeatsOn(x.datasets, x.asOf, ask.give, requests), recordRates(x), {
    asOf: x.asOf,
    firstOpenMonth: '2026-10',
    proration: q1.proration,
    creditBalanceBp: (org) => creditBalance(requests, org, q1.fiscalYear),
    giveOrgOf: (ids) => (ids.length ? (latest.get(ids[0])?.managerPositionId ?? null) : null),
    freezeOn: (org, on) => {
      const m = latest.get(org)
      if (!m) return null
      const f = freezeOn(
        x.datasets.freezes,
        {
          positionId: null,
          managerPositionId: org,
          businessUnit: m.businessUnit,
          department: m.department ?? null,
          costCenter: m.costCenter,
        },
        on,
        inTree,
      )
      return f ? { freezeId: f.freezeId } : null
    },
  })
}

/** An ask to give seats for as many seats of one type in an org as they buy. */
export function askFor(
  give: readonly string[],
  get: { level: TradeAsk['get']['level']; location: string; org: string; unit: string },
): TradeAsk {
  return {
    give,
    creditUsedBp: 0,
    giveOrgPositionId: null,
    get: {
      level: get.level,
      location: get.location,
      fte: 1,
      orgPositionId: get.org,
      businessUnit: get.unit,
      jobFamily: null,
      start: '2027-01-04',
      count: 'max',
      partTimeRest: false,
    },
  }
}

/** The seats of a tree a manager could give: quoted alone, blocked by nothing. */
export function tradable(x: Sample, seats: readonly string[], get: Parameters<typeof askFor>[1]): string[] {
  return seats.filter((id) => quote(x, askFor([id], get)).blocks.length === 0)
}
