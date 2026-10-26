/**
 * Hand-built plan lines, seats and members for the cost guard's tests (guard, fold, differences, fit
 * and the slow attack tests). Test code only: nothing in the app imports it.
 *
 *   const lines = [...filled('P1', FY27, { base: 10_000 }), ...open('P9', FY27, { base: 9_000 })]
 *   const members = membersOf(lines, FY27)
 */
import type { Month } from '@/data/schema'
import type { CostGuardSettings } from '@/metrics/costGuard'
import type { CostBasis, PlanLine, UsdAmounts } from '@/plan/types'
import type { AtomIndex } from './atoms'
import {
  type CapSide,
  type ComponentGate,
  type CostMember,
  type CostSeat,
  componentGate,
  costMembers,
} from './guard'

/** The rules in force by default (the locked entries' defaults). */
export const RULES: CostGuardSettings = Object.freeze({ minCosted: 5, floorUsd: 100_000, minContributors: 5 })

/** FY27's months, April 2026 to March 2027. */
export const FY27: readonly Month[] = [
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
/** Year to date at the 30 Sep 2026 close. */
export const YTD: readonly Month[] = FY27.slice(0, 6)

/** A month's USD amounts; loaded is their sum less equity. */
export function usd(a: Partial<Omit<UsdAmounts, 'loaded'>> = {}): UsdAmounts {
  const base = a.base ?? 0
  const bonus = a.bonus ?? 0
  const burden = a.burden ?? 0
  const benefits = a.benefits ?? 0
  const oneTime = a.oneTime ?? 0
  const vacancy = a.vacancy ?? 0
  return {
    base,
    bonus,
    burden,
    benefits,
    oneTime,
    vacancy,
    equity: a.equity ?? 0,
    loaded: base + bonus + burden + benefits + oneTime + vacancy,
  }
}

/** One plan line (a Filled seat's HRIS line in USD by default). */
export function line(
  positionId: string,
  month: Month,
  amounts: Partial<Omit<UsdAmounts, 'loaded'>>,
  over: Partial<PlanLine> = {},
): PlanLine {
  const u = usd(amounts)
  const basis: CostBasis = over.basis ?? 'hris'
  return {
    positionId,
    versionId: 'fy27-working',
    month,
    holderId: basis === 'band' ? null : `E-${positionId}`,
    status: basis === 'band' ? 'Open' : 'Filled',
    heads: basis === 'band' ? 0 : 1,
    fte: 1,
    active: 1,
    currency: 'USD',
    rate: 1,
    local: {
      base: u.base,
      bonus: u.bonus,
      burden: u.burden,
      benefits: u.benefits,
      oneTime: u.oneTime,
      vacancy: u.vacancy,
    },
    usd: u,
    basis,
    ...over,
  }
}

/** A Filled seat's lines over the months, the same amounts each month. */
export const filled = (
  positionId: string,
  months: readonly Month[],
  amounts: Partial<Omit<UsdAmounts, 'loaded'>> = { base: 10_000 },
  over: Partial<PlanLine> = {},
): PlanLine[] => months.map((m) => line(positionId, m, amounts, over))

/** An Open or Planned seat's band lines over the months. */
export const open = (
  positionId: string,
  months: readonly Month[],
  amounts: Partial<Omit<UsdAmounts, 'loaded'>> = { base: 9_000 },
  over: Partial<PlanLine> = {},
): PlanLine[] => months.map((m) => line(positionId, m, amounts, { basis: 'band', ...over }))

/** An accepted offer's lines from its start month (basis 'offer', the req as holder). */
export const offer = (
  positionId: string,
  months: readonly Month[],
  amounts: Partial<Omit<UsdAmounts, 'loaded'>> = { base: 10_000 },
): PlanLine[] =>
  months.map((m) => line(positionId, m, amounts, { basis: 'offer', holderId: `R-${positionId}`, heads: 0 }))

/** A seat with defaults: Operations > Supply chain, cost center 4100-SJC, San Jose, P3. */
export function seat(over: Partial<CostSeat> = {}): CostSeat {
  return {
    businessUnit: 'Operations',
    department: 'Supply chain',
    costCenter: '4100-SJC',
    location: 'San Jose',
    legalEntity: 'Northgate Semiconductor Inc.',
    country: 'United States',
    level: 'P3',
    managerPositionId: null,
    ...over,
  }
}

/**
 * The lines' members over the months; `seats` gives a position's seat (the default seat for any
 * position not named).
 */
export function membersOf(
  lines: readonly PlanLine[],
  months: readonly Month[],
  seats: Readonly<Record<string, CostSeat>> = {},
  atoms: AtomIndex | null = null,
): CostMember[] {
  return costMembers({ lines, months, seatOf: (id) => seats[id] ?? seat(), atoms })
}

/** n Filled seats `<prefix>1` … `<prefix>n` over the months, each with a base of `base` a month. */
export function team(prefix: string, n: number, months: readonly Month[], base = 10_000): PlanLine[] {
  return Array.from({ length: n }, (_, i) => filled(`${prefix}${i + 1}`, months, { base })).flat()
}

/**
 * The component gate of the lines over the months (C33): what Finance's figures pass the guard so
 * whole units show their split; `seats` as in `membersOf`, `capSides` the lines' cap sides.
 */
export function gateOf(
  lines: readonly PlanLine[],
  months: readonly Month[],
  seats: Readonly<Record<string, CostSeat>> = {},
  capSides?: (l: PlanLine) => readonly CapSide[] | null,
): ComponentGate {
  return componentGate({ lines, months, seatOf: (id) => seats[id] ?? seat(), capSides }, RULES.minCosted)
}

/** The US social security cap (local, annual) the cap fixtures use. */
export const US_SS_CAP = 176_100

/**
 * A line's side of the US social security cap from its own base + bonus (annual = monthly × 12 ÷
 * active), the way the app reads a paid line: the fixtures' lines are all paid.
 */
export const usCapSides = (l: PlanLine): readonly CapSide[] => {
  const annual = l.active > 0 ? ((l.local.base + l.local.bonus) * 12) / l.active : 0
  return [{ key: 'United States|socialSecurity', below: annual < US_SS_CAP }]
}
