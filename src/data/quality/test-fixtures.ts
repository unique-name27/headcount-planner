/**
 * Small hand-built datasets for the quality and lists tests: a 40-seat team as of 30 Sep 2026.
 *
 *   positions  P001 (the head, E3, no manager seat) and P002-P040 reporting to it; P001-P030 Filled,
 *              P031-P040 Eliminated from 1 Jul 2026 (last day 30 Jun, end reason Eliminated)
 *   workers    E001-E040 in P001-P040; E031-E040 left on 30 Jun 2026; E030 started 1 Sep 2026,
 *              the latest event; everyone reports to E001
 *   reqs       R1 and R2, Open, for P031 and P032
 *
 * 30 people are employed on 30 Sep (29 on 31 Aug), with 10 exits in the 12 months before.
 */
import {
  type CompRow,
  type Datasets,
  emptyDatasets,
  type PositionRow,
  type ReqRow,
  type RequestRow,
  type WorkerRow,
} from '../schema'

export { emptyDatasets }

const pad = (n: number) => String(n).padStart(3, '0')

export function pos(n: number, patch: Partial<PositionRow> = {}): PositionRow {
  return {
    positionId: `P${pad(n)}`,
    effectiveDate: '2020-01-01',
    status: 'Filled',
    title: 'Verification engineer',
    jobFamily: 'Silicon Engineering',
    level: 'P3',
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    costCenter: '1130-SJC',
    location: 'San Jose',
    legalEntity: null,
    managerPositionId: n === 1 ? null : 'P001',
    workerType: 'Employee',
    fte: 1,
    startDate: null,
    openedDate: null,
    reqType: null,
    leaderLevel: null,
    endDate: null,
    endReason: null,
    sourceRequestId: null,
    ...patch,
  }
}

export function worker(n: number, patch: Partial<WorkerRow> = {}): WorkerRow {
  return {
    employeeId: `E${pad(n)}`,
    name: `Person ${n}`,
    positionId: `P${pad(n)}`,
    assignmentStart: null,
    assignmentEnd: null,
    hireDate: '2020-01-01',
    terminationDate: null,
    workerType: 'Employee',
    fte: 1,
    level: 'P3',
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    costCenter: '1130-SJC',
    location: 'San Jose',
    legalEntity: null,
    managerId: n === 1 ? null : 'E001',
    onLeave: null,
    leavePaid: null,
    ...patch,
  }
}

export function req(n: number, patch: Partial<ReqRow> = {}): ReqRow {
  return {
    reqId: `R${n}`,
    positionId: `P${pad(30 + n)}`,
    status: 'Open',
    stage: 'Interviewing',
    reqType: 'Backfill',
    openedDate: '2026-08-01',
    targetStartDate: '2026-12-01',
    offerAcceptedDate: null,
    startDate: null,
    closedDate: null,
    hiringManagerId: 'E001',
    recruiter: 'Sam Ortiz',
    offerBase: null,
    offerCurrency: null,
    signOnBonus: null,
    relocation: null,
    agencyFee: null,
    ...patch,
  }
}

export function request(n: number, patch: Partial<RequestRow> = {}): RequestRow {
  return {
    requestId: `HCR-${pad(n)}`,
    type: 'New role',
    state: 'Submitted',
    reasonCode: 'Growth',
    requesterId: 'E001',
    submittedAt: '2026-09-01T09:00',
    updatedAt: '2026-09-02T09:00',
    businessUnit: 'Silicon Engineering',
    managerPositionId: 'P001',
    steps: [{ role: 'Manager', approverId: 'E001', decision: 'Pending', at: null }],
    ...patch,
  }
}

export function comp(n: number, patch: Partial<CompRow> = {}): CompRow {
  return {
    employeeId: `E${pad(n)}`,
    effectiveDate: '2026-04-01',
    currency: 'USD',
    baseSalary: 150_000,
    ...patch,
  }
}

/** The 40 seats: 30 Filled, 10 Eliminated from 1 Jul 2026 (each a second effective-dated row). */
export function seats(): PositionRow[] {
  const out: PositionRow[] = []
  for (let i = 1; i <= 40; i++) {
    out.push(pos(i, { level: i === 1 ? 'E3' : 'P3' }))
    if (i > 30)
      out.push(
        pos(i, {
          effectiveDate: '2026-07-01',
          status: 'Eliminated',
          endDate: '2026-06-30',
          endReason: 'Eliminated',
        }),
      )
  }
  return out
}

/** 40 people: 30 employed, 10 who left on 30 Jun 2026; the latest hire starts 1 Sep 2026. */
export function roster(): WorkerRow[] {
  const out: WorkerRow[] = []
  for (let i = 1; i <= 40; i++)
    out.push(
      worker(i, {
        hireDate: i === 30 ? '2026-09-01' : '2020-01-01',
        terminationDate: i > 30 ? '2026-06-30' : null,
        level: i === 1 ? 'E3' : 'P3',
      }),
    )
  return out
}

export function smallCompany(): Datasets {
  return { ...emptyDatasets(), positions: seats(), workers: roster(), reqs: [req(1), req(2)] }
}
