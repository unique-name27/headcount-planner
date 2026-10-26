/**
 * The version and comparison pickers beside the view's title (docs/PLAN.md 9.1 and 9.2): which
 * version the view shows (`ver`), and what every "vs" figure compares with (`vs`). They are pickers,
 * not filters: never clamped by a mode, kept in this tab's address only, and an unknown or
 * cross-year value resets to the default. Each follows its `filter:version` or `filter:compare`
 * decision.
 */

import { IconCheck } from '@/components/icons'
import { Button, Menu, type MenuItem } from '@/components/ui'
import { compareDeltaLabel, useAnalytics } from '@/data/context'
import { useStore } from '@/data/store'
import { comparisonOptions, type PickOption, picksForVersion, versionOptions } from './pickerOptions'

/** Menu items for picker options, with a heading per fiscal year when there is more than one. */
function itemsOf(
  options: readonly PickOption[],
  onPick: (o: PickOption) => void,
  heading?: string,
): MenuItem[] {
  const groups = [...new Set(options.map((o) => o.group))]
  const items: MenuItem[] = heading ? [{ heading }] : []
  for (const g of groups) {
    if (groups.length > 1) items.push({ heading: g })
    for (const o of options.filter((x) => x.group === g))
      items.push({
        label: o.label,
        hint: o.hint,
        icon: o.selected ? <IconCheck strokeWidth={2.25} /> : undefined,
        onSelect: () => onPick(o),
      })
  }
  return items
}

export function VersionPicker() {
  const ctx = useAnalytics()
  const compare = useStore((s) => s.compare)
  const setPicks = useStore((s) => s.setPicks)
  const options = versionOptions(ctx)
  if (!options.length) return null
  const label = ctx.version?.name ?? 'No version'
  return (
    <Menu
      align="end"
      width={300}
      items={itemsOf(options, (o) => setPicks(picksForVersion(ctx, { compare }, o.id)), 'Version shown')}
      trigger={
        <Button caret data-tour="version-picker" aria-label={`Version: ${label}`}>
          {label}
        </Button>
      }
    />
  )
}

export function ComparisonPicker() {
  const ctx = useAnalytics()
  const setPicks = useStore((s) => s.setPicks)
  const options = comparisonOptions(ctx)
  const label = compareDeltaLabel(ctx.compare)
  return (
    <Menu
      align="end"
      width={320}
      items={itemsOf(options, (o) => setPicks({ compare: o.id }), 'Compare with')}
      trigger={
        <Button caret data-tour="compare-picker" aria-label={`Comparison: ${label}`}>
          {label}
        </Button>
      }
    />
  )
}
