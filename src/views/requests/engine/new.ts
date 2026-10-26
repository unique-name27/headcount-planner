/**
 * Requests > New (docs/PLAN.md 9.4, 10.1 to 10.5, 11.4, 11.5, 8.4 rule 5; M3 freeze, M2-REPORT known
 * gap 1 `RequestsModel.new`): the type picker and the seats a form may name (the tab's model,
 * `RequestsModel.new`, one per analytics context), and, for the form as the person fills it in, the
 * preview beside the Save button (`newRequestPreview`): what the form still needs, the freeze notice,
 * the chain preview, the band estimate (not in Manager mode), the target org's gap after approval,
 * the trade quote card, what submit would refuse with, and the action the button runs. The form
 * itself lives in the tab's own state (src/views/requests/ui/New.tsx). Pure.
 *
 * - Types follow their action's first id (src/plan/actions/index.ts ACTION_CHECKS): New role,
 *   Backfill, Level change, Location change `request.draft`; Elimination `request.draft`; Start
 *   recruiting `request.recruit`; Start date `request.propose-start`; Trade `request.trade`; Transfer
 *   `transfer.process`. A hidden type is listed with its reason, never offered.
 * - Seats: the scope's positions with the types that may name each (an accepted offer names only an
 *   Elimination: ACCEPTED_OFFER_TEXT; Filled seats are never traded: FILLED_NOT_TRADED_TEXT) and, for
 *   trades, its weight in basis points (`ui:trade-weights`, every mode).
 * - Freeze notice (10.4): "Hiring is frozen for <org> from 1 Aug 2026. You can still submit an
 *   exception with a business reason." (freeze.ts `freezeNotice`).
 * - Chain preview: the steps `chainFor` would store (src/app/write/routing.ts `chainContextOf`),
 *   "Goes to: your manager, your HRBP, your leader: over the leader threshold"; Manager mode never
 *   prints the threshold's amount.
 * - Band estimate and gap after approval: only where `cost:band` shows; the cost gap under the mode's
 *   cost rules (7.3 unions of atoms; 7.4's org-row rule in Finance and HR admin with the switch off),
 *   else heads only; the cost change is a band figure (7.2 rule 5).
 * - Trade quote card (11.5): "Give 1 P5 San Jose (1.92). Get 8 P3 Bengaluru (1.81). Credit 0.11
 *   standard heads. Heads +7. In FY27 this saves 0.35 standard heads (start dates).", with "The On
 *   hold seat you give was not counted in your heads." when one is given; USD band estimates only
 *   where `cost:band` shows.
 * - The hint under every free-text box: FREE_TEXT_HINT ("Do not include pay, performance or health
 *   details."); a comment or reason with an amount says AMOUNT_COMMENT_NOTE or REMOVE_AMOUNT_TEXT.
 *
 * How the preview is built (requests-ui, M3): the form becomes the Save button's action and input
 * (`NewRequestAction`), and the preview runs that very action over the plan in force, then the
 * requests engine's submit transition over the draft it returns, through the write path's own action
 * context (src/app/write/context.ts `actionContextOf`, nothing saved). So the chain preview is the
 * chain submit stores, a refusal is the one the action or submit would give, and the policy, the
 * person-level rules (8.4) and the scope decide the preview exactly as they decide the write.
 *
 * Readings taken here (requests-ui, M3):
 *  - The seats are the scope's positions on the as-of date (ctx.data: the Manager's tree strictly
 *    below the own seat, R23; the HRBP's unit; the Leader's org; every seat in HR admin), Eliminated
 *    ones left out. A seat lists the types the mode offers for it: Backfill on an Open or On hold
 *    seat, or a Filled seat whose holder has a known last day; Level and Location change on a Filled,
 *    Open or Planned seat; Start recruiting on a Planned seat; Start date on an Open or Planned seat;
 *    Trade (give) on an Open, Planned or On hold seat; Transfer (the from seat) on a Filled seat;
 *    Elimination on any. A seat with an accepted offer lists only Elimination (C23).
 *  - The trade notes come from one quote over every seat in scope (trade.ts gives each give seat its
 *    first block, in the engine's own words), so the seats list and the quote never disagree.
 *  - A New role reports to a manager seat in scope (the own seat included in Manager and Leader mode).
 *  - The free text a manager can read on this form (the job title and the freeze-exception reason)
 *    is refused with an amount (REMOVE_AMOUNT_TEXT, 8.4 rule 5) before Save.
 *  - Manager mode shows no gap after approval and no band estimate (7.6, cost:band hidden).
 *  - Manager mode carries no next request ID: an ID is a count of the requests raised, hidden ones
 *    included, so it is left out where 8.4 rule 3 applies (Manager C, review SC-13).
 *  - Trade credit and the seats' pending requests read each request's effective state
 *    (src/drill/seats.ts `effectiveRequestsOf`): an expired trade holds no credit.
 *  - A seat already in a pending request names that request only where the viewer sees it in full
 *    (./quoteCard.ts `blockText`, 8.4 rule 6).
 *  - The quote card warns about a give seat whose open req is at Interviewing (11.4), read from the
 *    quote (src/app/write/quote.ts `tradeQuoteOf` passes each seat's open req, M3 known gap 6).
 */
import { FREE_TEXT_HINT } from '@/access/copy'
import { holdingsOn } from '@/access/scopes/people'
import { hasAmount } from '@/access/visibility'
import { actionContextOf, personRulesOf } from '@/app/write/context'
import { tradeQuoteOf } from '@/app/write/quote'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf, monthStart } from '@/data/fiscal'
import {
  type FiscalYear,
  type ISODate,
  LEVELS,
  type Level,
  type PositionStatus,
  REASON_CODES_OF,
  REQUEST_TYPES,
  type ReasonCode,
  type RequestType,
  SITES,
} from '@/data/schema'
import { effectiveRequestsOf, seatStateOf } from '@/drill/seats'
import { formatDate } from '@/lib/dates'
import {
  ACTION_CHECKS,
  type ActionName,
  actionSurface,
  type CreateRequestInput,
  type EliminationInput,
  type ProposeStartInput,
  REMOVE_AMOUNT_TEXT,
  type RecruitInput,
  runActionByName,
  type TradeInput,
  type TransferInput,
} from '@/plan/actions'
import { approvedMoveTo, freezeOfRequest, heldSeatText } from '@/plan/actions/shared'
import { firstOpenMonth } from '@/plan/engine/close'
import { freezeNotice } from '@/plan/engine/freeze'
import { toAssignments } from '@/plan/engine/heads'
import { transition } from '@/plan/engine/requests'
import { creditBalance, type TradeAsk, type TradeQuote } from '@/plan/engine/trade'
import { emptyPlanState } from '@/plan/store/memoryStore'
import type { ChainReason, HcRequest, Step, StepRoleCode } from '@/plan/types'
import type { FigureData, TabModel } from '../../types'
import { ID } from '../metrics'
import { prepOf, ROLE_WORD, shownInFull } from './base'
import { managersInScope, openForAsks } from './cycle'
import { REQUESTS_FIGURES } from './figures'
import { gapAfterOf } from './gapAfter'
import { bandEstimateOf } from './planYear'
import { blockText, quoteCard } from './quoteCard'

/* ───────────── the tab's model ───────────── */

/** One request type the picker lists. */
export interface NewTypeOption {
  type: RequestType
  label: string
  /** The action the form's Save button runs for the type. */
  action: ActionName
  /** The mode offers it (its action's first id is not hidden). */
  shown: boolean
  /** The policy's reason when it is not offered; null when shown. */
  why: string | null
}

/** A seat the form may name, in scope. */
export interface NewSeatRow {
  positionId: string
  title: string | null
  level: Level
  location: string
  fte: number
  /** Derived status (6.5). */
  status: PositionStatus
  businessUnit: string
  managerPositionId: string | null
  /** Req stage Offer accepted, not Started. */
  acceptedOffer: boolean
  /** The types that may name the seat. */
  types: readonly RequestType[]
  /** Its trade weight, basis points of a standard head; null with no band. */
  weightBp: number | null
  /** Why it cannot be given in a trade (the trade block's text), or null when tradable. */
  tradeBlock: string | null
  /** Added by the builder: the types as the table shows them ("Level change, Elimination"). */
  typesText: string
  /** Its trade weight in standard heads (weight ÷ 10,000), or null with no band. */
  standardHeads: number | null
  /** "Yes" for an accepted offer (a date only shows elsewhere), else null. */
  offerText: string | null
  /** The person in a Filled seat (Transfer names them), or null. */
  holderId: string | null
  holderName: string | null
  /** Planned or target start, or null. */
  startDate: ISODate | null
}

/** A freeze that covers part of the scope. */
export interface NewFreezeNote {
  freezeId: string
  /** The org it covers, in words. */
  org: string
  /** freeze.ts `freezeNotice`. */
  notice: string
}

/** A manager seat a new seat (a New role, a trade's get seats, a position move) may report to. */
export interface NewManagerOption {
  positionId: string
  /** "Regional Sales Manager (P-2052), Sebastian Wagner". */
  label: string
  businessUnit: string
}

export interface RequestsNew extends TabModel {
  types: readonly NewTypeOption[]
  seats: FigureData<NewSeatRow>
  /** REASON_CODES_OF per type (never "Below the cut line", set only at cycle lock). */
  reasons: Readonly<Partial<Record<RequestType, readonly ReasonCode[]>>>
  freezes: readonly NewFreezeNote[]
  /** The trade credit of each giving org in scope with a balance, in basis points (11.2). */
  credit: readonly { orgPositionId: string; label: string; bp: number }[]
  /** FREE_TEXT_HINT. */
  hint: string
  /** The cycle open for asks that a request may join as a ranked ask, or null. */
  cycle: { cycleId: string; fiscalYear: FiscalYear } | null
  /** `request.submit-on-behalf` is offered (HRBP, HR admin), with the managers it may name. */
  onBehalf: readonly { personId: string; name: string }[] | null
  /** The hint under "Submit for", in the mode's words; null where `onBehalf` is. */
  onBehalfHint: string | null
  /** Added by the builder: the manager seats a new seat may report to. */
  managers: readonly NewManagerOption[]
  levels: readonly Level[]
  locations: readonly string[]
  /** The ID the next draft takes ("R-1128"); left out in Manager mode (see the module comment). */
  nextRequestId?: string
  /** The format amounts show in: $0.1M steps in HRBP and Leader mode, whole dollars elsewhere. */
  money: 'moneyM' | 'moneyFull'
  /** The first month a trade's get seats may start in (`YYYY-MM`). */
  firstOpenMonth: string
  /** Why the tab offers nothing to write (no Acting as pick), or null. */
  blocked: string | null
}

/* ───────────── the form and its preview ───────────── */

/** The form as the person fills it in; every field blank until set. */
export interface NewRequestForm {
  type: RequestType
  reasonCode: ReasonCode | null
  positionId: string | null
  managerPositionId: string | null
  level: Level | null
  location: string | null
  fte: number | null
  /** The proposed start, the change's date, or an Elimination's last day. */
  startDate: ISODate | null
  jobTitle: string
  jobFamily: string | null
  cycleId: string | null
  priority: number | null
  confidential: boolean
  transfer: {
    kind: 'position' | 'internal'
    personId: string | null
    fromPositionId: string | null
    toManagerPositionId: string | null
    toPositionId: string | null
    effectiveDate: ISODate | null
    moveBudget: boolean
  } | null
  trade: {
    give: readonly string[]
    creditUsedBp: number
    /** A trade that gives only credit names its giving org (11.2). */
    giveOrgPositionId: string | null
    count: number | 'max'
    partTimeRest: boolean
  } | null
  /** The freeze-exception business reason, when the org is frozen. */
  exceptionReason: string
  /** Added by the builder: the manager an HRBP submits for (`request.submit-on-behalf`), or null. */
  onBehalfOf?: string | null
}

/** One step of the chain figure. */
export interface ChainRow {
  n: number
  role: string
  approver: string | null
  why: string | null
}

/** One step of the chain preview. */
export interface ChainPreviewStep {
  role: StepRoleCode
  approverName: string | null
  /** In words ("over the leader threshold", "out of plan"); no amount in Manager mode. */
  reasons: readonly string[]
}

/** The trade quote card (11.5): weights and heads, USD band estimates only where `cost:band` shows. */
export interface TradeQuoteCard {
  ok: boolean
  /** The card's sentences, in order. */
  lines: readonly string[]
  /** Each block with its seat (the first block a give seat meets). */
  blocks: readonly { positionId?: string; text: string }[]
  /** "You can get 8 (8.49)". */
  maxSeats: number
  ratio: number
  giveBp: number
  getBp: number
  creditBp: number
  headsDelta: number
  /**
   * USD band estimates (give, get), or null; left out (no key) where `cost:band` is hidden (Manager
   * mode), so no Manager-mode model carries an amount-like key (7.6, the leak crawl).
   */
  bandUsd?: { give: number; get: number } | null
}

/** What the Save button runs. */
export type NewRequestAction =
  | { name: 'createRequest'; input: CreateRequestInput }
  | { name: 'requestElimination'; input: EliminationInput }
  | { name: 'requestRecruiting'; input: RecruitInput }
  | { name: 'proposeStart'; input: ProposeStartInput }
  | { name: 'processTransfer'; input: TransferInput }
  | { name: 'createTrade'; input: TradeInput }

export interface NewRequestPreview {
  /** What the form still needs, in words ("Pick a level and a location for the new role."). */
  missing: readonly string[]
  /** What submit would refuse with now (ACCEPTED_OFFER_TEXT, REMOVE_AMOUNT_TEXT, ...), or null. */
  refusal: string | null
  /** The freeze notice when the request's org is frozen, else null. */
  freeze: string | null
  chain: {
    text: string
    steps: readonly ChainPreviewStep[]
    /** Added by the builder: the steps as the chain figure lists them ("HRBP", the approver, why). */
    rows?: readonly ChainRow[]
  } | null
  /**
   * The annual band estimate, USD at plan rates, where `cost:band` shows; else null. Left out (no
   * key) in Manager mode, like `gapAfter` (7.6: no amount-like key in a Manager-mode model).
   */
  bandEstimateUsd?: number | null
  /** The target org's gap after approval: heads always, cost under the mode's rules, the note why not. */
  gapAfter?: { heads: number | null; cost: number | null; note: string | null; org?: string } | null
  quote: TradeQuoteCard | null
  /** The action and input Save runs, or null while the form is not complete. */
  action: NewRequestAction | null
  /** Added by the builder: the freeze an exception would name (the Submit chain adds it), or null. */
  freezeId?: string | null
  /** The draft would be saved before submit could go (the action refuses), or the submit would. */
  saveRefusal?: string | null
}

/* ───────────── shared reads ───────────── */

/** The action each type's form saves with. */
export const ACTION_OF: Readonly<Record<RequestType, NewRequestAction['name']>> = {
  'New role': 'createRequest',
  Backfill: 'createRequest',
  'Level change': 'createRequest',
  'Location change': 'createRequest',
  Transfer: 'processTransfer',
  Elimination: 'requestElimination',
  Trade: 'createTrade',
  'Start recruiting': 'requestRecruiting',
  'Start date': 'proposeStart',
}

/** The types a seat may be named in, by its state (see the module comment). */
function seatTypes(status: PositionStatus, acceptedOffer: boolean, exitKnown: boolean): RequestType[] {
  if (status === 'Eliminated') return []
  if (acceptedOffer) return ['Elimination']
  switch (status) {
    case 'Filled':
      return [
        ...(exitKnown ? (['Backfill'] as const) : []),
        'Level change',
        'Location change',
        'Transfer',
        'Elimination',
      ]
    case 'Open':
      return ['Backfill', 'Level change', 'Location change', 'Start date', 'Trade', 'Elimination']
    case 'Planned':
      return ['Level change', 'Location change', 'Start recruiting', 'Start date', 'Trade', 'Elimination']
    case 'On hold':
      return ['Backfill', 'Trade', 'Elimination']
  }
}

/** The month the next close opens (the first month a trade's get seats may start in). */
function openMonthOf(ctx: AnalyticsContext): string {
  return firstOpenMonth(ctx.plan?.closes ?? [], `${ctx.asOf.slice(0, 7)}` as `${number}-${string}`)
}

/** The last day of each Filled seat's holder, where HRIS knows it and it is on or after the as-of date. */
const exitMemo = new WeakMap<object, Map<string, ReadonlyMap<string, ISODate>>>()
function exitsOn(ctx: AnalyticsContext): ReadonlyMap<string, ISODate> {
  let byDate = exitMemo.get(ctx.all.workers)
  if (!byDate) {
    byDate = new Map()
    exitMemo.set(ctx.all.workers, byDate)
  }
  const hit = byDate.get(ctx.asOf)
  if (hit) return hit
  const out = new Map<string, ISODate>()
  for (const a of toAssignments(ctx.all.workers)) {
    if (a.workerType !== 'Employee' || !a.positionId || !a.end) continue
    if (a.start <= ctx.asOf && a.end >= ctx.asOf) out.set(a.positionId, a.end)
  }
  byDate.set(ctx.asOf, out)
  return out
}

const SEAT_COLUMNS: FigureData<NewSeatRow>['columns'] = [
  { key: 'positionId', label: 'Position' },
  { key: 'title', label: 'Title', width: 26, freeText: true },
  { key: 'level', label: 'Level' },
  { key: 'location', label: 'Location' },
  { key: 'fte', label: 'FTE', format: 'num2' },
  { key: 'status', label: 'Status' },
  { key: 'offerText', label: 'Accepted offer' },
  { key: 'startDate', label: 'Planned start', format: 'date' },
  { key: 'standardHeads', label: 'Standard heads', format: 'num2' },
  { key: 'typesText', label: 'Can be named in', width: 40 },
  { key: 'tradeBlock', label: 'Trade note', width: 40 },
]

const models = new WeakMap<AnalyticsContext, RequestsNew | null>()

/** Requests > New's model (`RequestsModel.new`); null where `tab:requests.new` is hidden (Finance). */
export function requestsNewOf(ctx: AnalyticsContext): RequestsNew | null {
  if (models.has(ctx)) return models.get(ctx) ?? null
  const out = ctx.access.can('tab:requests.new') ? build(ctx) : null
  models.set(ctx, out)
  return out
}

function build(ctx: AnalyticsContext): RequestsNew {
  const p = prepOf(ctx)
  const rules = personRulesOf(ctx)
  const held = holdingsOn(ctx.all.workers, ctx.asOf)
  const types: NewTypeOption[] = REQUEST_TYPES.map((type) => {
    const action = ACTION_OF[type]
    const d = ctx.access.decide(actionSurface(ACTION_CHECKS[action][0]))
    return {
      type,
      label: type,
      action,
      shown: d.access !== 'hidden',
      why: d.access === 'hidden' ? (d.how ?? null) : null,
    }
  })
  const offered = new Set(types.filter((t) => t.shown).map((t) => t.type))

  // The scope's seats on the as-of date.
  const ids = [...new Set(ctx.data.positions.map((r) => r.positionId))].sort()
  const exits = exitsOn(ctx)
  const states = ids
    .map((id) => seatStateOf(ctx, id))
    .filter((s): s is NonNullable<typeof s> => !!s && s.status !== 'Eliminated')
  const quote =
    states.length && !ctx.access.unset
      ? seatQuote(
          ctx,
          states.map((s) => s.positionId),
        )
      : null
  const weight = new Map(quote?.give.map((l) => [l.positionId as string, l.weightBp]) ?? [])
  const block = new Map<string, string>()
  const shown = shownInFull(p)
  for (const b of quote?.blocks ?? [])
    if (b.positionId && !block.has(b.positionId)) block.set(b.positionId, blockText(b, shown))
  // A receiving seat an approved internal move holds until HRIS shows the move (review SC-6) is
  // offered to no request, and says why in the trade note, the actions' own words.
  const inForce = effectiveRequestsOf(ctx)
  const heldBy = (s: (typeof states)[number]) =>
    s.status === 'Filled' ? null : approvedMoveTo(inForce, s.positionId)
  const seats: NewSeatRow[] = states.map((s) => {
    const accepted = s.acceptedOffer != null
    const move = heldBy(s)
    const list = move
      ? []
      : seatTypes(s.status, accepted, exits.has(s.positionId)).filter((t) => offered.has(t))
    const w = weight.get(s.positionId) ?? null
    const holderId = s.status === 'Filled' ? (s.holderIds[0] ?? null) : null
    return {
      positionId: s.positionId,
      title: s.position.title,
      level: s.position.level,
      location: s.position.location,
      fte: s.position.fte,
      status: s.status,
      businessUnit: s.position.businessUnit,
      managerPositionId: s.position.managerPositionId,
      acceptedOffer: accepted,
      types: list,
      weightBp: w,
      tradeBlock: move ? heldSeatText(move, shown(move.requestId)) : (block.get(s.positionId) ?? null),
      typesText: list.join(', '),
      standardHeads: w == null ? null : w / 10_000,
      offerText: accepted ? 'Yes' : null,
      holderId,
      holderName: holderId ? (p.nameOf(holderId) ?? null) : null,
      startDate: s.plannedStart,
    }
  })

  // Manager seats a new seat may report to (the own seat in a tree scope).
  const managers: NewManagerOption[] = managersInScope(p, held.holderOf)
    .filter((m) => rules.placeInScope(m.positionId))
    .map((m) => ({
      positionId: m.positionId,
      label: `${m.title ?? 'Manager'} (${m.positionId}), ${m.name}`,
      businessUnit: m.businessUnit,
    }))

  // Freezes in force over the scope's units, on or after the as-of date.
  const units = new Set(ctx.data.positions.map((r) => r.businessUnit))
  const freezes: NewFreezeNote[] = ctx.all.freezes
    .filter((f) => units.has(f.businessUnit) && (!f.endDate || f.endDate >= ctx.asOf))
    .map((f) => {
      const org = f.department || f.costCenter || f.businessUnit
      return { freezeId: f.freezeId, org, notice: freezeNotice(org, f) }
    })

  // Trade credit of the giving orgs in scope.
  const year = fiscalYearOf(ctx.asOf)
  const requests = effectiveRequestsOf(ctx)
  const orgs = new Set<string>()
  for (const r of requests) if (r.trade?.giveOrgPositionId) orgs.add(r.trade.giveOrgPositionId)
  const credit = [...orgs]
    .filter((org) => !ctx.access.unset && rules.placeInScope(org))
    .map((org) => {
      const holder = held.holderOf.get(org)
      const name = holder ? p.nameOf(holder) : null
      return {
        orgPositionId: org,
        label: name ? `${name}'s team (${org})` : `The org under ${org}`,
        bp: creditBalance(requests, org, year),
      }
    })
    .filter((c) => c.bp > 0)
    .sort((a, b) => a.orgPositionId.localeCompare(b.orgPositionId))

  const reasons: Partial<Record<RequestType, readonly ReasonCode[]>> = {}
  for (const t of REQUEST_TYPES) reasons[t] = REASON_CODES_OF[t].filter((r) => r !== 'Below the cut line')

  const open = openForAsks(ctx)[0] ?? null
  const behalf = ctx.access.decide('action:request.submit-on-behalf').access !== 'hidden'
  const me = p.me
  const onBehalf = behalf
    ? [...new Map(managersInScope(p, held.holderOf).map((m) => [m.employeeId, m.name])).entries()]
        .filter(([id]) => id !== me)
        .map(([personId, name]) => ({ personId, name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : null
  const env = actionContextOf(ctx, { readOnly: false, at: previewAt(ctx) }).env
  return {
    kpis: [],
    types,
    seats: {
      id: REQUESTS_FIGURES.newSeats,
      metric: 'plan.trade.weight',
      title: 'Seats you can name',
      subtitle: `${ctx.scopeLabel} · as of ${formatDate(ctx.asOf)}`,
      rows: seats,
      columns: SEAT_COLUMNS,
      note: 'Standard heads are each seat’s trade weight. A seat with an accepted offer can only be eliminated.',
      empty: seats.length
        ? null
        : ctx.access.unset
          ? 'Pick who you act as to see the seats.'
          : 'No seat in scope.',
      uses: [
        'positions.positionId',
        'positions.status',
        'positions.level',
        'positions.location',
        'reqs.stage',
      ],
    },
    reasons,
    freezes,
    credit,
    hint: FREE_TEXT_HINT,
    cycle: open ? { cycleId: open.cycleId, fiscalYear: open.fiscalYear } : null,
    onBehalf,
    onBehalfHint: onBehalf
      ? ctx.access.mode === 'hr-admin'
        ? 'You can submit for a manager. Both of you are recorded.'
        : 'An HRBP can submit for a manager. Both of you are recorded.'
      : null,
    managers,
    levels: LEVELS,
    locations: SITES.map((s) => s.location),
    ...(ctx.access.mode === 'manager' ? {} : { nextRequestId: env.ids.request() }),
    money: ctx.guard.mode === 'rounded' ? 'moneyM' : 'moneyFull',
    firstOpenMonth: openMonthOf(ctx),
    blocked: ctx.access.unset ? 'Pick who you act as before making changes.' : null,
  }
}

/** One quote over the scope's seats: each give seat's weight and first block, in the engine's words. */
function seatQuote(ctx: AnalyticsContext, ids: readonly string[]): TradeQuote {
  const rules = personRulesOf(ctx)
  const start = monthStart(`${openMonthOf(ctx)}-01`)
  return tradeQuoteOf(
    ctx,
    {
      give: ids,
      creditUsedBp: 0,
      giveOrgPositionId: '',
      get: {
        level: 'P3',
        location: SITES[0].location,
        fte: 1,
        orgPositionId: '',
        businessUnit: '',
        jobFamily: null,
        start,
        count: 1,
        partTimeRest: false,
      },
    },
    { inScope: rules.seatInScope },
  )
}

/** The time a preview's dry run is stamped with: the as-of date (nothing is saved). */
const previewAt = (ctx: Pick<AnalyticsContext, 'asOf'>): string => `${ctx.asOf}T12:00:00.000Z`

/** A blank form for a type. */
export function emptyForm(type: RequestType): NewRequestForm {
  return {
    type,
    reasonCode: null,
    positionId: null,
    managerPositionId: null,
    level: null,
    location: null,
    fte: type === 'New role' || type === 'Trade' ? 1 : null,
    startDate: null,
    jobTitle: '',
    jobFamily: null,
    cycleId: null,
    priority: null,
    confidential: false,
    transfer:
      type === 'Transfer'
        ? {
            kind: 'internal',
            personId: null,
            fromPositionId: null,
            toManagerPositionId: null,
            toPositionId: null,
            effectiveDate: null,
            moveBudget: false,
          }
        : null,
    trade:
      type === 'Trade'
        ? { give: [], creditUsedBp: 0, giveOrgPositionId: null, count: 'max', partTimeRest: false }
        : null,
    exceptionReason: '',
    onBehalfOf: null,
  }
}

/* ───────────── the form as an action ───────────── */

const PICK_REASON = 'Pick a reason.'
const PICK_SEAT = 'Pick the seat.'

/** The trade's ask from the form, or null while it lacks the get seats. */
function askOf(ctx: AnalyticsContext, f: NewRequestForm): TradeAsk | null {
  const t = f.trade
  if (!t || !f.level || !f.location || !f.managerPositionId || !f.startDate) return null
  const org = ctx.positionIndex.byId.get(f.managerPositionId)
  const reason = f.exceptionReason.trim()
  return {
    give: t.give,
    creditUsedBp: t.creditUsedBp,
    giveOrgPositionId: t.giveOrgPositionId,
    get: {
      level: f.level,
      location: f.location,
      fte: f.fte ?? 1,
      orgPositionId: f.managerPositionId,
      businessUnit: org?.businessUnit ?? '',
      jobFamily: f.jobFamily,
      start: f.startDate,
      count: t.count,
      partTimeRest: t.partTimeRest,
    },
    ...(reason ? { freezeException: { reason } } : {}),
  }
}

/** The form's missing fields, and its action once complete. */
export function formAction(
  ctx: AnalyticsContext,
  f: NewRequestForm,
): { missing: string[]; action: NewRequestAction | null } {
  const missing: string[] = []
  if (!f.reasonCode) missing.push(PICK_REASON)
  const reasonCode = f.reasonCode as ReasonCode
  const jobTitle = f.jobTitle.trim() || null
  const ask = { cycleId: f.cycleId, priority: f.priority }
  switch (f.type) {
    case 'New role': {
      if (!f.managerPositionId) missing.push('Pick the manager the new role reports to.')
      if (!f.level || !f.location) missing.push('Pick a level and a location for the new role.')
      if (!f.startDate) missing.push('Pick the proposed start.')
      if (missing.length) return { missing, action: null }
      return {
        missing,
        action: {
          name: 'createRequest',
          input: {
            type: 'New role',
            managerPositionId: f.managerPositionId as string,
            level: f.level as Level,
            location: f.location as string,
            fte: f.fte ?? 1,
            startDate: f.startDate,
            jobFamily: f.jobFamily,
            reasonCode,
            jobTitle,
            confidential: f.confidential,
            ...ask,
          },
        },
      }
    }
    case 'Backfill':
    case 'Level change':
    case 'Location change': {
      if (!f.positionId) missing.push(PICK_SEAT)
      if (f.type === 'Level change' && !f.level) missing.push('Pick the new level.')
      if (f.type === 'Location change' && !f.location) missing.push('Pick the new location.')
      if (f.type !== 'Backfill' && !f.startDate) missing.push('Pick the date the change takes effect.')
      if (missing.length) return { missing, action: null }
      const positionId = f.positionId as string
      const common = { reasonCode, jobTitle, confidential: f.confidential, ...ask }
      const input: CreateRequestInput =
        f.type === 'Backfill'
          ? { type: 'Backfill', positionId, startDate: f.startDate, ...common }
          : f.type === 'Level change'
            ? { type: 'Level change', positionId, level: f.level as Level, startDate: f.startDate, ...common }
            : {
                type: 'Location change',
                positionId,
                location: f.location as string,
                startDate: f.startDate,
                ...common,
              }
      return { missing, action: { name: 'createRequest', input } }
    }
    case 'Elimination': {
      if (!f.positionId) missing.push(PICK_SEAT)
      if (missing.length) return { missing, action: null }
      return {
        missing,
        action: {
          name: 'requestElimination',
          input: {
            positionId: f.positionId as string,
            lastDay: f.startDate,
            reasonCode,
            confidential: f.confidential,
          },
        },
      }
    }
    case 'Start recruiting': {
      if (!f.positionId) missing.push(PICK_SEAT)
      if (missing.length) return { missing, action: null }
      return {
        missing,
        action: { name: 'requestRecruiting', input: { positionId: f.positionId as string, reasonCode } },
      }
    }
    case 'Start date': {
      if (!f.positionId) missing.push(PICK_SEAT)
      if (!f.startDate) missing.push('Pick the new start date.')
      if (missing.length) return { missing, action: null }
      return {
        missing,
        action: {
          name: 'proposeStart',
          input: { positionId: f.positionId as string, startDate: f.startDate as ISODate, reasonCode },
        },
      }
    }
    case 'Transfer': {
      const t = f.transfer
      if (!t?.personId || !t.fromPositionId) missing.push('Pick who moves.')
      if (!(t?.kind === 'position' ? t.toManagerPositionId : t?.toPositionId))
        missing.push('Pick where the person moves to.')
      if (!t?.effectiveDate) missing.push('Pick the first day in the new place.')
      if (missing.length || !t) return { missing, action: null }
      return {
        missing,
        action: {
          name: 'processTransfer',
          input: {
            kind: t.kind,
            personId: t.personId as string,
            fromPositionId: t.fromPositionId as string,
            toManagerPositionId: t.kind === 'position' ? t.toManagerPositionId : null,
            toPositionId: t.kind === 'internal' ? t.toPositionId : null,
            effectiveDate: t.effectiveDate as ISODate,
            moveBudget: t.moveBudget,
            reasonCode,
          },
        },
      }
    }
    case 'Trade': {
      const t = f.trade
      if (!t || (!t.give.length && t.creditUsedBp <= 0))
        missing.push('Pick the seats to give, or use trade credit.')
      if (!f.level || !f.location || !f.managerPositionId)
        missing.push('Pick the level, location and org of the seats you want.')
      if (!f.startDate) missing.push('Pick the start of the seats you get.')
      const a = askOf(ctx, f)
      if (missing.length || !a) return { missing, action: null }
      return { missing, action: { name: 'createTrade', input: { ask: a, reasonCode, jobTitle, ...ask } } }
    }
  }
}

/* ───────────── the chain in words ───────────── */

/** Why a step was added, in words (never an amount, in every mode). */
const REASON_WORDS: Readonly<Record<ChainReason, string>> = {
  always: '',
  'cross-unit': 'crosses units',
  'band-estimate-over-threshold': 'over the leader threshold',
  'director-plus': 'Director or above',
  'out-of-plan': 'out of plan',
  'different-direct-reports': 'under different direct reports',
  'new-role': 'a new role',
  'freeze-exception': 'a freeze exception',
  'envelope-exception': 'past a sub-org envelope',
}

/** A step's reasons in words. */
export const reasonWords = (s: Pick<Step, 'reasons'>): string[] =>
  s.reasons.map((r) => REASON_WORDS[r]).filter(Boolean)

/**
 * Who each step goes to, as the requester reads it: "your manager", "your HRBP", "your leader",
 * "Finance"; a second HRBP or leader step on a cross-unit request is the receiving unit's.
 */
export function stepWords(steps: readonly Pick<Step, 'role' | 'reasons'>[], mine: boolean): string[] {
  const your = mine ? 'your' : 'the'
  let hrbps = 0
  let leaders = 0
  const cross = steps.some((s) => s.reasons.includes('cross-unit'))
  return steps.map((s) => {
    switch (s.role) {
      case 'manager':
        return mine ? 'your manager' : 'the requester’s manager'
      case 'hrbp':
        return hrbps++ === 0 ? `${your} HRBP` : 'the receiving HRBP'
      case 'leader':
        if (!cross) return `${your} leader`
        return leaders++ === 0 ? 'the giving unit’s leader' : 'the receiving unit’s leader'
      default:
        return 'Finance'
    }
  })
}

/** "Goes to: your manager, your HRBP, your leader: over the leader threshold". */
export function chainSentence(steps: readonly Pick<Step, 'role' | 'reasons'>[], mine: boolean): string {
  if (!steps.length) return 'Goes to no approver yet.'
  const why = [...new Set(steps.flatMap(reasonWords))]
  return `Goes to: ${stepWords(steps, mine).join(', ')}${why.length ? `: ${why.join(', ')}` : ''}`
}

/* ───────────── the preview ───────────── */

const NONE: NewRequestPreview = {
  missing: [],
  refusal: null,
  freeze: null,
  chain: null,
  bandEstimateUsd: null,
  gapAfter: null,
  quote: null,
  action: null,
  freezeId: null,
  saveRefusal: null,
}

/**
 * The preview for the form as it stands (pure; recomputed as the form changes). Where band estimates
 * are hidden (Manager mode) the band estimate, an empty gap after approval and the quote's band
 * estimates are left out as keys, not set to null (7.6: no amount-like key in a Manager-mode model).
 */
export function newRequestPreview(ctx: AnalyticsContext, form: NewRequestForm): NewRequestPreview {
  const out = previewOf(ctx, form)
  if (ctx.access.can('cost:band')) return out
  const { bandEstimateUsd: _band, gapAfter, quote, ...rest } = out
  const q = quote ? (({ bandUsd: _q, ...card }) => card)(quote) : quote
  return { ...rest, quote: q, ...(gapAfter ? { gapAfter } : {}) }
}

function previewOf(ctx: AnalyticsContext, form: NewRequestForm): NewRequestPreview {
  const p = prepOf(ctx)
  const { missing, action } = formAction(ctx, form)
  const bandShown = ctx.access.can('cost:band')
  const actx = actionContextOf(ctx, { readOnly: false, at: previewAt(ctx) })
  const reason = form.exceptionReason.trim()
  const freeText = [form.jobTitle, reason].some((t) => t.trim() && hasAmount(t)) ? REMOVE_AMOUNT_TEXT : null

  // The trade's quote card, as soon as the ask has its get seats.
  const tradeAsk = form.type === 'Trade' ? askOf(ctx, form) : null
  const q = tradeAsk ? tradeQuoteOf(ctx, tradeAsk, { inScope: actx.rules.seatInScope }) : null
  const quote = q && tradeAsk ? cardOf(ctx, q, tradeAsk, bandShown, shownInFull(p)) : null
  const tradeFrozen = q?.blocks.find((b) => b.code === 'frozen')?.text ?? null

  if (!action) return { ...NONE, missing, refusal: freeText, quote, freeze: tradeFrozen }

  // Run the Save button's action over the plan in force (nothing is saved).
  const state = ctx.plan ?? emptyPlanState(null)
  const saved = runActionByName(action.name, state, actx, action.input as never)
  if (!saved.ok) {
    const frozen = tradeFrozen && saved.refused === tradeFrozen ? tradeFrozen : null
    return {
      ...NONE,
      missing,
      refusal: freeText ?? saved.refused,
      quote,
      freeze: frozen,
      action,
      saveRefusal: saved.refused,
    }
  }
  const before = new Set(state.requests.map((r) => r.requestId))
  const draft = saved.next.requests.find((r) => !before.has(r.requestId)) as HcRequest | undefined
  if (!draft) return { ...NONE, missing, refusal: freeText, quote, action }

  // The freeze over the draft's org on its start date (a trade's: its quote's block).
  const f = freezeOfRequest(actx, draft)
  const frozenType =
    !!f &&
    (draft.type === 'New role' || draft.type === 'Trade' || (draft.type === 'Backfill' && !f.allowBackfill))
  const freeze = frozenType && f ? freezeNotice(f.department || f.costCenter || f.businessUnit, f) : null
  let toSubmit: HcRequest = draft
  if (frozenType && f && reason && draft.type !== 'Trade')
    toSubmit = { ...draft, exception: { freezeId: f.freezeId, reason } }

  // The submit transition over the draft: the chain it stores, or its refusal.
  const onBehalf = form.type !== 'Transfer' && form.cycleId == null && behalfOf(form) ? behalfOf(form) : null
  const asTheirs = onBehalf ? { ...toSubmit, requesterId: onBehalf } : toSubmit
  const needsReason = frozenType && !reason ? freeze : null
  const sub = transition(
    toSubmit,
    { kind: 'submit', onBehalfOf: onBehalf },
    actx.actor,
    actx.at,
    actx.env.transitionContext(asTheirs),
  )
  const steps = 'refused' in sub ? null : sub.request.steps
  const mine = (onBehalf ?? toSubmit.requesterId) === p.me
  const chain = steps
    ? {
        text: chainSentence(steps, mine),
        steps: steps.map((s) => ({
          role: s.role,
          approverName: p.nameOf(s.approverId),
          reasons: reasonWords(s),
        })),
        rows: steps.map((s, i) => ({
          n: i + 1,
          role: ROLE_WORD[s.role],
          approver: p.nameOf(s.approverId),
          why: reasonWords(s).join(', ') || null,
        })),
      }
    : null
  const band = bandShown ? (q && tradeAsk ? q.getBandUsd : bandEstimateOf(toSubmit, ctx)) : null
  const gap = gapAfterOf(ctx, toSubmit, { counted: false, visible: p.visible })
  return {
    missing,
    refusal: freeText ?? needsReason ?? ('refused' in sub ? sub.refused : null),
    freeze,
    chain,
    bandEstimateUsd: band,
    gapAfter: gap ? { heads: gap.heads, cost: gap.cost, note: gap.note, org: gap.org } : null,
    quote,
    action,
    freezeId: frozenType && f && draft.type !== 'Trade' ? f.freezeId : null,
    saveRefusal: freeText,
  }
}

/** The manager a request is submitted for (HRBP and HR admin: `request.submit-on-behalf`). */
const behalfOf = (form: NewRequestForm): string | null => form.onBehalfOf ?? null

/** The card for a form's quote: the year of the get start and the On hold seats given. */
function cardOf(
  ctx: AnalyticsContext,
  q: TradeQuote,
  ask: TradeAsk,
  bandShown: boolean,
  requestShown: (requestId: string) => boolean,
) {
  let onHold = 0
  for (const id of ask.give) if (seatStateOf(ctx, id)?.status === 'On hold') onHold++
  return quoteCard(q, {
    year: fiscalYearOf(ask.get.start),
    creditUsedBp: ask.creditUsedBp,
    bandShown,
    onHoldGiven: onHold,
    requestShown,
  })
}

/** The figure ids New's figures name, with the metric each shows. */
export const NEW_FIGURE_METRICS = {
  seats: 'plan.trade.weight',
  chain: ID.queueOpen,
  quote: ID.tradeRatio,
} as const
