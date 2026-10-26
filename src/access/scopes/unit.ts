/**
 * The `unit` scope (docs/PLAN.md 8.2): an HRBP's business unit. It pins the business unit filter to
 * one unit, include only, so every dataset follows it through `scopeDatasets` as the filter does. A
 * position belongs to the unit its row in effect on the as-of date names (a seat that starts later:
 * its first row), so a position that moved units is where it sits now (R26). Pure.
 */
import { officialParentMaps } from '@/data/lists/effective'
import type { EffectiveLists } from '@/data/lists/types'
import type { Datasets, ISODate, PositionRow } from '@/data/schema'
import type { PositionIndex } from '@/data/scope'
import { NOBODY } from './nobody'
import { holdingsOn, placementsOf, upward } from './people'
import type { UnitScope } from './types'
import { scopeValues } from './values'

/**
 * Each department's unit: its official parent on the Departments list when the list checks the data,
 * else the unit most of its positions are in (ties to the first unit by name).
 */
export function departmentUnits(
  rows: Iterable<PositionRow>,
  lists?: EffectiveLists | null,
): ReadonlyMap<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (!r.department || !r.businessUnit) continue
    let byUnit = counts.get(r.department)
    if (!byUnit) {
      byUnit = new Map()
      counts.set(r.department, byUnit)
    }
    byUnit.set(r.businessUnit, (byUnit.get(r.businessUnit) ?? 0) + 1)
  }
  const out = new Map<string, string>()
  for (const [dept, byUnit] of counts) {
    let best = ''
    let most = 0
    for (const [u, n] of [...byUnit].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))
      if (n > most) {
        best = u
        most = n
      }
    out.set(dept, best)
  }
  if (lists) for (const [dept, unit] of officialParentMaps(lists).department) if (unit) out.set(dept, unit)
  return out
}

/** The scope of one business unit on the as-of date. */
export function unitScope(
  index: PositionIndex,
  all: Datasets,
  asOf: ISODate,
  unit: string,
  lists?: EffectiveLists | null,
): UnitScope {
  const place = placementsOf(all.positions, index)
  const held = holdingsOn(all.workers, asOf)
  const positionIds = new Set<string>()
  for (const [id, row] of place) if (row.businessUnit === unit) positionIds.add(id)
  const personIds = new Set<string>()
  for (const id of positionIds) for (const p of held.everHeld.get(id) ?? []) personIds.add(p)
  // People not in plan sit in their own HRIS unit.
  for (const w of all.workers)
    if (!w?.positionId && w?.employeeId && w.businessUnit === unit) personIds.add(w.employeeId)
  const otherDepartments = new Set<string>()
  for (const [dept, u] of departmentUnits(index.byId.values(), lists))
    if (u !== unit) otherDepartments.add(dept)
  // A leader filter keeps to the unit when the seat's tree holds one of the unit's positions.
  const leaderPositionIds = new Set<string>()
  for (const id of positionIds) {
    if (!index.byId.has(id)) continue
    for (const up of upward(id, index)) {
      if (leaderPositionIds.has(up)) break
      leaderPositionIds.add(up)
    }
  }
  let size = 0
  for (const [, seats] of held.seatsOf) if (seats.some((s) => positionIds.has(s))) size++
  const values = scopeValues(positionIds, place)
  return {
    kind: 'unit',
    unit,
    positionIds,
    personIds,
    otherDepartments,
    leaderPositionIds,
    size,
    label: unit,
    ...(values ? { values } : {}),
  }
}

const empties = new Map<string, UnitScope>()

/**
 * A unit scope that holds nobody: no HRBP picked, or the remembered pick is not the unit's HRBP in
 * the loaded data. It pins a value no record has, never the whole company.
 */
export function emptyUnitScope(unit: string | null | undefined): UnitScope {
  const label = unit ?? ''
  let s = empties.get(label)
  if (!s) {
    s = {
      kind: 'unit',
      unit: NOBODY,
      positionIds: new Set(),
      personIds: new Set(),
      otherDepartments: new Set(),
      leaderPositionIds: new Set(),
      size: 0,
      label,
    }
    empties.set(label, s)
  }
  return s
}
