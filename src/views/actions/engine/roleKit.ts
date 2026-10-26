/**
 * The sample company in every mode, for the Action center's, the Requests view's and the Audit page's
 * tests (the template app's roleKit.ts): one context per mode with the sample personas as the Acting
 * as picks (the default each mode opens on, 13.3) and the real policy, scopes and lists, cached per
 * test file. Not imported by the app.
 */
import { MODES, type Mode, type ModePicks } from '@/access/modes'
import { samplePicks } from '@/access/store'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample, SAMPLE_AS_OF, type Sample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { MetricsApi } from '@/metrics/types'
import type { AuditEntry } from '@/plan/types'
import { VIEWS } from '@/views/registry'
import { type Collected, collectionOf } from './collect'
import { type RoleView, roleView } from './roles'

let sample: Sample | null = null

/** The generated sample, once per test file. */
export function sampleOnce(): Sample {
  sample ??= generateSample()
  return sample
}

/** The sample's personas as every mode's Acting as pick. */
export const picksOf = (s: Sample = sampleOnce()): ModePicks => samplePicks(s.personas)

/** The sample in a mode (fresh, uncached). */
export function sampleCtx(
  mode: Mode = 'hr-admin',
  opts: {
    picks?: ModePicks
    filters?: Filters
    showPay?: boolean
    metrics?: MetricsApi
    audit?: readonly AuditEntry[]
    sample?: Sample
  } = {},
): AnalyticsContext {
  const s = opts.sample ?? sampleOnce()
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: s.datasets[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
  return buildContext({
    data: s.datasets,
    sources,
    filters: opts.filters ?? DEFAULT_FILTERS,
    asOfOverride: null,
    today: SAMPLE_AS_OF,
    mode,
    actingAs: opts.picks ?? picksOf(s),
    plan: s.plan,
    showPay: !!opts.showPay,
    ...(opts.metrics ? { metrics: opts.metrics } : {}),
    ...(opts.audit ? { audit: opts.audit } : {}),
  })
}

const contexts = new Map<Mode, AnalyticsContext>()

/** The sample in a mode with the persona picks (cached per mode). */
export function modeCtx(mode: Mode): AnalyticsContext {
  let c = contexts.get(mode)
  if (!c) {
    c = sampleCtx(mode)
    contexts.set(mode, c)
  }
  return c
}

/** Every mode's collection and lists on the sample (nothing marked in this browser). */
export function everyMode(): { mode: Mode; ctx: AnalyticsContext; collected: Collected; lists: RoleView }[] {
  return MODES.map((mode) => {
    const ctx = modeCtx(mode)
    const collected = collectionOf(ctx, VIEWS)
    return { mode, ctx, collected, lists: roleView(collected, ctx, () => true) }
  })
}
