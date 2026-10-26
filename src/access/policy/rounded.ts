/**
 * What HRBP and Leader mode share (docs/PLAN.md 7.3, 8.3 and 12): the rounded-mode metric hide list
 * (components, incl. SBC, the exit run rate, freeze savings amounts and the cost accuracy rate are
 * Finance's), the columns they leave out, and their frame overrides. Plain data.
 */
import { COMPONENT_COLUMNS, LEAVE_COLUMNS, PAY_COLUMNS } from '../ids'
import { LEAVE_PEOPLE_HOW } from '../leave'
import { COMPONENT_HOW } from '../pay'
import { columnSurfaces, type MetricHide } from './kit'
import { hidden } from './types'

/**
 * The metrics rounded modes hide (12): `plan.cost.component`, `plan.cost.loadedInclSbc`,
 * `forecast.cost.exitRunRate` and `finance.freeze.savings` (through `cost:component`), and
 * `forecast.accuracy.cost`, a cost figure outside 7.3's rounded-mode allow-list.
 */
export const ROUNDED_METRIC_HIDES: readonly MetricHide[] = [
  { match: 'plan.cost.component', how: COMPONENT_HOW },
  { match: 'plan.cost.loadedInclSbc', how: 'Cost incl. SBC shows in Finance mode.' },
  { match: 'forecast.cost.exitRunRate', how: 'The exit run rate shows in Finance mode.' },
  {
    match: 'finance.freeze.savings',
    how: "Freeze savings amounts are Finance's; the openings held still show.",
  },
  { match: 'forecast.accuracy.cost', how: 'Forecast accuracy on cost shows in Finance mode.' },
]

/** One person's amounts, the component columns and the leave columns (8.3). */
export const ROUNDED_HIDDEN_COLUMNS: readonly string[] = [
  ...PAY_COLUMNS,
  ...COMPONENT_COLUMNS,
  ...LEAVE_COLUMNS,
]

export const ROUNDED_COLUMN_SURFACES = {
  ...columnSurfaces(
    PAY_COLUMNS,
    hidden("One person's amounts show only in HR admin mode, with Show pay amounts on."),
  ),
  ...columnSurfaces(COMPONENT_COLUMNS, hidden(COMPONENT_HOW)),
  ...columnSurfaces(LEAVE_COLUMNS, hidden(LEAVE_PEOPLE_HOW)),
}
