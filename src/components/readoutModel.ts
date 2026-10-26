/**
 * Ordering and export rows for a view's readout. Pure.
 */
import type { Column } from '@/charts/types'
import { TIER_LABEL } from '@/data/quality/tier'
import { isNum, plural } from '@/lib/format'
import type { TierGate } from './tier/tierModel'
import type { Finding, FindingPosition, Severity } from './types'

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

/** The word each severity carries next to its icon (matches StatusPill). */
export const SEVERITY_WORD: Record<Severity, string> = {
  critical: 'Critical',
  warning: 'Watch',
  info: 'Note',
  good: 'Good',
}

/** Critical first, then warnings, notes and good news; original order within a severity. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity] || a.i - b.i)
    .map((x) => x.f)
}

export function severityCounts(findings: readonly Finding[]): Record<Severity, number> {
  const out: Record<Severity, number> = { critical: 0, warning: 0, info: 0, good: 0 }
  for (const f of findings) out[f.severity]++
  return out
}

/** The first `limit` positions and how many are left over ("and 7 more"). */
export function positionsPreview(
  positions: readonly FindingPosition[],
  limit = 5,
): { shown: FindingPosition[]; more: number } {
  return { shown: positions.slice(0, limit), more: Math.max(0, positions.length - limit) }
}

/** How many positions a finding covers: its `positionsTotal` when the list is capped, else the list length. */
export function positionsCount(f: Pick<Finding, 'positions' | 'positionsTotal'>): number | null {
  const listed = f.positions?.length
  if (isNum(f.positionsTotal)) return Math.max(f.positionsTotal, listed ?? 0)
  return listed ?? null
}

/** The positions toggle: "12 positions", or "57 positions (first 50 listed)" when the list is capped. */
export function positionsChipLabel(listed: number, total?: number): string {
  if (isNum(total) && total > listed) return `${plural(total, 'position')} (first ${listed} listed)`
  return plural(listed, 'position')
}

export const READOUT_COLUMNS: Column[] = [
  { key: 'severity', label: 'Severity', format: 'text' },
  { key: 'finding', label: 'Finding', format: 'text' },
  { key: 'detail', label: 'Detail', format: 'text' },
  { key: 'nextStep', label: 'Next step', format: 'text' },
  { key: 'positions', label: 'Positions', format: 'int', align: 'right' },
]

/** The readout table with each finding's tier after the finding. */
export const READOUT_COLUMNS_WITH_TIER: Column[] = [
  ...READOUT_COLUMNS.slice(0, 2),
  { key: 'tier', label: 'Tier', format: 'text' },
  ...READOUT_COLUMNS.slice(2),
]

/**
 * Export rows in on-screen order. Positions are counted, not listed (docs/PLAN.md 9.5: findings
 * name positions, never people). With `gateOf`, each row carries the finding's tier (pass only the
 * findings the data standard shows).
 */
export function readoutRows(
  findings: readonly Finding[],
  gateOf?: (f: Finding) => TierGate | null,
): Record<string, unknown>[] {
  return sortFindings(findings).map((f) => {
    const row: Record<string, unknown> = {
      severity: SEVERITY_WORD[f.severity],
      finding: f.title,
      detail: f.detail ?? '',
      nextStep: f.action ?? '',
      positions: positionsCount(f),
    }
    if (gateOf) {
      const g = gateOf(f)
      row.tier = g ? TIER_LABEL[g.tier] : ''
    }
    return row
  })
}

/**
 * A label as it reads inside a sentence ("Open drivers"): the first letter is lowered only when
 * the second is lowercase, so acronyms and names keep their case ("Open HR transactions").
 */
export function labelInSentence(label: string): string {
  if (label.length < 2 || !/\p{Ll}/u.test(label[1])) return label
  return label[0].toLowerCase() + label.slice(1)
}
