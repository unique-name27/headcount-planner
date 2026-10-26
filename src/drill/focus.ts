/**
 * Narrowing the scope to a group from anywhere: the records panel's "Filter to" and "Leave out",
 * a position card's "Focus on this org", and findings' "Focus on". Each one closes the records
 * panel, pushes one history entry, and shows a toast with Undo (which steps Back when nothing
 * happened since, else puts the scope back). The records panel hands over the scope it worked out
 * (`groupScopes`); the others merge the group in (`mergeFilter`).
 */
import { customPeriodText, describeFocus, type NameOf } from '@/components/filterLabels'
import { toast } from '@/components/toast'
import { currentEntry } from '@/data/address'
import { type FilterMode, type Filters, PERIOD_LABELS, sameFilters } from '@/data/scope'
import { guardFilters, useStore } from '@/data/store'
import { groupName, mergeFilter, namedScopeLabel } from './filter'
import { useDrillStore } from './store'
import type { DrillFilter } from './types'

export interface FocusOptions {
  /** "include" for Filter to, "exclude" for Leave out; without it, the filter's own modes. */
  mode?: FilterMode
  /** Names a leader position by the person in the seat, for the toast and the new scope's label. */
  nameOf: NameOf
  /** The scope to apply, when the caller worked it out (the records panel); else the merge. */
  next?: Filters
  /** What the group is called on the toast ("Asia Pacific"), when the caller names it. */
  label?: string | null
}

/** The period a filter sets, inside a sentence: "year to date", "Sep 2026", "FY27 Q2". */
function periodInSentence(f: Filters): string {
  if (f.period === 'custom')
    return f.customStart && f.customEnd ? customPeriodText(f.customStart, f.customEnd) : ''
  const label = PERIOD_LABELS[f.period]
  return label.charAt(0).toLowerCase() + label.slice(1)
}

/** Apply a group to the scope as one history entry, with an Undo toast. False when nothing changed. */
export function focusScope(patch: DrillFilter, opts: FocusOptions): boolean {
  const { nameOf } = opts
  const st = useStore.getState()
  const before = st.filters
  // Through the mode's clamp first, so a scope it would undo is "already showing", not a no-op entry.
  const next = guardFilters(opts.next ?? mergeFilter(before, patch, opts.mode))
  useDrillStore.getState().close()
  const name = opts.mode || opts.label ? groupName(patch, nameOf, opts.label) : describeFocus(patch, nameOf)
  if (sameFilters(before, next)) {
    toast(name ? `Already showing ${name}` : 'These filters are already on')
    return false
  }
  st.setFilters(next, { history: 'push' })
  const entry = currentEntry()
  const title = opts.mode === 'exclude' ? `Left out ${name}` : name ? `Showing ${name}` : 'Filters applied'
  const scope = namedScopeLabel(next, patch, nameOf, opts.label).replace(
    /^Whole company/,
    'the whole company',
  )
  // A month or quarter bar changes the period too, which the scope label doesn't say.
  const period = patch.period !== undefined ? periodInSentence(next) : ''
  toast(title, {
    description: `Every view now shows ${scope}${period ? `, ${period}` : ''}.`,
    action: { label: 'Undo', onClick: () => undoFocus(entry, before) },
  })
  return true
}

/** Undo a focus: Back when its history entry is still the one on screen, else the earlier scope as a new entry. */
function undoFocus(entry: number | null, before: Filters): void {
  if (entry != null && currentEntry() === entry && typeof history !== 'undefined') {
    history.back()
    return
  }
  useStore.getState().setFilters(before, { history: 'push' })
}
