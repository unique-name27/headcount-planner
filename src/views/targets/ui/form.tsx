/**
 * The small form kit the Targets tabs' change dialogs share (Gap: set a target; Sub-org targets:
 * split and move), the same as Finance's (a view never imports another view's ui/): a labelled
 * field, the input, select and text area styles, the bar of buttons above a tab's tables, the line
 * that shows a refusal beside the buttons, and `useSave`, which runs an action
 * through the app's write hook (src/app/write/usePlanWrite.ts) and shows its notice as a toast.
 * Presentation only: every choice and starting value a form shows comes from the tab's model
 * (../engine/writes.ts), and every action checks the policy, the person and its own rule again.
 */
import { type ReactNode, useId, useState } from 'react'
import { usePlanWrite } from '@/app/write/usePlanWrite'
import { WriteBlocked } from '@/app/write/WriteBlocked'
import { cx, spanClass, toast } from '@/components'
import type { ActionInput, ActionName } from '@/plan/actions'
import type { WriteAccess } from '@/views/finance/engine'

export const INPUT =
  'h-8 w-full min-w-0 rounded-control bg-sheet px-2 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)] disabled:opacity-45'

export const TEXTAREA =
  'min-h-[72px] w-full min-w-0 rounded-control bg-sheet px-2 py-1.5 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]'

/** A label above its control, with an optional muted hint below. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  children: (id: string) => ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-meta font-medium text-ink-2">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-meta text-muted">{hint}</p>}
    </div>
  )
}

/** A select over a model's choices (value and label). */
export function Choice<T extends string>({
  id,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string
  value: T | ''
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <select
      id={id}
      className={INPUT}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.currentTarget.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** A refusal in the action's own words, beside the buttons (or nothing). */
export function Refusal({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p role="alert" className="mr-auto self-center text-meta text-bad-text">
      {text}
    </p>
  )
}

/**
 * The bar of change buttons above a tab's tables, with the write lock's note ("Read only: ..." or
 * "Pick who you act as ...") and the policy's words where the mode limits a change. Renders nothing
 * when the mode offers no change on the tab.
 */
export function ChangeBar({ accesses, children }: { accesses: readonly WriteAccess[]; children: ReactNode }) {
  const write = usePlanWrite()
  if (!accesses.some((a) => a.shown)) return null
  const notes = [...new Set(accesses.filter((a) => a.shown && a.note).map((a) => a.note as string))]
  return (
    <div className={cx(spanClass(12), 'flex flex-wrap items-center gap-2')}>
      {children}
      <WriteBlocked blocked={write.blocked} />
      {!write.blocked && notes.length > 0 && <span className="text-meta text-ink-2">{notes.join(' ')}</span>}
    </div>
  )
}

/** Runs an action through the write hook: the notice as a toast, the refusal kept for the dialog. */
export function useSave() {
  const write = usePlanWrite()
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  async function save<N extends ActionName>(
    name: N,
    input: ActionInput<N>,
    done?: () => void,
  ): Promise<boolean> {
    setBusy(true)
    setRefused(null)
    const out = await write.run(name, input)
    setBusy(false)
    if (out.ok) {
      toast(out.notice, { tone: 'good' })
      done?.()
      return true
    }
    setRefused(out.refused)
    return false
  }
  return { blocked: write.blocked, can: write.can, busy, refused, setRefused, save }
}
