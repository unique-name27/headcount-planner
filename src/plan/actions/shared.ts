/**
 * What the actions share (src/plan/actions/*): the result builders, finding a request in force,
 * writing requests and overlay rows into plan state, the request audit drafts, the person-level and
 * scope checks every request action runs after the gate, expiry, freezes at submit, a trade's quote
 * fields and the position tree the target and freeze tests walk. Pure; an addition to the M3 freeze's
 * files (core).
 */
import { fiscalYearOf } from '@/data/fiscal'
import {
  APPROVED_REQUEST_STATES,
  type AssumptionRow,
  type FiscalYear,
  type FreezeRow,
  type ISODate,
  type ISODateTime,
  PENDING_REQUEST_STATES,
  type PositionRow,
  type TargetRow,
} from '@/data/schema'
import { canonicalJson } from '../canonical'
import { freezeNotice, freezeOn } from '../engine/freeze'
import { type ExpiryInput, isExpired } from '../engine/requests'
import type { TradeAsk, TradeQuote } from '../engine/trade'
import { overlayRows } from '../store/overlay'
import type {
  AuditDraft,
  AuditObject,
  CommentAudience,
  Cycle,
  HcRequest,
  PlanEffect,
  PlanState,
  SeatPlace,
  TradeFields,
  WorkingPlan,
} from '../types'
import { expiredText, NOT_FOUND_TEXT, OUTSIDE_SCOPE_TEXT } from './copy'
import type { ActionContext, ActionOk, ActionRefused } from './types'

/* ───────────── results ───────────── */

export const ok = (
  next: PlanState,
  audit: AuditDraft[],
  notice: string,
  datasets?: ActionOk['datasets'],
): ActionOk => ({ ok: true, next, audit, notice, ...(datasets ? { datasets } : {}) })

export const no = (refused: string): ActionRefused => ({ ok: false, refused })

/* ───────────── the business date (15.1 R47) ───────────── */

/**
 * A write's business time (15.1 R47, lead decision): the as-of date with the wall clock's time of
 * day, so writes on one day keep their order. Every business date a write stores (submitted, updated
 * for idle expiry, each step's entered and decided dates, comments, change sets, approval and
 * effective dates, cycle dates) is it; the audit entry's own `at` stays the wall clock (`ctx.at`).
 * The write path may set it on the context as `businessAt` (src/app/write/context.ts); otherwise it
 * is derived here the same way.
 */
export function businessAt(
  ctx: Pick<ActionContext, 'at' | 'asOf'> & { businessAt?: ISODateTime },
): ISODateTime {
  if (ctx.businessAt) return ctx.businessAt
  const t = ctx.at.indexOf('T')
  return `${ctx.asOf}${t >= 0 ? ctx.at.slice(t) : 'T00:00:00.000Z'}`
}

/** A write's business date: the as-of date (R47). */
export const businessDate = (ctx: Pick<ActionContext, 'asOf'>): ISODate => ctx.asOf

/* ───────────── requests ───────────── */

/**
 * The request with an ID as plan state stores it: plan state's own copy, else the one in force (an
 * imported row); null when none. A reader may show the copy in force as Expired (requests.ts
 * `withEffectiveStates`); the action reads the stored state, so nothing ever stores Expired.
 */
export function findRequest(state: PlanState, ctx: ActionContext, requestId: string): HcRequest | null {
  const own = state.requests.find((r) => r.requestId === requestId)
  if (own) return own
  const inForce = ctx.env.requests.find((r) => r.requestId === requestId) ?? null
  if (inForce?.state === 'Expired') {
    const row = ctx.datasets.requests.find((r) => r.requestId === requestId)
    if (row && row.state !== 'Expired') return { ...inForce, state: row.state }
  }
  return inForce
}

/** What expiry reads for the context (requests.ts `ExpiryInput`): the as-of date, the idle days, the cycles. */
export const expiryOf = (state: PlanState, ctx: ActionContext): ExpiryInput => ({
  asOf: ctx.asOf,
  idleDays: ctx.settings.idleDays,
  cycles: state.cycles,
})

/** Plan state with requests written in: each replaces the row with its ID, new ones follow. */
export function putRequests(state: PlanState, reqs: readonly HcRequest[]): PlanState {
  if (!reqs.length) return state
  const byId = new Map(reqs.map((r) => [r.requestId, r]))
  const out = state.requests.map((r) => byId.get(r.requestId) ?? r)
  const known = new Set(state.requests.map((r) => r.requestId))
  for (const r of reqs) if (!known.has(r.requestId)) out.push(r)
  return { ...state, requests: out }
}

export const putRequest = (state: PlanState, req: HcRequest): PlanState => putRequests(state, [req])

/**
 * The wall-clock stamps of a write (M3 recheck): every request the result changes takes `ctx.at` as
 * its `revisedAt`, and a request new to the workspace takes it as its `createdAt` too. `updatedAt`
 * stays the business time (R47, idle expiry); merge.ts compares `revisedAt`, since two business
 * times on one as-of date can run backwards across wall-clock days. A request written back with the
 * same content is left as it is.
 */
export function withRevisions(state: PlanState, ctx: ActionContext, result: ActionOk): ActionOk {
  const before = new Map<string, HcRequest>()
  for (const r of ctx.env.requests) before.set(r.requestId, r)
  for (const r of state.requests) before.set(r.requestId, r)
  let changed = false
  const requests = result.next.requests.map((r) => {
    const prev = before.get(r.requestId)
    if (prev === r || (prev && canonicalJson(prev) === canonicalJson(r))) return r
    changed = true
    return { ...r, revisedAt: ctx.at, ...(prev || r.createdAt ? {} : { createdAt: ctx.at }) }
  })
  return changed ? { ...result, next: { ...result.next, requests } } : result
}

/** A new request in Draft, the Acting as person its requester. */
export function newRequest(
  ctx: ActionContext,
  over: Partial<HcRequest> & Pick<HcRequest, 'type' | 'reasonCode'>,
  n = 1,
): HcRequest {
  return {
    requestId: ctx.env.ids.request(n),
    state: 'Draft',
    requesterId: ctx.actor.personId,
    submittedById: null,
    submittedAt: null,
    updatedAt: businessAt(ctx),
    positionId: null,
    managerPositionId: '',
    businessUnit: '',
    department: null,
    costCenter: null,
    level: null,
    location: null,
    jobTitle: null,
    fte: null,
    startDate: null,
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
    ...over,
  }
}

/** An audit draft by the Acting as person: `at` the wall clock, its effective date the business date unless given (R47). */
export function auditOf(
  ctx: ActionContext,
  object: AuditObject,
  id: string,
  field: string,
  old: unknown,
  value: unknown,
  extra: { effectiveDate?: ISODate | null; comment?: string | null; audience?: CommentAudience | null } = {},
): AuditDraft {
  return {
    at: ctx.at,
    by: ctx.actor.personId,
    byName: ctx.actor.name,
    mode: ctx.actor.mode,
    object,
    id,
    field,
    old: old ?? null,
    new: value ?? null,
    effectiveDate: extra.effectiveDate !== undefined ? extra.effectiveDate : businessDate(ctx),
    comment: extra.comment ?? null,
    commentAudience: extra.audience ?? null,
  }
}

/** The request entry a new draft writes: its state, from nothing to Draft. */
export const draftAudit = (ctx: ActionContext, req: HcRequest): AuditDraft =>
  auditOf(ctx, 'request', req.requestId, 'state', null, 'Draft')

/**
 * 8.4 rules 3 and 6: a request the viewer may not see is never acted on, and the words say nothing.
 * A hidden request is refused with the very sentence an unknown ID gets (M3 review SC-13), so the
 * answer never tells that a request stands behind an ID.
 */
export function seenRefusal(ctx: ActionContext, req: HcRequest | null): string | null {
  if (!req) return NOT_FOUND_TEXT
  return ctx.rules.requestView(req) === 'none' ? NOT_FOUND_TEXT : null
}

/** The seats a request names (its seat, a trade's give seats, a transfer's from seat). */
export function touchedSeats(req: HcRequest): string[] {
  return [req.positionId, ...(req.trade?.givePositionIds ?? []), req.transfer?.fromPositionId].filter(
    (x): x is string => !!x,
  )
}

/**
 * A request inside the mode's scope (the limited rule of request.draft, submit, withdraw, freeze
 * exceptions, trades): a new seat's manager position, or every seat it names, in the team or org.
 */
export function inScope(ctx: ActionContext, req: HcRequest): boolean {
  const r = ctx.rules
  if (req.type === 'New role') return r.placeInScope(req.managerPositionId)
  if (req.type === 'Trade') {
    const give = req.trade?.givePositionIds ?? []
    return (
      give.every((id) => r.seatInScope(id)) &&
      (!req.managerPositionId || r.placeInScope(req.managerPositionId))
    )
  }
  if (req.type === 'Transfer') return !!req.transfer && r.seatInScope(req.transfer.fromPositionId)
  if (req.positionId) return r.seatInScope(req.positionId)
  return !!req.managerPositionId && r.placeInScope(req.managerPositionId)
}

export const scopeRefusal = (ctx: ActionContext, req: HcRequest): string | null =>
  inScope(ctx, req) ? null : OUTSIDE_SCOPE_TEXT

/** The cycle a request is an ask in, when it has one. */
export const cycleOf = (state: PlanState, req: Pick<HcRequest, 'cycleId'>): Cycle | null =>
  req.cycleId ? (state.cycles.find((c) => c.cycleId === req.cycleId) ?? null) : null

/** A request in a cycle that is not Locked never expires (15.1 R6). */
export const inOpenCycle = (state: PlanState, req: HcRequest): boolean => {
  const c = cycleOf(state, req)
  return !!c && c.stage !== 'Locked'
}

/**
 * A Draft or Sent back request idle for the idle days (against the as-of date) reads Expired (10.1,
 * R6) and is not edited, submitted or decided: the refusal names the days. Nothing writes the Expired
 * state (it is no person's action); every reader reads it at read time through requests.ts
 * `effectiveState`. Its requester may still withdraw it (D-EXPIRY).
 */
export function expiredRefusal(ctx: ActionContext, state: PlanState, req: HcRequest): string | null {
  return isExpired(req, ctx.asOf, ctx.settings.idleDays, inOpenCycle(state, req))
    ? expiredText(ctx.settings.idleDays)
    : null
}

/**
 * The approved internal move that holds a receiving seat until HRIS shows the move (review SC-6):
 * the move wrote the seat's Filled row, and with nobody on it yet the seat reads Open (R31). Such a
 * seat is not offered for trades, transfers, Backfills, Eliminations, seat edits or What if. Null
 * when no approved move holds it, or once someone holds it (it reads Filled).
 */
export function heldForTransfer(ctx: ActionContext, positionId: string): HcRequest | null {
  const seat = ctx.env.seat(positionId)
  if (!seat || seat.status === 'Filled') return null
  return approvedMoveTo(ctx.env.requests, positionId)
}

/** The approved internal move whose receiving seat is this one, or null (pure; `heldForTransfer` adds the seat's status). */
export function approvedMoveTo(requests: readonly HcRequest[], positionId: string): HcRequest | null {
  return (
    requests.find(
      (r) =>
        r.type === 'Transfer' &&
        r.transfer?.kind === 'internal' &&
        r.transfer.toPositionId === positionId &&
        APPROVED_REQUEST_STATES.includes(r.state),
    ) ?? null
  )
}

/** The words for a seat an approved internal move holds: the move's ID only for a viewer who sees it in full. */
export const heldSeatText = (move: Pick<HcRequest, 'requestId'>, shownInFull: boolean): string =>
  shownInFull
    ? `This seat is held for ${move.requestId}, an approved transfer, until HRIS shows the move.`
    : 'This seat is held for an approved transfer until HRIS shows the move.'

/** The refusal for a seat an approved internal move holds: it names the move when the viewer sees it in full. */
export function heldSeatRefusal(ctx: ActionContext, positionId: string): string | null {
  const move = heldForTransfer(ctx, positionId)
  if (!move) return null
  return heldSeatText(move, ctx.rules.requestView(move) === 'full')
}

export const isPendingState = (r: Pick<HcRequest, 'state'>): boolean =>
  PENDING_REQUEST_STATES.includes(r.state)
export const isApprovedState = (r: Pick<HcRequest, 'state'>): boolean =>
  APPROVED_REQUEST_STATES.includes(r.state)

/** The fiscal year a request belongs to: a transfer's effective date, its start, else the as-of date's. */
export function requestYear(req: HcRequest, asOf: ISODate): FiscalYear {
  return fiscalYearOf(req.transfer?.effectiveDate || req.startDate || asOf)
}

/** The request fields that say where its seat sits. */
type PlacedRequest = Pick<
  HcRequest,
  'type' | 'positionId' | 'managerPositionId' | 'businessUnit' | 'department' | 'costCenter' | 'startDate'
>

/** Where a request's seat sits (a new seat: its manager position places it). */
export function placeOfRequest(req: PlacedRequest): SeatPlace {
  return {
    positionId: req.type === 'New role' || req.type === 'Trade' ? null : req.positionId,
    managerPositionId: req.managerPositionId || null,
    businessUnit: req.businessUnit,
    department: req.department,
    costCenter: req.costCenter,
  }
}

/* ───────────── the position tree ───────────── */

const latestMemo = new WeakMap<readonly PositionRow[], ReadonlyMap<string, PositionRow>>()

/** Each position's latest row (orgs join at read time, R26). */
export function latestRows(positions: readonly PositionRow[]): ReadonlyMap<string, PositionRow> {
  let hit = latestMemo.get(positions)
  if (!hit) {
    const m = new Map<string, PositionRow>()
    for (const r of positions) {
      const cur = m.get(r.positionId)
      if (!cur || r.effectiveDate >= cur.effectiveDate) m.set(r.positionId, r)
    }
    hit = m
    latestMemo.set(positions, hit)
  }
  return hit
}

/** The positions above a position by the latest rows, nearest first (cycle-safe). */
export function ancestorsOf(positions: readonly PositionRow[]): (positionId: string) => string[] {
  const latest = latestRows(positions)
  return (id) => {
    const out: string[] = []
    const seen = new Set<string>([id])
    let cur = latest.get(id)?.managerPositionId ?? null
    while (cur && !seen.has(cur)) {
      out.push(cur)
      seen.add(cur)
      cur = latest.get(cur)?.managerPositionId ?? null
    }
    return out
  }
}

/** Whether a position sits strictly below a root (by the latest rows; the date is read as now). */
export function inTreeOf(
  positions: readonly PositionRow[],
): (id: string, root: string, on: ISODate) => boolean {
  const up = ancestorsOf(positions)
  return (id, root) => up(id).includes(root)
}

/* ───────────── freezes ───────────── */

/** The org a freeze names, for its notice: the leader's org, the cost center, the department or the unit. */
const freezeOrgLabel = (f: FreezeRow): string => f.department || f.costCenter || f.businessUnit

/**
 * 10.4: a New role or a Backfill (unless the freeze allows backfills) raised in an org frozen on its
 * start date (else the as-of date) needs an exception with a business reason; the refusal is the
 * freeze's own notice. A trade's get seats are checked by its quote ('frozen').
 */
export function freezeRefusal(ctx: ActionContext, req: HcRequest): string | null {
  if (req.exception) return null
  if (req.type !== 'New role' && req.type !== 'Backfill') return null
  const on = req.startDate ?? ctx.asOf
  const f = freezeOn(ctx.datasets.freezes, placeOfRequest(req), on, inTreeOf(ctx.datasets.positions))
  if (!f) return null
  if (req.type === 'Backfill' && f.allowBackfill) return null
  return freezeNotice(freezeOrgLabel(f), f)
}

/** The freeze covering a request's place on its start date (else the as-of date), or null. */
export function freezeOfRequest(ctx: ActionContext, req: PlacedRequest): FreezeRow | null {
  return freezeOn(
    ctx.datasets.freezes,
    placeOfRequest(req),
    req.startDate ?? ctx.asOf,
    inTreeOf(ctx.datasets.positions),
  )
}

/* ───────────── trades ───────────── */

/** A trade request's ask, as Requests > New and the quote read it. */
export function askOf(req: HcRequest): TradeAsk | null {
  const t = req.trade
  if (req.type !== 'Trade' || !t || !req.level || !req.location || !req.startDate) return null
  return {
    give: t.givePositionIds,
    creditUsedBp: t.creditUsedBp,
    giveOrgPositionId: t.giveOrgPositionId,
    get: {
      level: req.level,
      location: req.location,
      fte: req.fte ?? 1,
      orgPositionId: req.managerPositionId,
      businessUnit: req.businessUnit,
      jobFamily: t.jobFamily,
      start: req.startDate,
      count: t.count > 0 ? t.count : 'max',
      partTimeRest: t.partTimeRest,
    },
    ...(req.exception ? { freezeException: { reason: req.exception.reason } } : {}),
  }
}

/** The fields a quote stores on a trade (11.4): weights, credit, the rest seat and the rates. */
export function quoteFields(
  ask: TradeAsk,
  q: TradeQuote,
  t: Pick<TradeFields, 'jobFamily'> | null = null,
): TradeFields {
  const last = q.get.at(-1)
  const restFte = ask.get.partTimeRest && last && last.fte < ask.get.fte - 1e-9 ? last.fte : null
  return {
    givePositionIds: [...ask.give],
    giveOrgPositionId: q.giveOrgPositionId || ask.giveOrgPositionId,
    creditUsedBp: ask.creditUsedBp,
    count: q.get.length - (restFte != null ? 1 : 0),
    jobFamily: ask.get.jobFamily ?? t?.jobFamily ?? null,
    partTimeRest: ask.get.partTimeRest,
    restFte,
    rateVersion: q.rates.version,
    rateHash: q.rates.lockHash,
    giveBp: q.giveBp,
    getBp: q.getBp,
    creditBp: q.creditBp,
  }
}

/** The quote's first block, in TRADE_BLOCK_ORDER, as the refusal. */
export const quoteRefusal = (q: TradeQuote): string | null =>
  q.ok ? null : (q.blocks[0]?.text ?? 'This trade does not balance.')

/** The audit drafts for the trade fields a re-quote changed (bp fields show outside HR admin). */
export function tradeFieldAudit(ctx: ActionContext, req: HcRequest, next: TradeFields): AuditDraft[] {
  const t = req.trade
  const out: AuditDraft[] = []
  const fields = [
    'giveOrgPositionId',
    'count',
    'restFte',
    'rateVersion',
    'rateHash',
    'giveBp',
    'getBp',
    'creditBp',
  ] as const
  for (const f of fields) {
    const old = t ? (t[f] ?? null) : null
    const value = next[f] ?? null
    if (old !== value) out.push(auditOf(ctx, 'request', req.requestId, f, old, value))
  }
  return out
}

/* ───────────── overlay rows ───────────── */

const POSITION_KEY = ['positionId', 'effectiveDate'] as const
const TARGET_KEY = ['fiscalYear', 'businessUnit', 'department', 'costCenter', 'leaderPositionId'] as const
const FREEZE_KEY = ['freezeId'] as const
const ASSUMPTION_KEY = ['version', 'table', 'org', 'key'] as const

/** Plan state with dated position rows in its overlay (a row with the same seat and date is replaced). */
export function putPositions(state: PlanState, rows: readonly PositionRow[]): PlanState {
  if (!rows.length) return state
  return {
    ...state,
    overlay: { ...state.overlay, positions: overlayRows(state.overlay.positions, rows, POSITION_KEY) },
  }
}

export function putTargets(state: PlanState, rows: readonly TargetRow[]): PlanState {
  if (!rows.length) return state
  return {
    ...state,
    overlay: { ...state.overlay, targets: overlayRows(state.overlay.targets, rows, TARGET_KEY) },
  }
}

export function putFreezes(state: PlanState, rows: readonly FreezeRow[]): PlanState {
  if (!rows.length) return state
  return {
    ...state,
    overlay: { ...state.overlay, freezes: overlayRows(state.overlay.freezes, rows, FREEZE_KEY) },
  }
}

export function putAssumptions(state: PlanState, rows: readonly AssumptionRow[]): PlanState {
  if (!rows.length) return state
  return {
    ...state,
    overlay: { ...state.overlay, assumptions: overlayRows(state.overlay.assumptions, rows, ASSUMPTION_KEY) },
  }
}

/** Approval effects into the overlay: position rows, and target rows for "Move budget too?". */
export function applyEffects(state: PlanState, effects: readonly PlanEffect[]): PlanState {
  const positions: PositionRow[] = []
  const targets: TargetRow[] = []
  for (const e of effects) {
    if (e.kind === 'position') positions.push(e.change.row)
    else targets.push(e.row)
  }
  return putTargets(putPositions(state, positions), targets)
}

/** The Working plan an action applies to, signed by the Acting as person. */
export function workingFor(ctx: ActionContext, fy?: FiscalYear): WorkingPlan {
  const w = ctx.env.working(fy)
  return w.actor.personId === ctx.actor.personId && w.actor.mode === ctx.actor.mode
    ? w
    : { ...w, actor: ctx.actor }
}
