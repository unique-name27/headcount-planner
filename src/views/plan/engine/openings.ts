/**
 * Openings in the Plan view (docs/PLAN.md 9.4 Plan > Openings, 12): Open and Planned Employee seats
 * nobody has started in, with their tracker stage, age, target start and flags, and the counts the
 * tiles and the Action center read (past target start, under a freeze, Planned near start with no
 * req, accepted offers, reqs not in plan). An accepted offer shows its date only. Pure.
 *
 * Readings taken here (views-1 builder, M2):
 *  - An opening's req is, as known on the day read: its accepted offer (a req at stage Offer
 *    accepted that nobody has started on), else its latest open req (status Open or On hold), else
 *    none ("No req yet", the stage row `Planned`).
 *  - Target start: an accepted offer's agreed first day, else the open req's target start, else the
 *    seat's planned start (versions.ts `seatOn`), else its row's start date.
 *  - Days in stage count from the stage's own date when the data has one: the req's opened date
 *    (Req opened), the offer's accepted date (Offer accepted). The ATS export has no date for the
 *    move to Interviewing, so that stage reads "—"; a seat with no req has no stage date either.
 *  - Age bands are days since the seat opened (forecast.ts `openedOn`); a Planned seat is not open
 *    yet and has its own band.
 *  - "Under a freeze" is freeze.ts `frozenOpenings` over every freeze (a freeze keyed by any org
 *    can cover the seat), on the day read.
 *  - Reqs not in plan: Open and On hold reqs in scope, as known on the as-of date, whose position is
 *    blank, unknown or not an approved head (an Eliminated or Traded seat, an On hold seat).
 */

import type { AnalyticsContext } from '@/data/context'
import type { ISODate, ReqRow, ReqStage } from '@/data/schema'
import { requestsOf } from '@/drill/seats'
import { addDays, daysBetween } from '@/lib/dates'
import { reqAsOf } from '@/plan/engine/cost'
import { openedOn } from '@/plan/engine/forecast'
import { type FreezeOpening, freezeExemptions, frozenOpenings } from '@/plan/engine/freeze'
import type { SeatDetail } from '@/plan/engine/versions'
import type { Position } from '@/plan/types'
import type { Prep } from './base'
import { inTreeOf, perContext, seatsOf } from './core'
import { seatsOnDay } from './heads'

export type OpeningStage = ReqStage | 'Planned'

/** The stage rows in tracker order (9.4: Req opened, Interviewing, Offer accepted, Started), "No req yet" first. */
export const OPENING_STAGES: readonly { stage: OpeningStage; label: string }[] = [
  { stage: 'Planned', label: 'No req yet' },
  { stage: 'Req opened', label: 'Req opened' },
  { stage: 'Interviewing', label: 'Interviewing' },
  { stage: 'Offer accepted', label: 'Offer accepted' },
  { stage: 'Started', label: 'Started' },
]

/** The age bands (days since the seat opened). */
export const AGE_BANDS: readonly { key: string; label: string; min: number; max: number }[] = [
  { key: '0-30', label: '0 to 30 days', min: 0, max: 30 },
  { key: '31-60', label: '31 to 60 days', min: 31, max: 60 },
  { key: '61-90', label: '61 to 90 days', min: 61, max: 90 },
  { key: '91-180', label: '91 to 180 days', min: 91, max: 180 },
  { key: '181+', label: 'Over 180 days', min: 181, max: Number.POSITIVE_INFINITY },
]
export const NOT_OPEN_BAND = { key: 'planned', label: 'Planned, not open yet' } as const

/** One opening and everything its rows and flags read. */
export interface Opening {
  positionId: string
  state: SeatDetail
  /** The seat's row on the day read, resolved. */
  position: Position
  req: ReqRow | null
  stage: OpeningStage
  targetStart: ISODate | null
  pastStart: boolean
  /** The freeze that holds it on the day read, or null. */
  frozenBy: string | null
  /** No open req and no accepted offer. */
  noReq: boolean
  /** A Planned seat starting within the setting's days with no req (`plan.openings.noReq`). */
  nearNoReq: boolean
  /** When it opened (Open seats). */
  openedOn: ISODate | null
  /** Days since it opened (Open seats). */
  age: number | null
  /** The accepted offer's acceptance date (an accepted offer shows its date only). */
  offerAccepted: ISODate | null
  daysInStage: number | null
}

/** Every opening, with the counts the Plan view and the Action center read. */
export interface Openings {
  on: ISODate
  list: readonly Opening[]
  byId: ReadonlyMap<string, Opening>
  pastStart: readonly Opening[]
  frozen: readonly Opening[]
  nearNoReq: readonly Opening[]
  offers: readonly Opening[]
  /** Open and On hold reqs in scope with no approved head behind them. */
  reqsNotInPlan: readonly ReqRow[]
}

const memo = new WeakMap<Prep, Openings>()

const OPEN_REQ = (r: ReqRow) => r.status === 'Open' || r.status === 'On hold'

/**
 * The seats approved freeze exceptions let through, with the freezes each is let through (10.4,
 * review SC-4): freeze.ts `freezeExemptions` over the requests in force, so a seat Finance approved
 * past a freeze is no frozen opening here, on Finance > Freezes and in the forecast.
 */
export const freezeExemptionsOf = perContext(
  (ctx: AnalyticsContext): ReadonlyMap<string, readonly string[]> =>
    freezeExemptions(requestsOf(ctx), ctx.all.positions, ctx.all.freezes, inTreeOf(ctx), ctx.asOf),
)

export function openingsOf(p: Prep): Openings {
  const hit = memo.get(p)
  if (hit) return hit
  const ctx = p.ctx
  const on = p.on
  const day = seatsOnDay(p, on)
  const seats = seatsOf(ctx)
  const days = p.set.noReqDays
  const horizon = addDays(on, days)
  const list: Opening[] = []
  const freezeInputs: FreezeOpening[] = []
  const exempt = freezeExemptionsOf(ctx)
  for (const id of day.openings) {
    const state = day.states.get(id) as SeatDetail
    const history = seats.get(id)
    const reqs = (history?.reqs ?? []).map((r) => reqAsOf(r, on)).filter((r): r is ReqRow => r != null)
    const offer = state.acceptedOffer ? (reqAsOf(state.acceptedOffer, on) ?? state.acceptedOffer) : null
    let open: ReqRow | null = null
    for (const r of reqs) {
      if (!OPEN_REQ(r) || r.stage === 'Offer accepted' || r.stage === 'Started') continue
      if (
        !open ||
        r.openedDate > open.openedDate ||
        (r.openedDate === open.openedDate && r.reqId > open.reqId)
      )
        open = r
    }
    const req = offer ?? open
    const stage: OpeningStage = offer ? 'Offer accepted' : open ? (open.stage ?? 'Req opened') : 'Planned'
    const row = state.position
    const targetStart =
      offer?.startDate ?? open?.targetStartDate ?? state.plannedStart ?? row.startDate ?? null
    const opened = state.status === 'Open' && history ? openedOn(history, on) : null
    const daysInStage =
      stage === 'Req opened' && req?.openedDate
        ? daysBetween(req.openedDate, on)
        : stage === 'Offer accepted' && req?.offerAcceptedDate
          ? daysBetween(req.offerAcceptedDate, on)
          : null
    const noReq = !offer && !open
    const anyReq = reqs.some((r) => r.status !== 'Cancelled')
    const o: Opening = {
      positionId: id,
      state,
      position: row,
      req,
      stage,
      targetStart,
      pastStart: targetStart != null && targetStart < on,
      frozenBy: null,
      noReq,
      nearNoReq:
        state.status === 'Planned' &&
        !anyReq &&
        state.plannedStart != null &&
        state.plannedStart >= on &&
        state.plannedStart <= horizon,
      openedOn: opened,
      age: opened ? daysBetween(opened, on) : null,
      offerAccepted: offer?.offerAcceptedDate ?? null,
      daysInStage,
    }
    list.push(o)
    const previousHolder = (history?.assignments ?? []).some((a) => a.end != null && a.end < on)
    freezeInputs.push({
      positionId: id,
      status: state.status as 'Open' | 'Planned',
      place: {
        positionId: id,
        managerPositionId: row.managerPositionId,
        businessUnit: row.businessUnit,
        department: row.department,
        costCenter: row.costCenter,
      },
      seat: { level: row.level, location: row.location, fte: row.fte },
      unfrozenStart: targetStart ?? on,
      acceptedOffer: offer != null,
      backfill: previousHolder || (history?.backfills.length ?? 0) > 0 || row.reqType === 'Backfill',
      exemptFrom: exempt.get(id) ?? [],
    })
  }
  const byId = new Map(list.map((o) => [o.positionId, o]))
  for (const f of frozenOpenings(freezeInputs, ctx.all.freezes, on, inTreeOf(ctx))) {
    const o = byId.get(f.positionId)
    if (o) o.frozenBy = f.freezeId
  }
  const reqsNotInPlan: ReqRow[] = []
  for (const raw of ctx.data.reqs) {
    const r = reqAsOf(raw, ctx.asOf)
    if (!r || !OPEN_REQ(r)) continue
    const s = r.positionId ? day.states.get(r.positionId) : undefined
    const known = r.positionId ? seats.has(r.positionId) : false
    if (!r.positionId || !known || !s?.approvedHead) reqsNotInPlan.push(raw)
  }
  const out: Openings = {
    on,
    list,
    byId,
    pastStart: list.filter((o) => o.pastStart),
    frozen: list.filter((o) => o.frozenBy != null),
    nearNoReq: list.filter((o) => o.nearNoReq),
    offers: list.filter((o) => o.stage === 'Offer accepted'),
    reqsNotInPlan: reqsNotInPlan.sort((a, b) => (a.reqId < b.reqId ? -1 : 1)),
  }
  memo.set(p, out)
  return out
}

/** The median of a list (0 for none). */
export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
