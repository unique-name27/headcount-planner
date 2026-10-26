/**
 * Requisitions as the ATS job report exports them (docs/PLAN.md 13.5): vendor headers ("Job Req ID",
 * "Req Status"), statuses such as "Closed - Filled", US dates (M/D/YYYY), the seat's level as an ATS
 * code ("IC4") and its location with a region suffix ("Bangalore, India"), and currencies as signs
 * ("NT$", "€"). The level and location columns are the ATS's own and are not imported (the seat
 * holds them). Planted problems: 3% of the reqs closed before October 2025 have no hiring manager on
 * record, and three old filled reqs carry a hire reason the importer does not know ("Conversion"),
 * so their req type is left blank. Neither field moves a story.
 */
import type { Datasets, PositionRow, ReqRow } from '../../../schema'
import { rngFor } from '../../prng'
import { pickRows, type RawExtract } from '../extract'
import { type Column, currencySign, levelCode, mdy, siteLabel, toAoa } from '../format'
import { FILES } from '../plan'

const STATUS: Record<ReqRow['status'], string> = {
  Open: 'Open',
  'On hold': 'On Hold',
  Filled: 'Closed - Filled',
  Cancelled: 'Closed - Cancelled',
}
const STAGE: Record<string, string> = {
  'Req opened': 'Req Opened',
  Interviewing: 'Interviewing',
  'Offer accepted': 'Offer Accepted',
  Started: 'Started',
}
const REQ_TYPE: Record<string, string> = { New: 'New Headcount', Backfill: 'Backfill' }

/** Share of reqs closed before October 2025 with no hiring manager on record. */
export const NO_MANAGER_SHARE = 0.03
/** Old filled reqs whose hire reason is "Conversion", which is not a req type. */
export const CONVERSIONS = 3

const closedEarly = (r: ReqRow) =>
  (r.status === 'Filled' || r.status === 'Cancelled') && !!r.closedDate && r.closedDate < '2025-10-01'

export interface ReqMess {
  noManager: Set<number>
  conversion: Set<number>
}

export function reqMess(rows: readonly ReqRow[]): ReqMess {
  const rng = rngFor('raw-reqs')
  const noManager = pickRows(rows, Math.round(rows.length * NO_MANAGER_SHARE), rng, closedEarly)
  const conversion = pickRows(
    rows,
    CONVERSIONS,
    rng,
    (r, i) => !noManager.has(i) && closedEarly(r) && r.status === 'Filled',
  )
  return { noManager, conversion }
}

/** The rows the import yields: no hiring manager on 3% of old reqs, and no req type on the conversions. */
export function reqsPlanted(base: Datasets): ReqRow[] {
  const mess = reqMess(base.reqs)
  return base.reqs.map((r, i) => {
    if (!mess.noManager.has(i) && !mess.conversion.has(i)) return r
    const out = { ...r }
    if (mess.noManager.has(i)) out.hiringManagerId = null
    if (mess.conversion.has(i)) out.reqType = null
    return out
  })
}

export function reqsExtract(base: Datasets): RawExtract<'reqs'> {
  const mess = reqMess(base.reqs)
  const seat = new Map<string, PositionRow>()
  for (const p of base.positions) {
    const cur = seat.get(p.positionId)
    if (!cur || p.effectiveDate >= cur.effectiveDate) seat.set(p.positionId, p)
  }
  const columns: Column<ReqRow>[] = [
    { header: 'Job Req ID', cell: (r) => r.reqId },
    { header: 'Position Number', cell: (r) => r.positionId ?? null },
    { header: 'Job Level', cell: (r) => levelCode(r.positionId ? seat.get(r.positionId)?.level : null) },
    {
      header: 'Primary Location',
      cell: (r) => siteLabel(r.positionId ? seat.get(r.positionId)?.location : null),
    },
    { header: 'Req Status', cell: (r) => STATUS[r.status] },
    { header: 'Current Stage', cell: (r) => (r.stage ? STAGE[r.stage] : null) },
    {
      header: 'Reason for Hire',
      cell: (r, i) => (mess.conversion.has(i) ? 'Conversion' : r.reqType ? REQ_TYPE[r.reqType] : null),
    },
    { header: 'Date Opened', cell: (r) => mdy(r.openedDate) },
    { header: 'Target Start', cell: (r) => mdy(r.targetStartDate) },
    { header: 'Offer Accepted Date', cell: (r) => mdy(r.offerAcceptedDate) },
    { header: 'Start Date', cell: (r) => mdy(r.startDate) },
    { header: 'Date Closed', cell: (r) => mdy(r.closedDate) },
    {
      header: 'Hiring Manager Employee ID',
      cell: (r, i) => (mess.noManager.has(i) ? null : (r.hiringManagerId ?? null)),
    },
    { header: 'Recruiter', cell: (r) => r.recruiter ?? null },
    { header: 'Offer Base Salary', cell: (r) => r.offerBase ?? null },
    { header: 'Offer Currency', cell: (r) => currencySign(r.offerCurrency) },
    { header: 'Signing Bonus Amount', cell: (r) => r.signOnBonus ?? null },
    { header: 'Relocation Package', cell: (r) => r.relocation ?? null },
    { header: 'Agency Fee Amount', cell: (r) => r.agencyFee ?? null },
  ]
  return { dataset: 'reqs', ...FILES.reqs, aoa: toAoa(base.reqs, columns) }
}
