/**
 * One request as Requests > Mine and Approvals open it (docs/PLAN.md 8.4, 9.4, 10.1, 10.2, 11.5, 7.6):
 * its facts, the chain stored on it (every viewer reads the same chain), each step with its decision
 * and note, the changes an HRBP approved with and their reason ("Changed by your HRBP: start moved
 * from Jan to Mar"), the comments the viewer may read, a trade's card in weights, the freeze it would
 * need an exception for, and what the viewer may do on it now (submit, withdraw, the freeze
 * exception, a comment, and the four decisions on a step assigned to them). Approvals add the band
 * estimate and the target org's gap after approval outside Manager mode (./gapAfter.ts); Manager
 * mode shows heads, the allocation after approval and the status after approval instead (7.6).
 *
 * Every text a manager can read passes 8.4: a limited view (rule 2) keeps only the position ID,
 * title, level and org (no person, reason, date, note or comment); comments pass `commentVisible`;
 * every note, reason and comment passes `managerText` (Manager mode reads "an amount"). In Manager
 * mode no field names an amount (the band estimate and the gap are left out, not set to null), so a
 * crawl of the model finds no amount-like key. Pure.
 *
 * Readings taken here (requests-ui, M3):
 *  - "May do now" follows the policy (the action's ids not hidden) and the request's state and steps;
 *    the action applies its own rule again when it runs (scope, expiry, the step being yours).
 *  - Approve with changes changes the level, location, FTE or start of most types, a trade's count
 *    and start, an Elimination's last day and a Start date's start; it is offered on the HRBP step
 *    only, and never on a transfer, a Start recruiting or a limited view.
 *  - The allocation after approval (Manager mode) adds the request's head effect for a New role or a
 *    trade and takes it off for an Elimination (the allocation reads approved adds and eliminations,
 *    R2b); the status after approval is the budget status with that allocation and the request no
 *    longer pending. An approved Level or Location change on a Filled seat moves the staffed months
 *    from its effective month by its band change (R32 prices staffed people at their seat's current
 *    Working level and location); the allocation keeps it out (R2).
 *  - Each request reads in its effective state (./base.ts, D-EXPIRY): an expired one is Expired, is
 *    not edited or submitted again, and its requester may withdraw it.
 *  - Dates read as business dates (R47): a step or comment stored with a date after the as-of date
 *    reads on the as-of date.
 *  - The job title reads through `titleFor` (Manager mode: "an amount" for each amount, 8.4 rule 5).
 *  - A seat with an accepted offer is never changed by a Start date, Level change, Location change,
 *    Start recruiting or Trade (C23): the card offers no approval for one, says why, and leaves send
 *    back and reject (an Elimination is still approved).
 *  - A freeze exception imported with no business reason shows as one with the reason missing.
 *  - A trade whose count an HRBP changed reads the credit before and after ("8 seats to 6, credit
 *    0.11 to 0.56 standard heads", 11.4): the stored weights after the change, with the seats before
 *    it at the same weight each.
 *  - A cycle ask in HRBP review, its manager's step decided, may be approved with changes by its
 *    unit's HRBP on the Cycle tab (`cycle` option): the change set is stored with its reason and the
 *    ask stays in the ranking; the lock makes it Approved with changes (SC-9).
 *  - The requester's own trade draft may be changed from Mine: the get seats' level, location, FTE,
 *    start and count, sent as the trade's new ask (`editPatchOf`, `editRequest` re-quotes it).
 */
import { FREE_TEXT_HINT } from '@/access/copy'
import { commentVisible, hasAmount, managerText } from '@/access/visibility'
import { tradeQuoteOf } from '@/app/write/quote'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf } from '@/data/fiscal'
import { type ISODate, LEVELS, SITES } from '@/data/schema'
import { titleFor } from '@/drill/requestRecord'
import { seatStateOf } from '@/drill/seats'
import { dateOf, formatDate, formatMonthShort, onAsOf } from '@/lib/dates'
import { fmt } from '@/lib/format'
import {
  ACCEPTED_OFFER_TEXT,
  AMOUNT_COMMENT_NOTE,
  REASON_REQUIRED_TEXT,
  REMOVE_AMOUNT_TEXT,
  type RequestPatch,
} from '@/plan/actions'
import { askOf, inTreeOf, placeOfRequest } from '@/plan/actions/shared'
import { budgetStatus, type PendingEffect, type StaffedMonth } from '@/plan/engine/budgetStatus'
import { freezeNotice, freezeOn } from '@/plan/engine/freeze'
import { movesTarget, standardHeads, type TradeAsk } from '@/plan/engine/trade'
import type { ChangeableField, HcRequest, Step } from '@/plan/types'
import { teamFacts } from '@/views/team/engine/facts'
import { PARAM as TEAM_PARAM } from '@/views/team/metrics'
import { isPendingState, type Prep, ROLE_WORD, shownInFull } from './base'
import { type GapAfter, gapAfterOf } from './gapAfter'
import { chainSentence, type TradeQuoteCard } from './new'
import { bandEstimateOf } from './planYear'
import { quoteCard, seatGroups } from './quoteCard'

/** One approval step as the card lists it. */
export interface StepLine {
  n: number
  /** "Manager", "HRBP", "Leader", "Finance". */
  role: string
  /** The approver's name (full views only), or null. */
  approver: string | null
  /** "Approved", "Approved with changes", "Sent back", "Rejected", "Waiting", "To come". */
  status: string
  at: ISODate | null
  /** The note typed with the decision (through `managerText`), or null. */
  note: string | null
  /** Why the step was added, in words. */
  why: string | null
}

export interface CommentLine {
  id: string
  at: ISODate
  by: string
  /** "Everyone on the request" or "Approvers only". */
  audience: string
  text: string
}

/** A field approve with changes may change, with its value now. */
export interface ChangeField {
  field: ChangeableField
  label: string
  value: string | number | null
  /** The values a picker offers (levels, locations), or null for a free value. */
  options: readonly string[] | null
}

/** What the viewer may do on the request now. */
export interface RequestCan {
  submit: boolean
  withdraw: boolean
  exception: boolean
  comment: boolean
  approve: boolean
  approveWithChanges: boolean
  sendBack: boolean
  reject: boolean
}

export interface RequestCard {
  requestId: string
  view: 'full' | 'limited'
  type: HcRequest['type']
  state: HcRequest['state']
  /** "R-1038 New role, P3 Account Executive". */
  heading: string
  facts: readonly { label: string; value: string }[]
  /** "Goes to: your manager, your HRBP, your leader: over the leader threshold"; null on a draft or a limited view. */
  chain: string | null
  steps: readonly StepLine[]
  /** "Changed by your HRBP: start moved from Jan to Mar", with the reason; null when none. */
  changes: { text: string; reason: string } | null
  /** The send-back or reject reason and a freeze exception's business reason (full views only). */
  notes: readonly { label: string; text: string }[]
  comments: readonly CommentLine[]
  /** A trade's card in weights; its USD band estimates only where `cost:band` shows (the key is left out elsewhere). */
  trade: CardTrade | null
  /** A draft in a frozen org: the freeze its exception names, and the notice. */
  freeze: { freezeId: string; notice: string } | null
  can: RequestCan
  changeable: readonly ChangeField[]
  /** The requester's own Draft or Sent back request: the fields they may change before submitting (`editRequest`). */
  editable: readonly ChangeField[]
  /**
   * A trade draft the requester may change: its ask as stored (weights in basis points, seat IDs, no
   * amount), which `editPatchOf` sends again with the changed get seats; null otherwise.
   */
  editAsk: TradeAsk | null
  /**
   * A cross-unit trade at its last step: "Move target too?" (11.4, on by default; the approval sends
   * it as `moveTarget`), with the stored choice; null otherwise.
   */
  moveTarget: { on: boolean } | null
  /** FREE_TEXT_HINT, under every free-text box. */
  hint: string
  /** Approvals outside Manager mode: the annual band estimate (absent in Manager mode). */
  bandEstimateUsd?: number | null
  /**
   * Approvals outside Manager mode: the target org's gap after approval in heads, with its org key
   * (absent in Manager mode). Its cost is the org's row of `RequestsApprovals.gaps`, one figure per
   * target org, so every amount sits where the guard and the leak tests read it by org.
   */
  gapAfter?: CardGap | null
  /** Approvals in Manager mode: heads, the allocation after approval and the status after approval. */
  managerAfter?: { headsText: string; allocation: string | null; status: string | null } | null
}

/** A card's gap after approval: heads, the org and why its cost reads "—"; no amount. */
export type CardGap = Omit<GapAfter, 'cost'>

/* ───────────── pieces ───────────── */

const FIELD_LABEL: Readonly<Record<ChangeableField, string>> = {
  level: 'Level',
  location: 'Location',
  fte: 'FTE',
  startDate: 'Start',
  count: 'Seats',
}

/** "start moved from Jan to Mar", "level P3 to P4", "8 seats to 6". */
function changeWords(c: {
  field: ChangeableField
  old: string | number | null
  new: string | number | null
}): string {
  const v = (x: string | number | null) => (x == null || x === '' ? 'none' : String(x))
  switch (c.field) {
    case 'startDate': {
      const o = c.old ? String(c.old) : null
      const n = c.new ? String(c.new) : null
      const year = !!o && !!n && o.slice(0, 4) !== n.slice(0, 4)
      const m = (d: string | null) => (d ? formatMonthShort(d, year) : 'none')
      return `start moved from ${m(o)} to ${m(n)}`
    }
    case 'count':
      return `${v(c.old)} seats to ${v(c.new)}`
    case 'level':
      return `level ${v(c.old)} to ${v(c.new)}`
    case 'location':
      return `location ${v(c.old)} to ${v(c.new)}`
    case 'fte':
      return `FTE ${v(c.old)} to ${v(c.new)}`
  }
}

/**
 * A trade's credit before and after an HRBP changed it (11.4), in basis points: the pair the change
 * stored (`ChangeSet.credit`, core's approve with changes, review SC-16 and UI-6), which also covers a
 * start change whose re-quote moved the credit. A change made before the pair was stored derives it:
 * after is the stored credit; before, the same give weight less the seats before the change at the
 * stored weight each (the change re-quotes the get seats and nothing else). Null when the credit did
 * not move, or the count did not change and no pair was stored, or the weights are not stored.
 */
export function creditChangeOf(req: HcRequest): { old: number; new: number } | null {
  const t = req.trade
  const stored = t ? req.changes?.credit : undefined
  if (stored && stored.old != null && stored.new != null)
    return stored.old === stored.new ? null : { old: stored.old, new: stored.new }
  const c = req.changes?.changes.find((x) => x.field === 'count')
  if (!t || !c || t.getBp == null || t.creditBp == null || t.giveBp == null) return null
  const before = Number(c.old)
  const after = Number(c.new)
  if (!Number.isFinite(before) || !Number.isFinite(after) || after <= 0 || before === after) return null
  // Each get seat weighs the same (the rest seat at its FTE share): getBp = w × (count + rest).
  const units = after + (t.restFte ?? 0)
  const each = t.getBp / units
  const oldGet = Math.round(each * (before + (t.restFte ?? 0)))
  return { old: Math.max(0, t.giveBp - oldGet), new: t.creditBp }
}

/** The changes in words, a trade's count change with its credit ("8 seats to 6, credit 0.11 to 0.56 standard heads"). */
function changesText(req: HcRequest): string {
  const words = (req.changes?.changes ?? []).map(changeWords)
  const credit = creditChangeOf(req)
  if (credit) words.push(`credit ${standardHeads(credit.old)} to ${standardHeads(credit.new)} standard heads`)
  return words.join(', ')
}

/** The fields approve with changes offers for a request type (see the module comment). */
function changeFieldsOf(req: HcRequest): ChangeableField[] {
  switch (req.type) {
    case 'Trade':
      return ['count', 'startDate']
    case 'Transfer':
    case 'Start recruiting':
      return []
    case 'Elimination':
    case 'Start date':
    case 'Backfill':
      return ['startDate']
    default:
      return ['level', 'location', 'fte', 'startDate']
  }
}

function fieldValue(req: HcRequest, f: ChangeableField): string | number | null {
  switch (f) {
    case 'count':
      return req.trade?.count ?? null
    case 'level':
      return req.level
    case 'location':
      return req.location
    case 'fte':
      return req.fte
    case 'startDate':
      return req.startDate
  }
}

const stepStatus = (s: Step): string => s.decision ?? (s.enteredAt ? 'Waiting' : 'To come')

const WHY: Readonly<Record<string, string>> = {
  'cross-unit': 'crosses units',
  'band-estimate-over-threshold': 'over the leader threshold',
  'director-plus': 'Director or above',
  'out-of-plan': 'out of plan',
  'different-direct-reports': 'under different direct reports',
  'new-role': 'a new role',
  'freeze-exception': 'a freeze exception',
  'envelope-exception': 'past a sub-org envelope',
}

/** The step the request waits on, or null. */
const waiting = (r: HcRequest): Step | null =>
  r.steps.find((s) => s.enteredAt != null && s.decision == null) ?? null

/** Types C23 refuses on a seat with an accepted offer (an Elimination is still allowed). */
const NOT_ON_ACCEPTED_OFFER: ReadonlySet<HcRequest['type']> = new Set<HcRequest['type']>([
  'Start date',
  'Level change',
  'Location change',
  'Start recruiting',
  'Trade',
])

/** Whether the request would change a seat with an accepted offer (C23): its named seat, or a seat a trade gives. */
function onAcceptedOffer(ctx: AnalyticsContext, req: HcRequest): boolean {
  if (!NOT_ON_ACCEPTED_OFFER.has(req.type)) return false
  const seats =
    req.type === 'Trade' ? (req.trade?.givePositionIds ?? []) : req.positionId ? [req.positionId] : []
  return seats.some((id) => seatStateOf(ctx, id)?.acceptedOffer != null)
}

/** A cross-unit trade's last step: the approval that applies it, where "Move target too?" is read (11.4). */
function finalTradeStep(req: HcRequest, step: Step | null): boolean {
  if (req.type !== 'Trade' || !step || !req.steps.some((s) => s.reasons.includes('cross-unit'))) return false
  return !req.steps.some((s) => s.n > step.n && s.decision == null)
}

/** A cycle ask in HRBP review whose manager has decided: its unit's HRBP may approve it with changes (SC-9). */
function cycleChangeable(p: Prep, req: HcRequest): boolean {
  const cycle = req.cycleId ? p.ctx.plan?.cycles.find((c) => c.cycleId === req.cycleId) : null
  if (cycle?.stage !== 'HRBP review') return false
  if (req.state !== 'Submitted' && req.state !== 'In review') return false
  if (waiting(req) || !req.steps.some((s) => s.role === 'manager' && s.decision === 'Approved')) return false
  const mode = p.ctx.access.mode
  return mode === 'hr-admin' || (mode === 'hrbp' && p.viewer.hrbpUnits.has(req.businessUnit))
}

/* ───────────── the card ───────────── */

export interface CardOptions {
  /** Approvals: the band estimate and gap after approval (outside Manager mode), the Manager's allocation after approval. */
  approvals?: boolean
  /** The Cycle tab: a cycle ask its unit's HRBP may approve with changes in HRBP review (SC-9). */
  cycle?: boolean
}

/** A request's card for the viewer (null when 8.4 hides it). */
export function requestCard(p: Prep, req: HcRequest, opts: CardOptions = {}): RequestCard | null {
  const view = p.view(req)
  if (view === 'none') return null
  const ctx = p.ctx
  const viewer = p.viewer
  const me = p.me
  const full = view === 'full'
  const text = (t: string) => managerText(t, viewer)
  const can = (id: string) => ctx.access.decide(`action:${id}`).access !== 'hidden'
  const mine = !!me && (req.requesterId === me || req.submittedById === me)
  const step = waiting(req)
  const myStep = !!me && !!step && step.approverId === me
  const transferOk = req.type !== 'Transfer' || can('transfer.approve')
  // The effective state (./base.ts): an idle Draft or Sent back request reads Expired.
  const expired = req.state === 'Expired'
  const editable = mine && (req.state === 'Draft' || req.state === 'Sent back')
  const freeze = editable ? freezeOf(ctx, req) : null
  const offer = full && onAcceptedOffer(ctx, req)
  const decide = myStep && isPendingState(req.state) && transferOk
  const inCycleReview = !!opts.cycle && full && cycleChangeable(p, req)
  const changeable =
    (decide && full && step?.role === 'hrbp') || inCycleReview
      ? can('request.approve-with-changes') && !offer
        ? changeFieldsOf(req)
        : []
      : []
  const title = titleFor(req.jobTitle, viewer)
  const fieldOptions = (f: ChangeableField): readonly string[] | null =>
    f === 'level' ? LEVELS : f === 'location' ? SITES.map((s) => s.location) : null

  const facts: { label: string; value: string }[] = []
  const add = (label: string, value: string | number | null | undefined) => {
    if (value != null && value !== '') facts.push({ label, value: String(value) })
  }
  add('Type', req.type)
  add('State', req.state)
  add('Position', req.positionId)
  add('Title', title)
  add('Level', req.level)
  add('Business unit', req.businessUnit)
  add('Department', req.department)
  if (full) {
    add('Location', req.location)
    if (req.fte != null && req.type !== 'Transfer') add('FTE', fmt(req.fte, 'num2'))
    add(
      req.type === 'Elimination' ? 'Last day' : 'Start or effective date',
      req.startDate ? formatDate(req.startDate) : null,
    )
    add('Reason', req.reasonCode)
    add('Requester', p.nameOf(req.requesterId) ?? req.requesterId)
    if (req.submittedById && req.submittedById !== req.requesterId)
      add('Submitted on their behalf by', p.nameOf(req.submittedById) ?? req.submittedById)
    if (req.cycleId) {
      const fy = ctx.plan?.cycles.find((c) => c.cycleId === req.cycleId)?.fiscalYear
      add('Ranked ask', `${fy ?? 'Planning'} cycle${req.priority != null ? `, rank ${req.priority}` : ''}`)
    }
    if (req.type === 'Transfer' && req.transfer) {
      const t = req.transfer
      add('Moving', p.nameOf(t.personId) ?? t.personId)
      add('From', t.fromPositionId)
      add('To', t.kind === 'internal' ? t.toPositionId : `under ${t.toManagerPositionId ?? ''}`)
      add('Kind', t.kind === 'internal' ? 'Internal move' : 'Position move')
      add('Effective', formatDate(t.effectiveDate))
      add('Move budget too', t.moveBudget ? 'Yes' : 'No')
    }
    if (req.type === 'Trade' && req.trade) {
      add('Seats given', req.trade.givePositionIds.join(', ') || 'none')
      if (req.trade.creditUsedBp > 0)
        add('Trade credit used', `${standardHeads(req.trade.creditUsedBp)} standard heads`)
    }
  }

  const steps: StepLine[] = req.steps.map((s) => ({
    n: s.n,
    role: ROLE_WORD[s.role],
    approver: full ? p.nameOf(s.approverId) : null,
    status: stepStatus(s),
    at: full && (s.at ?? s.enteredAt) ? dateOf(onAsOf((s.at ?? s.enteredAt) as string, ctx.asOf)) : null,
    note: full && s.note ? text(s.note) : null,
    why: full
      ? s.reasons
          .map((r) => WHY[r])
          .filter(Boolean)
          .join(', ') || null
      : null,
  }))

  const notes: { label: string; text: string }[] = []
  if (full) {
    const back = [...req.steps]
      .reverse()
      .find((s) => (s.decision === 'Sent back' || s.decision === 'Rejected') && s.note)
    if (back?.note)
      notes.push({
        label: back.decision === 'Rejected' ? 'Why it was rejected' : 'What to change',
        text: text(back.note),
      })
    if (req.exception)
      notes.push({
        label: 'Freeze exception',
        text: req.exception.reason ? text(req.exception.reason) : 'No business reason was given.',
      })
    if (offer && (isPendingState(req.state) || req.state === 'Draft'))
      notes.push({ label: 'Accepted offer', text: ACCEPTED_OFFER_TEXT })
    if (expired) notes.push({ label: 'Expired', text: `It had no change for ${p.set.idleDays} days.` })
  }

  const changes =
    full && req.changes?.changes.length
      ? {
          text: `Changed by ${req.requesterId === me ? 'your' : 'the'} HRBP: ${changesText(req)}`,
          reason: text(req.changes.reason),
        }
      : null

  const comments: CommentLine[] = full
    ? req.comments
        .filter((c) => commentVisible(c, req, viewer))
        .map((c) => ({
          id: c.id,
          at: dateOf(onAsOf(c.at, ctx.asOf)),
          by: p.nameOf(c.by) ?? c.by,
          audience: c.audience === 'approvers' ? 'Approvers only' : 'Everyone on the request',
          text: text(c.text),
        }))
    : []

  const card: RequestCard = {
    requestId: req.requestId,
    view,
    type: req.type,
    state: req.state,
    heading: `${req.requestId} ${req.type}${title ? `, ${req.level ? `${req.level} ` : ''}${title}` : ''}`,
    facts,
    chain: full && req.steps.length ? chainSentence(req.steps, req.requesterId === me) : null,
    steps,
    changes,
    notes,
    comments,
    trade: full && req.type === 'Trade' ? withoutHiddenBand(tradeCardOf(p, req)) : null,
    freeze,
    can: {
      submit: editable && can('request.submit') && !freezeBlocks(freeze, req),
      // An expired request is not pending: its requester may withdraw it to close it (D-EXPIRY).
      withdraw:
        mine &&
        can('request.withdraw') &&
        ['Draft', 'Submitted', 'In review', 'Sent back', 'Expired'].includes(req.state),
      exception: !!freeze && !req.exception && can('freeze.exception'),
      // An expired request takes no comment: it would make it pending again (D-EXPIRY, review recheck).
      comment: full && can('request.comment') && !expired,
      approve: decide && can('request.approve') && !offer,
      approveWithChanges: changeable.length > 0,
      sendBack: decide && can('request.send-back'),
      reject: decide && can('request.reject'),
    },
    changeable: changeable.map((f) => ({
      field: f,
      label: FIELD_LABEL[f],
      value: fieldValue(req, f),
      options: fieldOptions(f),
    })),
    editable:
      editable && full && can('request.draft')
        ? editFieldsOf(req).map((f) => ({
            field: f,
            label: FIELD_LABEL[f],
            value: fieldValue(req, f),
            options: fieldOptions(f),
          }))
        : [],
    editAsk: editable && full && can('request.draft') && req.type === 'Trade' ? askOf(req) : null,
    moveTarget:
      decide && full && can('request.approve') && !offer && finalTradeStep(req, step)
        ? { on: movesTarget(req.trade) }
        : null,
    hint: FREE_TEXT_HINT,
  }
  if (opts.approvals) {
    if (ctx.access.mode === 'manager') card.managerAfter = managerAfterOf(ctx, req)
    else {
      card.bandEstimateUsd = ctx.access.can('cost:band') && full ? bandEstimateOf(req, ctx) : null
      const g = full ? gapAfterOf(ctx, req, { counted: isPendingState(req.state), visible: p.visible }) : null
      card.gapAfter = g ? { org: g.org, orgKey: g.orgKey, heads: g.heads, note: g.note } : null
    }
  }
  return card
}

/** A draft whose org is frozen needs the exception before it is submitted. */
const freezeBlocks = (freeze: RequestCard['freeze'], req: HcRequest): boolean => !!freeze && !req.exception

/** The freeze over a draft's org (a New role, a trade, or a Backfill when the freeze holds backfills). */
function freezeOf(ctx: AnalyticsContext, req: HcRequest): RequestCard['freeze'] {
  if (req.type !== 'New role' && req.type !== 'Backfill') return null
  // The actions' own reading (src/plan/actions/shared.ts `freezeOfRequest`), over the same datasets.
  const f = freezeOn(
    ctx.all.freezes,
    placeOfRequest(req),
    req.startDate ?? ctx.asOf,
    inTreeOf(ctx.all.positions),
  )
  if (!f || (req.type === 'Backfill' && f.allowBackfill)) return null
  return { freezeId: f.freezeId, notice: freezeNotice(f.department || f.costCenter || f.businessUnit, f) }
}

/** A card trade as the model carries it: no `bandUsd` key where band estimates are hidden (Manager mode). */
export type CardTrade = Omit<TradeQuoteCard, 'bandUsd'> & { bandUsd?: TradeQuoteCard['bandUsd'] }

/** Drops a hidden band estimate's key, so no field of a Manager-mode model names an amount. */
function withoutHiddenBand(c: TradeQuoteCard | null): CardTrade | null {
  if (!c || c.bandUsd) return c
  const { bandUsd: _hidden, ...rest } = c
  return rest
}

/** A trade's card: a pending trade re-quoted as its next approval would; a decided one from its stored weights. */
function tradeCardOf(p: Prep, req: HcRequest): TradeQuoteCard | null {
  const ctx = p.ctx
  const ask = askOf(req)
  const t = req.trade
  if (!ask || !t) return null
  const bandShown = ctx.access.can('cost:band')
  if (isPendingState(req.state) || req.state === 'Draft') {
    const q = tradeQuoteOf(ctx, ask, { exceptRequestId: req.requestId })
    let onHold = 0
    for (const id of ask.give) if (seatStateOf(ctx, id)?.status === 'On hold') onHold++
    return quoteCard(q, {
      year: fiscalYearOf(ask.get.start),
      creditUsedBp: ask.creditUsedBp,
      bandShown,
      onHoldGiven: onHold,
      requestShown: shownInFull(p),
    })
  }
  // Decided: the weights stored at the last approval step.
  const get = Array.from({ length: t.count }, () => ({
    level: req.level ?? 'P1',
    location: req.location ?? '',
    fte: req.fte ?? 1,
  }))
  if (t.restFte) get.push({ level: req.level ?? 'P1', location: req.location ?? '', fte: t.restFte })
  const lines = [
    `Gave ${t.givePositionIds.length === 1 ? '1 seat' : `${t.givePositionIds.length} seats`}${t.creditUsedBp > 0 ? ` and ${standardHeads(t.creditUsedBp)} standard heads of trade credit` : ''} (${standardHeads(t.giveBp ?? 0)}).`,
    `Got ${seatGroups(get)} (${standardHeads(t.getBp ?? 0)}).`,
    (t.creditBp ?? 0) > 0
      ? `Credit ${standardHeads(t.creditBp ?? 0)} standard heads.`
      : 'No trade credit was left over.',
  ]
  return {
    ok: true,
    lines,
    blocks: [],
    maxSeats: t.count,
    ratio: 0,
    giveBp: t.giveBp ?? 0,
    getBp: t.getBp ?? 0,
    creditBp: t.creditBp ?? 0,
    headsDelta: 0,
    bandUsd: null,
  }
}

/** Manager mode's Approvals: heads, the allocation after approval and the status after approval (7.6). */
function managerAfterOf(ctx: AnalyticsContext, req: HcRequest): RequestCard['managerAfter'] {
  let facts: ReturnType<typeof teamFacts> | null = null
  try {
    facts = teamFacts(ctx)
  } catch {
    facts = null
  }
  const e = facts?.effects.find((x) => x.requestId === req.requestId) ?? null
  const heads = e?.heads ?? 0
  const headsText =
    heads === 0
      ? 'No change in heads.'
      : `${heads > 0 ? 'Adds' : 'Takes off'} ${Math.abs(heads)} ${Math.abs(heads) === 1 ? 'head' : 'heads'}${e ? ` from ${formatMonthShort(`${e.month}-01`, true)}` : ''}.`
  if (!facts || facts.empty || !facts.status) return { headsText, allocation: null, status: null }
  const moves = req.type === 'New role' || req.type === 'Trade' || req.type === 'Elimination'
  const alloc = {
    heads: facts.allocation.heads + (moves ? heads : 0),
    bandCost: facts.allocation.bandCost + (moves && e ? e.bandCost : 0),
  }
  const filled = !!req.positionId && seatStateOf(ctx, req.positionId)?.status === 'Filled'
  const staffed = staffedAfterApproval(req.type, e, facts.months, filled)
  const after = budgetStatus({
    allocation: alloc,
    staffed,
    pending: facts.effects.filter((x) => x.requestId !== req.requestId),
    atRiskShare: ctx.metrics.num(TEAM_PARAM.atRiskShare.metricId, TEAM_PARAM.atRiskShare.key),
  })
  return {
    headsText,
    allocation: `Allocation after approval: ${fmt(alloc.heads, 'int')} ${alloc.heads === 1 ? 'head' : 'heads'}.`,
    status: `Status after approval: ${after.status}${after.reason ? ` (${after.reason.charAt(0).toLowerCase()}${after.reason.slice(1)})` : ''}.`,
  }
}

/**
 * The staffed months after a request is approved (Manager mode's status after approval): an
 * approved Level or Location change on a Filled seat reprices a staffed person from its month by its
 * band change (R32: staffed at the seat's current Working level and location); everything else
 * leaves the staffed months as they are (an add is not staffed until someone starts). Pure.
 */
export function staffedAfterApproval(
  type: HcRequest['type'],
  effect: Pick<PendingEffect, 'month' | 'bandCost'> | null,
  months: readonly StaffedMonth[],
  filledSeat: boolean,
): readonly StaffedMonth[] {
  if (!effect || !filledSeat || (type !== 'Level change' && type !== 'Location change')) return months
  return months.map((m) => (m.month >= effect.month ? { ...m, bandCost: m.bandCost + effect.bandCost } : m))
}

/** The cards of the rows given, in order (hidden requests are no card). */
export function cardsOf(p: Prep, reqs: readonly HcRequest[], opts: CardOptions = {}): RequestCard[] {
  const out: RequestCard[] = []
  for (const r of reqs) {
    const c = requestCard(p, r, opts)
    if (c) out.push(c)
  }
  return out
}

/** The fields the requester may change on their own draft: approve with changes' fields, and a trade's get seats too. */
function editFieldsOf(req: HcRequest): ChangeableField[] {
  return req.type === 'Trade' ? ['level', 'location', 'fte', 'startDate', 'count'] : changeFieldsOf(req)
}

/**
 * The `editRequest` patch for changes picked on a card's Change dialog: the fields as they are, or
 * for a trade draft its stored ask again with the changed get seats (`editRequest` re-quotes it).
 */
export function editPatchOf(
  card: Pick<RequestCard, 'editAsk'>,
  changes: readonly { field: ChangeableField; new: string | number | null }[],
): RequestPatch {
  const ask = card.editAsk
  if (!ask) return Object.fromEntries(changes.map((c) => [c.field, c.new])) as RequestPatch
  const get = { ...ask.get }
  for (const c of changes) {
    if (c.new == null || c.new === '') continue
    if (c.field === 'level') get.level = c.new as typeof get.level
    else if (c.field === 'location') get.location = String(c.new)
    else if (c.field === 'fte') get.fte = Number(c.new)
    else if (c.field === 'startDate') get.start = String(c.new)
    else if (c.field === 'count') get.count = Number(c.new)
  }
  return { ask: { ...ask, get } }
}

/* ───────────── what the card's text boxes check at entry (8.4 rule 5) ───────────── */

/**
 * A comment's audience as it will be stored: one with an amount is always Approvers only, and the
 * picker says why (AMOUNT_COMMENT_NOTE); otherwise the one picked.
 */
export function commentAudienceOf(
  text: string,
  picked: 'everyone' | 'approvers',
): { audience: 'everyone' | 'approvers'; forced: boolean; note: string | null } {
  return hasAmount(text)
    ? { audience: 'approvers', forced: true, note: AMOUNT_COMMENT_NOTE }
    : { audience: picked, forced: false, note: null }
}

/**
 * A reason a manager reads (send back, reject, approve with changes, the freeze exception): blank is
 * refused with REASON_REQUIRED_TEXT and an amount with REMOVE_AMOUNT_TEXT, as the action refuses it.
 */
export function reasonRefusalOf(text: string): string | null {
  if (!text.trim()) return REASON_REQUIRED_TEXT
  return hasAmount(text) ? REMOVE_AMOUNT_TEXT : null
}
