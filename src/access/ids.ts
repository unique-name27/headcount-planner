/**
 * Every surface and action id the policy decides, as data (docs/PLAN.md 8.3, 9.1, 9.3, 9.6, 11.6
 * and 12): the views and their tabs, the pages, the figure prefixes and home figures, the metrics,
 * the money, leave, cost and trade surfaces, the exports, settings, masthead and filter controls,
 * the drill kinds and their columns, and every action. `policy.test.ts` asserts that every id here
 * has an explicit decision in every mode, and `matrix.test.ts` lists them in its snapshots. The
 * policy never imports the view registry, so the tab lists are repeated here (`VIEW_TABS`, as the
 * template app's `kit.ts VIEW_TABS`); the views builder keeps the registry equal to them (a test).
 *
 * `PLAN_GRID` repeats the letters of docs/PLAN.md 8.3 (S shown, L limited, H hidden, one letter per
 * mode in `MODES` order: Manager, HRBP, Leader, Finance, HR admin), so the matrix test can check
 * the tables against the plan without retyping it.
 *
 * Plain data (the metric ids come from the views' frozen `ID` maps, which are plain data too).
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); new ids may be added, never renamed.
 */
import type { DatasetKey, PageKey, ViewKey } from '@/data/schema'
import { FILTER_DIMENSIONS } from '@/data/scope'
import { SETTINGS_SECTIONS } from '@/data/settings'
import { RULE_SETTINGS } from '@/metrics/rules'
import { ID as ACTIONS_ID } from '@/views/actions/metrics'
import { ID as AUDIT_ID } from '@/views/audit/metrics'
import { ID as DATA_ID } from '@/views/data/roomMetrics'
import { ID as FINANCE_ID } from '@/views/finance/metrics'
import { ID as FORECAST_ID } from '@/views/forecast/metrics'
import { ID as PLAN_ID } from '@/views/plan/metrics'
import { ID as REQUESTS_ID } from '@/views/requests/metrics'
import { ID as TARGETS_ID } from '@/views/targets/metrics'
import { ID as TEAM_ID } from '@/views/team/metrics'
import { ID as WHATIF_ID } from '@/views/whatif/metrics'
import {
  type CostSurfacePart,
  type ExportKind,
  type FilterControl,
  type FocusPart,
  type LeavePart,
  type MastheadControl,
  type PayPart,
  S,
  type ShortcutKey,
  type SurfaceId,
  type UiPart,
} from './surfaces'

/* ───────────── views, tabs and pages (docs/PLAN.md 9.1) ───────────── */

/** One tab of a view: its address key and its label. */
export interface TabDef {
  key: string
  label: string
}

/**
 * The tabs that are heads only in every mode (Plan > Hiring 9.7, Plan > Recruiting summary 9.8): their
 * own files carry no long CSV control totals, which are cost (src/app/tabExport.ts, review RP-1).
 */
export const HEADS_ONLY_TABS: readonly { view: ViewKey; tab: string }[] = [
  { view: 'plan', tab: 'hiring' },
  { view: 'plan', tab: 'recruiting' },
]

/** Every view's tabs in tab order, the first the default (docs/PLAN.md 9.1). */
export const VIEW_TABS: Readonly<Record<ViewKey, readonly TabDef[]>> = {
  home: [{ key: 'overview', label: 'Overview' }],
  team: [{ key: 'overview', label: 'Overview' }],
  plan: [
    { key: 'overview', label: 'Overview' },
    { key: 'positions', label: 'Positions' },
    { key: 'openings', label: 'Openings' },
    // Hiring progress (docs/PLAN.md 9.7, change C36): heads only, shown in every mode.
    { key: 'hiring', label: 'Hiring' },
    // Recruiting summary (docs/PLAN.md 9.8, change C38): one screen to show, heads only, every mode.
    { key: 'recruiting', label: 'Recruiting summary' },
    { key: 'transfers', label: 'Transfers' },
  ],
  requests: [
    { key: 'queue', label: 'Queue' },
    { key: 'new', label: 'New' },
    { key: 'mine', label: 'Mine' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'cycle', label: 'Cycle' },
  ],
  forecast: [
    { key: 'overview', label: 'Overview' },
    { key: 'variance', label: 'Variance' },
    { key: 'bridge', label: 'Bridge' },
  ],
  targets: [
    { key: 'gap', label: 'Gap' },
    { key: 'suborgs', label: 'Sub-org targets' },
    { key: 'tree', label: 'Tree × cost center' },
  ],
  whatif: [{ key: 'levers', label: 'Levers' }],
  finance: [
    { key: 'versions', label: 'Versions' },
    { key: 'assumptions', label: 'Assumptions' },
    { key: 'freezes', label: 'Freezes' },
    { key: 'reconcile', label: 'Reconcile' },
    { key: 'export', label: 'Export' },
  ],
}

/** Parts of a tab picked by address (`#finance.assumptions:trade-rates`), each decided on its own. */
export const TAB_PARTS: readonly { view: ViewKey; tab: string; part: string; label: string }[] = [
  { view: 'finance', tab: 'assumptions', part: 'trade-rates', label: 'Trade rates' },
]

/** The Data room's tabs (`data:<key>`, docs/PLAN.md 9.1); every one follows `page:data`. */
export const DATA_TABS: readonly TabDef[] = [
  { key: 'datasets', label: 'Datasets' },
  { key: 'quality', label: 'Data quality' },
  { key: 'metrics', label: 'Metric definitions' },
  { key: 'lists', label: 'Lists' },
  { key: 'workspace', label: 'Workspace' },
]

const VIEWS = Object.keys(VIEW_TABS) as ViewKey[]
const PAGES: readonly PageKey[] = ['data', 'actions', 'audit']

export const VIEW_SURFACES: readonly SurfaceId[] = VIEWS.map((v) => S.view(v))
export const TAB_SURFACES: readonly SurfaceId[] = [
  ...VIEWS.flatMap((v) => VIEW_TABS[v].map((t) => S.tab(v, t.key))),
  ...TAB_PARTS.map((p) => S.tab(p.view, `${p.tab}:${p.part}`)),
]
export const PAGE_SURFACES: readonly SurfaceId[] = PAGES.map((p) => S.page(p))
export const DATA_TAB_SURFACES: readonly SurfaceId[] = DATA_TABS.map((t) => S.data(t.key))

/* ───────────── figures (docs/PLAN.md 9.1 and 9.3) ───────────── */

/**
 * Figure id prefixes: a view's figures are `<view>-<thing>`, a role home's `home-<slug>-<thing>`
 * (src/access/modes.ts `HOME_SLUG`). A view a mode hides hides every figure with its prefix,
 * wherever drawn. Listed in the matrix as `figure:<prefix>*`.
 */
export const FIGURE_PREFIXES: readonly string[] = [
  'team-',
  'plan-',
  'requests-',
  'forecast-',
  'targets-',
  'whatif-',
  'finance-',
  'actions-',
  'audit-',
  'data-',
  'home-unit-',
  'home-rollup-',
  'home-fin-',
]
export const FIGURE_PREFIX_SURFACES: readonly SurfaceId[] = FIGURE_PREFIXES.map((p) => S.figure(`${p}*`))

/** The homes' figures (docs/PLAN.md 9.3), with the place each sits on. */
export const HOME_FIGURES: readonly { id: string; view: ViewKey; tab?: string }[] = [
  { id: 'team-heads-vs-allocation', view: 'team', tab: 'overview' },
  { id: 'home-unit-openings', view: 'home', tab: 'overview' },
  { id: 'home-unit-forecast', view: 'home', tab: 'overview' },
  { id: 'home-rollup-suborgs', view: 'home', tab: 'overview' },
  { id: 'home-fin-bridge', view: 'home', tab: 'overview' },
  { id: 'home-fin-cost-unit', view: 'home', tab: 'overview' },
  // Shared by every role home: Needs attention, Waiting on others and My list.
  { id: 'home-attention', view: 'home', tab: 'overview' },
  { id: 'home-attention-wait', view: 'home', tab: 'overview' },
  { id: 'home-list', view: 'home', tab: 'overview' },
]
export const HOME_FIGURE_SURFACES: readonly SurfaceId[] = HOME_FIGURES.map((f) => S.figure(f.id))

/* ───────────── metrics (docs/PLAN.md 12) ───────────── */

/**
 * Every metric id of the eight home views and the pages (the Audit page's, the Action center's and
 * the Data room's, PLAN 12), then the rule entries, in catalog order.
 */
export const METRIC_IDS: readonly string[] = [
  ...new Set<string>([
    ...Object.values(TEAM_ID),
    ...Object.values(PLAN_ID),
    ...Object.values(REQUESTS_ID),
    ...Object.values(FORECAST_ID),
    ...Object.values(TARGETS_ID),
    ...Object.values(WHATIF_ID),
    ...Object.values(FINANCE_ID),
    ...Object.values(AUDIT_ID),
    ...Object.values(ACTIONS_ID),
    ...Object.values(DATA_ID),
    ...RULE_SETTINGS.map((r) => r.metricId),
  ]),
]
export const METRIC_SURFACES: readonly SurfaceId[] = METRIC_IDS.map((id) => S.metric(id))

/* ───────────── money, leave, cost and trade (docs/PLAN.md 8.3 and 11.6) ───────────── */

export const PAY_PARTS: readonly PayPart[] = ['switch', 'amounts', 'exact', 'rounded']
export const COST_SURFACE_PARTS: readonly CostSurfacePart[] = ['band', 'monthly', 'component']
export const LEAVE_PARTS: readonly LeavePart[] = ['counts', 'people']

/** The pay, cost and trade surfaces of 8.3's money table (the standard head in USD is its own metric). */
export const MONEY_SURFACES: readonly SurfaceId[] = [
  ...PAY_PARTS.map((p) => S.pay(p)),
  ...COST_SURFACE_PARTS.map((p) => S.cost(p)),
  S.ui('trade-weights'),
  S.metric('finance.trade.standardHead'),
]
export const LEAVE_SURFACES: readonly SurfaceId[] = LEAVE_PARTS.map((p) => S.leave(p))

/* ───────────── the frame: exports, settings, masthead, filters, header, focus, shortcuts, ui ───────────── */

/**
 * Exports that are not actions. The figure CSV and Excel, the whole-view workbook, the deck, the
 * long CSV, the load file and the workspace files are actions (`action:export.*`, 8.3), so no
 * export carries two decisions.
 */
export const EXPORT_KINDS: readonly ExportKind[] = ['link', 'records', 'action-list', 'data-room', 'formulas']
export const EXPORT_SURFACES: readonly SurfaceId[] = EXPORT_KINDS.map((k) => S.export(k))

/** Settings sections (src/data/settings.ts), plus the settings file buttons of This device. */
export const SETTINGS_SURFACES: readonly SurfaceId[] = [
  ...SETTINGS_SECTIONS.map((s) => S.settings(s)),
  S.settings('device-files'),
]

export const MASTHEAD_CONTROLS: readonly MastheadControl[] = [
  'wordmark',
  'company',
  'mode',
  'pay-tags',
  'read-only',
  'actions',
  'audit',
  'data',
  'workspace',
  'settings',
  'help',
  'skip',
]
export const MASTHEAD_SURFACES: readonly SurfaceId[] = MASTHEAD_CONTROLS.map((c) => S.masthead(c))

/** The filter row: its controls, the version and comparison pickers, and one menu per filter dimension. */
export const FILTER_CONTROLS: readonly FilterControl[] = [
  'saved-views',
  'period',
  'version',
  'compare',
  ...FILTER_DIMENSIONS,
  'exclude',
  'chain',
  'in-scope',
  'standard',
  'chips',
  'reset',
]
export const FILTER_SURFACES: readonly SurfaceId[] = FILTER_CONTROLS.map((c) => S.filter(c))

/** A view's header actions, and the scope line and About link every view header has. */
export const HEADER_SURFACES: readonly SurfaceId[] = [
  ...VIEWS.map((v) => S.header(v)),
  S.header('scope'),
  S.header('about'),
]
export const FOCUS_PARTS: readonly FocusPart[] = ['filter-to', 'leave-out', 'leave-out-leader', 'finding']
export const FOCUS_SURFACES: readonly SurfaceId[] = FOCUS_PARTS.map((f) => S.focus(f))
export const SHORTCUT_KEYS: readonly ShortcutKey[] = ['help', 'keys', 'tabs', 'tour']
export const SHORTCUT_SURFACES: readonly SurfaceId[] = SHORTCUT_KEYS.map((k) => S.shortcut(k))
export const UI_PARTS: readonly UiPart[] = [
  'trade-weights',
  'tier-badge',
  'edit-definition',
  'route-link',
  'attention-lists',
  'kpi-delta-company',
]
export const UI_SURFACES: readonly SurfaceId[] = UI_PARTS.map((p) => S.ui(p))

/* ───────────── datasets, drill kinds and columns (docs/PLAN.md 8.3) ───────────── */

export const DATASET_SURFACE_KEYS: readonly DatasetKey[] = [
  'positions',
  'workers',
  'comp',
  'reqs',
  'requests',
  'targets',
  'freezes',
  'assumptions',
]
export const DATASET_SURFACES: readonly SurfaceId[] = DATASET_SURFACE_KEYS.map((k) => S.dataset(k))

/**
 * The records a drill can list (`drill:<kind>`). The UX layer's `DrillRecordMap` (src/drill/types.ts)
 * keys must equal this list: positions (heads, openings; opens the position card), planLines
 * (position × version × month; amounts are `pay: true`), assignments, workers (not in plan,
 * reconciliation; leave fields `pay: true`), reqs (offer amounts `pay: true`), requests, targets,
 * freezes, assumptions, versions, adjustments (back-dated, by position, no amount), audit rows,
 * reconciliation exceptions, costGroups (guarded group totals: never one person), actionItems and
 * actionOwners (the Action center's).
 */
export const DRILL_KINDS = [
  'positions',
  'planLines',
  'assignments',
  'workers',
  'reqs',
  'requests',
  'targets',
  'freezes',
  'assumptions',
  'versions',
  'adjustments',
  'audit',
  'exceptions',
  'costGroups',
  'actionItems',
  'actionOwners',
] as const
export type DrillKind = (typeof DRILL_KINDS)[number]
export const DRILL_SURFACES: readonly SurfaceId[] = DRILL_KINDS.map((k) => S.drill(k))

/**
 * Standard columns a mode may hide (`column:<kind>.<key>`, docs/PLAN.md 8.3): the `pay: true`
 * amount columns (outside HR admin with the switch), the band estimate (hidden in Manager mode), the
 * component columns (`cost:component`) and the leave columns (HR admin only).
 */
export const PAY_COLUMNS: readonly string[] = [
  'planLines.usdBase',
  'planLines.usdBonus',
  'planLines.usdBurden',
  'planLines.usdBenefits',
  'planLines.usdOneTime',
  'planLines.usdVacancy',
  'planLines.usdEquity',
  'planLines.usdLoaded',
  'planLines.localBase',
  'planLines.localBonus',
  'planLines.localBurden',
  'planLines.localBenefits',
  'planLines.localOneTime',
  'planLines.localVacancy',
  'reqs.offerBase',
  'reqs.signOnBonus',
  'reqs.relocation',
  'reqs.agencyFee',
  'positions.costAnnual',
]
export const BAND_COLUMNS: readonly string[] = ['positions.bandEstimate']
export const COMPONENT_COLUMNS: readonly string[] = [
  'costGroups.base',
  'costGroups.bonus',
  'costGroups.burden',
  'costGroups.benefits',
  'costGroups.oneTime',
  'costGroups.loadedInclSbc',
]
export const LEAVE_COLUMNS: readonly string[] = ['workers.onLeave', 'workers.leavePaid']
export const COLUMN_SURFACES: readonly SurfaceId[] = [
  ...PAY_COLUMNS,
  ...BAND_COLUMNS,
  ...COMPONENT_COLUMNS,
  ...LEAVE_COLUMNS,
].map((c) => {
  const dot = c.indexOf('.')
  return S.column(c.slice(0, dot), c.slice(dot + 1))
})

/* ───────────── Action center items (docs/PLAN.md 9.6) ───────────── */

/** Every item kind (`<view>:<kind>`); an item's id is `<view>:<kind>:<record>`. */
export const ITEM_KINDS = [
  'requests:approve',
  'requests:waiting',
  'requests:sent-back',
  'requests:not-submitted',
  'requests:backfill-new-position',
  'requests:backfill-no-exit',
  'plan:planned-no-req',
  'plan:past-start',
  'plan:frozen-opening',
  'plan:req-on-eliminated',
  'targets:suborg-over',
  'finance:reconcile',
  'finance:envelope-exception',
  'finance:cycle-due',
  'requests:trade-credit-lapse',
] as const
export type ItemKind = (typeof ITEM_KINDS)[number]
/** `item:<view>:<kind>:`, the prefix every item of a kind starts with. */
export const ITEM_SURFACES: readonly SurfaceId[] = ITEM_KINDS.map((k) => S.item(`${k}:`))

/* ───────────── actions (docs/PLAN.md 8.3 and 11.6) ───────────── */

/** Every action, in 8.3's order. `policy.test.ts` asserts a decision for each in every mode. */
export const ACTION_IDS = [
  'request.draft',
  'request.submit',
  'request.withdraw',
  'request.submit-on-behalf',
  'request.recruit',
  'request.propose-start',
  'request.trade',
  'request.approve',
  'request.reject',
  'request.send-back',
  'request.approve-with-changes',
  'request.comment',
  'request.read-approvers-only',
  'request.import',
  'position.edit',
  'transfer.process',
  'transfer.approve',
  'transfer.move-budget',
  'target.set',
  'target.exception',
  'target.split',
  'target.move',
  'whatif.use',
  'whatif.turn-into-requests',
  'cycle.open',
  'cycle.dates',
  'cycle.lock',
  'cycle.return',
  'cycle.advance',
  'cycle.rank',
  'cycle.cut-line',
  'cycle.copy-note',
  'version.create',
  'version.lock',
  'version.reopen',
  'close.month',
  'fx.set',
  'freeze.create',
  'freeze.edit',
  'assumptions.edit',
  'assumptions.edit-operational',
  'freeze.exception',
  'recon.review',
  'data.import',
  'workspace.import',
  'workspace.open-shared',
  'export.shareable',
  'export.requests',
  'export.for-manager',
  'export.full',
  'export.load-file-full',
  'export.load-file',
  'export.figure',
  'export.view',
  'export.deck',
  'export.long-csv',
] as const
export type ActionId = (typeof ACTION_IDS)[number]
export const isActionId = (v: unknown): v is ActionId =>
  typeof v === 'string' && (ACTION_IDS as readonly string[]).includes(v)
export const ACTION_SURFACES: readonly SurfaceId[] = ACTION_IDS.map((a) => S.action(a))

/* ───────────── help (docs/PLAN.md 14.2, M4 freeze) ───────────── */

/**
 * Every help article id of PLAN 14.2, in Help sheet order (group by group). `src/help/articles/`
 * holds exactly one article for each (src/help/contracts.test.ts), and every mode's table decides
 * each one (src/access/policy/help.ts `articlesFor`). Frozen in the M4 freeze: ids are never
 * renamed or dropped.
 */
export const HELP_ARTICLE_IDS = [
  // Start here
  'what-headcount-planner-is',
  'moving-around',
  'reading-a-number',
  'clicking-down',
  'exporting',
  'modes',
  // Each view (and the masthead pages)
  'view-home',
  'view-team',
  'view-plan',
  'view-requests',
  'view-forecast',
  'view-targets',
  'view-whatif',
  'view-finance',
  'view-data',
  'view-actions',
  'view-audit',
  // Your data
  'data-loading',
  'data-mapping',
  'data-tiers',
  'data-certify',
  'data-quality',
  'data-wrong',
  'data-workspace-file',
  'data-versions',
  // Definitions
  'definitions-how',
  'glossary',
  'cost-definition',
  'trading-heads',
  // Privacy and trust
  'privacy-browser',
  'about-server',
  'privacy-pay',
  'privacy-small-groups',
  'privacy-leave',
  'privacy-sample',
  // Help and support
  'shortcuts',
  'report-problem',
  'troubleshooting',
  'faq',
  'whats-new',
] as const
export type HelpArticleId = (typeof HELP_ARTICLE_IDS)[number]

/**
 * Every guided tour id of PLAN 14.2: the first tours, then one `view-<key>` tour per folder-tab view
 * (4 to 6 steps, at least 3 kept in every mode that shows it). `src/help/tours.ts` holds exactly one
 * tour for each. Frozen in the M4 freeze.
 */
export const HELP_TOUR_IDS = [
  'getting-started',
  'home-start',
  'requests-start',
  'own-data',
  'view-home',
  'view-team',
  'view-plan',
  'view-requests',
  'view-forecast',
  'view-targets',
  'view-whatif',
  'view-finance',
] as const
export type HelpTourId = (typeof HELP_TOUR_IDS)[number]

export const HELP_SURFACES: readonly SurfaceId[] = [
  ...HELP_ARTICLE_IDS.map((id) => S.article(id)),
  ...HELP_TOUR_IDS.map((id) => S.tour(id)),
]

/* ───────────── Plan > Hiring (docs/PLAN.md 9.7, change C36; the hiring freeze) ───────────── */

/** Where Plan > Hiring sits: its figures and tiles take this tab's decision. */
export const HIRING_AT = { view: 'plan', tab: 'hiring' } as const

/**
 * Plan > Hiring's figure ids, in page order (src/views/plan/engine/figures.ts holds them as
 * `PLAN_FIGURES.hiring*`; src/views/hiring.contracts.test.ts keeps the two equal): the key figures,
 * open to hire by quarter (the table), its small bar chart, hiring velocity, the hires of the last 3
 * months by location and department (change C37) and the readout.
 */
export const HIRING_FIGURE_IDS = [
  'plan-hiring-kpis',
  'plan-hiring-quarters',
  'plan-hiring-open',
  'plan-hiring-velocity',
  'plan-hiring-recent',
  'plan-hiring-readout',
] as const

/**
 * Plan > Hiring's key figure tile ids (`kpi:<id>`), in strip order (src/views/plan/engine/hiringTab.ts
 * `HIRING_KPIS` gives each its metric). The HRBP and Leader homes re-link the first by its metric id.
 */
export const HIRING_KPI_IDS = [
  'hiring-open',
  'hiring-accepted',
  'hiring-pace',
  'hiring-exit-pace',
  'hiring-net-pace',
  'hiring-months-to-close',
] as const

/** My team's Open to hire tile, under the hero Left to fill (9.7: Manager's home keeps its 7 key figures). */
export const TEAM_HIRING_FIGURE = 'team-open-to-hire'

/**
 * The records Plan > Hiring's counts open: seats (positions), people (workers) and accepted offers
 * (reqs, dates only). Manager mode lists no people records (`drill:workers` hidden), so there a
 * count of people opens the seats they hold; every listed kind keeps to the mode's scope
 * (`drillListed`: in Manager mode the tree strictly below the manager's seat).
 */
export const HIRING_DRILL_KINDS = ['positions', 'workers', 'reqs'] as const satisfies readonly DrillKind[]
export type HiringDrillKind = (typeof HIRING_DRILL_KINDS)[number]

/** The dated columns the hiring drills read their counts from (each follows its kind in every mode). */
export const HIRING_COLUMNS: readonly string[] = [
  'positions.plannedStart',
  'positions.endDate',
  'reqs.stage',
  'reqs.targetStartDate',
  'reqs.offerAcceptedDate',
  'reqs.startDate',
  'workers.hireDate',
  'workers.terminationDate',
]

/**
 * The standard columns every hiring drill leaves out (`DrillSpec.hide`) in every mode, HR admin with
 * "Show pay amounts" on included: the module is heads only, so no amount, band estimate, offer
 * amount or leave fact reaches it (9.7 Privacy). An accepted offer lists its IDs, status, stage and
 * dates only: its recruiter note is free text from the recruiting system that can carry the terms,
 * and its hiring manager can be someone above a Manager's seat (review HP-2, HP-5). The drill table
 * drops these keys from its rows as well as its columns (src/drill/records.ts, review HP-4).
 */
export const HIRING_DRILL_HIDE: Readonly<Record<HiringDrillKind, readonly string[]>> = {
  positions: ['bandEstimate', 'costAnnual'],
  reqs: [
    'offerBase',
    'offerCurrency',
    'signOnBonus',
    'relocation',
    'agencyFee',
    'recruiter',
    'hiringManager',
  ],
  workers: ['onLeave', 'leavePaid'],
}

/** Every surface Plan > Hiring adds, for `policy.test.ts`'s explicit-decision check (`NAMED_SURFACES`). */
export const HIRING_SURFACES: readonly SurfaceId[] = [
  S.tab(HIRING_AT.view, HIRING_AT.tab),
  ...HIRING_FIGURE_IDS.map((id) => S.figure(id)),
  S.figure(TEAM_HIRING_FIGURE),
  ...HIRING_KPI_IDS.map((id) => S.kpi(id)),
  ...HIRING_DRILL_KINDS.map((k) => S.drill(k)),
  ...HIRING_COLUMNS.map((c) => S.column(c.slice(0, c.indexOf('.')), c.slice(c.indexOf('.') + 1))),
]

/* ───────────── Plan > Recruiting summary (docs/PLAN.md 9.8, change C38) ───────────── */

/** Where Plan > Recruiting summary sits: its figures and tiles take this tab's decision. */
export const RECRUITING_AT = { view: 'plan', tab: 'recruiting' } as const

/**
 * Plan > Recruiting summary's figure ids, in page order (src/views/plan/engine/figures.ts holds them
 * as `PLAN_FIGURES.recruiting*`): the seven numbers, heads and hiring by month, by quarter ahead and
 * where hiring happened.
 */
export const RECRUITING_FIGURE_IDS = [
  'plan-recruiting-kpis',
  'plan-recruiting-months',
  'plan-recruiting-quarters',
  'plan-recruiting-where',
] as const

/** Its seven tiles (`kpi:<id>`), in strip order (src/views/plan/engine/recruitingTab.ts `RECRUITING_KPIS`). */
export const RECRUITING_KPI_IDS = [
  'recruiting-approved',
  'recruiting-current',
  'recruiting-open',
  'recruiting-future',
  'recruiting-projected',
  'recruiting-attrition',
  'recruiting-velocity',
] as const

/**
 * Every surface Plan > Recruiting summary adds, for `policy.test.ts`'s explicit-decision check. Its
 * drills are Plan > Hiring's (`HIRING_DRILL_KINDS`, `HIRING_COLUMNS`), already named there.
 */
export const RECRUITING_SURFACES: readonly SurfaceId[] = [
  S.tab(RECRUITING_AT.view, RECRUITING_AT.tab),
  ...RECRUITING_FIGURE_IDS.map((id) => S.figure(id)),
  ...RECRUITING_KPI_IDS.map((id) => S.kpi(id)),
]

/* ───────────── everything named ───────────── */

/**
 * Every surface id sections 8 to 11 name, plus the frame's controls and, from the M4 freeze, every
 * help article and tour (14.2), and from the hiring freeze Plan > Hiring's tab, figures, tiles,
 * drill kinds and columns (9.7): what `policy.test.ts` asserts an explicit decision for in every mode.
 */
export const NAMED_SURFACES: readonly SurfaceId[] = [
  ...new Set<SurfaceId>([
    ...VIEW_SURFACES,
    ...TAB_SURFACES,
    ...PAGE_SURFACES,
    ...DATA_TAB_SURFACES,
    ...FIGURE_PREFIX_SURFACES,
    ...HOME_FIGURE_SURFACES,
    ...METRIC_SURFACES,
    ...MONEY_SURFACES,
    ...LEAVE_SURFACES,
    ...EXPORT_SURFACES,
    ...SETTINGS_SURFACES,
    ...MASTHEAD_SURFACES,
    ...FILTER_SURFACES,
    ...HEADER_SURFACES,
    ...FOCUS_SURFACES,
    ...SHORTCUT_SURFACES,
    ...UI_SURFACES,
    ...DATASET_SURFACES,
    ...DRILL_SURFACES,
    ...COLUMN_SURFACES,
    ...ITEM_SURFACES,
    ...ACTION_SURFACES,
    ...HELP_SURFACES,
    ...HIRING_SURFACES,
    ...RECRUITING_SURFACES,
  ]),
]

/* ───────────── the plan's grid (docs/PLAN.md 8.3) ───────────── */

/** One letter per mode in `MODES` order (Manager, HRBP, Leader, Finance, HR admin). */
export type GridLetters = string

/**
 * docs/PLAN.md 8.3's letters, surface by surface: S shown, L limited, H hidden, in `MODES` order
 * (Manager, HRBP, Leader, Finance, HR admin). Tabs of a view marked "(all tabs)" take the view's
 * letters, and so do the one-tab views' tabs (`home.overview`, `team.overview`, `whatif.levers`);
 * the Data room's tabs take `page:data`'s. The reasons on every L and H are the tables' (worded per
 * mode in the data), not repeated here.
 */
export const PLAN_GRID: Readonly<Record<string, GridLetters>> = {
  // Views, tabs and pages
  'view:home': 'HSSSH',
  'tab:home.overview': 'HSSSH',
  'view:team': 'SHHHH',
  'tab:team.overview': 'SHHHH',
  'view:plan': 'LLLLS',
  'tab:plan.overview': 'HSSSS',
  'tab:plan.positions': 'LLLLS',
  'tab:plan.openings': 'LSSLS',
  // Change C36 (9.7): heads only, so every mode shows it, each over its own scope.
  'tab:plan.hiring': 'SSSSS',
  // Change C38 (9.8): heads only, like Plan > Hiring, in every mode over its own scope.
  'tab:plan.recruiting': 'SSSSS',
  'tab:plan.transfers': 'LSSHS',
  'view:requests': 'LLLLS',
  'tab:requests.queue': 'HLLLS',
  'tab:requests.new': 'LSLHS',
  'tab:requests.mine': 'SSSSS',
  'tab:requests.approvals': 'LSSSS',
  'tab:requests.cycle': 'LLLSS',
  'view:forecast': 'HLLSS',
  'tab:forecast.overview': 'HLLSS',
  'tab:forecast.variance': 'HLLSS',
  'tab:forecast.bridge': 'HLLSS',
  'view:targets': 'HLLSS',
  'tab:targets.gap': 'HLLSS',
  'tab:targets.suborgs': 'HLSSS',
  'tab:targets.tree': 'HLLSS',
  'view:whatif': 'HSSLS',
  'tab:whatif.levers': 'HSSLS',
  'view:finance': 'HLHSS',
  'tab:finance.versions': 'HLHSS',
  'tab:finance.assumptions': 'HLHSS',
  'tab:finance.assumptions:trade-rates': 'HLHSS',
  'tab:finance.freezes': 'HLHSS',
  'tab:finance.reconcile': 'HLHSS',
  'tab:finance.export': 'HHHLS',
  'page:actions': 'LLLLS',
  'page:audit': 'HLLLS',
  'page:data': 'HHHHS',
  'data:datasets': 'HHHHS',
  'data:quality': 'HHHHS',
  'data:metrics': 'HHHHS',
  'data:lists': 'HHHHS',
  'data:workspace': 'HHHHS',
  'settings:data': 'HHHHS',
  // Money, leave, cost and trade
  'pay:switch': 'HHHHS',
  'pay:amounts': 'HHHHL',
  'pay:exact': 'HHHLS',
  'pay:rounded': 'HLLHH',
  'cost:band': 'HSSSS',
  'cost:monthly': 'HHHSS',
  'cost:component': 'HHHSS',
  'leave:counts': 'HLLHS',
  'leave:people': 'HHHHL',
  'ui:trade-weights': 'SSSSS',
  'metric:finance.trade.standardHead': 'HLLSS',
  // Actions
  'action:request.draft': 'LSLHS',
  'action:request.submit': 'LSLHS',
  'action:request.withdraw': 'LSLHS',
  'action:request.submit-on-behalf': 'HSHHS',
  'action:request.recruit': 'LSLHS',
  'action:request.propose-start': 'LSLHS',
  'action:request.trade': 'LSLHS',
  'action:request.approve': 'LLLLS',
  'action:request.reject': 'LLLLS',
  'action:request.send-back': 'LLLLS',
  // M3 review SP-8 and SP-18: the Leader letters are H (a PLAN 15 change for the lead to record in 8.3).
  'action:request.approve-with-changes': 'HSHHS',
  'action:request.comment': 'SSSSS',
  'action:request.read-approvers-only': 'HLLLS',
  'action:request.import': 'HSLSS',
  'action:position.edit': 'HLHHS',
  'action:transfer.process': 'HSHHS',
  'action:transfer.approve': 'LLLLS',
  'action:transfer.move-budget': 'HSHHS',
  'action:target.set': 'HHHSS',
  'action:target.exception': 'HHHSS',
  'action:target.split': 'HHLSS',
  'action:target.move': 'HHLSS',
  'action:whatif.use': 'HSSSS',
  'action:whatif.turn-into-requests': 'HSSHS',
  'action:cycle.open': 'HHHSS',
  'action:cycle.dates': 'HHHSS',
  'action:cycle.lock': 'HHHSS',
  'action:cycle.return': 'HHHSS',
  'action:cycle.advance': 'HLLSS',
  'action:cycle.rank': 'LSLHS',
  'action:cycle.cut-line': 'HSLSS',
  'action:cycle.copy-note': 'HSSSS',
  'action:version.create': 'HHHSS',
  'action:version.lock': 'HHHSS',
  'action:version.reopen': 'HHHSS',
  'action:close.month': 'HHHSS',
  'action:fx.set': 'HHHSS',
  'action:freeze.create': 'HHHSS',
  'action:freeze.edit': 'HHHSS',
  'action:assumptions.edit': 'HHHLS',
  'action:assumptions.edit-operational': 'HLHSS',
  'action:freeze.exception': 'LSLHS',
  'action:recon.review': 'HLHSS',
  'action:data.import': 'HHHHS',
  'action:workspace.import': 'HHHHS',
  'action:workspace.open-shared': 'SSSSS',
  'action:export.shareable': 'SSSSS',
  'action:export.requests': 'SSSSS',
  'action:export.for-manager': 'HSLHS',
  'action:export.full': 'HHHHL',
  'action:export.load-file-full': 'HHHHL',
  'action:export.load-file': 'HHHLS',
  'action:export.figure': 'LLLSS',
  'action:export.view': 'LLLSS',
  'action:export.deck': 'LLLSS',
  'action:export.long-csv': 'LLLSS',
}

/**
 * The help decisions (docs/PLAN.md 14.2, M4 freeze), one letter per mode in `MODES` order (Manager,
 * HRBP, Leader, Finance, HR admin), as src/access/policy/help.ts `articlesFor` and `toursFor` give
 * them: Start here, support, the plain privacy articles, `about-server` (every mode), the workspace
 * file, versions and trading articles show everywhere; a view's article follows its view (shown
 * wherever the view is not hidden) and its tour follows the view's letter; the Data room's articles
 * and tours are HR admin's, with definitions and the glossary limited elsewhere; the cost definition
 * and pay rules leave Manager mode out (no amounts), the leave article Manager and Finance (no leave,
 * 16.1); HR admin takes "Getting started" (its home is the Data room) and every other mode "Getting
 * started with your home"; "Raising a request" follows Requests > New.
 */
export const HELP_GRID: Readonly<Record<string, GridLetters>> = {
  // Start here
  'help:article:what-headcount-planner-is': 'SSSSS',
  'help:article:moving-around': 'SSSSS',
  'help:article:reading-a-number': 'SSSSS',
  'help:article:clicking-down': 'SSSSS',
  'help:article:exporting': 'SSSSS',
  'help:article:modes': 'SSSSS',
  // Each view
  'help:article:view-home': 'HSSSH',
  'help:article:view-team': 'SHHHH',
  'help:article:view-plan': 'SSSSS',
  'help:article:view-requests': 'SSSSS',
  'help:article:view-forecast': 'HSSSS',
  'help:article:view-targets': 'HSSSS',
  'help:article:view-whatif': 'HSSSS',
  'help:article:view-finance': 'HSHSS',
  'help:article:view-data': 'HHHHS',
  'help:article:view-actions': 'SSSSS',
  'help:article:view-audit': 'HSSSS',
  // Your data
  'help:article:data-loading': 'HHHHS',
  'help:article:data-mapping': 'HHHHS',
  'help:article:data-tiers': 'HHHHS',
  'help:article:data-certify': 'HHHHS',
  'help:article:data-quality': 'HHHHS',
  'help:article:data-wrong': 'HHHHS',
  'help:article:data-workspace-file': 'SSSSS',
  'help:article:data-versions': 'SSSSS',
  // Definitions
  'help:article:definitions-how': 'LLLLS',
  'help:article:glossary': 'LLLLS',
  'help:article:cost-definition': 'HSSSS',
  'help:article:trading-heads': 'SSSSS',
  // Privacy and trust
  'help:article:privacy-browser': 'SSSSS',
  'help:article:about-server': 'SSSSS',
  'help:article:privacy-pay': 'HSSSS',
  'help:article:privacy-small-groups': 'SSSSS',
  'help:article:privacy-leave': 'HSSHS',
  'help:article:privacy-sample': 'SSSSS',
  // Help and support
  'help:article:shortcuts': 'SSSSS',
  'help:article:report-problem': 'SSSSS',
  'help:article:troubleshooting': 'SSSSS',
  'help:article:faq': 'SSSSS',
  'help:article:whats-new': 'SSSSS',
  // Tours
  'help:tour:getting-started': 'HHHHS',
  'help:tour:home-start': 'SSSSH',
  'help:tour:requests-start': 'SSSHS',
  'help:tour:own-data': 'HHHHS',
  'help:tour:view-home': 'HSSSH',
  'help:tour:view-team': 'SHHHH',
  'help:tour:view-plan': 'LLLLS',
  'help:tour:view-requests': 'LLLLS',
  'help:tour:view-forecast': 'HLLSS',
  'help:tour:view-targets': 'HLLSS',
  'help:tour:view-whatif': 'HSSLS',
  'help:tour:view-finance': 'HLHSS',
}
