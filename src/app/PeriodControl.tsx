/**
 * The reporting period (the template app's PeriodControl.tsx, with fiscal presets, docs/PLAN.md
 * 9.2): Fiscal year (the default, the as-of date's fiscal year), Year to date, Quarter to date and
 * Month as rows, each with the exact dates it covers, and a custom range with two native date
 * inputs behind a hairline. In HRBP and Leader mode cost shows only for the fiscal year, year to
 * date and quarter to date, which end at the last closed month-end; the menu says so, and the
 * cost guard (src/cost/fit.ts) holds it in the numbers.
 */
import { Popover } from '@base-ui/react/popover'
import { useState } from 'react'
import { roundedIn } from '@/access/pay'
import { IconCheck } from '@/components/icons'
import { POPUP_SURFACE } from '@/components/styles'
import { Button, cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { PERIOD_LABELS, type PeriodPreset, periodWindow } from '@/data/scope'
import { useStore } from '@/data/store'
import { lastCloseDate } from '@/plan/engine/close'
import { customRangeError, shortRange } from './filterOptions'

const PRESETS: readonly Exclude<PeriodPreset, 'custom'>[] = ['fy', 'ytd', 'qtd', 'month']

/** The rounded modes' period line (docs/PLAN.md 7.3b). */
export const ROUNDED_PERIOD_HINT = 'Cost shows for the fiscal year, year to date and quarter to date.'

const DATE_INPUT =
  'h-8 w-full min-w-0 rounded-control bg-sheet px-2 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]'

export function PeriodControl() {
  const ctx = useAnalytics()
  const filters = useStore((s) => s.filters)
  const setFilters = useStore((s) => s.setFilters)
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState({ start: ctx.window.start, end: ctx.window.end, editing: false })
  const error = customRangeError(custom.start, custom.end, ctx.asOf)
  const isCustom = filters.period === 'custom'
  const showCustom = isCustom || custom.editing
  const rounded = roundedIn(ctx.access.mode, ctx.access.switchOn)
  // Year to date and quarter to date end at the last close in the rounded modes (docs/PLAN.md 9.2).
  const closedThrough = rounded ? lastCloseDate(ctx.plan?.closes ?? []) : null
  const label = isCustom ? ctx.window.label : PERIOD_LABELS[filters.period]

  const onOpenChange = (next: boolean) => {
    if (next) setCustom({ start: ctx.window.start, end: ctx.window.end, editing: false })
    setOpen(next)
  }
  const pick = (p: PeriodPreset) => {
    setFilters({ period: p })
    setOpen(false)
  }
  const apply = () => {
    if (error) return
    setFilters({ period: 'custom', customStart: custom.start, customEnd: custom.end })
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        render={
          <Button caret data-tour="filter-period" aria-label={`Period: ${label}`}>
            {label}
          </Button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner align="start" sideOffset={6} collisionPadding={16} className="z-50 outline-none">
          <Popover.Popup className={cx(POPUP_SURFACE, 'w-[300px] max-w-[calc(100vw-32px)] py-1')}>
            <Popover.Title className="eyebrow px-3 pt-2 pb-1">Reporting period</Popover.Title>
            <ul aria-label="Reporting period">
              {[...PRESETS, 'custom' as const].map((p) => {
                const checked = p === 'custom' ? showCustom : !showCustom && filters.period === p
                const w =
                  p === 'custom'
                    ? null
                    : periodWindow(p, ctx.asOf, {
                        closedThrough,
                        fiscalYear: ctx.version?.fiscalYear ?? null,
                      })
                return (
                  <li key={p}>
                    <button
                      type="button"
                      aria-pressed={checked}
                      onClick={() => (p === 'custom' ? setCustom({ ...custom, editing: true }) : pick(p))}
                      className="mx-1 flex w-[calc(100%-8px)] items-center gap-2.5 rounded-chip px-2 py-1.5 text-left text-small hover:bg-hover"
                    >
                      <span className="flex w-4 shrink-0 justify-center">
                        {checked && <IconCheck className="size-4" strokeWidth={2.25} />}
                      </span>
                      <span className={cx('flex-1', checked && 'font-semibold')}>{PERIOD_LABELS[p]}</span>
                      {w && (
                        <span className="tnum text-label text-muted">
                          {w.empty ? 'No closed month yet' : shortRange(w.start, w.end)}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
            {rounded && (
              <p className="border-t border-rule px-3 pt-2 pb-1.5 text-meta text-muted">
                {ROUNDED_PERIOD_HINT}
              </p>
            )}
            {showCustom && (
              <div className="mt-1 border-t border-rule px-3 pt-2.5 pb-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-meta text-ink-2">
                    From
                    <input
                      type="date"
                      value={custom.start}
                      max={custom.end && custom.end < ctx.asOf ? custom.end : ctx.asOf}
                      onChange={(e) => setCustom({ ...custom, start: e.target.value })}
                      className={cx(DATE_INPUT, 'mt-1')}
                    />
                  </label>
                  <label className="text-meta text-ink-2">
                    To
                    <input
                      type="date"
                      value={custom.end}
                      min={custom.start || undefined}
                      max={ctx.asOf}
                      onChange={(e) => setCustom({ ...custom, end: e.target.value })}
                      className={cx(DATE_INPUT, 'mt-1')}
                    />
                  </label>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span role="status" className="text-meta text-bad-text">
                    {error}
                  </span>
                  <Button size="sm" variant="primary" disabled={!!error} onClick={apply}>
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
