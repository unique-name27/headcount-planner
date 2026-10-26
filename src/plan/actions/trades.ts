/**
 * Headcount trades (docs/PLAN.md 8.3 `request.trade`, 11.2 to 11.6): give tradable seats (Open with
 * no accepted offer, Planned or On hold, Employee, in scope, in no other pending request) and,
 * optionally, the giving org's trade credit, for seats of another type whose weights add up to no
 * more. Pure.
 *
 * - Checks `request.trade` first (Manager and Leader limited: inside the team or org; hidden for
 *   Finance: "Finance approves trades; it does not start them.").
 * - Quotes the ask with `env.quote` (the plan of record's locked rates for the year; Working's for a
 *   year with none, flagged "Rates can change until FY28 locks"); a quote that is not ok refuses with
 *   its first block's text (FILLED_NOT_TRADED_TEXT, ACCEPTED_OFFER_TEXT, "Bengaluru seats are full
 *   time only.", the not-enough sentence, ...). Credit used is checked against the giving org's own
 *   balance only (`credit-over-balance`, trade.ts `creditBalance`, derived and never stored). A trade
 *   that gives only credit names its giving org: the requester's own seat in Manager mode, the org
 *   picked in step 1 in other modes (`giveOrgPositionId`).
 * - Saves a Trade Draft with the quote's fields stored (11.4: givePositionIds, giveOrgPositionId,
 *   creditUsedBp, count, restFte, rateVersion, rateHash, giveBp, getBp, creditBp); submit, re-quote at
 *   each approval and `applyTrade` go through ./requests.ts and the requests engine. A frozen get
 *   org needs `freezeException` (it adds a Finance step); its reason is refused with an amount.
 * - Nothing on the request or in the notice is an amount: weights are basis points of a standard head.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the body.
 */
import { REASON_CODES_OF, type ReasonCode } from '@/data/schema'
import type { TradeAsk } from '../engine/trade'
import type { HcRequest, PlanState, TradeFields } from '../types'
import {
  CYCLE_NOT_OPEN_TEXT,
  NOT_FOUND_TEXT,
  OUTSIDE_SCOPE_TEXT,
  REASON_CODE_TEXT,
  tradeDraftNotice,
} from './copy'
import { freeTextRefusal, gate, isLimited } from './gate'
import {
  draftAudit,
  freezeOfRequest,
  heldSeatRefusal,
  newRequest,
  no,
  ok,
  putRequest,
  quoteFields,
  quoteRefusal,
  workingFor,
} from './shared'
import type { ActionContext, ActionResult } from './types'

export interface TradeInput {
  /** What is given and wanted (trade.ts `TradeAsk`), `creditUsedBp` included; `count: 'max'` takes the most seats. */
  ask: TradeAsk
  /** REASON_CODES_OF.Trade: Cost-neutral mix, Location strategy, Level mix, Other. */
  reasonCode: ReasonCode
  jobTitle?: string | null
  cycleId?: string | null
  priority?: number | null
}

/** The request fields a trade's ask sets: the get seats' org, type and start, and the quote's fields. */
export type TradeRequestFields = Pick<
  HcRequest,
  | 'managerPositionId'
  | 'businessUnit'
  | 'department'
  | 'costCenter'
  | 'level'
  | 'location'
  | 'fte'
  | 'startDate'
> & { trade: TradeFields }

/**
 * An ask checked and quoted as the trade form does: the giving org of a credit-only trade (the
 * requester's own seat in Manager mode), the limited scope rule, the freeze exception's reason, no
 * give seat an approved internal move holds (review SC-6), then the quote (`env.quote`; with
 * `requestId`, a draft re-quoted leaves itself out of the pending ones). The fields to store and the
 * exception that names the freeze, or the refusal. Shared by `tradeDraft` and editing a trade draft
 * from Mine (./requests.ts `editRequest`, CONTRACTS-M3 7.4.3).
 */
export function tradeFieldsOf(
  ctx: ActionContext,
  ask: TradeAsk,
  prev: TradeFields | null = null,
  requestId?: string,
):
  | { fields: TradeRequestFields; exception: { freezeId: string; reason: string } | null }
  | { refused: string } {
  // A trade that gives only credit names its giving org: the requester's own seat in Manager mode.
  let a = ask
  if (!a.give.length && !a.giveOrgPositionId && ctx.mode === 'manager') {
    const own = [...ctx.rules.ownSeats][0]
    if (own) a = { ...a, giveOrgPositionId: own }
  }
  if (isLimited(ctx, 'request.trade')) {
    if (!ctx.rules.placeInScope(a.get.orgPositionId)) return { refused: OUTSIDE_SCOPE_TEXT }
    if (a.give.some((id) => !ctx.rules.seatInScope(id))) return { refused: OUTSIDE_SCOPE_TEXT }
  }
  for (const id of a.give) {
    const held = heldSeatRefusal(ctx, id)
    if (held) return { refused: held }
  }
  if (a.freezeException) {
    const why = freeTextRefusal(ctx, a.freezeException.reason, true)
    if (why) return { refused: why }
  }
  const q = ctx.env.quote(a, requestId)
  const why = quoteRefusal(q)
  if (why) return { refused: why }
  const place = workingFor(ctx).placeOf(a.get.orgPositionId, a.get.location)
  if (!place) return { refused: NOT_FOUND_TEXT }
  const fields: TradeRequestFields = {
    managerPositionId: a.get.orgPositionId,
    businessUnit: place.businessUnit,
    department: place.department,
    costCenter: place.costCenter,
    level: a.get.level,
    location: a.get.location,
    fte: a.get.fte,
    startDate: a.get.start,
    trade: quoteFields(a, q, prev),
  }
  // A frozen get org needs the exception (the quote checked it); the exception names the freeze.
  let exception: { freezeId: string; reason: string } | null = null
  if (a.freezeException) {
    const f = freezeOfRequest(ctx, { ...fields, type: 'Trade', positionId: null })
    if (f) exception = { freezeId: f.freezeId, reason: a.freezeException.reason.trim() }
  }
  return { fields, exception }
}

/**
 * A Trade draft for an ask, quoted (`env.quote`): the request, or the refusal. Shared with What if's
 * "Turn into requests" (./whatif.ts), so a lever's trade is checked and stored as this form's is.
 */
export function tradeDraft(
  ctx: ActionContext,
  ask: TradeAsk,
  over: Partial<HcRequest> & Pick<HcRequest, 'reasonCode'>,
  n = 1,
): { req: HcRequest } | { refused: string } {
  const made = tradeFieldsOf(ctx, ask)
  if ('refused' in made) return made
  const base = newRequest(ctx, { ...over, type: 'Trade', ...made.fields }, n)
  return { req: made.exception ? { ...base, exception: made.exception } : base }
}

/** `request.trade`: a Trade Draft with its quote stored. */
export function createTrade(state: PlanState, ctx: ActionContext, input: TradeInput): ActionResult {
  const g = gate(ctx, 'request.trade')
  if (g) return no(g)
  if (!REASON_CODES_OF.Trade.includes(input.reasonCode)) return no(REASON_CODE_TEXT)
  // A job title is read by the manager and every approver (8.4 rule 5 at entry).
  const title = freeTextRefusal(ctx, input.jobTitle ?? '')
  if (title) return no(title)
  if (input.cycleId) {
    const c = state.cycles.find((x) => x.cycleId === input.cycleId)
    if (!c) return no(NOT_FOUND_TEXT)
    if (c.stage !== 'Open for asks') return no(CYCLE_NOT_OPEN_TEXT)
  }
  const made = tradeDraft(ctx, input.ask, {
    reasonCode: input.reasonCode,
    jobTitle: input.jobTitle ?? null,
    cycleId: input.cycleId ?? null,
    priority: input.priority ?? null,
  })
  if ('refused' in made) return no(made.refused)
  return ok(putRequest(state, made.req), [draftAudit(ctx, made.req)], tradeDraftNotice(made.req.requestId))
}
