/**
 * Band estimate and standard head fixtures (docs/PLAN.md 11.2 and 11.7).
 *
 * The 11.7 seat table, at 1.0 FTE unless stated, plan FX USD 1, EUR 1.08, INR 0.012, ILS 0.27,
 * standard head S = $150,000:
 *
 * | Seat | Midpoint, bonus | Burden, benefits | Band estimate | Weight |
 * |---|---|---|---|---|
 * | P3 San Jose | $150,000, 10% | 8% capped $180,000; $20,000 | $198,200.00 | 13,213 |
 * | P4 San Jose | $180,000, 12% | same | $236,000.00 | 15,733 |
 * | P5 San Jose | $220,000, 15% | same | $287,400.00 | 19,160 |
 * | M2 San Jose | $300,000, 20% | same | $394,400.00 | 26,293 |
 * | P4 Munich | €110,000, 10% | 21% capped €90,600; €0 | €140,026 = $151,228.08 | 10,082 |
 * | P3 Bengaluru | ₹2,500,000, 10% | 12% capped ₹180,000; ₹50,000 | ₹2,821,600 = $33,859.20 | 2,257 |
 * | P4 Haifa | ₪480,000, 10% | 12.5% capped ₪600,000; ₪0 | ₪594,000 = $160,380.00 | 10,692 |
 *
 * F-S: 1 P5 San Jose, 1 P4 San Jose, 6 P4 Munich and 2 P3 Bengaluru at 1.0 FTE: Σ $1,498,486.88 ÷ 10
 * FTE = $149,848.69, rounds to $150,000. Changing any Filled seat's HRIS salary leaves S unchanged.
 * F-S2: the same seats plus 1 P4 Munich at 0.5 FTE ($79,061.40): Σ $1,577,548.28 ÷ 10.5 FTE =
 * $150,242.69, still $150,000. Dividing by heads gives $143,413.48 (rounds to $143,000): the divisor
 * is Σ FTE.
 */
import type { Level } from '@/data/schema'
import type { Loads, SeatType, TradePosition, TradeRates } from '../band'

export const STANDARD_HEAD_USD = 150_000

/** USD per 1 local, plan rates (11.7). */
export const PLAN_RATE: Readonly<Record<string, number>> = { USD: 1, EUR: 1.08, INR: 0.012, ILS: 0.27 }

const usLoads = (midpoint: number, bonusTarget: number): Loads => ({
  midpoint,
  currency: 'USD',
  bonusTarget,
  bonusFunding: 1,
  burden: [{ component: 'social', rate: 0.08, cap: 180_000 }],
  benefits: 20_000,
  equityUsd: 0,
})

/** The 11.7 loads by `<level>|<location>`. */
export const LOADS_11_7: Readonly<Record<string, Loads>> = {
  'P3|San Jose': usLoads(150_000, 0.1),
  'P4|San Jose': usLoads(180_000, 0.12),
  'P5|San Jose': usLoads(220_000, 0.15),
  'M2|San Jose': usLoads(300_000, 0.2),
  'P4|Munich': {
    midpoint: 110_000,
    currency: 'EUR',
    bonusTarget: 0.1,
    bonusFunding: 1,
    burden: [{ component: 'social', rate: 0.21, cap: 90_600 }],
    benefits: 0,
    equityUsd: 0,
  },
  'P3|Bengaluru': {
    midpoint: 2_500_000,
    currency: 'INR',
    bonusTarget: 0.1,
    bonusFunding: 1,
    burden: [{ component: 'social', rate: 0.12, cap: 180_000 }],
    benefits: 50_000,
    equityUsd: 0,
  },
  'P4|Haifa': {
    midpoint: 480_000,
    currency: 'ILS',
    bonusTarget: 0.1,
    bonusFunding: 1,
    burden: [{ component: 'social', rate: 0.125, cap: 600_000 }],
    benefits: 0,
    equityUsd: 0,
  },
}

export interface BandCase {
  seat: SeatType
  annualLocal: number
  usd: number
  weightBp: number
}

const seat = (level: Level, location: string, fte = 1): SeatType => ({ level, location, fte })

/** The 11.7 table plus the part-time seats the trade fixtures use. */
export const BAND_CASES: readonly BandCase[] = [
  { seat: seat('P3', 'San Jose'), annualLocal: 198_200, usd: 198_200, weightBp: 13_213 },
  { seat: seat('P4', 'San Jose'), annualLocal: 236_000, usd: 236_000, weightBp: 15_733 },
  { seat: seat('P5', 'San Jose'), annualLocal: 287_400, usd: 287_400, weightBp: 19_160 },
  { seat: seat('M2', 'San Jose'), annualLocal: 394_400, usd: 394_400, weightBp: 26_293 },
  { seat: seat('P4', 'Munich'), annualLocal: 140_026, usd: 151_228.08, weightBp: 10_082 },
  { seat: seat('P3', 'Bengaluru'), annualLocal: 2_821_600, usd: 33_859.2, weightBp: 2_257 },
  { seat: seat('P4', 'Haifa'), annualLocal: 594_000, usd: 160_380, weightBp: 10_692 },
  // Part time: the burden cap and benefits do not scale with FTE.
  { seat: seat('P4', 'Munich', 0.9), annualLocal: 127_926, usd: 138_160.08, weightBp: 9_211 },
  { seat: seat('P4', 'Munich', 0.8), annualLocal: 115_826, usd: 125_092.08, weightBp: 8_339 },
  { seat: seat('P4', 'Munich', 0.5), annualLocal: 73_205, usd: 79_061.4, weightBp: 5_271 },
  { seat: seat('P3', 'Bengaluru', 0.5), annualLocal: 1_446_600, usd: 17_359.2, weightBp: 1_157 },
]

/**
 * The fixtures' own band estimate in USD, written out from the 11.3 definition (midpoint × FTE + bonus
 * at target × funding + Σ rate × min(base + bonus, cap) + benefits, × plan rate), so the trade fixtures
 * do not depend on band.ts being built. band.test.ts checks band.ts against the same table.
 */
export function fixtureBandUsd(s: SeatType): number | null {
  const l = LOADS_11_7[`${s.level}|${s.location}`]
  if (!l) return null
  const base = l.midpoint * s.fte
  const bonus = base * l.bonusTarget * l.bonusFunding
  let burden = 0
  for (const c of l.burden) burden += c.rate * Math.min(base + bonus, c.cap ?? Number.POSITIVE_INFINITY)
  return (base + bonus + burden + l.benefits) * PLAN_RATE[l.currency]
}

/** Pricing for the 11.7 fixtures: FY27, S = $150,000, minFte 0.5, fteStep 0.1, no part time in Bengaluru. */
export const TRADE_RATES_11_7: TradeRates = {
  version: 'fy27-q1-reforecast',
  lockHash: 'sha256-fixture-q1-reforecast',
  year: 'FY27',
  standardHeadUsd: STANDARD_HEAD_USD,
  minFte: 0.5,
  fteStep: 0.1,
  bandUsd: (s) => fixtureBandUsd(s),
  partTimeAllowed: (location) => location !== 'Bengaluru',
}

const tp = (positionId: string, level: Level, location: string, fte = 1): TradePosition => ({
  positionId,
  level,
  location,
  fte,
  orgPositionId: 'P-GTM-MGR',
})

export const F_S = {
  positions: [
    tp('S-P5-SJ', 'P5', 'San Jose'),
    tp('S-P4-SJ', 'P4', 'San Jose'),
    ...[1, 2, 3, 4, 5, 6].map((n) => tp(`S-P4-MUC-${n}`, 'P4', 'Munich')),
    tp('S-P3-BLR-1', 'P3', 'Bengaluru'),
    tp('S-P3-BLR-2', 'P3', 'Bengaluru'),
  ],
  sumBandUsd: 1_498_486.88,
  raw: 149_848.688,
  standardHead: 150_000,
} as const

export const F_S2 = {
  positions: [...F_S.positions, tp('S-P4-MUC-half', 'P4', 'Munich', 0.5)],
  sumBandUsd: 1_577_548.28,
  raw: 150_242.6933,
  standardHead: 150_000,
  /** Σ band ÷ heads: the wrong divisor. */
  perHeadRaw: 143_413.48,
  perHeadRounded: 143_000,
} as const
