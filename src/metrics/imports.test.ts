import { describe, expect, it } from 'vitest'
import { importMetricsSection, importSummary, metricsFileSection } from './imports'
import { applyEdits, EMPTY_METRICS } from './overrides'
import { ANON, EXITS, FIXTURE, LOADS } from './test-fixtures'
import type { MetricEdit, MetricsState } from './types'

const stateOf = (edits: MetricEdit[]): MetricsState => applyEdits(EMPTY_METRICS, FIXTURE, edits).state

describe('the dictionary in the settings file', () => {
  it('travels as a snapshot: the file values apply, and what the file leaves out goes back to default', () => {
    const exported = stateOf([
      { metricId: LOADS, field: 'params.loadBudget', value: 0.045 },
      { metricId: EXITS, field: 'target', value: { value: 0.07, comparator: '<=' } },
    ])
    const file = JSON.parse(JSON.stringify(metricsFileSection(exported)))
    expect(file.log).toHaveLength(2)
    const mine = stateOf([{ metricId: EXITS, field: 'owner', value: 'Finance team' }])
    const r = importMetricsSection(file, mine, FIXTURE, { by: 'Jamie' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.overrides).toEqual(exported.overrides)
    expect(r.report.changed.map((c) => [c.field, c.kind, c.by])).toEqual([
      ['owner', 'import', 'Jamie'],
      ['target', 'import', 'Jamie'],
      ['params.loadBudget', 'import', 'Jamie'],
    ])
    expect(r.report.summary).toBe('Changed 3 values in 2 metrics.')
  })

  it('keeps the value in force for anything invalid and reports unknown metrics', () => {
    const mine = stateOf([{ metricId: LOADS, field: 'params.loadBudget', value: 0.04 }])
    const r = importMetricsSection(
      {
        overrides: {
          [LOADS]: { text: {}, params: { loadBudget: 0.9 } },
          [ANON]: { text: {}, params: { minGroup: 2 } },
          'requests.gone.metric': { text: { definition: 'x' }, params: {} },
        },
      },
      mine,
      FIXTURE,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.overrides[LOADS].params.loadBudget).toBe(0.04)
    expect(r.report.rejected.map((x) => [x.metricId, x.field])).toEqual([
      [LOADS, 'params.loadBudget'],
      [ANON, 'params.minGroup'],
    ])
    expect(r.report.unknown).toEqual(['requests.gone.metric'])
    expect(importMetricsSection({ nope: 1 }, mine, FIXTURE)).toEqual({
      ok: false,
      error: 'The metric definitions in the file are not readable.',
    })
    expect(importMetricsSection({ overrides: [] }, mine, FIXTURE).ok).toBe(false)
  })

  it('reads only the file’s own keys', () => {
    const file = JSON.parse(`{"overrides": {"__proto__": {"text": {"owner": "x"}, "params": {}}}}`)
    const r = importMetricsSection(file, EMPTY_METRICS, FIXTURE)
    expect(r.ok && r.state).toEqual(EMPTY_METRICS)
    expect(r.ok && r.report.unknown).toEqual(['__proto__'])
  })

  it('summarizes plainly', () => {
    expect(importSummary([], [], [])).toBe(
      'Nothing changed: every value in the file matches what is in force.',
    )
    expect(importSummary([], [{ metricId: 'a', field: 'owner', reason: 'x' }], ['b', 'c'])).toBe(
      'Nothing changed. 1 value was not applied. 2 metric IDs in the file are not in Headcount Planner and were skipped.',
    )
  })
})
