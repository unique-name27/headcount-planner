/**
 * What routing and asks read on the sample (docs/PLAN.md 6.9, 7.2 rule 8, 10.2, 11.4): the org as the
 * chain engine reads it, Working's asks context with band estimates at plan rates, and the guarded
 * asks cost (rounded per cost atom). The generator stores story 9's chain from these, and
 * sample.test.ts recomputes it with them. Pure.
 *
 * The guarded asks cost is the cost guard's own rounded figure (src/cost/guard.ts `guardModel` in
 * 'rounded' mode, the same in every mode, 7.2 rule 8 and C19): the org's Working lines for the fiscal
 * year become cost members (`costMembersOf`), each placed in its cost atom by the last close's index
 * (a position created since the close takes its manager position's atom), and each pending request's
 * in-year band effect on an atom's seats joins that atom's band part as a member of its own, with no
 * people. The guard rounds each atom's filled part (basis 'hris' and 'offer', allowance lines
 * included) and band part down to the step on its own, leaves out atoms under the minimum costed
 * people, and adds the parts with `sumRounded`. Costed people are counted over the year by the guard
 * (7.2 rule 1): each holder of an 'hris' line and each accepted offer of an 'offer' line with an
 * active fraction above 0.
 *
 * The org's Working lines are read through the one line-source rule every Plan, Forecast and
 * Targets figure reads (src/plan/lineSource.ts `withClosedMonths`, change C33 and review RF-4): the
 * closed months from the closes (with no vacancy allowance, C31) and the later months from
 * Working's own lines (trades.ts `unitWorkingLines`), so routing compares the target with the same
 * asks cost the app shows in every mode.
 */
import { type AtomIndex, atomOf } from '@/cost/atoms'
import { type CostMember, type CostSeat, costMembersOf, guardModel, peopleOf, sumAmounts } from '@/cost/guard'
import type { CostGuardSettings } from '@/metrics/costGuard'
import { FLOOR_USD, MIN_CONTRIBUTORS, MIN_COSTED } from '@/metrics/rules'
import { assumptionLookup } from '@/plan/engine/assumptions'
import { type TradeRates, tradeRatesOf } from '@/plan/engine/band'
import type { ChainOrg, ChainSeat } from '@/plan/engine/chain'
import { rateOf } from '@/plan/engine/fx'
import { isActiveOn, toAssignments } from '@/plan/engine/heads'
import { fromRow } from '@/plan/engine/requests'
import { type AsksContext, asksContext, bandEffect } from '@/plan/engine/targets'
import type { FxTable, HcRequest, OrgMatch, PlanLine } from '@/plan/types'
import { monthsOf } from '../fiscal'
import {
  type AssumptionRow,
  type Datasets,
  type FiscalYear,
  type ISODate,
  isLeaderLevel,
  type Month,
  type PositionRow,
} from '../schema'
import { versionSpec } from './assumptions'
import { holderOn, type World } from './org'
import { latestRows, rowsOn } from './orgs'
import { LEADER_THRESHOLD_USD, UNIT_LEADER } from './requests'

/** Each unit's HRBP and leader (the Units list), as employee IDs. */
export function unitPeople(
  w: World,
  on: number,
): Map<string, { hrbpId: string | null; leaderId: string | null }> {
  const out = new Map<string, { hrbpId: string | null; leaderId: string | null }>()
  for (const [bu, key] of Object.entries(UNIT_LEADER)) {
    const hrbp = w.hrbp.get(bu)
    const seat = w.execs.get(key)
    const leader = seat != null ? holderOn(w, seat, on) : null
    out.set(bu, {
      hrbpId: hrbp != null ? w.people[hrbp].id : null,
      leaderId: leader != null ? w.people[leader].id : null,
    })
  }
  return out
}

/** The org as `chainFor` reads it on a date: every seat in effect, its holder, and each person's seats. */
export function chainOrgOf(
  data: Datasets,
  on: ISODate,
  units: ChainOrg['units'],
  financeApproverId: string | null,
): ChainOrg {
  const rows = rowsOn(data.positions, on)
  const holders = new Map<string, string>()
  const seatsOf = new Map<string, string[]>()
  for (const a of toAssignments(data.workers)) {
    if (a.workerType !== 'Employee' || !a.positionId || !isActiveOn(a, on) || !rows.has(a.positionId))
      continue
    if (!holders.has(a.positionId)) holders.set(a.positionId, a.employeeId)
    const list = seatsOf.get(a.employeeId)
    if (list) list.push(a.positionId)
    else seatsOf.set(a.employeeId, [a.positionId])
  }
  const seats = new Map<string, ChainSeat>()
  for (const [id, r] of rows) {
    if (r.status === 'Eliminated') continue
    seats.set(id, {
      positionId: id,
      managerPositionId: r.managerPositionId ?? null,
      businessUnit: r.businessUnit,
      level: r.level,
      leaderSeat: r.leaderLevel === true || (r.leaderLevel !== false && isLeaderLevel(r.level)),
      holderId: holders.get(id) ?? null,
    })
  }
  return { seats, seatsOf, units, financeApproverId, leaderThresholdUsd: LEADER_THRESHOLD_USD }
}

/** A version's plan rate for a currency (flat over the sample's grid; the first grid month's). */
export function planRateOf(rates: FxTable, firstMonth: Month): (currency: string) => number | null {
  return (currency) => rateOf(rates, currency, 'plan', firstMonth)
}

/** Trade rates (band estimates at plan rates, weights) from a version's assumption rows. */
export function ratesOf(
  rows: readonly AssumptionRow[],
  rates: FxTable,
  version: { versionId: string; name: string; fiscalYear: FiscalYear },
  lockHash: string | null,
  positions: readonly PositionRow[],
): TradeRates {
  const latest = latestRows(positions)
  return tradeRatesOf({
    version,
    lockHash,
    lookup: assumptionLookup(rows, version),
    planRate: planRateOf(rates, versionSpec(version.versionId).grid.from),
    orgPathOf: (id) => {
      const r = latest.get(id)
      return r ? { businessUnit: r.businessUnit, department: r.department ?? null } : null
    },
  })
}

/** Working's asks context: its seats as given, band estimates at its plan rates. */
export function workingAsksContext(
  data: Datasets,
  rates: TradeRates,
  firstOpenMonth: Month,
  requests: readonly HcRequest[] = data.requests.map(fromRow),
): AsksContext {
  return asksContext({
    positions: data.positions,
    assignments: toAssignments(data.workers),
    reqs: data.reqs,
    requests,
    proration: 'daily',
    firstOpenMonth,
    bandUsd: (seat, place) => rates.bandUsd(seat, place.positionId ?? place.managerPositionId ?? ''),
  })
}

/** A business unit as an org (asks, head effects and band effects). */
export const unitOrg =
  (businessUnit: string): OrgMatch =>
  (place) =>
    place.businessUnit === businessUnit

/** One atom's parts of the guarded asks cost. */
export interface AtomAsks {
  atomId: string
  costedPeople: number
  /** The atom's exact filled part (USD over the year), before the guard rounds it. */
  filled: number
  /** The atom's exact band part, the pending requests' band effects included. */
  band: number
}

export interface GuardedAsksCost {
  /**
   * The guard's rounded total: `sumRounded` over the rounded parts of the atoms with the minimum or
   * more costed people (0 when no atom has, as the sum of no parts).
   */
  cost: number
  atoms: AtomAsks[]
  /** Costed people in the atoms left out (under the minimum, or in no atom). */
  leftOut: number
}

/** Where a member sits, for the guard in rounded mode: only the manager position is read (atoms). */
const ROUTING_SEAT: Omit<CostSeat, 'managerPositionId'> = {
  businessUnit: '',
  department: null,
  costCenter: '',
  location: '',
  legalEntity: '',
  country: '',
  level: 'P1',
}

/** A pending request's in-year band effect on one atom, as a band-part member with no people. */
function bandEffectMember(requestId: string, atomId: string, usd: number): CostMember {
  return {
    positionId: `request:${requestId}|${atomId}`,
    part: 'band',
    people: [],
    costedByMonth: [],
    amounts: {
      base: 0,
      bonus: 0,
      burden: 0,
      benefits: 0,
      oneTime: 0,
      vacancy: 0,
      equity: 0,
      loaded: usd,
    },
    currency: 'USD',
    seat: { ...ROUTING_SEAT, managerPositionId: null },
    atomId,
  }
}

/**
 * The guarded asks cost of an org for a fiscal year (see the module comment). `lines` are the org's
 * Working lines (any months: only the year's are read); `requests` are the pending requests counted
 * in asks (the caller leaves out the one being routed and any the requester may not see).
 */
export function guardedAsksCost(input: {
  lines: readonly PlanLine[]
  requests: readonly HcRequest[]
  fiscalYear: FiscalYear
  org: OrgMatch
  ctx: AsksContext
  index: AtomIndex
  managerOf: (positionId: string) => string | null
  minCosted?: number
}): GuardedAsksCost {
  const rules: CostGuardSettings = {
    minCosted: input.minCosted ?? Number(MIN_COSTED.default),
    floorUsd: Number(FLOOR_USD.default),
    minContributors: Number(MIN_CONTRIBUTORS.default),
  }
  const members = costMembersOf({
    lines: input.lines,
    months: monthsOf(input.fiscalYear),
    seatOf: (id) => ({ ...ROUTING_SEAT, managerPositionId: input.managerOf(id) }),
    atoms: input.index,
  }).members
  // Each pending request's band effect on the seats of each atom the org's lines reach.
  const atomIds = [...new Set(members.map((m) => m.atomId).filter((a): a is string => a != null))].sort()
  const atomOfPosition = (id: string | null) => (id ? atomOf(id, input.index, input.managerOf) : null)
  for (const r of input.requests)
    for (const atomId of atomIds) {
      const inAtom: OrgMatch = (place, on) =>
        input.org(place, on) && atomOfPosition(place.positionId ?? place.managerPositionId) === atomId
      const usd = bandEffect(r, inAtom, input.fiscalYear, input.ctx)
      if (usd !== 0) members.push(bandEffectMember(r.requestId, atomId, usd))
    }
  const figure = guardModel({
    members,
    mode: 'rounded',
    rules,
    atoms: input.index,
    fit: null,
    bandShown: true,
  })
  const atoms: AtomAsks[] = atomIds.map((atomId) => {
    const own = members.filter((m) => m.atomId === atomId)
    return {
      atomId,
      costedPeople: peopleOf(own).size,
      filled: sumAmounts(own.filter((m) => m.part === 'filled')).loaded,
      band: sumAmounts(own.filter((m) => m.part === 'band')).loaded,
    }
  })
  return { cost: figure.total.totalUsd ?? 0, atoms, leftOut: figure.total.leftOut ?? 0 }
}
