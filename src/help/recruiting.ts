/**
 * Help for Plan > Recruiting summary (docs/PLAN.md 9.8 "Help", change C38), as data: the `view-plan`
 * article's Recruiting summary section, its search words and the glossary terms the catalog gains.
 *
 * - The section is spread into `view-plan`'s body after Hiring (src/help/articles/views.ts), as the
 *   tab sits after Hiring. Heads only: plain counts, no amount, and mode-neutral but for the export
 *   line (under the deck export's surface) and Manager mode's note on its scope.
 * - It names what each of the seven numbers is, keeps "Future starts" (signed offers) and "Projected
 *   starts" (the model) apart in its own words, and walks the chart, the quarter table, where hiring
 *   happened and the one-slide deck.
 * - The glossary is generated from the catalog (src/help/glossary.ts), so each term here is a metric's
 *   name in src/views/plan/metrics.ts: 9.8's "Projected start" is the entry "Projected starts", and
 *   "Projected heads" and "Gap to approved heads" are the table's two other measures. The tab's
 *   "Projected attrition" is Plan > Hiring's Expected exits by quarter end to the fiscal year end;
 *   that entry's definition says so, so a search for the words finds it, and this section names it.
 * - The `view-plan` tour gains no step: it is at 6 steps already (14.2's most, see src/help/hiring.ts),
 *   so the section names the tab instead.
 *
 * Plain data; every string keeps the copy rules (src/help/recruiting.test.ts).
 */
import { ID } from '@/views/plan/metrics'
import { MANAGER } from './articles/when'
import type { Block } from './types'

/** The section's heading in `view-plan`. */
export const RECRUITING_SECTION_TITLE = 'Recruiting summary'

/** The surface the export line shows under: the whole view as a deck. */
export const RECRUITING_DECK = 'action:export.deck'

/** `view-plan`'s Recruiting summary section, heading first. */
export const RECRUITING_SECTION: readonly Block[] = [
  { h: RECRUITING_SECTION_TITLE },
  {
    p: 'Recruiting summary puts the hiring of the fiscal year shown on one screen to show, in heads only: seven numbers first, then one chart, one small table and where hiring happened. Every number [Plan > Hiring](route:plan.hiring) also shows is counted the same way and opens the same records. Projected starts, projected heads and the gap to approved heads are this tab’s own.',
  },
  {
    ul: [
      'Approved heads: the approved seats whose first head day is by the fiscal year end and that are still approved heads then.',
      'Current heads: the employees in your scope in the HRIS on the as-of date, people not in plan included.',
      'Open to hire: approved heads, less current heads, less the future starts due by the fiscal year end, and less the moves in when there are any.',
      'Future starts: people with a signed offer who have not started yet, by start date, to the fiscal year end. Whole people, never a model.',
      'Projected starts: the forecast’s model of the starts to come on Open and Planned seats with no signed offer, each at its fill rate after its time to fill, plus the backfills that modeled exits reopen. An Open seat already past its time to fill counts in the first month ahead, and a seat an approved internal move fills has none: the move is its head. Shown to one decimal and labelled a model.',
      'Projected attrition: the exits expected by the fiscal year end, known last days plus modeled exits (Plan > Hiring’s expected exits), with the attrition rate (heads) over the last 12 closed months under it, as Plan > Hiring shows it.',
      'Hiring velocity: hires per month over the last 3 closed months (the 3-month pace), with the 6-month pace and the hires of the last 3 months under it.',
    ],
  },
  {
    p: 'Future starts and projected starts always show apart. A signed offer is a future start, never a projected one, and projected starts never count toward open to hire. Projected starts and modeled exits need a Working forecast: without one, projected starts and projected heads show no value, and projected attrition counts known exits only.',
  },
  {
    ul: [
      'Heads and hiring by month: the last 12 closed months, and any month that has ended since without being closed, show hires up and exits down as bars, with heads at each month end as a line. Each month to the fiscal year end shows its future starts, its moves in on them in a shade of their own, and the projected starts stacked on top in a lighter shade with a dashed outline; its projected attrition goes down, and projected heads are a dashed line: current heads, plus future starts, moves in and projected starts, less projected attrition. The month that holds the as-of date also shows its actual hires and exits so far. Approved heads by the fiscal year end are a dotted line across the chart, dated in the key. The left axis reads hires and exits a month, the right axis heads.',
      'By quarter ahead: for each quarter still ahead, approved heads by its end, the future starts, projected starts and projected attrition due by then, projected heads at its end, and the gap to approved heads, which reads "Short by" or "Over by", or "On approved heads" at 0.0. The parts are rounded to one decimal, so a row can be 0.1 off its total.',
      'Where hiring happened: the top 5 locations and the top 5 departments by hires over the last 3 closed months, how many more had a hire (and how many of them tie with the fifth), and a link to the full table of hires by location and department on Plan > Hiring.',
      'Each count opens the records or the calculation card behind it, as on Plan > Hiring. A signed offer shows as a date only.',
    ],
  },
  {
    p: 'Projected heads also count, when there are any, a signed offer whose start date has passed but that the HRIS has not recorded yet, a hire the HRIS already holds for a later date with no signed offer on the seat, and less the people whose last day is the as-of date. Each shows as its own line in the calculation card and its own shade on the chart, never as a future start, so each month’s bars add up to the step of the projected heads line.',
  },
  {
    p: 'Export as a deck gives this tab one slide after "About these numbers": the seven numbers and the chart, with the scope and the as-of date. The workbook keeps every figure, a sheet each, and each figure still saves its own CSV. The tab’s own files are heads only, with no control totals.',
    surface: RECRUITING_DECK,
  },
  {
    p: 'In Manager mode it covers the seats below yours, in heads, and its projected starts and modeled exits are worked out over your team’s own seats alone.',
    ...MANAGER,
  },
]

/** Search words the section adds to `view-plan`. */
export const RECRUITING_KEYWORDS: readonly string[] = [
  'recruiting summary',
  'recruiting',
  'head of recruiting',
  'projected starts',
  'projected attrition',
  'projected heads',
  'gap to approved heads',
  'short by',
  'heads and hiring by month',
  'by quarter ahead',
  'where hiring happened',
  'hiring velocity',
  'one slide',
]

/** The glossary terms 9.8 names, each the catalog name of the metric it comes from. */
export const RECRUITING_GLOSSARY: readonly { term: string; metricId: string }[] = [
  { term: 'Projected starts', metricId: ID.recruitingProjectedStarts },
  { term: 'Projected heads', metricId: ID.recruitingProjectedHeads },
  { term: 'Gap to approved heads', metricId: ID.recruitingGap },
]

/**
 * The tab's words for Plan > Hiring's expected exits (9.8 Words): the tile and the quarter table say
 * "Projected attrition", and the catalog entry's definition names it so the glossary search finds it.
 */
export const PROJECTED_ATTRITION = { term: 'Projected attrition', metricId: ID.hiringExpectedExits } as const
