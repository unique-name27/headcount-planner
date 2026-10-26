/**
 * Request actions (docs/PLAN.md 8.3 Actions, 8.4, 10.1 to 10.4, 15.1 R5 to R7, C23, C24): drafts of
 * every type but Transfer and Trade (./transfers.ts, ./trades.ts), edits of a draft, submit (and
 * submit on behalf), withdraw, the four decisions, comments and freeze exceptions. Each runs
 * ./gate.ts `gate` first, then the person-level rules (a request whose `rules.requestView` is 'none'
 * is refused with NOT_FOUND_TEXT, as an unknown ID is, and never counted: review SC-13), then the
 * requests engine (`transition`, with `env.transitionContext(req)`), and returns the next plan
 * state: the request written into `state.requests` (an imported request is copied in, replacing the
 * row by `requestId`), approval effects into `state.overlay` (position rows, and target rows for
 * "Move budget too?"), and the engine's audit drafts in order. Pure.
 *
 * Which id each checks (ACTION_CHECKS in ./index.ts):
 *  - createRequest, editRequest, requestElimination: `request.draft` (Manager and Leader limited:
 *    the seat, or the new seat's manager position, inside the team or org: OUTSIDE_SCOPE_TEXT);
 *  - requestRecruiting `request.recruit`, proposeStart `request.propose-start` (same limited rule);
 *  - submitRequest `request.submit` (a Draft, or a Sent back request again); submitOnBehalf
 *    `request.submit-on-behalf` (records both the requester and the submitter, 10.2);
 *  - withdrawRequest `request.withdraw` (the requester's or the submitter's own);
 *  - approveRequest `request.approve`, sendBack `request.send-back`, rejectRequest `request.reject`:
 *    limited "Only on steps assigned to you." (the engine's NOT_YOUR_STEP_TEXT); on a Transfer each
 *    also checks `transfer.approve`;
 *  - approveWithChanges `request.approve-with-changes` (the HRBP step only; Leader limited "Within
 *    your envelope.");
 *  - commentOnRequest `request.comment` (a comment with an amount is Approvers only, AMOUNT_COMMENT_NOTE
 *    in the notice);
 *  - setFreezeException `freeze.exception` (on a draft in a frozen org: the business reason refused
 *    at entry when it holds an amount, REMOVE_AMOUNT_TEXT; it adds a Finance step at submit).
 *
 * M3 review fixes (core-flow):
 *  - Dates (15.1 R47): every business date a request stores is ./shared.ts `businessAt` (the as-of
 *    date with the wall clock's time of day); the audit entries' own time stays `ctx.at`.
 *  - Expiry (D-EXPIRY): an expired request is refused edits, submits, comments and decisions, but
 *    its requester may withdraw it (a comment would make it pending again: review recheck).
 *  - A trade is re-quoted at every approval step (11.4): when the bp fields move, the step records
 *    "Rates changed: ..." in standard heads (11.2), and a trade that no longer fits is refused with
 *    the approver's sentence. Approve with changes re-quotes every trade at its changed count and
 *    start (review SP-10).
 *  - A cross-unit trade's final approval moves the two units' targets ("Move target too?", 11.4, on
 *    by default, `ApproveInput.moveTarget`), with 'target' audit entries (review SP-5).
 *  - A cycle ask takes its unit HRBP's changes during HRBP review (`approveWithChanges` on an ask
 *    with no step waiting: the engine's 'cycle-changes'); the lock approves it with them (D-CYCLE).
 *  - A seat an approved internal move holds is refused every request (review SC-6).
 *  - `importedApproval`: an approval a file brings, applied here through the requests engine
 *    (`replayApproval`) with its "Move budget too?" and "Move target too?" target changes (D-MERGE).
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the bodies.
 */
import { fiscalYearOf } from '@/data/fiscal'
import {
  type FiscalYear,
  type ISODate,
  type Level,
  type PositionRow,
  REASON_CODES_OF,
  type ReasonCode,
  type TargetRow,
} from '@/data/schema'
import {
  CYCLE_CHANGES_TEXT,
  currentStepIndex,
  type RequestAction,
  replayApproval,
  transition,
} from '../engine/requests'
import { targetFor } from '../engine/targets'
import {
  movesTarget,
  standardHeadsApart,
  type TradeAsk,
  type TradeFieldsWithTarget,
  type TradeQuote,
  tradeTargetMove,
  tradeYearOf,
} from '../engine/trade'
import { budgetMoveEffects, targetChangeEffects, targetKey } from '../engine/transfer'
import { workingOf } from '../engine/versions'
import type {
  AuditDraft,
  ChangeSet,
  CommentAudience,
  HcRequest,
  PlanEffect,
  PlanState,
  SeatPlace,
  TradeFields,
  TransferFields,
} from '../types'
import {
  ACCEPTED_OFFER_TEXT,
  AMOUNT_COMMENT_NOTE,
  approvedNotice,
  approvedWithChangesNotice,
  COMMENT_NOTICE,
  CYCLE_NOT_OPEN_TEXT,
  draftSavedNotice,
  draftUpdatedNotice,
  FTE_RANGE_TEXT,
  freezeExceptionNotice,
  LIMITED_REQUEST_TEXT,
  NO_REQUEST_CHANGE_TEXT,
  NOT_EDITABLE_REQUEST_TEXT,
  NOT_FOUND_TEXT,
  OUTSIDE_UNIT_TEXT,
  REASON_CODE_TEXT,
  rejectedNotice,
  sentBackNotice,
  submittedForNotice,
  submittedNotice,
  USE_TYPE_ACTION_TEXT,
  withdrawnNotice,
} from './copy'
import { freeTextRefusal, gate, isLimited } from './gate'
import {
  ancestorsOf,
  applyEffects,
  askOf,
  auditOf,
  businessAt,
  businessDate,
  cycleOf,
  draftAudit,
  expiredRefusal,
  findRequest,
  freezeRefusal,
  heldSeatRefusal,
  isApprovedState,
  newRequest,
  no,
  ok,
  putRequest,
  quoteFields,
  quoteRefusal,
  requestYear,
  scopeRefusal,
  seenRefusal,
  tradeFieldAudit,
  workingFor,
} from './shared'
import { tradeFieldsOf } from './trades'
import type { ActionContext, ActionResult, ActionSeat } from './types'

/* ───────────── words the core-flow fixes added (plain, no amount; the copy rules hold) ───────────── */

/** A cycle ask's HRBP changes are stored for the lock (10.3, D-CYCLE). */
export const cycleChangesNotice = (requestId: string): string =>
  `Changes saved on ${requestId}. It is approved with them if it is above the cut line at lock. The requester sees each change with your reason.`

/**
 * The step note when a re-quote at an approval step moves a trade's weights (11.2): standard heads
 * only, such as "Rates changed: credit 0.07 to 0.20 standard heads."
 */
export function ratesChangedNote(before: TradeFields, after: TradeFields): string | null {
  const parts: string[] = []
  const add = (label: string, a: number | null, b: number | null) => {
    if (a == null || b == null || a === b) return
    const [x, y] = standardHeadsApart(a, b)
    parts.push(`${label} ${x} to ${y}`)
  }
  add('give', before.giveBp, after.giveBp)
  add('get', before.getBp, after.getBp)
  add('credit', before.creditBp, after.creditBp)
  if (!parts.length) return null
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
  return `Rates changed: ${list} standard heads.`
}

/** A re-quote at an approval step that no longer balances (11.2): the approver's sentence. */
export const noLongerFitsText = (year: string): string =>
  `${year} rates changed and this trade no longer fits. Send it back to the requester.`

/** What every draft may carry besides its type's own fields. */
export interface DraftCommon {
  reasonCode: ReasonCode
  /** A ranked ask in a cycle (10.3): the cycle and the requester's own rank, 1 first. */
  cycleId?: string | null
  priority?: number | null
  /** An Elimination or other change the people in the touched seat must not see (8.4 rule 3). */
  confidential?: boolean
  jobTitle?: string | null
}

/**
 * A draft of one of the four plain types (Requests > New). Start recruiting, Start date and
 * Elimination have their own actions, Transfer and Trade their own modules; createRequest refuses
 * them with USE_TYPE_ACTION_TEXT.
 */
export type RequestDraft = DraftCommon &
  (
    | {
        type: 'New role'
        /** The seat the new role reports to. */
        managerPositionId: string
        level: Level
        location: string
        fte: number
        startDate: ISODate | null
        jobFamily?: string | null
      }
    | { type: 'Backfill'; positionId: string; startDate: ISODate | null }
    | { type: 'Level change'; positionId: string; level: Level; startDate: ISODate | null }
    | { type: 'Location change'; positionId: string; location: string; startDate: ISODate | null }
  )

export type CreateRequestInput = RequestDraft

/** The fields of a Draft or Sent back request its requester may change. */
export interface RequestPatch {
  reasonCode?: ReasonCode
  positionId?: string | null
  managerPositionId?: string
  level?: Level | null
  location?: string | null
  jobTitle?: string | null
  fte?: number | null
  startDate?: ISODate | null
  priority?: number | null
  cycleId?: string | null
  confidential?: boolean
  /** A trade draft's new ask: re-quoted (`env.quote`) and its quote fields stored again. */
  ask?: TradeAsk
  /** A transfer draft's fields. */
  transfer?: Partial<TransferFields>
}

export interface EditRequestInput {
  requestId: string
  patch: RequestPatch
}

export interface EliminationInput extends Pick<DraftCommon, 'reasonCode' | 'confidential'> {
  positionId: string
  /** The seat's last day, inclusive (endDate); its Eliminated row starts the next day. Null: the approval date. */
  lastDay: ISODate | null
}

/** Start recruiting (R5): a Planned seat, one HRBP step; approval writes the HRBP's audited Working edit. */
export interface RecruitInput {
  positionId: string
  reasonCode: ReasonCode
}

/** Start date (R5): an Open seat with no accepted offer, or a Planned seat; one HRBP step. */
export interface ProposeStartInput {
  positionId: string
  startDate: ISODate
  reasonCode: ReasonCode
}

export interface RequestRef {
  requestId: string
}

/** `approveRequest`'s input: the request, and at a cross-unit trade's last step Finance's "Move target too?". */
export interface ApproveInput extends RequestRef {
  /**
   * A cross-unit trade's "Move target too?" (11.4): on by default; false leaves both units' targets
   * as they are. Read only when the step approves the trade for good.
   */
  moveTarget?: boolean
}

export interface SubmitOnBehalfInput {
  requestId: string
  /** The manager the request is for: the requester from now on; the Acting as HRBP is the submitter. */
  requesterId: string
}

export interface ApproveWithChangesInput {
  requestId: string
  /** level, location, FTE or start (a trade: count, which only goes down, and start); `old` is filled in. */
  changes: ChangeSet['changes']
  /** Required; refused at entry with an amount (8.4 rule 5). Managers see each change with it. */
  reason: string
}

export interface ReasonInput {
  requestId: string
  /** Required; refused at entry with an amount (8.4 rule 5). */
  reason: string
}

export interface CommentInput {
  requestId: string
  text: string
  /** Forced to 'approvers' when the text holds an amount (8.4 rule 5). */
  audience: CommentAudience
}

export interface FreezeExceptionInput {
  requestId: string
  freezeId: string
  /** The business reason; required; refused at entry with an amount. */
  reason: string
}

/* ───────────── helpers ───────────── */

/** The plain types createRequest makes; the others have their own action. */
const PLAIN_TYPES: ReadonlySet<string> = new Set(['New role', 'Backfill', 'Level change', 'Location change'])

/** Types refused at draft on a seat with an accepted offer (10.1, C23); an Elimination is allowed. */
const NOT_ON_ACCEPTED_OFFER: ReadonlySet<string> = new Set([
  'Level change',
  'Location change',
  'Start date',
  'Start recruiting',
])

const reasonRefusal = (type: HcRequest['type'], code: ReasonCode): string | null =>
  REASON_CODES_OF[type]?.includes(code) ? null : REASON_CODE_TEXT

/** A ranked ask goes into a cycle that is open for asks (10.3). */
function askRefusal(state: PlanState, cycleId: string | null | undefined): string | null {
  if (!cycleId) return null
  const c = state.cycles.find((x) => x.cycleId === cycleId)
  if (!c) return NOT_FOUND_TEXT
  return c.stage === 'Open for asks' ? null : CYCLE_NOT_OPEN_TEXT
}

/** The org fields a request on an existing seat takes from it. */
const seatFields = (seat: ActionSeat): Partial<HcRequest> => ({
  positionId: seat.positionId,
  managerPositionId: seat.managerPositionId ?? '',
  businessUnit: seat.businessUnit,
  department: seat.department,
  costCenter: seat.costCenter,
  level: seat.level,
  location: seat.location,
  fte: seat.fte,
})

type DraftId = 'request.draft' | 'request.recruit' | 'request.propose-start'

/** Saves a new draft: the gate's limited rule, then one audit entry (state, null to Draft). */
function saveDraft(state: PlanState, ctx: ActionContext, id: DraftId, req: HcRequest): ActionResult {
  if (isLimited(ctx, id)) {
    const out = scopeRefusal(ctx, req)
    if (out) return no(out)
  }
  const cyc = askRefusal(state, req.cycleId)
  if (cyc) return no(cyc)
  return ok(putRequest(state, req), [draftAudit(ctx, req)], draftSavedNotice(req.requestId))
}

/** A seat the request names, with the checks on it (unknown, eliminated, an accepted offer). */
function namedSeat(
  ctx: ActionContext,
  positionId: string,
  type: HcRequest['type'],
): { seat: ActionSeat } | { refused: string } {
  const seat = ctx.env.seat(positionId)
  if (!seat) return { refused: NOT_FOUND_TEXT }
  if (seat.status === 'Eliminated') return { refused: 'This seat is already eliminated.' }
  if (seat.acceptedOffer && NOT_ON_ACCEPTED_OFFER.has(type)) return { refused: ACCEPTED_OFFER_TEXT }
  // A receiving seat an approved internal move holds is not offered for any request (review SC-6).
  const held = heldSeatRefusal(ctx, positionId)
  if (held) return { refused: held }
  return { seat }
}

/**
 * A trade re-quoted at submit and at each approval step (11.4: the quote's fields are stored at
 * submit and re-stored at each approval), the request leaving itself out of the pending ones (its own
 * give seats and credit). The request with the fields, their audit drafts and the quote; or the
 * quote's first block. At an approval step (`atStep`), a re-quote that moves the bp fields gives the
 * "Rates changed" note (11.2), which the step and the audit entries carry, and a trade that no longer
 * fits is refused with the approver's sentence. Other types pass through.
 */
function requoted(
  ctx: ActionContext,
  req: HcRequest,
  atStep = false,
):
  | { req: HcRequest; audit: AuditDraft[]; quote: TradeQuote | null; note: string | null }
  | { refused: string } {
  if (req.type !== 'Trade') return { req, audit: [], quote: null, note: null }
  const ask = askOf(req)
  if (!ask) return { refused: 'Get a quote first: this trade has no seats to get yet.' }
  const q = ctx.env.quote(ask, req.requestId)
  const why = quoteRefusal(q)
  if (why) {
    // Weights move only on a Working version's rates (no lock hash): then "not enough" means the
    // year's rates changed under the trade, which the approver is told in their own words.
    const short = q.blocks[0]?.code === 'not-enough' && q.rates.lockHash == null
    const year = tradeYearOf(req)
    return { refused: atStep && short && year ? noLongerFitsText(year) : why }
  }
  const fields: TradeFields = { ...quoteFields(ask, q, req.trade), ...keptTarget(req.trade) }
  const note = atStep && req.trade ? ratesChangedNote(req.trade, fields) : null
  const audit = tradeFieldAudit(ctx, req, fields).map((a) => (note ? { ...a, comment: note } : a))
  return { req: { ...req, trade: fields }, audit, quote: q, note }
}

/** A trade's stored "Move target too?" choice, kept across a re-quote. */
const keptTarget = (t: TradeFields | null): Partial<TradeFieldsWithTarget> => {
  const v = (t as TradeFieldsWithTarget | null)?.moveTarget
  return v === undefined ? {} : { moveTarget: v }
}

/** Runs one transition of the requests engine and writes what it returns. */
function run(
  state: PlanState,
  ctx: ActionContext,
  req: HcRequest,
  action: RequestAction,
  notice: (after: HcRequest) => string,
  before: AuditDraft[] = [],
  contextReq: HcRequest = req,
  opts: { moveTarget?: boolean; quote?: TradeQuote | null } = {},
): ActionResult {
  const tctx = ctx.env.transitionContext(contextReq)
  const out = transition(req, action, ctx.actor, businessAt(ctx), tctx, ctx.at)
  if ('refused' in out) return no(out.refused)
  let request = out.request
  const audit = [...before, ...out.audit]
  const extra: PlanEffect[] = []
  const finallyApproved = !isApprovedState(req) && isApprovedState(out.request)
  // "Move budget too?" on a Transfer's final approval moves both orgs' targets (10.5).
  if (req.type === 'Transfer' && finallyApproved) {
    const moved = budgetMove(state, ctx, out.request)
    extra.push(...moved.effects)
    audit.push(...moved.audit)
  }
  // "Move target too?" on a cross-unit trade's final approval (11.4, on by default; review SP-5).
  if (req.type === 'Trade' && finallyApproved && request.trade) {
    const on = opts.moveTarget ?? movesTarget(request.trade)
    const moved = on ? tradeTargetEffects(state, ctx, request, opts.quote ?? null) : null
    if (moved) {
      request = { ...request, trade: { ...request.trade, moveTarget: true } as TradeFieldsWithTarget }
      extra.push(...moved.effects)
      audit.push(...moved.audit)
    } else if (!on && crossUnit(ctx, request)) {
      request = { ...request, trade: { ...request.trade, moveTarget: false } as TradeFieldsWithTarget }
    }
  }
  const next = applyEffects(applyEffects(putRequest(state, request), out.effects), extra)
  return ok(next, audit, notice(request))
}

/** The units a trade gives from and gets into: the give seats' unit (else the giving org's) and the request's. */
function tradeUnits(ctx: ActionContext, req: HcRequest): { from: string | null; to: string } {
  const t = req.trade
  const fromSeat = t?.givePositionIds.map((id) => ctx.env.seat(id)?.businessUnit).find((u) => !!u)
  const fromOrg = t?.giveOrgPositionId ? ctx.env.seat(t.giveOrgPositionId)?.businessUnit : null
  return { from: fromSeat ?? fromOrg ?? null, to: req.businessUnit }
}

const crossUnit = (ctx: ActionContext, req: HcRequest): boolean => {
  const u = tradeUnits(ctx, req)
  return u.from != null && u.from !== u.to
}

/** A unit's own target for a fiscal year (no department, cost center or leader). */
const unitTargetOf = (ctx: ActionContext, unit: string, fy: FiscalYear): TargetRow | null =>
  ctx.env
    .targets(fy)
    .find((t) => t.businessUnit === unit && !t.department && !t.costCenter && !t.leaderPositionId) ?? null

/**
 * "Move target too?" for a cross-unit trade (11.4): the giving unit's target loses the given seats
 * that are approved heads and their in-year band estimate, the receiving unit's gains the seats
 * received and theirs (trade.ts `tradeTargetMove`), as target rows with 'target' audit entries.
 * Null when the trade stays in one unit, or a unit has no target for the trade's year.
 */
function tradeTargetEffects(
  state: PlanState,
  ctx: ActionContext,
  req: HcRequest,
  quote: TradeQuote | null,
): { effects: PlanEffect[]; audit: AuditDraft[] } | null {
  const fy = tradeYearOf(req)
  const units = tradeUnits(ctx, req)
  if (!fy || !units.from || units.from === units.to) return null
  const fromTarget = unitTargetOf(ctx, units.from, fy)
  const toTarget = unitTargetOf(ctx, units.to, fy)
  if (!fromTarget || !toTarget) return null
  const ask = askOf(req)
  const q = quote ?? (ask ? ctx.env.quote(ask, req.requestId) : null)
  if (!q?.ok) return null
  const moved = tradeTargetMove({
    fromTarget,
    toTarget,
    quote: q,
    fiscalYear: fy,
    proration: workingOf(state.versions, fy)?.proration ?? 'daily',
    firstOpenMonth: ctx.env.asks.firstOpenMonth,
  })
  return targetChangeEffects(
    [
      [fromTarget, moved.from],
      [toTarget, moved.to],
    ],
    ctx.actor,
    ctx.at,
    businessDate(ctx),
  )
}

/**
 * "Move budget too?" (10.5): both orgs' targets, the nearest at or above each side with a target for
 * the fiscal year, shift by one head and the seat's in-year band estimate (never its HRIS cost).
 * Nothing when the transfer did not ask for it, or both sides are one target row.
 */
function budgetMove(
  state: PlanState,
  ctx: ActionContext,
  req: HcRequest,
): ReturnType<typeof budgetMoveEffects> {
  const none = { effects: [], audit: [] }
  const t = req.transfer
  if (!t?.moveBudget) return none
  const fy = fiscalYearOf(t.effectiveDate || businessDate(ctx))
  const from = ctx.env.seat(t.fromPositionId)
  if (!from) return none
  const working = workingFor(ctx, fy)
  const fromPlace: SeatPlace = {
    positionId: t.fromPositionId,
    managerPositionId: from.managerPositionId,
    businessUnit: from.businessUnit,
    department: from.department,
    costCenter: from.costCenter,
  }
  let toPlace: SeatPlace | null = null
  if (t.kind === 'position' && t.toManagerPositionId) {
    const at = working.placeOf(t.toManagerPositionId, from.location)
    if (at)
      toPlace = {
        positionId: null,
        managerPositionId: t.toManagerPositionId,
        businessUnit: at.businessUnit,
        department: at.department,
        costCenter: at.costCenter,
      }
  } else if (t.toPositionId) {
    const to = ctx.env.seat(t.toPositionId)
    if (to)
      toPlace = {
        positionId: t.toPositionId,
        managerPositionId: to.managerPositionId,
        businessUnit: to.businessUnit,
        department: to.department,
        costCenter: to.costCenter,
      }
  }
  if (!toPlace) return none
  const targets = ctx.env.targets(fy)
  const up = ancestorsOf(ctx.datasets.positions)
  const fromTarget = targetFor(fromPlace, targets, fy, up)
  const toTarget = targetFor(toPlace, targets, fy, up)
  if (!fromTarget || !toTarget || targetKey(fromTarget) === targetKey(toTarget)) return none
  const proration = workingOf(state.versions, fy)?.proration ?? 'daily'
  return budgetMoveEffects(
    {
      req,
      fromTarget,
      toTarget,
      seatBandUsd: ctx.env.seatBandUsd(t.fromPositionId, fy) ?? 0,
      fiscalYear: fy,
      proration,
    },
    ctx.actor,
    ctx.at,
  )
}

/** The request an action names, seen by the viewer, or the refusal. */
function requestFor(
  state: PlanState,
  ctx: ActionContext,
  requestId: string,
): { req: HcRequest } | { refused: string } {
  const req = findRequest(state, ctx, requestId)
  const seen = seenRefusal(ctx, req)
  if (seen || !req) return { refused: seen ?? NOT_FOUND_TEXT }
  return { req }
}

/** The requester's own (or the submitter's) Draft or Sent back request, not expired. */
function ownEditable(state: PlanState, ctx: ActionContext, req: HcRequest): string | null {
  const me = ctx.actor.personId
  const mine = req.requesterId === me || req.submittedById === me
  if (!mine || (req.state !== 'Draft' && req.state !== 'Sent back')) return NOT_EDITABLE_REQUEST_TEXT
  return expiredRefusal(ctx, state, req)
}

/* ───────────── drafts ───────────── */

/** `request.draft`: a new Draft of a plain type; the Acting as person is the requester. */
export function createRequest(state: PlanState, ctx: ActionContext, input: CreateRequestInput): ActionResult {
  const g = gate(ctx, 'request.draft')
  if (g) return no(g)
  if (!PLAIN_TYPES.has(input.type)) return no(USE_TYPE_ACTION_TEXT)
  const why = reasonRefusal(input.type, input.reasonCode)
  if (why) return no(why)
  // A job title is read by the manager and every approver (8.4 rule 5 at entry).
  const title = freeTextRefusal(ctx, input.jobTitle ?? '')
  if (title) return no(title)
  const common: Partial<HcRequest> = {
    cycleId: input.cycleId ?? null,
    priority: input.priority ?? null,
    confidential: input.confidential ?? false,
  }
  let req: HcRequest
  if (input.type === 'New role') {
    const place = workingFor(ctx).placeOf(input.managerPositionId, input.location)
    if (!place) return no(NOT_FOUND_TEXT)
    if (!(input.fte > 0 && input.fte <= 1)) return no(FTE_RANGE_TEXT)
    req = newRequest(ctx, {
      ...common,
      type: 'New role',
      reasonCode: input.reasonCode,
      managerPositionId: input.managerPositionId,
      businessUnit: place.businessUnit,
      department: place.department,
      costCenter: place.costCenter,
      level: input.level,
      location: input.location,
      fte: input.fte,
      startDate: input.startDate,
      jobTitle: input.jobTitle ?? null,
    })
  } else {
    const named = namedSeat(ctx, input.positionId, input.type)
    if ('refused' in named) return no(named.refused)
    const own: Partial<HcRequest> =
      input.type === 'Level change'
        ? { level: input.level }
        : input.type === 'Location change'
          ? { location: input.location }
          : {}
    req = newRequest(ctx, {
      ...common,
      ...seatFields(named.seat),
      ...own,
      type: input.type,
      reasonCode: input.reasonCode,
      startDate: input.startDate,
      jobTitle: input.jobTitle ?? null,
    })
  }
  return saveDraft(state, ctx, 'request.draft', req)
}

/** The fields of a patch, in the order they are written and audited. */
const PATCH_FIELDS = [
  'reasonCode',
  'positionId',
  'managerPositionId',
  'level',
  'location',
  'jobTitle',
  'fte',
  'startDate',
  'priority',
  'cycleId',
  'confidential',
] as const

/** `request.draft`: the requester changes their own Draft or Sent back request (NOT_EDITABLE_REQUEST_TEXT otherwise). */
export function editRequest(state: PlanState, ctx: ActionContext, input: EditRequestInput): ActionResult {
  const g = gate(ctx, 'request.draft')
  if (g) return no(g)
  const found = requestFor(state, ctx, input.requestId)
  if ('refused' in found) return no(found.refused)
  const req = found.req
  const not = ownEditable(state, ctx, req)
  if (not) return no(not)
  const p = input.patch
  if (p.reasonCode !== undefined) {
    const why = reasonRefusal(req.type, p.reasonCode)
    if (why) return no(why)
  }
  if (p.jobTitle) {
    const title = freeTextRefusal(ctx, p.jobTitle)
    if (title) return no(title)
  }
  let next: HcRequest = { ...req }
  const audit: AuditDraft[] = []
  for (const f of PATCH_FIELDS) {
    const v = p[f]
    if (v === undefined || (next[f] ?? null) === (v ?? null)) continue
    audit.push(auditOf(ctx, 'request', req.requestId, f, next[f] ?? null, v ?? null))
    next = { ...next, [f]: v } as HcRequest
  }
  // A new seat's org follows its manager position; a changed seat's, the seat.
  if (p.managerPositionId !== undefined && req.type === 'New role') {
    const place = workingFor(ctx).placeOf(next.managerPositionId, next.location ?? '')
    if (!place) return no(NOT_FOUND_TEXT)
    next = {
      ...next,
      businessUnit: place.businessUnit,
      department: place.department,
      costCenter: place.costCenter,
    }
  }
  if (p.positionId != null && p.positionId !== req.positionId) {
    const named = namedSeat(ctx, p.positionId, req.type)
    if ('refused' in named) return no(named.refused)
    const s = named.seat
    next = {
      ...next,
      managerPositionId: s.managerPositionId ?? '',
      businessUnit: s.businessUnit,
      department: s.department,
      costCenter: s.costCenter,
    }
  }
  if (p.transfer && next.transfer) {
    const merged: TransferFields = { ...next.transfer, ...p.transfer }
    for (const k of Object.keys(p.transfer) as (keyof TransferFields)[])
      if (next.transfer[k] !== merged[k])
        audit.push(auditOf(ctx, 'request', req.requestId, k, next.transfer[k] ?? null, merged[k] ?? null))
    next = { ...next, transfer: merged, startDate: merged.effectiveDate || next.startDate }
  }
  if (p.ask) {
    // A trade draft edited from Mine (CONTRACTS-M3 7.4.3): re-quoted and stored as the trade form's
    // draft is (./trades.ts `tradeFieldsOf`), each field it moves audited.
    if (req.type !== 'Trade') return no(USE_TYPE_ACTION_TEXT)
    const made = tradeFieldsOf(ctx, p.ask, req.trade, req.requestId)
    if ('refused' in made) return no(made.refused)
    for (const f of TRADE_REQUEST_FIELDS) {
      const v = made.fields[f]
      if ((next[f] ?? null) !== (v ?? null))
        audit.push(auditOf(ctx, 'request', req.requestId, f, next[f] ?? null, v ?? null))
    }
    audit.push(...tradeFieldAudit(ctx, req, made.fields.trade))
    if (made.exception && made.exception.freezeId !== (next.exception?.freezeId ?? null))
      audit.push(
        auditOf(
          ctx,
          'request',
          req.requestId,
          'exception',
          next.exception?.freezeId ?? null,
          made.exception.freezeId,
          {
            comment: made.exception.reason,
          },
        ),
      )
    next = { ...next, ...made.fields, ...(made.exception ? { exception: made.exception } : {}) }
  }
  if (!audit.length) return no(NO_REQUEST_CHANGE_TEXT)
  if (isLimited(ctx, 'request.draft')) {
    const out = scopeRefusal(ctx, next)
    if (out) return no(out)
  }
  const cyc = p.cycleId !== undefined ? askRefusal(state, next.cycleId) : null
  if (cyc) return no(cyc)
  next = { ...next, updatedAt: businessAt(ctx) }
  return ok(putRequest(state, next), audit, draftUpdatedNotice(req.requestId))
}

/** The request fields a trade's ask sets (the get seats' org, type and start), audited when an edit moves them. */
const TRADE_REQUEST_FIELDS = [
  'managerPositionId',
  'businessUnit',
  'department',
  'costCenter',
  'level',
  'location',
  'fte',
  'startDate',
] as const

/** `request.draft`: an Elimination draft (allowed on an accepted-offer seat, C23; a Filled seat books severance on approval). */
export function requestElimination(
  state: PlanState,
  ctx: ActionContext,
  input: EliminationInput,
): ActionResult {
  const g = gate(ctx, 'request.draft')
  if (g) return no(g)
  const why = reasonRefusal('Elimination', input.reasonCode)
  if (why) return no(why)
  const named = namedSeat(ctx, input.positionId, 'Elimination')
  if ('refused' in named) return no(named.refused)
  const req = newRequest(ctx, {
    ...seatFields(named.seat),
    type: 'Elimination',
    reasonCode: input.reasonCode,
    startDate: input.lastDay,
    confidential: input.confidential ?? false,
  })
  return saveDraft(state, ctx, 'request.draft', req)
}

/** `request.recruit`: a Start recruiting draft on a Planned seat. */
export function requestRecruiting(state: PlanState, ctx: ActionContext, input: RecruitInput): ActionResult {
  const g = gate(ctx, 'request.recruit')
  if (g) return no(g)
  const why = reasonRefusal('Start recruiting', input.reasonCode)
  if (why) return no(why)
  const named = namedSeat(ctx, input.positionId, 'Start recruiting')
  if ('refused' in named) return no(named.refused)
  if (named.seat.status !== 'Planned') return no('Start recruiting is for Planned seats.')
  const req = newRequest(ctx, {
    ...seatFields(named.seat),
    type: 'Start recruiting',
    reasonCode: input.reasonCode,
    startDate: named.seat.startDate,
  })
  return saveDraft(state, ctx, 'request.recruit', req)
}

/** `request.propose-start`: a Start date draft (ACCEPTED_OFFER_TEXT on a seat with an accepted offer). */
export function proposeStart(state: PlanState, ctx: ActionContext, input: ProposeStartInput): ActionResult {
  const g = gate(ctx, 'request.propose-start')
  if (g) return no(g)
  const why = reasonRefusal('Start date', input.reasonCode)
  if (why) return no(why)
  const named = namedSeat(ctx, input.positionId, 'Start date')
  if ('refused' in named) return no(named.refused)
  if (named.seat.status !== 'Open' && named.seat.status !== 'Planned')
    return no('Start dates move only Open and Planned seats.')
  const req = newRequest(ctx, {
    ...seatFields(named.seat),
    type: 'Start date',
    reasonCode: input.reasonCode,
    startDate: input.startDate,
  })
  return saveDraft(state, ctx, 'request.propose-start', req)
}

/* ───────────── submit and withdraw ───────────── */

/** What every submit checks before the engine: scope, expiry, the cycle, a trade's quote and freezes. */
function beforeSubmit(
  state: PlanState,
  ctx: ActionContext,
  id: 'request.submit' | 'request.submit-on-behalf',
  req: HcRequest,
): { req: HcRequest; audit: AuditDraft[] } | { refused: string } {
  if (isLimited(ctx, id)) {
    const out = scopeRefusal(ctx, req)
    if (out) return { refused: out }
  }
  const exp = expiredRefusal(ctx, state, req)
  if (exp) return { refused: exp }
  const c = cycleOf(state, req)
  if (req.cycleId && !c) return { refused: NOT_FOUND_TEXT }
  if (c && req.state === 'Draft' && c.stage !== 'Open for asks') return { refused: CYCLE_NOT_OPEN_TEXT }
  const q = requoted(ctx, req)
  if ('refused' in q) return q
  const frozen = freezeRefusal(ctx, q.req)
  if (frozen) return { refused: frozen }
  return q
}

/** `request.submit`: a Draft submitted, or a Sent back request submitted again; the chain is stored on it. */
export function submitRequest(state: PlanState, ctx: ActionContext, input: RequestRef): ActionResult {
  const g = gate(ctx, 'request.submit')
  if (g) return no(g)
  const found = requestFor(state, ctx, input.requestId)
  if ('refused' in found) return no(found.refused)
  const pre = beforeSubmit(state, ctx, 'request.submit', found.req)
  if ('refused' in pre) return no(pre.refused)
  const action: RequestAction =
    pre.req.state === 'Sent back' ? { kind: 'resubmit' } : { kind: 'submit', onBehalfOf: null }
  return run(state, ctx, pre.req, action, (r) => submittedNotice(r.requestId), pre.audit)
}

/** `request.submit-on-behalf`: an HRBP submits for a manager (requester and submitter both recorded). */
export function submitOnBehalf(
  state: PlanState,
  ctx: ActionContext,
  input: SubmitOnBehalfInput,
): ActionResult {
  const g = gate(ctx, 'request.submit-on-behalf')
  if (g) return no(g)
  const found = requestFor(state, ctx, input.requestId)
  if ('refused' in found) return no(found.refused)
  const req = found.req
  if (req.state !== 'Draft') return no('Only a draft can be submitted.')
  const manager = ctx.datasets.workers.find((w) => w.employeeId === input.requesterId)
  if (!manager) return no(NOT_FOUND_TEXT)
  const pre = beforeSubmit(state, ctx, 'request.submit-on-behalf', req)
  if ('refused' in pre) return no(pre.refused)
  // Routing reads the request as the manager's: rule 8 leaves out what 8.4 rule 3 hides from them.
  const asTheirs: HcRequest = { ...pre.req, requesterId: input.requesterId }
  const audit = [...pre.audit]
  if (input.requesterId !== req.requesterId)
    audit.push(auditOf(ctx, 'request', req.requestId, 'requesterId', req.requesterId, input.requesterId))
  return run(
    state,
    ctx,
    pre.req,
    { kind: 'submit', onBehalfOf: input.requesterId },
    (r) => submittedForNotice(r.requestId, manager.name ?? input.requesterId),
    audit,
    asTheirs,
  )
}

/**
 * `request.withdraw`: the requester withdraws an open request. An expired one too: it is not pending,
 * and withdrawing it is how its requester clears it (D-EXPIRY).
 */
export function withdrawRequest(state: PlanState, ctx: ActionContext, input: RequestRef): ActionResult {
  const g = gate(ctx, 'request.withdraw')
  if (g) return no(g)
  const found = requestFor(state, ctx, input.requestId)
  if ('refused' in found) return no(found.refused)
  const req = found.req
  if (isLimited(ctx, 'request.withdraw')) {
    const out = scopeRefusal(ctx, req)
    if (out) return no(out)
  }
  return run(state, ctx, req, { kind: 'withdraw' }, (r) => withdrawnNotice(r.requestId))
}

/* ───────────── decisions ───────────── */

type DecisionId = 'request.approve' | 'request.send-back' | 'request.reject' | 'request.approve-with-changes'

/** The gate for a decision: its own id, and `transfer.approve` on a Transfer. */
function decisionGate(
  state: PlanState,
  ctx: ActionContext,
  id: DecisionId,
  requestId: string,
): { req: HcRequest } | { refused: string } {
  const g = gate(ctx, id)
  if (g) return { refused: g }
  const found = requestFor(state, ctx, requestId)
  if ('refused' in found) return found
  if (found.req.type === 'Transfer' && id !== 'request.approve-with-changes') {
    const t = gate(ctx, 'transfer.approve')
    if (t) return { refused: t }
  }
  return found
}

/**
 * `request.approve` (`transfer.approve` on a Transfer): the Acting as person's waiting step; the last
 * one applies the request. A trade is re-quoted at the step (11.4): "Rates changed" when its weights
 * moved (11.2), the approver's sentence when it no longer fits; a cross-unit trade's last step moves
 * both units' targets unless `moveTarget` is false (11.4).
 */
export function approveRequest(state: PlanState, ctx: ActionContext, input: ApproveInput): ActionResult {
  const found = decisionGate(state, ctx, 'request.approve', input.requestId)
  if ('refused' in found) return no(found.refused)
  const q = requoted(ctx, found.req, true)
  if ('refused' in q) return no(q.refused)
  return run(
    state,
    ctx,
    q.req,
    { kind: 'approve', note: q.note },
    (r) => approvedNotice(r.requestId, isApprovedState(r)),
    q.audit,
    q.req,
    { quote: q.quote, ...(input.moveTarget !== undefined ? { moveTarget: input.moveTarget } : {}) },
  )
}

/**
 * `request.approve-with-changes`: the HRBP step approves with changed level, location, FTE or start
 * (a trade: a lower count and a new start, re-quoted, review SP-10). On a cycle ask with no step
 * waiting (its manager approved it), the unit's HRBP (or HR admin) stores the changes during HRBP
 * review and the lock approves it with them (10.3, D-CYCLE, review SC-9, SP-6).
 */
export function approveWithChanges(
  state: PlanState,
  ctx: ActionContext,
  input: ApproveWithChangesInput,
): ActionResult {
  const found = decisionGate(state, ctx, 'request.approve-with-changes', input.requestId)
  if ('refused' in found) return no(found.refused)
  const reason = freeTextRefusal(ctx, input.reason, true)
  if (reason) return no(reason)
  if (!input.changes.length) return no(NO_REQUEST_CHANGE_TEXT)
  const req = found.req
  const cycle = cycleOf(state, req)
  const cycleAsk = !!cycle && cycle.stage !== 'Locked' && currentStepIndex(req) < 0
  if (cycleAsk) {
    if (cycle.stage !== 'HRBP review') return no(CYCLE_CHANGES_TEXT)
    const unitHrbp =
      ctx.mode === 'hr-admin' || (ctx.mode === 'hrbp' && ctx.rules.hrbpUnits.has(req.businessUnit))
    if (!unitHrbp) return no(OUTSIDE_UNIT_TEXT)
  }
  // Every trade is re-quoted with its changed count and start (11.4): the quote's first block refuses
  // (a start in a closed month, a frozen org), and its weights and credit are what is stored.
  let fields: TradeFields | undefined
  if (req.type === 'Trade') {
    const ask = askOf(req)
    if (!ask) return no('Get a quote first: this trade has no seats to get yet.')
    const count = input.changes.find((c) => c.field === 'count')?.new
    const start = input.changes.find((c) => c.field === 'startDate')?.new
    const changed: TradeAsk = {
      ...ask,
      get: {
        ...ask.get,
        ...(count != null ? { count: Number(count) } : {}),
        ...(start != null ? { start: String(start) } : {}),
      },
    }
    if (count != null && Number(count) > (req.trade?.count ?? 0))
      return no("A trade's count can only go down.")
    const q = ctx.env.quote(changed, req.requestId)
    const why = quoteRefusal(q)
    if (why) return no(why)
    fields = { ...quoteFields(changed, q, req.trade), ...keptTarget(req.trade) }
  }
  const action: RequestAction = cycleAsk
    ? {
        kind: 'cycle-changes',
        changes: input.changes,
        reason: input.reason,
        ...(fields ? { requoted: fields } : {}),
      }
    : {
        kind: 'approve-with-changes',
        changes: input.changes,
        reason: input.reason,
        ...(fields ? { requoted: fields } : {}),
      }
  return run(state, ctx, req, action, (r) =>
    cycleAsk ? cycleChangesNotice(r.requestId) : approvedWithChangesNotice(r.requestId),
  )
}

/** `request.send-back` (`transfer.approve` on a Transfer): back to the requester with a reason. */
export function sendBack(state: PlanState, ctx: ActionContext, input: ReasonInput): ActionResult {
  const found = decisionGate(state, ctx, 'request.send-back', input.requestId)
  if ('refused' in found) return no(found.refused)
  const reason = freeTextRefusal(ctx, input.reason, true)
  if (reason) return no(reason)
  return run(state, ctx, found.req, { kind: 'send-back', reason: input.reason }, (r) =>
    sentBackNotice(r.requestId),
  )
}

/** `request.reject` (`transfer.approve` on a Transfer): rejected with a reason. */
export function rejectRequest(state: PlanState, ctx: ActionContext, input: ReasonInput): ActionResult {
  const found = decisionGate(state, ctx, 'request.reject', input.requestId)
  if ('refused' in found) return no(found.refused)
  const reason = freeTextRefusal(ctx, input.reason, true)
  if (reason) return no(reason)
  return run(state, ctx, found.req, { kind: 'reject', reason: input.reason }, (r) =>
    rejectedNotice(r.requestId),
  )
}

/* ───────────── comments and freeze exceptions ───────────── */

/** `request.comment`: a comment on a request the viewer sees in full. */
export function commentOnRequest(state: PlanState, ctx: ActionContext, input: CommentInput): ActionResult {
  const g = gate(ctx, 'request.comment')
  if (g) return no(g)
  const req = findRequest(state, ctx, input.requestId)
  const seen = seenRefusal(ctx, req)
  if (seen || !req) return no(seen ?? NOT_FOUND_TEXT)
  if (ctx.rules.requestView(req) === 'limited') return no(LIMITED_REQUEST_TEXT)
  // An expired request stays expired (D-EXPIRY): a comment would move its updatedAt and make it
  // pending again, holding a seat and a credit another request may have taken since.
  const expired = expiredRefusal(ctx, state, req)
  if (expired) return no(expired)
  const forced = ctx.rules.hasAmount(input.text)
  const audience: CommentAudience = forced ? 'approvers' : input.audience
  return run(state, ctx, req, { kind: 'comment', text: input.text, audience }, () =>
    forced ? `${COMMENT_NOTICE} ${AMOUNT_COMMENT_NOTE}` : COMMENT_NOTICE,
  )
}

/** `freeze.exception`: a draft in a frozen org gets a freeze exception and its business reason. */
export function setFreezeException(
  state: PlanState,
  ctx: ActionContext,
  input: FreezeExceptionInput,
): ActionResult {
  const g = gate(ctx, 'freeze.exception')
  if (g) return no(g)
  const found = requestFor(state, ctx, input.requestId)
  if ('refused' in found) return no(found.refused)
  const req = found.req
  const not = ownEditable(state, ctx, req)
  if (not) return no(not)
  if (isLimited(ctx, 'freeze.exception')) {
    const out = scopeRefusal(ctx, req)
    if (out) return no(out)
  }
  const reason = freeTextRefusal(ctx, input.reason, true)
  if (reason) return no(reason)
  const freeze = ctx.datasets.freezes.find((f) => f.freezeId === input.freezeId)
  if (!freeze) return no(NOT_FOUND_TEXT)
  const text = input.reason.trim()
  const next: HcRequest = {
    ...req,
    exception: { freezeId: freeze.freezeId, reason: text },
    updatedAt: businessAt(ctx),
  }
  const audit = [
    auditOf(ctx, 'request', req.requestId, 'exception', req.exception?.freezeId ?? null, freeze.freezeId, {
      comment: text,
    }),
  ]
  return ok(putRequest(state, next), audit, freezeExceptionNotice(req.requestId))
}

/* ───────────── an approval an imported file brings (lead decision D-MERGE) ───────────── */

/** What applying the approvals an imported file brings did: the next state, its audit, what applied and the conflicts. */
export interface ImportedApprovals {
  next: PlanState
  audit: AuditDraft[]
  /** The requests whose effects were applied here, in order. */
  applied: string[]
  /** The requests whose effects cannot apply here, each with the sentence that names why; nothing of them changed. */
  conflicts: { requestId: string; text: string }[]
}

/**
 * The approvals an imported file brings (Import requests, Merge; lead decision D-MERGE), applied in
 * this workspace through the same engine as a local approval (requests.ts `replayApproval`), in order
 * and idempotently: a request whose rows Working holds already, or that is not approved, applies
 * nothing; one whose effects cannot apply here is a conflict and changes nothing. Each applies as of
 * its approval date, its seats taking the file's created IDs; a Transfer's "Move budget too?" and a
 * cross-unit trade's "Move target too?" (as the approving workspace stored it, else on) move the
 * targets here too. Every audit entry is the importer's (10.7), with `commentOf(req)` (the caller
 * names the approver and the file); each applied request writes its own entry (object 'request',
 * field 'state', as the engine's own approvals do) before its seats' entries, at the same `at`, so
 * the seats' entries belong to it wherever the log is read (M3 recheck, PV-5). The caller
 * (src/plan/actions/workspace.ts) decides which requests to pass, writes the merged requests and
 * keeps a conflict's own copy.
 */
export function importedApprovals(
  state: PlanState,
  ctx: ActionContext,
  reqs: readonly HcRequest[],
  commentOf: (req: HcRequest) => string | null = () => null,
): ImportedApprovals {
  let next = state
  const audit: AuditDraft[] = []
  const applied: string[] = []
  const conflicts: { requestId: string; text: string }[] = []
  // Rows applied earlier in the same import, so a later request sees them (one seat ended twice).
  const added: PositionRow[] = []
  for (const req of reqs) {
    const working = workingFor(ctx, requestYear(req, ctx.asOf))
    const plan = added.length ? { ...working, positions: [...working.positions, ...added] } : working
    const comment = commentOf(req)
    const replay = replayApproval(req, plan, { auditAt: ctx.at, comment })
    if (replay.kind === 'none') continue
    if (replay.kind === 'conflict') {
      conflicts.push({ requestId: req.requestId, text: replay.text })
      continue
    }
    const withNote = (a: AuditDraft): AuditDraft => (comment ? { ...a, comment } : a)
    const effects: PlanEffect[] = [...replay.effects]
    const entries = [...replay.audit]
    if (req.type === 'Transfer' && req.transfer?.moveBudget) {
      const moved = budgetMove(state, ctx, req)
      effects.push(...moved.effects)
      entries.push(...moved.audit.map(withNote))
    }
    if (req.type === 'Trade' && movesTarget(req.trade)) {
      const moved = tradeTargetEffects(state, ctx, req, null)
      if (moved) {
        effects.push(...moved.effects)
        entries.push(...moved.audit.map(withNote))
      }
    }
    next = applyEffects(next, effects)
    for (const e of replay.effects) if (e.kind === 'position') added.push(e.change.row)
    // The request's own entry first, at the same `at` as the seat entries (M3 recheck, PV-5): the
    // Audit page and an opened file link the position entries to the request through it, so a
    // viewer who sees the request limited (or not at all) reads them as the request allows.
    const before = ctx.env.requests.find((r) => r.requestId === req.requestId)?.state ?? null
    const own = auditOf(ctx, 'request', req.requestId, 'state', before, req.state, { comment })
    audit.push(own, ...entries)
    applied.push(req.requestId)
  }
  return { next, audit, applied, conflicts }
}
