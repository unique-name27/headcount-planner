/**
 * Test contexts for the drill layer's own tests: the generated sample in a mode, with an access
 * context that answers from a small table the test gives (which drill kinds and columns the mode
 * lists, which surfaces it hides, its scope), so the drill tests do not depend on the policy
 * tables (src/access/policy) or the scopes the access layer builds. The leak tests use the real
 * policy through src/testkit; these check the drill layer's own rules: rows, columns, links, the
 * position card and "Filter to this". Test code only.
 */
import type { AccessContext } from '@/access/context'
import { hidden, SHOWN } from '@/access/policy/types'
import type { ScopeLock } from '@/access/scopes/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample, SAMPLE_AS_OF, type Sample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Mode } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'

let cached: Sample | null = null

/** The generated sample, once per test file. */
export function drillSample(): Sample {
  cached ??= generateSample()
  return cached
}

/** What a stand-in access hides: surfaces by exact id or by prefix (`column:planLines.`). */
export interface AccessTable {
  hidden?: readonly string[]
  hiddenPrefixes?: readonly string[]
  scope?: ScopeLock | null
  unset?: boolean
  actingAs?: AccessContext['actingAs']
  switchOn?: boolean
}

/** An access context for `mode` that answers from `table` (everything else shown). */
export function standInAccess(base: AccessContext, mode: Mode, table: AccessTable = {}): AccessContext {
  const hiddenSet = new Set(table.hidden ?? [])
  const prefixes = table.hiddenPrefixes ?? []
  const decide = (s: string) =>
    hiddenSet.has(s) || prefixes.some((p) => s.startsWith(p)) ? hidden('Not shown in this test mode.') : SHOWN
  return {
    ...base,
    mode,
    scope: table.scope ?? null,
    unset: !!table.unset,
    actingAs: table.actingAs ?? null,
    switchOn: mode === 'hr-admin' && !!table.switchOn,
    decide,
    can: (s) => decide(s).access !== 'hidden',
  }
}

/** The sample in a mode, with a stand-in access and the filters given. */
export function drillContext(
  mode: Mode = 'hr-admin',
  opts: { filters?: Filters; showPay?: boolean; access?: AccessTable } = {},
): AnalyticsContext {
  const sample = drillSample()
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: sample.datasets[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
  const ctx = buildContext({
    data: sample.datasets,
    sources,
    filters: opts.filters ?? DEFAULT_FILTERS,
    asOfOverride: null,
    today: SAMPLE_AS_OF,
    mode,
    plan: sample.plan,
    showPay: !!opts.showPay,
  })
  return { ...ctx, access: standInAccess(ctx.access, mode, { ...opts.access, switchOn: !!opts.showPay }) }
}
