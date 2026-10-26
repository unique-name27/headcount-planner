/**
 * Test contexts for My team and the role homes: the generated sample through `buildContext` with the
 * real policy and the default clamp, in a mode, acting as a sample persona (`PersonaKey`), or as the
 * mode's default persona. One generated sample per test file (`cachedSample`). Test code only.
 */
import type { ActingAs, ModePicks } from '@/access/modes'
import { samplePicks } from '@/access/store'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { cachedSample, type PersonaKey, SAMPLE_AS_OF, type Sample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Mode } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'

/** The generated sample, once per test file. */
export const teamSample = (): Sample => cachedSample()

/** Every dataset as the sample. */
export function sampleSources(sample: Sample = teamSample()): Record<DatasetKey, SourceMeta> {
  return Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: sample.datasets[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
}

/** A sample persona as an Acting as pick. */
export function personaPick(key: PersonaKey, sample: Sample = teamSample()): ActingAs {
  const p = sample.personas.find((x) => x.key === key)
  if (!p) throw new Error(`No sample persona ${key}.`)
  return { personId: p.employeeId, name: p.name }
}

/**
 * The sample in `mode`, acting as `persona` (the mode's default persona when not given), showing
 * `version` and comparing with `compare` (a locked version's id, or 'target'; the mode's default
 * when not given).
 */
export function sampleContext(
  mode: Mode,
  opts: {
    persona?: PersonaKey
    filters?: Partial<Filters>
    version?: string | null
    compare?: string | null
    sample?: Sample
  } = {},
): AnalyticsContext {
  const sample = opts.sample ?? teamSample()
  const picks: ModePicks = opts.persona
    ? { ...samplePicks(sample.personas), [mode]: personaPick(opts.persona, sample) }
    : samplePicks(sample.personas)
  return buildContext({
    data: sample.datasets,
    sources: sampleSources(sample),
    filters: { ...DEFAULT_FILTERS, ...opts.filters },
    asOfOverride: null,
    today: SAMPLE_AS_OF,
    mode,
    actingAs: picks,
    plan: sample.plan,
    picks: { version: opts.version ?? null, compare: opts.compare ?? null },
  })
}
