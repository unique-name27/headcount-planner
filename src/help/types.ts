/**
 * Help content types (docs/PLAN.md 14.2; the template app's help/types.ts). Articles and tours are
 * plain data kept in TypeScript, so they ship in the one-file build, are searchable and are checked
 * by tests.
 *
 * Inline links in article text use a small markup: `[label](kind:target)`, where kind is
 *   route    `route:plan.openings`, `route:data.quality`, `route:actions` (a view or page and tab)
 *   metric   `metric:plan.heads.approved` (the entry in Metric definitions)
 *   article  `article:privacy-small-groups` (another help article)
 *   tour     `tour:getting-started` (start a guided tour)
 *   settings `settings:privacy` (open Settings at a section)
 *
 * Conditions are written against surfaces (`view:whatif`, `pay:rounded`, `action:position.edit`),
 * never mode names, so a mode never reads about something it hides and a policy change moves the
 * text with the page (14.2). The shared conditions are named in `articles/when.ts`.
 *
 * Frozen in the M4 freeze (docs/CONTRACTS-M4.md). HCP's one addition to the template app's shapes:
 * `StepWording.view` and `.tab`, so one tour step can sit on each mode's own home (My team in
 * Manager mode, Home in the role modes).
 */
import type { RouteView } from '@/data/store'

/** The groups of the Help sheet, in order (PLAN 14.2). */
export type HelpGroup = 'start' | 'views' | 'data' | 'definitions' | 'privacy' | 'support'

export const HELP_GROUPS: readonly { key: HelpGroup; label: string }[] = [
  { key: 'start', label: 'Start here' },
  { key: 'views', label: 'Each view' },
  { key: 'data', label: 'Your data' },
  { key: 'definitions', label: 'Definitions' },
  { key: 'privacy', label: 'Privacy and trust' },
  { key: 'support', label: 'Help and support' },
]

/**
 * When a block, a tour step or a step's wording applies, by what the mode shows. `surface` names the
 * tab, figure, metric, action or control the text describes ("tab:plan.transfers"): it applies only
 * where every one named is shown. `unless` is the other side: it applies only where they are not all
 * shown, so `{ surface: x }` and `{ unless: x }` split the modes in two. Both may be given.
 */
export interface Condition {
  surface?: string | readonly string[]
  unless?: string | readonly string[]
  /** Every one hidden in the mode (text for a mode that hides two things at once). */
  hidden?: string | readonly string[]
  /**
   * Whether the mode holds a scope (true) or none (false), for text about the scope itself ("Records
   * outside your team are not listed"). A pick, not a policy decision: Leader mode acting as the CEO
   * holds none. Read from `access.scope`.
   */
  scoped?: boolean
}

/**
 * One block of an article body. Text may carry inline links (see the module comment). A block whose
 * condition the mode does not meet is skipped, and a heading takes its whole section with it (every
 * block up to the next heading). Consecutive lists left in a mode read as one list, so a list can be
 * written as one `ul` block per item when its items differ by mode. Search follows the same rules.
 */
export type Block = (
  | { p: string }
  | { h: string }
  | { ul: readonly string[] }
  | { ol: readonly string[] }
  | { note: string }
) &
  Condition

/**
 * Wording for a mode that hides something the usual wording names: the first that applies wins. It
 * applies where `surface` is hidden, or where `when` holds (a summary for one mode).
 */
export interface Without {
  /** The surface the usual summary mentions ("view:forecast"). */
  surface?: string
  when?: Condition
  summary: string
}

export interface HelpArticle {
  /** Stable kebab-case id, one of src/access/ids.ts `HELP_ARTICLE_IDS`: "view-plan", "about-server". */
  id: string
  group: HelpGroup
  /** Sentence case, no end punctuation. */
  title: string
  /** One plain sentence shown under the title in lists and search results. */
  summary: string
  body: readonly Block[]
  /** Extra words people may search for that the text does not use. */
  keywords?: readonly string[]
  /** Search words about something a mode can hide: they count only where `surface` is shown. */
  keywordsWhere?: readonly { surface: string; words: readonly string[] }[]
  /** The summary where a mode hides what the usual one names. */
  without?: readonly Without[]
  /** The page the article is about: "About this view" there opens it. */
  route?: { view: RouteView; tab?: string }
  /** Metric dictionary entries the article explains, listed under "Definitions". */
  metrics?: readonly string[]
  /** The tour that walks through what the article describes. */
  tour?: string
  /** Content generated at runtime after the body: the metric glossary or the release notes. */
  generated?: 'glossary' | 'whats-new'
}

export type Placement = 'top' | 'bottom' | 'left' | 'right' | 'auto'

/** A step's wording for the modes that meet its condition: the first one that applies is used. */
export interface StepWording extends Condition {
  title?: string
  body: string
  /** Another element to point at (a role home's own figure). */
  target?: string
  placement?: Placement
  /**
   * The page the step needs in these modes, where it is not the step's own (HCP): Manager mode's
   * home is My team (`team`), the role modes' is Home (`home`).
   */
  view?: RouteView
  /** The tab within that view ('' is its first tab). */
  tab?: string
}

export interface TourStep {
  /** A CSS selector, always `[data-tour="..."]`. Without one the step is a centered card. */
  target?: string
  /** Sentence case. */
  title: string
  body: string
  placement?: Placement
  /** The view or page the step needs; the tour opens it first. */
  view?: RouteView
  /** The tab within that view ('' is its first tab). */
  tab?: string
  /**
   * The control the step is about, as a surface ("masthead:workspace", "action:position.edit"), when
   * it is not shown in every mode: the tour skips the step in a mode that hides it. Several: every
   * one must be shown.
   */
  surface?: string | readonly string[]
  /** The step shows only where the surfaces named here are not all shown. */
  unless?: string | readonly string[]
  /**
   * Wording for particular modes (a role home's hero, its own list): the first one whose condition
   * the mode meets replaces the title, body, target and page. Without one, the step's own wording.
   */
  wording?: readonly StepWording[]
}

export interface Tour {
  /** One of src/access/ids.ts `HELP_TOUR_IDS`. */
  id: string
  /** Sentence case: "Getting started". */
  title: string
  /** One sentence for the list in the Help sheet. */
  summary: string
  /** The summary where a mode hides what the usual one names (its steps there are skipped). */
  without?: readonly Without[]
  /** Rough length shown in the list: "2 minutes". */
  length: string
  /** The view or page the tour belongs to; "Tour this page" picks it. */
  route?: RouteView
  steps: readonly TourStep[]
}
