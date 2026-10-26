/**
 * Finance > Assumptions (docs/PLAN.md 5.2, 7.4, 9.4, 11.5), read only in M2: every assumption value
 * of the version shown with its fallback level (an org's own value, its unit's or the company's), and
 * the Trade rates part: each level × location's band estimate (USD at plan rates, annual), its weight
 * in basis points of a standard head, the weight incl. SBC (labeled, for information) and whether
 * part time is allowed, with the standard head row ("Compute from Budget" beside the one in use).
 *
 * - Burden caps, the merit date and cutoff, the promotion-pool date, bonus target and funding, and
 *   the merit and promotion-pool percentages are set by import: read only outside HR admin, with
 *   "Set by import." (7.4).
 * - Trade rates show where `tab:finance.assumptions:trade-rates` is shown (Finance, HR admin, HRBP
 *   read only); band estimates where `cost:band` is; the standard head in USD where
 *   `metric:finance.trade.standardHead` is.
 *
 * Readings taken here (views-2 builder, M2):
 *  - "Compute from Budget" prices the Budget's approved Employee positions at its fiscal year end at
 *    band (Σ band estimate ÷ Σ FTE, 11.2): the positions whose Budget line in the year's last month
 *    is Filled, Open or Planned with a head or an active day, each at its row on the lock date, with
 *    the Budget's own bands, loads and plan rates. A year with no locked Budget computes it from its
 *    Working seats at the year end, at Working's rates, flagged "Rates can change until FY28 locks".
 *  - Trade rates and band estimates are priced with the version shown (its own assumptions and plan
 *    rates), at 1.0 FTE, with the company's values (no org fallback).
 *  - A row's level: no org is the company; an org that names a business unit is the unit; any other
 *    org (a department) is the org.
 */
import type { Column } from '@/charts/types'
import type { Kpi } from '@/components/types'
import {
  ASSUMPTION_KEYS,
  type AssumptionRow,
  type AssumptionUnit,
  isHrAdminOnly,
  LEVELS,
  SITES,
} from '@/data/schema'
import { calcInput, calcStep } from '@/drill/calc'
import { seatIndex } from '@/drill/seats'
import { type Format, fmt } from '@/lib/format'
import { assumptionLookup } from '@/plan/engine/assumptions'
import { bandEstimate, loadsOf, standardHeadRaw, type TradePosition, weightBp } from '@/plan/engine/band'
import { rateOf } from '@/plan/engine/fx'
import { planLineRows } from '@/plan/engine/lineTable'
import { budgetOf, isLocked, rowOn, seatDetailOn, toPosition } from '@/plan/engine/versions'
import type { AnyVersion } from '@/plan/types'
import { ID as PLAN_ID } from '@/views/plan/metrics'
import {
  latestRows,
  ratesFor,
  versionAssumptions,
  versionRates,
  yearEnd,
} from '@/views/targets/engine/working'
import { ID } from '../metrics'
import type { FinancePrep } from './base'
import { FINANCE_FIGURES } from './figures'
import type { AssumptionValueRow, FinanceAssumptions, StandardHeadFacts, TradeRateRow } from './index'
import { figure } from './versions'
import { assumptionWrites } from './writes'

/** "Set by import." for the keys only HR admin edits, read only elsewhere (7.4). */
export const SET_BY_IMPORT = 'Set by import.'

/** "Rates can change until FY28 locks" for a year with no locked Budget (11.2). */
export const ratesCanChange = (fy: string): string => `Rates can change until ${fy} locks`

const UNIT_WORD: Readonly<Record<AssumptionUnit, string>> = {
  local: 'Local currency',
  usd: 'USD',
  fraction: 'Share',
  months: 'Months',
  days: 'Days',
  yyyymmdd: 'Date',
  usdPerLocal: 'USD per 1 local',
  code: 'Account',
  fte: 'FTE',
  flag: 'Yes or no',
}

/** The unit of one row's value (a table with parts has one per part). */
function unitOf(row: AssumptionRow): AssumptionUnit {
  const def = ASSUMPTION_KEYS[row.table]
  if (def.unit !== 'by part') return def.unit
  const name = row.key.split('|')[def.dims.indexOf('part')] ?? ''
  return def.parts?.[name.trim()]?.unit ?? 'fraction'
}

/** The units whose value is an amount (local currency or USD). */
const AMOUNT_UNITS: ReadonlySet<AssumptionUnit> = new Set<AssumptionUnit>(['local', 'usd'])

/** How a row's value prints. */
const FORMAT_OF: Readonly<Record<AssumptionUnit, Format>> = {
  local: 'int',
  usd: 'int',
  fraction: 'pct2',
  months: 'num1',
  days: 'int',
  yyyymmdd: 'text',
  usdPerLocal: 'text',
  code: 'text',
  fte: 'num2',
  flag: 'text',
}

/** A value as the table writes it: dates as dates, flags as words, rates to six significant figures. */
function shownValue(v: number, unit: AssumptionUnit): number | string {
  if (unit === 'yyyymmdd') {
    const s = String(Math.round(v))
    return s.length === 8 ? fmt(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, 'date') : s
  }
  if (unit === 'flag') return v ? 'Yes' : 'No'
  if (unit === 'usdPerLocal') return String(Number(v.toPrecision(6)))
  if (unit === 'code') return String(v)
  return v
}

/** Every assumption value of the version shown, with its fallback level. */
export function assumptionValues(p: FinancePrep): AssumptionValueRow[] {
  const v = p.version
  // The tab's values only where the mode shows the tab (never in Manager mode, which shows no amount).
  if (!v || p.mode === 'none' || !p.ctx.access.can('tab:finance.assumptions')) return []
  const units = new Set([...latestRows(p.ctx.all.positions).values()].map((r) => r.businessUnit))
  const outsideAdmin = p.ctx.mode !== 'hr-admin'
  return versionAssumptions(p.ctx.all, v).map((row) => {
    const org = (row.org ?? '').trim() || null
    const unit = unitOf(row)
    return {
      table: row.table,
      org,
      level: org == null ? 'company' : units.has(org) ? 'unit' : 'org',
      key: row.key,
      value: row.value,
      note: outsideAdmin && isHrAdminOnly(row.table) ? SET_BY_IMPORT : null,
      tableLabel: ASSUMPTION_KEYS[row.table].label,
      unit: UNIT_WORD[unit],
      // Amounts (bands, caps, benefits, equity, the standard head) sit in their own band-flagged
      // column, so exports and the crawlers read them as structure, never as a cost total.
      shown: AMOUNT_UNITS.has(unit) ? null : shownValue(row.value, unit),
      amount: AMOUNT_UNITS.has(unit) ? row.value : null,
      format: FORMAT_OF[unit],
    }
  })
}

/** Band estimates and weights per level × location for the version's year (11.5). */
export function tradeRateRows(p: FinancePrep, v: AnyVersion, bandShown: boolean): TradeRateRow[] {
  const rows = versionAssumptions(p.ctx.all, v)
  const lookup = assumptionLookup(rows, v)
  const table = versionRates(p.ctx.all, v)
  const rates = ratesFor(p.ctx.all, v)
  const s = rates.standardHeadUsd
  const out: TradeRateRow[] = []
  for (const site of SITES)
    for (const level of LEVELS) {
      const seat = { level, location: site.location, fte: 1 }
      const loads = loadsOf(seat, v.fiscalYear, null, lookup)
      if (!loads) continue
      const rate = loads.currency === 'USD' ? 1 : rateOf(table, loads.currency, 'plan', v.grid.from)
      if (rate == null) continue
      const est = bandEstimate(seat, '', loads, rate)
      out.push({
        level,
        location: site.location,
        bandUsd: bandShown ? est.usd : null,
        weightBp: s > 0 ? weightBp(est.usd, s) : 0,
        weightInclSbcBp: s > 0 ? weightBp(est.usd + est.equityUsd, s) : null,
        partTimeAllowed: rates.partTimeAllowed(site.location, ''),
        partTimeText: rates.partTimeAllowed(site.location, '') ? 'Yes' : 'No',
      })
    }
  return out
}

/** The Budget's approved Employee positions at its year end, at their rows on the lock date. */
function budgetPositions(p: FinancePrep, budget: AnyVersion): TradePosition[] {
  if (!isLocked(budget)) return []
  const last = yearEnd(budget.fiscalYear).slice(0, 7)
  const on = budget.lockedAt ? budget.lockedAt.slice(0, 10) : yearEnd(budget.fiscalYear)
  const ids = new Set<string>()
  for (const l of planLineRows(budget.lines)) {
    if (l.month !== last) continue
    if (l.status !== 'Filled' && l.status !== 'Open' && l.status !== 'Planned') continue
    if (l.heads > 0 || l.active > 0) ids.add(l.positionId)
  }
  const byId = new Map<string, typeof p.ctx.all.positions>()
  for (const r of p.ctx.all.positions) {
    if (!ids.has(r.positionId)) continue
    const list = byId.get(r.positionId)
    if (list) list.push(r)
    else byId.set(r.positionId, [r])
  }
  const out: TradePosition[] = []
  for (const [id, list] of byId) {
    const sorted = [...list].sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))
    const r = toPosition(rowOn(sorted, on) ?? sorted[0])
    if (r.workerType !== 'Employee') continue
    out.push({
      positionId: id,
      level: r.level,
      location: r.location,
      fte: r.fte,
      orgPositionId: r.managerPositionId ?? id,
    })
  }
  return out
}

/** Working's approved Employee positions at the year end (a year with no locked Budget). */
function workingPositions(p: FinancePrep): TradePosition[] {
  const end = yearEnd(p.fiscalYear)
  const out: TradePosition[] = []
  for (const seat of seatIndex(p.ctx).values()) {
    const s = seatDetailOn(seat, end)
    if (!s?.approvedHead || s.position.workerType !== 'Employee') continue
    out.push({
      positionId: s.positionId,
      level: s.position.level,
      location: s.position.location,
      fte: s.position.fte,
      orgPositionId: s.position.managerPositionId ?? s.positionId,
    })
  }
  return out
}

/** The standard head row: computed from the Budget (or Working) beside the one in use. */
export function standardHeadFacts(p: FinancePrep, v: AnyVersion): StandardHeadFacts {
  const budget = budgetOf(p.ctx.versions, v.fiscalYear)
  const source = budget ?? p.frame.version
  let computed: number | null = null
  if (source) {
    const positions = budget ? budgetPositions(p, budget) : workingPositions(p)
    try {
      computed = positions.length ? standardHeadRaw(positions, ratesFor(p.ctx.all, source)) : null
    } catch {
      computed = null
    }
  }
  const inUse = ratesFor(p.ctx.all, v).standardHeadUsd
  return {
    computedUsd: computed,
    inUseUsd: inUse > 0 ? inUse : null,
    note: budget ? null : ratesCanChange(v.fiscalYear),
  }
}

/** Finance > Assumptions. */
export function assumptionsTab(p: FinancePrep): FinanceAssumptions {
  const { ctx } = p
  const v = p.version
  const values = assumptionValues(p)
  const partShown = ctx.access.can('tab:finance.assumptions:trade-rates')
  const bandShown = p.mode !== 'none' && ctx.access.can('cost:band')
  const headShown = p.mode !== 'none' && ctx.access.can(`metric:${ID.tradeStandardHead}`)
  const rates = v && partShown ? tradeRateRows(p, v, bandShown) : null
  const head = v && partShown && headShown ? standardHeadFacts(p, v) : null
  const valueColumns: Column<AssumptionValueRow>[] = [
    { key: 'tableLabel', label: 'Table' },
    { key: 'org', label: 'Org' },
    { key: 'level', label: 'Set at' },
    { key: 'key', label: 'Key' },
    { key: 'shown', label: 'Value', format: (r) => r.format },
    { key: 'amount', label: 'Amount', format: 'int', band: true },
    { key: 'unit', label: 'Unit' },
    { key: 'note', label: 'Note' },
  ]
  const kpis: Kpi[] = []
  if (head)
    kpis.push({
      id: 'finance-standard-head',
      metricId: ID.tradeStandardHead,
      label: 'Standard head',
      value: head.inUseUsd,
      format: 'moneyFull',
      // No amount in a note (7.2 rule 6): the computed value is on the card.
      note:
        head.note ??
        (head.computedUsd != null ? 'In use; the card shows the value computed from the Budget' : undefined),
      definition: p.definition(ID.tradeStandardHead),
      calc: () => ({
        title: `Standard head, ${v?.fiscalYear ?? p.fiscalYear}`,
        subtitle: v?.name,
        metricId: ID.tradeStandardHead,
        value: head.inUseUsd,
        format: 'moneyFull',
        inputs: [
          calcInput(
            'Computed from the Budget (Σ band estimate ÷ Σ FTE)',
            head.computedUsd,
            'moneyFull',
            'Approved employee positions at the year end, at band',
          ),
          calcInput('In use', head.inUseUsd, 'moneyFull', `Trade rates · ${v?.name ?? ''}`),
        ],
        steps: [
          calcStep('Standard head in use', fmt(head.inUseUsd, 'moneyFull'), head.inUseUsd, 'moneyFull'),
        ],
        note: 'The computed value rounds to the nearest $1,000. Finance confirms it at the Budget lock.',
        uses: p.uses(ID.tradeStandardHead),
      }),
      uses: p.uses(ID.tradeStandardHead),
    })
  return {
    kpis,
    writes: assumptionWrites(p),
    values: figure(
      p,
      FINANCE_FIGURES.assumptions,
      PLAN_ID.costBandEstimate,
      'Assumptions',
      v ? `${v.name} · each value with the level it is set at` : 'No version shown',
      values,
      valueColumns,
      values.length ? null : 'No assumption rows for this version.',
      ctx.mode === 'hr-admin'
        ? null
        : 'Caps, merit and promotion dates and the pay percentages are set by import.',
    ),
    tradeRates: rates
      ? figure(
          p,
          FINANCE_FIGURES.tradeRates,
          ID.tradeStandardHead,
          'Trade rates',
          `${v?.name ?? ''} · annual band estimate at plan rates and weight in basis points of a standard head`,
          rates,
          [
            { key: 'level', label: 'Level' },
            { key: 'location', label: 'Location' },
            { key: 'bandUsd', label: 'Band estimate (USD)', format: 'moneyFull', band: true },
            { key: 'weightBp', label: 'Weight (bp)', format: 'int' },
            { key: 'weightInclSbcBp', label: 'Weight incl. SBC (bp, for information)', format: 'int' },
            { key: 'partTimeText', label: 'Part time allowed' },
          ],
          rates.length ? null : 'No bands for this version.',
          head?.note ?? null,
        )
      : null,
    standardHead: head,
    tradeRatesEmpty: rates
      ? null
      : !partShown
        ? 'Weights show on trade cards and requests.'
        : 'No version to price trade rates with.',
  }
}
