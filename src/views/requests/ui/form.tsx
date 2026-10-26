/**
 * The Requests forms' small controls (docs/PLAN.md 9.4, 14.3): a labelled field, a native select, a
 * text box with the free-text hint, the refusal line and a list of what a form still needs. Quiet
 * controls on the sheet: hairline inset borders and the 4px control radius, as the rest of the app.
 * Ids come from React's `useId` (never a literal), so two forms on one page never share one.
 */
import { type ReactNode, useId } from 'react'
import { IconWarning } from '@/components/icons'
import { cx } from '@/components/ui'

export const INPUT =
  'h-8 w-full min-w-0 rounded-control bg-sheet px-2 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none placeholder:text-muted disabled:opacity-45'
export const TEXTAREA =
  'min-h-[72px] w-full resize-y rounded-control bg-sheet p-2 font-[inherit] text-small leading-snug text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none placeholder:text-muted'

/** A label above its control; the control gets the label's id through the render prop. */
export function Field({
  label,
  hint,
  children,
  className,
  'data-tour': tour,
}: {
  label: string
  hint?: ReactNode
  children: (id: string) => ReactNode
  className?: string
  /** A guided tour's step target (src/help/tours.ts). */
  'data-tour'?: string
}) {
  const id = useId()
  return (
    <div data-tour={tour} className={cx('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-meta font-medium text-ink-2">
        {label}
      </label>
      {children(id)}
      {hint && <span className="text-label text-muted">{hint}</span>}
    </div>
  )
}

export interface Option {
  value: string
  label: string
  disabled?: boolean
}

/** A native select; `placeholder` is the blank first option. */
export function Choice({
  id,
  value,
  options,
  onChange,
  placeholder,
  disabled,
}: {
  id?: string
  value: string | null
  options: readonly Option[]
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <select
      id={id}
      className={INPUT}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.currentTarget.value)}
    >
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/**
 * A small radio group in a fieldset (its legend names it). `disabled` turns the whole group off, as
 * a comment with an amount does to its audience (8.4 rule 5: always Approvers only).
 */
export function RadioChoice<T extends string>({
  legend,
  value,
  options,
  onChange,
  disabled,
}: {
  legend: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  const name = useId()
  return (
    <fieldset
      disabled={disabled}
      className="flex flex-wrap items-center gap-3 text-small disabled:opacity-60"
    >
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-1.5">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  )
}

/** A refusal in the action's own words, beside the buttons. */
export function Refusal({ text }: { text: string | null | undefined }) {
  if (!text) return null
  return (
    <p role="alert" className="flex items-start gap-1.5 text-small text-ink">
      <IconWarning className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <span>{text}</span>
    </p>
  )
}

/** What a form still needs, one line each. */
export function Missing({ items }: { items: readonly string[] }) {
  if (!items.length) return null
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-small text-ink-2">
      {items.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  )
}

/** A term and its value, for a card's facts. */
export function Facts({ items }: { items: readonly { label: string; value: string }[] }) {
  if (!items.length) return null
  return (
    <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-small">
      {items.map((f) => (
        <div key={f.label} className="contents">
          <dt className="text-ink-2">{f.label}</dt>
          <dd className="min-w-0 break-words text-ink">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Filters options by a typed text (keeps the picked one), for long seat lists. */
export function filterOptions(options: readonly Option[], text: string, keep: string | null): Option[] {
  const t = text.trim().toLowerCase()
  if (!t) return [...options]
  return options.filter((o) => o.value === keep || o.label.toLowerCase().includes(t))
}
