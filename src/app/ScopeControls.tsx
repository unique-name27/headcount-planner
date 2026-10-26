/**
 * The filter row's controls for a scope (the template app's ScopeControls.tsx): the business unit
 * HRBP mode keeps (the pin, "Business unit: Silicon Engineering", no menu: pressing it opens the
 * Acting as picker), and the button a scoped mode shows before its pick is made ("Leader: No manager
 * picked"), which opens the picker.
 */
import { NO_PICK_LABEL, PICKER_COPY } from '@/access/copy'
import type { Mode } from '@/access/modes'
import { openPicker } from '@/access/store'
import { IconPin } from '@/components/icons'
import { Button, Tip } from '@/components/ui'

/**
 * A filter the mode keeps fixed, with no menu: the pin, its name and value, and why on hover and
 * focus. Pressing it opens the Acting as picker, the same as the Mode menu's "Change who you act as".
 */
export function PinnedFilter({
  mode,
  label,
  value,
  tip,
}: {
  mode: Mode
  label: string
  value: string
  tip: string
}) {
  return (
    <Tip content={tip}>
      <Button
        icon={<IconPin className="text-muted" />}
        aria-label={`${label}: ${value}. ${PICKER_COPY[mode].change}`}
        onClick={() => openPicker(mode)}
      >
        <span className="flex max-w-[240px] min-w-0 items-baseline gap-1">
          <span className="font-normal text-muted">{label}</span>
          <span className="truncate text-ink">{value}</span>
        </span>
      </Button>
    </Tip>
  )
}

/** A scoped mode before its pick: the pinned filter reads "No manager picked" and opens the picker. */
export function NoPickButton({ mode, label }: { mode: Mode; label: string }) {
  const none = NO_PICK_LABEL[mode]
  return (
    <Button
      data-tour={mode === 'manager' || mode === 'leader' ? 'filter-leader' : undefined}
      icon={<IconPin className="text-muted" />}
      aria-label={`${label}: ${none}. ${PICKER_COPY[mode].title}`}
      onClick={() => openPicker(mode)}
    >
      <span className="flex items-baseline gap-1">
        <span className="font-normal text-muted">{label}</span>
        <span className="text-ink">{none}</span>
      </span>
    </Button>
  )
}
