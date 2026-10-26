/**
 * What every part of the Requests view reads, once per analytics context (docs/PLAN.md 8.4, 9.4,
 * 10.1): the requests of the loaded data and plan state, the ones in the mode's scope (the scoped
 * `requests` rows the context holds, and plan-state requests by the scope's own test), the viewer
 * (`viewerOf`), and each request as the viewer may see it (`requestRecord`: none, limited or full)
 * with the list's own display fields. Every list and count of the view is built from these rows, so
 * 8.4 holds per row before any table sees it, and every count is over the rows the viewer may see
 * (rule 6). Pure.
 */
import { inScope } from '@/access/records'
import { type RequestView, requestView, type Viewer, viewerOf } from '@/access/visibility'
import type { AnalyticsContext } from '@/data/context'
import {
  APPROVED_REQUEST_STATES,
  type ISODate,
  PENDING_REQUEST_STATES,
  type ReqRow,
  type RequestState,
} from '@/data/schema'
import { requestRecord, waitingStep } from '@/drill/requestRecord'
import { effectiveRequestsOf, workerNames } from '@/drill/seats'
import type { RequestRecord } from '@/drill/types'
import { dateOf, daysToAsOf, onAsOf } from '@/lib/dates'
import type { ChainReason, HcRequest, Step, StepRoleCode } from '@/plan/types'
import { bandEstimateOf } from './planYear'
import { type RequestsSettings, settingsOf } from './settings'

/** The words for an approval step's role. */
export const ROLE_WORD: Readonly<Record<StepRoleCode, string>> = {
  manager: 'Manager',
  hrbp: 'HRBP',
  leader: 'Leader',
  finance: 'Finance',
}

/** Why a chain step was added, in the chain preview's words (never an amount, in every mode). */
const REASON_WORD: Readonly<Record<ChainReason, string>> = {
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

/**
 * The chain preview from the steps stored on the request (10.2: every viewer reads the same chain):
 * "Manager approved, HRBP waiting, Leader (over the leader threshold)". No name, no amount.
 */
export function chainText(steps: readonly Step[]): string | null {
  if (!steps.length) return null
  return steps
    .map((s) => {
      const state = s.decision ? ` ${s.decision.toLowerCase()}` : s.enteredAt ? ' waiting' : ''
      const why = s.reasons
        .map((r) => REASON_WORD[r])
        .filter(Boolean)
        .join(', ')
      return `${ROLE_WORD[s.role]}${state}${why ? ` (${why})` : ''}`
    })
    .join(', ')
}

/** A request as the Requests lists show it: the viewer's record plus the list's display fields. */
export interface RequestListRow extends RequestRecord {
  /** The step it waits on ("HRBP review"), the cycle it waits in ("FY28 cycle"), or null. */
  stepLabel: string | null
  /** It has waited the setting's days or more in its step (`requests.queue.waiting`). */
  waiting: boolean
  /** The chain preview (full rows only): "Manager approved, HRBP waiting, Leader". */
  chain: string | null
  /** After approval, where recruiting stands: Req opened, Interviewing, Offer accepted or Started. */
  stage: string | null
  /**
   * Who the current step is with (10.1, full rows only): the waiting step's approver; after approval,
   * the req's owning recruiter (else its hiring manager) until the seat is Started; else null.
   */
  owner: string | null
  /** Days in the current step: the approval step's, else the recruiting stage's when it has a date. */
  daysShown: number | null
  /** Approvals only (not in Manager mode): the target org's gap after approval, in heads. */
  gapAfterHeads: number | null
  /** The target org the gap after approval is for ("Silicon Engineering"). */
  gapOrg: string | null
}

/** Submitted, In review or Sent back. */
export const isPendingState = (s: RequestState): boolean => PENDING_REQUEST_STATES.includes(s)
const isApprovedState = (s: RequestState): boolean => APPROVED_REQUEST_STATES.includes(s)

/** Everything the view's parts share for one context. */
export interface Prep {
  ctx: AnalyticsContext
  set: RequestsSettings
  viewer: Viewer
  /** The Acting as person, or null while the pick is to be made. */
  me: string | null
  /**
   * Every request of the loaded data and plan state, each in its effective state on the as-of date
   * (src/drill/seats.ts `effectiveRequestsOf`: an idle Draft or Sent back request reads Expired), so
   * every list, count and card of the view reads expiry the one way.
   */
  all: readonly HcRequest[]
  /** The requests in the mode's scope and the filters. */
  inScope: readonly HcRequest[]
  /** The requests the viewer may see at all (8.4 rule 3), in scope or not. */
  visible: readonly HcRequest[]
  /** How much of a request the viewer sees. */
  view(req: HcRequest): RequestView
  /** The viewer's row for a request, or null when 8.4 hides it. */
  row(req: HcRequest): RequestListRow | null
  /** A person's name, or null. */
  nameOf(personId: string): string | null
  /** The waiting step and the days it has waited, or null. */
  waitOf(req: HcRequest): { step: Step; days: number } | null
}

const preps = new WeakMap<AnalyticsContext, Prep>()

/** The reqs on each seat, newest first (memoized per reqs array). */
const reqsMemo = new WeakMap<readonly ReqRow[], ReadonlyMap<string, readonly ReqRow[]>>()
function reqsBySeat(reqs: readonly ReqRow[]): ReadonlyMap<string, readonly ReqRow[]> {
  let hit = reqsMemo.get(reqs)
  if (!hit) {
    const m = new Map<string, ReqRow[]>()
    for (const r of reqs) {
      if (!r.positionId) continue
      const list = m.get(r.positionId)
      if (list) list.push(r)
      else m.set(r.positionId, [r])
    }
    for (const list of m.values()) list.sort((a, b) => b.openedDate.localeCompare(a.openedDate))
    hit = m
    reqsMemo.set(reqs, hit)
  }
  return hit
}

/** The seats each request created (`sourceRequestId`), memoized per positions array. */
const createdMemo = new WeakMap<object, ReadonlyMap<string, readonly string[]>>()
function seatsCreatedBy(ctx: AnalyticsContext): ReadonlyMap<string, readonly string[]> {
  let hit = createdMemo.get(ctx.all.positions)
  if (!hit) {
    const m = new Map<string, Set<string>>()
    for (const r of ctx.all.positions) {
      if (!r.sourceRequestId) continue
      const s = m.get(r.sourceRequestId)
      if (s) s.add(r.positionId)
      else m.set(r.sourceRequestId, new Set([r.positionId]))
    }
    hit = new Map([...m].map(([k, v]) => [k, [...v].sort()]))
    createdMemo.set(ctx.all.positions, hit)
  }
  return hit
}

/** After approval: the seat's latest req, read as the tracker's dates (dates only, an accepted offer included). */
function trackerOf(ctx: AnalyticsContext, req: HcRequest) {
  if (!isApprovedState(req.state)) return null
  const seats = req.positionId ? [req.positionId] : (seatsCreatedBy(ctx).get(req.requestId) ?? [])
  const bySeat = reqsBySeat(ctx.all.reqs)
  // A stored date after the as-of date reads as the as-of date (R47).
  const at = req.updatedAt ? dateOf(onAsOf(req.updatedAt, ctx.asOf)) : ''
  let best: ReqRow | null = null
  for (const s of seats)
    for (const r of bySeat.get(s) ?? []) {
      if (r.status === 'Cancelled') continue
      if (at && r.openedDate < at && r.status !== 'Open' && r.status !== 'On hold') continue
      if (!best || r.openedDate > best.openedDate) best = r
    }
  return best
}

/** Where recruiting stands for a req: its stage, or Started once it is filled. */
const stageOf = (r: ReqRow): string => (r.status === 'Filled' ? 'Started' : (r.stage ?? 'Req opened'))

function stageDate(r: ReqRow, stage: string): ISODate | null {
  if (stage === 'Started') return r.startDate ?? r.closedDate ?? null
  if (stage === 'Offer accepted') return r.offerAcceptedDate ?? null
  if (stage === 'Req opened') return r.openedDate
  return null
}

/** The scoped `requests` rows' IDs, and every imported row's (memoized per array). */
const idsMemo = new WeakMap<readonly { requestId: string }[], ReadonlySet<string>>()
function idsOf(rows: readonly { requestId: string }[]): ReadonlySet<string> {
  let hit = idsMemo.get(rows)
  if (!hit) {
    hit = new Set(rows.map((r) => r.requestId))
    idsMemo.set(rows, hit)
  }
  return hit
}

/** The view's shared reads for a context (cached per context). */
export function prepOf(ctx: AnalyticsContext): Prep {
  const hit = preps.get(ctx)
  if (hit) return hit
  const set = settingsOf(ctx.metrics)
  const viewer = viewerOf(ctx)
  const me = ctx.access.actingAs?.personId ?? null
  const all = effectiveRequestsOf(ctx)
  const people = workerNames(ctx)
  const nameOf = (id: string) => people.get(id) ?? null
  const scopedIds = idsOf(ctx.data.requests)
  const importedIds = idsOf(ctx.all.requests)
  // Imported requests: the context's scoped rows (filters and scope). Requests raised in the app:
  // the scope's own test (8.2), since no dataset row holds them.
  const inScopeList = ctx.access.unset
    ? []
    : all.filter((r) =>
        importedIds.has(r.requestId) ? scopedIds.has(r.requestId) : inScope('requests', r, ctx),
      )
  const views = new Map<string, RequestView>()
  const view = (req: HcRequest): RequestView => {
    let v = views.get(req.requestId)
    if (!v) {
      v = requestView(req, viewer)
      views.set(req.requestId, v)
    }
    return v
  }
  const visible = all.filter((r) => view(r) !== 'none')
  const bandShown = ctx.access.can('cost:band')
  // R47: the step waits from the day it was entered to the as-of date, never negative; a step stored
  // with a later date (a wall-clock date from before R47) reads as entered on the as-of date.
  const waitOf = (req: HcRequest) => {
    if (!isPendingState(req.state)) return null
    const step = waitingStep(req)
    if (!step?.enteredAt) return null
    return { step, days: daysToAsOf(step.enteredAt, ctx.asOf) }
  }
  const rows = new Map<string, RequestListRow | null>()
  const row = (req: HcRequest): RequestListRow | null => {
    if (rows.has(req.requestId)) return rows.get(req.requestId) ?? null
    const rec = requestRecord(req, {
      viewer,
      asOf: ctx.asOf,
      nameOf,
      trackerOf: (r) => {
        const t = trackerOf(ctx, r)
        return t
          ? {
              reqOpened: t.openedDate,
              // The ATS gives the stage, not the day it was entered: Interviewing has no date.
              interviewing: null,
              offerAccepted: t.offerAcceptedDate ?? null,
              started: stageOf(t) === 'Started' ? (t.startDate ?? t.closedDate ?? null) : null,
            }
          : null
      },
      ...(bandShown ? { bandOf: (r: HcRequest) => bandEstimateOf(r, ctx) } : {}),
    })
    if (!rec) {
      rows.set(req.requestId, null)
      return null
    }
    const full = rec.view === 'full'
    const w = full ? waitOf(req) : null
    const t = full ? trackerOf(ctx, req) : null
    const stage = t ? stageOf(t) : null
    const sd = t && stage ? stageDate(t, stage) : null
    const inCycle = !!req.cycleId && isPendingState(req.state) && !w
    const cycleFy = inCycle ? ctx.plan?.cycles.find((c) => c.cycleId === req.cycleId)?.fiscalYear : null
    const out: RequestListRow = {
      ...rec,
      stepLabel: !full
        ? null
        : w
          ? `${ROLE_WORD[w.step.role]} review`
          : inCycle
            ? `${cycleFy ?? 'Planning'} cycle`
            : null,
      waiting: !!w && w.days >= set.waitingDays,
      chain: full ? chainText(req.steps) : null,
      stage,
      owner: !full
        ? null
        : (rec.approverName ??
          (t && stage && stage !== 'Started'
            ? t.recruiter?.trim() || (t.hiringManagerId ? nameOf(t.hiringManagerId) : null)
            : null)),
      daysShown: rec.daysInStep ?? (sd ? daysToAsOf(sd, ctx.asOf) : null),
      gapAfterHeads: null,
      gapOrg: null,
    }
    rows.set(req.requestId, out)
    return out
  }
  const prep: Prep = {
    ctx,
    set,
    viewer,
    me,
    all,
    inScope: inScopeList,
    visible,
    view,
    row,
    nameOf,
    waitOf,
  }
  preps.set(ctx, prep)
  return prep
}

const shownMemo = new WeakMap<Prep, (requestId: string) => boolean>()

/**
 * Whether the viewer sees a request in full, by ID (a text names a request's ID only then, 8.4 rule
 * 6); an ID the data does not hold is not shown. Memoized per prep.
 */
export function shownInFull(p: Prep): (requestId: string) => boolean {
  let hit = shownMemo.get(p)
  if (!hit) {
    let ids: ReadonlySet<string> | null = null
    hit = (id) => {
      ids ??= new Set(p.all.filter((r) => p.view(r) === 'full').map((r) => r.requestId))
      return ids.has(id)
    }
    shownMemo.set(p, hit)
  }
  return hit
}

/** The rows of the requests given, in order, the ones 8.4 hides left out (never counted). */
export function rowsOf(p: Prep, reqs: readonly HcRequest[]): RequestListRow[] {
  const out: RequestListRow[] = []
  for (const r of reqs) {
    const row = p.row(r)
    if (row) out.push(row)
  }
  return out
}
