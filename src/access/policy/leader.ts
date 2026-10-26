/**
 * Leader mode's table (docs/PLAN.md 8.3): one leader's org against its target (the CEO, CFO and CHRO
 * see the whole company), approvals, sub-org targets and What if; cost rounded down to $0.1M per cost
 * atom at QTD, YTD and full year (7.3), one leave count for the whole org (7.7). Finance's tabs are
 * Finance's. An allowlist: what this table does not name is hidden. Plain data.
 */
import { DRILL_KINDS } from '../ids'
import { actionsFor } from './actions'
import { articlesFor, toursFor } from './help'
import {
  ACTIONS_SCOPED,
  ALL_DATASETS,
  AUDIT_LIMITED,
  DATA_METRICS_HIDE,
  DATA_ROOM_HOW,
  FINANCE_OWN,
  FORECAST_ROUNDED,
  frameSurfaces,
  metricHides,
  POSITIONS_BAND,
  ROUNDED_PERIOD,
  TEAM_HOW,
  tabTable,
} from './kit'
import { ROUNDED_COLUMN_SURFACES, ROUNDED_HIDDEN_COLUMNS, ROUNDED_METRIC_HIDES } from './rounded'
import { type Decision, hidden, limited, type PolicyPlace, type RolePolicy, SHOWN } from './types'

const ORG = 'Your org.'
const forecast = limited(FORECAST_ROUNDED)

const views: Record<PolicyPlace, Decision> = {
  home: SHOWN,
  team: hidden(TEAM_HOW),
  plan: limited(ORG),
  requests: limited(ORG),
  forecast,
  targets: limited(ORG),
  whatif: SHOWN,
  finance: hidden(FINANCE_OWN),
  data: hidden(DATA_ROOM_HOW),
  actions: limited(ACTIONS_SCOPED),
  audit: limited(AUDIT_LIMITED),
}

const tabs = tabTable(views, {
  home: { overview: SHOWN },
  plan: {
    overview: SHOWN,
    positions: limited(POSITIONS_BAND),
    openings: SHOWN,
    // Heads only (9.7, C36): shown in every mode, over the mode's own scope.
    hiring: SHOWN,
    transfers: SHOWN,
  },
  requests: {
    queue: limited('Your unit or org.'),
    new: limited('Inside your team or org.'),
    mine: SHOWN,
    approvals: SHOWN,
    cycle: limited('Your org, within its envelope.'),
  },
  forecast: { overview: forecast, variance: forecast, bridge: forecast },
  targets: { gap: limited(ORG), suborgs: SHOWN, tree: limited(ORG) },
  whatif: { levers: SHOWN },
})

const metrics = metricHides([...ROUNDED_METRIC_HIDES, DATA_METRICS_HIDE])

/** Finance's own records: back-dated adjustments (Finance > Versions) and reconciliation exceptions. */
const FINANCE_KINDS = new Set<string>(['adjustments', 'exceptions'])

export const LEADER_POLICY: RolePolicy = {
  mode: 'leader',
  views,
  tabs,
  hiddenParts: {},
  metrics: { hidePrefixes: metrics.hidePrefixes, hide: metrics.hide },
  hiddenFigures: [],
  hiddenFigurePrefixes: [],
  drillKinds: DRILL_KINDS.filter((k) => !FINANCE_KINDS.has(k)),
  hiddenColumns: ROUNDED_HIDDEN_COLUMNS,
  drillListed: limited('Rows outside your org are left out.'),
  datasets: ALL_DATASETS,
  hiddenItemPrefixes: [],
  articles: articlesFor({ mode: 'leader', views, tabs }),
  tours: toursFor({ mode: 'leader', views, tabs }),
  surfaces: {
    ...frameSurfaces({
      mode: 'leader',
      views,
      scope: { words: 'your org', button: 'Reads "Leader:" and the name you act as.' },
      filters: {
        leaderId: limited('Pinned inside your org, include only.'),
        chain: limited('Starts at your own seat; nobody above.'),
        period: ROUNDED_PERIOD,
        'in-scope': limited('Counts positions in your org.'),
        'saved-views': limited(
          'Every view applies inside your org; one whose page is hidden opens Rollup vs target.',
        ),
        reset: limited('Returns to your whole org and the default period.'),
      },
      report: limited('Adds the mode line; the leader is left out.'),
    }),
    'tab:finance.assumptions:trade-rates': hidden('Leaders see weights on requests.'),
    'metric:finance.trade.standardHead': limited('On trade cards in your org, beside the band estimates.'),
    'drill:adjustments': hidden("Back-dated adjustments are Finance's."),
    'drill:exceptions': hidden('Reconciliation is for HRBPs and Finance.'),
    'dataset:comp': limited("Read for cost totals under the guard; no one's pay is listed."),
    ...metrics.surfaces,
    ...ROUNDED_COLUMN_SURFACES,
  },
  actions: actionsFor('leader'),
}
