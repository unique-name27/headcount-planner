/**
 * Test contexts for the Targets and Finance views (test code only, the template app's
 * `engine/fixtures.ts`): the generated sample in a mode with the real policy, the sample personas'
 * Acting as picks (or one given), the plan state and the version and comparison pickers. One sample
 * per test file (`cachedSample`).
 */
import type { ActingAs, ModePicks } from '@/access/modes'
import { samplePicks } from '@/access/store'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { cachedSample, SAMPLE_AS_OF, type Sample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, type Mode } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { PlanState } from '@/plan/types'

export const sample = (): Sample => cachedSample()

/** The sample persona's pick for a mode, by persona key. */
export function personaPick(key: string): { mode: Mode; pick: ActingAs } {
  const p = sample().personas.find((x) => x.key === key)
  if (!p) throw new Error(`No persona ${key}`)
  const pick: ActingAs =
    p.mode === 'hrbp'
      ? { personId: p.employeeId, name: p.name, unit: /^(.+) HRBP$/.exec(p.label)?.[1] ?? p.businessUnit }
      : { personId: p.employeeId, name: p.name }
  return { mode: p.mode, pick }
}

export interface CtxOptions {
  filters?: Partial<Filters>
  version?: string | null
  compare?: string | null
  showPay?: boolean
  /** Replace the mode's pick. */
  pick?: ActingAs | null
  /** Datasets to use in place of the sample's (a copy with a planted row). */
  data?: Datasets
  /** A plan state in place of the sample's; null for none. */
  plan?: PlanState | null
}

/** The sample in a mode with the real policy and scopes. */
export function sampleCtx(mode: Mode, opts: CtxOptions = {}): AnalyticsContext {
  const s = sample()
  const data = opts.data ?? s.datasets
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
  const picks: ModePicks =
    opts.pick !== undefined ? { ...samplePicks(s.personas), [mode]: opts.pick } : samplePicks(s.personas)
  return buildContext({
    data,
    sources,
    filters: { ...DEFAULT_FILTERS, ...opts.filters },
    asOfOverride: null,
    today: SAMPLE_AS_OF,
    mode,
    actingAs: picks,
    plan: opts.plan === undefined ? s.plan : opts.plan,
    picks: { version: opts.version ?? null, compare: opts.compare ?? null },
    showPay: !!opts.showPay,
  })
}
