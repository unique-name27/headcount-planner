/**
 * "Learn more" in the KPI and figure info popovers (`help:learn-more`): opens the help article that
 * covers the metric (`articleForMetric`), beside the "Edit definition" link, and closes the popover
 * as Help opens, so one Escape closes Help (the template app's LearnMore.tsx, with its exports and
 * props). It renders nothing when no article covers the metric, when the mode hides that article,
 * and outside the analytics provider, where there is no mode to ask. Its props are frozen
 * (src/charts/Figure.tsx and src/components/KpiStrip.tsx place it). Place it only inside a popover
 * (`Popover` in `@/components/ui`).
 */
import { Popover as BPopover } from '@base-ui/react/popover'
import { cx } from '@/components/ui'
import { useAnalyticsIfAny } from '@/data/context'
import { learnMoreIn } from '../access'
import { LEARN_MORE } from '../copy'
import { openHelp } from '../store'
import { IconHelp } from './IconHelp'

export function LearnMoreLink({
  metricId,
  className,
}: {
  metricId: string | null | undefined
  className?: string
}) {
  // Shown when its article is shown in this mode (../access.ts `learnMoreIn`).
  const access = useAnalyticsIfAny()?.access
  const article = access ? learnMoreIn(access, metricId) : null
  if (!article) return null
  return (
    <BPopover.Close
      aria-haspopup="dialog"
      onClick={() => openHelp(article)}
      className={cx(
        'inline-flex items-center gap-1 rounded-mark text-meta font-medium text-link underline-offset-2 hover:underline',
        className,
      )}
    >
      <IconHelp className="size-3.5" />
      {LEARN_MORE}
    </BPopover.Close>
  )
}
