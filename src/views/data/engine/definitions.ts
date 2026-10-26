/**
 * Metric definitions (the template app's dictionary tab): every metric the app registers, with its
 * home view, unit, whether it differs from its defaults and whether it is a locked rule, plus what
 * the detail shows (definition, formula, population, window, owner, settings, target, data used, tier
 * and what changed). Pure: read from `ctx.metrics` (the dictionary with your changes) and the quality
 * index. Editing goes through `@/metrics/overrides` `applyEdit` and the dictionary store (the UI).
 */
import type { Column } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import { TIER_LABEL, type Tier } from '@/data/quality/tier'
import type { RouteView } from '@/data/schema'
import { formatParam } from '@/metrics/params'
import { METRIC_VIEW_LABEL, readsNoData } from '@/metrics/registry'
import type { MetricDef } from '@/metrics/types'
import type { MetricDefinitionRow } from './index'
import { datasetsOfView } from './quality'

/** A definition row with what the list and the detail show beside the frozen fields. */
export interface DefinitionRow extends MetricDefinitionRow {
  [key: string]: unknown
  viewLabel: string
  definition: string
  owner: string | null
  /** Rule, setting, or a number from the data. */
  kind: 'rule' | 'setting' | 'metric'
  /** Calculation settings it has. */
  settings: number
  /** The lowest tier of the fields it reads; null for a rule or setting (they read no data). */
  tier: Tier | null
  tierLabel: string
  changedText: string
}

const kindOf = (d: MetricDef): DefinitionRow['kind'] =>
  d.kind === 'rule' ? 'rule' : d.kind === 'setting' ? 'setting' : readsNoData(d) ? 'rule' : 'metric'

/** Every registered metric, in catalog order. */
export function definitionRows(ctx: Pick<AnalyticsContext, 'metrics' | 'quality'>): DefinitionRow[] {
  return ctx.metrics.list.map((d) => {
    const view = d.views[0] as RouteView
    const reads = !readsNoData(d)
    const tier = reads ? ctx.quality.tierOf(d.uses, datasetsOfView(d.views[0])) : null
    const changed = ctx.metrics.isChanged(d.id)
    return {
      metricId: d.id,
      name: d.name,
      view,
      unit: d.unit,
      changed,
      locked: !!d.locked,
      viewLabel: METRIC_VIEW_LABEL[d.views[0]],
      definition: d.definition,
      owner: d.owner ?? null,
      kind: kindOf(d),
      settings: d.params.length,
      tier,
      tierLabel: tier ? TIER_LABEL[tier] : '',
      changedText: changed ? 'Changed' : '',
    }
  })
}

export const DEFINITION_COLUMNS: readonly Column<DefinitionRow>[] = [
  { key: 'name', label: 'Metric' },
  { key: 'metricId', label: 'Id' },
  { key: 'viewLabel', label: 'View' },
  { key: 'unit', label: 'Unit' },
  { key: 'settings', label: 'Settings', format: 'int' },
  { key: 'tierLabel', label: 'Tier' },
  { key: 'changedText', label: 'Changed from defaults' },
]

/** One setting of a metric as the detail shows it: its value and default in words. */
export interface SettingRow {
  key: string
  label: string
  description: string
  value: string
  defaultValue: string
  changed: boolean
  /** Raise only, or locked. */
  locked: 'raiseOnly' | true | null
}

/** The settings of one metric, worded with their units. */
export function settingRows(ctx: Pick<AnalyticsContext, 'metrics'>, metricId: string): SettingRow[] {
  const def = ctx.metrics.def(metricId)
  const base = ctx.metrics.defaultDef(metricId)
  if (!def) return []
  return def.params.map((p) => {
    const value = ctx.metrics.param(metricId, p.key)
    const fallback = base?.params.find((x) => x.key === p.key)?.default ?? p.default
    return {
      key: p.key,
      label: p.label,
      description: p.description,
      value: formatParam(p, value),
      defaultValue: formatParam(p, fallback),
      changed: JSON.stringify(value) !== JSON.stringify(fallback),
      locked: p.locked ?? null,
    }
  })
}
