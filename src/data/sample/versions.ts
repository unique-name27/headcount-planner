/**
 * The sample's four versions (docs/PLAN.md 13.2, 6.5, change C27): the FY27 Budget (locked 20 Mar
 * 2026) and the FY27 Q1 Reforecast (locked 15 Jul 2026, the plan of record) are computed by the
 * same engines "as of" each lock date, from the datasets as they stood then (`asKnownOn`) and each
 * version's own assumption rows, then locked with versions.ts `lockedFrom`, which hashes them with
 * `sha256()`. FY27 Working (April to September closed) and FY28 Working (grid April 2027 to
 * September 2028, the FY28 cycle's year) are Working versions whose lines the app computes live.
 *
 * - Both locks are FY27 Working's (parentId) and are locked by the FP&A lead in Finance mode.
 * - Budget: plan lines at plan rates over the grid (April 2026 to September 2027), daily proration,
 *   with the 3% vacancy allowance lines every plan version carries (change C31, lead decision D-VAC).
 * - Q1 Reforecast: plan lines at plan rates as of its lock day, plus its stored forecast. The
 *   forecast runs as of the last close before the lock (30 Jun 2026: actual rates April to June,
 *   forecast rates from July, the Q1 Reforecast's own rate rows) on the data known at the lock, with
 *   the April to June closes.
 */
import { MIN_COSTED } from '@/metrics/rules'
import { lineContext, versionLines } from '@/plan/engine/cost'
import { forecast, forecastTable } from '@/plan/engine/forecast'
import { fxRatesFromAssumptions } from '@/plan/engine/fx'
import { fromRow } from '@/plan/engine/requests'
import { ENGINE_VERSION, lockedFrom } from '@/plan/engine/versions'
import type {
  Actor,
  AnyVersion,
  LockedVersion,
  MonthClose,
  PlanLine,
  Version,
  WorkingVersion,
} from '@/plan/types'
import type { Datasets, ISODate } from '../schema'
import {
  FY27_BUDGET,
  FY27_Q1_REFORECAST,
  FY27_WORKING,
  FY28_WORKING,
  type SampleVersionSpec,
  versionSpec,
} from './assumptions'
import { asKnownOn, assumptionsOf, type SampleBase } from './base'
import { inTreeOf } from './orgs'

export const BUDGET_LOCKED_AT = '2026-03-20T17:00'
export const Q1_LOCKED_AT = '2026-07-15T17:00'
/** The Q1 Reforecast's forecast runs as of the last close before its lock. */
export const Q1_FORECAST_AS_OF: ISODate = '2026-06-30'

/** When each Working version was created. */
const CREATED_AT: Readonly<Record<string, string>> = {
  [FY27_WORKING]: '2026-02-02T09:00',
  [FY28_WORKING]: '2026-09-15T09:00',
}

const lockDayOf = (spec: SampleVersionSpec): ISODate => spec.lockedOn as ISODate

/** A Working version of the sample (FY27 Working or FY28 Working). */
export function workingVersion(versionId: typeof FY27_WORKING | typeof FY28_WORKING): WorkingVersion {
  const spec = versionSpec(versionId)
  return {
    versionId,
    name: spec.name,
    kind: 'working',
    fiscalYear: spec.fiscalYear,
    grid: { from: spec.grid.from, to: spec.grid.to },
    proration: 'daily',
    state: 'working',
    createdAt: CREATED_AT[versionId],
    lockedAt: null,
    lockedBy: null,
    engineVersion: ENGINE_VERSION,
    parentId: null,
    hash: null,
  }
}

/** The frame the lines engine prices a version with (its id names its assumption rows). */
export function versionFrame(versionId: string): Version {
  const spec = versionSpec(versionId)
  return {
    versionId,
    name: spec.name,
    kind: spec.kind,
    fiscalYear: spec.fiscalYear,
    grid: { from: spec.grid.from, to: spec.grid.to },
    proration: 'daily',
    state: spec.kind === 'working' ? 'working' : 'locked',
    createdAt: CREATED_AT[versionId] ?? `${spec.setOn}T09:00`,
    lockedAt: spec.lockedOn ? `${spec.lockedOn}T17:00` : null,
    lockedBy: null,
    engineVersion: ENGINE_VERSION,
    parentId: null,
    hash: null,
  }
}

/** A version's plan lines at plan rates, computed from `data` as of `asOf` with the version's own rows. */
export function planLinesOf(data: Datasets, versionId: string, asOf: ISODate): PlanLine[] {
  const version = versionFrame(versionId)
  const rows = assumptionsOf(data, versionId)
  const ctx = lineContext({
    version,
    asOf,
    positions: data.positions,
    workers: data.workers,
    comp: data.comp,
    reqs: data.reqs,
    requests: data.requests.map(fromRow),
    assumptions: rows,
    rates: { table: fxRatesFromAssumptions(rows), use: 'plan', closedThrough: null },
  })
  return versionLines(version, ctx)
}

export interface SampleLocks {
  budget: LockedVersion
  q1: LockedVersion
}

/** The FY27 Budget, locked 20 Mar 2026 from the datasets as they stood that day. */
export function lockBudget(base: Pick<SampleBase, 'datasets' | 'known'>, by: Actor): LockedVersion {
  const spec = versionSpec(FY27_BUDGET)
  const view = asKnownOn(base, lockDayOf(spec))
  const rows = assumptionsOf(view, FY27_BUDGET)
  return lockedFrom(
    {
      working: workingVersion(FY27_WORKING),
      versionId: FY27_BUDGET,
      as: { kind: 'budget', name: spec.name },
      at: BUDGET_LOCKED_AT,
      by,
      lines: planLinesOf(view, FY27_BUDGET, lockDayOf(spec)),
      assumptions: rows,
      rates: fxRatesFromAssumptions(rows),
      forecast: null,
    },
    [],
  )
}

/** The FY27 Q1 Reforecast, locked 15 Jul 2026, with its forecast (closes April to June). */
export function lockQ1Reforecast(
  base: Pick<SampleBase, 'datasets' | 'known'>,
  closes: readonly MonthClose[],
  by: Actor,
  existing: readonly AnyVersion[],
): LockedVersion {
  const spec = versionSpec(FY27_Q1_REFORECAST)
  const lockDay = lockDayOf(spec)
  const view = asKnownOn(base, lockDay)
  const rows = assumptionsOf(view, FY27_Q1_REFORECAST)
  const rates = fxRatesFromAssumptions(rows)
  const f = forecast({
    version: versionFrame(FY27_Q1_REFORECAST),
    asOf: Q1_FORECAST_AS_OF,
    closes: closes.filter((c) => c.month <= Q1_FORECAST_AS_OF.slice(0, 7)),
    positions: view.positions,
    workers: view.workers,
    comp: view.comp,
    reqs: view.reqs,
    requests: view.requests.map(fromRow),
    freezes: view.freezes,
    assumptions: rows,
    rates,
    inTree: inTreeOf(view.positions),
    minCosted: Number(MIN_COSTED.default),
  })
  return lockedFrom(
    {
      working: workingVersion(FY27_WORKING),
      versionId: FY27_Q1_REFORECAST,
      as: { kind: 'reforecast', name: spec.name },
      at: Q1_LOCKED_AT,
      by,
      lines: planLinesOf(view, FY27_Q1_REFORECAST, lockDay),
      assumptions: rows,
      rates,
      forecast: forecastTable(f),
    },
    existing,
  )
}

/** Every version of the sample: the two locks, then FY27 Working and FY28 Working. */
export function sampleVersions(locks: SampleLocks): AnyVersion[] {
  return [locks.budget, locks.q1, workingVersion(FY27_WORKING), workingVersion(FY28_WORKING)]
}
