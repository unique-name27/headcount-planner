/**
 * The version and comparison pickers on the sample (docs/PLAN.md 9.2): every version listed by
 * fiscal year with the as-of year's Working as the default; the comparison offers the target and the
 * shown year's locked versions only, with the mode's default marked; a version from another year
 * drops a comparison that year does not offer.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample, type Sample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Mode } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { comparisonOptions, picksForVersion, versionOptions } from './pickerOptions'

let sample: Sample
let ctx: (mode: Mode, picks?: { version: string | null; compare: string | null }) => AnalyticsContext

beforeAll(() => {
  sample = generateSample()
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: sample.datasets[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
  ctx = (mode, picks) =>
    buildContext({
      data: sample.datasets,
      sources,
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      mode,
      plan: sample.plan,
      ...(picks ? { picks } : {}),
    })
}, 60_000)

describe('the version picker', () => {
  it('lists every version by fiscal year, the as-of year’s Working first and the default', () => {
    const options = versionOptions(ctx('finance'))
    expect(options.map((o) => [o.group, o.label])).toEqual([
      ['FY27', 'FY27 Working'],
      ['FY27', 'FY27 Budget'],
      ['FY27', 'FY27 Q1 Reforecast'],
      ['FY28', 'FY28 Working'],
    ])
    const working = options[0]
    expect(working).toMatchObject({ id: null, isDefault: true, selected: true, hint: 'Working, default' })
    expect(options[1]).toMatchObject({ id: sample.locks.budget.versionId, hint: 'Locked 20 Mar 2026' })
    expect(options[3].id).not.toBeNull()
  })

  it('marks the version shown', () => {
    const shown = versionOptions(ctx('finance', { version: sample.locks.q1.versionId, compare: null }))
    expect(shown.filter((o) => o.selected).map((o) => o.label)).toEqual(['FY27 Q1 Reforecast'])
  })
})

describe('the comparison picker', () => {
  it('offers the target and the shown year’s locked versions, the mode’s default marked', () => {
    const fin = comparisonOptions(ctx('finance'))
    expect(fin.map((o) => o.label)).toEqual(['FY27 target', 'FY27 Budget', 'plan of record (Q1 Reforecast)'])
    expect(fin.filter((o) => o.isDefault).map((o) => o.label)).toEqual(['FY27 Budget'])
    expect(fin.find((o) => o.isDefault)?.id).toBeNull()
    expect(fin.find((o) => o.selected)?.label).toBe('FY27 Budget')
    const hrbp = comparisonOptions(ctx('hrbp'))
    expect(hrbp.filter((o) => o.isDefault).map((o) => o.label)).toEqual(['plan of record (Q1 Reforecast)'])
  })

  it('offers only the target for a year with no locked version, in every mode', () => {
    const fy28 = sample.plan.versions.find((v) => v.fiscalYear === 'FY28')
    if (!fy28) throw new Error('no FY28 version')
    for (const mode of ['finance', 'leader'] as const) {
      const options = comparisonOptions(ctx(mode, { version: fy28.versionId, compare: null }))
      expect(options.map((o) => o.label)).toEqual(['FY28 target'])
      expect(options[0]).toMatchObject({ isDefault: true, selected: true, id: null })
    }
  })

  it('a version from another year drops a comparison that year does not offer', () => {
    const c = ctx('finance')
    const fy28 = sample.plan.versions.find((v) => v.fiscalYear === 'FY28')
    if (!fy28) throw new Error('no FY28 version')
    expect(picksForVersion(c, { compare: sample.locks.budget.versionId }, fy28.versionId)).toEqual({
      version: fy28.versionId,
      compare: null,
    })
    expect(picksForVersion(c, { compare: 'target' }, fy28.versionId)).toEqual({
      version: fy28.versionId,
      compare: 'target',
    })
    expect(picksForVersion(c, { compare: sample.locks.budget.versionId }, null)).toEqual({
      version: null,
      compare: sample.locks.budget.versionId,
    })
  })
})
