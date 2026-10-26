/**
 * A small hand-made org for data-layer tests (scope, address checks, store round trips): every
 * dataset filled, with the cases scoping must get right written in on purpose. As of 30 Sep 2026.
 *
 *   P-CEO  Executive Office, San Jose (Ana Rivera)
 *   ├─ P-SVP  Silicon Engineering, San Jose (Ben Cho)
 *   │  └─ P-DIR1  Design Verification, Bengaluru (Dana Ito)
 *   │     └─ P-MGR1  Bengaluru (Eli Park)
 *   │        ├─ P-IC1   P3 Bengaluru, Filled (Fay Lin)
 *   │        ├─ P-IC2   P4 Munich, Open (req R1)
 *   │        ├─ P-IC3   P2 Hsinchu, Planned; a row from 1 Nov 2026 moves it to Bengaluru
 *   │        ├─ P-MOVE  moved here on 1 Aug 2026 from Sales, San Jose (Hana Ruiz since 1 Jul)
 *   │        └─ P-FUT   a seat from 1 Dec 2026 (req R2)
 *   │           └─ P-FUT2  a seat from 1 Jan 2027, under a seat that is also not in effect yet
 *   └─ P-DIR2  Go-to-Market > Sales, San Jose (Gil Moss)
 *      ├─ P-IC4   P5 Munich, Filled, legal entity left blank (Ivy Stone)
 *      └─ P-ELIM  San Jose, Eliminated from 1 Jul 2026 (Hana Ruiz until 30 Jun)
 *   P-LOOP1 ⇄ P-LOOP2  Corporate > Finance: each names the other as manager
 *
 * People with no position: E9 (reports to Eli Park, Design Verification), E10 (reports to Gil Moss,
 * Sales), E11 (in a position the data does not have, P-GHOST), E12 (a contractor reporting to Dana
 * Ito). Comp has a row for someone not in workers (E-NOBODY); reqs R3 has no position and R4 one the
 * data does not have.
 */
import type {
  AssumptionRow,
  CompRow,
  Datasets,
  FreezeRow,
  ISODate,
  PositionRow,
  ReqRow,
  RequestRow,
  TargetRow,
  WorkerRow,
} from '@/data/schema'

export const ORG_AS_OF: ISODate = '2026-09-30'

const pos = (positionId: string, over: Partial<PositionRow>): PositionRow => ({
  positionId,
  effectiveDate: '2026-04-01',
  status: 'Filled',
  title: null,
  level: 'P3',
  businessUnit: 'Silicon Engineering',
  department: 'Design Verification',
  costCenter: '1130-BLR',
  location: 'Bengaluru',
  managerPositionId: 'P-MGR1',
  workerType: 'Employee',
  fte: 1,
  ...over,
})

export const ORG_POSITIONS: PositionRow[] = [
  pos('P-CEO', {
    level: 'E3',
    title: 'Chief executive officer',
    businessUnit: 'Executive Office',
    department: 'Executive Office',
    costCenter: '1010-SJC',
    location: 'San Jose',
    managerPositionId: null,
  }),
  pos('P-SVP', {
    level: 'E2',
    title: 'SVP Silicon Engineering',
    department: null,
    costCenter: '1100-SJC',
    location: 'San Jose',
    managerPositionId: 'P-CEO',
  }),
  pos('P-DIR1', { level: 'M2', title: 'Director, Design Verification', managerPositionId: 'P-SVP' }),
  pos('P-MGR1', { level: 'M1', title: 'Manager, Design Verification', managerPositionId: 'P-DIR1' }),
  pos('P-IC1', {}),
  pos('P-IC2', { level: 'P4', status: 'Open', costCenter: '1130-MUC', location: 'Munich' }),
  pos('P-IC3', { level: 'P2', status: 'Planned', costCenter: '1130-HSZ', location: 'Hsinchu' }),
  pos('P-IC3', {
    effectiveDate: '2026-11-01',
    level: 'P2',
    status: 'Planned',
    costCenter: '1130-BLR',
    location: 'Bengaluru',
  }),
  pos('P-MOVE', {
    businessUnit: 'Go-to-Market',
    department: 'Sales',
    costCenter: '1410-SJC',
    location: 'San Jose',
    managerPositionId: 'P-DIR2',
  }),
  pos('P-MOVE', { effectiveDate: '2026-08-01' }),
  pos('P-FUT', { effectiveDate: '2026-12-01', status: 'Planned' }),
  pos('P-FUT2', { effectiveDate: '2027-01-01', status: 'Planned', managerPositionId: 'P-FUT' }),
  pos('P-DIR2', {
    level: 'M2',
    title: 'Director, Sales',
    businessUnit: 'Go-to-Market',
    department: 'Sales',
    costCenter: '1410-SJC',
    location: 'San Jose',
    managerPositionId: 'P-CEO',
  }),
  pos('P-IC4', {
    level: 'P5',
    businessUnit: 'Go-to-Market',
    department: 'Sales',
    costCenter: '1410-MUC',
    location: 'Munich',
    legalEntity: null,
    managerPositionId: 'P-DIR2',
  }),
  pos('P-ELIM', {
    businessUnit: 'Go-to-Market',
    department: 'Sales',
    costCenter: '1410-SJC',
    location: 'San Jose',
    managerPositionId: 'P-DIR2',
  }),
  pos('P-ELIM', {
    effectiveDate: '2026-07-01',
    status: 'Eliminated',
    endDate: '2026-06-30',
    endReason: 'Eliminated',
    businessUnit: 'Go-to-Market',
    department: 'Sales',
    costCenter: '1410-SJC',
    location: 'San Jose',
    managerPositionId: 'P-DIR2',
  }),
  pos('P-LOOP1', {
    businessUnit: 'Corporate',
    department: 'Finance',
    costCenter: '1510-SJC',
    location: 'San Jose',
    managerPositionId: 'P-LOOP2',
  }),
  pos('P-LOOP2', {
    businessUnit: 'Corporate',
    department: 'Finance',
    costCenter: '1510-SJC',
    location: 'San Jose',
    managerPositionId: 'P-LOOP1',
  }),
]

const worker = (employeeId: string, over: Partial<WorkerRow>): WorkerRow => ({
  employeeId,
  name: null,
  positionId: null,
  assignmentStart: null,
  assignmentEnd: null,
  hireDate: '2020-01-06',
  terminationDate: null,
  workerType: 'Employee',
  fte: 1,
  ...over,
})

export const ORG_WORKERS: WorkerRow[] = [
  worker('E1', { name: 'Ana Rivera', positionId: 'P-CEO' }),
  worker('E2', { name: 'Ben Cho', positionId: 'P-SVP', managerId: 'E1' }),
  worker('E3', { name: 'Dana Ito', positionId: 'P-DIR1', managerId: 'E2' }),
  worker('E4', { name: 'Eli Park', positionId: 'P-MGR1', managerId: 'E3' }),
  worker('E5', { name: 'Fay Lin', positionId: 'P-IC1', managerId: 'E4' }),
  worker('E6', { name: 'Gil Moss', positionId: 'P-DIR2', managerId: 'E1' }),
  worker('E7', { name: 'Ivy Stone', positionId: 'P-IC4', managerId: 'E6' }),
  worker('E8', { name: 'Hana Ruiz', positionId: 'P-ELIM', assignmentEnd: '2026-06-30', managerId: 'E6' }),
  worker('E8', { name: 'Hana Ruiz', positionId: 'P-MOVE', assignmentStart: '2026-07-01', managerId: 'E6' }),
  worker('E9', {
    name: 'Jo Weiss',
    managerId: 'E4',
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    costCenter: '1130-BLR',
    location: 'Bengaluru',
    level: 'P3',
  }),
  worker('E10', {
    name: 'Kai Dunn',
    managerId: 'E6',
    businessUnit: 'Go-to-Market',
    department: 'Sales',
    costCenter: '1410-SJC',
    location: 'San Jose',
    level: 'P2',
  }),
  worker('E11', {
    name: 'Lu Chen',
    positionId: 'P-GHOST',
    managerId: 'E1',
    businessUnit: 'Corporate',
    department: 'Finance',
    costCenter: '1510-SJC',
    location: 'San Jose',
    level: 'P4',
  }),
  worker('E12', {
    name: 'Max Tal',
    workerType: 'Contractor',
    managerId: 'E3',
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    location: 'Bengaluru',
  }),
]

export const ORG_COMP: CompRow[] = [
  ...['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11'].map(
    (employeeId): CompRow => ({ employeeId, effectiveDate: '2026-04-01', baseSalary: 100_000 }),
  ),
  { employeeId: 'E-NOBODY', effectiveDate: '2026-04-01', baseSalary: 90_000 },
]

export const ORG_REQS: ReqRow[] = [
  { reqId: 'R1', positionId: 'P-IC2', status: 'Open', openedDate: '2026-08-15' },
  { reqId: 'R2', positionId: 'P-FUT', status: 'Open', openedDate: '2026-09-20' },
  { reqId: 'R3', positionId: null, status: 'Open', openedDate: '2026-09-01' },
  { reqId: 'R4', positionId: 'P-GHOST2', status: 'On hold', openedDate: '2026-07-01' },
]

const request = (requestId: string, over: Partial<RequestRow>): RequestRow => ({
  requestId,
  type: 'New role',
  state: 'Submitted',
  reasonCode: 'Growth',
  requesterId: 'E4',
  businessUnit: 'Silicon Engineering',
  submittedAt: '2026-09-10T10:00',
  ...over,
})

export const ORG_REQUESTS: RequestRow[] = [
  request('Q1', { managerPositionId: 'P-MGR1', location: 'Bengaluru', level: 'P3' }),
  request('Q2', {
    type: 'Level change',
    reasonCode: 'Level mix',
    positionId: 'P-IC4',
    businessUnit: 'Go-to-Market',
    level: 'P6',
    requesterId: 'E6',
  }),
  request('Q3', {
    type: 'Trade',
    reasonCode: 'Cost-neutral mix',
    businessUnit: 'Go-to-Market',
    giveOrgPositionId: 'P-DIR2',
    givePositionIds: 'P-ELIM; P-X',
    managerPositionId: 'P-DIR2',
    requesterId: 'E6',
  }),
  request('Q4', {
    type: 'Transfer',
    reasonCode: 'Other',
    businessUnit: 'Go-to-Market',
    personId: 'E7',
    fromPositionId: 'P-IC4',
    toManagerPositionId: 'P-MGR1',
    requesterId: 'E6',
  }),
  request('Q5', {
    type: 'Elimination',
    reasonCode: 'Cost reduction',
    businessUnit: 'Corporate',
    positionId: 'P-LOOP1',
    requesterId: 'E1',
  }),
]

export const ORG_TARGETS: TargetRow[] = [
  { fiscalYear: 'FY27', businessUnit: 'Silicon Engineering', leaderPositionId: 'P-SVP', targetHeads: 9 },
  {
    fiscalYear: 'FY27',
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    leaderPositionId: 'P-DIR1',
    targetHeads: 7,
  },
  { fiscalYear: 'FY27', businessUnit: 'Go-to-Market', targetHeads: 4 },
  {
    fiscalYear: 'FY27',
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    costCenter: '1130-BLR',
    targetHeads: 5,
  },
]

export const ORG_FREEZES: FreezeRow[] = [
  { freezeId: 'F1', businessUnit: 'Go-to-Market', leaderPositionId: 'P-DIR2', startDate: '2026-09-01' },
  {
    freezeId: 'F2',
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    startDate: '2026-10-01',
  },
]

export const ORG_ASSUMPTIONS: AssumptionRow[] = [
  { version: 'fy27-working', table: 'bonusFunding', key: 'FY27', value: 1 },
  { version: 'fy27-working', table: 'benefits', org: 'Go-to-Market', key: 'Germany', value: 9_000 },
]

/** The whole org as one set of datasets (fresh arrays each call, so a test may change them). */
export function orgDatasets(): Datasets {
  return {
    positions: ORG_POSITIONS.map((r) => ({ ...r })),
    workers: ORG_WORKERS.map((r) => ({ ...r })),
    comp: ORG_COMP.map((r) => ({ ...r })),
    reqs: ORG_REQS.map((r) => ({ ...r })),
    requests: ORG_REQUESTS.map((r) => ({ ...r })),
    targets: ORG_TARGETS.map((r) => ({ ...r })),
    freezes: ORG_FREEZES.map((r) => ({ ...r })),
    assumptions: ORG_ASSUMPTIONS.map((r) => ({ ...r })),
  }
}
