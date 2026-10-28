/**
 * Release notes for "What's new" in the Help sheet, newest first. `APP_VERSION` is the version the
 * "Report a problem" summary reports; a test keeps it in step with package.json.
 *
 * M4 freeze (docs/CONTRACTS-M4.md): the type and the version are frozen; help-trust writes
 * `RELEASE_NOTES` (sentence case, no "!", no em dash between words, plain counts, synthetic data).
 * The four oldest notes are the four milestones of docs/PLAN.md 17; then Plan > Hiring (docs/PLAN.md
 * 9.7, changes C36 and C37), and the newest is Plan > Recruiting summary (9.8, change C38). All are
 * version 0.1.0.
 *
 * Every mode reads "What's new", and a mode never reads about something it hides (14.2; M4 review
 * HL-10): an item about a page, a tool or an amount some mode hides is written with `only`, under
 * the condition that shows it (./articles/when.ts), and the sheet lists `releaseNotesIn` the mode.
 */
import { type HelpAccess, holds } from './access'
import { AMOUNTS, FORECAST, MANAGER, NO_AMOUNTS, RAISES_REQUESTS, ROUNDED, WHAT_IF } from './articles/when'
import type { Condition } from './types'

export const APP_VERSION = '0.1.0'

export interface ReleaseNote {
  /** ISO date of the release. */
  date: string
  title: string
  items: readonly string[]
}

/** The condition of each item written with `only`, by its text; an item not here shows in every mode. */
const ITEM_WHEN = new Map<string, Condition>()

/** An item shown only where the condition holds (the text stays a plain string in `items`). */
function only(when: Condition, text: string): string {
  ITEM_WHEN.set(text, when)
  return text
}

/** The condition an item shows under, or undefined when it shows in every mode. */
export const releaseItemWhen = (text: string): Condition | undefined => ITEM_WHEN.get(text)

/** Whether a mode lists an item; outside a mode only the items every mode reads. */
export function releaseItemShown(access: HelpAccess | null | undefined, text: string): boolean {
  const when = ITEM_WHEN.get(text)
  return !when || (!!access && holds(access, when))
}

/** Raises no requests: Finance mode (tab:requests.new hidden). */
const NO_NEW_REQUESTS: Condition = { unless: 'tab:requests.new' }

/**
 * Newest first. Every mode reads these, so no note holds an amount or names a page, tab, switch or
 * action some mode hides (src/help/names.ts `HELP_NAMES`), and an item about something a mode
 * hides is written with `only`; src/help/articles/trust.test.ts checks both in every mode, with
 * the copy rules.
 */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    date: '2026-10-27',
    title: 'Recruiting summary',
    items: [
      'Plan > Recruiting summary puts hiring on one screen to show, in heads only: approved heads, current heads, open to hire, future starts, projected starts, projected attrition and hiring velocity for the fiscal year shown.',
      'Future starts are signed offers; projected starts are the forecast’s model of the starts to come on Open and Planned seats with no signed offer. The two always show apart, and projected starts never count toward open to hire.',
      'One chart, heads and hiring by month: the closed months’ hires, exits and heads, then the future and projected starts, projected attrition and projected heads to the fiscal year end, against approved heads.',
      'A table by quarter ahead compares projected heads at each quarter end with approved heads by then, "Short by" or "Over by", and a list of where hiring happened shows the top 5 locations and departments by hires over the last 3 closed months.',
      'Its deck export is one slide after "About these numbers": the seven numbers and the chart. The glossary gains Projected starts, Projected heads and Gap to approved heads.',
      only(
        FORECAST,
        'The forecast counts an Open seat already past its time to fill as an expected start in the first month ahead, the month its heads count from, so its starts by month add up to its heads.',
      ),
    ],
  },
  {
    date: '2026-10-26',
    title: 'Future starts and recent hires',
    items: [
      'Plan > Hiring counts future starts: people with a signed offer who have not started yet, by start date. A forecast or modeled start never counts.',
      'Approved internal moves into your scope that have not started show as their own row, Moves in by quarter end, when there are any.',
      'Hiring velocity shows the future starts of each month to the fiscal year end, in whole people, beside the expected exits.',
      'A new table, Hires in the last 3 months, by location and department: each department and location that had a hire, a column per month, sub-totals by department and by location, and a total that matches the velocity chart.',
    ],
  },
  {
    date: '2026-10-25',
    title: 'Hiring progress',
    items: [
      'Plan > Hiring: open to hire by quarter (approved heads by each quarter end, less current heads and the future starts due by then), expected exits, and the hires needed each month, all in heads.',
      'Hiring velocity: hires and exits in each of the last 12 closed months, the 3-month and 6-month paces, attrition in heads, and the months to close what is open to hire at the net pace.',
      only(
        ROUNDED,
        'Your home’s key figures gain Open to hire for this fiscal year, which opens Plan > Hiring.',
      ),
      only(MANAGER, 'Your home shows Open to hire under Left to fill, and it opens Plan > Hiring.'),
      'The glossary gains Open to hire, Future starts, Hiring pace, Net hiring pace and Attrition (heads), and the Plan tour gains a step on the quarter table.',
    ],
  },
  {
    date: '2026-10-24',
    title: 'Help, tours and exports',
    items: [
      'A Help button in the masthead: articles on every view, your data, definitions, privacy and support, a glossary of every metric, keyboard shortcuts and Report a problem. Press ? to open it from anywhere.',
      only(
        RAISES_REQUESTS,
        'Guided tours: getting started on each home, raising a request, and one for each view the mode shows.',
      ),
      only(
        NO_NEW_REQUESTS,
        'Guided tours: getting started on each home, and one for each view the mode shows.',
      ),
      'Help follows the mode: articles and tours describe only what the mode shows, and "About this view" opens the article for the page you are on.',
      'Every export says what it holds: the version and its lock, the comparison, the as-of date, the filters, and how its numbers are guarded.',
      only(
        AMOUNTS,
        'A hidden amount in an export is an empty cell with Suppressed and Why beside it, never a 0.',
      ),
      'A long CSV that stands on its own, with the version and its lock on every row, and control totals.',
      'One file: download headcount-planner.html and run the same app from your own computer, the right place for real data.',
    ],
  },
  {
    date: '2026-10-24',
    title: 'Requests, approvals and versions',
    items: [
      only(
        RAISES_REQUESTS,
        'Raise requests of nine types, from a new role or a backfill to a trade, and follow each one through its approval chain.',
      ),
      only(
        NO_NEW_REQUESTS,
        'Requests of nine types, from a new role or a backfill to a trade, each followed through its approval chain.',
      ),
      'Approve, send back or reject the steps that wait on you. Every decision is audited.',
      'The planning cycle: asks from every manager, ranked against the target, decided at lock.',
      'Finance locks Budgets and reforecasts, reopens a year and closes each month. Working stays editable, and every lock carries its hash.',
      only(
        WHAT_IF,
        'Hiring freezes with their exceptions, transfers between teams, and scenario levers for heads, cost and the gap.',
      ),
      only({ unless: 'view:whatif' }, 'Hiring freezes with their exceptions, and transfers between teams.'),
      'Workspace files: save what you see, export your requests, and open a file someone sent you through your own mode.',
    ],
  },
  {
    date: '2026-10-23',
    title: 'Five modes and the cost guard',
    items: [
      'Five modes, Manager, HRBP, Leader, Finance and HR admin, each with its own home and its own Acting as.',
      only(
        AMOUNTS,
        'Cost is guarded before any view reads it: totals cover 5 or more costed people, and a difference needs 5 or more positions that changed.',
      ),
      only(NO_AMOUNTS, 'Manager mode works in heads and shows no amounts, in any view, export or file.'),
      'Every number opens its records or its calculation card, whose last step is the number.',
      'Seats are also counted in standard heads, so trades read the same in every mode.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Positions, versions and the sample company',
    items: [
      'Eight datasets, from positions to assumptions, each with its tier, mapping and certification.',
      'Northgate Semiconductor, a fictional company with nine stories planted in it.',
      only(
        FORECAST,
        'Engines for heads, cost, FX, the forecast, variance, targets and trades, each pinned by worked examples.',
      ),
      only(
        { unless: 'view:forecast' },
        'Engines for heads, allocations and trades, each pinned by worked examples.',
      ),
    ],
  },
]

/** The release notes as a mode lists them: each note with the items the mode reads. */
export function releaseNotesIn(access: HelpAccess | null | undefined): ReleaseNote[] {
  return RELEASE_NOTES.map((n) => ({ ...n, items: n.items.filter((t) => releaseItemShown(access, t)) }))
}
