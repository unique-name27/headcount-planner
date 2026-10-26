/**
 * Help for Plan > Hiring (docs/PLAN.md 9.7 "Help", change C36; the hiring freeze), as data: the
 * `view-plan` article's Hiring section, its search words, the glossary terms the catalog gains, and
 * the `view-plan` tour's step on the quarter table.
 *
 * - The section is spread into `view-plan`'s body after Openings (src/help/articles/views.ts), as the
 *   tab sits after Openings. Plain counts, "Open to hire" (never "headcount to hire"), no amount, and
 *   mode-neutral but for the two blocks under a condition (My team's note, the role homes' tile).
 * - The glossary is generated from the catalog (src/help/glossary.ts), so each term here is a metric's
 *   name in src/views/plan/metrics.ts; 9.7's "Accepted start" is the entry "Accepted starts".
 * - The tour step is written in full; the homes-help builder inserts it into the `view-plan` tour at
 *   `HIRING_TOUR_AT` (after Openings, before Transfers) once Plan > Hiring draws its quarter table,
 *   so the tour has 6 steps (14.2: 4 to 6) and at least 3 in every mode.
 *
 * Plain data; every string keeps the copy rules (src/views/hiring.contracts.test.ts).
 */
import { ID } from '@/views/plan/metrics'
import { MANAGER, ROUNDED } from './articles/when'
import type { Block, TourStep } from './types'

/** The section's heading in `view-plan`. */
export const HIRING_SECTION_TITLE = 'Hiring'

/** `view-plan`'s Hiring section, heading first. */
export const HIRING_SECTION: readonly Block[] = [
  { h: HIRING_SECTION_TITLE },
  {
    p: 'Hiring tracks progress against approved heads, quarter by quarter, in heads only. Open to hire is approved heads by a quarter’s end, less current heads, less the accepted starts due by then. Below 0 it reads "Over by" and is never a hiring target.',
  },
  {
    ul: [
      'Key figures: open to hire this fiscal year, accepted starts to come, hires and exits per month over the last 3 closed months, the net hiring pace, and the months to close at that pace.',
      'Open to hire by quarter: approved heads, current heads, accepted starts, open to hire, new to hire in the quarter, expected exits, to hire to reach plan, and the hires needed per month against the hiring pace. Closed quarters show their actual heads, hires and exits.',
      'Hiring velocity: hires and exits in each of the last 12 closed months with the net, then the months to the fiscal year end. Attrition is counted in heads: exits over the last 12 closed months against average heads.',
      'Each count opens the records behind it. An accepted offer shows as a date only.',
    ],
  },
  {
    p: 'On My team, Open to hire sits under Left to fill. Left to fill counts your Open and Planned seats; Open to hire also subtracts current heads and the accepted starts to come.',
    ...MANAGER,
  },
  { p: 'Your home shows Open to hire for this fiscal year too, and opens this tab.', ...ROUNDED },
]

/** Search words the section adds to `view-plan`. */
export const HIRING_KEYWORDS: readonly string[] = [
  'open to hire',
  'accepted starts',
  'hiring pace',
  'net hiring pace',
  'exit pace',
  'attrition',
  'months to close',
  'velocity',
]

/** The glossary terms 9.7 names, each the catalog name of the metric it comes from. */
export const HIRING_GLOSSARY: readonly { term: string; metricId: string }[] = [
  { term: 'Open to hire', metricId: ID.hiringOpen },
  { term: 'Accepted starts', metricId: ID.hiringAcceptedStarts },
  { term: 'Hiring pace', metricId: ID.hiringPace },
  { term: 'Net hiring pace', metricId: ID.hiringNetPace },
  { term: 'Attrition (heads)', metricId: ID.hiringAttritionRate },
]

/** Where the step goes in the `view-plan` tour's steps (after Openings, before Transfers). */
export const HIRING_TOUR_AT = 4

/** The `view-plan` tour's step on the quarter table (`plan-hiring-quarters`). */
export const HIRING_TOUR_STEP: TourStep = {
  view: 'plan',
  tab: 'hiring',
  target: '[data-tour="figure-plan-hiring-quarters"]',
  title: 'Open to hire by quarter',
  body: 'Approved heads by each quarter end, less current heads and the accepted starts due by then, is what is left to hire. Below it: new to hire in the quarter, expected exits, and the hires needed each month against the hiring pace. Closed quarters show their actual heads, hires and exits.',
  placement: 'top',
}
