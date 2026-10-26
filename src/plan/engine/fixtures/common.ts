/**
 * Shared builders for the engine fixtures (docs/PLAN.md 6, 10.2 and 11.7). Plain data with defaults,
 * so each fixture states only what it is about. Nothing here computes a result: expected values live
 * in each fixture file, written out by hand from the plan.
 *
 * Defaults: a 1.0 FTE Employee seat in Go-to-Market > Sales in San Jose, effective 1 Apr 2026;
 * the FY27 Working version (1 Apr 2026 to 31 Mar 2027, daily proration); as-of 30 Sep 2026.
 */
import type {
  AssumptionRow,
  AssumptionTable,
  CompRow,
  FxSet,
  ISODate,
  Month,
  PositionRow,
  Proration,
  WorkerRow,
} from '@/data/schema'
import type { Assignment, FxRate, HcRequest, Position, WorkingVersion } from '../../types'
import { ENGINE_VERSION } from '../versions'

export const AS_OF: ISODate = '2026-09-30'

export const FY27_MONTHS: readonly Month[] = [
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
  '2026-11',
  '2026-12',
  '2027-01',
  '2027-02',
  '2027-03',
]

/** The FY27 months from October 2026 (the first open month in the sample). */
export const FY27_OPEN_MONTHS: readonly Month[] = FY27_MONTHS.slice(6)

/** A Working version of FY27 under a proration. */
export function fy27Working(
  proration: Proration = 'daily',
  over: Partial<WorkingVersion> = {},
): WorkingVersion {
  return {
    versionId: 'fy27-working',
    name: 'FY27 Working',
    kind: 'working',
    fiscalYear: 'FY27',
    grid: { from: '2026-04', to: '2027-03' },
    proration,
    state: 'working',
    createdAt: '2026-03-20T09:00',
    lockedAt: null,
    lockedBy: null,
    engineVersion: ENGINE_VERSION,
    parentId: null,
    hash: null,
    ...over,
  }
}

const LEGAL_ENTITY: Record<string, string> = {
  'San Jose': 'Northgate Semiconductor Inc.',
  Munich: 'Northgate Semiconductor GmbH',
  Haifa: 'Northgate Semiconductor Israel Ltd.',
  Bengaluru: 'Northgate Semiconductor India Pvt. Ltd.',
}

/** A position row with defaults (Go-to-Market > Sales, San Jose, P3, Filled, 1.0 FTE, from 1 Apr 2026). */
export function positionRow(positionId: string, over: Partial<PositionRow> = {}): PositionRow {
  const location = over.location ?? 'San Jose'
  return {
    positionId,
    effectiveDate: '2026-04-01',
    status: 'Filled',
    title: null,
    jobFamily: 'Sales',
    level: 'P3',
    businessUnit: 'Go-to-Market',
    department: 'Sales',
    costCenter: '4110-SJC',
    location,
    legalEntity: LEGAL_ENTITY[location] ?? null,
    managerPositionId: null,
    workerType: 'Employee',
    fte: 1,
    startDate: null,
    openedDate: null,
    reqType: null,
    leaderLevel: null,
    endDate: null,
    endReason: null,
    sourceRequestId: null,
    ...over,
  }
}

/** A resolved Position (what `toPosition` returns) from the same defaults. */
export function position(positionId: string, over: Partial<Position> = {}): Position {
  const row = positionRow(positionId, over as Partial<PositionRow>)
  return {
    positionId,
    effectiveDate: row.effectiveDate,
    status: row.status,
    title: row.title ?? null,
    jobFamily: row.jobFamily ?? null,
    level: row.level,
    businessUnit: row.businessUnit,
    department: row.department ?? null,
    costCenter: row.costCenter,
    location: row.location,
    legalEntity: row.legalEntity ?? '',
    managerPositionId: row.managerPositionId ?? null,
    workerType: row.workerType ?? 'Employee',
    fte: row.fte ?? 1,
    startDate: row.startDate ?? null,
    openedDate: row.openedDate ?? null,
    reqType: row.reqType ?? null,
    leaderLevel: row.leaderLevel ?? null,
    endDate: row.endDate ?? null,
    endReason: row.endReason ?? null,
    sourceRequestId: row.sourceRequestId ?? null,
    ...over,
  }
}

/** A workers row with defaults (an Employee hired 1 Jan 2024, 1.0 FTE, San Jose, no exit). */
export function workerRow(
  employeeId: string,
  positionId: string | null,
  over: Partial<WorkerRow> = {},
): WorkerRow {
  return {
    employeeId,
    name: null,
    positionId,
    assignmentStart: null,
    assignmentEnd: null,
    hireDate: '2024-01-01',
    terminationDate: null,
    workerType: 'Employee',
    fte: 1,
    level: null,
    businessUnit: 'Go-to-Market',
    department: 'Sales',
    costCenter: '4110-SJC',
    location: 'San Jose',
    legalEntity: null,
    managerId: null,
    onLeave: false,
    leavePaid: null,
    ...over,
  }
}

/** An Employee assignment (what `toAssignments` returns). */
export function assignment(
  employeeId: string,
  positionId: string | null,
  start: ISODate,
  end: ISODate | null = null,
  fte = 1,
): Assignment {
  return { employeeId, positionId, start, end, fte, workerType: 'Employee' }
}

/** A comp row. */
export function compRow(
  employeeId: string,
  effectiveDate: ISODate,
  baseSalary: number,
  currency = 'USD',
): CompRow {
  return { employeeId, effectiveDate, currency, baseSalary, targetBonusPct: null }
}

/** An assumption row of the FY27 Working version (blank org: the company). */
export function assumption(
  table: AssumptionTable,
  key: string,
  value: number,
  org: string | null = null,
  version = 'fy27-working',
): AssumptionRow {
  return { version, table, org, key, value }
}

/** The same rate for a currency and set in every listed month. */
export function fxRates(
  currency: string,
  set: FxSet,
  months: readonly Month[],
  usdPerLocal: number,
): FxRate[] {
  return months.map((month) => ({ currency, set, month, usdPerLocal }))
}

/** A headcount request with defaults (Submitted New role in Go-to-Market, requested by E1110). */
export function hcRequest(requestId: string, over: Partial<HcRequest> = {}): HcRequest {
  return {
    requestId,
    type: 'New role',
    state: 'Submitted',
    reasonCode: 'Growth',
    requesterId: 'E1110',
    submittedById: null,
    submittedAt: '2026-09-01T09:00',
    updatedAt: '2026-09-01T09:00',
    positionId: null,
    managerPositionId: 'P-GTM-MGR',
    businessUnit: 'Go-to-Market',
    department: 'Sales',
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

/** A record with one value for every listed month (bridge drivers). */
export function byMonth<T>(months: readonly Month[], value: (m: Month) => T): Record<Month, T> {
  const out = {} as Record<Month, T>
  for (const m of months) out[m] = value(m)
  return out
}
