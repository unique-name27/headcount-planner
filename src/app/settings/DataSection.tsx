/**
 * Settings > Data (the template app's DataSection.tsx): the data standard and the reporting date.
 * The section shows only where `settings:data` does (HR admin, docs/PLAN.md 8.3: "The as-of date is
 * set by HR admin."); every other mode reads the date the data gives, and picks the standard in the
 * filter row.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { MedalGlyph } from '@/components/tier/TierBadge'
import { STANDARD_HINT, tierCounts, tierCountsText } from '@/components/tier/tierModel'
import { Button, cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { DATA_STANDARDS, STANDARD_LABEL } from '@/data/quality/tier'
import { EARLIEST_REPORTING_DATE as EARLIEST, isReportingDate } from '@/data/settings'
import { useStore } from '@/data/store'
import { formatDate, isValidDate, todayISO } from '@/lib/dates'
import { Field, INPUT, SettingsBlock } from './ui'

function StandardChoice() {
  const ctx = useAnalytics()
  const standard = useStore((s) => s.dataStandard)
  const setStandard = useStore((s) => s.setDataStandard)
  const name = useId()
  return (
    <fieldset className="flex min-w-0 flex-col">
      <legend className="text-small font-semibold text-ink">Data standard</legend>
      <p className="mt-0.5 mb-2 text-meta leading-snug text-muted">
        The lowest tier a number needs to be shown in any view. {tierCountsText(tierCounts(ctx.quality))}.
      </p>
      {DATA_STANDARDS.map((s) => {
        const id = `${name}-${s}`
        const on = s === standard
        return (
          <label
            key={s}
            htmlFor={id}
            // Rows divided by hairlines (no boxes inside the sheet); the chosen one takes the second tone.
            className={cx(
              'flex cursor-pointer items-start gap-2.5 border-t border-rule px-2 py-2.5 last:border-b hover:bg-hover has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-focus',
              on && 'bg-sheet-2',
            )}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={s}
              checked={on}
              onChange={() => setStandard(s)}
              className="mt-0.5 size-3.5 shrink-0 accent-(--ink)"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-small font-semibold text-ink">
                <MedalGlyph tier={s} />
                {STANDARD_LABEL[s]}
              </span>
              <span className="mt-0.5 block text-meta leading-snug text-ink-2">{STANDARD_HINT[s]}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

/** "Set by you.", the sample's own date, or the latest date in the data. */
export function reportingBasis(override: string | null, isSample: boolean): string {
  if (override) return 'Set by you.'
  return isSample ? 'The sample company’s reporting date.' : 'The latest date in your data, up to today.'
}

function ReportingDate() {
  const ctx = useAnalytics()
  const override = useStore((s) => s.asOfOverride)
  const setOverride = useStore((s) => s.setAsOfOverride)
  const inputId = useId()
  const today = todayISO()
  const [draft, setDraft] = useState(override ?? '')
  const editing = useRef(false)
  // Follow changes made elsewhere (Use the default date, a settings file) unless someone is typing.
  useEffect(() => {
    if (!editing.current) setDraft(override ?? '')
  }, [override])
  const future = isValidDate(draft) && draft > today
  const apply = (v: string) => {
    if (isReportingDate(v, today) && v !== override) setOverride(v)
  }
  return (
    <Field
      label="Reporting date"
      htmlFor={inputId}
      hint={
        <>
          In use: {formatDate(ctx.asOf)}. {reportingBasis(override, ctx.isSample)} Every period, version line
          and headcount is read as of this date.
        </>
      }
    >
      <input
        id={inputId}
        type="date"
        value={draft}
        min={EARLIEST}
        max={today}
        aria-invalid={future || undefined}
        aria-describedby={future ? `${inputId}-error` : undefined}
        onFocus={() => {
          editing.current = true
        }}
        onBlur={() => {
          editing.current = false
          if (!isReportingDate(draft, today)) setDraft(override ?? '')
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          apply(e.target.value)
        }}
        className={cx(INPUT, 'w-44')}
      />
      <Button
        variant="ghost"
        disabled={!override}
        onClick={() => {
          setDraft('')
          setOverride(null)
        }}
      >
        {ctx.isSample ? 'Use the default date' : 'Use the latest date'}
      </Button>
      {future && (
        <p id={`${inputId}-error`} className="w-full text-meta text-bad-text">
          Pick a date on or before today, {formatDate(today)}.
        </p>
      )}
    </Field>
  )
}

export function DataSection() {
  return (
    <SettingsBlock section="data">
      <StandardChoice />
      <ReportingDate />
    </SettingsBlock>
  )
}
