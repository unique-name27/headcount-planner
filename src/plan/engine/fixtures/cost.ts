/**
 * Cost fixtures (docs/PLAN.md 6.3; 15.1 R21, R22, R30).
 *
 * C1 (the spec's Munich P4): Planned P4 in Munich, starts 16 Sep 2026, midpoint €110,000, target
 * bonus 10% × funding 100%, burden 21% capped at €90,600, plan rate 1.08, no equity or benefits.
 * Bonus €11,000; burden 0.21 × min(121,000, 90,600) = €19,026; annual €140,026; monthly €11,668.83.
 * September daily = half-month = €5,834.42 = $6,301.17; full-month $12,602.34. FY27 daily (Sep 0.5
 * + Oct to Mar 6.0 months) = €75,847.42 = $81,915.21 at 1.08.
 * C2: 0.6 FTE at €100,000 FTE rate = €60,000 base; the burden cap stays €90,600 (burden €13,860;
 * a cap scaled by FTE would give €11,415.60, the negative control).
 * C2b: an Open 0.6 FTE seat with an accepted offer at €100,000 (FTE rate) costs €60,000 base, basis
 * 'offer', from the offer's start (reqs.startDate), never from the position's startDate.
 * C3: merit: hired before the cutoff with latest comp row 1 Mar 2027 gets FY28 merit from 1 Apr 2027;
 * a row dated 1 Apr 2027 gets none; hired after the cutoff gets none; a 1 Apr 2026 row gets no FY27
 * merit.
 * C4: severance: a 1.0 FTE Filled seat in Germany at €120,000 with 3 months: a last day of 31 Dec
 * 2026 books €30,000 in 2027-01 and nothing in 2026-12; a last day of 15 Dec 2026 books it in 2026-12;
 * a pending elimination books nothing.
 */
import type { AssumptionRow, ReqRow } from '@/data/schema'
import type { HcRequest } from '../../types'
import type { CostInput, HrisRateInput, LineContextInput, SeveranceInput } from '../cost'
import {
  AS_OF,
  assumption,
  compRow,
  FY27_MONTHS,
  fxRates,
  fy27Working,
  hcRequest,
  position,
  positionRow,
  workerRow,
} from './common'

/** Munich P4 FY27 loads as assumption rows (company level), and the 6.3 severance months. */
export const MUNICH_ROWS: readonly AssumptionRow[] = [
  assumption('band', 'P4|Munich|FY27', 110_000),
  assumption('band', 'P5|Munich|FY27', 140_000),
  assumption('bonusTarget', 'P4', 0.1),
  assumption('bonusTarget', 'P5', 0.12),
  assumption('bonusFunding', 'FY27', 1),
  assumption('burden', 'Germany|social', 0.21),
  assumption('burdenCap', 'Germany|social', 90_600),
  assumption('benefits', 'Germany', 0),
  assumption('equity', 'P4', 0),
  assumption('equity', 'P5', 0),
  assumption('severance', 'Germany', 3),
]

/** EUR at plan 1.08 in every FY27 month. */
export const EUR_PLAN_108 = fxRates('EUR', 'plan', FY27_MONTHS, 1.08)

/* ───────────── C1 ───────────── */

export const C1 = {
  /** annualLocal input and output. */
  input: {
    rate: 110_000,
    fte: 1,
    bonusTarget: 0.1,
    bonusFunding: 1,
    burden: [{ component: 'social', rate: 0.21, cap: 90_600 }],
    benefits: 0,
  } as CostInput,
  annual: { base: 110_000, bonus: 11_000, burden: 19_026, benefits: 0 },
  annualTotal: 140_026,
  monthlyLocal: 140_026 / 12,
  /** The seat: Planned P4 Munich in Go-to-Market > Sales, approved 10 Jun 2026, planned start 16 Sep 2026. */
  seat: position('P-C1', {
    effectiveDate: '2026-06-10',
    status: 'Planned',
    level: 'P4',
    location: 'Munich',
    costCenter: '4110-MUC',
    legalEntity: 'Northgate Semiconductor GmbH',
    managerPositionId: 'P-GTM-MGR',
    startDate: '2026-09-16',
  }),
  /** The line context for a proration (FY27 grid, plan rates EUR 1.08). */
  context: (proration: 'daily' | 'half-month' | 'full-month'): LineContextInput => ({
    version: fy27Working(proration),
    asOf: AS_OF,
    positions: [
      positionRow('P-C1', {
        effectiveDate: '2026-06-10',
        status: 'Planned',
        level: 'P4',
        location: 'Munich',
        costCenter: '4110-MUC',
        managerPositionId: 'P-GTM-MGR',
        startDate: '2026-09-16',
      }),
    ],
    workers: [],
    comp: [],
    reqs: [],
    requests: [],
    assumptions: MUNICH_ROWS,
    rates: { table: EUR_PLAN_108, use: 'plan', closedThrough: null },
  }),
  september: {
    month: '2026-09',
    /** Local loaded (base + bonus + burden + benefits + oneTime) and USD loaded, by proration. */
    daily: { local: 5_834.42, usd: 6_301.17, active: 0.5 },
    'half-month': { local: 5_834.42, usd: 6_301.17, active: 0.5 },
    'full-month': { local: 11_668.83, usd: 12_602.34, active: 1 },
  },
  /** FY27 under daily proration: Sep 0.5 + Oct to Mar 6.0 months. */
  fy27Daily: { local: 75_847.42, usd: 81_915.21 },
  basis: 'band',
  currency: 'EUR',
  rate: 1.08,
} as const

/* ───────────── C2 and C2b ───────────── */

export const C2 = {
  input: {
    rate: 100_000,
    fte: 0.6,
    bonusTarget: 0.1,
    bonusFunding: 1,
    burden: [{ component: 'social', rate: 0.21, cap: 90_600 }],
    benefits: 0,
  } as CostInput,
  annual: { base: 60_000, bonus: 6_000, burden: 13_860, benefits: 0 },
  /** What a cap scaled by FTE would give: the negative control. */
  scaledCapBurden: 11_415.6,
  /** The same through a Filled seat: a 0.6 FTE holder at €100,000 FTE rate, October 2026, daily. */
  filledSeat: position('P-C2', { level: 'P4', location: 'Munich', costCenter: '4110-MUC', fte: 0.6 }),
  filledContext: (): LineContextInput => ({
    version: fy27Working('daily'),
    asOf: AS_OF,
    positions: [positionRow('P-C2', { level: 'P4', location: 'Munich', costCenter: '4110-MUC', fte: 0.6 })],
    workers: [workerRow('E-C2', 'P-C2', { fte: 0.6, location: 'Munich', costCenter: '4110-MUC' })],
    comp: [compRow('E-C2', '2026-04-01', 100_000, 'EUR')],
    reqs: [],
    requests: [],
    assumptions: MUNICH_ROWS,
    rates: { table: EUR_PLAN_108, use: 'plan', closedThrough: null },
  }),
  october: { month: '2026-10', base: 5_000, bonus: 500, burden: 1_155, basis: 'hris', holderId: 'E-C2' },
} as const

const C2B_REQ: ReqRow = {
  reqId: 'R-C2B',
  positionId: 'P-C2B',
  status: 'Open',
  stage: 'Offer accepted',
  reqType: 'New',
  openedDate: '2026-07-01',
  targetStartDate: '2026-10-01',
  offerAcceptedDate: '2026-08-20',
  startDate: '2026-11-01',
  closedDate: null,
  hiringManagerId: 'E1110',
  recruiter: null,
  offerBase: 100_000,
  offerCurrency: 'EUR',
  signOnBonus: null,
  relocation: null,
  agencyFee: null,
}

export const C2B = {
  seat: position('P-C2B', {
    status: 'Open',
    level: 'P4',
    location: 'Munich',
    costCenter: '4110-MUC',
    fte: 0.6,
    startDate: '2026-10-01',
    openedDate: '2026-07-01',
  }),
  context: (): LineContextInput => ({
    version: fy27Working('daily'),
    asOf: AS_OF,
    positions: [
      positionRow('P-C2B', {
        status: 'Open',
        level: 'P4',
        location: 'Munich',
        costCenter: '4110-MUC',
        fte: 0.6,
        startDate: '2026-10-01',
        openedDate: '2026-07-01',
      }),
    ],
    workers: [],
    comp: [],
    reqs: [C2B_REQ],
    requests: [],
    assumptions: MUNICH_ROWS,
    rates: { table: EUR_PLAN_108, use: 'plan', closedThrough: null },
  }),
  /** Nothing before the offer's start, even though the position's startDate is 1 Oct. */
  october: { month: '2026-10', usdLoaded: 0 },
  /** From 1 Nov: €60,000 a year of base (€5,000 a month), burden on €66,000 (cap unscaled). */
  november: { month: '2026-11', base: 5_000, bonus: 500, burden: 1_155, basis: 'offer', holderId: 'R-C2B' },
} as const

/* ───────────── C3 ───────────── */

const FY28_MERIT = { fiscalYear: 'FY28', date: '2027-04-01', pct: 0.035, cutoff: '2027-01-01' } as const
const FY27_MERIT = { fiscalYear: 'FY27', date: '2026-04-01', pct: 0.035, cutoff: '2026-01-01' } as const

export const C3: readonly { id: string; note: string; input: HrisRateInput; rate: number; merit: number }[] =
  [
    {
      id: 'C3a',
      note: 'hired before the cutoff, latest row 1 Mar 2027: FY28 merit from 1 Apr 2027',
      input: {
        comp: [compRow('E-C3A', '2026-04-01', 100_000), compRow('E-C3A', '2027-03-01', 104_000)],
        hireDate: '2025-06-01',
        on: '2027-04-15',
        merit: [FY27_MERIT, FY28_MERIT],
        promotion: [],
        defaultCurrency: 'USD',
      },
      rate: 107_640,
      merit: 1.035,
    },
    {
      id: 'C3a-before',
      note: 'the same employee before the merit date',
      input: {
        comp: [compRow('E-C3A', '2026-04-01', 100_000), compRow('E-C3A', '2027-03-01', 104_000)],
        hireDate: '2025-06-01',
        on: '2027-03-15',
        merit: [FY27_MERIT, FY28_MERIT],
        promotion: [],
        defaultCurrency: 'USD',
      },
      rate: 104_000,
      merit: 1,
    },
    {
      id: 'C3b',
      note: 'a row dated 1 Apr 2027 (on the merit date): no merit',
      input: {
        comp: [compRow('E-C3B', '2026-04-01', 100_000), compRow('E-C3B', '2027-04-01', 104_000)],
        hireDate: '2025-06-01',
        on: '2027-04-15',
        merit: [FY27_MERIT, FY28_MERIT],
        promotion: [],
        defaultCurrency: 'USD',
      },
      rate: 104_000,
      merit: 1,
    },
    {
      id: 'C3c',
      note: 'hired after the FY28 cutoff: no merit',
      input: {
        comp: [compRow('E-C3C', '2027-02-01', 104_000)],
        hireDate: '2027-02-01',
        on: '2027-04-15',
        merit: [FY27_MERIT, FY28_MERIT],
        promotion: [],
        defaultCurrency: 'USD',
      },
      rate: 104_000,
      merit: 1,
    },
    {
      id: 'C3d',
      note: 'a 1 Apr 2026 row gets no FY27 merit (FY27 merit is already in HRIS pay)',
      input: {
        comp: [compRow('E-C3A', '2026-04-01', 100_000)],
        hireDate: '2025-06-01',
        on: '2026-06-15',
        merit: [FY27_MERIT, FY28_MERIT],
        promotion: [],
        defaultCurrency: 'USD',
      },
      rate: 100_000,
      merit: 1,
    },
  ]

/* ───────────── C4 ───────────── */

const C4_BASE: SeveranceInput = {
  positionId: 'P-C4',
  endDate: '2026-12-31',
  filledOnLastDay: true,
  annualBaseLocal: 120_000,
  currency: 'EUR',
  months: 3,
  holderId: 'E-C4',
}

export const C4 = {
  severance: [
    { id: 'C4a', input: C4_BASE, expected: { kind: 'severance', month: '2027-01', amountLocal: 30_000 } },
    {
      id: 'C4b',
      input: { ...C4_BASE, endDate: '2026-12-15' },
      expected: { kind: 'severance', month: '2026-12', amountLocal: 30_000 },
    },
    { id: 'C4c', input: { ...C4_BASE, endDate: null }, expected: null },
    { id: 'C4d', input: { ...C4_BASE, filledOnLastDay: false }, expected: null },
  ] as readonly {
    id: string
    input: SeveranceInput
    expected: { kind: 'severance'; month: string; amountLocal: number } | null
  }[],
  seat: position('P-C4', { level: 'P5', location: 'Munich', costCenter: '4110-MUC' }),
  /** Lines with the elimination approved (rows end the seat) or only pending (a request, no row). */
  context: (lastDay: '2026-12-31' | '2026-12-15' | 'pending'): LineContextInput => {
    const filled = positionRow('P-C4', { level: 'P5', location: 'Munich', costCenter: '4110-MUC' })
    const eliminatedFrom = lastDay === '2026-12-31' ? '2027-01-01' : '2026-12-16'
    const positions =
      lastDay === 'pending'
        ? [filled]
        : [
            filled,
            positionRow('P-C4', {
              effectiveDate: eliminatedFrom,
              status: 'Eliminated',
              level: 'P5',
              location: 'Munich',
              costCenter: '4110-MUC',
              endDate: lastDay,
              endReason: 'Eliminated',
              sourceRequestId: 'R-C4',
            }),
          ]
    const pending: HcRequest[] =
      lastDay === 'pending'
        ? [
            hcRequest('R-C4', {
              type: 'Elimination',
              state: 'In review',
              positionId: 'P-C4',
              startDate: '2026-12-31',
            }),
          ]
        : []
    return {
      version: fy27Working('daily'),
      asOf: AS_OF,
      positions,
      workers: [
        workerRow('E-C4', 'P-C4', {
          location: 'Munich',
          costCenter: '4110-MUC',
          terminationDate: lastDay === 'pending' ? null : lastDay,
        }),
      ],
      comp: [compRow('E-C4', '2026-04-01', 120_000, 'EUR')],
      reqs: [],
      requests: pending,
      assumptions: MUNICH_ROWS,
      rates: { table: EUR_PLAN_108, use: 'plan', closedThrough: null },
    }
  },
  /** The month severance books in, and the one-time amount (local) in it; every other month books none. */
  booked: {
    '2026-12-31': { month: '2027-01', oneTimeLocal: 30_000 },
    '2026-12-15': { month: '2026-12', oneTimeLocal: 30_000 },
  },
} as const
