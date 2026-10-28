/**
 * Manager mode's table (docs/PLAN.md 8.3): one manager's team, strictly below their own seat, in
 * heads, status words and standard heads; no amount of any kind anywhere (7.6). An allowlist: what
 * this table does not name is hidden. Plain data.
 */
import { BAND_COLUMNS, PAY_COLUMNS } from '../ids'
import { NO_LEAVE } from '../leave'
import { NO_AMOUNTS } from '../pay'
import { actionsFor } from './actions'
import { articlesFor, toursFor } from './help'
import {
  columnSurfaces,
  DATA_METRICS_HIDE,
  DATA_ROOM_HOW,
  FINANCE_OWN,
  frameSurfaces,
  metricHides,
  tabTable,
} from './kit'
import { type Decision, hidden, limited, type PolicyPlace, type RolePolicy, SHOWN } from './types'

const BAND_HOW = 'Managers see heads and standard heads, never amounts.'
/** Plan > Hiring in Manager mode (docs/PLAN.md 8.3 and 9.7): shown, over your team, in heads. */
export const HIRING_HOW = 'Your team, in heads.'

const views: Record<PolicyPlace, Decision> = {
  home: hidden('Managers open on My team.'),
  team: SHOWN,
  plan: limited('Your team only, with no cost.'),
  requests: limited("Your team's requests and the ones you approve, in heads."),
  forecast: hidden('The forecast shows cost and modeled exits. My team shows your heads and status.'),
  targets: hidden("Targets are Finance's heads and cost per org. My team shows your allocation."),
  whatif: hidden('What if shows cost and gap.'),
  finance: hidden(FINANCE_OWN),
  data: hidden(DATA_ROOM_HOW),
  actions: limited('Items about your team, unit or org.'),
  audit: hidden('The audit spans other teams. Changes to your requests show on the requests.'),
}

const tabs = tabTable(views, {
  team: { overview: SHOWN },
  plan: {
    overview: hidden('The plan overview carries cost and other teams. My team shows your heads.'),
    positions: limited('Heads, status and standard heads by month, no cost columns.'),
    openings: limited('Your team; an accepted offer shows as a date only.'),
    // Shown, with the plan's sentence (9.7, C36): heads only, over the tree strictly below your seat.
    hiring: { access: 'shown', how: HIRING_HOW },
    // Recruiting summary (9.8, C38): Plan > Hiring's numbers on one screen, the same scope.
    recruiting: { access: 'shown', how: HIRING_HOW },
    transfers: limited('Your team; names show, amounts do not.'),
  },
  requests: {
    queue: hidden('The queue spans other teams. Mine and Approvals hold yours.'),
    new: limited('Inside your team or org.'),
    mine: SHOWN,
    approvals: limited("Requests you approve as a manager's manager, in heads."),
    cycle: limited("Your ranked asks and the cycle's dates."),
  },
})

/**
 * Every G, B and D metric by prefix (docs/PLAN.md 12), leave, and the one rule whose setting is an
 * amount, the rounding step (src/metrics/guardClass.ts `MANAGER_HIDDEN_RULES`, 7.6).
 */
const metrics = metricHides([
  { match: 'plan.cost.', how: NO_AMOUNTS },
  { match: 'forecast.cost.', how: NO_AMOUNTS },
  { match: 'forecast.variance.cost', how: NO_AMOUNTS },
  { match: 'forecast.bridge.', how: NO_AMOUNTS },
  { match: 'forecast.fx.', how: NO_AMOUNTS },
  { match: 'forecast.accuracy.cost', how: NO_AMOUNTS },
  { match: 'targets.target.cost', how: NO_AMOUNTS },
  { match: 'targets.asks.cost', how: NO_AMOUNTS },
  { match: 'targets.gap.cost', how: NO_AMOUNTS },
  { match: 'whatif.', how: 'What if shows cost and gap.' },
  { match: 'finance.trade.standardHead', how: BAND_HOW },
  { match: 'finance.', how: "Finance's figures are not shown in Manager mode." },
  {
    match: 'requests.chain.',
    how: 'The leader threshold is an amount; the chain preview says when a request goes over it.',
  },
  { match: 'plan.leave.', how: NO_LEAVE },
  { match: 'cost.guard.floorUsd', how: NO_AMOUNTS },
  DATA_METRICS_HIDE,
])

const ITEMS_HOW: Readonly<Record<string, string>> = {
  'requests:backfill-new-position:': 'Backfill flags are for HRBPs and Finance.',
  'requests:backfill-no-exit:': 'Backfill flags are for HRBPs and Finance.',
  'plan:frozen-opening:': 'Openings under a freeze are for HRBPs and Finance.',
}

export const MANAGER_POLICY: RolePolicy = {
  mode: 'manager',
  views,
  tabs,
  hiddenParts: {},
  metrics: { hidePrefixes: metrics.hidePrefixes, hide: metrics.hide },
  hiddenFigures: ['plan-cost-by-unit'],
  hiddenFigurePrefixes: [],
  drillKinds: ['positions', 'requests', 'reqs', 'actionItems', 'actionOwners'],
  hiddenColumns: [...PAY_COLUMNS, ...BAND_COLUMNS],
  drillListed: limited('Rows outside your team are left out.'),
  datasets: ['positions', 'workers', 'reqs', 'requests', 'freezes'],
  hiddenItemPrefixes: Object.keys(ITEMS_HOW),
  articles: articlesFor({ mode: 'manager', views, tabs }),
  tours: toursFor({ mode: 'manager', views, tabs }),
  surfaces: {
    ...frameSurfaces({
      mode: 'manager',
      views,
      scope: { words: 'your team', button: 'Reads "Manager:" and the name you act as.' },
      filters: {
        leaderId: limited('Pinned inside your team, include only; leaders inside it can be picked.'),
        exclude: limited('Level and location include or exclude; the leader filter includes only.'),
        chain: limited('Starts at your own seat; nobody above.'),
        'in-scope': limited('Counts positions in your team.'),
        standard: limited('Read only: the saved data standard.'),
        'saved-views': limited(
          'Every view applies inside your team; one whose page is hidden opens My team.',
        ),
        reset: limited('Returns to your whole team and the default period.'),
      },
      report: limited('Adds "Mode: Manager (manager set, name left out)".'),
    }),
    'focus:leave-out-leader': hidden('Leaving out a leader would leave your team.'),
    'tab:finance.assumptions:trade-rates': hidden(FINANCE_OWN),
    'dataset:comp': hidden('Pay records are not part of Manager mode.'),
    'dataset:targets': hidden("Targets are Finance's heads and cost per org."),
    'dataset:assumptions': hidden("Rates and drivers are Finance's."),
    ...metrics.surfaces,
    ...columnSurfaces(PAY_COLUMNS, hidden(NO_AMOUNTS)),
    ...columnSurfaces(BAND_COLUMNS, hidden(BAND_HOW)),
    ...Object.fromEntries(Object.entries(ITEMS_HOW).map(([k, how]) => [`item:${k}`, hidden(how)])),
  },
  actions: actionsFor('manager'),
}
