/**
 * What Plan > Positions, Plan > Transfers and My team need for the write path (docs/PLAN.md 8.3
 * `position.edit`, `transfer.process`, 9.4, 10.1, 10.5, C23, C24; M3 freeze). Pure over the analytics
 * context; the writes go through src/app/write/usePlanWrite.ts (`editSeat`, `processTransfer`).
 *
 * - seatEditOf: whether the Acting as person may edit a seat in Working, the values the form starts
 *   from, and why not (the policy's reason; SEAT_NOT_EDITABLE_TEXT; ACCEPTED_OFFER_TEXT for an
 *   accepted offer; WORKING_ONLY_TEXT on a locked version), so the grid offers the edit only where the
 *   action will take it.
 * - changedByHrbp: the notes a manager reads on a seat and in My team, "Changed by your HRBP: start
 *   moved from Jan to Mar", one per HRBP Working edit of the seat (audit entries written in HRBP mode
 *   on object 'position', read through `auditView` for the viewer), each with its reason (which holds
 *   no amount: refused at entry, 8.4 rule 5), newest first; never an amount, never a seat outside the
 *   manager's tree.
 * - transferOptions: who and where an HRBP may move (people in Filled seats in its unit, receiving
 *   manager positions and Open seats), and whether "Move budget too?" is offered (`transfer.move-budget`).
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the plan-ui builder fills the bodies.
 *
 * Readings taken here (plan-ui, M3):
 *  - The edit's reason, when the form opens, is the action's own: `seatEditOf` asks `editSeat` itself
 *    on the plan state in force (a dry run that writes nothing: an empty change reads "Change at least
 *    one field before saving.", which means the seat takes edits), after the policy and the version
 *    shown. A locked or retired version shown gives WORKING_ONLY_TEXT: edits change Working, not the
 *    version on screen. The list of seats a mode may edit (`seatEditsOf`) applies the same checks as
 *    the action without running it, and a test holds the two equal on every seat in every mode.
 *  - An edit takes effect on the as-of date, or on the seat's first day when the seat starts later
 *    (an FY28 seat is edited in FY28's Working, never given a row before it exists).
 *  - The form's start is the seat's planned start as the plan reads it now (an accepted offer's, its
 *    row's, or its replacement's); the edit writes the row's start only when the form changes it.
 *  - Eliminating a seat is a request (10.1): the form saves an Elimination draft (`request.draft`) for
 *    the HRBP to submit, offered where the action takes it (an accepted offer may still be eliminated).
 *  - Transfers move people in Filled seats of the scope (the whole company in HR admin) to a manager
 *    position or an Open seat anywhere: the receiving side may be another unit (10.5).
 */
import { actionContextOf, actionEnvOf, personRulesOf } from '@/app/write/context'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf } from '@/data/fiscal'
import {
  type ISODate,
  LEVELS,
  type Level,
  type PositionStatus,
  REASON_CODES_OF,
  type ReasonCode,
  SITES,
} from '@/data/schema'
import { holderNamesOf, seatStateOf, workerNames } from '@/drill/seats'
import { addDays, monthEnd } from '@/lib/dates'
import {
  type ActionContext,
  type EliminationInput,
  editSeat,
  NO_SEAT_CHANGE_TEXT,
  requestElimination,
  type SeatChanges,
  type SeatEditInput,
  type TransferInput,
  WORKING_ONLY_TEXT,
} from '@/plan/actions'
import { workingOf } from '@/plan/engine/versions'
import type { PlanState } from '@/plan/types'
import { notesOf } from './notes'

/** A seat's edit form, or why it cannot be edited here. */
export interface SeatEditFacts {
  positionId: string
  /** The edit may be offered (the action would take it, given a reason). */
  editable: boolean
  /** Why not, in the action's own words; null when editable. */
  why: string | null
  /** The values the form starts from (the seat on the as-of date in Working). */
  current: { startDate: ISODate | null; level: Level; location: string; fte: number; onHold: boolean }
  /** The locations and levels the form may pick (Lists). */
  locations: readonly string[]
  levels: readonly Level[]
  /** The seat's title, for the form's heading (null when the data names none). */
  title: string | null
  /** The seat's derived status on the as-of date (or its first day); null for a seat the data lacks. */
  status: PositionStatus | null
  /** The seat has an accepted offer (C23): no Working edit, an Elimination only. */
  acceptedOffer: boolean
  /** The day the edit takes effect: the as-of date, or the seat's first day when it starts later. */
  effectiveDate: ISODate
  /** "Eliminate this seat": an Elimination draft (`request.draft`), and why not. */
  eliminate: EliminateFacts
}

/** The Elimination a seat's form may save as a draft. */
export interface EliminateFacts {
  offered: boolean
  why: string | null
  /** The reason codes an Elimination takes. */
  reasonCodes: readonly ReasonCode[]
}

/** One "Changed by your HRBP" note. */
export interface HrbpChangeNote {
  positionId: string
  at: string
  /** "Changed by your HRBP: start moved from Jan to Mar". */
  text: string
  /** The edit's reason, as the viewer may read it. */
  reason: string | null
}

/** The transfer form's choices for the Acting as HRBP. */
export interface TransferOptions {
  /** People in Filled seats in scope who may move, by their seat. */
  people: readonly { personId: string; name: string; positionId: string }[]
  /** Manager positions a position move may go under. */
  managers: readonly { positionId: string; label: string }[]
  /** Open seats an internal move may fill (no accepted offer). */
  openSeats: readonly { positionId: string; label: string }[]
  /** "Move budget too?" is offered (`transfer.move-budget` not hidden). */
  moveBudget: boolean
  /** Why the form is not offered at all (the policy's reason), or null. */
  why: string | null
  /** The mode processes transfers (`transfer.process` not hidden), whether or not a write is blocked now. */
  offered: boolean
  /** The reason codes a Transfer takes. */
  reasonCodes: readonly ReasonCode[]
  /** The first day the form suggests: the first of the month after the as-of date. */
  effectiveDate: ISODate
}

/** One seat a mode may edit, for the picker on Plan > Positions. */
export interface SeatChoice {
  positionId: string
  /** "Senior verification engineer (P-2589)". */
  label: string
  status: PositionStatus
}

/** Plan > Positions: whether Working edits are offered here, and the seats they may change. */
export interface SeatEdits {
  /** The mode makes Working edits (the policy does not hide `position.edit`): the edit button shows. */
  offered: boolean
  /**
   * Why no seat can be edited now (the policy's reason where it hides the edit, the Acting as block,
   * WORKING_ONLY_TEXT for a locked or retired version shown), or null.
   */
  why: string | null
  /** Open seats with no accepted offer, Planned seats and On hold seats the action takes, in ID order. */
  seats: readonly SeatChoice[]
  /**
   * The scope's other seats that are not Eliminated (Filled seats, accepted offers), in ID order: the
   * form lists them to say why they take no Working edit and to offer their Elimination instead.
   */
  others: readonly SeatChoice[]
}

/** What the form holds when it is saved. */
export interface SeatForm {
  startDate: ISODate | null
  level: Level
  location: string
  fte: number
  onHold: boolean
}

/* ───────────── helpers ───────────── */

const LOCATIONS: readonly string[] = [...new Set(SITES.map((s) => s.location))].sort()
const DRY_REASON = 'Check'

const later = (a: ISODate, b: ISODate | null): ISODate => (b && b > a ? b : a)

/** The plan state in force, or null before one is loaded. */
const stateOf = (ctx: AnalyticsContext): PlanState | null => (ctx.plan as PlanState | null) ?? null

/** The action context the write hook would build for this analytics context (a reader tab aside). */
function dryContext(ctx: AnalyticsContext): ActionContext {
  return actionContextOf(ctx, { readOnly: false, at: `${ctx.asOf}T00:00:00.000Z` })
}

/** A seat's first day in the data (its earliest row), or null. */
function firstDayOf(ctx: AnalyticsContext, positionId: string): ISODate | null {
  let first: ISODate | null = null
  for (const r of ctx.all.positions)
    if (r.positionId === positionId && (first === null || r.effectiveDate < first)) first = r.effectiveDate
  return first
}

/** The policy's word on an id: its reason when hidden, then the Acting as block, else null. */
function blockedBy(ctx: AnalyticsContext, id: string): string | null {
  const d = ctx.access.decide(`action:${id}`)
  if (d.access === 'hidden') return d.how ?? 'This change is not made in this mode.'
  return dryContext(ctx).writeBlock
}

/** Edits change Working: a locked or retired version on screen gives WORKING_ONLY_TEXT. */
const versionBlock = (ctx: AnalyticsContext): string | null =>
  ctx.version && ctx.version.state !== 'working' ? WORKING_ONLY_TEXT : null

/**
 * "Senior verification engineer (P-2589)": the title first, so a position number never sits beside a
 * word that reads as a currency code ("P-2269 CAD Infrastructure Engineer" would read as an amount).
 */
const seatLabel = (positionId: string, title: string | null | undefined): string =>
  title ? `${title} (${positionId})` : positionId

/* ───────────── seat edits ───────────── */

/** Plan > Positions: the edit form for one seat. */
export function seatEditOf(ctx: AnalyticsContext, positionId: string): SeatEditFacts {
  const env = actionEnvOf(ctx)
  const seat = env.seat(positionId)
  const first = firstDayOf(ctx, positionId)
  const effectiveDate = later(ctx.asOf, first)
  const st = seatStateOf(ctx, positionId) ?? (first ? seatStateOf(ctx, positionId, first) : null)
  const status = seat?.status ?? null
  const current: SeatEditFacts['current'] = {
    startDate: seat?.startDate ?? null,
    level: seat?.level ?? 'P1',
    location: seat?.location ?? '',
    fte: seat?.fte ?? 1,
    onHold: status === 'On hold',
  }
  const state = stateOf(ctx)
  const actx = dryContext(ctx)

  let why: string | null = blockedBy(ctx, 'position.edit') ?? versionBlock(ctx)
  if (!why) {
    if (!state) why = WORKING_ONLY_TEXT
    else {
      const out = editSeat(state, actx, {
        positionId,
        effectiveDate,
        changes: status === 'On hold' ? { onHold: false } : {},
        reason: DRY_REASON,
      })
      why = out.ok || out.refused === NO_SEAT_CHANGE_TEXT ? null : out.refused
    }
  }

  let eliminateWhy: string | null = blockedBy(ctx, 'request.draft')
  if (!eliminateWhy) {
    if (!state) eliminateWhy = WORKING_ONLY_TEXT
    else {
      const out = requestElimination(state, actx, { positionId, reasonCode: 'Restructure', lastDay: null })
      eliminateWhy = out.ok ? null : out.refused
    }
  }

  return {
    positionId,
    editable: why === null,
    why,
    current,
    locations: LOCATIONS,
    levels: LEVELS,
    title: st?.position.title ?? null,
    status,
    acceptedOffer: seat?.acceptedOffer ?? false,
    effectiveDate,
    eliminate: {
      offered: eliminateWhy === null,
      why: eliminateWhy,
      reasonCodes: REASON_CODES_OF.Elimination,
    },
  }
}

const editsMemo = new WeakMap<AnalyticsContext, SeatEdits>()

/**
 * Plan > Positions: the seats the Acting as person may edit, with the action's own checks (the
 * policy, the unit for a limited HRBP, the seat's status, an accepted offer, a Working for the edit's
 * year), without running it. Memoized per context.
 */
export function seatEditsOf(ctx: AnalyticsContext): SeatEdits {
  const hit = editsMemo.get(ctx)
  if (hit) return hit
  const why =
    blockedBy(ctx, 'position.edit') ?? versionBlock(ctx) ?? (stateOf(ctx) ? null : WORKING_ONLY_TEXT)
  const offered = ctx.access.decide('action:position.edit').access !== 'hidden'
  let out: SeatEdits
  if (why) out = { offered, why, seats: [], others: [] }
  else {
    const env = actionEnvOf(ctx)
    const rules = personRulesOf(ctx)
    const limited = ctx.access.decide('action:position.edit').access === 'limited'
    const versions = stateOf(ctx)?.versions ?? []
    const ids = [...new Set(ctx.data.positions.map((r) => r.positionId))].sort()
    const firsts = new Map<string, ISODate>()
    for (const r of ctx.all.positions) {
      const f = firsts.get(r.positionId)
      if (!f || r.effectiveDate < f) firsts.set(r.positionId, r.effectiveDate)
    }
    const seats: SeatChoice[] = []
    const others: SeatChoice[] = []
    for (const id of ids) {
      const seat = env.seat(id)
      if (!seat) continue
      if (limited && (!rules.seatInScope(id) || !rules.unitInScope(seat.businessUnit))) continue
      const on = later(ctx.asOf, firsts.get(id) ?? null)
      const st = seatStateOf(ctx, id) ?? seatStateOf(ctx, id, on)
      const choice = { positionId: id, label: seatLabel(id, st?.position.title), status: seat.status }
      const takes =
        !seat.acceptedOffer &&
        (seat.status === 'Open' || seat.status === 'Planned' || seat.status === 'On hold') &&
        !!workingOf(versions, fiscalYearOf(on))
      if (takes) seats.push(choice)
      else if (seat.status !== 'Eliminated') others.push(choice)
    }
    out = { offered, why: null, seats, others }
  }
  editsMemo.set(ctx, out)
  return out
}

/** The fields the form changed against the seat's current values (a field left as it was is not sent). */
export function seatChangesOf(current: SeatEditFacts['current'], form: SeatForm): SeatChanges {
  const out: SeatChanges = {}
  if ((form.startDate || null) !== (current.startDate || null)) out.startDate = form.startDate || null
  if (form.level !== current.level) out.level = form.level
  if (form.location !== current.location) out.location = form.location
  if (Math.abs(form.fte - current.fte) > 1e-9) out.fte = form.fte
  if (form.onHold !== current.onHold) out.onHold = form.onHold
  return out
}

/** The `editSeat` input for a saved form: the changed fields, the effective date and the reason. */
export function seatEditInputOf(facts: SeatEditFacts, form: SeatForm, reason: string): SeatEditInput {
  return {
    positionId: facts.positionId,
    effectiveDate: facts.effectiveDate,
    changes: seatChangesOf(facts.current, form),
    reason,
  }
}

/** The `requestElimination` input for the form's "Eliminate this seat". */
export function eliminationInputOf(
  facts: SeatEditFacts,
  reasonCode: ReasonCode,
  lastDay: ISODate | null,
  confidential: boolean,
): EliminationInput {
  return { positionId: facts.positionId, reasonCode, lastDay, confidential }
}

/** The request ID a draft's notice names ("Draft R-1131 saved.", "Transfer R-1131 saved as a draft."), or null. */
export function requestIdIn(notice: string): string | null {
  return /\bR-[0-9A-Za-z]+(?:-[0-9A-Za-z]+)*\b/.exec(notice)?.[0] ?? null
}

/** The "Changed by your HRBP" notes for a seat, as the viewer may read them, newest first. */
export function changedByHrbp(ctx: AnalyticsContext, positionId: string): readonly HrbpChangeNote[] {
  return notesOf(ctx, positionId)
}

/* ───────────── transfers ───────────── */

const transferMemo = new WeakMap<AnalyticsContext, TransferOptions>()

/** Plan > Transfers: the choices of the transfer form. */
export function transferOptions(ctx: AnalyticsContext): TransferOptions {
  const hit = transferMemo.get(ctx)
  if (hit) return hit
  const why = blockedBy(ctx, 'transfer.process')
  const effectiveDate = addDays(monthEnd(ctx.asOf), 1)
  const moveBudget = ctx.access.decide('action:transfer.move-budget').access !== 'hidden'
  const offered = ctx.access.decide('action:transfer.process').access !== 'hidden'
  const base = { moveBudget, offered, reasonCodes: REASON_CODES_OF.Transfer, effectiveDate }
  if (why) {
    const out: TransferOptions = { ...base, people: [], managers: [], openSeats: [], why }
    transferMemo.set(ctx, out)
    return out
  }
  const names = workerNames(ctx)
  const holders = holderNamesOf(ctx)
  const people: { personId: string; name: string; positionId: string }[] = []
  for (const id of [...new Set(ctx.data.positions.map((r) => r.positionId))].sort()) {
    const st = seatStateOf(ctx, id)
    if (st?.status !== 'Filled' || st.position.workerType !== 'Employee') continue
    for (const personId of st.holderIds)
      people.push({ personId, name: names.get(personId) ?? personId, positionId: id })
  }
  // Every seat that has a report on the as-of date is a manager position; any Open seat may receive.
  const reports = new Set<string>()
  const ids = [...ctx.positionIndex.byId.keys()].sort()
  for (const id of ids) {
    const m = ctx.positionIndex.byId.get(id)?.managerPositionId
    if (m && m !== id) reports.add(m)
  }
  const managers: { positionId: string; label: string }[] = []
  const openSeats: { positionId: string; label: string }[] = []
  for (const id of ids) {
    const st = seatStateOf(ctx, id)
    if (!st || st.status === 'Eliminated') continue
    const r = st.position
    const org = [r.businessUnit, r.department].filter(Boolean).join(' · ')
    if (reports.has(id)) {
      const who = holders.get(id)
      managers.push({ positionId: id, label: [seatLabel(id, r.title), who, org].filter(Boolean).join(', ') })
    }
    if (st.status === 'Open' && !st.acceptedOffer && r.workerType === 'Employee')
      openSeats.push({ positionId: id, label: `${seatLabel(id, r.title)}, ${org}` })
  }
  const out: TransferOptions = { ...base, people, managers, openSeats, why: null }
  transferMemo.set(ctx, out)
  return out
}

/** What the transfer form holds when it is saved. */
export interface TransferForm {
  kind: 'position' | 'internal'
  personId: string
  /** The receiving manager position (a position move) or Open seat (an internal move). */
  toId: string
  effectiveDate: ISODate
  moveBudget: boolean
  reasonCode: ReasonCode
}

/** The `processTransfer` input for a saved form (the person's seat from the options), or null when unknown. */
export function transferInputOf(options: TransferOptions, form: TransferForm): TransferInput | null {
  const who = options.people.find((p) => p.personId === form.personId)
  if (!who || !form.toId) return null
  return {
    kind: form.kind,
    personId: who.personId,
    fromPositionId: who.positionId,
    ...(form.kind === 'position' ? { toManagerPositionId: form.toId } : { toPositionId: form.toId }),
    effectiveDate: form.effectiveDate,
    moveBudget: options.moveBudget && form.moveBudget,
    reasonCode: form.reasonCode,
  }
}
