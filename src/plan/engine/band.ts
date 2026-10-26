/**
 * Band estimates and trade pricing (docs/PLAN.md 2 "Band estimate", 6.3 and 11.2 to 11.3). A band
 * estimate is band midpoint × FTE plus standard loads (bonus at target × funding, capped burden,
 * benefits), annual, USD at the version's plan rates, no equity. It reads no person's pay, offer or
 * leave, so it can show in HRBP, Leader and Finance mode, and as standard heads (bp, never USD) in
 * every mode. Built by engines A in M1 (trade.ts, engines C, reads it). Pure.
 *
 * A standard head S is Σ band estimate ÷ Σ FTE over the approved employee positions at the Budget's
 * year-end (Filled seats at band), rounded to the nearest $1,000. A seat's weight is
 * round(band estimate at its own FTE ÷ S × 10,000) basis points; 1 standard head = 10,000 bp.
 */
import type { FiscalYear, Level } from '@/data/schema'
import { type AssumptionLookup, type OrgPath, seatLoads } from './assumptions'
import { type AnnualLocal, annualLocal, type BurdenComponent } from './cost'

/** Basis points in one standard head. */
export const SH_BP = 10_000

/** The standard head is rounded to the nearest $1,000 (docs/PLAN.md 11.2). An addition to the contract. */
export const STANDARD_HEAD_STEP = 1_000

/** Trade settings when no `trade` row sets them (the 11.7 values). Additions to the contract. */
export const DEFAULT_MIN_FTE = 0.5
export const DEFAULT_FTE_STEP = 0.1

/** A seat type: what a band estimate and a trade weight depend on. */
export interface SeatType {
  level: Level
  location: string
  fte: number
}

/** The standard loads of a seat type, in the location's local currency. */
export interface Loads {
  /** Band midpoint at 1.0 FTE (table `band`, level | zone | fiscal year). */
  midpoint: number
  currency: string
  bonusTarget: number
  bonusFunding: number
  burden: readonly BurdenComponent[]
  /** A head's benefits for a year, not scaled by FTE. */
  benefits: number
  /** Equity in USD a year at 1.0 FTE (table `equity`); only "incl. SBC" figures read it. */
  equityUsd: number
}

/** A seat type's band estimate, with its inputs for the calculation card. */
export interface BandEstimate {
  seat: SeatType
  /** The org the estimate is for (a position ID or unit), as given. */
  org: string
  currency: string
  /** USD per 1 local, the version's plan rate. */
  planRate: number
  /** Annual local amounts at the seat's FTE (base = midpoint × FTE). */
  local: AnnualLocal
  /** base + bonus + burden + benefits, local. */
  annualLocal: number
  /** annualLocal × planRate: the band estimate (no equity). */
  usd: number
  /** equityUsd × FTE, for "incl. SBC" only. */
  equityUsd: number
}

/**
 * A seat type's annual band estimate in USD at the plan rate. `annualLocal` with rate = midpoint.
 *
 * Fixtures (band.test.ts, from trade.ts 11.7): P3 San Jose $198,200.00; P4 San Jose $236,000.00; P5
 * San Jose $287,400.00; M2 San Jose $394,400.00; P4 Munich €140,026 = $151,228.08 (C1's seat); P3
 * Bengaluru ₹2,821,600 = $33,859.20; P4 Haifa ₪594,000 = $160,380.00; P4 Munich at 0.8 FTE
 * $125,092.08 and at 0.5 FTE $79,061.40.
 */
export function bandEstimate(seat: SeatType, org: string, loads: Loads, planRate: number): BandEstimate {
  const local = annualLocal({
    rate: loads.midpoint,
    fte: seat.fte,
    bonusTarget: loads.bonusTarget,
    bonusFunding: loads.bonusFunding,
    burden: loads.burden,
    benefits: loads.benefits,
  })
  const total = local.base + local.bonus + local.burden + local.benefits
  return {
    seat: { level: seat.level, location: seat.location, fte: seat.fte },
    org,
    currency: loads.currency,
    planRate,
    local,
    annualLocal: total,
    usd: total * planRate,
    equityUsd: loads.equityUsd * seat.fte,
  }
}

/**
 * A seat type's loads from a version's assumptions: band[level|location|fy] (the zone is the location
 * in Phase 1), bonusTarget[level], bonusFunding[fy], burden[country|*] with burdenCap[country|*] for
 * each component, benefits[country], equity[level], each at the org's fallback level. The country and
 * currency come from the location's site (`siteByLocation`). Null when the band has no midpoint.
 *
 * Fixture: band.test.ts BL1 (P4 Munich FY27 from assumption rows gives C1's loads).
 */
export function loadsOf(
  seat: Pick<SeatType, 'level' | 'location'>,
  fiscalYear: FiscalYear,
  org: OrgPath | null,
  lookup: AssumptionLookup,
): Loads | null {
  return seatLoads(seat, fiscalYear, org, lookup)
}

/** Trade pricing for one fiscal year (docs/PLAN.md 11.3). */
export interface TradeRates {
  /** The version whose locked assumptions price trades (the plan of record; FY28: its Working). */
  version: string
  lockHash: string | null
  year: FiscalYear
  standardHeadUsd: number
  minFte: number
  fteStep: number
  /** A seat type's band estimate in USD at plan rates for an org (org fallback), at its own FTE; null with no band. */
  bandUsd(seat: SeatType, orgPositionId: string): number | null
  /** Part time is allowed at the location for the org (`trade.partTime`, location keyed, '*' for all). */
  partTimeAllowed(location: string, orgPositionId: string): boolean
}

/**
 * A seat's weight in basis points of a standard head: round(bandUsd ÷ S × 10,000). Given verbatim by
 * docs/PLAN.md 11.3, so it is part of the contract, not a builder's body.
 */
export const weightBp = (bandUsd: number, standardHeadUsd: number): number =>
  Math.round((bandUsd / standardHeadUsd) * SH_BP)

/** A position as the standard head reads it. */
export interface TradePosition {
  positionId: string
  level: Level
  location: string
  fte: number
  /** The seat's manager position (its org for the band's org fallback). */
  orgPositionId: string
}

/**
 * Σ bandUsd ÷ Σ FTE over the given positions (the caller passes the approved employee positions at
 * the Budget's year-end; Filled seats count at band, never at HRIS pay), unrounded: the "Compute from
 * Budget: $149,849" figure. A position with no band (`bandUsd` null) is left out of both sums.
 * Throws when Σ FTE is 0.
 *
 * Fixtures: F-S ($149,848.688), F-S2 ($150,242.693, not $143,413.48: the divisor is Σ FTE, not heads).
 */
export function standardHeadRaw(
  positions: readonly TradePosition[],
  rates: Pick<TradeRates, 'bandUsd'>,
): number {
  let usd = 0
  let fte = 0
  for (const p of positions) {
    const band = rates.bandUsd({ level: p.level, location: p.location, fte: p.fte }, p.orgPositionId)
    if (band == null) continue
    usd += band
    fte += p.fte
  }
  if (fte <= 0) throw new Error('The standard head needs at least one approved position with a band.')
  return usd / fte
}

/**
 * The standard head: `standardHeadRaw` rounded to the nearest $1,000 (half up).
 *
 * Fixtures: F-S ($150,000), F-S2 ($150,000; dividing by heads would give $143,000).
 */
export function standardHeadOf(
  positions: readonly TradePosition[],
  rates: Pick<TradeRates, 'bandUsd'>,
): number {
  return Math.round(standardHeadRaw(positions, rates) / STANDARD_HEAD_STEP) * STANDARD_HEAD_STEP
}

export interface TradeRatesInput {
  version: { versionId: string; name: string; fiscalYear: FiscalYear }
  lockHash: string | null
  /** The pricing version's assumptions (trade settings, bands and loads). */
  lookup: AssumptionLookup
  /** The version's plan rate for a currency (USD per 1 local); null when missing. */
  planRate(currency: string): number | null
  /** Where an org position sits, for the assumptions' org fallback. */
  orgPathOf(orgPositionId: string): OrgPath | null
}

/**
 * Trade rates from a version's assumptions: `trade|standardHeadUsd`, `trade|minFte`, `trade|fteStep`,
 * `trade|partTime|<location>` (with '*' for every location) and band estimates from `loadsOf` and
 * `bandEstimate`.
 *
 * - The standard head, minFte and fteStep are company settings (one standard head per fiscal year,
 *   Design A): read with no org. Unset, the standard head reads 0 (no trade can be priced until
 *   Finance sets it) and minFte and fteStep read 0.5 and 0.1.
 * - Part time is read through the org fallback of the org position; no row reads "not allowed".
 * - A band estimate is null when the seat has no band, no site, or no plan rate for its currency.
 *
 * Fixture: band.test.ts builds the 11.7 rates through it from assumption rows (S = $150,000, minFte
 * 0.5, fteStep 0.1, part time allowed in San Jose, Munich and Haifa, not in Bengaluru) and checks
 * them against trade.ts's fixture rates.
 */
export function tradeRatesOf(input: TradeRatesInput): TradeRates {
  const { lookup, version } = input
  const year = version.fiscalYear
  const setting = (part: string, fallback: number): number => lookup.num('trade', [part], null) ?? fallback
  return {
    version: version.versionId,
    lockHash: input.lockHash,
    year,
    standardHeadUsd: setting('standardHeadUsd', 0),
    minFte: setting('minFte', DEFAULT_MIN_FTE),
    fteStep: setting('fteStep', DEFAULT_FTE_STEP),
    bandUsd(seat, orgPositionId) {
      const loads = seatLoads(seat, year, input.orgPathOf(orgPositionId), lookup)
      if (!loads) return null
      const rate = loads.currency === 'USD' ? 1 : input.planRate(loads.currency)
      if (rate == null) return null
      return bandEstimate(seat, orgPositionId, loads, rate).usd
    },
    partTimeAllowed(location, orgPositionId) {
      const v = lookup.num('trade', ['partTime', location], input.orgPathOf(orgPositionId))
      return v != null && v !== 0
    },
  }
}
