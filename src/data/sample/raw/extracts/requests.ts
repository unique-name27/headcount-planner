/**
 * Headcount requests as one messy tracker spreadsheet in the Data room (docs/PLAN.md 13.5, bronze:
 * nobody has confirmed its mapping). It is not the Import requests files (raw/requestFiles.ts).
 * A title row sits above the headers; types and states are in title case ("New Role", "In Review"),
 * times are written "2026-09-14 10:12", levels as "IC3", locations with a region suffix, yes / no
 * fields as Y / N and the approval steps as one compact text column ("Manager E10234 Approved
 * 2026-08-03; HRBP E10077 Pending"). Planted problem: the tracker had no cost center column before
 * June 2026, so the requests raised in May have none. Those requests were all decided long ago, so
 * no story reads it.
 */
import { formatSteps } from '../../../import/steps'
import type { Datasets, RequestRow } from '../../../schema'
import type { RawExtract } from '../extract'
import { type Cell, type Column, levelCode, mdy, siteLabel, stamp, toAoa, yn } from '../format'
import { FILES } from '../plan'

export const TITLE_ROW = 'Headcount requests tracker, exported 30 Sep 2026'
/** Requests raised before this day have no cost center in the tracker. */
export const COST_CENTER_COLUMN_ADDED = '2026-06-01'

const raisedOn = (r: RequestRow) => (r.submittedAt ?? r.updatedAt ?? '').slice(0, 10)

/** Row indexes of the requests with no cost center. */
export function noCostCenterRows(rows: readonly RequestRow[]): Set<number> {
  const out = new Set<number>()
  rows.forEach((r, i) => {
    if (raisedOn(r) < COST_CENTER_COLUMN_ADDED && r.costCenter) out.add(i)
  })
  return out
}

/** The rows the import yields: the clean requests, with no cost center on the ones raised in May. */
export function requestsPlanted(base: Datasets): RequestRow[] {
  const blank = noCostCenterRows(base.requests)
  return base.requests.map((r, i) => (blank.has(i) ? { ...r, costCenter: null } : r))
}

const title = (s: string | null | undefined): string | null =>
  s == null ? null : s.replace(/(^|\s)([a-z])/g, (_, a: string, b: string) => `${a}${b.toUpperCase()}`)

const num = (v: number | null | undefined): Cell => (v == null ? null : v)

export function requestsExtract(base: Datasets): RawExtract<'requests'> {
  const blank = noCostCenterRows(base.requests)
  const columns: Column<RequestRow>[] = [
    { header: 'Request Ref', cell: (r) => r.requestId },
    { header: 'Headcount Action', cell: (r) => title(r.type) },
    { header: 'Workflow Status', cell: (r) => title(r.state) },
    { header: 'Reason For Request', cell: (r) => r.reasonCode },
    { header: 'Requester Employee ID', cell: (r) => r.requesterId },
    { header: 'Submitted By', cell: (r) => r.submittedById ?? null },
    { header: 'Submitted On', cell: (r) => stamp(r.submittedAt) },
    { header: 'Last Update', cell: (r) => stamp(r.updatedAt) },
    { header: 'Position ID', cell: (r) => r.positionId ?? null },
    { header: 'Business Unit', cell: (r) => r.businessUnit },
    { header: 'Department', cell: (r) => r.department ?? null },
    { header: 'Cost Center', cell: (r, i) => (blank.has(i) ? null : (r.costCenter ?? null)) },
    { header: 'Manager Position ID', cell: (r) => r.managerPositionId ?? null },
    { header: 'Requested Level', cell: (r) => levelCode(r.level) },
    { header: 'Requested Location', cell: (r) => siteLabel(r.location) },
    { header: 'Job Title', cell: (r) => r.jobTitle ?? null },
    { header: 'FTE', cell: (r) => num(r.fte) },
    { header: 'Proposed Start Date', cell: (r) => mdy(r.startDate) },
    { header: 'Rank', cell: (r) => num(r.priority) },
    { header: 'Planning Cycle', cell: (r) => r.cycleId ?? null },
    { header: 'Approval History', cell: (r) => (r.steps?.length ? formatSteps(r.steps) : null) },
    { header: 'Confidential', cell: (r) => yn(r.confidential) },
    { header: 'Freeze Exception', cell: (r) => yn(r.exception) },
    { header: 'Give Position IDs', cell: (r) => r.givePositionIds ?? null },
    { header: 'Giving Org Position ID', cell: (r) => r.giveOrgPositionId ?? null },
    { header: 'Credit Used BP', cell: (r) => num(r.creditUsedBp) },
    { header: 'Seats Received', cell: (r) => num(r.count) },
    { header: 'Job Family', cell: (r) => r.jobFamily ?? null },
    { header: 'Part Time Rest', cell: (r) => yn(r.partTimeRest) },
    { header: 'Rest FTE', cell: (r) => num(r.restFte) },
    { header: 'Rate Version', cell: (r) => r.rateVersion ?? null },
    { header: 'Rate Hash', cell: (r) => r.rateHash ?? null },
    { header: 'Give BP', cell: (r) => num(r.giveBp) },
    { header: 'Get BP', cell: (r) => num(r.getBp) },
    { header: 'Credit BP', cell: (r) => num(r.creditBp) },
    { header: 'Transfer Type', cell: (r) => r.transferKind ?? null },
    { header: 'Moving Person ID', cell: (r) => r.personId ?? null },
    { header: 'From Position ID', cell: (r) => r.fromPositionId ?? null },
    { header: 'To Manager Position ID', cell: (r) => r.toManagerPositionId ?? null },
    { header: 'To Position ID', cell: (r) => r.toPositionId ?? null },
    { header: 'Effective Date', cell: (r) => mdy(r.effectiveDate) },
    { header: 'Move Budget', cell: (r) => yn(r.moveBudget) },
  ]
  return {
    dataset: 'requests',
    ...FILES.requests,
    aoa: [[TITLE_ROW], [], ...toAoa(base.requests, columns)],
  }
}
