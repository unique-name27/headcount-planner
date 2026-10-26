import { describe, expect, it } from 'vitest'
import {
  applyEdit,
  applyEdits,
  canUndo,
  changedFields,
  currentValue,
  describeChange,
  EMPTY_METRICS,
  MAX_LOG,
  resetAll,
  resetMetric,
  sanitizeMetricsState,
  undoChange,
} from './overrides'
import { ANON, EXITS, FIXTURE, LOADS } from './test-fixtures'
import type { MetricEdit, MetricsState } from './types'

const at = '2026-10-02T09:00:00.000Z'

function edit(state: MetricsState, e: MetricEdit, by?: string): MetricsState {
  const r = applyEdit(state, FIXTURE, e, { by, at })
  if (!r.ok) throw new Error(r.error)
  return r.state
}

describe('editing the dictionary', () => {
  it('validates each field, keeps only differences, and logs from and to', () => {
    let s = edit(EMPTY_METRICS, { metricId: LOADS, field: 'params.loadBudget', value: 0.04 }, 'Jamie')
    expect(s.overrides[LOADS]).toEqual({ text: {}, params: { loadBudget: 0.04 } })
    expect(s.log).toHaveLength(1)
    expect(s.log[0]).toMatchObject({
      metricId: LOADS,
      field: 'params.loadBudget',
      from: 0.035,
      to: 0.04,
      at,
      by: 'Jamie',
      kind: 'edit',
    })
    // Back to the default: the override goes, the log keeps both changes.
    s = edit(s, { metricId: LOADS, field: 'params.loadBudget', value: 0.035 })
    expect(s.overrides).toEqual({})
    expect(s.log.map((c) => [c.from, c.to])).toEqual([
      [0.04, 0.035],
      [0.035, 0.04],
    ])
    expect(s.log[0].by).toBeUndefined()
  })

  it('gives each change an id from the change itself, the same for the same edits', () => {
    const run = () =>
      applyEdits(
        EMPTY_METRICS,
        FIXTURE,
        [
          { metricId: LOADS, field: 'params.loadBudget', value: 0.04 },
          { metricId: LOADS, field: 'params.loadBudget', value: 0.035 },
          { metricId: LOADS, field: 'params.loadBudget', value: 0.04 },
        ],
        { at },
      ).state.log.map((c) => c.id)
    const ids = run()
    expect(ids).toEqual(run())
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) expect(id).toMatch(/^mc-[0-9a-f]{16}$/)
  })

  it('changes nothing and logs nothing when the value is already in force', () => {
    const r = applyEdit(EMPTY_METRICS, FIXTURE, {
      metricId: LOADS,
      field: 'params.loadBudget',
      value: 0.035,
    })
    expect(r).toEqual({ ok: true, state: EMPTY_METRICS, change: null })
    // Even on a locked field.
    const locked = applyEdit(EMPTY_METRICS, FIXTURE, {
      metricId: ANON,
      field: 'definition',
      value: ' Groups smaller than this are hidden. ',
    })
    expect(locked.ok && locked.change).toBeNull()
  })

  it('refuses invalid values with a reason', () => {
    const bad = (e: MetricEdit) => {
      const r = applyEdit(EMPTY_METRICS, FIXTURE, e)
      return r.ok ? null : r.error
    }
    expect(bad({ metricId: 'nope', field: 'definition', value: 'x' })).toBe('No metric has the id nope.')
    expect(bad({ metricId: EXITS, field: 'definition', value: '   ' })).toBe("A definition can't be empty.")
    expect(bad({ metricId: EXITS, field: 'definition', value: 42 })).toBe('Definition: enter text.')
    expect(bad({ metricId: EXITS, field: 'owner', value: 'x'.repeat(121) })).toBe(
      'Owner: keep it under 120 characters.',
    )
    expect(bad({ metricId: EXITS, field: 'params.nope', value: 1 })).toBe(
      'Attrition has no field called params.nope.',
    )
    expect(bad({ metricId: EXITS, field: 'params.firstYearDays', value: 1000 })).toBe(
      'First-year window: enter a value from 30 d to 730 d.',
    )
    expect(bad({ metricId: EXITS, field: 'target', value: { value: 1.5, comparator: '<=' } })).toBe(
      'Enter a target from 0% to 100%.',
    )
    expect(bad({ metricId: EXITS, field: 'target', value: { value: 0.1, comparator: '=' } })).toBe(
      'Choose "at least" or "at most" for the target.',
    )
    expect(bad({ metricId: ANON, field: 'definition', value: 'Smaller groups show.' })).toBe(
      'The wording of anonymity minimum is locked.',
    )
    expect(bad({ metricId: ANON, field: 'target', value: { value: 3, comparator: '>=' } })).toBe(
      'The target of anonymity minimum is locked.',
    )
    expect(bad({ metricId: ANON, field: 'params.minGroup', value: 3 })).toBe(
      'Smallest group shown can be raised, never lowered: enter 5 or more.',
    )
    expect(bad({ metricId: ANON, field: 'params.payOptIn', value: false })).toBe(
      "Pay amounts are opt-in is locked and can't be changed.",
    )
  })

  it('raises the anonymity minimum and lowers it back, never below 5', () => {
    let s = edit(EMPTY_METRICS, { metricId: ANON, field: 'params.minGroup', value: 10 })
    expect(currentValue(FIXTURE.byId.get(ANON)!, s.overrides[ANON], 'params.minGroup')).toBe(10)
    s = edit(s, { metricId: ANON, field: 'params.minGroup', value: 5 })
    expect(s.overrides[ANON]).toBeUndefined()
    expect(applyEdit(s, FIXTURE, { metricId: ANON, field: 'params.minGroup', value: 4 }).ok).toBe(false)
  })

  it('clears optional wording, removes a default target, and sets a new one', () => {
    const def = FIXTURE.byId.get(EXITS)!
    let s = edit(EMPTY_METRICS, { metricId: EXITS, field: 'formula', value: '' })
    expect(s.overrides[EXITS].text).toEqual({ formula: '' })
    expect(currentValue(def, s.overrides[EXITS], 'formula')).toBeNull()
    s = edit(s, { metricId: EXITS, field: 'target', value: null })
    expect(s.overrides[EXITS].target).toBeNull()
    expect(changedFields(def, s.overrides[EXITS])).toEqual(['formula', 'target'])
    s = edit(s, { metricId: EXITS, field: 'target', value: { value: 0.07, comparator: '<=' } })
    expect(s.overrides[EXITS].target).toEqual({ value: 0.07, comparator: '<=' })
    s = edit(s, { metricId: EXITS, field: 'definition', value: '  Exits as a share of average heads.\r\n' })
    expect(s.overrides[EXITS].text.definition).toBe('Exits as a share of average heads.')
    expect(describeChange(s.log[0], FIXTURE)).toBe('Attrition, definition changed')
    expect(describeChange(s.log[1], FIXTURE)).toBe('Attrition, target: No target to At most 7.0%')
    expect(describeChange(s.log[3], FIXTURE)).toBe('Attrition, formula cleared')
  })

  it('words a setting change with its unit', () => {
    const s = edit(EMPTY_METRICS, { metricId: LOADS, field: 'params.reviewUsd', value: 300_000 })
    expect(describeChange(s.log[0], FIXTURE)).toBe('Standard loads, review threshold: $250,000 to $300,000')
  })

  it('applies a batch field by field, with one timestamp', () => {
    const r = applyEdits(
      EMPTY_METRICS,
      FIXTURE,
      [
        { metricId: LOADS, field: 'params.loadBudget', value: 0.04 },
        { metricId: LOADS, field: 'params.healthyBand', value: [1.2, 0.8] },
        { metricId: LOADS, field: 'params.healthyBand', value: [0.85, 1.15] },
      ],
      { at, kind: 'import' },
    )
    expect(r.applied.map((c) => c.field)).toEqual(['params.loadBudget', 'params.healthyBand'])
    expect(r.applied.every((c) => c.kind === 'import' && c.at === at)).toBe(true)
    expect(r.rejected).toHaveLength(1)
    expect(r.state.overrides[LOADS].params).toEqual({ loadBudget: 0.04, healthyBand: [0.85, 1.15] })
  })
})

describe('undo and reset', () => {
  it('undoes the latest change of a field, and the undo itself', () => {
    let s = edit(EMPTY_METRICS, { metricId: LOADS, field: 'params.loadBudget', value: 0.04 })
    s = edit(s, { metricId: LOADS, field: 'params.loadBudget', value: 0.05 })
    const [latest, first] = s.log
    expect(canUndo(s, FIXTURE, first.id)).toBe(false) // not the latest for its field
    expect(canUndo(s, FIXTURE, latest.id)).toBe(true)
    s = undoChange(s, FIXTURE, latest.id, { at })
    expect(s.overrides[LOADS].params.loadBudget).toBe(0.04)
    expect(s.log[0]).toMatchObject({ kind: 'undo', from: 0.05, to: 0.04 })
    // The undo is now the latest entry and can itself be undone; the original can't.
    expect(canUndo(s, FIXTURE, latest.id)).toBe(false)
    s = undoChange(s, FIXTURE, undefined, { at })
    expect(s.overrides[LOADS].params.loadBudget).toBe(0.05)
    expect(undoChange(s, FIXTURE, 'missing')).toBe(s)
  })

  it('resets one metric or every metric, logging each field', () => {
    let s = edit(EMPTY_METRICS, { metricId: LOADS, field: 'params.loadBudget', value: 0.04 })
    s = edit(s, {
      metricId: LOADS,
      field: 'params.uplift',
      value: { 5: 0.07, 4: 0.05, 3: 0.03, 2: 0.01, 1: 0 },
    })
    s = edit(s, { metricId: EXITS, field: 'owner', value: 'HRBP team' })
    const one = resetMetric(s, FIXTURE, LOADS, { at, by: 'Jamie' })
    expect(Object.keys(one.overrides)).toEqual([EXITS])
    expect(one.log.slice(0, 2).map((c) => [c.kind, c.field, c.by])).toEqual([
      ['reset', 'params.uplift', 'Jamie'],
      ['reset', 'params.loadBudget', 'Jamie'],
    ])
    // A reset is undone field by field.
    const back = undoChange(one, FIXTURE, one.log[1].id)
    expect(back.overrides[LOADS].params).toEqual({ loadBudget: 0.04 })
    const all = resetAll(s, FIXTURE, { at })
    expect(all.overrides).toEqual({})
    expect(all.log).toHaveLength(s.log.length + 3)
    expect(resetMetric(EMPTY_METRICS, FIXTURE, LOADS)).toBe(EMPTY_METRICS)
    // An entry no longer registered is dropped.
    const stale = { ...s, overrides: { ...s.overrides, 'plan.gone.metric': { text: {}, params: { x: 1 } } } }
    expect(resetMetric(stale, FIXTURE, 'plan.gone.metric').overrides).toEqual(s.overrides)
  })

  it('keeps at most MAX_LOG entries', () => {
    let s = EMPTY_METRICS
    for (let i = 0; i < MAX_LOG + 5; i++)
      s = edit(s, { metricId: EXITS, field: 'params.firstYearDays', value: 100 + (i % 2) })
    expect(s.log).toHaveLength(MAX_LOG)
    expect(new Set(s.log.map((c) => c.id)).size).toBe(MAX_LOG)
  })
})

describe('reading back', () => {
  it('cleans stored state field by field and keeps unknown metrics as they are', () => {
    const raw = {
      overrides: {
        [LOADS]: {
          text: { owner: 'Finance team' },
          params: { loadBudget: 0.5, uplift: { 5: 0.07, 4: 0.05, 3: 0.03, 2: 0.01, 1: 0 } },
        },
        [ANON]: { text: { definition: 'Lowered.' }, params: { minGroup: 3, payOptIn: false } },
        [EXITS]: { text: {}, params: { firstYearDays: 365 } },
        'targets.retired.metric': { text: { definition: 'Kept.' }, params: { x: 1 } },
      },
      log: [
        { id: 'a', metricId: LOADS, field: 'params.loadBudget', from: 0.035, to: 0.04, at, kind: 'edit' },
        { junk: true },
      ],
    }
    const s = sanitizeMetricsState(raw, FIXTURE)
    expect(s.overrides).toEqual({
      [LOADS]: {
        text: { owner: 'Finance team' },
        params: { uplift: { 5: 0.07, 4: 0.05, 3: 0.03, 2: 0.01, 1: 0 } },
      },
      'targets.retired.metric': { text: { definition: 'Kept.' }, params: { x: 1 } },
    })
    expect(s.log.map((c) => c.id)).toEqual(['a'])
    expect(sanitizeMetricsState('nonsense', FIXTURE)).toBe(EMPTY_METRICS)
  })

  it('never lets a stored key reach a prototype', () => {
    const raw = JSON.parse(
      `{"overrides": {"__proto__": {"text": {}, "params": {"polluted": 1}}, "${LOADS}": {"text": {}, "params": {"__proto__": {"polluted": 1}, "loadBudget": 0.04}}, "plan.kept.one": {"text": {"definition": "x", "__proto__": "y"}, "params": {"constructor": 1, "ok": 2}}}, "log": [{"id": "b", "metricId": "x", "field": "owner", "from": null, "to": "y", "at": "${at}", "kind": "edit", "extra": "dropped"}]}`,
    )
    const s = sanitizeMetricsState(raw, FIXTURE)
    expect(Object.keys(s.overrides)).toEqual([LOADS, 'plan.kept.one'])
    expect(s.overrides[LOADS].params).toEqual({ loadBudget: 0.04 })
    expect(s.overrides['plan.kept.one']).toEqual({ text: { definition: 'x' }, params: { ok: 2 } })
    expect(s.log[0]).not.toHaveProperty('extra')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
