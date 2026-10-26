/**
 * Request types and the state machine (docs/PLAN.md 10.1, 8.4 rule 5, 15.1 R5 to R7, change C23).
 * Built by engines C in M1. Pure: `transition` returns the next request, its audit drafts and what
 * approval does to plan state; the store saves them.
 *
 * States: Draft, Submitted, In review (step n), Sent back, Approved, Approved with changes, Rejected,
 * Withdrawn, Expired. Draft and Sent back expire after 60 idle days (against the as-of date); requests
 * in an open cycle never expire. Every transition writes audit entries (`by` = the Acting as person).
 *
 * | Type | On approval |
 * |---|---|
 * | New role | adds a Planned position (a new, never reused positionId) |
 * | Backfill | confirms the seat for recruiting: Open from the day after its exit; an On hold seat becomes Open; openedDate = the later of the approval date and the exiting holder's last day + 1 |
 * | Level change, Location change | adds a dated position row |
 * | Transfer | transfer.ts `applyTransfer` |
 * | Elimination | end-dates the seat: endDate = the effective date (its last day), an Eliminated row from the next day; every later dated row of the seat is written Eliminated too |
 * | Trade | trade.ts `applyTrade` |
 * | Start recruiting | the HRBP's Working edit: a row dated the approval date, status Open, openedDate that date |
 * | Start date | the HRBP's Working edit moves the start; on a seat Open after an exit (its row still says Filled) the row it writes says Open, openedDate kept or the last day + 1 (lead decision D-START) |
 *
 * Seats with an accepted offer (req stage Offer accepted, not Started) are refused for every Working
 * edit, Start date, Level change, Location change, On hold and Trade (`accepted-offer`); Elimination is
 * still allowed. Send-back, reject and change reasons with an amount are refused at entry, and a
 * comment with an amount is Approvers only.
 *
 * How the machine runs:
 *  - submit (Draft) and resubmit (Sent back) compute the chain (`chainFor`) and enter step 1; the
 *    request reads Submitted. A cycle ask (in an open cycle) keeps only the submitter's manager step:
 *    the cycle's stages replace the rest (15.1 R7), and the ask waits In review for the cycle lock.
 *  - approve and approve-with-changes decide the current step (the first entered, undecided one) and
 *    enter the next (In review); deciding the last step approves the request and applies it.
 *  - Only the step's approver decides it ("Only on steps assigned to you."); only the HRBP step can
 *    approve with changes; a trade's count can only go down. The caller re-quotes a trade with its
 *    changed count and start and passes the fields (`requoted`); without them, lowering the count
 *    re-stores getBp and creditBp from the whole-seat weight.
 *  - A cycle ask's HRBP changes (`cycle-changes`, during HRBP review, once its manager approved it)
 *    are stored and audited with their reason and decide no step: the lock then gives "Approved with
 *    changes" (10.3, lead decision D-CYCLE).
 *  - At the cycle lock (`cycle-lock`) only an ask whose manager approved it is decided: an ask still
 *    waiting on its manager is refused (the action refuses the whole lock first), and a Sent back ask
 *    is with its requester, so the lock leaves it alone (D-CYCLE).
 *  - Every decision on a request that names a seat re-reads the seat: one with an accepted offer is
 *    refused Start date, Level change and Location change approvals too (C23, review SC-5).
 *
 * Dates (15.1 R47): `at` is the business time, the as-of date with the wall clock's time of day;
 * every date the request stores (submitted, updated, each step's entered and decided dates, comments,
 * change sets, approval and effective dates) is it. The audit entries' own time is `auditAt` (the wall
 * clock, `at` when not given), and their effective date is the business date.
 *
 * Expiry (10.1, R6, lead decision D-EXPIRY) stays derived at read time, through one helper:
 * `effectiveState` (and `withEffectiveStates` over a list) reads a Draft or Sent back request idle for
 * the idle days, outside an open cycle, as Expired. An expired request is not pending, so its seats
 * and its trade credit are free; its requester may still withdraw it.
 */
import {
  APPROVED_REQUEST_STATES,
  type ISODate,
  type ISODateTime,
  PENDING_REQUEST_STATES,
  type PositionRow,
  type RequestRow,
  type RequestState,
  type RequestType,
  STEP_ROLES,
  type StepRole,
  siteByLocation,
  splitIds,
  TRANSFER_KIND_CODE,
  TRANSFER_KINDS,
  type TransferKind,
} from '@/data/schema'
import { addDays, dateOf, daysBetween } from '@/lib/dates'
import type {
  Actor,
  AuditDraft,
  ChainReason,
  ChangeSet,
  CommentAudience,
  Cycle,
  HcRequest,
  PlanEffect,
  PositionChange,
  PositionStatus,
  Step,
  StepRoleCode,
  TradeFields,
  WorkingPlan,
} from '../types'
import type { ChainContext } from './chain'
import { chainFor } from './chain'
import { isActiveOn } from './heads'
import { applyTrade, rowInEffect } from './trade'
import { applyTransfer } from './transfer'

/** The refusal text for a seat with an accepted offer (10.1, 11.2). */
export const ACCEPTED_OFFER_TEXT =
  'This seat has an accepted offer. Its start date and terms come from the recruiting system.'

/** The refusal text for a reason or note a manager reads that holds an amount (8.4 rule 5). */
export const REMOVE_AMOUNT_TEXT = 'Remove the amount: managers see this note.'

/** Why a comment's audience picker is disabled (8.4 rule 5). */
export const AMOUNT_COMMENT_NOTE = 'This comment mentions an amount, so only approvers see it.'

/** The reason code and text a cycle lock gives asks below the cut line (15.1 R7). */
export const BELOW_THE_CUT_LINE = 'Below the cut line'

/** The refusal when someone other than the step's approver decides it. */
export const NOT_YOUR_STEP_TEXT = 'Only on steps assigned to you.'

/** The lock never decides a cycle ask its manager has not approved (10.3, R7, D-CYCLE). */
export const WAITS_ON_MANAGER_TEXT = "This ask still waits on its manager's decision."

/** A Sent back cycle ask is with its requester: the lock leaves it alone (D-CYCLE). */
export const SENT_BACK_ASK_TEXT = 'This ask was sent back to its requester, so the lock does not decide it.'

/** HRBP changes to a cycle ask: during HRBP review, once the ask's manager approved it (10.3, D-CYCLE). */
export const CYCLE_CHANGES_TEXT =
  'A cycle ask is changed during HRBP review, once its manager has approved it.'

/** A Location change to a site where the seat's department has no cost center (7.4: a cost center sits at one site). */
export const noCostCenterText = (department: string, location: string): string =>
  `${department} has no cost center in ${location} yet, so this seat cannot move there. HR admin adds the cost center first.`

export type RequestAction =
  | { kind: 'submit'; onBehalfOf: string | null }
  /** `note`: what the approver's step records with the decision (a trade's "Rates changed" note, 11.2). */
  | { kind: 'approve'; note?: string | null }
  /**
   * `requoted`: a trade's fields re-quoted by the caller at the changed count and start (11.4); the
   * engine stores them and audits each field that moved.
   */
  | {
      kind: 'approve-with-changes'
      changes: ChangeSet['changes']
      reason: string
      requoted?: TradeFields
    }
  | { kind: 'send-back'; reason: string }
  | { kind: 'reject'; reason: string }
  | { kind: 'withdraw' }
  | { kind: 'resubmit' }
  | { kind: 'comment'; text: string; audience: CommentAudience }
  | { kind: 'expire' }
  /** At cycle lock: above the cut line is approved (its HRBP changes kept), below is rejected "Below the cut line". */
  | { kind: 'cycle-lock'; aboveCut: boolean }
  /**
   * The unit HRBP's changes to a cycle ask during HRBP review (10.3): stored and audited with their
   * reason, no step decided; the lock then approves the ask "with changes". The caller checks the
   * stage and that the actor is the unit's HRBP.
   */
  | { kind: 'cycle-changes'; changes: ChangeSet['changes']; reason: string; requoted?: TradeFields }

/** A change set with a trade's credit before and after the change (11.4's "credit 0.11 to 0.56"). */
export interface TradeChangeSet extends ChangeSet {
  /** The trade's creditBp before the first change and after the last; absent when the credit did not move. */
  credit?: { old: number | null; new: number | null }
}

/** A trade's credit change from its change set, in bp; null when there is none (requests-ui reads it on the card). */
export function tradeCreditChange(
  req: Pick<HcRequest, 'changes'>,
): { old: number | null; new: number | null } | null {
  const c = req.changes as TradeChangeSet | null
  return c?.credit ?? null
}

/** What a transition reads besides the request; every function is pure. */
export interface TransitionContext {
  chain: ChainContext
  asOf: ISODate
  /** The seat the request touches, on the as-of date; null for a New role or a trade. */
  seat: { status: PositionStatus; acceptedOffer: boolean } | null
  /** The request is in a cycle that is open (it never expires). */
  cycleOpen: boolean
  /** `requests.queue.expired` setting `idleDays` (60). */
  idleDays: number
  /** The Working plan approvals apply to. */
  working: WorkingPlan
  /** src/access/visibility.ts `hasAmount`, passed in because plan/ never imports access/ at runtime. */
  hasAmount(text: string): boolean
  /** A new comment ID. */
  newCommentId(requestId: string, n: number): string
}

export type TransitionResult =
  | { request: HcRequest; audit: AuditDraft[]; effects: PlanEffect[] }
  | { refused: string }

/* ───────────── audit ───────────── */

/** The position fields an audit entry is written for, one entry per changed field. */
const AUDITED_FIELDS = [
  'status',
  'title',
  'jobFamily',
  'level',
  'businessUnit',
  'department',
  'costCenter',
  'location',
  'legalEntity',
  'managerPositionId',
  'workerType',
  'fte',
  'startDate',
  'openedDate',
  'reqType',
  'leaderLevel',
  'endDate',
  'endReason',
] as const satisfies readonly (keyof PositionRow)[]

/**
 * One audit entry per position field that a new row changes (`prev` null: a created seat, one entry
 * per field it sets). Object 'position', `by` the Acting as person.
 */
export function rowAudit(
  prev: PositionRow | null,
  next: PositionRow,
  actor: Actor,
  at: ISODateTime,
  effectiveDate: ISODate | null,
): AuditDraft[] {
  const out: AuditDraft[] = []
  for (const field of AUDITED_FIELDS) {
    const old = prev ? (prev[field] ?? null) : null
    const value = next[field] ?? null
    if (old === value || (prev == null && value == null)) continue
    out.push({
      at,
      by: actor.personId,
      byName: actor.name,
      mode: actor.mode,
      object: 'position',
      id: next.positionId,
      field,
      old,
      new: value,
      effectiveDate,
      comment: null,
      commentAudience: null,
    })
  }
  return out
}

/** An audit draft on the request itself: `at` the wall clock, `effectiveDate` the business date (R47). */
function requestAudit(
  req: HcRequest,
  actor: Actor,
  at: ISODateTime,
  field: string,
  old: unknown,
  value: unknown,
  comment: { text: string; audience: CommentAudience } | null = null,
  effectiveDate: ISODate | null = null,
): AuditDraft {
  return {
    at,
    by: actor.personId,
    byName: actor.name,
    mode: actor.mode,
    object: 'request',
    id: req.requestId,
    field,
    old,
    new: value,
    effectiveDate,
    comment: comment?.text ?? null,
    commentAudience: comment?.audience ?? null,
  }
}

/* ───────────── approval effects ───────────── */

const rowsOf = (plan: WorkingPlan, positionId: string): PositionRow[] =>
  plan.positions
    .filter((r) => r.positionId === positionId)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : 0))

/** The seat's row in effect on `d`, else its first row; null for an unknown seat. */
const rowFor = (plan: WorkingPlan, positionId: string, d: ISODate): PositionRow | null => {
  const rows = rowsOf(plan, positionId)
  return rowInEffect(rows, d) ?? rows[0] ?? null
}

/** The later of two dates. */
const laterOf = (a: ISODate, b: ISODate): ISODate => (a > b ? a : b)

/**
 * What approving does to Working, with one audit entry per field. `at` is the approval date; audit
 * entries carry `auditAt` (the transition's timestamp).
 */
function approvalOf(
  req: HcRequest,
  plan: WorkingPlan,
  at: ISODate,
  auditAt: ISODateTime = at,
): { positions: PositionChange[]; audit: AuditDraft[] } {
  const positions: PositionChange[] = []
  const audit: AuditDraft[] = []
  /** Adds a dated row derived from `base` (the row it replaces, null for a new seat). */
  const add = (kind: PositionChange['kind'], base: PositionRow | null, row: PositionRow) => {
    positions.push({ kind, row })
    audit.push(...rowAudit(base, row, plan.actor, auditAt, row.effectiveDate))
  }
  const dated = (base: PositionRow, effectiveDate: ISODate, over: Partial<PositionRow>): PositionRow => ({
    ...base,
    ...over,
    effectiveDate,
    sourceRequestId: req.requestId,
  })

  switch (req.type) {
    case 'New role': {
      if (!req.level || !req.location) break
      const place = plan.placeOf(req.managerPositionId, req.location)
      add('created', null, {
        positionId: plan.newPositionId(req.requestId, 1),
        effectiveDate: at,
        status: 'Planned',
        title: req.jobTitle,
        jobFamily: null,
        level: req.level,
        businessUnit: place?.businessUnit ?? req.businessUnit,
        department: place ? place.department : req.department,
        costCenter: place?.costCenter ?? req.costCenter ?? '',
        location: req.location,
        legalEntity: place?.legalEntity ?? siteByLocation.get(req.location)?.legalEntity ?? null,
        managerPositionId: req.managerPositionId,
        workerType: 'Employee',
        fte: req.fte ?? 1,
        startDate: req.startDate,
        openedDate: null,
        reqType: 'New',
        leaderLevel: null,
        endDate: null,
        endReason: null,
        sourceRequestId: req.requestId,
      })
      break
    }
    case 'Backfill': {
      if (!req.positionId) break
      const base = rowFor(plan, req.positionId, at)
      if (!base) break
      const held = plan.assignments.filter(
        (a) => a.positionId === req.positionId && a.workerType === 'Employee',
      )
      const lastDay = held.some((a) => a.end == null)
        ? null
        : held.reduce<ISODate | null>((m, a) => (a.end && (!m || a.end > m) ? a.end : m), null)
      const openedDate = lastDay ? laterOf(at, addDays(lastDay, 1)) : at
      add(
        'opened',
        base,
        dated(base, at, {
          status: 'Open',
          openedDate,
          startDate: req.startDate ?? base.startDate ?? null,
          reqType: 'Backfill',
          endDate: null,
          endReason: null,
        }),
      )
      break
    }
    case 'Level change':
    case 'Location change': {
      if (!req.positionId) break
      const effective = req.startDate ?? at
      const base = rowFor(plan, req.positionId, effective)
      if (!base) break
      const over: Partial<PositionRow> = { fte: req.fte ?? base.fte ?? 1 }
      if (req.type === 'Level change') over.level = req.level ?? base.level
      else if (req.location) {
        const place = plan.placeOf(base.managerPositionId ?? req.managerPositionId, req.location)
        over.location = req.location
        over.costCenter = place?.costCenter ?? base.costCenter
        over.legalEntity = place?.legalEntity ?? siteByLocation.get(req.location)?.legalEntity ?? null
      }
      add('changed', base, dated(base, effective, over))
      break
    }
    case 'Elimination': {
      if (!req.positionId) break
      // startDate is the seat's last day (inclusive); the Eliminated row starts the next day. With
      // none, the last day is the approval date (CONTRACTS-M3 EliminationInput, review SC-18).
      const lastDay = req.startDate ?? at
      const base = rowFor(plan, req.positionId, lastDay)
      if (!base) break
      const from = addDays(lastDay, 1)
      const ended = { status: 'Eliminated', endDate: lastDay, endReason: 'Eliminated' } as const
      add('eliminated', base, dated(base, from, ended))
      // A row dated after the Eliminated one (a planned level change, a later start) is written
      // Eliminated too, as applyTrade does for a give seat, so no later row brings the seat back in
      // Working (M2-REPORT close-out known gap 3).
      for (const r of rowsOf(plan, req.positionId))
        if (r.effectiveDate > from) add('eliminated', r, dated(r, r.effectiveDate, ended))
      break
    }
    case 'Start recruiting': {
      if (!req.positionId) break
      const base = rowFor(plan, req.positionId, at)
      if (!base) break
      add(
        'opened',
        base,
        dated(base, at, {
          status: 'Open',
          openedDate: at,
          startDate: base.startDate ?? req.startDate ?? null,
        }),
      )
      break
    }
    case 'Start date': {
      if (!req.positionId || !req.startDate) break
      const base = rowFor(plan, req.positionId, at)
      if (!base) break
      const over: Partial<PositionRow> = { startDate: req.startDate }
      // A seat whose row says Filled but whom nobody holds is Open (6.5): a copy of that row would
      // still read as "after an exit" and drop the new start, so the row says Open (D-START).
      const held = plan.assignments.filter(
        (a) => a.positionId === req.positionId && a.workerType === 'Employee',
      )
      if (base.status === 'Filled' && !held.some((a) => isActiveOn(a, at))) {
        const lastDay = held.reduce<ISODate | null>(
          (m, a) => (a.end && a.end < at && (!m || a.end > m) ? a.end : m),
          null,
        )
        const derived = lastDay ? addDays(lastDay, 1) : at
        const kept = base.openedDate && (!lastDay || base.openedDate > lastDay) ? base.openedDate : null
        over.status = 'Open'
        over.openedDate = kept ?? derived
      }
      add('changed', base, dated(base, at, over))
      break
    }
    case 'Transfer': {
      const done = applyTransfer(req, plan, at)
      positions.push(...done.positions)
      audit.push(...done.audit.map((a) => ({ ...a, at: auditAt })))
      break
    }
    case 'Trade': {
      const done = applyTrade(plan, req, at)
      positions.push(...done.positions)
      audit.push(...done.audit.map((a) => ({ ...a, at: auditAt })))
      break
    }
  }
  return { positions, audit }
}

/**
 * What approving a request does to Working (the table above), as position and target effects.
 * Every new row is dated (never a rewrite of history) and carries `sourceRequestId`.
 */
export function applyApproval(req: HcRequest, plan: WorkingPlan, at: ISODate): PlanEffect[] {
  return approvalOf(req, plan, at).positions.map((change) => ({ kind: 'position', change }))
}

/* ───────────── an approval a file brings (lead decision D-MERGE) ───────────── */

/** What replaying an approval brought by an imported file does to this workspace's Working. */
export type ApprovalReplay =
  /** Nothing to apply: the request is not approved, or its effects are in this Working already. */
  | { kind: 'none'; why: 'not-approved' | 'applied' }
  /** The approval's effects, dated its approval date, with the audit drafts (`by` the importer). */
  | {
      kind: 'apply'
      effects: PlanEffect[]
      audit: AuditDraft[]
      /** The business date the effects take (the approval date in the approving workspace). */
      on: ISODate
      outcome: { createdPositionIds: string[]; changedPositionIds: string[] }
    }
  /** The effects cannot apply here: nothing changes, and the merge lists the request with this sentence. */
  | { kind: 'conflict'; text: string }

/**
 * The business date an approved request was approved on: its last decided step's date; for a cycle
 * ask (decided at the lock) the later of that and its `updatedAt`, the lock's date.
 */
export function approvalDateOf(req: HcRequest): ISODate {
  let last: string | null = null
  for (const s of req.steps) if (s.decision != null && s.at && (!last || s.at > last)) last = s.at
  if (req.cycleId && req.updatedAt && (!last || req.updatedAt > last)) last = req.updatedAt
  return dateOf(last ?? req.updatedAt ?? req.submittedAt ?? '')
}

/** The seats an approval must find in this Working before it can apply (the conflict check). */
function namedSeatsOf(req: HcRequest): string[] {
  const out: string[] = []
  const t = req.transfer
  switch (req.type) {
    case 'New role':
      out.push(req.managerPositionId)
      break
    case 'Trade':
      out.push(...(req.trade?.givePositionIds ?? []), req.managerPositionId)
      break
    case 'Transfer':
      if (t)
        out.push(t.fromPositionId, (t.kind === 'internal' ? t.toPositionId : t.toManagerPositionId) ?? '')
      break
    default:
      if (req.positionId) out.push(req.positionId)
  }
  return out.filter((id) => id !== '')
}

/**
 * An approval brought by an imported file (Import requests, Merge), applied here through the same
 * engine as a local approval (lead decision D-MERGE): idempotent by the request's own rows (nothing
 * when Working already holds a row with its `sourceRequestId`), dated its approval date
 * (`approvalDateOf`, R47), the seats it creates taking the file's `outcome.createdPositionIds` so
 * they match the approving workspace's. When the effect cannot apply here (a seat it names is not in
 * this Working, a seat it creates is another seat here, a seat it ends is ended already, a Location
 * change to a site with no cost center for the seat), it is a conflict that names why, and nothing
 * changes. The audit drafts are by `plan.actor` (the importer, 10.7) at `auditAt`, each with
 * `comment` (the caller names the approver and the file). A "Move budget too?" or "Move target too?"
 * target change is the caller's (src/plan/actions/requests.ts `importedApproval`).
 */
export function replayApproval(
  req: HcRequest,
  plan: WorkingPlan,
  opts: { auditAt: ISODateTime; comment: string | null },
): ApprovalReplay {
  if (!isApproved(req)) return { kind: 'none', why: 'not-approved' }
  if (plan.positions.some((r) => r.sourceRequestId === req.requestId)) return { kind: 'none', why: 'applied' }
  const on = approvalDateOf(req)
  const why = (text: string): ApprovalReplay => ({
    kind: 'conflict',
    text: `${req.requestId} cannot be applied here: ${text}`,
  })
  const known = new Set(plan.positions.map((r) => r.positionId))
  for (const id of namedSeatsOf(req)) if (!known.has(id)) return why(`seat ${id} is not in this workspace.`)
  for (const id of req.outcome?.createdPositionIds ?? [])
    if (known.has(id)) return why(`seat ${id} is already another seat in this workspace.`)
  const ended = (id: string, d: ISODate): boolean => {
    const row = rowInEffect(rowsOf(plan, id), d)
    return row?.status === 'Eliminated'
  }
  if (req.type === 'Elimination' && req.positionId && ended(req.positionId, addDays(req.startDate ?? on, 1)))
    return why(`seat ${req.positionId} is already eliminated in this workspace.`)
  if (req.type === 'Trade')
    for (const id of req.trade?.givePositionIds ?? [])
      if (ended(id, on)) return why(`seat ${id} is already eliminated in this workspace.`)
  const site = locationRefusal(req, plan, on)
  if (site) return { kind: 'conflict', text: `${req.requestId} cannot be applied here. ${site}` }
  const created = req.outcome?.createdPositionIds ?? []
  const named: WorkingPlan = {
    ...plan,
    newPositionId: (requestId, n) =>
      requestId === req.requestId && created[n - 1] ? created[n - 1] : plan.newPositionId(requestId, n),
  }
  const applied = approvalOf(req, named, on, opts.auditAt)
  if (!applied.positions.length) return why('it changes nothing in this workspace.')
  return {
    kind: 'apply',
    effects: applied.positions.map((change) => ({ kind: 'position', change })),
    audit: applied.audit.map((a) => ({ ...a, comment: opts.comment ?? a.comment })),
    on,
    outcome: {
      createdPositionIds: applied.positions.filter((c) => c.kind === 'created').map((c) => c.row.positionId),
      changedPositionIds: [
        ...new Set(applied.positions.filter((c) => c.kind !== 'created').map((c) => c.row.positionId)),
      ],
    },
  }
}

/**
 * Whether a cost center has a seat at a location: a cost center sits at exactly one site (7.4, 13.1
 * "<department>-<site>"), so a seat takes the cost center its place gives only where that cost
 * center already is. An addition (review SC-15).
 */
export function costCenterAtSite(
  plan: Pick<WorkingPlan, 'positions'>,
  costCenter: string,
  location: string,
): boolean {
  return plan.positions.some((r) => r.costCenter === costCenter && r.location === location)
}

/**
 * Why a Location change (or a seat edit to another site) cannot go through: the seat's department
 * has no cost center at the new site, so the seat would keep the old site's one (review SC-15).
 * Null when it can, and for a seat that stays where it is.
 */
export function siteMoveRefusal(
  plan: Pick<WorkingPlan, 'positions' | 'placeOf'>,
  base: Pick<PositionRow, 'location' | 'managerPositionId' | 'department' | 'businessUnit'>,
  location: string,
  fallbackManager: string,
): string | null {
  if (base.location === location) return null
  const place = plan.placeOf(base.managerPositionId ?? fallbackManager, location)
  if (place?.costCenter && costCenterAtSite(plan, place.costCenter, location)) return null
  return noCostCenterText(base.department || base.businessUnit, location)
}

/** A Location change's refusal for its seat on the date it takes effect (see `siteMoveRefusal`). */
function locationRefusal(req: HcRequest, plan: WorkingPlan, on: ISODate): string | null {
  if (req.type !== 'Location change' || !req.positionId || !req.location) return null
  const base = rowFor(plan, req.positionId, req.startDate ?? on)
  if (!base) return null
  return siteMoveRefusal(plan, base, req.location, req.managerPositionId)
}

/* ───────────── states ───────────── */

/** Submitted, In review or Sent back: counts in asks and the gap by its head effect (6.9). */
export function isPending(req: Pick<HcRequest, 'state'>): boolean {
  return PENDING_REQUEST_STATES.includes(req.state)
}

/** Approved or Approved with changes: applied to Working. */
export function isApproved(req: Pick<HcRequest, 'state'>): boolean {
  return APPROVED_REQUEST_STATES.includes(req.state)
}

/**
 * A Draft or Sent back request idle for `idleDays` or more at `asOf`, and not in an open cycle. A
 * stored date after the as-of date reads as the as-of date (0 idle days, R47).
 */
export function isExpired(req: HcRequest, asOf: ISODate, idleDays: number, cycleOpen: boolean): boolean {
  if (req.state !== 'Draft' && req.state !== 'Sent back') return false
  if (cycleOpen) return false
  const since = req.updatedAt || req.submittedAt
  if (!since) return false
  return Math.max(0, daysBetween(dateOf(since), asOf)) >= idleDays
}

/** What expiry reads (10.1, R6): the as-of date, the idle days and the plan's cycles. */
export interface ExpiryInput {
  asOf: ISODate
  /** `requests.queue.expired` idle days (60). */
  idleDays: number
  /** The plan's cycles: an ask in a cycle that is not Locked never expires. */
  cycles: readonly Pick<Cycle, 'cycleId' | 'stage'>[]
}

/** Whether a request is an ask in a cycle that is open (not Locked). */
const inOpenCycleOf = (req: Pick<HcRequest, 'cycleId'>, cycles: ExpiryInput['cycles']): boolean => {
  if (!req.cycleId) return false
  const c = cycles.find((x) => x.cycleId === req.cycleId)
  return !!c && c.stage !== 'Locked'
}

/**
 * The one helper every reader takes a request's state from (lead decision D-EXPIRY): 'Expired' for
 * a Draft or Sent back request idle for the idle days at the as-of date outside an open cycle, else
 * its stored state. Nothing stores the Expired state (it is nobody's action); an expired request is
 * not pending, so its seats and trade credit are free. Cards, rows, the tracker, KPIs, Action items,
 * asks, the gap, routing, credit and the tradable-seat check read it (or `withEffectiveStates`).
 */
export function effectiveState(req: HcRequest, x: ExpiryInput): RequestState {
  return isExpired(req, x.asOf, x.idleDays, inOpenCycleOf(req, x.cycles)) ? 'Expired' : req.state
}

/** Pending at the as-of date: Submitted, In review or Sent back, and not expired (6.9, R6). */
export function isPendingNow(req: HcRequest, x: ExpiryInput): boolean {
  return isPending({ state: effectiveState(req, x) })
}

const effectiveMemo = new WeakMap<
  readonly HcRequest[],
  { asOf: ISODate; idleDays: number; cycles: ExpiryInput['cycles']; out: readonly HcRequest[] }
>()

/**
 * Every request with its effective state (`effectiveState`), in order: an expired request is a copy
 * whose state reads 'Expired'. The same array when nothing has expired, memoized per list, as-of
 * date, idle days and cycles, so a reader can map the requests in force once and pass them to asks,
 * `creditBalance`, `rankAsks`, routing and the seat checks. Never write the copies back: the stored
 * state stays (D-EXPIRY).
 */
export function withEffectiveStates(requests: readonly HcRequest[], x: ExpiryInput): readonly HcRequest[] {
  const hit = effectiveMemo.get(requests)
  if (hit && hit.asOf === x.asOf && hit.idleDays === x.idleDays && hit.cycles === x.cycles) return hit.out
  let out: HcRequest[] | null = null
  requests.forEach((r, i) => {
    const state = effectiveState(r, x)
    if (state === r.state) return
    out ??= requests.slice()
    out[i] = { ...r, state }
  })
  const result = out ?? requests
  effectiveMemo.set(requests, { asOf: x.asOf, idleDays: x.idleDays, cycles: x.cycles, out: result })
  return result
}

/** Request types refused on a seat with an accepted offer (10.1, change C23). Elimination is allowed. */
const REFUSED_ON_ACCEPTED_OFFER: ReadonlySet<RequestType> = new Set<RequestType>([
  'Start date',
  'Level change',
  'Location change',
  'Start recruiting',
  'Trade',
])

/** Types that name an existing seat in `positionId`. */
const NAMES_A_SEAT: ReadonlySet<RequestType> = new Set<RequestType>([
  'Backfill',
  'Level change',
  'Location change',
  'Elimination',
  'Start recruiting',
  'Start date',
])

/** Why a request cannot be submitted as it is, or null. */
function submitRefusal(req: HcRequest, ctx: TransitionContext): string | null {
  const seat = ctx.seat
  if (seat?.acceptedOffer && REFUSED_ON_ACCEPTED_OFFER.has(req.type)) return ACCEPTED_OFFER_TEXT
  if (NAMES_A_SEAT.has(req.type) && !req.positionId) return 'Pick the seat this request is for.'
  switch (req.type) {
    case 'New role':
      if (!req.level || !req.location) return 'Pick a level and a location for the new role.'
      break
    case 'Level change':
      if (!req.level) return 'Pick the new level.'
      break
    case 'Location change':
      if (!req.location) return 'Pick the new location.'
      break
    case 'Start date':
      if (!req.startDate) return 'Pick the new start date.'
      break
    case 'Transfer':
      if (!req.transfer?.personId || !req.transfer.fromPositionId || !req.transfer.effectiveDate)
        return 'Fill in the transfer: who moves, from which seat and from when.'
      if (req.transfer.kind === 'position' ? !req.transfer.toManagerPositionId : !req.transfer.toPositionId)
        return 'Pick where the person moves to.'
      break
    case 'Trade':
      if (!req.trade?.giveOrgPositionId) return 'Get a quote first: this trade has no giving org yet.'
      break
  }
  if (seat) {
    if (req.type === 'Start recruiting' && seat.status !== 'Planned')
      return 'Start recruiting is for Planned seats.'
    if (req.type === 'Start date' && seat.status !== 'Open' && seat.status !== 'Planned')
      return 'Start dates move only Open and Planned seats.'
    if (
      (req.type === 'Level change' || req.type === 'Location change') &&
      seat.status !== 'Filled' &&
      seat.status !== 'Open' &&
      seat.status !== 'Planned'
    )
      return 'Level and location changes are for Filled, Open and Planned seats.'
    if ((req.type === 'Elimination' || req.type === 'Backfill') && seat.status === 'Eliminated')
      return 'This seat is already eliminated.'
  }
  if (req.exception && ctx.hasAmount(req.exception.reason)) return REMOVE_AMOUNT_TEXT
  return locationRefusal(req, ctx.working, ctx.asOf)
}

/** The steps a submit stores: the chain, or only the manager step for a cycle ask (15.1 R7). */
function stepsFor(req: HcRequest, ctx: TransitionContext, at: ISODateTime): Step[] {
  const all = chainFor(req, ctx.chain)
  const kept = isCycleAsk(req, ctx) ? all.filter((s) => s.role === 'manager') : all
  return kept.map((s, i) => ({ ...s, n: i + 1, enteredAt: i === 0 ? at : null }))
}

const isCycleAsk = (req: HcRequest, ctx: TransitionContext): boolean => req.cycleId != null && ctx.cycleOpen

/** The step waiting on a decision: the first entered and undecided one; -1 when none. */
export function currentStepIndex(req: Pick<HcRequest, 'steps'>): number {
  return req.steps.findIndex((s) => s.enteredAt != null && s.decision == null)
}

/** The requester, or whoever submitted on their behalf. */
const isRequester = (req: HcRequest, actor: Actor): boolean =>
  actor.personId === req.requesterId || (req.submittedById != null && actor.personId === req.submittedById)

/**
 * Applies "approve with changes" to the request's own fields; a refusal string when a change is not
 * allowed. A trade's `requoted` fields (the caller's re-quote at the changed count and start, 11.4)
 * replace its quote fields; without them, lowering the count re-stores getBp and creditBp from the
 * whole-seat weight.
 */
function withChanges(
  req: HcRequest,
  changes: ChangeSet['changes'],
  requoted: TradeFields | undefined,
): HcRequest | string {
  let next: HcRequest = { ...req }
  for (const c of changes) {
    if (req.type === 'Trade') {
      if (c.field !== 'count' && c.field !== 'startDate')
        return 'A trade can change only its count and start date.'
    } else if (c.field === 'count') return 'Only a trade has a count to change.'
    switch (c.field) {
      case 'count': {
        const t = next.trade
        const count = Number(c.new)
        if (!t || !Number.isInteger(count) || count < 1) return 'Pick a whole number of seats, 1 or more.'
        if (count > t.count) return "A trade's count can only go down."
        if (requoted) break
        // Whole get seats all weigh the same, so lowering the count frees exact credit.
        const perSeat = t.restFte == null && t.getBp != null && t.count > 0 ? t.getBp / t.count : null
        const getBp = perSeat != null ? perSeat * count : t.getBp
        const creditBp = getBp != null && t.giveBp != null ? t.giveBp - getBp : t.creditBp
        next = { ...next, trade: { ...t, count, getBp, creditBp } }
        break
      }
      case 'level':
        next = { ...next, level: (c.new as HcRequest['level']) ?? null }
        break
      case 'location':
        next = { ...next, location: c.new == null ? null : String(c.new) }
        break
      case 'fte':
        next = { ...next, fte: c.new == null ? null : Number(c.new) }
        break
      case 'startDate':
        next = { ...next, startDate: c.new == null ? null : String(c.new) }
        break
    }
  }
  if (req.type === 'Trade' && requoted) {
    const count = changes.find((c) => c.field === 'count')
    next = { ...next, trade: { ...requoted, count: count ? Number(count.new) : requoted.count } }
  }
  return next
}

/** The current value of a changeable field (for the change list's "old"). */
function fieldValue(req: HcRequest, field: ChangeSet['changes'][number]['field']): string | number | null {
  switch (field) {
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

/** The trade fields a change or a re-quote can move, audited one entry each (count is logged with its reason). */
const TRADE_AUDITED = [
  'giveOrgPositionId',
  'restFte',
  'rateVersion',
  'rateHash',
  'giveBp',
  'getBp',
  'creditBp',
] as const satisfies readonly (keyof TradeFields)[]

/** Every step decided Approved (or with changes): a cycle ask whose manager approved it. */
const allApproved = (req: Pick<HcRequest, 'steps'>): boolean =>
  req.steps.every((s) => s.decision === 'Approved' || s.decision === 'Approved with changes')

/** Request types whose approval edits a seat with an accepted offer (C23); refused at every decision. */
const OFFER_EDITS: ReadonlySet<RequestType> = new Set<RequestType>([
  'Start date',
  'Level change',
  'Location change',
])

/**
 * Applies one action, or refuses it with a plain reason ("Only on steps assigned to you.",
 * ACCEPTED_OFFER_TEXT, REMOVE_AMOUNT_TEXT, ...). Submit computes the chain (`chainFor`) and enters
 * step 1; approving the last step applies the request (`applyApproval`) and records `outcome`.
 *
 * `at` is the business time (R47: the as-of date with the wall clock's time of day), which every date
 * the request stores takes; `auditAt` is the audit entries' own time (the wall clock), `at` when not
 * given. An addition to the contract: the optional `auditAt`.
 */
export function transition(
  req: HcRequest,
  action: RequestAction,
  actor: Actor,
  at: ISODateTime,
  ctx: TransitionContext,
  auditAt: ISODateTime = at,
): TransitionResult {
  const audit: AuditDraft[] = []
  const businessDate = dateOf(at)
  const log = (
    r: HcRequest,
    field: string,
    old: unknown,
    value: unknown,
    comment: { text: string; audience: CommentAudience } | null = null,
  ) => audit.push(requestAudit(r, actor, auditAt, field, old, value, comment, businessDate))
  const moveTo = (r: HcRequest, state: RequestState): HcRequest => {
    if (r.state !== state) log(r, 'state', r.state, state)
    return { ...r, state, updatedAt: at }
  }
  const done = (request: HcRequest, effects: PlanEffect[] = []): TransitionResult => ({
    request,
    audit,
    effects,
  })
  /** The trade fields a change or re-quote moved, one entry each. */
  const logTrade = (
    before: HcRequest,
    after: HcRequest,
    comment: { text: string; audience: CommentAudience } | null,
  ) => {
    const a = before.trade
    const b = after.trade
    if (!a || !b) return
    for (const f of TRADE_AUDITED)
      if ((a[f] ?? null) !== (b[f] ?? null)) log(after, f, a[f] ?? null, b[f] ?? null, comment)
  }
  /**
   * The HRBP's changes (approve with changes, or a cycle ask's changes): the changed request, with
   * its change set (a trade's credit before and after kept on it), each change audited with the
   * reason; or the refusal.
   */
  const changed = (
    changes: ChangeSet['changes'],
    reasonText: string,
    requoted: TradeFields | undefined,
  ): HcRequest | { refused: string } => {
    const reason = reasonText.trim()
    if (!reason) return { refused: 'Say why you changed it.' }
    if (ctx.hasAmount(reason)) return { refused: REMOVE_AMOUNT_TEXT }
    if (!changes.length) return { refused: 'Pick at least one change.' }
    const list = changes.map((c) => ({ ...c, old: fieldValue(req, c.field) }))
    const out = withChanges(req, list, requoted)
    if (typeof out === 'string') return { refused: out }
    const said = { text: reason, audience: 'everyone' as const }
    for (const c of list) log(out, c.field, c.old, c.new, said)
    logTrade(req, out, said)
    const prev = req.changes as TradeChangeSet | null
    const set: TradeChangeSet = prev
      ? { by: actor.personId, at, reason, changes: [...prev.changes, ...list] }
      : { by: actor.personId, at, reason, changes: list }
    const oldCredit = prev?.credit ? prev.credit.old : (req.trade?.creditBp ?? null)
    const newCredit = out.trade?.creditBp ?? null
    if (req.type === 'Trade' && oldCredit !== newCredit) set.credit = { old: oldCredit, new: newCredit }
    return { ...out, changes: set }
  }

  /** Approves the request for good: state, Working effects and outcome. */
  const finalApprove = (r: HcRequest): TransitionResult => {
    const site = locationRefusal(r, ctx.working, businessDate)
    if (site) return { refused: site }
    const applied = approvalOf(r, ctx.working, businessDate, auditAt)
    const created = applied.positions.filter((c) => c.kind === 'created').map((c) => c.row.positionId)
    const changedIds = [
      ...new Set(applied.positions.filter((c) => c.kind !== 'created').map((c) => c.row.positionId)),
    ]
    const approved = moveTo(r, r.changes ? 'Approved with changes' : 'Approved')
    audit.push(...applied.audit)
    return done(
      { ...approved, outcome: { createdPositionIds: created, changedPositionIds: changedIds } },
      applied.positions.map((change) => ({ kind: 'position', change })),
    )
  }

  switch (action.kind) {
    case 'submit':
    case 'resubmit': {
      if (action.kind === 'submit' && req.state !== 'Draft')
        return { refused: 'Only a draft can be submitted.' }
      if (action.kind === 'resubmit' && req.state !== 'Sent back')
        return { refused: 'Only a request sent back can be submitted again.' }
      let next: HcRequest = req
      if (action.kind === 'submit' && action.onBehalfOf != null && action.onBehalfOf !== actor.personId) {
        next = { ...next, requesterId: action.onBehalfOf, submittedById: actor.personId }
        log(next, 'submittedById', req.submittedById, actor.personId)
      } else if (!isRequester(req, actor)) {
        return { refused: 'Only the requester can submit this request.' }
      }
      const refusal = submitRefusal(next, ctx)
      if (refusal) return { refused: refusal }
      const steps = stepsFor(next, ctx, at)
      if (!steps.length && !isCycleAsk(next, ctx))
        return { refused: "No approver is set for this request's unit. HR admin sets them in Lists." }
      next = { ...next, steps, submittedAt: at }
      const chainText = (list: readonly Step[]) =>
        list.map((s) => `${s.role} ${s.approverId}`).join(', ') || null
      // A resubmit whose chain is the one it had writes no 'steps' entry (review SC-17).
      const before = chainText(req.steps)
      const after = chainText(steps)
      if (before !== after) log(next, 'steps', before, after)
      return done(moveTo(next, 'Submitted'))
    }

    case 'approve':
    case 'approve-with-changes':
    case 'send-back':
    case 'reject': {
      if (req.state !== 'Submitted' && req.state !== 'In review')
        return { refused: 'This request is not waiting on a decision.' }
      const i = currentStepIndex(req)
      if (i < 0)
        return {
          refused: isCycleAsk(req, ctx)
            ? 'This ask waits for the cycle to lock.'
            : 'This request has no step waiting on a decision.',
        }
      const step = req.steps[i]
      if (step.approverId !== actor.personId) return { refused: NOT_YOUR_STEP_TEXT }
      const decide = (r: HcRequest, decision: Step['decision'], note: string | null): HcRequest => ({
        ...r,
        steps: r.steps.map((s, k) => (k === i ? { ...s, decision, at, note } : s)),
      })

      if (action.kind === 'send-back' || action.kind === 'reject') {
        const reason = action.reason.trim()
        if (!reason)
          return {
            refused:
              action.kind === 'send-back'
                ? 'Say what to change before it comes back.'
                : 'Say why it is rejected.',
          }
        if (ctx.hasAmount(reason)) return { refused: REMOVE_AMOUNT_TEXT }
        const decision = action.kind === 'send-back' ? 'Sent back' : 'Rejected'
        const next = decide(req, decision, reason)
        log(next, `step ${step.n}`, null, decision, { text: reason, audience: 'everyone' })
        return done(moveTo(next, decision))
      }

      // A seat whose offer was accepted after the request was raised is refused at every approval
      // too (C23, review SC-5): its start and terms come from the recruiting system.
      if (ctx.seat?.acceptedOffer && OFFER_EDITS.has(req.type)) return { refused: ACCEPTED_OFFER_TEXT }

      let next: HcRequest = req
      if (action.kind === 'approve-with-changes') {
        if (step.role !== 'hrbp') return { refused: 'Only the HRBP step can approve with changes.' }
        const out = changed(action.changes, action.reason, action.requoted)
        if ('refused' in out) return out
        next = out
      }
      const decision = action.kind === 'approve-with-changes' ? 'Approved with changes' : 'Approved'
      const note = action.kind === 'approve-with-changes' ? action.reason.trim() : action.note?.trim() || null
      next = decide(next, decision, note)
      log(next, `step ${step.n}`, null, decision)
      if (i + 1 < next.steps.length) {
        next = { ...next, steps: next.steps.map((s, k) => (k === i + 1 ? { ...s, enteredAt: at } : s)) }
        return done(moveTo(next, 'In review'))
      }
      if (isCycleAsk(next, ctx)) return done(moveTo(next, 'In review'))
      return finalApprove(next)
    }

    case 'withdraw': {
      // An expired request (read Expired, stored Draft or Sent back) may be withdrawn too (D-EXPIRY).
      if (!['Draft', 'Submitted', 'In review', 'Sent back', 'Expired'].includes(req.state))
        return { refused: 'Only an open request can be withdrawn.' }
      if (!isRequester(req, actor)) return { refused: 'Only the requester can withdraw this request.' }
      return done(moveTo(req, 'Withdrawn'))
    }

    case 'comment': {
      const text = action.text.trim()
      if (!text) return { refused: 'Write a comment first.' }
      const audience: CommentAudience = ctx.hasAmount(text) ? 'approvers' : action.audience
      const comment = {
        id: ctx.newCommentId(req.requestId, req.comments.length + 1),
        at,
        by: actor.personId,
        mode: actor.mode,
        text,
        audience,
      }
      const next: HcRequest = { ...req, comments: [...req.comments, comment], updatedAt: at }
      log(next, 'comment', null, comment.id, { text, audience })
      return done(next)
    }

    case 'expire': {
      if (!isExpired(req, ctx.asOf, ctx.idleDays, ctx.cycleOpen))
        return { refused: `Only a draft or a request sent back, idle for ${ctx.idleDays} days, expires.` }
      return done(moveTo(req, 'Expired'))
    }

    case 'cycle-lock': {
      if (req.cycleId == null || !isPending(req))
        return { refused: 'Only cycle asks waiting on the lock are decided at the lock.' }
      // The lock decides only an ask its manager approved (10.3, R7, D-CYCLE).
      if (req.state === 'Sent back') return { refused: SENT_BACK_ASK_TEXT }
      if (!allApproved(req)) return { refused: WAITS_ON_MANAGER_TEXT }
      if (action.aboveCut) return finalApprove(req)
      const next: HcRequest = { ...req, reasonCode: BELOW_THE_CUT_LINE }
      log(next, 'reasonCode', req.reasonCode, BELOW_THE_CUT_LINE)
      return done(moveTo(next, 'Rejected'))
    }

    case 'cycle-changes': {
      if (req.cycleId == null || !ctx.cycleOpen || req.state !== 'In review' || !allApproved(req))
        return { refused: CYCLE_CHANGES_TEXT }
      if (ctx.seat?.acceptedOffer && OFFER_EDITS.has(req.type)) return { refused: ACCEPTED_OFFER_TEXT }
      const out = changed(action.changes, action.reason, action.requoted)
      if ('refused' in out) return out
      return done({ ...out, updatedAt: at })
    }
  }
}

/* ───────────── rows ───────────── */

const ROLE_CODE: Record<StepRole, StepRoleCode> = {
  Manager: 'manager',
  HRBP: 'hrbp',
  Leader: 'leader',
  Finance: 'finance',
}
const ROLE_NAME: Record<StepRoleCode, StepRole> = {
  manager: 'Manager',
  hrbp: 'HRBP',
  leader: 'Leader',
  finance: 'Finance',
}
const KIND_NAME: Record<'position' | 'internal', TransferKind> = {
  position: TRANSFER_KINDS[0],
  internal: TRANSFER_KINDS[1],
}

/** A requests row with the part-time rest seat's FTE (lead decision L2: an additive, optional column). */
type RowWithRest = RequestRow & { restFte?: number | null }

/** A `requests` row as plan state: steps parsed, trade and transfer fields grouped, blanks null. */
export function fromRow(row: RequestRow): HcRequest {
  const r = row as RowWithRest
  const isTrade = r.type === 'Trade' || !!r.givePositionIds
  const isTransfer = r.type === 'Transfer' || !!r.transferKind
  // The dataset keeps no step reasons; a freeze exception's Finance step is the one it names for
  // sure (10.4: "An exception adds a Finance step"), with a New role's own Finance reason (review SC-7).
  const financeReasons: ChainReason[] = r.exception
    ? [...(r.type === 'New role' ? (['new-role'] as const) : []), 'freeze-exception']
    : []
  const steps: Step[] = (r.steps ?? []).map((s, i) => ({
    n: i + 1,
    role: ROLE_CODE[s.role] ?? 'manager',
    approverId: s.approverId,
    reasons: ROLE_CODE[s.role] === 'finance' ? financeReasons : [],
    enteredAt: null,
    decision: s.decision === 'Pending' ? null : s.decision,
    at: s.at ?? null,
    note: null,
  }))
  // The step waiting on a decision is the first pending one of a request still in the chain.
  const open = PENDING_REQUEST_STATES.includes(r.state) && r.state !== 'Sent back'
  const waiting = open ? steps.findIndex((s) => s.decision == null) : -1
  if (waiting >= 0)
    steps[waiting] = { ...steps[waiting], enteredAt: steps[waiting - 1]?.at ?? r.submittedAt ?? null }
  return {
    requestId: r.requestId,
    type: r.type,
    state: r.state,
    reasonCode: r.reasonCode,
    requesterId: r.requesterId,
    submittedById: r.submittedById ?? null,
    submittedAt: r.submittedAt ?? null,
    updatedAt: r.updatedAt ?? r.submittedAt ?? '',
    positionId: r.positionId ?? null,
    managerPositionId: r.managerPositionId ?? '',
    businessUnit: r.businessUnit,
    department: r.department ?? null,
    costCenter: r.costCenter ?? null,
    level: r.level ?? null,
    location: r.location ?? null,
    jobTitle: r.jobTitle ?? null,
    fte: r.fte ?? null,
    startDate: r.startDate ?? null,
    priority: r.priority ?? null,
    cycleId: r.cycleId ?? null,
    confidential: r.confidential ?? false,
    exception: r.exception ? { freezeId: '', reason: '' } : null,
    steps,
    comments: [],
    changes: null,
    trade: isTrade
      ? {
          givePositionIds: splitIds(r.givePositionIds),
          giveOrgPositionId: r.giveOrgPositionId ?? null,
          creditUsedBp: r.creditUsedBp ?? 0,
          count: r.count ?? 0,
          jobFamily: r.jobFamily ?? null,
          partTimeRest: r.partTimeRest ?? false,
          restFte: r.restFte ?? null,
          rateVersion: r.rateVersion ?? null,
          rateHash: r.rateHash ?? null,
          giveBp: r.giveBp ?? null,
          getBp: r.getBp ?? null,
          creditBp: r.creditBp ?? null,
        }
      : null,
    transfer: isTransfer
      ? {
          kind: r.transferKind ? TRANSFER_KIND_CODE[r.transferKind] : 'position',
          personId: r.personId ?? '',
          fromPositionId: r.fromPositionId ?? r.positionId ?? '',
          toManagerPositionId: r.toManagerPositionId ?? null,
          toPositionId: r.toPositionId ?? null,
          effectiveDate: r.effectiveDate ?? r.startDate ?? '',
          moveBudget: r.moveBudget ?? false,
        }
      : null,
    outcome: null,
  }
}

/** A request as a `requests` row (templates, Export requests, the round trip test). */
export function toRow(req: HcRequest): RequestRow {
  const t = req.trade
  const x = req.transfer
  const row: RowWithRest = {
    requestId: req.requestId,
    type: req.type,
    state: req.state,
    reasonCode: req.reasonCode,
    requesterId: req.requesterId,
    submittedById: req.submittedById,
    submittedAt: req.submittedAt,
    updatedAt: req.updatedAt || null,
    positionId: req.positionId,
    businessUnit: req.businessUnit,
    department: req.department,
    costCenter: req.costCenter,
    managerPositionId: req.managerPositionId || null,
    level: req.level,
    location: req.location,
    jobTitle: req.jobTitle,
    fte: req.fte,
    startDate: req.startDate,
    priority: req.priority,
    cycleId: req.cycleId,
    steps: req.steps.map((s) => ({
      role: ROLE_NAME[s.role] ?? STEP_ROLES[0],
      approverId: s.approverId,
      decision: s.decision ?? 'Pending',
      at: s.decision && s.at ? dateOf(s.at) : null,
    })),
    confidential: req.confidential,
    exception: req.exception != null,
    givePositionIds: t ? t.givePositionIds.join(';') : null,
    giveOrgPositionId: t?.giveOrgPositionId ?? null,
    creditUsedBp: t ? t.creditUsedBp : null,
    count: t ? t.count : null,
    jobFamily: t?.jobFamily ?? null,
    partTimeRest: t ? t.partTimeRest : null,
    restFte: t?.restFte ?? null,
    rateVersion: t?.rateVersion ?? null,
    rateHash: t?.rateHash ?? null,
    giveBp: t?.giveBp ?? null,
    getBp: t?.getBp ?? null,
    creditBp: t?.creditBp ?? null,
    transferKind: x ? KIND_NAME[x.kind] : null,
    personId: x?.personId ?? null,
    fromPositionId: x?.fromPositionId ?? null,
    toManagerPositionId: x?.toManagerPositionId ?? null,
    toPositionId: x?.toPositionId ?? null,
    effectiveDate: x?.effectiveDate ?? null,
    moveBudget: x ? x.moveBudget : null,
  }
  return row
}

export type BackfillFlag = 'backfill-new-position' | 'backfill-no-exit'

/**
 * A Backfill's flag (15.1 R9): 'backfill-new-position' when the named seat was created within
 * `windowDays` (30) before or after a known exit in the same org and has no exit itself;
 * 'backfill-no-exit' when the seat has no exit; null otherwise.
 */
export function backfillFlag(
  req: HcRequest,
  ctx: {
    /** The seat's first row's effective date (when it was created). */
    createdOn(positionId: string): ISODate | null
    /** The seat's known exits (last days of its holders). */
    exitsOf(positionId: string): readonly ISODate[]
    /** Known exits in the same org as the seat (last days), for the 30-day window. */
    orgExits(positionId: string): readonly ISODate[]
    windowDays: number
  },
): BackfillFlag | null {
  if (req.type !== 'Backfill' || !req.positionId) return null
  if (ctx.exitsOf(req.positionId).length) return null
  const created = ctx.createdOn(req.positionId)
  if (
    created &&
    ctx.orgExits(req.positionId).some((e) => Math.abs(daysBetween(e, created)) <= ctx.windowDays)
  )
    return 'backfill-new-position'
  return 'backfill-no-exit'
}
