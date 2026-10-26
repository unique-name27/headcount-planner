/**
 * Scope names for copy (docs/PLAN.md 8.2; the template app's label.ts): `scopeName(scope)` is the
 * scope alone ("Priya Raman's team", "Silicon Engineering", "Dana Ito's org"); `scopeLabelOf` is the
 * scope line, with any narrowing after it ("Silicon Engineering, not Munich", "Dana Ito's org, P4").
 * Pure.
 */
import { type FilterDimension, type Filters, isExcluded, LIST_DIMENSIONS } from '@/data/scope'
import type { ScopeLock } from './types'

export const scopeName = (scope: Pick<ScopeLock, 'label'>): string => scope.label

/** "A, B" for up to two values, else "A +2" (the filter row's own rule). */
const listText = (xs: readonly string[]) => (xs.length <= 2 ? xs.join(', ') : `${xs[0]} +${xs.length - 1}`)

/** The filters other than the ones a scope pins, in words: "Bengaluru", "not Munich", "P4". */
function narrowing(
  filters: Filters,
  pinned: readonly FilterDimension[],
  nameOf: (positionId: string) => string | null | undefined,
): string[] {
  const parts: string[] = []
  if (filters.leaderId && !pinned.includes('leaderId')) {
    const name = nameOf(filters.leaderId)
    const text = name ? `${name}'s org` : `the org under ${filters.leaderId}`
    parts.push(isExcluded(filters, 'leaderId') ? `not in ${text}` : text)
  }
  for (const dim of LIST_DIMENSIONS) {
    const xs = filters[dim]
    if (!xs.length || pinned.includes(dim)) continue
    parts.push(isExcluded(filters, dim) ? `not ${listText(xs)}` : listText(xs))
  }
  return parts
}

const withParts = (head: string, parts: readonly string[]): string =>
  parts.length ? `${head}, ${parts.join(', ')}` : head

/** The scope line for a scope and the filters inside it; `nameOf` names a leader seat's holder. */
export function scopeLabelOf(
  scope: ScopeLock,
  filters: Filters,
  nameOf: (positionId: string) => string | null | undefined,
): string {
  if (scope.kind === 'unit') return withParts(scope.label, narrowing(filters, ['businessUnit'], nameOf))
  const atRoot = !!filters.leaderId && scope.rootPositionIds.has(filters.leaderId)
  return withParts(scope.label, narrowing(filters, atRoot ? ['leaderId'] : [], nameOf))
}
