/**
 * HRBP mode's table (docs/PLAN.md 8.3): one business unit's plan and cycle, cost rounded down to
 * $0.1M per cost atom at QTD, YTD and full year (7.3), one leave count for the whole unit (7.7).
 * Versions, freezes, bands and trade rates read only; the unit's operational assumptions editable in
 * Working. An allowlist: what this table does not name is hidden. Plain data.
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

const UNIT = 'Your business unit.'
const forecast = limited(FORECAST_ROUNDED)

const views: Record<PolicyPlace, Decision> = {
  home: SHOWN,
  team: hidden(TEAM_HOW),
  plan: limited(UNIT),
  requests: limited(UNIT),
  forecast,
  targets: limited('Your unit.'),
  whatif: SHOWN,
  finance: limited("Versions, freezes and bands are read only; Export is Finance's."),
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
    new: SHOWN,
    mine: SHOWN,
    approvals: SHOWN,
    cycle: limited(UNIT),
  },
  forecast: { overview: forecast, variance: forecast, bridge: forecast },
  targets: {
    gap: limited('Your unit.'),
    suborgs: limited('Read only. Leaders split sub-org targets.'),
    tree: limited('Your unit.'),
  },
  whatif: { levers: SHOWN },
  finance: {
    versions: limited('Read only.'),
    assumptions: limited(
      "Bands, FX, loads and attrition are read only. Your unit's time to fill, fill rate and backfill settings can be edited in Working.",
    ),
    freezes: limited("Read only. Openings held show; savings amounts are Finance's."),
    reconcile: limited(UNIT),
    export: hidden("Load files are Finance's and HR admin's."),
  },
})

const metrics = metricHides([...ROUNDED_METRIC_HIDES, DATA_METRICS_HIDE])

export const HRBP_POLICY: RolePolicy = {
  mode: 'hrbp',
  views,
  tabs,
  hiddenParts: {},
  metrics: { hidePrefixes: metrics.hidePrefixes, hide: metrics.hide },
  hiddenFigures: [],
  hiddenFigurePrefixes: [],
  // Back-dated adjustments show as counts only in HRBP mode (docs/PLAN.md 9.4, Finance > Versions).
  drillKinds: DRILL_KINDS.filter((k) => k !== 'adjustments'),
  hiddenColumns: ROUNDED_HIDDEN_COLUMNS,
  drillListed: limited('Rows outside your business unit are left out.'),
  datasets: ALL_DATASETS,
  hiddenItemPrefixes: [],
  articles: articlesFor({ mode: 'hrbp', views, tabs }),
  tours: toursFor({ mode: 'hrbp', views, tabs }),
  surfaces: {
    ...frameSurfaces({
      mode: 'hrbp',
      views,
      scope: { words: 'your business unit', button: 'Reads "HRBP:" and your unit.' },
      filters: {
        businessUnit: limited('Pinned to your business unit.'),
        department: limited('Departments of your unit only.'),
        leaderId: limited('Leaders with positions in your unit.'),
        period: ROUNDED_PERIOD,
        'in-scope': limited('Counts positions in your unit.'),
        'saved-views': limited(
          'Every view applies inside your unit; one whose page is hidden opens Unit plan.',
        ),
        reset: limited('Returns to your whole unit and the default period.'),
      },
      report: limited('Adds the mode line, which names your unit.'),
    }),
    'tab:finance.assumptions:trade-rates': limited('Read only.'),
    'metric:finance.trade.standardHead': limited('Read only.'),
    'drill:adjustments': hidden('Back-dated adjustments show as counts in HRBP mode.'),
    'dataset:comp': limited("Read for cost totals under the guard; no one's pay is listed."),
    ...metrics.surfaces,
    ...ROUNDED_COLUMN_SURFACES,
  },
  actions: actionsFor('hrbp'),
}
