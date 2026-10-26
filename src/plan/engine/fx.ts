/**
 * FX (docs/PLAN.md 6.4). Plan rates for plan lines; actual monthly rates for closed months; forecast
 * rates for open months. Two currencies are never summed in local terms. Built by engines A. Pure.
 *
 * FX effect = Σ actual local × (actual − plan) + Σ forecast local × (forecast − plan), where `plan` is
 * the comparison version's stored plan rate for that currency and month: the locked Budget's or
 * reforecast's `rates`. The comparison is always a locked version (with a target comparison the FX
 * effect computes nothing, 9.2). The forecast never reads a plan rate, so editing Working's plan FX
 * changes neither the forecast nor the FX effect against Budget or Q1 Reforecast.
 */
import { type AssumptionRow, type FxSet, type Month, splitAssumptionKey } from '@/data/schema'
import type { FxRate, FxTable, PlanLine } from '../types'

const keyOf = (currency: string, set: FxSet, month: Month): string => `${currency}|${set}|${month}`

const indexCache = new WeakMap<FxTable, ReadonlyMap<string, number>>()

/** A rate table's index by currency, set and month (built once per table; the later of two equal rows wins). */
function indexOf(table: FxTable): ReadonlyMap<string, number> {
  let index = indexCache.get(table)
  if (!index) {
    const m = new Map<string, number>()
    for (const r of table) m.set(keyOf(r.currency, r.set, r.month), r.usdPerLocal)
    index = m
    indexCache.set(table, index)
  }
  return index
}

/**
 * USD per 1 local for a currency, set and month from a rate table; 1 for USD; null when the table
 * has no such rate.
 *
 * Fixtures: X1, X2.
 */
export function rateOf(table: FxTable, currency: string, set: FxSet, month: Month): number | null {
  if (currency === 'USD') return 1
  return indexOf(table).get(keyOf(currency, set, month)) ?? null
}

/**
 * The FX effect of forecast lines against a comparison's plan rates: Σ over lines of the line's local
 * loaded amount (base + bonus + burden + benefits + oneTime) × (line.rate − the comparison's plan rate
 * for the line's currency and month). USD lines add 0. Throws when a non-USD line's month has no plan
 * rate in `comparisonRates`.
 *
 * Fixtures (fx.test.ts): X1 (€120,000 in open months at forecast 1.15 against plan 1.08: $8,400);
 * X2 (against the Budget's stored 1.08 while Working's plan rate is 1.10: still $8,400; $6,000 is the
 * negative control).
 */
export function fxEffect(lines: readonly PlanLine[], comparisonRates: FxTable): number {
  let effect = 0
  for (const l of lines) {
    if (l.currency === 'USD') continue
    const plan = rateOf(comparisonRates, l.currency, 'plan', l.month)
    if (plan == null) throw new Error(`The comparison has no plan rate for ${l.currency} in ${l.month}.`)
    const local = l.local.base + l.local.bonus + l.local.burden + l.local.benefits + l.local.oneTime
    effect += local * (l.rate - plan)
  }
  return effect
}

/**
 * The rates in a version's `fx` assumption rows ('<currency>|<set>|<month>', USD per 1 local), as a
 * rate table. The table is company-wide: rows with an org are left out. Rows whose key is not a
 * currency, a set and a month are left out. An addition to the contract (versions store `rates` read
 * from their `fx` rows).
 */
export function fxRatesFromAssumptions(rows: readonly AssumptionRow[]): FxRate[] {
  const out: FxRate[] = []
  for (const r of rows) {
    if (r.table !== 'fx' || (r.org ?? '').trim() !== '') continue
    const [currency, set, month] = splitAssumptionKey(r.key)
    if (!currency || !isFxSet(set) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) continue
    out.push({ currency, set, month: month as Month, usdPerLocal: r.value })
  }
  return out
}

const isFxSet = (v: string | undefined): v is FxSet => v === 'plan' || v === 'actual' || v === 'forecast'
