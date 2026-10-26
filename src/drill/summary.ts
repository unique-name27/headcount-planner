/**
 * The records panel's Summary: how the positions behind a list split by business unit and by
 * level, so a reader sees at a glance where a list concentrates without sorting it. Pure: groups
 * the rows of a drill table by a field of the position each row names (HCP plans positions, so the
 * Summary reads positions, never people). Rows that name no position (an assumption, a cost group)
 * are left out and counted. Each group keeps the indexes of its rows, so a bar opens exactly those
 * records.
 */
import { LEVEL_LABELS, type Level } from '@/data/schema'
import { fmt, plural } from '@/lib/format'

/** The Summary's count of rows that name no position, in plain words (14.3, review CP-5). */
export const unnamedRowsText = (n: number): string =>
  n === 1 ? '1 row names no position' : `${fmt(n, 'int')} rows name no position`

/** The records panel's copy toast: "Copied 1 row", "Copied 12 rows" (14.3, review CP-5). */
export const copiedRowsText = (n: number): string => `Copied ${plural(n, 'row')}`

/** The fields of a position the Summary groups by. */
export interface SummaryPosition {
  businessUnit?: string | null
  department?: string | null
  level?: string | null
}

export type SummaryField = 'businessUnit' | 'department' | 'level'

export interface SummaryGroup {
  label: string
  count: number
  /** Indexes into the drill's rows. */
  rows: number[]
}

export interface SummaryCut {
  groups: SummaryGroup[]
  /** Rows that name a position in the data. */
  positions: number
  /** Rows left out because they name none. */
  unnamed: number
}

/** Fewest rows naming a position before the Summary shows. */
export const SUMMARY_MIN_ROWS = 10

/**
 * Whether the Summary describes the list: at least ten rows name a position, and they are most of
 * the rows (a list where most rows name nothing would be summarized by the few that do).
 */
export const showsSummary = (cut: Pick<SummaryCut, 'positions' | 'unnamed'>): boolean =>
  cut.positions >= SUMMARY_MIN_ROWS && cut.positions >= cut.unnamed

const labelOf = (field: SummaryField, v: string | null | undefined): string => {
  if (v == null || v === '') return 'Not set'
  return field === 'level' ? (LEVEL_LABELS[v as Level] ?? v) : v
}

/** Group rows by a field of the position each names, largest first (ties by name); "Not set" for blanks. */
export function summaryCut(
  positions: readonly (SummaryPosition | null | undefined)[],
  field: SummaryField,
): SummaryCut {
  const by = new Map<string, number[]>()
  let unnamed = 0
  positions.forEach((p, i) => {
    if (!p) {
      unnamed++
      return
    }
    const label = labelOf(field, p[field])
    const list = by.get(label)
    if (list) list.push(i)
    else by.set(label, [i])
  })
  const groups = [...by.entries()]
    .map(([label, rows]) => ({ label, count: rows.length, rows }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'en', { numeric: true }))
  return { groups, positions: positions.length - unnamed, unnamed }
}

/**
 * The first cut of the Summary: by business unit when the positions span more than one, else by
 * department (an HRBP's unit, a leader's org), so the first figure always splits the list.
 */
export function firstCutField(positions: readonly (SummaryPosition | null | undefined)[]): SummaryField {
  const units = new Set(positions.filter(Boolean).map((p) => p?.businessUnit ?? ''))
  return units.size > 1 ? 'businessUnit' : 'department'
}
