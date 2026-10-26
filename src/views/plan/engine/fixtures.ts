/**
 * Test contexts for the Plan and Forecast views (the template app's views/<key>/engine/fixtures.ts):
 * the generated sample in a mode, through `buildContext` with the real policy, scopes and cost guard,
 * the mode's Acting as pick on its sample persona (or the persona given), and the filters, version,
 * comparison and dictionary given. Test code only; one generated sample per test file.
 */
import { type ActingAs, NO_PICKS } from '@/access/modes'
import { samplePicks } from '@/access/store'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { cachedSample, type PersonaKey, SAMPLE_AS_OF, type Sample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, type ISODate, type Mode } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { MetricsApi } from '@/metrics/types'

/** The generated sample, once per test file. */
export const sample = (): Sample => cachedSample()

let sourcesMemo: Record<DatasetKey, SourceMeta> | null = null
const sourcesOf = (s: Sample): Record<DatasetKey, SourceMeta> => {
  sourcesMemo ??= Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: s.datasets[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
  return sourcesMemo
}

/** A persona as an Acting as pick (an HRBP's unit from its label, as the store reads it). */
export function pickOf(key: PersonaKey): ActingAs {
  const s = sample()
  const p = s.personas.find((x) => x.key === key)
  if (!p) throw new Error(`No persona ${key}`)
  const picks = samplePicks([p])
  return picks[p.mode] ?? { personId: p.employeeId, name: p.name }
}

export interface CtxOptions {
  filters?: Partial<Filters>
  /** HR admin's "Show pay amounts". */
  showPay?: boolean
  /** The mode's Acting as persona (its sample default when not given). */
  persona?: PersonaKey
  /** The version and comparison pickers (`ver`, `vs`). */
  version?: string | null
  compare?: string | null
  metrics?: MetricsApi
  /** A changed copy of the sample (`withData`), for invariance tests; the generated one when not given. */
  sample?: Sample
  /** HR admin's as-of override (`settings:data`); the sample's own date when not given. */
  asOf?: ISODate
}

/** The sample with some dataset rows changed (the plan state and the rest shared). */
export function withData(patch: Partial<Datasets>, s: Sample = sample()): Sample {
  return { ...s, datasets: { ...s.datasets, ...patch } }
}

/** The sample in a mode (see the module comment). */
export function sampleCtx(mode: Mode = 'hr-admin', opts: CtxOptions = {}): AnalyticsContext {
  const s = opts.sample ?? sample()
  const picks = { ...NO_PICKS, ...samplePicks(s.personas) }
  if (opts.persona) picks[mode] = pickOf(opts.persona)
  return buildContext({
    data: s.datasets,
    sources: sourcesOf(s),
    filters: { ...DEFAULT_FILTERS, ...opts.filters },
    asOfOverride: opts.asOf ?? null,
    today: SAMPLE_AS_OF,
    mode,
    actingAs: picks,
    plan: s.plan,
    picks: { version: opts.version ?? null, compare: opts.compare ?? null },
    showPay: !!opts.showPay,
    ...(opts.metrics ? { metrics: opts.metrics } : {}),
  })
}

/** One context per mode on its sample persona, HR admin with the switch off. */
export function everyMode(opts: CtxOptions = {}): { mode: Mode; ctx: AnalyticsContext }[] {
  const modes: Mode[] = ['manager', 'hrbp', 'leader', 'finance', 'hr-admin']
  return modes.map((mode) => ({ mode, ctx: sampleCtx(mode, opts) }))
}
