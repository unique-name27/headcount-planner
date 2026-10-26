/**
 * The privacy and cost guard rules (docs/PLAN.md 7.2, 7.7 and 12): registered, locked, read
 * through the dictionary, raise-only, and refused when lowered from storage or a settings file.
 */
import { describe, expect, it } from 'vitest'
import { MIN_GROUP } from '@/data/schema'
import { defaultMetrics, metricsApi } from './api'
import { CATALOG } from './catalog'
import {
  COST_GUARD_METRICS,
  costGuardOf,
  FLOOR_USD,
  floorUsdOf,
  MIN_CONTRIBUTORS,
  MIN_COSTED,
  minContributorsOf,
  minCostedOf,
} from './costGuard'
import { importMetricsSection } from './imports'
import { applyEdit, EMPTY_METRICS, sanitizeMetricsState } from './overrides'
import { formatParam } from './params'
import {
  ANONYMITY,
  LEAVE_COUNTS,
  minGroupOf,
  minLeaveCountOf,
  PAY_AMOUNTS,
  PRIVACY_METRICS,
  payAmountsOptIn,
} from './privacy'
import { RULE_SETTINGS } from './rules'
import { metricsWith } from './testing'

const RULES = [...PRIVACY_METRICS, ...COST_GUARD_METRICS]

describe('the privacy and cost guard rules', () => {
  it('are registered, locked rules that read no data', () => {
    expect(RULES.map((d) => d.id)).toEqual(RULE_SETTINGS.map((s) => s.metricId))
    for (const d of RULES) {
      expect(CATALOG.byId.get(d.id), d.id).toBe(d)
      expect(d.locked, d.id).toBe(true)
      expect(d.kind, d.id).toBe('rule')
      expect(d.uses, d.id).toEqual([])
      expect(d.owner, d.id).toBe('People analytics')
    }
  })

  it('start at 5 people and $100,000, read through the dictionary', () => {
    const m = defaultMetrics()
    expect(minGroupOf(m)).toBe(MIN_GROUP)
    expect(minLeaveCountOf(m)).toBe(5)
    expect(payAmountsOptIn(m)).toBe(true)
    expect(minCostedOf(m)).toBe(5)
    expect(floorUsdOf(m)).toBe(100_000)
    expect(minContributorsOf(m)).toBe(5)
    expect(costGuardOf(m)).toEqual({ minCosted: 5, floorUsd: 100_000, minContributors: 5 })
    expect(Object.isFrozen(costGuardOf(m))).toBe(true)
    const floor = CATALOG.byId.get(FLOOR_USD.metricId)!.params[0]
    expect(formatParam(floor, floor.default)).toBe('$100,000')
  })

  it('can be raised, never lowered, and pay amounts never change', () => {
    const raised = metricsWith({
      [ANONYMITY.metricId]: { [ANONYMITY.key]: 7 },
      [LEAVE_COUNTS.metricId]: { [LEAVE_COUNTS.key]: 10 },
      [MIN_COSTED.metricId]: { [MIN_COSTED.key]: 6 },
      [FLOOR_USD.metricId]: { [FLOOR_USD.key]: 200_000 },
      [MIN_CONTRIBUTORS.metricId]: { [MIN_CONTRIBUTORS.key]: 8 },
    })
    expect(minGroupOf(raised)).toBe(7)
    expect(minLeaveCountOf(raised)).toBe(10)
    expect(costGuardOf(raised)).toEqual({ minCosted: 6, floorUsd: 200_000, minContributors: 8 })
    // A rounding step stays on the $100,000 grid.
    expect(floorUsdOf(metricsWith({ [FLOOR_USD.metricId]: { [FLOOR_USD.key]: 240_000 } }))).toBe(200_000)
    const lower = (metricId: string, key: string, value: unknown) =>
      applyEdit(EMPTY_METRICS, CATALOG, { metricId, field: `params.${key}`, value })
    expect(lower(ANONYMITY.metricId, ANONYMITY.key, 4)).toEqual({
      ok: false,
      error: 'Smallest group shown can be raised, never lowered: enter 5 or more.',
    })
    expect(lower(LEAVE_COUNTS.metricId, LEAVE_COUNTS.key, 3).ok).toBe(false)
    expect(lower(MIN_COSTED.metricId, MIN_COSTED.key, 4)).toEqual({
      ok: false,
      error: 'Smallest number of costed people can be raised, never lowered: enter 5 or more.',
    })
    expect(lower(FLOOR_USD.metricId, FLOOR_USD.key, 50_000)).toEqual({
      ok: false,
      error: 'Rounding step can be raised, never lowered: enter $100,000 or more.',
    })
    expect(lower(MIN_CONTRIBUTORS.metricId, MIN_CONTRIBUTORS.key, 1).ok).toBe(false)
    expect(lower(PAY_AMOUNTS.metricId, PAY_AMOUNTS.key, false)).toEqual({
      ok: false,
      error: "Pay amounts are opt-in is locked and can't be changed.",
    })
  })

  it('keep their wording and target', () => {
    for (const d of RULES) {
      const wording = applyEdit(EMPTY_METRICS, CATALOG, {
        metricId: d.id,
        field: 'definition',
        value: 'Ours.',
      })
      expect(wording.ok, d.id).toBe(false)
      const target = applyEdit(EMPTY_METRICS, CATALOG, {
        metricId: d.id,
        field: 'target',
        value: { value: 1, comparator: '>=' },
      })
      expect(target.ok, d.id).toBe(false)
    }
  })

  it('drop a lowered value from storage or a settings file', () => {
    const lowered = {
      overrides: {
        [MIN_COSTED.metricId]: { text: { definition: 'Two will do.' }, params: { [MIN_COSTED.key]: 2 } },
        [FLOOR_USD.metricId]: { text: {}, params: { [FLOOR_USD.key]: 1000 } },
        [PAY_AMOUNTS.metricId]: { text: {}, params: { [PAY_AMOUNTS.key]: false } },
      },
      log: [],
    }
    const stored = sanitizeMetricsState(lowered, CATALOG)
    expect(stored.overrides).toEqual({})
    expect(costGuardOf(metricsApi(stored))).toEqual({ minCosted: 5, floorUsd: 100_000, minContributors: 5 })
    const r = importMetricsSection(lowered, EMPTY_METRICS, CATALOG, { at: '2026-10-01T00:00:00.000Z' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state).toEqual(EMPTY_METRICS)
    expect(r.report.rejected.map((x) => x.field).sort()).toEqual(
      [
        'definition',
        `params.${FLOOR_USD.key}`,
        `params.${MIN_COSTED.key}`,
        `params.${PAY_AMOUNTS.key}`,
      ].sort(),
    )
  })
})
