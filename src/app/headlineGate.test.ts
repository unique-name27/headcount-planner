/**
 * Folder-tab headlines (docs/PLAN.md 9.1; the template app's headlineGate test): a headline is
 * gated on the data standard like any KPI, reads "—" when its view's headline throws, and the
 * strip never computes a number of its own.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { buildSampleState } from '@/data/quality/seed'
import type { Limiting } from '@/data/quality/types'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { starterSample } from '@/data/sample/raw'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { DASH } from '@/lib/format'
import { VIEWS } from '@/views/registry'
import type { Headline, ViewDef } from '@/views/types'
import { FAILED_HEADLINE, folderHeadlines, gateHeadline, safeHeadline } from './headlineGate'

/** Just enough of a quality index: every number gets this tier. */
const fixed = (tier: Limiting['tier'], dataset: DatasetKey = 'reqs') => ({
  limitingOf: (): Limiting => ({ tier, dataset, ref: null }),
  explainOf: () => `${tier}: test`,
})

describe('gateHeadline', () => {
  const h: Headline = { value: '114', label: 'open reqs', spark: [1, 2, 3] }

  it('passes a headline that meets the standard through', () => {
    const out = gateHeadline(h, fixed('gold'), 'gold', ['reqs'])
    expect(out).toMatchObject({ value: '114', label: 'open reqs', spark: [1, 2, 3], hidden: null })
  })

  it('hides a headline below the standard: a dash, no spark, and why', () => {
    const out = gateHeadline(h, fixed('silver'), 'gold', ['reqs'])
    expect(out.value).toBe(DASH)
    expect(out.spark).toBeUndefined()
    expect(out.label).toBe('open reqs')
    expect(out.hidden).toBe('Not yet confirmed for production')
    expect(gateHeadline(h, fixed('silver'), 'silver', ['reqs']).hidden).toBeNull()
  })

  it('never shows a headline with no data behind it', () => {
    const out = gateHeadline(h, fixed('none'), 'bronze', ['reqs'])
    expect(out.value).toBe(DASH)
    expect(out.hidden).toMatch(/^No data: /)
  })
})

describe('safeHeadline', () => {
  it('reads "—" for a view whose headline throws, and says which', () => {
    const errors: string[] = []
    const broken = {
      key: 'plan' as const,
      headline: () => {
        throw new Error('plan/engine.planHeadline is not built yet')
      },
    }
    const out = safeHeadline(broken, {} as AnalyticsContext, (key) => errors.push(key))
    expect(out).toEqual(FAILED_HEADLINE)
    expect(errors).toEqual(['plan'])
  })
})

describe('folder-tab headlines on the messy sample', () => {
  let ctx: (standard: 'gold' | 'silver' | 'bronze') => AnalyticsContext

  beforeAll(() => {
    const sample = generateSample()
    const state = buildSampleState(sample.datasets, starterSample(sample.datasets).seed, SAMPLE_AS_OF)
    const sources = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: state.data[k].length }]),
    ) as Record<DatasetKey, SourceMeta>
    ctx = (standard) =>
      buildContext({
        data: state.data,
        sources,
        filters: DEFAULT_FILTERS,
        asOfOverride: null,
        mode: 'hr-admin',
        plan: sample.plan,
        datasetVersions: state.versions,
        standard,
      })
  }, 60_000)

  /** A view whose headline reads one field. */
  const reading = (key: ViewDef['key'], ref: FieldRef, datasets: DatasetKey[]) => ({
    key,
    datasets,
    headline: (): Headline => ({ value: '12', label: 'things', uses: [ref] }),
  })

  it('gates each headline on the tier of the fields it reads, as the tiles on its page are', () => {
    // On the messy sample positions are gold, reqs silver and requests bronze (raw/plan.ts).
    const views = [
      reading('plan', 'positions.status', ['positions']),
      reading('forecast', 'reqs.status', ['reqs']),
      reading('requests', 'requests.state', ['requests']),
    ]
    const shown = (standard: 'gold' | 'silver' | 'bronze') =>
      folderHeadlines(views, ctx(standard)).map((h) => h.hidden == null)
    expect(shown('gold')).toEqual([true, false, false])
    expect(shown('silver')).toEqual([true, true, false])
    expect(shown('bronze')).toEqual([true, true, true])
    const hidden = folderHeadlines(views, ctx('gold'))[1]
    expect(hidden.value).toBe(DASH)
    expect(hidden.hidden).toBe('Not yet confirmed for production')
  })

  it('reads every registered view without throwing, whatever state its headline is in', () => {
    const c = ctx('bronze')
    const out = folderHeadlines(VIEWS, c, () => undefined)
    expect(out).toHaveLength(VIEWS.length)
    for (const [i, h] of out.entries()) {
      expect(typeof h.value, VIEWS[i].key).toBe('string')
      expect(h.value.length, VIEWS[i].key).toBeGreaterThan(0)
    }
  })
})
