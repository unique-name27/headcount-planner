/**
 * The approval chain, as data (docs/PLAN.md 10.2, 11.4, 7.2 rule 8 and 8.4 rule 8). Built by engines
 * C in M1. Pure.
 *
 * - A rule adds its step when any of its triggers holds; `only` limits a rule to the listed types and
 *   `except` skips them. For a Trade, `unit-hrbp` is the giving unit's HRBP; for a Transfer it is the
 *   from-unit's, and "giving" and "receiving" mean from and to. Start recruiting and Start date
 *   produce exactly one step, the unit HRBP.
 * - Submitter's manager = the holder of the requester's seat's managerPositionId. The leader = the
 *   nearest leader seat at or above the request's org (its managerPositionId) whose holder is not the
 *   requester. Unit HRBP and unit leaders from the Units list; Finance approver from Lists.
 * - Leader threshold: band estimate (annual, USD at plan rate, no SBC) strictly above the threshold
 *   ($250,000, `requests.chain.leaderThreshold`), or a level of Director or above, or out of plan.
 * - Out of plan: for each org the request touches, that org's target (the nearest at or above with a
 *   target, at worst the unit) is exceeded at the target date in heads, or in the guarded asks cost
 *   (7.2 rule 8, never exact HRIS sums), with this request counted; or no org up to the unit has a
 *   target; or it is raised outside an open cycle while a cycle record for its fiscal year is Locked.
 *   The caller computes each `PlanCheck` once, the same in every mode, leaving out every request that
 *   8.4 rule 3 hides from this request's requester.
 * - 'different-direct-reports' (Trade): the give org and the get org are both in the nearest leader's
 *   tree and sit under different direct reports of that leader (never for a cross-unit trade).
 * - In-plan like-for-like backfills (same level, location and FTE, the seat in the plan of record)
 *   stop at the HRBP.
 * - No self-approval: a step whose approver is the requester moves up to the next person of that role
 *   above. One person on two steps keeps the higher (later) step only. Steps are numbered 1 to n in
 *   rule order and stored on the request, so every viewer reads the same chain.
 *
 * Readings taken here:
 *  - The submitter's manager is the nearest held seat above the requester's seat (a vacant manager
 *    seat passes the step up).
 *  - "The next person of that role above": for a leader step the next leader seat above the
 *    approver's own seat; for the other roles the next held seat above it. A step with nobody to give
 *    it to is left out.
 *  - When one person is on two steps, the kept (later) step carries the reasons of both.
 *  - A step whose approver cannot be found (no HRBP or leader in the Units list, no Finance approver)
 *    is left out; the caller refuses a submit with no step at all (requests.ts).
 */
import { isLeaderLevel, type Level, type RequestType } from '@/data/schema'
import type { ChainReason, ChainTrigger, HcRequest, Step, StepRoleCode } from '../types'

/** Who a rule's step goes to. */
export type ChainWho =
  | 'submitter-manager'
  | 'unit-hrbp'
  | 'receiving-unit-hrbp'
  | 'nearest-leader'
  | 'giving-unit-leader'
  | 'receiving-unit-leader'
  | 'finance-approver'

export interface ChainRule {
  role: StepRoleCode
  who: ChainWho
  when: 'always' | readonly ChainTrigger[]
  only?: readonly RequestType[]
  except?: readonly RequestType[]
}

/** The chain rules, verbatim from docs/PLAN.md 10.2. Data, part of the contract. */
export const CHAIN_RULES: readonly ChainRule[] = [
  { role: 'manager', who: 'submitter-manager', when: 'always', except: ['Start recruiting', 'Start date'] },
  { role: 'hrbp', who: 'unit-hrbp', when: 'always' },
  { role: 'hrbp', who: 'receiving-unit-hrbp', when: ['cross-unit'], only: ['Transfer', 'Trade'] },
  {
    role: 'leader',
    who: 'nearest-leader',
    when: ['band-estimate-over-threshold', 'director-plus', 'out-of-plan'],
    except: ['Start recruiting', 'Start date', 'Transfer'],
  },
  { role: 'leader', who: 'nearest-leader', when: ['different-direct-reports'], only: ['Trade'] },
  { role: 'leader', who: 'giving-unit-leader', when: ['cross-unit'], only: ['Transfer', 'Trade'] },
  { role: 'leader', who: 'receiving-unit-leader', when: ['cross-unit'], only: ['Transfer', 'Trade'] },
  {
    role: 'finance',
    who: 'finance-approver',
    when: ['new-role', 'freeze-exception', 'envelope-exception'],
    except: ['Start recruiting', 'Start date'],
  },
  { role: 'finance', who: 'finance-approver', when: ['cross-unit', 'out-of-plan'], only: ['Trade'] },
]

/** A position as routing reads it, on the as-of date. */
export interface ChainSeat {
  positionId: string
  managerPositionId: string | null
  businessUnit: string
  level: Level
  /** Director (M2) or above, or marked a leader in Lists or by `leaderLevel`. */
  leaderSeat: boolean
  /** The Employee holding it on the as-of date; null when vacant. */
  holderId: string | null
}

/** The org as routing reads it: stable for one data load and as-of date. */
export interface ChainOrg {
  seats: ReadonlyMap<string, ChainSeat>
  /** Each person's seats on the as-of date (to find the requester's seat). */
  seatsOf: ReadonlyMap<string, readonly string[]>
  /** Each business unit's HRBP and leader (Units list); null when none is set. */
  units: ReadonlyMap<string, { hrbpId: string | null; leaderId: string | null }>
  /** The Finance approver (Lists role column). */
  financeApproverId: string | null
  /** `requests.chain.leaderThreshold` (USD, strictly above). */
  leaderThresholdUsd: number
}

/** One org's out-of-plan test for a request. */
export interface PlanCheck {
  /** The org whose target decides (a label); null when no org up to the unit has a target. */
  org: string | null
  target: { heads: number; cost: number | null } | null
  /**
   * The org's guarded asks at the target date without this request and without any request 8.4 rule
   * 3 hides from its requester. `cost` null: heads are compared only (not a union of atoms, or "—").
   */
  asks: { heads: number; cost: number | null }
  /** This request's head effect and in-year band effect on the org (targets.ts). */
  effect: { heads: number; cost: number }
}

/** Facts about one request that routing reads, computed by the caller. */
export interface ChainFacts {
  /** Annual band estimate, USD at plan rates, no SBC, of the request's new or changed seats (a trade: the quote's getBandUsd); null when none. */
  bandEstimateUsd: number | null
  /** One check per org the request touches (a trade: the giving and the receiving org). */
  checks: readonly PlanCheck[]
  /** Raised outside an open cycle while its fiscal year's cycle record is Locked. */
  cycleLocked: boolean
  /** An in-plan like-for-like Backfill (same level, location and FTE, the seat in the plan of record). */
  likeForLikeBackfill: boolean
  /** A move past a sub-org's cost envelope (7.2 rule 8). */
  envelopeException: boolean
}

export interface ChainContext {
  org: ChainOrg
  facts: ChainFacts
}

/* ───────────── the org ───────────── */

/** The positions from `from` up the manager chain, `from` first (stops at a loop or an unknown seat). */
function chainUp(org: ChainOrg, from: string | null): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (let id = from; id != null && !seen.has(id); id = org.seats.get(id)?.managerPositionId ?? null) {
    seen.add(id)
    if (!org.seats.has(id)) break
    out.push(id)
  }
  return out
}

/** The requester's own seat on the as-of date (the first listed), or null. */
const requesterSeat = (org: ChainOrg, personId: string): string | null =>
  org.seatsOf.get(personId)?.[0] ?? null

/** The nearest seat at or above `from` that a filter accepts and someone other than `not` holds. */
function holderFrom(
  org: ChainOrg,
  from: string | null,
  not: string,
  accept: (s: ChainSeat) => boolean = () => true,
): { positionId: string; holderId: string } | null {
  for (const id of chainUp(org, from)) {
    const s = org.seats.get(id)
    if (s?.holderId && s.holderId !== not && accept(s)) return { positionId: id, holderId: s.holderId }
  }
  return null
}

/** The nearest leader seat at or above the request's org whose holder is not the requester. */
export function nearestLeader(
  org: ChainOrg,
  orgPositionId: string | null,
  requesterId: string,
): { positionId: string; holderId: string } | null {
  return holderFrom(org, orgPositionId, requesterId, (s) => s.leaderSeat)
}

/** The giving org of a trade: the stored giving org, else the first give seat's manager position. */
function givingOrgOf(req: HcRequest, org: ChainOrg): string | null {
  const t = req.trade
  if (!t) return null
  if (t.giveOrgPositionId) return t.giveOrgPositionId
  const first = t.givePositionIds[0]
  return first ? (org.seats.get(first)?.managerPositionId ?? null) : null
}

const unitOf = (org: ChainOrg, positionId: string | null | undefined): string | null =>
  positionId ? (org.seats.get(positionId)?.businessUnit ?? null) : null

/** The two units a request routes through: giving (from) and receiving (to). Equal for one-unit types. */
export function unitsOf(req: HcRequest, org: ChainOrg): { giving: string; receiving: string } {
  if (req.type === 'Trade') {
    const receiving = req.businessUnit
    const giving =
      unitOf(org, req.trade?.giveOrgPositionId) ?? unitOf(org, req.trade?.givePositionIds[0]) ?? receiving
    return { giving, receiving }
  }
  if (req.type === 'Transfer' && req.transfer) {
    const t = req.transfer
    const giving = unitOf(org, t.fromPositionId) ?? req.businessUnit
    const receiving =
      (t.kind === 'position' ? unitOf(org, t.toManagerPositionId) : unitOf(org, t.toPositionId)) ?? giving
    return { giving, receiving }
  }
  return { giving: req.businessUnit, receiving: req.businessUnit }
}

/**
 * 'different-direct-reports' (11.4, lead reading L3): the give org and the get org are both in the
 * nearest leader's tree (at or below the leader's seat) and sit under different direct reports of it.
 */
function differentDirectReports(req: HcRequest, org: ChainOrg): boolean {
  if (req.type !== 'Trade' || !req.trade) return false
  const leader = nearestLeader(org, req.managerPositionId, req.requesterId)
  const give = givingOrgOf(req, org)
  if (!leader || !give) return false
  const directReport = (from: string): string | null => {
    const up = chainUp(org, from)
    const i = up.indexOf(leader.positionId)
    if (i < 0) return null
    return i === 0 ? leader.positionId : up[i - 1]
  }
  const a = directReport(give)
  const b = directReport(req.managerPositionId)
  return a != null && b != null && a !== b
}

/* ───────────── triggers ───────────── */

/**
 * Out of plan (see the module comment): any check with no target, or with asks + effect above the
 * target in heads, or in cost where both target and asks have a cost; or `cycleLocked`. A request with
 * no check touches no org with a target question and reads in plan.
 *
 * Fixtures: T1′ (asks 35 + 7 = 42 > 40), CH2 (no target, but Start date takes no leader step).
 */
export function outOfPlan(_req: HcRequest, ctx: ChainContext): boolean {
  const f = ctx.facts
  if (f.cycleLocked) return true
  return f.checks.some((c) => {
    if (!c.target) return true
    if (c.asks.heads + c.effect.heads > c.target.heads) return true
    return c.target.cost != null && c.asks.cost != null && c.asks.cost + c.effect.cost > c.target.cost
  })
}

/** The triggers that hold for a request. Fixtures: CH1 to CH5, T1 to T6. */
export function triggersOf(req: HcRequest, ctx: ChainContext): Set<ChainTrigger> {
  const { org, facts } = ctx
  const out = new Set<ChainTrigger>()
  const units = unitsOf(req, org)
  if ((req.type === 'Trade' || req.type === 'Transfer') && units.giving !== units.receiving)
    out.add('cross-unit')
  if (facts.bandEstimateUsd != null && facts.bandEstimateUsd > org.leaderThresholdUsd)
    out.add('band-estimate-over-threshold')
  const seat = req.positionId ? org.seats.get(req.positionId) : undefined
  if ((req.level != null && isLeaderLevel(req.level)) || seat?.leaderSeat) out.add('director-plus')
  if (outOfPlan(req, ctx)) out.add('out-of-plan')
  if (!out.has('cross-unit') && differentDirectReports(req, org)) out.add('different-direct-reports')
  if (req.type === 'New role') out.add('new-role')
  if (req.exception != null) out.add('freeze-exception')
  if (facts.envelopeException) out.add('envelope-exception')
  return out
}

/* ───────────── the chain ───────────── */

/** Whether a rule applies to a request type. */
const appliesTo = (rule: ChainRule, type: RequestType): boolean =>
  (!rule.only || rule.only.includes(type)) && !rule.except?.includes(type)

/** Who a rule's step goes to, before the self-approval rule; null when nobody is set. */
function approverOf(who: ChainWho, req: HcRequest, ctx: ChainContext): string | null {
  const { org } = ctx
  const units = unitsOf(req, org)
  switch (who) {
    case 'submitter-manager': {
      const own = requesterSeat(org, req.requesterId)
      if (!own) return null
      return holderFrom(org, org.seats.get(own)?.managerPositionId ?? null, req.requesterId)?.holderId ?? null
    }
    case 'unit-hrbp':
      return org.units.get(units.giving)?.hrbpId ?? null
    case 'receiving-unit-hrbp':
      return org.units.get(units.receiving)?.hrbpId ?? null
    case 'nearest-leader':
      return nearestLeader(org, req.managerPositionId, req.requesterId)?.holderId ?? null
    case 'giving-unit-leader':
      return org.units.get(units.giving)?.leaderId ?? null
    case 'receiving-unit-leader':
      return org.units.get(units.receiving)?.leaderId ?? null
    case 'finance-approver':
      return org.financeApproverId
  }
}

/** The next person of a role above someone (the self-approval rule); null when there is none. */
function nextAbove(role: StepRoleCode, personId: string, ctx: ChainContext): string | null {
  const { org } = ctx
  const own = requesterSeat(org, personId)
  if (!own) return null
  const above = org.seats.get(own)?.managerPositionId ?? null
  return (
    holderFrom(org, above, personId, role === 'leader' ? (s) => s.leaderSeat : undefined)?.holderId ?? null
  )
}

/**
 * The request's approval steps (`enteredAt`, `decision`, `at` and `note` null; the caller enters the
 * first step on submit).
 *
 * Fixtures (chain.test.ts): CH1 [hrbp] (Start recruiting, even with a Locked FY27 cycle), CH2 [hrbp]
 * (Start date on a Planned Director seat in a unit with no targets), CH3 [manager, hrbp] (same-unit
 * position move), CH4 [manager, from-unit HRBP, to-unit HRBP, from-unit leader, to-unit leader]
 * (cross-unit internal move), CH5 = T6 [manager, giving HRBP, receiving HRBP, giving-unit leader,
 * receiving-unit leader, Finance]; trade.test.ts T1 to T6 chains.
 */
export function chainFor(req: HcRequest, ctx: ChainContext): Step[] {
  const triggers = triggersOf(req, ctx)
  // In-plan like-for-like backfills stop at the HRBP: no leader step.
  const stopAtHrbp = req.type === 'Backfill' && ctx.facts.likeForLikeBackfill && !triggers.has('out-of-plan')
  const raw: { role: StepRoleCode; approverId: string; reasons: ChainReason[] }[] = []
  for (const rule of CHAIN_RULES) {
    if (!appliesTo(rule, req.type)) continue
    if (stopAtHrbp && rule.role === 'leader') continue
    const reasons: ChainReason[] =
      rule.when === 'always' ? ['always'] : rule.when.filter((t) => triggers.has(t))
    if (!reasons.length) continue
    let approverId = approverOf(rule.who, req, ctx)
    if (approverId === req.requesterId) approverId = nextAbove(rule.role, approverId, ctx)
    if (!approverId || approverId === req.requesterId) continue
    raw.push({ role: rule.role, approverId, reasons })
  }
  // One person on two steps keeps the higher (later) step, with the reasons of both.
  const kept: typeof raw = []
  raw.forEach((step, i) => {
    const later = raw.slice(i + 1).find((s) => s.approverId === step.approverId)
    if (later) {
      for (const r of step.reasons) if (!later.reasons.includes(r)) later.reasons.push(r)
      return
    }
    kept.push(step)
  })
  return kept.map((s, i) => ({
    n: i + 1,
    role: s.role,
    approverId: s.approverId,
    reasons: s.reasons,
    enteredAt: null,
    decision: null,
    at: null,
    note: null,
  }))
}
