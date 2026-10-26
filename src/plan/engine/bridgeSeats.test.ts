/**
 * The bridge's seats built once per comparison, seat lines, positions and window and shared by scopes
 * (`scopedBridgeSeats`), and the bridge from kept stage prices (`bridge` with `pricesOf`), against the
 * engine's own `bridgeSeats` and `bridge` over a synthetic workspace with a Budget locked from its
 * lines: the same seats in the same order, field for field, and the same bridge to the cent, for the
 * company, a unit, a forecast side kept to some positions, a scope that moves seats between the sides
 * and a part-year window, asked in turn and again (a second ask reads the kept seats).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Month } from '@/data/schema'
import type { LockedVersion, OrgMatch, PlanLine } from '../types'
import { type BridgeSeat, bridge, bridgeSeats, scopedBridgeSeats, seatStagePrices } from './bridge'
import { lineContext, versionLines } from './cost'
import { FY27_MONTHS, fy27Working } from './fixtures/common'
import { type SyntheticWorkspace, syntheticWorkspace } from './fixtures/synthetic'
import { type CohortLine, type ForecastResult, forecast, isCohortLine } from './forecast'
import { lockedFrom } from './versions'

let ws: SyntheticWorkspace
let budget: LockedVersion
let fc: ForecastResult
let seatLines: PlanLine[]
let cohortLines: CohortLine[]

beforeAll(() => {
  ws = syntheticWorkspace()
  const version = fy27Working('daily')
  const lines = versionLines(
    version,
    lineContext({
      version,
      asOf: '2026-09-30',
      positions: ws.positions,
      workers: ws.workers,
      comp: ws.comp,
      reqs: ws.reqs,
      requests: ws.requests,
      assumptions: ws.assumptions,
      rates: { table: ws.rates, use: 'plan', closedThrough: null },
    }),
  )
  budget = lockedFrom(
    {
      working: version,
      versionId: 'fy27-budget',
      as: { kind: 'budget', name: 'FY27 Budget' },
      at: '2026-03-31T12:00',
      by: { personId: 'E8001', name: 'Finance', mode: 'finance' },
      lines,
      assumptions: ws.assumptions,
      rates: ws.rates,
      forecast: null,
    },
    [],
  )
  fc = forecast({
    version,
    asOf: '2026-09-30',
    closes: [],
    positions: ws.positions,
    workers: ws.workers,
    comp: ws.comp,
    reqs: ws.reqs,
    requests: ws.requests,
    freezes: ws.freezes,
    assumptions: ws.assumptions,
    rates: ws.rates,
    inTree: () => false,
  })
  seatLines = fc.lines.filter((l) => !isCohortLine(l) && l.positionId !== '')
  cohortLines = fc.lines.filter(isCohortLine)
}, 120_000)

const units = () => [...new Set(ws.positions.map((r) => r.businessUnit))].sort()

/** Every position with a row, every other one (by sorted position), for a forecast side kept to some. */
const someOf = () => {
  const ids = [...new Set(ws.positions.map((r) => r.positionId))].sort()
  return new Set(ids.filter((_, i) => i % 3 !== 0))
}

interface Case {
  name: string
  scope: OrgMatch
  /** The forecast side's positions (all when not given). */
  has?: ReadonlySet<string>
  months: readonly Month[]
}

const cases = (): Case[] => {
  const [first, second] = units()
  const some = someOf()
  return [
    { name: 'the company', scope: () => true, months: FY27_MONTHS },
    { name: `the unit ${first}`, scope: (p) => p.businessUnit === first, months: FY27_MONTHS },
    {
      name: 'a forecast side kept to some positions',
      scope: (p, on) => p.positionId == null || on < '2026-09-30' || some.has(p.positionId),
      has: some,
      months: FY27_MONTHS,
    },
    {
      name: 'seats moving between the sides',
      scope: (p, on) => (on < '2026-09-30' ? p.businessUnit !== second : p.businessUnit !== first),
      months: FY27_MONTHS,
    },
    { name: 'a part-year window', scope: (p) => p.businessUnit !== second, months: FY27_MONTHS.slice(3, 9) },
  ]
}

/** The engine's own seats for a case: `bridgeSeats` over the forecast side's lines. */
function ownSeats(c: Case): BridgeSeat[] {
  const lines = [...seatLines.filter((l) => !c.has || c.has.has(l.positionId)), ...cohortLines]
  return bridgeSeats({
    comparison: budget,
    forecast: { ...fc, lines },
    positions: ws.positions,
    scope: c.scope,
    months: c.months,
  })
}

const sharedSeats = (c: Case): BridgeSeat[] =>
  scopedBridgeSeats({
    comparison: budget,
    seatLines,
    cohortLines,
    asOf: fc.asOf,
    positions: ws.positions,
    months: c.months,
    forecastHas: (id) => !c.has || c.has.has(id),
    scope: c.scope,
  })

describe('scopedBridgeSeats', () => {
  it('gives bridgeSeats’ seats for every scope, in order, field for field, asked again and again', () => {
    expect(units().length).toBeGreaterThanOrEqual(2)
    for (let round = 0; round < 2; round++)
      for (const c of cases()) {
        const own = ownSeats(c)
        expect(own.length, c.name).toBeGreaterThan(10)
        expect(sharedSeats(c), `${c.name}, round ${round + 1}`).toEqual(own)
      }
  })

  it('shares one position’s seats between scopes that take it the same way', () => {
    const a = sharedSeats(cases()[0])
    const b = sharedSeats(cases()[0])
    expect(b.length).toBe(a.length)
    expect(b.every((s, i) => s === a[i] || s.positionId.startsWith('cohort:'))).toBe(true)
  })
})

describe('bridge from kept stage prices', () => {
  it('is the bridge to the cent, its steps and contributors included', () => {
    for (const c of cases()) {
      const seats = sharedSeats(c)
      const input = {
        fiscalYear: 'FY27' as const,
        comparison: { versionId: budget.versionId, label: budget.name, fiscalYear: 'FY27' as const },
        yearHasLockedVersion: true,
        months: c.months,
        seats,
      }
      const kept = new Map(seats.map((s) => [s, seatStagePrices(s, c.months)]))
      const a = bridge(input)
      const b = bridge(input, (s) => kept.get(s) as number[])
      expect(b, c.name).toEqual(a)
      expect(bridge({ ...input, seats: ownSeats(c) }), c.name).toEqual(a)
    }
  })
})
