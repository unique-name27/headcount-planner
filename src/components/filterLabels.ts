/**
 * Plain-English labels for filters: the removable chips under the filter row and the "Focus on …"
 * buttons in readouts. Pure.
 *
 * The leader filter holds a position ID (docs/PLAN.md 9.2), never a name: its label names the person
 * in that seat ("Dana Ito's org", `NameOf`), else the position ("The org under P-1001"). Periods are
 * fiscal: a custom period that is one whole month, fiscal quarter or fiscal year reads as one
 * ("Sep 2026", "FY27 Q2", "FY27").
 */

import { fiscalYearOf, fyRange, quarterOf } from '@/data/fiscal'
import { LEVEL_LABELS, type Level } from '@/data/schema'
import {
  type Filters,
  isExcluded,
  LIST_DIMENSIONS,
  type ListDimension,
  PERIOD_LABELS,
  type PeriodPreset,
  withMode,
} from '@/data/scope'
import { formatMonth, formatRange, monthEnd } from '@/lib/dates'

type ListKey = ListDimension
const LIST_KEYS: readonly ListKey[] = LIST_DIMENSIONS

export const FILTER_DIMENSION_LABELS: Record<ListKey | 'leaderId' | 'period', string> = {
  leaderId: 'Leader',
  businessUnit: 'Business unit',
  department: 'Department',
  costCenter: 'Cost center',
  location: 'Location',
  level: 'Level',
  legalEntity: 'Legal entity',
  country: 'Country',
  currency: 'Currency',
  period: 'Period',
}

/** Resolves a position ID to the name of the person in that seat (undefined when unknown or vacant). */
export type NameOf = (positionId: string) => string | null | undefined

export interface FilterChip {
  id: string
  /** The filter field this chip belongs to. */
  key: ListKey | 'leaderId'
  /** Dimension name, e.g. "Location". */
  dimension: string
  /** Value label, e.g. "Hsinchu" or "Dana Ito's org"; "Not Go-to-Market" or "Not in Dana Ito's org" when excluded. */
  label: string
  /** The value alone, without "Not": "Go-to-Market", "Dana Ito's org" (for the remove button's name). */
  value: string
  /** The filter excludes this value. */
  excluded: boolean
  /** Patch that removes just this value (and the exclude mode with the last one). */
  remove: Partial<Filters>
}

const valueLabel = (key: ListKey, v: string) => (key === 'level' ? (LEVEL_LABELS[v as Level] ?? v) : v)

/** "Dana Ito's org", or "The org under P-1001" when nobody holds the seat. */
export const leaderOrgLabel = (id: string, nameOf: NameOf): string => {
  const name = nameOf(id)
  return name ? `${name}'s org` : `The org under ${id}`
}

/** "Not in Dana Ito's org", or "Not in the org under P-1001" when nobody holds the seat. */
export const leaderExcludedLabel = (id: string, nameOf: NameOf): string => {
  const name = nameOf(id)
  return `Not in ${name ? `${name}'s org` : `the org under ${id}`}`
}

/** One chip per active org-filter value, in filter-row order. Excluded values read "Not Go-to-Market". */
export function filterChips(filters: Filters, nameOf: NameOf): FilterChip[] {
  const chips: FilterChip[] = []
  if (filters.leaderId) {
    const excluded = isExcluded(filters, 'leaderId')
    const org = leaderOrgLabel(filters.leaderId, nameOf)
    chips.push({
      id: `leaderId:${filters.leaderId}`,
      key: 'leaderId',
      dimension: FILTER_DIMENSION_LABELS.leaderId,
      label: excluded ? leaderExcludedLabel(filters.leaderId, nameOf) : org,
      value: org,
      excluded,
      remove: {
        leaderId: null,
        ...(excluded ? { modes: withMode(filters.modes, 'leaderId', 'include') } : {}),
      },
    })
  }
  for (const key of LIST_KEYS) {
    const excluded = isExcluded(filters, key)
    for (const v of filters[key]) {
      const rest = filters[key].filter((x) => x !== v)
      chips.push({
        id: `${key}:${v}`,
        key,
        dimension: FILTER_DIMENSION_LABELS[key],
        label: excluded ? `Not ${valueLabel(key, v)}` : valueLabel(key, v),
        value: valueLabel(key, v),
        excluded,
        // The last excluded value takes the exclude mode with it, as the address does.
        remove:
          excluded && !rest.length
            ? { [key]: rest, modes: withMode(filters.modes, key, 'include') }
            : { [key]: rest },
      })
    }
  }
  return chips
}

/** True when anything differs from the default (period included), i.e. "Reset" has work to do. */
export function isFiltered(filters: Filters): boolean {
  return filters.period !== 'fy' || !!filters.leaderId || LIST_KEYS.some((k) => filters[k].length > 0)
}

/**
 * Short description of a filter patch for a "Focus on …" button: "Hsinchu",
 * "Dana Ito's org · Design verification", "Year to date", "Sep 2026". Empty when the patch sets
 * nothing. A dimension the patch excludes reads "not Go-to-Market" (`modes`), so "Leave out"
 * describes the group it leaves out the same way.
 */
export function describeFocus(patch: Partial<Filters>, nameOf: NameOf): string {
  const parts: string[] = []
  const not = (key: ListKey | 'leaderId', text: string) =>
    isExcluded(patch, key) ? (key === 'leaderId' ? `not in ${lowerOrg(text)}` : `not ${text}`) : text
  if (patch.leaderId) parts.push(not('leaderId', leaderOrgLabel(patch.leaderId, nameOf)))
  for (const key of LIST_KEYS) {
    const xs = patch[key]
    if (!xs?.length) continue
    const labels = xs.map((v) => valueLabel(key, v))
    parts.push(not(key, labels.length <= 2 ? labels.join(', ') : `${labels[0]} +${labels.length - 1}`))
  }
  if (patch.period === 'custom') {
    if (patch.customStart && patch.customEnd) parts.push(customPeriodText(patch.customStart, patch.customEnd))
  } else if (patch.period) parts.push(PERIOD_LABELS[patch.period as PeriodPreset])
  return parts.join(' · ')
}

/** "The org under P-1001" inside a sentence. */
const lowerOrg = (text: string): string => (text.startsWith('The org under') ? `t${text.slice(1)}` : text)

/**
 * A custom period in words: "Sep 2026" for a whole month, "FY27 Q2" for a whole fiscal quarter,
 * "FY27" for a whole fiscal year (as the figures write them), else the dates.
 */
export function customPeriodText(start: string, end: string): string {
  if (start.slice(8) === '01' && monthEnd(start) === end) return formatMonth(start)
  const q = quarterOf(start)
  if (q.start === start && q.end === end) return q.label
  const fy = fiscalYearOf(start)
  const range = fyRange(fy)
  if (range.start === start && range.end === end) return fy
  return formatRange(start, end)
}
