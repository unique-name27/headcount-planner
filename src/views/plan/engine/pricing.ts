/**
 * Seats priced at band (docs/PLAN.md 6.3 `bandEstimate`, 11.2 weights): a seat's band estimate at the
 * shown version's bands, loads and plan rates, and its weight in standard heads at the trade rates of
 * its fiscal year. Both read no one's pay, offer or leave. Pure; memoized per version.
 *
 * Readings taken here (views-1 builder, M2):
 *  - A band estimate is read at the shown version's assumptions and its plan rate for the seat's
 *    currency in the version's first grid month; its org fallback is the seat's own unit and
 *    department (its placement row).
 *  - A weight is priced at the trade rates of the shown version's fiscal year: its plan of record's
 *    locked assumptions (FY28, with no locked version yet, its Working's), 11.2. A seat whose rates
 *    have no standard head, or whose seat type has no band, has no weight.
 *  - Contractor and intern seats have neither (they are not costed, 6.1).
 */
import type { AnalyticsContext } from '@/data/context'
import { assumptionLookup } from '@/plan/engine/assumptions'
import { bandEstimate, loadsOf, SH_BP, type TradeRates, tradeRatesOf, weightBp } from '@/plan/engine/band'
import { rateOf } from '@/plan/engine/fx'
import { isLocked, planOfRecord, workingOf } from '@/plan/engine/versions'
import type { AnyVersion, Position } from '@/plan/types'
import { assumptionRowsOf, Memo, placementOf, ratesOf } from './core'

/** How one version prices seats. */
export interface SeatPricing {
  version: AnyVersion
  /** A seat's band estimate (annual, USD at plan rates, no equity); null with no band or rate. */
  bandUsd(p: Position): number | null
  /** The trade rates weights are priced at, or null when the fiscal year has no version to price them. */
  rates: TradeRates | null
  /** A seat's weight in standard heads (bp ÷ 10,000); null with no standard head or band. */
  weight(p: Position): number | null
}

const pricingMemo = new Memo<SeatPricing>()

/** The version weights are priced at: the fiscal year's plan of record, else its Working (11.2). */
export const tradeVersionOf = (ctx: AnalyticsContext, v: AnyVersion): AnyVersion | null =>
  planOfRecord(ctx.versions, v.fiscalYear) ?? workingOf(ctx.versions, v.fiscalYear)

function ratesFor(ctx: AnalyticsContext, v: AnyVersion): TradeRates {
  const rows = assumptionRowsOf(ctx.all, v)
  const table = ratesOf(ctx.all, v)
  const place = placementOf(ctx)
  return tradeRatesOf({
    version: { versionId: v.versionId, name: v.name, fiscalYear: v.fiscalYear },
    lockHash: isLocked(v) ? v.hash : null,
    lookup: assumptionLookup(rows, v),
    planRate: (currency) => rateOf(table, currency, 'plan', v.grid.from),
    orgPathOf: (id) => {
      const r = place.get(id)
      return r ? { businessUnit: r.businessUnit, department: r.department ?? null } : null
    },
  })
}

/** How the shown version prices seats (see the module comment). */
export function pricingOf(ctx: AnalyticsContext, v: AnyVersion): SeatPricing {
  return pricingMemo.get(ctx.all, ctx.plan, `${v.versionId}|${isLocked(v) ? v.hash : ''}`, () => {
    const rows = assumptionRowsOf(ctx.all, v)
    const lookup = assumptionLookup(rows, v)
    const table = ratesOf(ctx.all, v)
    const tradeVersion = tradeVersionOf(ctx, v)
    const rates = tradeVersion ? ratesFor(ctx, tradeVersion) : null
    const bands = new Map<string, number | null>()
    const weights = new Map<string, number | null>()
    const key = (p: Position) => `${p.level}|${p.location}|${p.fte}|${p.businessUnit}|${p.department ?? ''}`
    return {
      version: v,
      rates,
      bandUsd(p) {
        if (p.workerType !== 'Employee') return null
        const k = key(p)
        if (bands.has(k)) return bands.get(k) ?? null
        const loads = loadsOf(
          { level: p.level, location: p.location },
          v.fiscalYear,
          { businessUnit: p.businessUnit, department: p.department },
          lookup,
        )
        const rate = loads
          ? loads.currency === 'USD'
            ? 1
            : rateOf(table, loads.currency, 'plan', v.grid.from)
          : null
        const usd =
          loads && rate != null
            ? bandEstimate({ level: p.level, location: p.location, fte: p.fte }, p.positionId, loads, rate)
                .usd
            : null
        bands.set(k, usd)
        return usd
      },
      weight(p) {
        if (p.workerType !== 'Employee' || !rates || !(rates.standardHeadUsd > 0)) return null
        const k = key(p)
        if (weights.has(k)) return weights.get(k) ?? null
        const band = rates.bandUsd({ level: p.level, location: p.location, fte: p.fte }, p.positionId)
        const w = band == null ? null : weightBp(band, rates.standardHeadUsd) / SH_BP
        weights.set(k, w)
        return w
      },
    }
  })
}
