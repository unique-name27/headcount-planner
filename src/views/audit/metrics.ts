/**
 * The Audit page's metric ids (docs/PLAN.md 12): every id whose home page is `audit`,
 * in the plan's order. Frozen in M1: names and ids never change. The metrics builder fills `metrics`
 * with one MetricDef per id (wording, formula, population, window, unit, uses and settings), and the
 * page's engine reads ids and settings from here, never as string literals.
 *
 * The catalog imports this file, so it stays plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or '@/metrics/testing'.
 */
import { defineMetrics } from '@/metrics/define'
import type { MetricDef } from '@/metrics/types'
import { OWNER } from '@/metrics/wording'

/** Every metric id the page registers, by role. */
export const ID = {
  entriesCount: 'audit.entries.count',
} as const

export type AuditMetricId = (typeof ID)[keyof typeof ID]

/** The page's dictionary entries, one per id in `ID`. */
export const metrics: MetricDef[] = defineMetrics('audit', [
  {
    id: ID.entriesCount,
    name: 'Audit entries',
    definition:
      'Entries in the audit log that you can see: each change to a position, request, version, assumption, target, freeze, cycle, month close, transfer or workspace file, with who made it, in which mode and when. Each entry carries a checksum of the one before it, so damage shows.',
    formula: 'count of audit entries shown',
    population: 'Entries about positions, requests and plans in scope, as each is shown to you.',
    window: 'Every entry since the plan began, or the dates picked.',
    unit: 'int',
    goodDirection: null,
    uses: [],
    owner: OWNER.analytics,
  },
])
