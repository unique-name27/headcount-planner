/**
 * Help in each mode (docs/PLAN.md 14.2; the template app's kit.ts `articlesFor` and `toursFor`):
 * which help articles and guided tours a mode's table shows, each limited or hidden one with its
 * sentence. Written against the table's own views and tabs and the mode's pay and leave views, so a
 * policy change to a view moves its article and tour with it. `src/access/ids.ts HELP_GRID` repeats
 * the letters these give (src/help/contracts.test.ts compares them).
 *
 * Built in the M4 freeze (docs/CONTRACTS-M4.md): plain data out, pure.
 */
import { VIEW_KEYS, type ViewKey } from '@/data/schema'
import { HELP_ARTICLE_IDS, HELP_TOUR_IDS } from '../ids'
import { LEAVE_OF } from '../leave'
import { MODE_NAME, type Mode } from '../modes'
import { PAY_OF } from '../pay'
import { DATA_ROOM_HOW, TEAM_HOW } from './kit'
import { type Decision, hidden, limited, type PolicyPlace, type RoleTab, SHOWN } from './types'

/** What the help decisions read of a mode's table. */
export interface HelpSpec {
  mode: Mode
  views: Readonly<Record<PolicyPlace, Decision>>
  tabs: Readonly<Partial<Record<PolicyPlace, readonly RoleTab[]>>>
}

/** The articles that show in every mode. */
const EVERYWHERE: readonly string[] = [
  'what-headcount-planner-is',
  'moving-around',
  'reading-a-number',
  'clicking-down',
  'exporting',
  'modes',
  'view-actions',
  'data-workspace-file',
  'data-versions',
  'trading-heads',
  'privacy-browser',
  'about-server',
  'privacy-small-groups',
  'privacy-sample',
  'shortcuts',
  'report-problem',
  'troubleshooting',
  'faq',
  'whats-new',
]

/** The Data room's own articles (Your data, but for the workspace file and versions). */
const DATA_ROOM_ARTICLES: readonly string[] = [
  'data-loading',
  'data-mapping',
  'data-tiers',
  'data-certify',
  'data-quality',
  'data-wrong',
]

const viewNotShown = (mode: Mode): string => `Its view is not shown in ${MODE_NAME[mode]} mode.`
const SKIPPED = 'Its steps follow what this mode shows of the page.'
const DATA_ARTICLES_HOW = 'Your data articles are about the Data room, which this mode hides.'
const DATA_TOURS_HOW = 'Its steps are in the Data room, which this mode hides.'

/** The decision for a view's article or tour when its view is hidden. */
function hiddenView(s: HelpSpec, view: ViewKey): Decision {
  return hidden(view === 'team' ? TEAM_HOW : viewNotShown(s.mode))
}

const owner = (s: HelpSpec): boolean => s.views.data.access !== 'hidden'

/** Help articles: Start here and support always, a view's article with its view, the rest by rule. */
export function articlesFor(s: HelpSpec): Record<string, Decision> {
  const out: Record<string, Decision> = {}
  for (const id of EVERYWHERE) out[id] = SHOWN
  for (const v of VIEW_KEYS) out[`view-${v}`] = s.views[v].access === 'hidden' ? hiddenView(s, v) : SHOWN
  out['view-data'] = owner(s) ? SHOWN : hidden(DATA_ROOM_HOW)
  out['view-audit'] =
    s.views.audit.access === 'hidden'
      ? hidden(`The Audit page is not shown in ${MODE_NAME[s.mode]} mode.`)
      : SHOWN
  for (const id of DATA_ROOM_ARTICLES) out[id] = owner(s) ? SHOWN : hidden(DATA_ARTICLES_HOW)
  out['definitions-how'] = owner(s) ? SHOWN : limited('Its Data room links read as text.')
  out.glossary = owner(s) ? SHOWN : limited('Metrics shown in this mode only.')
  const noAmounts = PAY_OF[s.mode] === 'none'
  out['cost-definition'] = noAmounts
    ? hidden(`${MODE_NAME[s.mode]} mode shows no amounts, so the cost definition is left out.`)
    : SHOWN
  out['privacy-pay'] = noAmounts
    ? hidden(`${MODE_NAME[s.mode]} mode shows no amounts, so the pay rules article is left out.`)
    : SHOWN
  out['privacy-leave'] =
    LEAVE_OF[s.mode] === 'none'
      ? hidden(`${MODE_NAME[s.mode]} mode shows no leave, so the leave article is left out.`)
      : SHOWN
  // Every id decided, in the list's order (a missing one would fail at load).
  const ordered: Record<string, Decision> = {}
  for (const id of HELP_ARTICLE_IDS) {
    const d = out[id]
    if (!d) throw new Error(`No help decision for article ${id}`)
    ordered[id] = d
  }
  return ordered
}

/** Tours: the first tour for the mode's home, the Data room's for HR admin, a view's with its view. */
export function toursFor(s: HelpSpec): Record<string, Decision> {
  const out: Record<string, Decision> = {}
  out['getting-started'] = owner(s) ? SHOWN : hidden('"Getting started with your home" takes its place.')
  out['home-start'] = owner(s)
    ? hidden('HR admin opens on the Data room; "Getting started" walks through it.')
    : SHOWN
  const newTab = s.tabs.requests?.find((t) => t.key === 'new')?.decision
  out['requests-start'] =
    !newTab || newTab.access === 'hidden'
      ? hidden(newTab?.how ?? `Requests are not raised in ${MODE_NAME[s.mode]} mode.`)
      : SHOWN
  out['own-data'] = owner(s) ? SHOWN : hidden(DATA_TOURS_HOW)
  for (const v of VIEW_KEYS) {
    const d = s.views[v]
    out[`view-${v}`] =
      d.access === 'hidden' ? hiddenView(s, v) : d.access === 'limited' ? limited(SKIPPED) : SHOWN
  }
  const ordered: Record<string, Decision> = {}
  for (const id of HELP_TOUR_IDS) {
    const d = out[id]
    if (!d) throw new Error(`No help decision for tour ${id}`)
    ordered[id] = d
  }
  return ordered
}
