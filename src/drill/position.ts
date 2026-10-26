/**
 * The position card's model (docs/PLAN.md 9.5; it replaces the template app's person card, since HCP
 * plans positions, not people): the seat's facts and derived status, its status history (its own
 * effective-dated rows), who holds it and held it (names per mode), its reqs, the requests that
 * touch it (8.4, `requestRecord`), its audit rows (8.4 rule 7, `auditView`: outside HR admin no
 * `seq`, `prevHash` or `hash`), the positions below it and its standard heads. Pure, so the leak
 * crawler reads exactly what the card shows, per mode; ./PositionCard.tsx renders it.
 *
 * The mode shapes the card:
 *  - A position outside the scope (a Manager's own seat and everything above it, another unit in
 *    HRBP mode) is the limited card: its ID, title and "Outside <scope>.", nothing else.
 *  - Names show unless the mode hides the holder column (`column:positions.holder`, 8.3), the same
 *    decision as every positions list.
 *  - No amount: a per-position amount is never on the card outside HR admin with the switch, and
 *    the card carries none there either (the plan lines and the reqs list carry amounts as `pay`
 *    columns). Standard heads are weights, never USD (`ui:trade-weights`).
 *  - Requests, comments and audit rows pass 8.4's rules before they are listed or counted, so a
 *    count on the card never isolates a hidden request (rule 6). Requests read in their effective
 *    state (./seats.ts `effectiveRequestsOf`: an idle Draft or Sent back request reads Expired).
 *  - "Changed by your HRBP: start moved from Jan to Mar": the seat's HRBP edit notes as Plan >
 *    Positions and My team show them (src/views/plan/engine/notes.ts `notesOf`, through `auditView`
 *    for the viewer; Manager mode reads each reason through `managerText`).
 */
import { outsideScope } from '@/access/copy'
import { positionInScope } from '@/access/records'
import { auditView, type Viewer, viewerOf } from '@/access/visibility'
import type { AnalyticsContext } from '@/data/context'
import { LEVEL_LABELS, type PositionRow, type ReqRow } from '@/data/schema'
import { endsSeatOn, toPosition } from '@/plan/engine/versions'
import type { AuditEntry, AuditRow, HcRequest, PositionStatus } from '@/plan/types'
import { notesOf } from '@/views/plan/engine/notes'
import { openReqsOfPosition, positionsBelow, reqsOfPosition, requestsTouching, subPositions } from './related'
import { requestRecords } from './requestRecord'
import { effectiveRequestsOf, holderNamesOf, requestsOf, seatIndex, seatStateOf, workerNames } from './seats'
import type { RequestRecord } from './types'

/** What the card reads from the analytics context. */
export type PositionCardContext = Pick<
  AnalyticsContext,
  'all' | 'asOf' | 'positionIndex' | 'access' | 'audit' | 'showPay' | 'showCost'
> &
  Partial<Pick<AnalyticsContext, 'plan' | 'metrics'>>

/**
 * A position's standard heads and band estimate, from the view that prices seats (Plan >
 * Positions): the drill layer does not price seats itself. Registered once by that view; until
 * then the card shows no standard heads.
 */
export type PositionFacts = (
  ctx: PositionCardContext,
  positionId: string,
) => { standardHeads: number | null } | null

let factsSource: PositionFacts | null = null

/** The view that prices seats registers how (or null to remove it). */
export function setPositionFacts(fn: PositionFacts | null): void {
  factsSource = fn
}

/** One link in the chain above a position: its ID, title and holder (names per mode). */
export interface ChainLink {
  positionId: string
  title: string | null
  holder: string | null
  /** The position opens its own card (inside the scope). */
  opens: boolean
}

/** One row of the seat's own history: its effective-dated rows, oldest first. */
export interface HistoryRow {
  effectiveDate: string
  status: PositionStatus
  level: string
  location: string
  fte: number
  businessUnit: string
  department: string | null
  endDate: string | null
}

/** One person who held the seat (an Employee assignment), newest first. */
export interface HolderRow {
  /** Null where the mode hides names. */
  name: string | null
  start: string
  end: string | null
  fte: number
}

export interface PositionCardModel {
  positionId: string
  /** The data has the position. */
  found: boolean
  /** Outside the mode's scope: only the ID, title and `outsideLine` show. */
  outside: boolean
  outsideLine: string | null
  title: string | null
  level: string | null
  /** The derived status on the as-of date (docs/PLAN.md 6.5). */
  status: PositionStatus | null
  org: {
    businessUnit: string
    department: string | null
    costCenter: string
    location: string
    legalEntity: string
  } | null
  fte: number | null
  workerType: string | null
  /** An Open or Planned seat's planned start. */
  plannedStart: string | null
  /** The seat's last day, when it is Eliminated. */
  endDate: string | null
  /** The seat's req has an accepted offer (date only): it cannot be edited or traded. */
  acceptedOfferDate: string | null
  /** The person in the seat now (null when vacant, or when the mode hides names). */
  holder: string | null
  /** The chain of positions above it, nearest first, inside the scope. */
  chain: ChainLink[]
  history: HistoryRow[]
  holders: HolderRow[]
  /** Counts that open their records (./related.ts): the same definitions as the lists. */
  subPositions: number
  positionsBelow: number
  reqs: number
  openReqs: number
  /** Its reqs, newest first, as the reqs kind lists them (amounts are `pay` columns there). */
  reqRows: readonly ReqRow[]
  /** The requests that touch it, as the viewer may see them (8.4). */
  requests: readonly RequestRecord[]
  /** Its audit rows as the viewer may see them (8.4 rule 7). */
  audit: readonly (AuditEntry | AuditRow)[]
  /** "Changed by your HRBP: start moved from Jan to Mar", newest first, each with its reason (none when none). */
  hrbpChanges: readonly { text: string; reason: string | null }[]
  /** Standard heads (Σ weight ÷ 10,000), when the pricing view has registered `setPositionFacts`. */
  standardHeads: number | null
  /** "Focus on this org" is offered (positions below it, the mode allows focusing). */
  focus: boolean
}

const EMPTY: Omit<PositionCardModel, 'positionId' | 'found' | 'outside' | 'outsideLine' | 'title'> = {
  level: null,
  status: null,
  org: null,
  fte: null,
  workerType: null,
  plannedStart: null,
  endDate: null,
  acceptedOfferDate: null,
  holder: null,
  chain: [],
  history: [],
  holders: [],
  subPositions: 0,
  positionsBelow: 0,
  reqs: 0,
  openReqs: 0,
  reqRows: [],
  requests: [],
  audit: [],
  hrbpChanges: [],
  standardHeads: null,
  focus: false,
}

/** Names show unless the mode hides the holder column of positions (the same decision as the lists). */
const namesShown = (ctx: PositionCardContext): boolean =>
  !ctx.access.can('drill:positions') || ctx.access.can('column:positions.holder')

/** The rows of one position, oldest first. */
function rowsOf(ctx: PositionCardContext, positionId: string): PositionRow[] {
  return ctx.all.positions
    .filter((r) => r.positionId === positionId)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
}

/**
 * Which request an audit entry belongs to (8.4 rule 7): a request entry's own request, or for a
 * position entry the request whose approval wrote it (one that touches the position and was
 * updated at the same moment).
 */
function requestOfEntry(requests: readonly HcRequest[], positionId: string) {
  const touching = requestsTouching(requests, positionId)
  return (e: AuditEntry): HcRequest | null => {
    if (e.object === 'request') return requests.find((r) => r.requestId === e.id) ?? null
    if (e.object !== 'position') return null
    const at = e.at.slice(0, 19)
    return touching.find((r) => r.updatedAt.slice(0, 19) === at) ?? null
  }
}

/** The card for a position, as the context's mode and Acting as person may see it. */
export function positionCardModel(ctx: PositionCardContext, positionId: string): PositionCardModel {
  const rows = rowsOf(ctx, positionId)
  const current = ctx.positionIndex.byId.get(positionId) ?? rows[0] ?? null
  if (!current) return { ...EMPTY, positionId, found: false, outside: false, outsideLine: null, title: null }
  const scope = ctx.access.scope
  if (scope && !positionInScope(positionId, ctx.access))
    return {
      ...EMPTY,
      positionId,
      found: true,
      outside: true,
      outsideLine: outsideScope(scope.label),
      title: current.title ?? null,
    }

  const p = toPosition(current)
  const seat = seatStateOf(ctx, positionId)
  const names = namesShown(ctx)
  const holderNames = holderNamesOf(ctx)
  const people = workerNames(ctx)
  const status = seat?.status ?? p.status

  // The chain above, nearest first, while it stays inside the scope (a Manager never sees their own seat).
  const chain: ChainLink[] = []
  const seen = new Set<string>([positionId])
  let up = p.managerPositionId
  while (up && !seen.has(up)) {
    seen.add(up)
    const inScope = !scope || positionInScope(up, ctx.access)
    if (!inScope) break
    const row = ctx.positionIndex.byId.get(up)
    chain.push({
      positionId: up,
      title: row?.title ?? null,
      holder: names ? (holderNames.get(up) ?? null) : null,
      opens: !!row,
    })
    up = row?.managerPositionId ?? null
  }

  const history: HistoryRow[] = rows.map((r) => {
    const q = toPosition(r)
    return {
      effectiveDate: q.effectiveDate,
      status: q.status,
      level: LEVEL_LABELS[q.level] ?? q.level,
      location: q.location,
      fte: q.fte,
      businessUnit: q.businessUnit,
      department: q.department,
      endDate: q.endDate,
    }
  })

  const assignments = seatIndex(ctx).get(positionId)?.assignments ?? []
  const holders: HolderRow[] = [...assignments]
    .sort((a, b) => b.start.localeCompare(a.start))
    .map((a) => ({
      name: names ? (people.get(a.employeeId) ?? null) : null,
      start: a.start,
      end: a.end,
      fte: a.fte,
    }))

  const reqRows = reqsOfPosition(ctx, positionId)
  // The records read each request's effective state; the audit links read the stored requests.
  const requests = requestsOf(ctx)
  const touching = requestsTouching(requests, positionId)
  const metrics = ctx.metrics
  const shownTouching = metrics
    ? requestsTouching(effectiveRequestsOf({ ...ctx, metrics }), positionId)
    : touching
  const audited = ctx.audit.filter(
    (e) =>
      (e.object === 'position' && e.id === positionId) ||
      (e.object === 'request' && touching.some((r) => r.requestId === e.id)),
  )
  // The viewer is built only when there is something to shape (requests or audit rows).
  let viewer: Viewer | null = null
  const viewerHere = () => {
    viewer ??= viewerOf(ctx)
    return viewer
  }
  const nameOf = (id: string) => people.get(id) ?? null
  const records = shownTouching.length
    ? requestRecords(shownTouching, { viewer: viewerHere(), asOf: ctx.asOf, nameOf })
    : []
  // The seat's HRBP edit notes, read from the full analytics context the app passes (a context
  // built by hand without the dictionary has none).
  const notes = metrics ? notesOf(ctx as AnalyticsContext, positionId) : []
  const resolve = requestOfEntry(requests, positionId)
  const audit = audited.length
    ? audited
        .map((e) => auditView(e, viewerHere(), resolve))
        .filter((e): e is AuditEntry | AuditRow => e != null)
        .sort((a, b) => b.at.localeCompare(a.at))
    : []

  const subs = subPositions(ctx, positionId).length
  const below = subs ? positionsBelow(ctx, positionId).length : 0
  return {
    positionId,
    found: true,
    outside: false,
    outsideLine: null,
    title: p.title,
    level: LEVEL_LABELS[p.level] ?? p.level,
    status,
    org: {
      businessUnit: p.businessUnit,
      department: p.department,
      costCenter: p.costCenter,
      location: p.location,
      legalEntity: p.legalEntity,
    },
    fte: p.fte,
    workerType: p.workerType,
    plannedStart: status === 'Open' || status === 'Planned' ? (seat?.plannedStart ?? p.startDate) : null,
    endDate: endsSeatOn(current, ctx.asOf) || status === 'Eliminated' ? p.endDate : null,
    acceptedOfferDate: seat?.acceptedOffer?.offerAcceptedDate ?? null,
    holder: status === 'Filled' && names ? (holderNames.get(positionId) ?? null) : null,
    chain,
    history,
    holders,
    subPositions: subs,
    positionsBelow: below,
    reqs: reqRows.length,
    openReqs: openReqsOfPosition(ctx, positionId).length,
    reqRows,
    requests: records,
    audit,
    hrbpChanges: notes.map((n) => ({ text: n.text, reason: n.reason })),
    standardHeads: factsSource?.(ctx, positionId)?.standardHeads ?? null,
    // Finance filters by unit, cost center and site only, so a leader focus would be cleared there.
    focus: below > 0 && ctx.access.mode !== 'finance' && ctx.access.can('focus:filter-to'),
  }
}
