/**
 * Finance mode's table (docs/PLAN.md 8.3): the whole company, targets, assumptions, FX, freezes,
 * cycles, close and locks; exact cost totals over 5 or more costed people from one cost-center fold
 * per unit (7.4), never one person's pay, performance or leave. Filters by unit, cost center, legal
 * entity, country and currency, include only. Eliminations, filled-seat changes and transfers show as
 * position ID, title, level and org (8.4 rule 2). An allowlist: what this table does not name is
 * hidden. Plain data.
 */
import { LEAVE_COLUMNS, PAY_COLUMNS } from '../ids'
import { NO_LEAVE } from '../leave'
import { actionsFor } from './actions'
import { articlesFor, toursFor } from './help'
import {
  ALL_DATASETS,
  ALL_DRILL_KINDS,
  AUDIT_LIMITED,
  columnSurfaces,
  DATA_METRICS_HIDE,
  DATA_ROOM_HOW,
  FINANCE_DIMENSION,
  frameSurfaces,
  metricHides,
  POSITIONS_BAND,
  TEAM_HOW,
  tabTable,
} from './kit'
import { type Decision, hidden, limited, type PolicyPlace, type RolePolicy, SHOWN } from './types'

const whatif = limited('Levers and results. Turning them into requests is for HRBPs and leaders.')

const views: Record<PolicyPlace, Decision> = {
  home: SHOWN,
  team: hidden(TEAM_HOW),
  plan: limited('Every unit; Transfers are left out.'),
  requests: limited(
    'Every unit; eliminations and changes to a filled seat show position ID, title, level and org only.',
  ),
  forecast: SHOWN,
  targets: SHOWN,
  whatif,
  finance: SHOWN,
  data: hidden(DATA_ROOM_HOW),
  actions: limited('No item is about one person.'),
  audit: limited(AUDIT_LIMITED),
}

const tabs = tabTable(views, {
  home: { overview: SHOWN },
  plan: {
    overview: SHOWN,
    positions: limited(POSITIONS_BAND),
    openings: limited('No offer amounts or one-time hiring costs per req.'),
    // Heads only (9.7, C36): no offer amount or band estimate reaches it, so Finance sees it whole.
    hiring: SHOWN,
    transfers: hidden('Transfers move named people. Finance sees their effect in the bridge and in Targets.'),
  },
  requests: {
    queue: limited('Eliminations and filled-seat changes show position ID, title, level and org only.'),
    new: hidden('Finance sets targets and gives final approval. It does not raise requests.'),
    mine: SHOWN,
    approvals: SHOWN,
    cycle: SHOWN,
  },
  whatif: { levers: whatif },
  finance: {
    versions: SHOWN,
    assumptions: SHOWN,
    freezes: SHOWN,
    reconcile: SHOWN,
    export: limited('Groups under 5 are suppressed in the load file.'),
  },
})

const metrics = metricHides([{ match: 'plan.leave.', how: NO_LEAVE }, DATA_METRICS_HIDE])

const MANAGER_ITEMS = 'Items owned by one manager are left out of Finance mode.'
/** Action center items owned by one manager (9.6): Finance lists no item about one person. */
const HIDDEN_ITEMS: readonly string[] = [
  'requests:sent-back:',
  'requests:not-submitted:',
  'plan:planned-no-req:',
  'plan:past-start:',
  'plan:req-on-eliminated:',
  'requests:trade-credit-lapse:',
]
const ONE_PAY = "Finance mode shows totals, never one person's pay."
const INCLUDE_ONLY = "Finance mode's filters include only."
const NO_LEADER = 'Finance mode does not filter by leader.'
const FILTER_TO = limited('Offered for unit, cost center, legal entity, country and currency.')

export const FINANCE_POLICY: RolePolicy = {
  mode: 'finance',
  views,
  tabs,
  hiddenParts: {},
  metrics: { hidePrefixes: metrics.hidePrefixes, hide: metrics.hide },
  hiddenFigures: ['plan-transfers-kpis', 'plan-transfers-table'],
  hiddenFigurePrefixes: [],
  drillKinds: ALL_DRILL_KINDS,
  hiddenColumns: [...PAY_COLUMNS, ...LEAVE_COLUMNS],
  drillListed: limited('Amount columns are left out of records; cost totals cover 5 or more costed people.'),
  datasets: ALL_DATASETS,
  hiddenItemPrefixes: HIDDEN_ITEMS,
  articles: articlesFor({ mode: 'finance', views, tabs }),
  tours: toursFor({ mode: 'finance', views, tabs }),
  surfaces: {
    ...frameSurfaces({
      mode: 'finance',
      views,
      filters: {
        businessUnit: FINANCE_DIMENSION,
        costCenter: FINANCE_DIMENSION,
        legalEntity: FINANCE_DIMENSION,
        country: FINANCE_DIMENSION,
        currency: FINANCE_DIMENSION,
        exclude: hidden(INCLUDE_ONLY),
        chain: hidden(NO_LEADER),
        standard: limited('Read only: the saved data standard.'),
        'saved-views': limited(
          "A view applies through Finance's filters; one whose page is hidden opens Plan vs actual.",
        ),
      },
    }),
    'focus:filter-to': FILTER_TO,
    'focus:finding': FILTER_TO,
    'focus:leave-out': hidden(INCLUDE_ONLY),
    'focus:leave-out-leader': hidden(NO_LEADER),
    'tab:finance.assumptions:trade-rates': SHOWN,
    'dataset:comp': limited("Read for cost totals over 5 or more costed people; no one's pay is listed."),
    'dataset:workers': limited('No leave fields.'),
    ...metrics.surfaces,
    ...columnSurfaces(PAY_COLUMNS, hidden(ONE_PAY)),
    ...columnSurfaces(LEAVE_COLUMNS, hidden(NO_LEAVE)),
    ...Object.fromEntries(HIDDEN_ITEMS.map((k) => [`item:${k}`, hidden(MANAGER_ITEMS)])),
  },
  actions: actionsFor('finance'),
}
