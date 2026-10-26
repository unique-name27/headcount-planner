/**
 * The planning cycle (docs/PLAN.md 8.3 `cycle.*`, 10.3, 15.1 R6 to R8, C10; Requests > Cycle). Finance
 * opens the cycle and sets its dates; each HRBP finishes HRBP review for its unit and each leader
 * Leader review for its org; HRBPs (and leaders, within the envelope) order the ranked asks and move
 * the cut line; Finance locks or returns. Each action checks its id first, then runs cycle.ts
 * `cycleTransition` and writes the cycle to `state.cycles` with the engine's audit drafts (object
 * 'cycle'). Pure.
 *
 * - openCycle `cycle.open`, setCycleDates `cycle.dates`, lockCycle `cycle.lock`, returnCycle
 *   `cycle.return`: "Planning cycles are run by Finance." elsewhere.
 * - finishStage `cycle.advance`: with `businessUnit` (HRBP limited: its own unit, OUTSIDE_UNIT_TEXT),
 *   with `leaderPositionId` (Leader limited: a leader seat it holds), with neither Finance moving the
 *   stage on. When every unit (or leader org) has finished, the stage moves on in the same action
 *   (cycle.ts `stageDone`).
 * - rankCycleAsks `cycle.rank`: an HRBP's (or a leader's, within the envelope) order of a unit's ranked
 *   asks into `Cycle.order`; a manager ranks only its own asks, by each request's `priority` (Manager
 *   limited "Your own asks."). Audit field 'order <unit>' on the cycle, 'priority' on each request.
 * - moveCutLine `cycle.cut-line` (Leader limited "Within the envelope."): a unit's cut line, after a
 *   whole number of ranked heads. The cut line never reaches Manager mode (M2 review RM-2).
 * - lockCycle: the cycle Locked, then each ask by `lockOutcomes` over `env.rankedAsks`: above the cut
 *   line Approved (or Approved with changes) through the requests engine's 'cycle-lock' transition,
 *   which adds the Planned positions to the year's Working; below it Rejected with reason
 *   BELOW_THE_CUT_LINE ("Below the cut line"), which managers see.
 *
 * Readings taken here (core, M3):
 *  - The units that must finish HRBP review are the units with ranked asks in the cycle; the leader
 *    orgs that must finish Leader review are those units' top leader seats (a leader seat of the unit
 *    whose manager sits outside it). The stage moves on the moment the last one finishes.
 *  - A Leader ranks and cuts only for asks and units inside its org; an HRBP only for its own unit.
 *
 * M3 review fixes (core-flow, lead decision D-CYCLE):
 *  - The lock decides each unit by the line the tab shows: the stored mark, else cycle.ts
 *    `defaultCutAfter` over the same ranked asks and the room the unit's target leaves (`cycleRooms`,
 *    over every request in force, not one viewer's), so story 6's lock cuts after the 40th head.
 *  - lockCycle is refused while any ask in the cycle still waits on its manager step
 *    (`lockWaitingText`); a Sent back ask is out of the ranking and the lock leaves it alone.
 *  - A limited Leader's cut line stays within the envelope: no more heads above it than the room the
 *    unit's target leaves, or a sub-org target the leader holds (heads; the cost envelope is the
 *    guarded asks cost's, which the write path's routing holds).
 *  - Dates (15.1 R47): the cycle's dates are the business time (./shared.ts `businessAt`); the audit
 *    entries' own time stays the wall clock.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the bodies.
 */
import { CYCLE_STAGES, type CycleStage, type FiscalYear, isLeaderLevel, type TargetRow } from '@/data/schema'
import {
  type CycleAction,
  cutLine,
  cycleTransition,
  lockOutcomes,
  lockWaitingText,
  type RankedAsk,
  roomOf,
  stageDone,
  waitingOnManager,
} from '../engine/cycle'
import { transition, withEffectiveStates } from '../engine/requests'
import { asks as asksAt, targetDateOf } from '../engine/targets'
import type { AuditDraft, Cycle, CycleOrder, HcRequest, OrgMatch, PlanState } from '../types'
import {
  CUT_LINE_NOTICE,
  CYCLE_DATES_NOTICE,
  cycleLockedNotice,
  cycleOpenedNotice,
  cycleReturnedNotice,
  hrbpReviewDoneNotice,
  LEADER_REVIEW_DONE_NOTICE,
  NOT_FOUND_TEXT,
  OUTSIDE_SCOPE_TEXT,
  OUTSIDE_UNIT_TEXT,
  RANKING_SAVED_NOTICE,
  stageMovedNotice,
} from './copy'
import { decisionOf, gate, isLimited } from './gate'
import {
  ancestorsOf,
  applyEffects,
  auditOf,
  businessAt,
  expiryOf,
  findRequest,
  inScope,
  isPendingState,
  latestRows,
  no,
  ok,
  putRequests,
} from './shared'
import type { ActionContext, ActionResult } from './types'

export interface OpenCycleInput {
  fiscalYear: FiscalYear
  dates: Cycle['dates']
}

export interface CycleRef {
  cycleId: string
}

export interface CycleDatesInput extends CycleRef {
  dates: Cycle['dates']
}

export interface FinishStageInput extends CycleRef {
  /** HRBP review: the unit that finished. */
  businessUnit?: string
  /** Leader review: the leader seat whose org finished. */
  leaderPositionId?: string
}

export interface RankAsksInput extends CycleRef {
  /** The unit whose asks are ordered (HRBP, Leader, Finance, HR admin). */
  businessUnit?: string
  /** Request IDs, first ranked first: the unit's order, or a manager's own asks (their priorities, 1 first). */
  requestIds: readonly string[]
}

export interface CutLineInput extends CycleRef {
  businessUnit: string
  /** After this many ranked heads; a whole number, 0 or more. */
  afterHeads: number
}

export interface ReturnCycleInput extends CycleRef {
  /** An earlier stage. */
  to: CycleStage
}

/* ───────────── helpers ───────────── */

const putCycle = (state: PlanState, cycle: Cycle): PlanState => {
  const known = state.cycles.some((c) => c.cycleId === cycle.cycleId)
  return {
    ...state,
    cycles: known
      ? state.cycles.map((c) => (c.cycleId === cycle.cycleId ? cycle : c))
      : [...state.cycles, cycle],
  }
}

const cycleOfId = (state: PlanState, id: string): Cycle | null =>
  state.cycles.find((c) => c.cycleId === id) ?? null

/** One cycle transition by the Acting as person, written with its audit. */
function step(
  state: PlanState,
  ctx: ActionContext,
  cycle: Cycle | null,
  action: CycleAction,
): { state: PlanState; cycle: Cycle; audit: AuditDraft[] } | { refused: string } {
  const out = cycleTransition(cycle, action, ctx.actor, businessAt(ctx), ctx.at)
  if ('refused' in out) return out
  return { state: putCycle(state, out.cycle), cycle: out.cycle, audit: out.audit }
}

/** Every request in force with its effective state (D-EXPIRY), plan state's own in place. */
function inForce(state: PlanState, ctx: ActionContext): readonly HcRequest[] {
  const own = new Map(state.requests.map((r) => [r.requestId, r]))
  const all = ctx.env.requests.map((r) => own.get(r.requestId) ?? r)
  const known = new Set(all.map((r) => r.requestId))
  for (const r of state.requests) if (!known.has(r.requestId)) all.push(r)
  return withEffectiveStates(all, expiryOf(state, ctx))
}

/** A unit's own target for the cycle's year (no department, cost center or leader). */
const unitTarget = (ctx: ActionContext, unit: string, fy: FiscalYear): TargetRow | null =>
  ctx.env
    .targets(fy)
    .find((t) => t.businessUnit === unit && !t.department && !t.costCenter && !t.leaderPositionId) ?? null

/**
 * The room each unit's target leaves the cycle's ranked asks (cycle.ts `roomOf`), as Requests >
 * Cycle shows it: target heads − (the unit's asks at the target date − the ranked heads), over every
 * request in force; null for a unit with no target. The lock's default line reads it (D-CYCLE).
 */
export function cycleRooms(
  state: PlanState,
  ctx: ActionContext,
  cycle: Cycle,
  ranked: ReadonlyMap<string, readonly RankedAsk[]>,
): Map<string, number | null> {
  const out = new Map<string, number | null>()
  const requests = inForce(state, ctx)
  const actx = ctx.env.asks
  for (const [unit, asks] of ranked) {
    const t = unitTarget(ctx, unit, cycle.fiscalYear)
    if (!t) {
      out.set(unit, null)
      continue
    }
    const org: OrgMatch = (place) => place.businessUnit === unit
    const all = asksAt(org, targetDateOf(t), requests, actx)
    out.set(unit, roomOf(t.targetHeads, all.heads, asks))
  }
  return out
}

/**
 * Why a limited Leader's cut line is past the envelope (10.3, 8.3 "Within the envelope.", review
 * SP-7), or null: the heads above it are more than the room the unit's target leaves, or than the
 * room a sub-org target the leader holds leaves the asks in its org.
 */
function envelopeRefusal(
  state: PlanState,
  ctx: ActionContext,
  cycle: Cycle,
  unit: string,
  afterHeads: number,
): string | null {
  const ranked = ctx.env.rankedAsks(cycle.cycleId)
  const asks = ranked.get(unit) ?? []
  const line = cutLine(asks, afterHeads)
  const how = decisionOf(ctx, 'cycle.cut-line').how ?? 'Within the envelope.'
  const refusal = (above: number, room: number) =>
    `${how} This line puts ${above} ${above === 1 ? 'head' : 'heads'} above it, and the target leaves room for ${Math.max(0, room)}.`
  const room = cycleRooms(state, ctx, cycle, new Map([[unit, asks]])).get(unit) ?? null
  if (room != null && line.headsAbove > room) return refusal(line.headsAbove, room)
  // A sub-org target the leader holds: the asks above the line in the leader's org against its room.
  const up = ancestorsOf(ctx.datasets.positions)
  const requests = inForce(state, ctx)
  const byId = new Map(requests.map((r) => [r.requestId, r]))
  for (const t of ctx.env.targets(cycle.fiscalYear)) {
    if (!t.leaderPositionId || !ctx.rules.leaderSeats.has(t.leaderPositionId) || t.businessUnit !== unit)
      continue
    const leader = t.leaderPositionId
    const inOrg = (r: HcRequest): boolean => {
      const at =
        r.type === 'New role' || r.type === 'Trade'
          ? r.managerPositionId
          : (r.positionId ?? r.managerPositionId)
      return !!at && (at === leader || up(at).includes(leader))
    }
    const org: OrgMatch = (place) => {
      const at = place.positionId ?? place.managerPositionId
      return !!at && (at === leader || up(at).includes(leader))
    }
    const mine = asks.filter((a) => {
      const r = byId.get(a.requestId)
      return !!r && inOrg(r)
    })
    const subRoom = roomOf(t.targetHeads, asksAt(org, targetDateOf(t), requests, ctx.env.asks).heads, mine)
    const aboveIds = new Set(line.above)
    const subAbove = mine.filter((a) => aboveIds.has(a.requestId)).reduce((n, a) => n + a.heads, 0)
    if (subRoom != null && subAbove > subRoom) return refusal(subAbove, subRoom)
  }
  return null
}

/** The units with ranked asks in the cycle, and those units' top leader seats (see the module comment). */
function finishers(ctx: ActionContext, cycleId: string): { units: string[]; leaderOrgs: string[] } {
  const units = [...ctx.env.rankedAsks(cycleId).keys()].sort()
  const latest = latestRows(ctx.datasets.positions)
  const leaderOrgs: string[] = []
  for (const [id, r] of latest) {
    if (!units.includes(r.businessUnit) || r.status === 'Eliminated') continue
    const leader = r.leaderLevel === true || (r.leaderLevel !== false && isLeaderLevel(r.level))
    if (!leader) continue
    const m = r.managerPositionId ? latest.get(r.managerPositionId) : null
    if (!m || m.businessUnit !== r.businessUnit) leaderOrgs.push(id)
  }
  return { units, leaderOrgs: leaderOrgs.sort() }
}

/* ───────────── the actions ───────────── */

/** `cycle.open`: a cycle for a fiscal year, Open for asks. */
export function openCycle(state: PlanState, ctx: ActionContext, input: OpenCycleInput): ActionResult {
  const g = gate(ctx, 'cycle.open')
  if (g) return no(g)
  const current = state.cycles.filter((c) => c.fiscalYear === input.fiscalYear).at(-1) ?? null
  const out = step(state, ctx, current, {
    kind: 'open',
    cycleId: ctx.env.ids.cycle(input.fiscalYear),
    fiscalYear: input.fiscalYear,
    dates: input.dates,
  })
  if ('refused' in out) return no(out.refused)
  return ok(out.state, out.audit, cycleOpenedNotice(input.fiscalYear))
}

/** `cycle.dates`: the cycle's due dates. */
export function setCycleDates(state: PlanState, ctx: ActionContext, input: CycleDatesInput): ActionResult {
  const g = gate(ctx, 'cycle.dates')
  if (g) return no(g)
  const cycle = cycleOfId(state, input.cycleId)
  if (!cycle) return no(NOT_FOUND_TEXT)
  const out = step(state, ctx, cycle, { kind: 'dates', dates: input.dates })
  if ('refused' in out) return no(out.refused)
  return ok(out.state, out.audit, CYCLE_DATES_NOTICE)
}

/** `cycle.advance`: HRBP review finished for a unit, Leader review for an org, or Finance moves the stage on. */
export function finishStage(state: PlanState, ctx: ActionContext, input: FinishStageInput): ActionResult {
  const g = gate(ctx, 'cycle.advance')
  if (g) return no(g)
  const cycle = cycleOfId(state, input.cycleId)
  if (!cycle) return no(NOT_FOUND_TEXT)
  if (isLimited(ctx, 'cycle.advance')) {
    if (input.businessUnit && !ctx.rules.hrbpUnits.has(input.businessUnit)) return no(OUTSIDE_UNIT_TEXT)
    if (input.leaderPositionId && !ctx.rules.leaderSeats.has(input.leaderPositionId))
      return no(OUTSIDE_SCOPE_TEXT)
    if (!input.businessUnit && !input.leaderPositionId) return no(OUTSIDE_SCOPE_TEXT)
  }
  const action: CycleAction = input.businessUnit
    ? { kind: 'advance', businessUnit: input.businessUnit }
    : input.leaderPositionId
      ? { kind: 'advance', leaderPositionId: input.leaderPositionId }
      : { kind: 'advance' }
  const out = step(state, ctx, cycle, action)
  if ('refused' in out) return no(out.refused)
  let next = out.state
  let done = out.cycle
  const audit = [...out.audit]
  const parts: string[] = []
  if (input.businessUnit) parts.push(hrbpReviewDoneNotice(input.businessUnit))
  else if (input.leaderPositionId) parts.push(LEADER_REVIEW_DONE_NOTICE)
  // The stage moves on in the same action when every unit (or leader org) has finished.
  if (input.businessUnit || input.leaderPositionId) {
    const f = finishers(ctx, cycle.cycleId)
    if (stageDone(done, f.units, f.leaderOrgs)) {
      const stage = CYCLE_STAGES[CYCLE_STAGES.indexOf(done.stage) + 1]
      audit.push(auditOf(ctx, 'cycle', done.cycleId, 'stage', done.stage, stage))
      done = { ...done, stage }
      next = putCycle(next, done)
    }
  }
  if (done.stage !== cycle.stage) parts.push(stageMovedNotice(done.stage))
  return ok(next, audit, parts.join(' ') || stageMovedNotice(done.stage))
}

/** `cycle.rank`: the ranked order of a unit's asks, or a manager's own priorities. */
export function rankCycleAsks(state: PlanState, ctx: ActionContext, input: RankAsksInput): ActionResult {
  const g = gate(ctx, 'cycle.rank')
  if (g) return no(g)
  const cycle = cycleOfId(state, input.cycleId)
  if (!cycle) return no(NOT_FOUND_TEXT)
  if (cycle.stage === 'Locked') return no(`The ${cycle.fiscalYear} cycle is locked.`)
  const asks: HcRequest[] = []
  for (const id of input.requestIds) {
    const r = findRequest(state, ctx, id)
    if (!r || r.cycleId !== cycle.cycleId || ctx.rules.requestView(r) === 'none') return no(NOT_FOUND_TEXT)
    asks.push(r)
  }
  const me = ctx.actor.personId
  // A manager ranks only its own asks, by each one's priority.
  if (ctx.mode === 'manager') {
    if (asks.some((r) => r.requesterId !== me)) return no(OUTSIDE_SCOPE_TEXT)
    const audit: AuditDraft[] = []
    const changed: HcRequest[] = []
    asks.forEach((r, i) => {
      const priority = i + 1
      if (r.priority === priority) return
      audit.push(auditOf(ctx, 'request', r.requestId, 'priority', r.priority, priority))
      changed.push({ ...r, priority, updatedAt: businessAt(ctx) })
    })
    return ok(putRequests(state, changed), audit, RANKING_SAVED_NOTICE)
  }
  const unit = input.businessUnit ?? asks[0]?.businessUnit
  if (!unit) return no(NOT_FOUND_TEXT)
  if (asks.some((r) => r.businessUnit !== unit)) return no(OUTSIDE_UNIT_TEXT)
  if (ctx.mode === 'hrbp' && !ctx.rules.hrbpUnits.has(unit)) return no(OUTSIDE_UNIT_TEXT)
  if (isLimited(ctx, 'cycle.rank') && asks.some((r) => !inScope(ctx, r))) return no(OUTSIDE_SCOPE_TEXT)
  const prev = cycle.order?.find((o) => o.businessUnit === unit)?.requestIds ?? null
  const order: CycleOrder = { businessUnit: unit, requestIds: [...input.requestIds] }
  const next: Cycle = {
    ...cycle,
    order: [...(cycle.order ?? []).filter((o) => o.businessUnit !== unit), order],
  }
  const audit = [auditOf(ctx, 'cycle', cycle.cycleId, `order ${unit}`, prev, order.requestIds)]
  return ok(putCycle(state, next), audit, RANKING_SAVED_NOTICE)
}

/** `cycle.cut-line`: a unit's cut line moved. */
export function moveCutLine(state: PlanState, ctx: ActionContext, input: CutLineInput): ActionResult {
  const g = gate(ctx, 'cycle.cut-line')
  if (g) return no(g)
  const cycle = cycleOfId(state, input.cycleId)
  if (!cycle) return no(NOT_FOUND_TEXT)
  if (ctx.mode === 'hrbp' && !ctx.rules.hrbpUnits.has(input.businessUnit)) return no(OUTSIDE_UNIT_TEXT)
  if (isLimited(ctx, 'cycle.cut-line')) {
    if (!ctx.rules.unitInScope(input.businessUnit)) return no(OUTSIDE_SCOPE_TEXT)
    // A leader adjusts within the envelope (10.3, review SP-7).
    if (cycle.stage !== 'Locked' && Number.isInteger(input.afterHeads) && input.afterHeads >= 0) {
      const past = envelopeRefusal(state, ctx, cycle, input.businessUnit, input.afterHeads)
      if (past) return no(past)
    }
  }
  const out = step(state, ctx, cycle, {
    kind: 'cut',
    businessUnit: input.businessUnit,
    afterHeads: input.afterHeads,
  })
  if ('refused' in out) return no(out.refused)
  return ok(out.state, out.audit, CUT_LINE_NOTICE)
}

/**
 * `cycle.lock`: the cycle locked and every ranked ask decided by the cut line the tab shows (the
 * stored mark, else the default from the room the unit's target leaves; D-CYCLE). Refused while any
 * ask in the cycle still waits on its manager step (`lockWaitingText`); a Sent back ask is not ranked
 * and stays with its requester.
 */
export function lockCycle(state: PlanState, ctx: ActionContext, input: CycleRef): ActionResult {
  const g = gate(ctx, 'cycle.lock')
  if (g) return no(g)
  const cycle = cycleOfId(state, input.cycleId)
  if (!cycle) return no(NOT_FOUND_TEXT)
  const asks = ctx.env.rankedAsks(cycle.cycleId)
  const out = step(state, ctx, cycle, { kind: 'lock' })
  if ('refused' in out) return no(out.refused)
  const waiting = waitingOnManager(inForce(state, ctx), cycle.cycleId)
  if (waiting.requestIds.length)
    return no(lockWaitingText(cycle.fiscalYear, waiting.requestIds.length, waiting.managerIds.length))
  const { approved, rejected } = lockOutcomes(out.cycle, asks, cycleRooms(state, ctx, cycle, asks))
  let next = out.state
  const audit = [...out.audit]
  const decided: HcRequest[] = []
  for (const [ids, aboveCut] of [
    [approved, true],
    [rejected, false],
  ] as const) {
    for (const id of ids) {
      const req = findRequest(state, ctx, id)
      if (!req || !isPendingState(req) || req.state === 'Sent back') continue
      const t = transition(
        req,
        { kind: 'cycle-lock', aboveCut },
        ctx.actor,
        businessAt(ctx),
        ctx.env.transitionContext(req),
        ctx.at,
      )
      if ('refused' in t) return no(t.refused)
      decided.push(t.request)
      next = applyEffects(next, t.effects)
      audit.push(...t.audit)
    }
  }
  next = putRequests(next, decided)
  const fy = cycle.fiscalYear
  const nApproved = decided.filter((r) => r.state !== 'Rejected').length
  return ok(next, audit, cycleLockedNotice(fy, nApproved, decided.length - nApproved))
}

/** `cycle.return`: back to an earlier stage (the finished lists from that stage on are cleared). */
export function returnCycle(state: PlanState, ctx: ActionContext, input: ReturnCycleInput): ActionResult {
  const g = gate(ctx, 'cycle.return')
  if (g) return no(g)
  const cycle = cycleOfId(state, input.cycleId)
  if (!cycle) return no(NOT_FOUND_TEXT)
  const out = step(state, ctx, cycle, { kind: 'return', to: input.to })
  if ('refused' in out) return no(out.refused)
  return ok(out.state, out.audit, cycleReturnedNotice(input.to))
}
