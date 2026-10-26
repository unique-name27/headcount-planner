/**
 * The Mode button and its menu (the template app's access/ui ModeButton and ModeMenu; docs/PLAN.md
 * 8.1 and 8.2). The button reads "Manager: Priya Raman", "HRBP: Silicon Engineering", "Leader: Dana
 * Ito", "Finance mode" or "HR admin mode" (`modeButtonLabel`), with the short name under 640px. The
 * menu lists the five modes in their groups (Leaders and managers, HR, Finance), each a radio with
 * its name and one line; the chosen mode shows who it acts as, with "Change who you act as". Under
 * the choices, a rule and `NOT_SECURITY_SHORT`: Acting as is a pick, not sign-in.
 *
 * `ModeChoices` is the grouped radio list alone (Settings > Mode uses it too).
 */
import { Popover as BPopover } from '@base-ui/react/popover'
import { type KeyboardEvent, useId, useRef } from 'react'
import { NOT_SECURITY_SHORT, PICKER_COPY } from '@/access/copy'
import { MODE_GROUPS, MODE_HINT, MODE_LABEL, MODE_SHORT, type Mode, modeButtonLabel } from '@/access/modes'
import { openPicker, useMode } from '@/access/store'
import { IconPeople } from '@/components/icons'
import { Button, cx, Popover } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { actingAsLine } from './copy'

export const MODE_LINK =
  'inline-flex items-center gap-1 rounded-mark text-meta font-medium text-link underline-offset-2 hover:underline'

/**
 * The modes as one radio group in their groups: name and one line each. Arrow keys, Home and End
 * move focus across every choice, groups included; Space, Enter or a click picks. A mode changes the
 * whole app (and a mode without its pick opens the picker), so stepping across modes must not pick
 * every one on the way.
 */
export function ModeChoices({
  onPicked,
  labelledBy,
  showPick = false,
}: {
  onPicked?: () => void
  labelledBy?: string
  /** The Mode menu: the checked choice shows who it acts as and "Change who you act as" under its name. */
  showPick?: boolean
}) {
  const { access } = useAnalytics()
  const mode = useMode((s) => s.mode)
  const setMode = useMode((s) => s.setMode)
  const name = useId()
  const refs = useRef<Partial<Record<Mode, HTMLInputElement | null>>>({})
  // Group order, so the arrow keys follow what the eye reads.
  const ordered = MODE_GROUPS.flatMap((g) => g.modes)

  const pick = (m: Mode) => {
    if (m !== mode) setMode(m)
    onPicked?.()
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>, m: Mode) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      pick(m)
      return
    }
    const i = ordered.indexOf(m)
    const to =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? ordered[(i + 1) % ordered.length]
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? ordered[(i - 1 + ordered.length) % ordered.length]
          : e.key === 'Home'
            ? ordered[0]
            : e.key === 'End'
              ? ordered.at(-1)
              : undefined
    if (!to) return
    // Cancels the native arrow behavior (which would pick), and moves focus instead.
    e.preventDefault()
    refs.current[to]?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : 'Mode'}
      aria-labelledby={labelledBy}
      className="-mx-1 flex flex-col gap-2"
    >
      {MODE_GROUPS.map((g) => (
        <fieldset key={g.key} className="m-0 flex min-w-0 flex-col border-0 p-0">
          <legend className="px-2 pb-0.5 text-label font-medium text-muted">{g.label}</legend>
          {g.modes.map((m) => {
            const checked = m === mode
            // The pick as the page shows it: the context follows the store a moment later after a change.
            const pickName = checked && access.mode === m && !access.unset ? access.actingAs?.name : null
            const withPick = showPick && checked
            return (
              <div key={m}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-control px-2 py-1.5 hover:bg-hover">
                  <input
                    ref={(el) => {
                      refs.current[m] = el
                    }}
                    type="radio"
                    name={name}
                    value={m}
                    checked={checked}
                    onChange={() => pick(m)}
                    onKeyDown={(e) => onKey(e, m)}
                    className="mt-[3px] size-3.5 shrink-0 accent-(--ink)"
                  />
                  <span className="min-w-0">
                    <span
                      className={cx('block text-small text-ink', checked ? 'font-semibold' : 'font-medium')}
                    >
                      {MODE_LABEL[m]}
                    </span>
                    {withPick && pickName ? (
                      <span className="block truncate text-meta leading-snug text-ink">
                        {actingAsLine(pickName)}
                      </span>
                    ) : (
                      <span className="block text-meta leading-snug text-ink-2">{MODE_HINT[m]}</span>
                    )}
                  </span>
                </label>
                {withPick && (
                  // Outside the label, so pressing it never re-picks the radio.
                  <div className="pb-1 pl-8">
                    <button
                      type="button"
                      className={MODE_LINK}
                      onClick={() => {
                        onPicked?.()
                        openPicker(m)
                      }}
                    >
                      {PICKER_COPY[m].change}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </fieldset>
      ))}
    </div>
  )
}

/** The menu's body: eyebrow, the grouped choices and the wording that modes are not security. */
export function ModeMenu({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  return (
    // At most min(80vh, 640px) tall (the popover's 12px padding inside): the choices scroll, the
    // wording stays in view.
    <div className="flex max-h-[calc(min(80vh,640px)-24px)] flex-col">
      <BPopover.Title id={titleId} className="eyebrow pb-1.5">
        Mode
      </BPopover.Title>
      <div className="-mx-1 min-h-0 overflow-y-auto overscroll-contain px-1">
        <ModeChoices onPicked={onClose} labelledBy={titleId} showPick />
      </div>
      <div className="mt-2.5 border-t border-rule pt-2.5">
        <p className="text-meta leading-snug text-muted">{NOT_SECURITY_SHORT}</p>
      </div>
    </div>
  )
}

/** The Mode button: the mode and who it acts as, opening the Mode menu. */
export function ModeButton() {
  // The mode and pick as the page shows them, so the name always belongs to the mode beside it.
  const { access } = useAnalytics()
  const mode = access.mode
  const open = useMode((s) => s.menuOpen)
  const setOpen = useMode((s) => s.setMenuOpen)
  const text = modeButtonLabel(mode, access.unset ? null : access.actingAs)
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      width={380}
      trigger={
        <Button
          data-tour="masthead-mode"
          variant="ghost"
          icon={<IconPeople />}
          caret
          aria-label={`Mode: ${text}`}
          // Phones: the icon and the short name; the caret goes so the masthead keeps one row.
          className="max-sm:px-2 max-sm:[&>svg:last-child]:hidden"
        >
          <span className="max-w-[220px] truncate max-sm:hidden">{text}</span>
          <span className="sm:hidden">{MODE_SHORT[mode]}</span>
        </Button>
      }
    >
      <ModeMenu onClose={() => setOpen(false)} />
    </Popover>
  )
}
