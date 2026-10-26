import { afterEach, describe, expect, it, vi } from 'vitest'
import { metricsApi } from './api'
import { applyEdits, EMPTY_METRICS } from './overrides'
import { loadMetrics, METRICS_KEY, saveMetrics } from './persist'
import { ANON, EXITS, FIXTURE, LOADS } from './test-fixtures'

class MemoryStorage {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('persistence', () => {
  it('keeps the dictionary at hcp:metrics', () => {
    expect(METRICS_KEY).toBe('hcp:metrics')
  })

  it('saves overrides and the change log, and reads them back the same', () => {
    const st = new MemoryStorage()
    const { state } = applyEdits(
      EMPTY_METRICS,
      FIXTURE,
      [
        { metricId: LOADS, field: 'params.healthyBand', value: [0.85, 1.15] },
        { metricId: EXITS, field: 'owner', value: 'Finance team' },
        { metricId: EXITS, field: 'target', value: null },
      ],
      { by: 'Jamie', at: '2026-10-02T10:00:00.000Z' },
    )
    saveMetrics(state, st)
    expect(JSON.parse(st.getItem(METRICS_KEY)!)).toMatchObject({ version: 1 })
    const back = loadMetrics(FIXTURE, st)
    expect(back).toEqual(state)
    expect(metricsApi(back, FIXTURE).param(LOADS, 'healthyBand')).toEqual([0.85, 1.15])
  })

  it('drops stored values that no longer pass, such as a lowered anonymity minimum', () => {
    const st = new MemoryStorage()
    st.setItem(
      METRICS_KEY,
      JSON.stringify({
        version: 1,
        overrides: { [ANON]: { text: {}, params: { minGroup: 2 } } },
        log: [],
      }),
    )
    expect(loadMetrics(FIXTURE, st)).toEqual({ overrides: {}, log: [] })
    expect(loadMetrics(FIXTURE, null)).toBe(EMPTY_METRICS)
  })

  it('reads nothing saved, or unreadable text, as the defaults', () => {
    const st = new MemoryStorage()
    expect(loadMetrics(FIXTURE, st)).toBe(EMPTY_METRICS)
    st.setItem(METRICS_KEY, '{not json')
    expect(loadMetrics(FIXTURE, st)).toBe(EMPTY_METRICS)
  })

  it('never throws when storage is full or missing', () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => saveMetrics(EMPTY_METRICS, full)).not.toThrow()
    expect(() => saveMetrics(EMPTY_METRICS, null)).not.toThrow()
  })

  it('uses localStorage by default', () => {
    const st = new MemoryStorage()
    vi.stubGlobal('localStorage', st)
    const { state } = applyEdits(EMPTY_METRICS, FIXTURE, [
      { metricId: LOADS, field: 'params.loadBudget', value: 0.05 },
    ])
    saveMetrics(state)
    expect(st.m.has('hcp:metrics')).toBe(true)
    expect(metricsApi(loadMetrics(FIXTURE), FIXTURE).num(LOADS, 'loadBudget')).toBe(0.05)
  })
})
