/**
 * Bridge and variance fixtures (docs/PLAN.md 6.8 and 9.2).
 *
 * B1 (spec example): plan $10.0M, forecast $10.6M; timing −$0.3M, position changes +$0.5M,
 * attrition −$0.2M, mix +$0.1M, pay rate +$0.2M, assumption rates $0, transfers $0, FX +$0.3M; steps
 * sum to +$0.6M (integer cents, no float drift). B1-cents repeats it with amounts in cents that drift
 * in floating point.
 * BX2: X2's Munich seat, the same on both sides but for its rates (the Budget's plan 1.08 against
 * forecast 1.15 in the open months): every step is $0 but FX, and FX = $8,400 = `fxEffect` on the same
 * lines against the Budget's rates (fixture X2).
 * EV1: with a target comparison (FY28 has no locked version) variance and bridge are an empty state,
 * not an error.
 */
import type { Month } from '@/data/schema'
import type { BridgeInput, BridgeSeat, SeatDrivers } from '../bridge'
import type { MonthFigures, VarianceInput } from '../variance'
import { AS_OF, byMonth, FY27_MONTHS } from './common'

export const B1 = {
  start: 10_000_000,
  /** The total after each step, in BRIDGE_STEPS order. */
  totals: [9_700_000, 10_200_000, 10_000_000, 10_100_000, 10_300_000, 10_300_000, 10_300_000, 10_600_000],
  amounts: [-300_000, 500_000, -200_000, 100_000, 200_000, 0, 0, 300_000],
  keys: ['timing', 'positions', 'attrition', 'mix', 'payRate', 'assumptionRates', 'transfers', 'fx'],
  labels: [
    'Timing',
    'Position changes',
    'Attrition against the vacancy factor',
    'Mix',
    'Pay rate',
    'Assumption rates',
    'Transfers',
    'FX',
  ],
  sum: 600_000,
} as const

export const B1_CENTS = {
  start: 10_000_000.1,
  totals: [
    9_700_000.3, 10_200_000.2, 10_000_000.1, 10_100_000.4, 10_300_000.5, 10_300_000.5, 10_300_000.5,
    10_600_000.1,
  ],
  /** Each step in integer cents. */
  amountCents: [-29_999_980, 49_999_990, -20_000_010, 10_000_030, 20_000_010, 0, 0, 29_999_960],
  sumCents: 60_000_000,
} as const

const OPEN = new Set<Month>(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'])

/** X2's seat on one side: €20,000 a month of base in the open months, nothing else. */
const x2Side = (rate: (m: Month) => number): SeatDrivers => ({
  active: byMonth(FY27_MONTHS, (m) => (OPEN.has(m) ? 1 : 0)),
  exists: true,
  retention: byMonth(FY27_MONTHS, () => 1),
  level: 'P4',
  location: 'Munich',
  fte: 1,
  currency: 'EUR',
  payRate: 240_000,
  basis: 'band',
  bonusTarget: 0,
  bonusFunding: 1,
  burden: [],
  benefits: 0,
  oneTime: byMonth(FY27_MONTHS, () => 0),
  inScope: true,
  rates: byMonth(FY27_MONTHS, rate),
})

export const BX2_SEAT: BridgeSeat = {
  positionId: 'P-X1',
  comparison: x2Side(() => 1.08),
  forecast: x2Side(() => 1.15),
}

export const BX2 = {
  input: {
    fiscalYear: 'FY27',
    comparison: { versionId: 'fy27-budget', label: 'FY27 Budget', fiscalYear: 'FY27' },
    yearHasLockedVersion: true,
    months: FY27_MONTHS,
    seats: [BX2_SEAT],
  } as BridgeInput,
  start: 129_600,
  end: 138_000,
  amounts: [0, 0, 0, 0, 0, 0, 0, 8_400],
  fxStep: 8_400,
} as const

const zeroMonths = (months: readonly Month[]): MonthFigures[] =>
  months.map((month) => ({ month, heads: 10, fte: 10, cost: 100_000 }))

const FY28_MONTHS: readonly Month[] = [
  '2027-04',
  '2027-05',
  '2027-06',
  '2027-07',
  '2027-08',
  '2027-09',
  '2027-10',
  '2027-11',
  '2027-12',
  '2028-01',
  '2028-02',
  '2028-03',
]

export const EV1 = {
  variance: {
    fiscalYear: 'FY28',
    current: zeroMonths(FY28_MONTHS),
    comparison: null,
    yearHasLockedVersion: false,
    asOf: AS_OF,
  } as VarianceInput,
  /** The same with a locked version in the year but the target picked. */
  varianceTargetPicked: {
    fiscalYear: 'FY27',
    current: zeroMonths(FY27_MONTHS),
    comparison: null,
    yearHasLockedVersion: true,
    asOf: AS_OF,
  } as VarianceInput,
  bridge: {
    fiscalYear: 'FY28',
    comparison: null,
    yearHasLockedVersion: false,
    months: FY28_MONTHS,
    seats: [],
  } as BridgeInput,
  noLockedVersion: 'FY28 has no locked version yet.',
  targetPicked: 'A target has no monthly plan. Pick a version to compare.',
} as const
