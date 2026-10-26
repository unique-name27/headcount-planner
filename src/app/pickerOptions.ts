/**
 * What the version and comparison pickers offer (docs/PLAN.md 9.2). Pure, from the context.
 *
 * - Version (`ver`): every plan version, fiscal year by fiscal year, each year's Working first, then
 *   its locked versions by lock date, then a retired Working ("Replaced"). The default is the as-of
 *   date's fiscal year's Working, and picking it clears `ver` (defaults are left out of the address).
 * - Comparison (`vs`): the target and the locked versions of the shown version's fiscal year only;
 *   cross-year comparisons are not offered. The mode's default (`COMPARE_DEFAULT`: Finance's Budget,
 *   everyone else's plan of record, the target for a year with no locked version) is marked, and
 *   picking it clears `vs`.
 */
import {
  type AnalyticsContext,
  pickCatalog,
  resolveCompare,
  targetCompareLabel,
  versionCompareLabel,
} from '@/data/context'
import { comparisonChoices, shownVersion, TARGET_COMPARE } from '@/data/urlScope'
import { formatDate } from '@/lib/dates'
import type { AnyVersion, LockedVersion } from '@/plan/types'

export interface PickOption {
  /** What picking it stores: an ID, or null for the default. */
  id: string | null
  /** The version's or comparison's name. */
  label: string
  /** A muted word beside it: "Working", "Locked 20 Mar 2026", "Default". */
  hint: string
  /** The fiscal year it belongs to, for the menu's headings. */
  group: string
  selected: boolean
  isDefault: boolean
}

type PickContext = Pick<AnalyticsContext, 'versions' | 'version' | 'asOf' | 'picks' | 'compare' | 'mode'>

const STATE_RANK: Record<AnyVersion['state'], number> = { working: 0, locked: 1, retired: 2 }

const versionHint = (v: AnyVersion): string =>
  v.state === 'working' ? 'Working' : v.state === 'retired' ? 'Replaced' : `Locked ${formatDate(v.lockedAt)}`

/** The version picker's options, in order. */
export function versionOptions(ctx: PickContext): PickOption[] {
  const catalog = pickCatalog(ctx.versions, ctx.asOf)
  const fallback = shownVersion({ version: null }, catalog)?.versionId ?? null
  const shown = ctx.version?.versionId ?? null
  return [...ctx.versions]
    .sort(
      (a, b) =>
        a.fiscalYear.localeCompare(b.fiscalYear) ||
        STATE_RANK[a.state] - STATE_RANK[b.state] ||
        (a.lockedAt ?? '').localeCompare(b.lockedAt ?? '') ||
        a.name.localeCompare(b.name),
    )
    .map((v) => {
      const isDefault = v.versionId === fallback
      return {
        id: isDefault ? null : v.versionId,
        label: v.name,
        hint: isDefault ? `${versionHint(v)}, default` : versionHint(v),
        group: v.fiscalYear,
        selected: v.versionId === shown,
        isDefault,
      }
    })
}

/** The comparison picker's options for the version shown, in order: the target, then locked versions. */
export function comparisonOptions(ctx: PickContext): PickOption[] {
  const catalog = pickCatalog(ctx.versions, ctx.asOf)
  const shown = shownVersion({ version: ctx.picks.version }, catalog)
  const fiscalYear = shown?.fiscalYear ?? catalog.fiscalYear
  const fallback = resolveCompare(
    ctx.mode,
    { version: ctx.picks.version, compare: null },
    catalog,
    ctx.versions,
  )
  const fallbackId = fallback.kind === 'target' ? TARGET_COMPARE : fallback.versionId
  const current = ctx.compare.kind === 'target' ? TARGET_COMPARE : ctx.compare.versionId
  const byId = new Map(ctx.versions.map((v) => [v.versionId, v]))
  return comparisonChoices(shown, catalog).map((id) => {
    const v = id === TARGET_COMPARE ? null : (byId.get(id) as LockedVersion | undefined)
    const isDefault = id === fallbackId
    const label = v ? versionCompareLabel(v, ctx.versions) : targetCompareLabel(fiscalYear)
    return {
      id: isDefault ? null : id,
      label,
      hint: isDefault
        ? 'Default'
        : v
          ? `Locked ${formatDate(v.lockedAt)}`
          : 'Heads and cost at the target date',
      group: fiscalYear,
      selected: id === current,
      isDefault,
    }
  })
}

/**
 * The pickers after a new version is picked: the comparison stays when the new version's fiscal
 * year offers it, else it goes back to the mode's default.
 */
export function picksForVersion(
  ctx: Pick<AnalyticsContext, 'versions' | 'asOf'>,
  current: { compare: string | null },
  version: string | null,
): { version: string | null; compare: string | null } {
  if (current.compare == null) return { version, compare: null }
  const catalog = pickCatalog(ctx.versions, ctx.asOf)
  const offered = comparisonChoices(shownVersion({ version }, catalog), catalog)
  return { version, compare: offered.includes(current.compare) ? current.compare : null }
}
