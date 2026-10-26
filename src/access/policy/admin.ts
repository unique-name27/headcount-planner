/**
 * HR admin mode's table (docs/PLAN.md 8.3): everything, the Data room and imports, with one person's
 * pay and leave behind "Show pay amounts" (7.5). With the switch off, cost follows Finance's exact
 * rules and filter rule; that is the cost guard's (src/cost/), not this table's. The role homes and
 * My team are the other modes': HR admin opens on the Data room. Written as a table like the other
 * four, so every mode is plain data. Plain data.
 */
import { LEAVE_COLUMNS, METRIC_IDS, PAY_COLUMNS } from '../ids'
import { actionsFor } from './actions'
import { articlesFor, toursFor } from './help'
import { ALL_DATASETS, ALL_DRILL_KINDS, columnSurfaces, frameSurfaces, TEAM_HOW, tabTable } from './kit'
import { type Decision, hidden, limited, type PolicyPlace, type RolePolicy, SHOWN } from './types'

const views: Record<PolicyPlace, Decision> = {
  home: hidden("HR admin opens on the Data room. Switch modes to see a role's home."),
  team: hidden(TEAM_HOW),
  plan: SHOWN,
  requests: SHOWN,
  forecast: SHOWN,
  targets: SHOWN,
  whatif: SHOWN,
  finance: SHOWN,
  data: SHOWN,
  actions: SHOWN,
  audit: SHOWN,
}

// Plan > Hiring is named for the hiring freeze (9.7, C36); every other tab is shown by default.
const adminTabs = tabTable(views, { plan: { hiring: SHOWN } })

const SWITCH_ON = limited('With Show pay amounts on.')

export const ADMIN_POLICY: RolePolicy = {
  mode: 'hr-admin',
  views,
  tabs: adminTabs,
  hiddenParts: {},
  metrics: { hidePrefixes: [], hide: [] },
  hiddenFigures: [],
  hiddenFigurePrefixes: [],
  drillKinds: ALL_DRILL_KINDS,
  drillListed: SHOWN,
  datasets: ALL_DATASETS,
  hiddenItemPrefixes: [],
  articles: articlesFor({ mode: 'hr-admin', views, tabs: adminTabs }),
  tours: toursFor({ mode: 'hr-admin', views, tabs: adminTabs }),
  surfaces: {
    ...frameSurfaces({ mode: 'hr-admin', views, owner: true }),
    // Every metric shows in HR admin, My team's included (its glossary and Settings > Formulas list
    // them all, as the template app's full mode does), whatever views a metric is listed on.
    ...Object.fromEntries(METRIC_IDS.map((id) => [`metric:${id}`, SHOWN])),
    'tab:finance.assumptions:trade-rates': SHOWN,
    ...columnSurfaces(PAY_COLUMNS, SWITCH_ON),
    ...columnSurfaces(LEAVE_COLUMNS, SWITCH_ON),
  },
  actions: actionsFor('hr-admin'),
}
