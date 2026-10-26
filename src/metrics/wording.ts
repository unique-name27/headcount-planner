/**
 * Wording the dictionary entries share: who owns a metric (docs/PLAN.md 12) and the windows and
 * populations many entries repeat, so the same sentence is written once. Plain data with no
 * imports, so every view's `metrics.ts` can use it without loading the catalog.
 */

/**
 * Owners (docs/PLAN.md 12): Finance for cost, forecast, targets and Finance's own metrics; HR
 * business partners for My team, heads, hires, openings and requests; People analytics for rules.
 */
export const OWNER = {
  finance: 'Finance',
  hrbp: 'HR business partners',
  analytics: 'People analytics',
} as const

/** Windows. */
export const WINDOW = {
  asOf: 'The as-of date, in the shown version.',
  monthEnds: 'Each month-end of the shown version; tiles use the last closed month-end.',
  fiscalYear: "The shown version's fiscal year, April to March.",
  yearEnd: "The last day of the shown version's fiscal year.",
  yearToClose: "From the fiscal year's start to the last closed month-end.",
  period:
    'The period picker: the fiscal year by default, or the quarter or year to date, a month or a custom range.',
  costPeriod:
    'The period picker: the fiscal year by default. HRBP and Leader mode show cost for the full year, year to date and quarter to date only, ending at the last closed month-end.',
  grid: "Each month of the shown version's grid: closed months as closed, open months projected.",
  targetDate: 'The target date: the date on the target row, or the fiscal year end when it is blank.',
  cycle: "The planning cycle open for the shown fiscal year's asks.",
  tradeYear: "The seats' fiscal year, at the trade rates of its plan of record.",
  comparison: 'The window picked, against the comparison version picked for "vs" figures.',
  costComparison:
    'The window picked, against the comparison version picked for "vs" figures. HRBP and Leader mode show it for the full year, year to date and quarter to date only, ending at the last closed month-end.',
} as const

/**
 * The amounts HRBP and Leader mode never show (`cost:component`, docs/PLAN.md 7.3 and 12), said in
 * each of their definitions. Manager mode shows no amount at all.
 */
export const SHOWN_IN_FINANCE = 'Shown in Finance and HR admin mode.'

/** Populations. */
export const POPULATION = {
  positions:
    'Positions in scope in the shown version. Employee seats count 1 head; contractor and intern seats count 0.',
  employees: 'Employees in scope; contractors and interns are not counted.',
  costed:
    'Positions in scope. An amount shows only over 5 or more costed people: employees in Filled seats, and accepted offers from their start date, counted over the figure’s own version and window.',
  openings: 'Open and Planned employee seats in scope that no one has started in.',
  requests: 'Requests on positions in scope that you can see.',
  tree: 'Positions strictly below the manager’s own seat; the manager’s seat and anything above it are never in the tree.',
  seatType: 'One seat type: a level, a location and an FTE, in an org.',
} as const
