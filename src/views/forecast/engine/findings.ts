/**
 * Forecast > Overview's readout (docs/PLAN.md 9.4, 9.5): the year-end heads forecast against the
 * target, by unit (or department inside one unit), openings a freeze holds through the horizon, and
 * where modeled exits concentrate. Titles carry heads, never an amount (7.2 rule 6); positions are
 * listed, never people. A finding whose metric the mode hides is left out (`findingsInMode`). Pure.
 *
 * Readings taken here (views-1 builder, M2):
 *  - A unit's year-end forecast is compared with its own unit target (./target.ts); a gap of 3 heads
 *    or more is raised.
 *  - Modeled exits are raised for the group with the most of them when it holds 5 or more
 *    expected exits in the fiscal year.
 */
import { findingsInMode } from '@/access/numbers'
import type { Finding, FindingPosition, Severity } from '@/components/types'
import type { FilterDimension } from '@/data/scope'
import { groupFilter } from '@/drill/filter'
import { fmt, plural } from '@/lib/format'
import { targetKindOf } from '@/plan/engine/targets'
import { monthLabel } from '@/views/plan/engine/base'
import { placementOf } from '@/views/plan/engine/core'
import { positionsFor, positionsSpec } from '@/views/plan/engine/drill'
import { tagFindings } from '@/views/plan/engine/drillUses'
import { openingsOf } from '@/views/plan/engine/openings'
import { ID } from '../metrics'
import type { FPrep } from './base'
import { forecastFlows, sumBySeat } from './heads'
import { yearEndHeads } from './kpis'
import { FIGURE } from './lineage'

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }
const MIN_GAP = 3
const MIN_EXITS = 5

const listOf = (p: FPrep, ids: readonly string[], note: (id: string) => string): FindingPosition[] =>
  positionsFor(p, ids.slice(0, 50)).map((pos) => ({
    positionId: pos.positionId,
    title: pos.title ?? pos.positionId,
    note: note(pos.positionId),
  }))

export function forecastFindings(p: FPrep): Finding[] {
  if (!p.run) return []
  const out: Finding[] = []
  const place = placementOf(p.ctx)
  const units = new Set<string>()
  for (const id of p.scope.ids) units.add(place.get(id)?.businessUnit ?? '')
  const y = yearEndHeads(p)
  const last = p.fyMonths[p.fyMonths.length - 1]

  // Year-end heads against each unit's target.
  if (units.size > 1) {
    const targets = p.ctx.all.targets.filter(
      (t) => t.fiscalYear === p.fiscalYear && targetKindOf(t) === 'unit',
    )
    for (const unit of [...units].sort()) {
      const t = targets.find((x) => x.businessUnit === unit)
      if (!unit || !t) continue
      let heads = 0
      const ids: string[] = []
      for (const [id, v] of y.bySeat)
        if (place.get(id)?.businessUnit === unit) {
          heads += v
          ids.push(id)
        }
      const gap = heads - t.targetHeads
      if (Math.abs(gap) < MIN_GAP) continue
      const over = gap > 0
      const filter = groupFilter('businessUnit', unit)
      out.push({
        id: `year-end-${unit}`,
        metricId: ID.headsYearEnd,
        severity: over ? 'warning' : 'info',
        title: `${unit} is forecast ${fmt(Math.abs(gap), 'num1')} heads ${over ? 'over' : 'under'} its ${p.fiscalYear} target at the year end.`,
        detail: `${fmt(heads, 'num1')} expected heads at the ${monthLabel(last)} month-end against a target of ${fmt(t.targetHeads, 'int')}.`,
        ...(filter ? { filter } : {}),
        filterLabel: unit,
        drill: () =>
          positionsSpec(p, `Year-end heads forecast in ${unit}`, ids.sort(), {
            weight: (pos) => y.bySeat.get(pos.positionId) ?? 0,
            note: 'Each seat counts as its expected heads at the year end.',
            ...(filter ? { filter } : {}),
          }),
        uses: p.uses(FIGURE.yearEnd),
      })
    }
  }

  // Openings a freeze holds through the horizon.
  const held = openingsOf(p).frozen.filter((o) => !p.run?.starts.has(o.positionId))
  if (held.length) {
    const ids = held.map((o) => o.positionId)
    out.push({
      id: 'held-by-freeze',
      metricId: ID.startsUnfilled,
      severity: 'info',
      title: `${plural(ids.length, 'opening')} ${ids.length === 1 ? 'is' : 'are'} held by a freeze and ${ids.length === 1 ? 'does' : 'do'} not start in the forecast.`,
      detail: 'Each counts in full in Unfilled at horizon until the freeze ends.',
      positions: listOf(p, ids, (id) => {
        const f = held.find((o) => o.positionId === id)?.frozenBy
        return f ? `Freeze ${f}` : 'Frozen'
      }),
      positionsTotal: ids.length,
      drill: () => positionsSpec(p, 'Openings held by a freeze', ids),
      uses: p.uses(FIGURE.starts),
    })
  }

  // Where modeled exits concentrate.
  const exits = sumBySeat(forecastFlows(p), p.fyMonths, (f) => f.exitSeats)
  const dim: FilterDimension = units.size > 1 ? 'businessUnit' : 'department'
  const by = new Map<string, { n: number; ids: string[] }>()
  for (const [id, v] of exits) {
    const r = place.get(id)
    const k = (dim === 'businessUnit' ? r?.businessUnit : r?.department) ?? ''
    if (!k) continue
    const g = by.get(k) ?? { n: 0, ids: [] }
    g.n += v
    g.ids.push(id)
    by.set(k, g)
  }
  const top = [...by].sort((a, b) => b[1].n - a[1].n)[0]
  if (top && top[1].n >= MIN_EXITS) {
    const [key, g] = top
    const filter = groupFilter(dim, key)
    out.push({
      id: `exits-${key}`,
      metricId: ID.exitsModeled,
      severity: 'info',
      title: `${key} has the most modeled exits: ${fmt(g.n, 'num1')} in ${p.fiscalYear}.`,
      detail: 'Modeled exits come from attrition rates; named exits are never predicted.',
      ...(filter ? { filter } : {}),
      filterLabel: key,
      drill: () =>
        positionsSpec(p, `Modeled exits in ${key}`, g.ids.sort(), {
          weight: (pos) => exits.get(pos.positionId) ?? 0,
          note: "Each seat counts as its holder's or opening's modeled exits.",
          ...(filter ? { filter } : {}),
        }),
      uses: p.uses(FIGURE.exits),
    })
  }
  out.sort((a, b) => RANK[a.severity] - RANK[b.severity])
  return tagFindings(findingsInMode(p.ctx.access, out))
}
