/**
 * The Include / Exclude switch at the top of each org filter's menu (the template app's
 * ModeSwitch.tsx; docs/PLAN.md 9.2): include keeps the chosen values, exclude keeps everything
 * except them.
 */
import { Segmented } from '@/components/ui'
import type { FilterMode } from '@/data/scope'

export function ModeSwitch({
  value,
  onChange,
  label,
  hint,
}: {
  value: FilterMode
  onChange: (mode: FilterMode) => void
  /** The filter's name, for the switch's accessible name: "Location". */
  label: string
  /** What the mode does, in a few words, under the switch. */
  hint: string
}) {
  return (
    <div data-mode-switch="" className="flex items-center gap-2.5 border-b border-rule px-2.5 py-2">
      <Segmented<FilterMode>
        label={`${label}: include or exclude`}
        value={value}
        onChange={onChange}
        options={[
          { value: 'include', label: 'Include' },
          { value: 'exclude', label: 'Exclude' },
        ]}
      />
      <span className="min-w-0 text-meta leading-tight text-muted">{hint}</span>
    </div>
  )
}

/** The hint for a list filter's mode. */
export const listModeHint = (mode: FilterMode): string =>
  mode === 'exclude' ? 'Every seat except the values you pick' : 'Only the values you pick'

/** The hint for the leader filter's mode. */
export const leaderModeHint = (mode: FilterMode): string =>
  mode === 'exclude'
    ? "Every seat except the leader's whole org"
    : "The leader's seat and every seat below it"
