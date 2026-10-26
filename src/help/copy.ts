/**
 * Help's own sentences (PLAN 14.2 and 14.3): the notices when a link, "Learn more" or "Tour this
 * page" names an article or tour the mode hides, and the Help sheet's fixed labels. Sentence case,
 * no "!", no em dash between words, none of `BANNED_MODE_WORDS`.
 *
 * M4 freeze (docs/CONTRACTS-M4.md): written in full and frozen like a signature; help-engine may add
 * sentences, never reword these.
 */

/** The sheet's line when an article the mode hides was asked for. */
export const ARTICLE_NOT_SHOWN = 'That article is not shown in this mode.'

/** The tour layer's toast when a tour the mode hides, or with no step left, was asked for. */
export const TOUR_NOT_SHOWN = 'That tour is not shown in this mode.'

/** The masthead button and the sheet's title. */
export const HELP_SHEET_TITLE = 'Help'

/** "About this view" in each view header (`header:about`). */
export const ABOUT_THIS_VIEW = 'About this view'

/** The info popovers' link (`help:learn-more`). */
export const LEARN_MORE = 'Learn more'

/* ───────────── added by help-engine (M4): the sheet's, the tour layer's and the welcome line's words ───────────── */

/** "About this page" on a masthead page's header (the Data room's). */
export const ABOUT_THIS_PAGE = 'About this page'

/** The sheet's and an article's button for the mode's first tour, or the article's tour. */
export const TAKE_THE_TOUR = 'Take the tour'
export const TAKE_THE_TOUR_AGAIN = 'Take the tour again'

/** The sheet's home buttons. */
export const ON_THIS_PAGE = "What's on this page"
export const KEYBOARD_SHORTCUTS = 'Keyboard shortcuts'
export const WHATS_NEW = "What's new"
export const REPORT_A_PROBLEM = 'Report a problem'

/** Report a problem's toast, and its line when the browser refuses to copy. */
export const REPORT_COPIED = 'Problem report copied'
export const REPORT_COPIED_NOTE =
  'Paste it into a message or ticket and add what you expected to see. It names no person, position or request.'
export const COPY_BY_HAND = 'The browser did not allow copying. Select the text below and copy it.'

/** The sheet's search box (its label and placeholder) and the sheet's description for screen readers. */
export const SEARCH_HELP = 'Search help and definitions'
export const SHEET_DESCRIPTION =
  'Search help articles and metric definitions, take a guided tour, see keyboard shortcuts or report a problem.'

/** A search that finds nothing. */
export const nothingMatches = (query: string): string =>
  `Nothing matches "${query}". Try fewer or shorter words, or clear the search to browse every article.`

/** A tour step whose element is not on screen (it shows as a centered card). */
export const STEP_NOT_ON_SCREEN =
  'This part is not on screen right now. A filter, the data standard or the screen size may hide it.'

/** The tour popover's and the welcome line's buttons. */
export const SKIP_TOUR = 'Skip tour'
export const NOT_NOW = 'Not now'
