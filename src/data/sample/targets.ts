/**
 * Finance's targets (docs/PLAN.md 5.2 `targets`, 13.2): one row per business unit and fiscal year,
 * dated at the fiscal year's end (targetDate blank). Pure: draws no random numbers.
 *
 * - FY27 = the Budget at the year's end: its approved heads on 31 Mar 2027 and its FY27 loaded cost
 *   (the sum of its April to March lines, USD at plan rates, equity left out), both computed by the
 *   engines on the datasets as they stood at the Budget lock (20 Mar 2026), to the cent. Systems &
 *   Software's is the target story 9's headroom is measured against.
 * - FY28 = FY28 Working's approved heads on 31 Mar 2028 (which equal FY27 Working's on 31 Mar 2027,
 *   since nothing is planned to start or end in FY28 yet) plus each unit's growth: Silicon
 *   Engineering + 40 (story 6, its asks add 58), Go-to-Market + 8, Systems & Software + 6, Operations
 *   + 4, Corporate and the Executive Office flat. FY28 cost = FY27 cost per Budget head × the FY28
 *   heads × 1.06 (a year of merit and band increase), rounded half up to $100,000.
 * - No sub-org targets in either year: each unit's gap decides out of plan.
 *
 * Set on: FY27's at the Budget lock, FY28's when Finance opened the FY28 cycle (15 Sep 2026).
 */

import { lineContext, versionLines } from '@/plan/engine/cost'
import { fxRatesFromAssumptions } from '@/plan/engine/fx'
import { toAssignments } from '@/plan/engine/heads'
import { fromRow } from '@/plan/engine/requests'
import { ENGINE_VERSION, rowOn, seatDetailOn, seatHistories } from '@/plan/engine/versions'
import type { Version } from '@/plan/types'
import { fiscalYearOf } from '../fiscal'
import type { Datasets, ISODate, TargetRow } from '../schema'
import { FY27_BUDGET, roundHalfUp, versionSpec } from './assumptions'
import { CORP, EO, GTM, OPS, SE, SS, UNITS } from './departments'

/** FY28 growth over FY28 Working's approved heads, by unit (story 6: Silicon Engineering + 40). */
export const FY28_GROWTH: Readonly<Record<string, number>> = {
  [SE]: 40,
  [GTM]: 8,
  [SS]: 6,
  [OPS]: 4,
  [CORP]: 0,
  [EO]: 0,
}
const FY28_COST_UPLIFT = 1.06

const FY27_END: ISODate = '2027-03-31'
const FY28_END: ISODate = '2028-03-31'
const FY27_SET_ON: ISODate = '2026-03-20'
const FY28_SET_ON: ISODate = '2026-09-15'

/** Approved heads on a date by business unit (6.5, 15.1 R1), from datasets as given. */
export function approvedHeadsByUnit(data: Datasets, on: ISODate): Map<string, number> {
  const seats = seatHistories({
    positions: data.positions,
    assignments: toAssignments(data.workers),
    reqs: data.reqs,
    requests: data.requests.map(fromRow),
  })
  const out = new Map<string, number>(UNITS.map((u) => [u, 0]))
  for (const seat of seats.values()) {
    const s = seatDetailOn(seat, on)
    if (s?.approvedHead) out.set(s.position.businessUnit, (out.get(s.position.businessUnit) ?? 0) + 1)
  }
  return out
}

/** The Budget's version frame for the lines engine, over FY27's months only (lines and hash are the stories'). */
function budgetVersion(): Version {
  const v = versionSpec(FY27_BUDGET)
  return {
    versionId: v.versionId,
    name: v.name,
    kind: 'budget',
    fiscalYear: v.fiscalYear,
    grid: { from: '2026-04', to: '2027-03' },
    proration: 'daily',
    state: 'locked',
    createdAt: `${v.setOn}T09:00`,
    lockedAt: `${v.lockedOn}T17:00`,
    lockedBy: null,
    engineVersion: ENGINE_VERSION,
    parentId: null,
    hash: null,
  }
}

/**
 * The Budget's FY27 loaded cost by business unit (USD, plan rates): its lines computed by the engine
 * on the datasets as known at the lock, summed over April 2026 to March 2027 in line order. The org
 * is joined at read time from today's rows (`current`), as locked lines are (R26).
 */
export function budgetCostByUnit(budgetView: Datasets, current: Datasets): Map<string, number> {
  const fy27 = budgetVersion()
  const rows = budgetView.assumptions.filter((r) => r.version === fy27.versionId)
  const ctx = lineContext({
    version: fy27,
    asOf: versionSpec(FY27_BUDGET).lockedOn!,
    positions: budgetView.positions,
    workers: budgetView.workers,
    comp: budgetView.comp,
    reqs: budgetView.reqs,
    requests: budgetView.requests.map(fromRow),
    assumptions: rows,
    rates: { table: fxRatesFromAssumptions(rows), use: 'plan', closedThrough: null },
  })
  const unitOf = new Map<string, string>()
  const byId = new Map<string, Datasets['positions']>()
  for (const r of current.positions) {
    const list = byId.get(r.positionId)
    if (list) list.push(r)
    else byId.set(r.positionId, [r])
  }
  for (const [id, list] of byId) unitOf.set(id, (rowOn(list, '9999-12-31') ?? list[0]).businessUnit)
  const out = new Map<string, number>(UNITS.map((u) => [u, 0]))
  for (const l of versionLines(fy27, ctx)) {
    if (fiscalYearOf(l.month) !== 'FY27') continue
    const unit = unitOf.get(l.positionId)!
    out.set(unit, (out.get(unit) ?? 0) + l.usd.loaded)
  }
  return out
}

export interface TargetsOutput {
  rows: TargetRow[]
  known: ISODate[]
  /** FY27 Budget heads and cost by unit (the FY27 targets). */
  fy27: ReadonlyMap<string, { heads: number; cost: number }>
  /** FY28 Working's approved heads on 31 Mar 2028 by unit, before growth. */
  fy28Base: ReadonlyMap<string, number>
}

/** The targets rows from the full datasets and the datasets as known at the Budget lock. */
export function sampleTargets(current: Datasets, budgetView: Datasets): TargetsOutput {
  const heads27 = approvedHeadsByUnit(budgetView, FY27_END)
  const cost27 = budgetCostByUnit(budgetView, current)
  const base28 = approvedHeadsByUnit(current, FY28_END)
  const rows: TargetRow[] = []
  const known: ISODate[] = []
  const fy27 = new Map<string, { heads: number; cost: number }>()
  for (const unit of UNITS) {
    const heads = heads27.get(unit) ?? 0
    const cost = Math.round((cost27.get(unit) ?? 0) * 100) / 100
    fy27.set(unit, { heads, cost })
    rows.push({
      fiscalYear: 'FY27',
      targetDate: null,
      businessUnit: unit,
      department: null,
      costCenter: null,
      leaderPositionId: null,
      targetHeads: heads,
      targetCost: cost,
    })
    known.push(FY27_SET_ON)
  }
  for (const unit of UNITS) {
    const heads = (base28.get(unit) ?? 0) + (FY28_GROWTH[unit] ?? 0)
    const { heads: h27, cost: c27 } = fy27.get(unit)!
    const cost = h27 > 0 ? roundHalfUp((c27 / h27) * heads * FY28_COST_UPLIFT, 100_000) : 0
    rows.push({
      fiscalYear: 'FY28',
      targetDate: null,
      businessUnit: unit,
      department: null,
      costCenter: null,
      leaderPositionId: null,
      targetHeads: heads,
      targetCost: cost,
    })
    known.push(FY28_SET_ON)
  }
  return { rows, known, fy27, fy28Base: base28 }
}
