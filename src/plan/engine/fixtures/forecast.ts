/**
 * Forecast fixtures (docs/PLAN.md 6.7, changes C13 and C22).
 *
 * F1 (the double-count trap): 100 heads, attrition 12% a year, backfill 100%, lag 1 month, fill rate
 * 1. Dana's P-1042 ends 15 Oct with backfill request R-88 starting 1 Dec. Monthly rate 0.0105962
 * (1.06%). October modeled = max(0, 100 × 0.0105962 − 1) = 0.0596 (shows 0.06). November heads at
 * start = 100 − 1 − 0.0596 = 98.9404, modeled = 1.0484 (shows 1.05). P-1042 reopens and fills through
 * R-88 on 1 Dec; no extra seat is added and Dana never appears in modeled exits. The wrong model (Dana
 * modeled plus R-88 as a new seat) is the negative control. Time to fill is 30 days here, so R-88's 1
 * Dec start is the later date under the start rule whatever the seat's opening date.
 * F2 (cohort invariance): moving a Planned seat's start from 1 Jan 2027 to 1 Nov 2026 changes
 * band-cohort exits and the band part only; the filled part is identical to the cent.
 * F3 (`openedOn`): a seat moved from Planned to Open by Start recruiting on 21 Aug 2026, 40 days before
 * as-of 30 Sep 2026, with time to fill 60 days and target start 1 Oct 2026: openedOn = 21 Aug, start =
 * max(1 Oct, 30 Sep + max(0, 60 − 40)) = 20 Oct 2026.
 * FS1 (the planted Munich P4, 13.4): Planned with start 16 Sep 2026, as-of 30 Sep 2026, time to fill 75
 * days (P4): forecast start max(16 Sep, 30 Sep + 75) = 14 Dec 2026.
 */
import type { AssumptionRow, CompRow, PositionRow, WorkerRow } from '@/data/schema'
import type { ForecastInput, OpeningForStart } from '../forecast'
import type { SeatHistory } from '../versions'
import { AS_OF, assumption, compRow, fy27Working, hcRequest, positionRow, workerRow } from './common'

const US_LOADS: readonly AssumptionRow[] = [
  assumption('band', 'P3|San Jose|FY27', 165_000),
  assumption('band', 'P4|San Jose|FY27', 195_000),
  assumption('bonusTarget', 'P3', 0.1),
  assumption('bonusTarget', 'P4', 0.1),
  assumption('bonusFunding', 'FY27', 1),
  assumption('burden', 'United States|social', 0.062),
  assumption('burdenCap', 'United States|social', 176_100),
  assumption('benefits', 'United States', 18_000),
  assumption('equity', 'P3', 0),
  assumption('equity', 'P4', 0),
]

/** n Filled San Jose P3 seats with their holders and pay. */
function filledSeats(
  prefix: string,
  n: number,
  base: number,
): { positions: PositionRow[]; workers: WorkerRow[]; comp: CompRow[] } {
  const positions: PositionRow[] = []
  const workers: WorkerRow[] = []
  const comp: CompRow[] = []
  for (let i = 1; i <= n; i++) {
    const id = `${prefix}-${String(i).padStart(3, '0')}`
    positions.push(positionRow(`P-${id}`, { effectiveDate: '2025-04-01' }))
    workers.push(workerRow(`E-${id}`, `P-${id}`))
    comp.push(compRow(`E-${id}`, '2026-04-01', base))
  }
  return { positions, workers, comp }
}

/* ───────────── F1 ───────────── */

const F1_OTHERS = filledSeats('F1', 99, 100_000)

export const F1 = {
  input: {
    version: fy27Working('daily'),
    asOf: AS_OF,
    closes: [],
    positions: [positionRow('P-1042', { effectiveDate: '2025-04-01' }), ...F1_OTHERS.positions],
    workers: [
      workerRow('E-DANA', 'P-1042', { name: 'Dana', terminationDate: '2026-10-15' }),
      ...F1_OTHERS.workers,
    ],
    comp: [compRow('E-DANA', '2026-04-01', 100_000), ...F1_OTHERS.comp],
    reqs: [],
    requests: [
      hcRequest('R-88', {
        type: 'Backfill',
        state: 'Approved',
        reasonCode: 'Attrition backfill',
        positionId: 'P-1042',
        level: 'P3',
        location: 'San Jose',
        fte: 1,
        startDate: '2026-12-01',
      }),
    ],
    freezes: [],
    assumptions: [
      ...US_LOADS,
      assumption('attrition', '*', 0.12),
      assumption('backfillRate', '*', 1),
      assumption('backfillLag', '*', 1),
      assumption('fillRate', '*', 1),
      assumption('timeToFill', 'P3', 30),
    ],
    rates: [],
    inTree: () => false,
  } as ForecastInput,
  monthlyRate: 0.010596241035318976,
  october: { month: '2026-10', hrisHeadsAtStart: 100, knownExits: 1, modeledExits: 0.0596241 },
  november: { month: '2026-11', hrisHeadsAtStart: 98.9403759, modeledExits: 1.0483961 },
  /** P-1042 refills through R-88: one start, on 1 Dec, certain at fill rate 1. */
  refill: { positionId: 'P-1042', start: '2026-12-01', probability: 1, kind: 'open' },
  /** The wrong model's October figure (Dana modeled as well as known). */
  negativeControlOctober: 1.0596241,
} as const

/* ───────────── F2 ───────────── */

const F2_FILLED = filledSeats('F2', 10, 120_000)

const f2Input = (plannedStart: '2027-01-01' | '2026-11-01'): ForecastInput => ({
  version: fy27Working('daily'),
  asOf: AS_OF,
  closes: [],
  positions: [
    ...F2_FILLED.positions,
    positionRow('P-F2', {
      status: 'Planned',
      level: 'P4',
      startDate: plannedStart,
      effectiveDate: '2026-06-01',
    }),
  ],
  workers: F2_FILLED.workers,
  comp: F2_FILLED.comp,
  reqs: [],
  requests: [],
  freezes: [],
  assumptions: [
    ...US_LOADS,
    assumption('attrition', '*', 0.1),
    assumption('backfillRate', '*', 0.9),
    assumption('backfillLag', '*', 2),
    assumption('fillRate', '*', 0.9),
    assumption('timeToFill', 'P3', 30),
    assumption('timeToFill', 'P4', 30),
  ],
  rates: [],
  inTree: () => false,
})

export const F2 = {
  base: f2Input('2027-01-01'),
  moved: f2Input('2026-11-01'),
  /** The months where the band part must differ (the moved start is costed from November). */
  bandDiffersIn: ['2026-11', '2026-12'],
} as const

/* ───────────── F3 and FS1 ───────────── */

const F3_ROWS: PositionRow[] = [
  positionRow('P-F3', { effectiveDate: '2026-04-01', status: 'Planned', startDate: '2026-10-01' }),
  positionRow('P-F3', {
    effectiveDate: '2026-08-21',
    status: 'Open',
    startDate: '2026-10-01',
    openedDate: '2026-08-21',
    sourceRequestId: 'R-F3',
  }),
]

export const F3 = {
  seat: { positionId: 'P-F3', rows: F3_ROWS, assignments: [], reqs: [], backfills: [] } as SeatHistory,
  /** The same seat through the forecast engine (time to fill 60 days, fill rate 1). */
  input: {
    version: fy27Working('daily'),
    asOf: AS_OF,
    closes: [],
    positions: F3_ROWS,
    workers: [],
    comp: [],
    reqs: [],
    requests: [],
    freezes: [],
    assumptions: [...US_LOADS, assumption('timeToFill', 'P3', 60), assumption('fillRate', '*', 1)],
    rates: [],
    inTree: () => false,
  } as ForecastInput,
  asOf: AS_OF,
  openedOn: '2026-08-21',
  opening: { status: 'Open', targetStart: '2026-10-01', openedOn: '2026-08-21' } as OpeningForStart,
  timeToFillDays: 60,
  start: '2026-10-20',
} as const

export const FS1 = {
  opening: { status: 'Planned', targetStart: '2026-09-16', openedOn: null } as OpeningForStart,
  asOf: AS_OF,
  timeToFillDays: 75,
  start: '2026-12-14',
} as const
