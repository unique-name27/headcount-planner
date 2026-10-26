/**
 * The first-visit welcome on each mode's home (the template app's WelcomeCard.tsx): one quiet line
 * under the page header with the mode's first tour and "Not now" as ghost buttons (no card, no ink
 * button), from `welcomeFor` (src/help/welcome.ts).
 *
 *  - HR admin, on the Data room (`variant="admin"`): "New to Headcount Planner?" and "Getting started".
 *  - Manager, on My team (`variant="team"`): "New to My team?" and "Getting started with your home".
 *  - HRBP, Leader and Finance, on Home (`variant="home"`): "New to HRBP mode?" and the same tour.
 *
 * It reads the live mode (the Mode button's): a page drawn in another mode (an off-screen whole-view
 * export) has none. Dismissing it, or finishing its tour in that mode, is remembered in this browser,
 * each mode's line on its own. It never opens on its own as a modal. "Not now" moves focus to the
 * Help button, where the tour can be taken later.
 */
import { useMode } from '@/access/store'
import { Button, cx } from '@/components/ui'
import { useAnalyticsIfAny } from '@/data/context'
import { tourShown } from '../access'
import { NOT_NOW } from '../copy'
import { startTour, useHelp, welcomeDismissed } from '../store'
import { type WelcomeVariant, welcomeFor } from '../welcome'
import { IconHelp } from './IconHelp'
import { helpTrigger } from './refs'

export function WelcomeCard({ className, variant }: { className?: string; variant: WelcomeVariant }) {
  const access = useAnalyticsIfAny()?.access
  const liveMode = useMode((s) => s.mode)
  const found = welcomeFor(variant, access?.mode, liveMode)
  // Its tour must be one the mode runs; outside the analytics provider there is no mode to ask.
  const copy = found && access && tourShown(access, found.tour) ? found : null
  const dismissed = useHelp((s) => (copy ? welcomeDismissed(s.prefs, copy.line) : true))
  const dismiss = useHelp((s) => s.dismissWelcome)
  if (!copy || dismissed) return null
  const titleId = `hcp-welcome-title-${variant}`
  return (
    // One quiet line under the page header, not a card: the page's numbers stay first.
    <section
      aria-labelledby={titleId}
      data-tour="welcome-card"
      className={cx(
        'col-span-full flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-2',
        className,
      )}
    >
      <IconHelp className="size-4 shrink-0 text-muted" />
      <h2 id={titleId} className="font-medium text-ink">
        {copy.title}
      </h2>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          dismiss(copy.line)
          startTour(copy.tour)
        }}
      >
        {copy.take}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          dismiss(copy.line)
          // The line goes away; Help is where the tour lives from now on.
          helpTrigger.current?.focus()
        }}
      >
        {NOT_NOW}
      </Button>
    </section>
  )
}
