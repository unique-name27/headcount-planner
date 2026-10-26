/**
 * "About this view" (`header:about`): a quiet link in a view or page header that opens the page's
 * help article (`articleForRoute`) in the Help sheet; none where the mode hides that article, and
 * none outside the analytics provider, where there is no mode to ask. It is a way into Help, not a
 * second help system (the template app's AboutViewLink.tsx). The view header and the Data room's
 * page header place it.
 */
import { cx } from '@/components/ui'
import { useAnalyticsIfAny } from '@/data/context'
import type { RouteView } from '@/data/store'
import { ABOUT_THIS_VIEW } from '../copy'
import { aboutArticle } from '../sheet'
import { openHelp } from '../store'
import { IconHelp } from './IconHelp'

export function AboutViewLink({
  view,
  tab = '',
  label = ABOUT_THIS_VIEW,
  className,
}: {
  view: RouteView
  tab?: string
  label?: string
  className?: string
}) {
  // Follows the view's article: none where the mode hides it (../sheet.ts `aboutArticle`).
  const access = useAnalyticsIfAny()?.access
  const article = access ? aboutArticle(access, view, tab) : null
  if (!article) return null
  return (
    <button
      type="button"
      data-tour="about-view"
      aria-haspopup="dialog"
      onClick={() => openHelp(article.id)}
      className={cx(
        'inline-flex items-center gap-1 rounded-mark text-meta text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink hover:decoration-ink',
        className,
      )}
    >
      <IconHelp className="size-3.5 shrink-0" />
      {label}
    </button>
  )
}
