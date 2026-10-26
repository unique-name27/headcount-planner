/**
 * My list on My team (docs/PLAN.md 9.3 and 10.1): the request tracker. Each request for the tree that
 * the viewer may see (8.4: `requestRecord` shapes the row, a hidden request is no row), with its
 * type, state and where it is: the step waiting on a decision and its approver while it is pending,
 * then, once approved, the recruiting tracker read from `reqs` (Req opened, Interviewing, Offer
 * accepted as a date only, Started) with the req's recruiter as owner. No amount: the record carries
 * no band estimate in Manager mode (no `bandOf` is given here at all). Pure.
 *
 * Readings taken here:
 *  - The req a request leads to: for a New role or a trade, the latest req on a seat it created
 *    (`outcome.createdPositionIds`, else the seats whose `sourceRequestId` names it); for a Backfill
 *    or Start recruiting, the latest req on its seat opened on or after the decision (else the
 *    latest). Other types lead to no req.
 *  - The ATS export gives a req's stage but no date for Interviewing, so that column stays blank and
 *    the stage reads in Step; "days in step" after approval counts from the stage's own date (Req
 *    opened: opened; Offer accepted: accepted; Started: start), blank for Interviewing.
 *  - Rows run pending first (longest in step first), then drafts, approved, and closed requests.
 */

import { requestView, viewerOf } from '@/access/visibility'
import type { Column } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import type { ISODate, ReqRow } from '@/data/schema'
import { requestRecord, waitingStep } from '@/drill/requestRecord'
import { workerNames } from '@/drill/seats'
import { drillSpec, type RequestRecord } from '@/drill/types'
import { daysBetween } from '@/lib/dates'
import type { HcRequest, StepRoleCode } from '@/plan/types'
import { decidedAt } from './facts'

/** One tracker row: the viewer's record of the request, with where it is and who it waits on. */
export interface TeamTrackerRow extends RequestRecord {
  /** "HRBP review (step 2 of 3)" while pending; the req's stage once approved; else the state. */
  step: string
  /** Who it waits on: the step's approver while pending, the req's recruiter once recruiting. */
  owner: string | null
  /** Days in the step: since the step was entered, or since the req's stage date once approved. */
  days: number | null
  /** The req the request led to, once approved. */
  reqId: string | null
}

export const ROLE_REVIEW: Readonly<Record<StepRoleCode, string>> = {
  manager: 'Manager review',
  hrbp: 'HRBP review',
  leader: 'Leader review',
  finance: 'Finance review',
}

const ORDER: Readonly<Record<string, number>> = {
  'In review': 0,
  Submitted: 0,
  'Sent back': 1,
  Draft: 2,
  Approved: 3,
  'Approved with changes': 3,
  Rejected: 4,
  Withdrawn: 5,
  Expired: 6,
}

/** The latest req (by opened date) among `reqs` opened on or after `from` (else the latest of all). */
function latestReq(reqs: readonly ReqRow[], from: ISODate | null): ReqRow | null {
  const sorted = [...reqs].sort((a, b) =>
    a.openedDate < b.openedDate ? 1 : a.openedDate > b.openedDate ? -1 : 0,
  )
  return (from ? sorted.find((r) => r.openedDate >= from) : null) ?? sorted[0] ?? null
}

/** The req an approved request led to, or null. */
export function reqOfRequest(req: HcRequest, ctx: Pick<AnalyticsContext, 'all'>): ReqRow | null {
  const decided = decidedAt(req).slice(0, 10)
  if (req.type === 'New role' || req.type === 'Trade') {
    const created = new Set(
      req.outcome?.createdPositionIds ??
        ctx.all.positions.filter((p) => p.sourceRequestId === req.requestId).map((p) => p.positionId),
    )
    if (!created.size) return null
    return latestReq(
      ctx.all.reqs.filter((r) => r.positionId && created.has(r.positionId)),
      null,
    )
  }
  if ((req.type === 'Backfill' || req.type === 'Start recruiting') && req.positionId) {
    const id = req.positionId
    return latestReq(
      ctx.all.reqs.filter((r) => r.positionId === id),
      decided,
    )
  }
  return null
}

/** Where an approved request's recruiting stands, from its req. */
function recruiting(
  req: ReqRow | null,
  asOf: ISODate,
): Pick<TeamTrackerRow, 'step' | 'owner' | 'days'> & {
  dates: Pick<RequestRecord, 'reqOpened' | 'interviewing' | 'offerAccepted' | 'started'>
} {
  if (!req)
    return {
      step: 'Waiting for a req',
      owner: null,
      days: null,
      dates: { reqOpened: null, interviewing: null, offerAccepted: null, started: null },
    }
  const stage = req.stage ?? 'Req opened'
  const since = (d: ISODate | null | undefined) => (d && d <= asOf ? daysBetween(d, asOf) : null)
  const offerAccepted =
    stage === 'Offer accepted' || stage === 'Started' ? (req.offerAcceptedDate ?? null) : null
  const started = stage === 'Started' ? (req.startDate ?? null) : null
  const days =
    stage === 'Started'
      ? since(started)
      : stage === 'Offer accepted'
        ? since(offerAccepted)
        : stage === 'Req opened'
          ? since(req.openedDate)
          : null
  const step = req.status === 'Cancelled' ? 'Req cancelled' : stage
  return {
    step,
    owner: req.recruiter ?? null,
    days,
    dates: { reqOpened: req.openedDate, interviewing: null, offerAccepted, started },
  }
}

/** The tracker's rows for the requests given (the tree's requests the viewer may see). */
export function trackerRows(
  requests: readonly HcRequest[],
  ctx: Pick<AnalyticsContext, 'all' | 'asOf' | 'access' | 'positionIndex'>,
): TeamTrackerRow[] {
  const viewer = viewerOf(ctx)
  const names = workerNames(ctx)
  const nameOf = (id: string) => names.get(id) ?? null
  const rows: TeamTrackerRow[] = []
  for (const req of requests) {
    if (requestView(req, viewer) === 'none') continue
    const approved = req.state === 'Approved' || req.state === 'Approved with changes'
    const leadsToReq =
      req.type === 'New role' ||
      req.type === 'Trade' ||
      req.type === 'Backfill' ||
      req.type === 'Start recruiting'
    const led = approved && leadsToReq ? reqOfRequest(req, ctx) : null
    const tracked = approved && leadsToReq ? recruiting(led, ctx.asOf) : null
    const record = requestRecord(req, {
      viewer,
      asOf: ctx.asOf,
      nameOf,
      ...(tracked ? { trackerOf: () => tracked.dates } : {}),
    })
    if (!record) continue
    const waiting = waitingStep(req)
    let step: string = req.state
    let owner: string | null = null
    let days: number | null = null
    if (waiting && (req.state === 'Submitted' || req.state === 'In review')) {
      step = `${ROLE_REVIEW[waiting.role]} (step ${waiting.n} of ${req.steps.length})`
      owner = record.approverName
      days = record.daysInStep
    } else if (req.state === 'Sent back') {
      step = 'Sent back to the requester'
      owner = record.requesterName
    } else if (tracked) {
      step = tracked.step
      owner = tracked.owner
      days = tracked.days
    }
    rows.push({ ...record, step, owner, days, reqId: led?.reqId ?? null })
  }
  return rows.sort(
    (a, b) =>
      (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9) ||
      (b.days ?? -1) - (a.days ?? -1) ||
      (a.requestId < b.requestId ? -1 : a.requestId > b.requestId ? 1 : 0),
  )
}

/**
 * The tracker's columns: dates only, no amount; each request opens its record. Typed over
 * `RequestRecord` (the model's frozen row type); Step, Owner and Days in step read the tracker row's
 * own fields by key.
 */
export const TRACKER_COLUMNS: readonly Column<RequestRecord>[] = [
  {
    key: 'requestId',
    label: 'Request',
    drill: (r) => () =>
      drillSpec({
        kind: 'requests',
        title: `Request ${r.requestId}`,
        rows: [r],
        noun: ['request', 'requests'],
      }),
  },
  { key: 'type', label: 'Type' },
  { key: 'positionId', label: 'Position ID' },
  { key: 'jobTitle', label: 'Title', freeText: true },
  { key: 'state', label: 'State' },
  { key: 'step', label: 'Step' },
  { key: 'owner', label: 'Owner' },
  { key: 'days', label: 'Days in step', format: 'days' },
  { key: 'reqOpened', label: 'Req opened', format: 'date' },
  { key: 'interviewing', label: 'Interviewing', format: 'date' },
  { key: 'offerAccepted', label: 'Offer accepted', format: 'date' },
  { key: 'started', label: 'Started', format: 'date' },
]
