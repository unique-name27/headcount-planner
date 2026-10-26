/**
 * What the Forecast view's numbers read, and its words (the template app's lineage test; docs/PLAN.md
 * 14.3): every lineage names schema fields only, every figure and tile declares one with the
 * filters' fields, and the model's words keep the copy rules in every mode.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { invalidRefs } from '@/data/quality/fieldRef'
import { uses } from '@/metrics/fields'
import { expectPlainCopy, wordsOf } from '@/views/plan/engine/testing'
import { forecastModel } from '.'
import { everyMode, sample, sampleCtx } from './fixtures'
import { FIGURE } from './lineage'

beforeAll(() => {
  sample()
}, 60_000)

describe('lineage', () => {
  it('names schema fields only, on every figure and tile, with the filters’ fields', () => {
    expect(invalidRefs(uses(...Object.values(FIGURE)))).toEqual([])
    const m = forecastModel(sampleCtx('hr-admin', { filters: { level: ['P4'] } }))
    for (const f of [m.overview.headsByMonth, m.overview.startsExits, m.variance.rows, m.bridge.steps]) {
      expect(invalidRefs(f.uses), f.id).toEqual([])
      expect(f.uses, f.id).toContain('positions.level')
    }
    for (const k of [...m.overview.kpis, ...m.variance.kpis])
      expect(k.uses, k.id).toContain('positions.level')
  })
})

describe('copy', () => {
  it('keeps the rules in every mode', () => {
    for (const { mode, ctx } of everyMode()) {
      const m = forecastModel(ctx)
      const kpis = [
        ...m.overview.kpis,
        ...m.variance.kpis,
        ...m.bridge.kpis,
        ...(m.overview.costVsTarget ? [m.overview.costVsTarget] : []),
      ]
      const words = wordsOf({
        kpis: kpis.map((k) => ({
          label: k.label,
          note: k.note,
          formula: k.formula,
          deltaLabel: k.deltaLabel,
          why: k.suppressedNote,
        })),
        findings: m.overview.findings.map((f) => ({ title: f.title, detail: f.detail })),
        figures: [m.overview.headsByMonth, m.overview.startsExits, m.variance.rows, m.bridge.steps].map(
          (f) => ({
            title: f.title,
            subtitle: f.subtitle,
            note: f.note,
            empty: f.empty,
            labels: f.columns.map((c) => c.label),
          }),
        ),
        steps: m.bridge.steps.rows.map((r) => r.label),
        reasons: [...new Set(m.variance.rows.rows.map((r) => r.reason ?? ''))],
      })
      expect(words.length, mode).toBeGreaterThan(20)
      expectPlainCopy(words, mode)
    }
  })
})
