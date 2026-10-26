/**
 * The Action center's settings, read through the metric dictionary (never as constants), so a
 * changed snooze length or look-ahead applies everywhere at once (the template app's settings.ts).
 *
 * The catalog holds the Action center's entries (src/metrics/catalog.ts), so the value in force wins;
 * a dictionary that does not hold them (a test's own) answers with the entries' own defaults
 * (`metrics` in ../metrics.ts), so the page and the masthead count work either way.
 */
import type { MetricsApi } from '@/metrics/types'
import { metrics, PARAM } from '../metrics'

export interface ActionSettings {
  /** How many days Snooze hides an item. */
  snoozeDays: number
  /** How many days after the as-of date count as due soon. */
  dueSoonDays: number
  /** How many days overdue an item a person waits on can be before it is critical. */
  blockedDays: number
}

type Ref = { metricId: string; key: string }

/** The registered default of a setting (../metrics.ts), for a dictionary that does not hold it yet. */
function defaultOf(ref: Ref): number {
  const p = metrics.find((d) => d.id === ref.metricId)?.params.find((x) => x.key === ref.key)
  if (!p || typeof p.default !== 'number') throw new Error(`No default for ${ref.metricId} ${ref.key}.`)
  return p.default
}

function read(m: Pick<MetricsApi, 'num'> & Partial<Pick<MetricsApi, 'paramDef'>>, ref: Ref): number {
  if (m.paramDef && !m.paramDef(ref.metricId, ref.key)) return defaultOf(ref)
  return m.num(ref.metricId, ref.key)
}

export function settingsOf(
  m: Pick<MetricsApi, 'num'> & Partial<Pick<MetricsApi, 'paramDef'>>,
): ActionSettings {
  return {
    snoozeDays: read(m, PARAM.snoozeDays),
    dueSoonDays: read(m, PARAM.dueSoonDays),
    blockedDays: read(m, PARAM.blockedDays),
  }
}
