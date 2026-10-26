/**
 * The two ways a number reaches its dictionary entry (the template app's EditDefinition.tsx, with its
 * exports and props): "Edit definition" at the foot of a KPI's info popover or a figure's Definitions
 * datasheet (or "Open in Metric definitions" for a locked rule), shown where `ui:edit-definition` is;
 * and the quiet "Definition changed" mark on a tile, figure or finding whose metric differs from its
 * defaults (linking to `#data.metrics` only where `page:data` shows). Rendered by KpiStrip, Figure and
 * Readout. Outside an analytics context (a static render) both render nothing.
 */
import type { MouseEvent, ReactNode } from 'react'
import { IconPencil } from '@/components/icons'
import { cx, Tip } from '@/components/ui'
import { useAnalyticsIfAny } from '@/data/context'
import { behindText } from '../behind'
import { metricHref, openMetricDefinition } from '../open'

const follow = (metricId: string) => (e: MouseEvent<HTMLAnchorElement>) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  openMetricDefinition(metricId)
}

/** "Edit definition" (or "Open in Metric definitions" for a locked rule); nothing when the id is not registered. */
export function EditDefinitionLink({
  metricId,
  className,
}: {
  metricId: string
  className?: string
}): ReactNode {
  const ctx = useAnalyticsIfAny()
  const def = ctx?.metrics.def(metricId)
  // The dictionary is in the Data room, which only HR admin shows (docs/PLAN.md 8.3).
  if (!ctx || !def || !ctx.access.can('ui:edit-definition') || !ctx.access.can('page:data')) return null
  return (
    <a
      href={metricHref(metricId)}
      onClick={follow(metricId)}
      className={cx(
        'inline-flex items-center gap-1 rounded-mark text-meta font-medium text-link underline-offset-2 hover:underline',
        className,
      )}
    >
      <IconPencil className="size-3.5" />
      {def.locked ? 'Open in Metric definitions' : 'Edit definition'}
    </a>
  )
}

/** "Definition changed" when the number is calculated or judged differently from the defaults. */
export function DefinitionChangedMark({
  metricId,
  className,
}: {
  metricId: string
  className?: string
}): ReactNode {
  const ctx = useAnalyticsIfAny()
  const text = ctx ? behindText(ctx.metrics, metricId) : null
  if (!ctx || !text) return null
  const look = cx(
    'relative z-10 inline-flex h-5 shrink-0 items-center gap-1 rounded-chip px-1 text-label font-medium whitespace-nowrap text-ink-2',
    className,
  )
  // Where the Data room is not shown, the mark says what changed but links nowhere.
  if (!ctx.access.can('page:data'))
    return (
      <Tip
        content={
          <span className="block">
            <span className="font-semibold">Definition changed.</span> {text.sentences.join(' ')}
          </span>
        }
      >
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: the tooltip with what changed opens on focus */}
        <span tabIndex={0} className={look}>
          <IconPencil className="size-3 text-warning" />
          Definition changed
          <span className="sr-only">: {text.short}.</span>
        </span>
      </Tip>
    )
  return (
    <Tip
      content={
        <span className="block">
          <span className="font-semibold">Definition changed.</span> {text.sentences.join(' ')} Opens it in
          Metric definitions.
        </span>
      }
    >
      <a
        href={metricHref(metricId)}
        onClick={follow(metricId)}
        className={cx(look, 'hover:bg-hover hover:text-ink')}
      >
        <IconPencil className="size-3 text-warning" />
        Definition changed
        <span className="sr-only">: {text.short}. Open it in Metric definitions.</span>
      </a>
    </Tip>
  )
}
