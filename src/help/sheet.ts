/**
 * What the ways into Help offer in a mode, as pure functions the components draw and the tests
 * check over every mode: the Help sheet's home (its tours, this page's article and tour, the groups
 * of articles), the article it opens at, its search index, "About this view" and "Learn more".
 * Everything goes through ./access.ts, so no article or tour shows in a mode that hides it, and an
 * article or tour shows as the mode reads it (sections, steps and summaries for what it shows).
 */
import { routeShown } from '@/access/policy'
import type { RouteView } from '@/data/store'
import type { MetricDef } from '@/metrics/types'
import {
  articleInMode,
  articleShown,
  articlesInMode,
  glossaryInMode,
  type HelpAccess,
  homeTourOf,
  learnMoreIn,
  tourInMode,
  toursInMode,
} from './access'
import { ARTICLES, articleById, articleForRoute, articlesIn } from './articles'
import { buildGlossary } from './glossary'
import { buildIndex, type SearchIndex } from './search'
import { TOURS, tourById, tourForRoute } from './tours'
import { HELP_GROUPS, type HelpArticle, type HelpGroup, type Tour } from './types'

/** What the Help sheet's home lists. */
export interface SheetHome {
  /** "Take the tour": the mode's own first tour, as the mode runs it. */
  homeTour: Tour | null
  /** "What's on this page": this page's article, as the mode shows it. */
  here: HelpArticle | null
  /** "Tour this page". */
  pageTour: Tour | null
  /** Every other tour the mode runs, in list order. */
  tours: Tour[]
  /** The articles the mode shows, by group; a group it leaves empty is not listed. */
  groups: { key: HelpGroup; label: string; articles: HelpArticle[] }[]
  shortcuts: boolean
  whatsNew: boolean
  report: boolean
  search: boolean
}

/** The sheet's home in a mode, on a page. */
export function sheetHome(access: HelpAccess, route: { view: RouteView; tab: string }): SheetHome {
  const found = articleForRoute(route.view, route.tab)
  const here = found && articleShown(access, found.id) ? articleInMode(access, found) : null
  const pageTour = tourInMode(access, tourForRoute(route.view))
  return {
    homeTour: tourInMode(access, tourById(homeTourOf(access.mode))),
    here,
    pageTour,
    tours: toursInMode(access, TOURS).filter((t) => t.id !== pageTour?.id),
    groups: HELP_GROUPS.map((g) => ({ ...g, articles: articlesInMode(access, articlesIn(g.key)) })).filter(
      (g) => g.articles.length > 0,
    ),
    shortcuts: access.can('help:shortcuts') && articleShown(access, 'shortcuts'),
    whatsNew: access.can('help:whats-new') && articleShown(access, 'whats-new'),
    report: access.can('help:report'),
    search: access.can('help:search'),
  }
}

/**
 * The article the sheet opens at, as the mode shows it; `notShown` when the mode hides the one asked
 * for (the sheet's home then says so). An id that names no article opens the home quietly.
 */
export function sheetArticle(
  access: HelpAccess,
  id: string | null | undefined,
): { article: HelpArticle | null; notShown: boolean } {
  const asked = articleById(id)
  if (!asked) return { article: null, notShown: false }
  return articleShown(access, asked.id)
    ? { article: articleInMode(access, asked), notShown: false }
    : { article: null, notShown: true }
}

/** The sheet's search over the articles and the glossary of metrics the mode shows (`defs`: in force). */
export function sheetIndex(access: HelpAccess, defs: readonly MetricDef[]): SearchIndex {
  return buildIndex(articlesInMode(access, ARTICLES), glossaryInMode(access, buildGlossary(defs)))
}

/** "About this view" (`header:about`): the page's article where the mode shows it, else null. */
export function aboutArticle(access: HelpAccess, view: RouteView, tab = ''): HelpArticle | null {
  const a = articleForRoute(view, tab)
  return a && access.can('header:about') && articleShown(access, a.id) ? a : null
}

/** "Learn more" (`help:learn-more`): the id of the metric's article where the mode shows it, else null. */
export const learnMoreArticle = learnMoreIn

/** The page an article's "Open" button goes to, where the mode shows that page; else none. */
export function articlePage(access: HelpAccess, a: HelpArticle): HelpArticle['route'] {
  return a.route && routeShown(access.mode, a.route.view, a.route.tab ?? '') ? a.route : undefined
}
