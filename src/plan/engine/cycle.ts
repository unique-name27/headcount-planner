/**
 * The planning cycle (docs/PLAN.md 10.3, 15.1 R6 to R8, change C10). Built by engines C in M1. Pure.
 *
 * Stages: Open for asks, HRBP review, Leader review, Finance review, Locked. Finance opens the cycle
 * and sets dates; each HRBP finishes HRBP review for their unit, each leader for their org; Finance
 * locks or returns. Managers submit ranked asks (requests with `cycleId` and `priority`); cycle asks
 * take the submitter's manager step and the stages replace the per-request steps. At lock, asks above
 * the cut line become Approved (or Approved with changes) and add Planned positions to the year's
 * Working; asks below become Rejected with reason "Below the cut line", which managers see.
 *
 * How the actions run (`cycleTransition`):
 *  - open, dates, return and lock are Finance's (HR admin too); a return goes back to an earlier stage
 *    and clears the finished lists from that stage on; lock needs Finance review.
 *  - advance with `businessUnit` marks a unit's HRBP review finished (HRBP), with `leaderPositionId` a
 *    leader org's Leader review finished (Leader); advance with neither is Finance moving the stage
 *    on. `stageDone` tells the caller when every unit or leader org has finished, so it can move the
 *    stage on in the same step ("the stage moves on when every unit has finished").
 *  - cut sets a unit's cut line (HRBP, Leader, Finance); nothing changes a Locked cycle.
 *
 * The cut line the tab shows is the one the lock applies (lead decision D-CYCLE, review SC-1, SP-2,
 * UI-1): a unit's stored mark, else `defaultCutAfter` over the same ranked asks and the room its
 * target leaves (`cutAfterOf`, `roomOf`); a unit with no target and no mark has nothing cut. Every
 * Submitted or In review ask stays in the ranking while the cycle is open (story 6 keeps 58 heads and
 * the cut after the 40th); a Sent back ask is with its requester, so it is left out of the ranking and
 * the lock does not decide it. The lock is refused while any ask still waits on its manager step
 * (`waitingOnManager`, `lockWaitingText`).
 *
 * Dates (15.1 R47): `at` is the business time (the cycle's opened and locked dates); the audit
 * entries' own time is `auditAt`, `at` when not given, and their effective date the business date.
 */
import {
  CYCLE_STAGES,
  type CycleStage,
  type FiscalYear,
  type ISODate,
  type ISODateTime,
  type RequestState,
} from '@/data/schema'
import { formatMonthShort } from '@/lib/dates'
import type { Actor, AuditDraft, Cycle, HcRequest } from '../types'

/** requests.ts BELOW_THE_CUT_LINE, kept here to avoid a module cycle (cycle.test.ts pins them equal). */
const BELOW_CUT = 'Below the cut line'

/** The states a ranked ask is in: Submitted (waiting on its manager) or In review (D-CYCLE). */
const RANKED: readonly RequestState[] = ['Submitted', 'In review']

/** One ranked ask with its head effect and in-year band effect (targets.ts). */
export interface RankedAsk {
  requestId: string
  requesterId: string
  /** The requester's own rank, 1 first. */
  priority: number
  heads: number
  /** In-year band effect, USD (a band figure). */
  bandUsd: number
}

/**
 * The asks of a cycle in ranked order: by the order the HRBP set (`order`, request IDs), else by
 * priority, then submittedAt, then requestId. Only Submitted and In review requests with the cycle's
 * ID: a Sent back ask is with its requester and is left out (D-CYCLE). Asks missing from `order`
 * follow the ordered ones, in the default order.
 *
 * Fixture: G1 (58 asks of 1 head each).
 */
export function rankAsks(
  requests: readonly HcRequest[],
  cycleId: string,
  heads: (req: HcRequest) => number,
  bandUsd: (req: HcRequest) => number,
  order?: readonly string[],
): RankedAsk[] {
  const at = new Map((order ?? []).map((id, i) => [id, i]))
  const rank = (r: HcRequest) => at.get(r.requestId) ?? Number.POSITIVE_INFINITY
  const asks = requests.filter((r) => r.cycleId === cycleId && RANKED.includes(r.state))
  asks.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra < rb ? -1 : 1
    const pa = a.priority ?? Number.POSITIVE_INFINITY
    const pb = b.priority ?? Number.POSITIVE_INFINITY
    if (pa !== pb) return pa < pb ? -1 : 1
    const sa = a.submittedAt ?? ''
    const sb = b.submittedAt ?? ''
    if (sa !== sb) return sa < sb ? -1 : 1
    return a.requestId < b.requestId ? -1 : a.requestId > b.requestId ? 1 : 0
  })
  return asks.map((r) => ({
    requestId: r.requestId,
    requesterId: r.requesterId,
    priority: r.priority ?? 0,
    heads: heads(r),
    bandUsd: bandUsd(r),
  }))
}

/** Where a cut line falls and what is on each side (heads and in-year band estimate). */
export interface CutLine {
  afterHeads: number
  above: readonly string[]
  below: readonly string[]
  headsAbove: number
  headsBelow: number
  bandAbove: number
  bandBelow: number
}

/** How many of the ranked asks sit above a line after `afterHeads` heads: the run before the first ask that would pass it. */
function aboveCount(asks: readonly RankedAsk[], afterHeads: number): number {
  let sum = 0
  for (let i = 0; i < asks.length; i++) {
    if (sum + asks[i].heads > afterHeads) return i
    sum += asks[i].heads
  }
  return asks.length
}

/**
 * The default cut line: after the longest run of ranked asks whose heads add up to no more than
 * `room` (the target − asks without the cycle's asks). Returns the heads above it.
 *
 * Fixture: G1 (room 40: the line falls after the 40th ranked head).
 */
export function defaultCutAfter(asks: readonly RankedAsk[], room: number): number {
  const n = aboveCount(asks, Math.max(0, room))
  let sum = 0
  for (let i = 0; i < n; i++) sum += asks[i].heads
  return sum
}

/**
 * The room a unit's target leaves the cycle's ranked asks: target heads − (the unit's asks at the
 * target date − the heads the ranked asks add), as Requests > Cycle shows it; null with no target.
 * Fixture: G1 (room 40).
 */
export function roomOf(
  targetHeads: number | null,
  asksHeads: number,
  ranked: readonly Pick<RankedAsk, 'heads'>[],
): number | null {
  if (targetHeads == null) return null
  let rankedHeads = 0
  for (const a of ranked) rankedHeads += a.heads
  return targetHeads - (asksHeads - rankedHeads)
}

/** Where a unit's cut line falls and where it comes from: its mark, the default from the room, or none. */
export interface UnitCut {
  /** After this many ranked heads; null when nothing is cut (no mark and no target). */
  afterHeads: number | null
  source: 'set' | 'default' | 'none'
}

/**
 * The one cut line for a unit, the tab's and the lock's alike (D-CYCLE): the stored mark, else
 * `defaultCutAfter` over the ranked asks and the room (`roomOf`), else none.
 */
export function cutAfterOf(
  cycle: Pick<Cycle, 'cutLines'>,
  businessUnit: string,
  ranked: readonly RankedAsk[],
  room: number | null,
): UnitCut {
  const mark = cycle.cutLines.find((c) => c.businessUnit === businessUnit)
  if (mark) return { afterHeads: mark.afterHeads, source: 'set' }
  if (room != null) return { afterHeads: defaultCutAfter(ranked, room), source: 'default' }
  return { afterHeads: null, source: 'none' }
}

/** The asks above and below a cut line after `afterHeads` ranked heads. Fixture: G1 (40 above, 18 below). */
export function cutLine(asks: readonly RankedAsk[], afterHeads: number): CutLine {
  const n = aboveCount(asks, afterHeads)
  const out = {
    afterHeads,
    above: [] as string[],
    below: [] as string[],
    headsAbove: 0,
    headsBelow: 0,
    bandAbove: 0,
    bandBelow: 0,
  }
  asks.forEach((a, i) => {
    if (i < n) {
      out.above.push(a.requestId)
      out.headsAbove += a.heads
      out.bandAbove += a.bandUsd
    } else {
      out.below.push(a.requestId)
      out.headsBelow += a.heads
      out.bandBelow += a.bandUsd
    }
  })
  return out
}

export type CycleAction =
  | { kind: 'open'; cycleId: string; fiscalYear: FiscalYear; dates: Cycle['dates'] }
  | { kind: 'dates'; dates: Cycle['dates'] }
  /** An HRBP finishes HRBP review for a unit, or a leader Leader review for an org; Finance moves Finance review on. */
  | { kind: 'advance'; businessUnit?: string; leaderPositionId?: string }
  | { kind: 'return'; to: CycleStage }
  | { kind: 'cut'; businessUnit: string; afterHeads: number }
  | { kind: 'lock' }

const stageIndex = (s: CycleStage): number => CYCLE_STAGES.indexOf(s)

const isFinance = (a: Actor): boolean => a.mode === 'finance' || a.mode === 'hr-admin'

/**
 * Whether every unit (HRBP review) or every leader org (Leader review) has finished, so the stage can
 * move on. False in the other stages.
 */
export function stageDone(cycle: Cycle, units: readonly string[], leaderOrgs: readonly string[]): boolean {
  if (cycle.stage === 'HRBP review') return units.every((u) => cycle.hrbpDone.includes(u))
  if (cycle.stage === 'Leader review') return leaderOrgs.every((l) => cycle.leaderDone.includes(l))
  return false
}

/**
 * One cycle action, or a refusal in plain words. The stage moves on when every unit (HRBP review) or
 * every leader org (Leader review) has finished. `cycle` is null only for 'open'.
 */
export function cycleTransition(
  cycle: Cycle | null,
  action: CycleAction,
  actor: Actor,
  at: ISODateTime,
  auditAt: ISODateTime = at,
): { cycle: Cycle; audit: AuditDraft[] } | { refused: string } {
  const audit: AuditDraft[] = []
  const effectiveDate = at.slice(0, 10)
  const log = (c: Cycle, field: string, old: unknown, value: unknown) =>
    audit.push({
      at: auditAt,
      by: actor.personId,
      byName: actor.name,
      mode: actor.mode,
      object: 'cycle',
      id: c.cycleId,
      field,
      old,
      new: value,
      effectiveDate,
      comment: null,
      commentAudience: null,
    })

  if (action.kind === 'open') {
    if (!isFinance(actor)) return { refused: 'Finance opens the planning cycle.' }
    if (cycle && cycle.stage !== 'Locked')
      return { refused: `The ${cycle.fiscalYear} cycle is already open. Lock it before opening another.` }
    const next: Cycle = {
      cycleId: action.cycleId,
      fiscalYear: action.fiscalYear,
      stage: 'Open for asks',
      openedAt: at,
      openedBy: actor.personId,
      dates: action.dates,
      hrbpDone: [],
      leaderDone: [],
      cutLines: [],
      lockedAt: null,
      lockedBy: null,
    }
    log(next, 'stage', null, next.stage)
    log(next, 'dates', null, next.dates)
    return { cycle: next, audit }
  }

  if (!cycle) return { refused: 'There is no planning cycle yet. Finance opens one.' }
  if (cycle.stage === 'Locked') return { refused: `The ${cycle.fiscalYear} cycle is locked.` }

  switch (action.kind) {
    case 'dates': {
      if (!isFinance(actor)) return { refused: 'Finance sets the cycle dates.' }
      const next = { ...cycle, dates: action.dates }
      log(next, 'dates', cycle.dates, action.dates)
      return { cycle: next, audit }
    }

    case 'advance': {
      if (action.businessUnit) {
        if (cycle.stage !== 'HRBP review') return { refused: 'HRBP review is not under way.' }
        if (actor.mode !== 'hrbp' && actor.mode !== 'hr-admin')
          return { refused: 'Each HRBP finishes HRBP review for their unit.' }
        if (cycle.hrbpDone.includes(action.businessUnit))
          return { refused: `${action.businessUnit} has already finished HRBP review.` }
        const next = { ...cycle, hrbpDone: [...cycle.hrbpDone, action.businessUnit] }
        log(next, 'hrbpDone', cycle.hrbpDone, next.hrbpDone)
        return { cycle: next, audit }
      }
      if (action.leaderPositionId) {
        if (cycle.stage !== 'Leader review') return { refused: 'Leader review is not under way.' }
        if (actor.mode !== 'leader' && actor.mode !== 'hr-admin')
          return { refused: 'Each leader finishes Leader review for their org.' }
        if (cycle.leaderDone.includes(action.leaderPositionId))
          return { refused: 'This org has already finished Leader review.' }
        const next = { ...cycle, leaderDone: [...cycle.leaderDone, action.leaderPositionId] }
        log(next, 'leaderDone', cycle.leaderDone, next.leaderDone)
        return { cycle: next, audit }
      }
      if (!isFinance(actor)) return { refused: 'Finance moves the cycle to its next stage.' }
      if (cycle.stage === 'Finance review') return { refused: 'Lock the cycle or return it.' }
      const stage = CYCLE_STAGES[stageIndex(cycle.stage) + 1]
      const next = { ...cycle, stage }
      log(next, 'stage', cycle.stage, stage)
      return { cycle: next, audit }
    }

    case 'return': {
      if (!isFinance(actor)) return { refused: 'Finance returns the cycle to an earlier stage.' }
      if (action.to === 'Locked' || stageIndex(action.to) >= stageIndex(cycle.stage))
        return { refused: 'A cycle returns only to an earlier stage.' }
      const to = stageIndex(action.to)
      const next: Cycle = {
        ...cycle,
        stage: action.to,
        hrbpDone: to <= stageIndex('HRBP review') ? [] : cycle.hrbpDone,
        leaderDone: to <= stageIndex('Leader review') ? [] : cycle.leaderDone,
      }
      log(next, 'stage', cycle.stage, action.to)
      return { cycle: next, audit }
    }

    case 'cut': {
      if (actor.mode === 'manager') return { refused: 'HRBPs, leaders and Finance set the cut line.' }
      if (!Number.isInteger(action.afterHeads) || action.afterHeads < 0)
        return { refused: 'A cut line falls after a whole number of heads, 0 or more.' }
      const old = cycle.cutLines.find((c) => c.businessUnit === action.businessUnit)?.afterHeads ?? null
      const next: Cycle = {
        ...cycle,
        cutLines: [
          ...cycle.cutLines.filter((c) => c.businessUnit !== action.businessUnit),
          { businessUnit: action.businessUnit, afterHeads: action.afterHeads },
        ],
      }
      log(next, `cutLine ${action.businessUnit}`, old, action.afterHeads)
      return { cycle: next, audit }
    }

    case 'lock': {
      if (!isFinance(actor)) return { refused: 'Finance locks the planning cycle.' }
      if (cycle.stage !== 'Finance review') return { refused: 'Finance locks the cycle from Finance review.' }
      const next: Cycle = { ...cycle, stage: 'Locked', lockedAt: at, lockedBy: actor.personId }
      log(next, 'stage', cycle.stage, 'Locked')
      return { cycle: next, audit }
    }
  }
}

/**
 * At lock: the asks above each unit's cut line are approved, the rest rejected "Below the cut line".
 * The line is `cutAfterOf`: the unit's mark, else the default from `rooms` (each unit's room, as the
 * tab shows it); a unit with neither has nothing cut. `rooms` is an addition to the contract (D-CYCLE).
 */
export function lockOutcomes(
  cycle: Cycle,
  asksByUnit: ReadonlyMap<string, readonly RankedAsk[]>,
  rooms: ReadonlyMap<string, number | null> = new Map(),
): { approved: string[]; rejected: string[] } {
  const approved: string[] = []
  const rejected: string[] = []
  for (const [unit, asks] of asksByUnit) {
    const cut = cutAfterOf(cycle, unit, asks, rooms.get(unit) ?? null)
    if (cut.afterHeads == null) {
      approved.push(...asks.map((a) => a.requestId))
      continue
    }
    const line = cutLine(asks, cut.afterHeads)
    approved.push(...line.above)
    rejected.push(...line.below)
  }
  return { approved, rejected }
}

/**
 * The cycle's asks still waiting on their manager step (Submitted or In review with an undecided
 * step), and the managers they wait on: the lock is refused while there are any (D-CYCLE).
 */
export function waitingOnManager(
  requests: readonly HcRequest[],
  cycleId: string,
): { requestIds: string[]; managerIds: string[] } {
  const requestIds: string[] = []
  const managers = new Set<string>()
  for (const r of requests) {
    if (r.cycleId !== cycleId || !RANKED.includes(r.state)) continue
    const waiting = r.steps.find((s) => s.decision == null)
    if (!waiting) continue
    requestIds.push(r.requestId)
    managers.add(waiting.approverId)
  }
  return { requestIds, managerIds: [...managers].sort() }
}

/** Why the lock waits (D-CYCLE): "Lock the FY28 cycle once these asks have their manager's decision: 42 asks with 30 managers." */
export function lockWaitingText(fiscalYear: FiscalYear, asks: number, managers: number): string {
  return `Lock the ${fiscalYear} cycle once these asks have their manager's decision: ${asks} ${asks === 1 ? 'ask' : 'asks'} with ${managers} ${managers === 1 ? 'manager' : 'managers'}.`
}

/**
 * What a Locked cycle decided, per business unit (after lock the tab shows the outcome, never a line
 * over no asks; review SC-20, UI-10): the asks Approved (or with changes) and those Rejected "Below
 * the cut line", in request order.
 */
export function lockedOutcomes(
  requests: readonly HcRequest[],
  cycleId: string,
): ReadonlyMap<string, { approved: string[]; below: string[] }> {
  const out = new Map<string, { approved: string[]; below: string[] }>()
  for (const r of requests) {
    if (r.cycleId !== cycleId) continue
    const approved = r.state === 'Approved' || r.state === 'Approved with changes'
    const below = r.state === 'Rejected' && r.reasonCode === BELOW_CUT
    if (!approved && !below) continue
    const unit = out.get(r.businessUnit) ?? { approved: [], below: [] }
    if (approved) unit.approved.push(r.requestId)
    else unit.below.push(r.requestId)
    out.set(r.businessUnit, unit)
  }
  return out
}

/** States that mean an ask was sent in (a Draft, a withdrawn or an expired ask was not). */
const SENT: readonly RequestState[] = [
  'Submitted',
  'In review',
  'Sent back',
  'Approved',
  'Approved with changes',
  'Rejected',
]

/** Managers with no ask in the cycle while it is open for asks (`requests.cycle.notSubmitted`). */
export function notSubmitted(
  managerIds: readonly string[],
  requests: readonly HcRequest[],
  cycleId: string,
): string[] {
  const sent = new Set<string>()
  for (const r of requests) if (r.cycleId === cycleId && SENT.includes(r.state)) sent.add(r.requesterId)
  return [...new Set(managerIds)].filter((id) => !sent.has(id))
}

/**
 * The "Copy note" text for managers who have not submitted: "Could you send your ranked asks for FY28
 * by 16 Oct?" (no nagging verbs: docs/PLAN.md 14.3 and change C10).
 */
export function copyNote(fiscalYear: FiscalYear, asksDue: ISODate): string {
  return `Could you send your ranked asks for ${fiscalYear} by ${+asksDue.slice(8, 10)} ${formatMonthShort(asksDue)}?`
}
