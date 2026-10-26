/**
 * A request as a drill record (`RequestRecord`, ./types.ts), shaped for the viewer by docs/PLAN.md
 * 8.4: `requestView` decides 'full', 'limited' or 'none' (src/access/visibility.ts); a 'none' request
 * is no record at all (rule 3), a 'limited' one keeps only the position ID, title, level and org
 * (rule 2), a Backfill names the leaver's position and never the leaver (rule 4), a Transfer shows
 * the moving person's name, from, to and date to rule 2a's viewers and never an amount. Every
 * reader that lists requests (the Requests queue, Mine and Approvals, My team's tracker, the HRBP
 * home's list, the position card) builds its rows here, so the rules hold the same way everywhere.
 *
 * No comment text is ever copied (comments go through `commentVisible` where they are shown), and
 * no amount but the band estimate, which only a full record carries and only where the caller gives
 * one (`bandOf`: never in Manager mode). The job title is free text that can arrive through Import
 * requests, workspace Merge or an opened file without the entry check, so Manager mode reads it
 * through `managerText` ("an amount" for each amount, 8.4 rule 5, 7.6): `titleFor` is that one
 * reading, for every surface and file that shows a request's title. Days in step run from the day the
 * step was entered to the as-of date and never go negative; a step stored with a later date reads as
 * entered on the as-of date (R47). Pure. Frozen in the M2 freeze (docs/CONTRACTS-M2.md).
 */
import { managerText, requestView, type Viewer } from '@/access/visibility'
import type { ISODate } from '@/data/schema'
import { daysToAsOf } from '@/lib/dates'
import { WHY_KEY } from '@/lib/export/suppressedFlag'
import type { HcRequest, Step } from '@/plan/types'
import type { RequestRecord } from './types'

/** What a request record reads besides the request. */
export interface RequestRecordInput {
  viewer: Viewer
  /** Days in step count to this date. */
  asOf: ISODate
  /** A person's name, or null when not on the roster. */
  nameOf: (personId: string) => string | null
  /** The tracker dates after approval (from `reqs`); none when not given. */
  trackerOf?: (
    req: HcRequest,
  ) => Pick<RequestRecord, 'reqOpened' | 'interviewing' | 'offerAccepted' | 'started'> | null
  /** The request's band estimate where `cost:band` shows; none when not given (Manager mode gives none). */
  bandOf?: (req: HcRequest) => number | null
}

/**
 * A request's job title as the viewer reads it: in Manager mode every amount in it reads "an amount"
 * (8.4 rule 5 at read time: titles imported or merged never passed the entry check); elsewhere as
 * stored. Null stays null.
 */
export function titleFor(title: string | null, viewer: Viewer): string | null {
  return title ? managerText(title, viewer) : title
}

/** The step waiting on a decision: the first step without one that the request has reached. */
export function waitingStep(req: Pick<HcRequest, 'steps'>): Step | null {
  return req.steps.find((s) => s.decision == null && s.enteredAt != null) ?? null
}

const NO_TRACKER = { reqOpened: null, interviewing: null, offerAccepted: null, started: null } as const

/** The viewer's record of a request, or null when 8.4 hides it from them. */
/**
 * Why a limited request's amounts are empty (8.4 rule 2), as every export's Why column states it on
 * the row (`WHY_KEY`, review EX-9): the row is cut to its seat, so its band estimate is hidden, not
 * missing.
 */
export const LIMITED_WHY_TEXT = 'Shows only position ID, title, level and org for this request.'

export function requestRecord(req: HcRequest, input: RequestRecordInput): RequestRecord | null {
  const view = requestView(req, input.viewer)
  if (view === 'none') return null
  const always = {
    requestId: req.requestId,
    view,
    type: req.type,
    state: req.state,
    positionId: req.positionId,
    jobTitle: titleFor(req.jobTitle, input.viewer),
    level: req.level,
    businessUnit: req.businessUnit,
    department: req.department,
    managerPositionId: req.managerPositionId,
  } as const
  if (view === 'limited')
    return {
      ...always,
      requesterId: null,
      requesterName: null,
      reasonCode: null,
      location: null,
      fte: null,
      startDate: null,
      submittedAt: null,
      stepN: null,
      stepRole: null,
      approverId: null,
      approverName: null,
      daysInStep: null,
      transferPersonName: null,
      fromPositionId: null,
      toPositionId: null,
      toManagerPositionId: null,
      effectiveDate: null,
      giveBp: null,
      getBp: null,
      creditBp: null,
      count: null,
      bandEstimateUsd: null,
      [WHY_KEY]: LIMITED_WHY_TEXT,
      ...NO_TRACKER,
    }
  const step = waitingStep(req)
  const entered = step?.enteredAt ?? null
  const t = req.transfer
  const trade = req.trade
  const tracker = input.trackerOf?.(req) ?? null
  return {
    ...always,
    requesterId: req.requesterId,
    requesterName: input.nameOf(req.requesterId),
    reasonCode: req.reasonCode,
    location: req.location,
    fte: req.fte,
    startDate: req.startDate,
    submittedAt: req.submittedAt,
    stepN: step?.n ?? null,
    stepRole: step?.role ?? null,
    approverId: step?.approverId ?? null,
    approverName: step ? input.nameOf(step.approverId) : null,
    daysInStep: entered ? daysToAsOf(entered, input.asOf) : null,
    // Rule 2a: the moving person's name, from, to and date; rule 4 keeps a Backfill to its seat.
    transferPersonName: t ? input.nameOf(t.personId) : null,
    fromPositionId: t?.fromPositionId ?? null,
    toPositionId: t?.toPositionId ?? null,
    toManagerPositionId: t?.toManagerPositionId ?? null,
    effectiveDate: t?.effectiveDate ?? null,
    // Weights in basis points of a standard head (`ui:trade-weights`), never USD.
    giveBp: trade?.giveBp ?? null,
    getBp: trade?.getBp ?? null,
    creditBp: trade?.creditBp ?? null,
    count: trade ? trade.count : null,
    bandEstimateUsd: input.bandOf?.(req) ?? null,
    reqOpened: tracker?.reqOpened ?? null,
    interviewing: tracker?.interviewing ?? null,
    offerAccepted: tracker?.offerAccepted ?? null,
    started: tracker?.started ?? null,
  }
}

/** Every request the viewer may see, as records, in the order given (rule 3's are left out, never counted). */
export function requestRecords(requests: readonly HcRequest[], input: RequestRecordInput): RequestRecord[] {
  const out: RequestRecord[] = []
  for (const r of requests) {
    const rec = requestRecord(r, input)
    if (rec) out.push(rec)
  }
  return out
}
