/**
 * The small form kit Plan's write dialogs share (seat edits on Plan > Positions, transfers on Plan >
 * Transfers): a labelled field, the input, select and text area styles, a filtered pick list, and the
 * line that shows a refusal beside the buttons. Presentation only: every choice and every value a form
 * starts from comes from the engine's models (../engine/edits.ts).
 */
import { type ReactNode, useId } from 'react'
import { cx } from '@/components'

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
  placeholder,
}: {
  id: string
  value: T | ''
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <select
      id={id}
      className={INPUT}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.currentTarget.value as T)}
    >
      {placeholder !== undefined && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** The options whose label holds every word of the filter (case-insensitive), at most `max`, the picked one kept. */
export function filterOptions<T extends { value: string; label: string }>(
  options: readonly T[],
  filter: string,
  picked: string,
  max = 200,
): T[] {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean)
  const hits = words.length
    ? options.filter((o) => words.every((w) => o.label.toLowerCase().includes(w)))
    : [...options]
  const out = hits.slice(0, max)
  const keep = options.find((o) => o.value === picked)
  if (keep && !out.includes(keep)) out.unshift(keep)
  return out
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
