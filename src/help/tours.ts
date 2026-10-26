/**
 * Guided tours, as data (docs/PLAN.md 14.2; the template app's help/tours.ts). Each step points at a
 * stable `[data-tour="..."]` attribute in the components; `figure-<id>` is the Figure with that id.
 * A step with `view` (and `tab`) opens that page first; a step whose element is missing shows as a
 * centered card. Tests check every target exists in the source and every route is real.
 *
 * The tours (src/access/ids.ts `HELP_TOUR_IDS`): `getting-started` (HR admin's first tour),
 * `home-start` (every other mode's, with per-mode wording on each home's hero: My team in Manager
 * mode, Home in HRBP, Leader and Finance mode), `requests-start` (draft, submit, track; Manager's
 * wording first), `own-data` (HR admin, ending on certification), and one `view-<key>` tour of 4 to
 * 6 steps per folder-tab view, at least 3 left in every mode that shows it, using per-mode wording
 * rather than skipped steps. The `view-whatif` tour walks the Levers tab (the lever list, then the
 * result strip of heads, cost and gap), not an Overview. No tour is exempt from the banned words.
 *
 * Per-mode wording is written against surfaces (./articles/when.ts), never mode names: a step about
 * a tab a mode hides moves, through its wording's `view` and `tab`, to what that mode shows instead,
 * so every view tour keeps all its steps in every mode that shows it. Wording that names an amount
 * kind or an amount applies only where the mode shows one. help-views wrote the steps, summaries
 * and lengths (docs/CONTRACTS-M4.md); ids are frozen.
 */
import type { RouteView } from '@/data/store'
import { FINANCE, HR_ADMIN, HRBP, LEADER, MANAGER, PAY_SWITCH, ROUNDED } from './articles/when'
import { HIRING_TOUR_STEP } from './hiring'
import type { Tour, TourStep } from './types'

/** The selector for a `data-tour` name. */
export const tourTarget = (name: string): string => `[data-tour="${name}"]`

/** The selector for a Figure by its id. */
export const figureTarget = (id: string): string => tourTarget(`figure-${id}`)

const at = (view: RouteView, tab = '') => ({ view, tab })

/* ───────────── first tours ───────────── */

const GETTING_STARTED: Tour = {
  id: 'getting-started',
  title: 'Getting started',
  summary:
    'Folder tabs, the version and comparison, the period and filters, key figures, records, exports, modes and where to find help.',
  length: '2 minutes',
  steps: [
    {
      title: 'Welcome to Headcount Planner',
      body: 'This tour shows the parts you will use every day. Use Next or the right arrow key to move on, and Esc to stop at any time. When it ends you are back where you started.',
    },
    {
      target: tourTarget('folder-tabs'),
      title: 'Folder tabs and headline numbers',
      body: 'Each folder tab is a view, and the number on it is the view’s headline for the current scope, such as approved heads on Plan. Click a tab to open the view.',
      placement: 'bottom',
    },
    {
      ...at('plan', 'overview'),
      target: tourTarget('version-picker'),
      title: 'The version shown',
      body: 'Every number reads one version: by default the fiscal year’s Working version, the one plan that changes. Pick a locked Budget or reforecast to read it instead.',
      placement: 'bottom',
    },
    {
      ...at('plan', 'overview'),
      target: tourTarget('compare-picker'),
      title: 'What it compares with',
      body: 'Every "vs" figure compares with this: the plan of record by default, another locked version of the same fiscal year, or the year’s target.',
      placement: 'bottom',
    },
    {
      ...at('plan', 'overview'),
      target: tourTarget('filter-period'),
      title: 'Period and filters',
      body: 'Most numbers cover a fiscal period: the fiscal year, year to date, quarter to date, a month or a custom range. The filters beside it narrow every view to a leader’s org, a unit, a department and more, and each menu starts with Include and Exclude.',
      placement: 'bottom',
    },
    {
      ...at('plan', 'overview'),
      target: tourTarget('data-standard'),
      title: 'The data standard',
      body: 'Every number carries a tier: bronze, silver or gold. The data standard sets the lowest tier shown on every page; pick Production for a leadership meeting to show only certified numbers.',
      placement: 'bottom',
    },
    {
      ...at('plan', 'overview'),
      target: tourTarget('kpi-strip'),
      title: 'Key figures',
      body: 'Each tile has its value and its change against the comparison, which it names. A tile whose label is a link opens the tab it comes from.',
      placement: 'bottom',
    },
    {
      ...at('plan', 'overview'),
      target: tourTarget('kpi-info'),
      title: 'What a number means',
      body: 'The info button gives the definition. Edit definition opens it in Metric definitions, and Learn more opens its help article.',
      placement: 'bottom',
    },
    {
      ...at('plan', 'overview'),
      target: tourTarget('kpi-value'),
      title: 'Click down to the records',
      body: 'A number with a dotted underline opens the positions behind it in a panel on the right. A modeled number opens its calculation card: the inputs, then each step down to the number.',
      placement: 'bottom',
    },
    {
      ...at('plan', 'overview'),
      target: tourTarget('readout'),
      title: 'The readout',
      body: 'Findings for the scope, most serious first. Each names positions, never people, and opens the records behind it.',
      placement: 'right',
    },
    {
      ...at('plan', 'overview'),
      target: figureTarget('plan-heads-by-month'),
      title: 'Every figure exports',
      body: 'At the top right of each figure: the table button shows its rows, the info button lists its definitions, and the download button saves CSV, Excel, PNG or SVG. Export in the view header saves the whole view as a workbook or a deck, with the version, the comparison and the as-of date written in.',
      placement: 'top',
    },
    {
      target: tourTarget('masthead-mode'),
      title: 'Modes and Acting as',
      body: 'Switch modes to see what a manager, an HRBP, a leader or Finance sees, each acting as one person. A mode changes what Headcount Planner shows, not who can see the data.',
      placement: 'bottom',
    },
    {
      target: tourTarget('masthead-workspace'),
      title: 'Workspace files',
      body: 'Save a Shareable file of what this mode shows, a Full file of the whole workspace, or the requests; open a file someone sent you, or import one.',
      placement: 'bottom',
    },
    {
      target: tourTarget('masthead-data'),
      // A control a mode can hide: the tour skips the step there.
      surface: 'masthead:data',
      title: 'The Data room',
      body: 'Your home in this mode: the eight datasets and their tiers, data quality, the metric definitions and the official lists. Load your own exports here, one dataset at a time.',
      placement: 'bottom',
    },
    {
      target: tourTarget('masthead-help'),
      title: 'Help is always here',
      body: 'Open Help to search articles and definitions, take the tour of the page you are on, or report a problem. Press ? to open it from anywhere.',
      placement: 'bottom',
    },
  ],
}

/** Steps on a role home; Manager mode's wording moves them to My team. */
const home = (tab = 'overview') => at('home', tab)
const TEAM = { view: 'team', tab: 'overview' } as const

const HOME_START: Tour = {
  id: 'home-start',
  title: 'Getting started with your home',
  summary:
    'The number your role is judged on, the key figures, what needs your attention, your list, your mode and help.',
  length: '1 minute',
  steps: [
    {
      ...home(),
      target: tourTarget('home-hero'),
      title: 'Your home',
      body: 'Your mode opens here, on the number your role is judged on, with what it compares with under it. It opens the records or the calculation card behind it.',
      placement: 'right',
      wording: [
        {
          ...MANAGER,
          ...TEAM,
          title: 'Left to fill',
          body: 'My team opens on Left to fill: the Open and Planned seats in your allocation. The bar under it splits them into Open, requested and left to request, and each part opens its seats.',
        },
        {
          ...HRBP,
          title: 'Heads vs plan',
          body: 'Unit plan opens on your unit’s actual heads at the last closed month-end, against plan heads. Click the number for the positions behind it.',
        },
        {
          ...LEADER,
          title: 'Year-end heads vs target',
          body: 'Rollup vs target opens on your org’s year-end heads forecast against its target for the year. Click the number for its calculation card.',
        },
        {
          ...FINANCE,
          title: 'Full-year cost vs Budget',
          body: 'Plan vs actual opens on the full-year cost forecast against the Budget, exact for groups of 5 or more costed people.',
        },
      ],
    },
    {
      ...home(),
      target: tourTarget('kpi-strip'),
      title: 'Key figures',
      body: 'Beside it, the key figures. Each is a tile from the tab it comes from, names what it compares with, and its label opens that tab.',
      placement: 'bottom',
      wording: [
        {
          ...MANAGER,
          ...TEAM,
          body: 'Beside it: your allocation, its Filled, Open and Planned seats, your pending requests, what is left to request, and your budget status, all in heads.',
        },
      ],
    },
    {
      ...home(),
      target: tourTarget('home-attention'),
      title: 'Needs attention',
      body: 'Your own open items, most pressing first: the same items the Action center lists as yours.',
      placement: 'top',
      wording: [
        {
          ...MANAGER,
          ...TEAM,
          target: figureTarget('team-attention'),
          body: 'Your open items, most pressing first: approvals waiting on you, requests sent back, Planned seats near their start with no req, and trade credit about to lapse.',
        },
      ],
    },
    {
      ...home(),
      target: figureTarget('home-list'),
      title: 'My list',
      body: 'The records you work on, in one table. The page shows the first 50; its export holds every row.',
      placement: 'top',
      wording: [
        {
          ...MANAGER,
          ...TEAM,
          target: figureTarget('team-tracker'),
          body: 'Your team’s requests: where each one is, who it waits on and for how many days, and once approved, its req, the accepted offer and the start.',
        },
      ],
    },
    {
      target: tourTarget('masthead-mode'),
      title: 'Your mode and who you act as',
      body: 'The Mode button shows your mode and who you act as; change either there. A mode changes what Headcount Planner shows, not who can see the data.',
      placement: 'bottom',
    },
    {
      target: tourTarget('masthead-help'),
      title: 'Help is always here',
      body: 'Open Help to search articles and definitions, take the tour of the page you are on, or report a problem. Press ? to open it from anywhere.',
      placement: 'bottom',
    },
  ],
}

const REQUESTS_START: Tour = {
  id: 'requests-start',
  title: 'Raising a request',
  summary: 'Pick a type and a seat, read the approval chain, save or submit, then track it on Mine.',
  length: '1 minute',
  steps: [
    {
      ...at('requests', 'new'),
      target: tourTarget('requests-type'),
      title: 'Pick a type',
      body: 'Requests > New raises every change that is not a Working edit. Pick a type: a New role, a Backfill, a Level or Location change, a Transfer, an Elimination, a Trade, Start recruiting or a Start date.',
      placement: 'bottom',
      wording: [
        {
          ...MANAGER,
          body: 'Requests > New raises changes for your team. Pick a type: a New role, a Backfill, a Level or Location change, an Elimination, a Trade, Start recruiting or a Start date. Your HRBP processes transfers.',
        },
        {
          ...LEADER,
          body: 'Requests > New raises changes inside your org. Pick a type: a New role, a Backfill, a Level or Location change, an Elimination, a Trade, Start recruiting or a Start date. HRBPs process transfers.',
        },
      ],
    },
    {
      ...at('requests', 'new'),
      target: figureTarget('requests-new-seats'),
      title: 'Name the seat',
      body: 'Seats you can name lists the seats in your scope and the types each can take. Click a row to put it in the form.',
      placement: 'top',
      wording: [
        {
          ...MANAGER,
          body: 'Seats you can name lists your team’s seats and the types each can take. Click a row to put it in the form.',
        },
      ],
    },
    {
      ...at('requests', 'new'),
      target: figureTarget('requests-new-chain'),
      title: 'Read the preview',
      body: 'Beside the form: what it still needs, the freeze notice where the org is frozen, and the approval chain Submit would store. The band estimate and the target org’s gap after approval show under it.',
      placement: 'left',
      wording: [
        {
          ...MANAGER,
          body: 'Beside the form: what it still needs, the freeze notice where your org is frozen, and the approval chain Submit would store, in the order its steps will run.',
        },
      ],
    },
    {
      ...at('requests', 'new'),
      title: 'Save a draft or submit',
      body: 'Save draft keeps the request for later; Submit sends it to the first step of its chain. Where the org is frozen, Submit adds the freeze exception with your business reason. Do not include pay, performance or health details in any text.',
      wording: [
        {
          ...MANAGER,
          body: 'Save draft keeps the request for later; Submit sends it to the first step of its chain. Where your org is frozen, Submit adds the freeze exception with your business reason. Do not include pay, performance or health details in any text.',
        },
        {
          surface: 'action:request.submit-on-behalf',
          body: 'Save draft keeps the request for later; Submit sends it to the first step of its chain, and Submit for sends it on behalf of a manager. Where the org is frozen, Submit adds the freeze exception with your business reason. Do not include pay, performance or health details in any text.',
        },
      ],
    },
    {
      ...at('requests', 'mine'),
      target: figureTarget('requests-mine'),
      title: 'Track it on Mine',
      body: 'Mine lists your requests: the state, the step each waits on, who holds it and for how many days. Open one for its card: the chain, the comments you may read, and what you can do now.',
      placement: 'top',
      wording: [
        {
          ...MANAGER,
          body: 'Mine lists your requests: the state, the step each waits on, who holds it and for how many days. Once approved, the tracker follows it to the req, the accepted offer and the start; My team shows the same tracker.',
        },
      ],
    },
    {
      ...at('requests', 'approvals'),
      target: figureTarget('requests-approvals'),
      title: 'When a step waits on you',
      body: 'Approvals lists the requests whose waiting step is yours, the longest waiting first: approve, send back or reject, with a reason the requester reads.',
      placement: 'top',
      wording: [
        {
          ...MANAGER,
          body: 'As a manager’s manager you decide your managers’ requests here, in heads: the card shows your allocation and status after approval.',
        },
      ],
    },
  ],
}

const OWN_DATA: Tour = {
  id: 'own-data',
  title: 'Using your own data',
  summary:
    'Replace a dataset with your export, check the mapping and the issues, read the tiers, then certify for gold.',
  length: '2 minutes',
  route: 'data',
  steps: [
    {
      target: tourTarget('masthead-data'),
      // A control a mode can hide: the tour skips the step there.
      surface: 'masthead:data',
      title: 'Start in the Data room',
      body: 'Everything about the data lives in the Data room. Files you add stay in this browser: Headcount Planner reads them on this device and sends them nowhere.',
      placement: 'bottom',
    },
    {
      ...at('data'),
      target: figureTarget('data-manifest'),
      title: 'The eight datasets',
      body: 'Positions, workers, compensation, requisitions, requests, targets, hiring freezes and assumptions, each with its tier and where it came from. Open a row for its Raw, Mapping, Quality and Certify panels.',
      placement: 'top',
    },
    {
      ...at('data', 'positions-raw'),
      target: tourTarget('dataset-detail'),
      placement: 'top',
      title: 'Replace with your file',
      body: 'On a dataset, Replace with your file loads one Excel or CSV export for that dataset. The other datasets keep running as they are, and an uploaded dataset can go back to the sample.',
    },
    {
      ...at('data', 'positions-mapping'),
      target: tourTarget('dataset-detail'),
      placement: 'top',
      title: 'Check the mapping',
      body: 'Before anything is replaced you review which column fills each field and what the import changed. Afterwards the Mapping panel shows the source of every field, and Confirm mapping records your review.',
    },
    {
      ...at('data', 'positions-quality'),
      target: tourTarget('dataset-detail'),
      placement: 'top',
      title: 'Read the issues',
      body: 'The Quality panel shows the dataset’s tier, what keeps it from the next one, every check and each field’s coverage.',
    },
    {
      ...at('data', 'quality'),
      target: figureTarget('data-quality-datasets'),
      title: 'Tiers across the plan',
      body: 'Data quality shows every dataset by tier. An upload starts at bronze; a confirmed mapping with passing checks makes it silver.',
      placement: 'top',
    },
    {
      ...at('data', 'positions-certify'),
      target: tourTarget('dataset-detail'),
      placement: 'top',
      title: 'Certify for gold',
      body: 'Certify this version records that the data owner checked this exact version, signed as the person you act as, with an optional note and an optional control total it must match within 0.5%. Gold also needs the mapping confirmed, the checks passing and fresh data. It is a local attestation kept in this browser, not a sign-in.',
    },
  ],
}

/* ───────────── one tour per view ───────────── */

const HOME: Tour = {
  id: 'view-home',
  title: 'Home',
  summary: 'The hero, the key figures, Needs attention, My list and the home’s own charts.',
  length: '1 minute',
  route: 'home',
  steps: [
    {
      ...home(),
      target: tourTarget('home-hero'),
      title: 'The one number',
      body: 'At the top, the number your role is judged on, with what it compares with under it. It opens its records or its calculation card.',
      placement: 'right',
      wording: [
        {
          ...HRBP,
          title: 'Heads vs plan',
          body: 'Your unit’s actual heads at the last closed month-end against the plan heads of the comparison. Click the number for the positions behind it.',
        },
        {
          ...LEADER,
          title: 'Year-end heads vs target',
          body: 'Your org’s year-end heads forecast against its target for the year. Click the number for its calculation card.',
        },
        {
          ...FINANCE,
          title: 'Full-year cost vs Budget',
          body: 'The full-year cost forecast against the Budget, exact for groups of 5 or more costed people. Click the number for its calculation card.',
        },
      ],
    },
    {
      ...home(),
      target: tourTarget('kpi-strip'),
      title: 'Key figures',
      body: 'Each key figure is a tile from the tab it comes from, and its label opens that tab.',
      placement: 'bottom',
      wording: [
        {
          ...HRBP,
          body: 'Heads vs plan, hires year to date against plan, openings past target start, open to hire this fiscal year, the year-end forecast against target, and full-year cost against the comparison, rounded down to $0.1M per team. Each label opens its tab.',
        },
        {
          ...LEADER,
          body: 'Heads and cost against target, the year-end gap, open to hire this fiscal year, approvals waiting on you, and the target not yet split into sub-orgs. Cost is rounded down to $0.1M per team. Each label opens its tab.',
        },
        {
          ...FINANCE,
          body: 'Heads against Budget, reqs not in plan, openings under a freeze, the FX effect year to date, freeze savings and reconciliation exceptions. Each label opens its tab.',
        },
      ],
    },
    {
      ...home(),
      target: tourTarget('home-attention'),
      title: 'Needs attention',
      body: 'Your own open items, most pressing first.',
      placement: 'top',
      wording: [
        {
          ...HRBP,
          body: 'Your open items, most pressing first: requests waiting 5 or more days, managers who have not sent their ranked asks, Planned seats near their start with no req, and reconciliation exceptions in the unit.',
        },
        {
          ...LEADER,
          body: 'Your open items, most pressing first: approvals waiting on you, and sub-orgs over their target.',
        },
        {
          ...FINANCE,
          body: 'Your open items, most pressing first: Finance steps waiting on you, envelope exceptions, and a cycle stage that is due.',
        },
      ],
    },
    {
      ...home(),
      target: figureTarget('home-list'),
      title: 'My list',
      body: 'The records you work on, in one table; its export holds every row.',
      placement: 'top',
      wording: [
        { ...HRBP, body: 'The unit’s open requests by the step they wait on, the longest waiting first.' },
        { ...LEADER, body: 'Each sub-org’s heads, asks and gap at its target date.' },
        { ...FINANCE, body: 'Units by cost variance against the comparison, the largest first.' },
      ],
    },
    {
      ...home(),
      title: 'Your charts',
      body: 'Below My list, the home’s own charts.',
      wording: [
        {
          ...HRBP,
          target: figureTarget('home-unit-openings'),
          body: 'Openings by stage, then forecast heads by month and your latest changes to the unit’s seats in Working.',
        },
        {
          ...LEADER,
          target: figureTarget('home-rollup-suborgs'),
          body: 'A bullet per sub-org: its asks against its heads target, on one scale.',
        },
        {
          ...FINANCE,
          target: figureTarget('home-fin-bridge'),
          body: 'The bridge from the comparison’s cost to the forecast, then cost by unit against the comparison.',
        },
      ],
    },
  ],
}

const MY_TEAM: Tour = {
  id: 'view-team',
  title: 'My team',
  summary:
    'Left to fill, your key figures, Needs attention, the request tracker, heads by month and your HRBP’s changes.',
  length: '1 minute',
  route: 'team',
  steps: [
    {
      ...TEAM,
      target: tourTarget('home-hero'),
      title: 'Left to fill',
      body: 'The Open and Planned seats in your allocation, split into Open, requested and left to request. The parts add up to the number, and each part opens its seats. Under it, Open to hire is approved heads less current heads and the accepted starts to come; it opens Plan > Hiring.',
      placement: 'right',
    },
    {
      ...TEAM,
      target: tourTarget('kpi-strip'),
      title: 'Key figures',
      body: 'Your allocation and its Filled, Open and Planned seats, your pending requests, what is left to request, and your budget status: On track, At risk or Over, with its reason.',
      placement: 'bottom',
    },
    {
      ...TEAM,
      target: figureTarget('team-attention'),
      title: 'Needs attention',
      body: 'Your own open items, most pressing first: approvals waiting on you, requests sent back to you, Planned seats near their start with no req, and trade credit about to lapse.',
      placement: 'top',
    },
    {
      ...TEAM,
      target: figureTarget('team-tracker'),
      title: 'The request tracker',
      body: 'Your team’s requests: type, state, the step each waits on, who holds it and for how many days, then the req, interviewing, the accepted offer date and the start.',
      placement: 'top',
    },
    {
      ...TEAM,
      target: figureTarget('team-heads-vs-allocation'),
      title: 'Heads by month',
      body: 'Staffed heads by month to the fiscal year end, with and without your pending requests, against your allocation.',
      placement: 'top',
    },
    {
      ...TEAM,
      target: figureTarget('team-hrbp-changes'),
      title: 'Changed by your HRBP',
      body: 'Start, level, location, FTE and hold changes your HRBP made in Working to your Open and Planned seats, each with its reason.',
      placement: 'top',
    },
  ],
}

const PLAN: Tour = {
  id: 'view-plan',
  title: 'Plan',
  summary: 'Key figures, the readout, positions by month, openings, hiring progress and transfers.',
  length: '1 minute',
  route: 'plan',
  steps: [
    {
      ...at('plan', 'overview'),
      target: tourTarget('kpi-strip'),
      title: 'Key figures',
      body: 'Approved heads, actual heads against the comparison, openings, openings past target start, average FTE year to date and loaded cost year to date. Each tile opens its records or its calculation card.',
      placement: 'bottom',
      wording: [
        {
          unless: 'tab:plan.overview',
          ...at('plan', 'positions'),
          title: 'Your team’s key figures',
          body: 'Your team’s positions, approved heads, plan heads at year end and standard heads, in heads only. Each tile opens the positions behind it.',
        },
        {
          ...ROUNDED,
          body: 'Approved heads, actual heads against the comparison, openings, openings past target start, average FTE year to date, and loaded cost year to date, rounded down to $0.1M per team. Each tile opens its records or its calculation card.',
        },
      ],
    },
    {
      ...at('plan', 'overview'),
      target: tourTarget('readout'),
      title: 'The readout',
      body: 'Findings for your scope, most serious first, beside heads by month: actual heads against the plan lines. Each finding names positions, never people.',
      placement: 'right',
      wording: [
        {
          unless: 'tab:plan.overview',
          ...at('plan', 'positions'),
          target: figureTarget('plan-positions-grid'),
          title: 'Positions by month',
          body: 'Every seat in your team by month of the version shown: its status and heads in each month, its level, location and FTE, and its standard heads. No cost columns.',
        },
      ],
    },
    {
      ...at('plan', 'positions'),
      target: figureTarget('plan-positions-grid'),
      title: 'Positions by month',
      body: 'Every position in scope by month of the version shown, with its status and heads in each month, its standard heads, and a band estimate for Open and Planned seats.',
      placement: 'top',
      wording: [
        {
          unless: 'tab:plan.overview',
          target: figureTarget('plan-positions-changes'),
          title: 'Changed by your HRBP',
          body: 'Start, level, location, FTE and hold changes your HRBP made in Working to your team’s Open and Planned seats, each with its reason.',
        },
        {
          surface: 'action:position.edit',
          body: 'Every position in scope by month, with its status, heads, standard heads and band estimate. Pick an Open seat with no accepted offer, or a Planned seat, to change its start, level, location, FTE or hold in Working, with a reason.',
        },
      ],
    },
    {
      ...at('plan', 'openings'),
      target: figureTarget('plan-openings-stage'),
      title: 'Openings',
      body: 'Openings by stage (req opened, interviewing, offer accepted, started) and by age, with the openings past target start, under a freeze, or near their start with no req.',
      placement: 'top',
      wording: [
        {
          ...MANAGER,
          body: 'Your team’s openings by stage (req opened, interviewing, offer accepted, started) and by age. An accepted offer shows as a date only.',
        },
      ],
    },
    // Plan > Hiring's quarter table (docs/PLAN.md 9.7, change C36), at `HIRING_TOUR_AT`: after
    // Openings, before Transfers, as the tab sits (src/help/hiring.ts).
    HIRING_TOUR_STEP,
    {
      ...at('plan', 'transfers'),
      target: figureTarget('plan-transfers-table'),
      title: 'Transfers',
      body: 'Transfers in progress and done that touch your scope, with the person, from and to, the effective date and the approvals. No amounts.',
      placement: 'top',
      wording: [
        {
          unless: 'tab:plan.transfers',
          ...at('plan', 'openings'),
          target: figureTarget('plan-openings-table'),
          title: 'Every opening',
          body: 'One row per opening, with its stage, req, days in stage, target start, and whether it is past start, frozen or has no req. Finance sees transfers in the bridge and in Targets.',
        },
        {
          surface: 'action:transfer.process',
          body: 'Transfers in progress and done that touch your unit, with the person, from and to, the effective date and the approvals. Process one here; your drafts wait below until you submit them.',
        },
      ],
    },
  ],
}

const REQUESTS: Tour = {
  id: 'view-requests',
  title: 'Requests',
  summary:
    'Raising a request, the queue, your requests, the approvals that wait on you, and the planning cycle.',
  length: '1 minute',
  route: 'requests',
  steps: [
    {
      ...at('requests', 'new'),
      target: figureTarget('requests-new-seats'),
      title: 'Raise a request',
      body: 'Pick a type, name a seat from this list and fill in the form. The preview beside it shows the approval chain, the band estimate and the gap after approval before you save or submit.',
      placement: 'top',
      wording: [
        {
          ...MANAGER,
          body: 'Pick a type, name one of your team’s seats from this list and fill in the form. The preview beside it shows the approval chain before you save or submit, in heads.',
        },
        {
          unless: 'tab:requests.new',
          ...at('requests', 'queue'),
          target: figureTarget('requests-queue-by-state'),
          title: 'Requests by state',
          body: 'Finance sets targets and gives final approval, and raises no requests. The queue shows the company’s requests in progress, by state and step.',
        },
      ],
    },
    {
      ...at('requests', 'queue'),
      target: figureTarget('requests-queue'),
      title: 'The queue',
      body: 'Requests in progress in your scope, with the days each has waited. Import requests and Export requests sit in the header.',
      placement: 'top',
      wording: [
        {
          unless: 'tab:requests.queue',
          ...at('requests', 'new'),
          target: figureTarget('requests-new-chain'),
          title: 'The approval chain',
          body: 'Before you submit, the chain shows each step your request will take and who holds it. Submit stores it on the request, so every viewer reads the same chain.',
        },
      ],
    },
    {
      ...at('requests', 'mine'),
      target: figureTarget('requests-mine'),
      title: 'Your requests',
      body: 'Your requests, in progress first, then the tracker after approval. Open one for its card: the chain and each step, the comments you may read, and what you can do now.',
      placement: 'top',
      wording: [
        {
          unless: 'tab:requests.new',
          body: 'Requests raised by the person you act as, with their steps. Export requests here saves the requests you can read in full.',
        },
      ],
    },
    {
      ...at('requests', 'approvals'),
      target: figureTarget('requests-approvals'),
      title: 'Waiting on you',
      body: 'The requests whose waiting step is yours, the longest waiting first. Open one to approve, send back or reject it, with a reason the requester reads; the card shows the band estimate and the gap after approval.',
      placement: 'top',
      wording: [
        {
          ...MANAGER,
          body: 'The requests whose waiting step is yours, the longest waiting first. Open one to approve, send back or reject it, with a reason the requester reads; the card shows heads, your allocation after approval and your status after approval.',
        },
        {
          surface: 'action:request.approve-with-changes',
          body: 'The requests whose waiting step is yours, the longest waiting first. Approve, approve with changes to the level, start or location, send back or reject, with a reason the requester reads; the card shows the band estimate and the gap after approval.',
        },
      ],
    },
    {
      ...at('requests', 'cycle'),
      target: figureTarget('requests-cycle-asks'),
      title: 'The planning cycle',
      body: 'The cycle’s stage strip and dates, and each unit’s ranked asks against its target with the cut line. Open the cycle and set its dates, move the stage on, then lock it or return it.',
      placement: 'top',
      wording: [
        {
          ...MANAGER,
          body: 'Your ranked asks for the next fiscal year and the cycle’s dates. Change their order with Rank your asks.',
        },
        {
          ...HRBP,
          body: 'Order your unit’s ranked asks against its target and drag the cut line. Managers who have not sent their asks are listed with Copy note. Finish HRBP review when you are done.',
        },
        {
          ...LEADER,
          body: 'Adjust the ranking and the cut line within your org’s envelope, then finish Leader review for your org.',
        },
      ],
    },
  ],
}

const FORECAST: Tour = {
  id: 'view-forecast',
  title: 'Forecast',
  summary: 'Key figures, the readout, heads by month, the variance against the comparison and the bridge.',
  length: '1 minute',
  route: 'forecast',
  steps: [
    {
      ...at('forecast', 'overview'),
      target: tourTarget('kpi-strip'),
      title: 'Key figures',
      body: 'The year-end heads forecast against target, the full-year cost forecast against the comparison, expected starts, modeled exits, unfilled at horizon and the exit run rate.',
      placement: 'bottom',
      wording: [
        {
          ...ROUNDED,
          body: 'The year-end heads forecast against target, the full-year cost forecast against the comparison (rounded down to $0.1M per team), expected starts, modeled exits and unfilled at horizon.',
        },
      ],
    },
    {
      ...at('forecast', 'overview'),
      target: tourTarget('readout'),
      title: 'The readout',
      body: 'Findings for the forecast, most serious first. Each names positions, never people.',
      placement: 'right',
    },
    {
      ...at('forecast', 'overview'),
      target: figureTarget('forecast-heads-by-month'),
      title: 'Heads by month',
      body: 'Closed months are actuals from the month closes; open months are the projection: openings start by their expected dates at the fill rate, people exit at the attrition rate, and backfills follow.',
      placement: 'top',
    },
    {
      ...at('forecast', 'variance'),
      target: figureTarget('forecast-variance'),
      title: 'Variance',
      body: 'Each org’s heads, average FTE and cost against the comparison, by month, quarter to date, year to date and full year. Positive cost is over.',
      placement: 'top',
      wording: [
        {
          ...ROUNDED,
          body: 'Each org’s heads and average FTE against the comparison by month, quarter to date, year to date and full year, and its cost at quarter to date, year to date and full year. Positive cost is over.',
        },
      ],
    },
    {
      ...at('forecast', 'bridge'),
      target: figureTarget('forecast-bridge'),
      title: 'Bridge',
      body: 'From the comparison’s total to the forecast’s, one driver at a time: timing, position changes, attrition, mix, pay rate, assumption rates, transfers and FX. A step with fewer than 5 positions that moved folds into Other changes; each step opens its calculation card.',
      placement: 'top',
      wording: [
        {
          ...ROUNDED,
          body: 'From the comparison’s total to the forecast’s, one driver at a time, built from each team’s rounded parts: most steps show their band part, and the rest sits in Other changes. Each step opens its calculation card.',
        },
        // PLAN 7.5 (M4 review SA-4): with the switch on nothing folds.
        {
          ...PAY_SWITCH,
          body: 'From the comparison’s total to the forecast’s, one driver at a time: timing, position changes, attrition, mix, pay rate, assumption rates, transfers and FX. While Show pay amounts is off, a step with fewer than 5 positions that moved folds into Other changes; with it on, every step shows. Each step opens its calculation card.',
        },
      ],
    },
  ],
}

const TARGETS: Tour = {
  id: 'view-targets',
  title: 'Targets',
  summary: 'Key figures, the gap by org, target changes, sub-org targets and the tree by cost center.',
  length: '1 minute',
  route: 'targets',
  steps: [
    {
      ...at('targets', 'gap'),
      target: tourTarget('kpi-strip'),
      title: 'Key figures',
      body: 'Target heads, asks, the gap in heads, target cost, the gap in cost, and the target not yet split into sub-orgs.',
      placement: 'bottom',
      wording: [
        {
          ...ROUNDED,
          body: 'Target heads, asks, the gap in heads, target cost and the gap in cost (rounded down to $0.1M per team), and the target not yet split into sub-orgs.',
        },
      ],
    },
    {
      ...at('targets', 'gap'),
      target: figureTarget('targets-gap'),
      title: 'Gap by org',
      body: 'Each target org’s asks against its target, as a bullet, with the table behind it. Asks are the Working seats that start by the target date, plus each pending request’s effect.',
      placement: 'top',
    },
    {
      ...at('targets', 'gap'),
      target: figureTarget('targets-changes'),
      title: 'Target changes',
      body: 'Every change to a target, with who made it and when. Set a target sets an org’s heads and cost target for the fiscal year shown.',
      placement: 'top',
      wording: [
        {
          unless: 'action:target.set',
          body: 'Every change to a target, with who made it and when. Finance sets the targets.',
        },
      ],
    },
    {
      ...at('targets', 'suborgs'),
      target: figureTarget('targets-suborgs'),
      title: 'Sub-org targets',
      body: 'Each parent target split into its sub-orgs’ targets, what is left unallocated, and the envelope exceptions waiting on Finance.',
      placement: 'top',
      wording: [
        {
          unless: 'action:target.split',
          body: 'Each sub-org’s asks against its target and what is left unallocated. Read only in this mode: leaders split sub-org targets.',
        },
        {
          ...LEADER,
          body: 'Split your org’s target into its sub-orgs’ targets, or move target between them, inside the envelope. A split or move past it needs Finance.',
        },
      ],
    },
    {
      ...at('targets', 'tree'),
      target: figureTarget('targets-tree'),
      title: 'Tree × cost center',
      body: 'Approved heads for each node of the leader tree and each cost center, then cost per unit and cost center under the unit’s one fold.',
      placement: 'top',
      wording: [
        {
          ...ROUNDED,
          body: 'Approved heads for each node of the leader tree and each cost center. In this mode the tab shows heads only, since cost centers are not whole teams.',
        },
      ],
    },
  ],
}

const WHAT_IF: Tour = {
  id: 'view-whatif',
  title: 'What if',
  summary:
    'The lever list, adding a lever, trading seats, the result strip of heads, cost and gap, making requests, and the seats a lever can change.',
  length: '1 minute',
  route: 'whatif',
  steps: [
    {
      ...at('whatif', 'levers'),
      target: figureTarget('whatif-levers'),
      title: 'The lever list',
      body: 'Each lever you add, in order, with the request it would make. Levers stay in this browser tab until you clear them or reload; they are never saved.',
      placement: 'right',
      wording: [
        {
          unless: 'action:whatif.turn-into-requests',
          body: 'Each lever you add, in order. Levers stay in this browser tab until you clear them or reload; they are never saved.',
        },
      ],
    },
    {
      ...at('whatif', 'levers'),
      target: tourTarget('whatif-add-lever'),
      placement: 'top',
      title: 'Add a lever',
      body: 'Defer a start, cancel an Open or Planned seat, shift starts, change level or location, freeze a sub-org, or trade seats. Levers act on Planned seats and Open seats with no accepted offer.',
    },
    // PLAN 11.5's What if step on the trade lever (M4 review HL-9, CP-7).
    {
      ...at('whatif', 'levers'),
      target: tourTarget('whatif-trade'),
      placement: 'top',
      title: 'Trade seats',
      body: 'Pick Trade as the lever kind to give seats for new ones worth no more standard heads; what is left over stays as trade credit. Its trade rate in the result strip says how many of the wanted seats the given ones buy.',
    },
    {
      ...at('whatif', 'levers'),
      target: tourTarget('kpi-strip'),
      title: 'The result strip',
      body: 'Heads change, cost change and gap change, and a trade rate for each trade lever: Working with the levers against Working without them, the levers costed at band estimate from each change’s date.',
      placement: 'bottom',
      wording: [
        {
          ...ROUNDED,
          body: 'Heads change, cost change and gap change, and a trade rate for each trade lever: Working with the levers against Working without them. The cost change is a band figure, the levers costed at band estimate from each change’s date.',
        },
      ],
    },
    {
      ...at('whatif', 'levers'),
      target: tourTarget('whatif-turn-into'),
      placement: 'top',
      title: 'Turn into requests',
      body: 'Turn into requests makes Draft requests for review in Requests > Mine, one per seat a lever touches. The freeze lever stays here: freezes are Finance’s.',
      wording: [
        {
          unless: 'action:whatif.turn-into-requests',
          target: figureTarget('whatif-levers'),
          placement: 'right',
          title: 'Share the scenario',
          body: 'Copy scenario copies the levers and the heads and gap change as text, never an amount, for the HRBP or leader who makes the requests.',
        },
      ],
    },
    {
      ...at('whatif', 'levers'),
      target: figureTarget('whatif-seats'),
      title: 'Seats a lever can change',
      body: 'The Planned seats and Open seats with no accepted offer in your scope. A seat with an accepted offer is never offered: its start date and terms come from the recruiting system.',
      placement: 'top',
    },
  ],
}

const FINANCE_TOUR: Tour = {
  id: 'view-finance',
  title: 'Finance',
  summary: 'Versions and locks, assumptions, freezes, reconciliation and the FP&A load file.',
  without: [
    {
      surface: 'tab:finance.export',
      summary:
        'Versions and locks, assumptions, freezes, reconciliation and Trade rates, read only but for your unit’s settings.',
    },
  ],
  length: '1 minute',
  route: 'finance',
  steps: [
    {
      ...at('finance', 'versions'),
      target: figureTarget('finance-versions'),
      title: 'Versions',
      body: 'Every version with its state, lock date, lock hash and engine version, and whether the hash still verifies. Lock, reopen and close a month from the changes bar above it.',
      placement: 'top',
      wording: [
        {
          unless: 'action:version.lock',
          body: 'Every version with its state, lock date, lock hash and engine version, and whether the hash still verifies. Read only in this mode.',
        },
      ],
    },
    {
      ...at('finance', 'assumptions'),
      target: figureTarget('finance-assumptions'),
      title: 'Assumptions',
      body: 'Every assumption of the version shown, with the level it is set at: org, unit or company. Change rates and drivers in Working when the change moves 5 or more costed people.',
      placement: 'top',
      wording: [
        {
          surface: 'action:assumptions.edit-operational',
          unless: 'action:assumptions.edit',
          body: 'Every assumption of the version shown, with the level it is set at. Read only in this mode, except your unit’s time to fill, fill rate and backfill settings, which you can change in Working.',
        },
        {
          ...HR_ADMIN,
          body: 'Every assumption of the version shown, with the level it is set at: org, unit or company. HR admin changes every value in Working, and sets the rest by import.',
        },
      ],
    },
    {
      ...at('finance', 'freezes'),
      target: figureTarget('finance-freezes'),
      title: 'Freezes',
      body: 'Each freeze with what it holds, the openings held and freeze savings. A held opening stays an approved head, but the forecast does not start it while the freeze lasts.',
      placement: 'top',
      wording: [
        {
          unless: 'action:freeze.create',
          body: 'Each freeze with what it holds and the openings held. A held opening stays an approved head, but the forecast does not start it while the freeze lasts. Read only in this mode.',
        },
      ],
    },
    {
      ...at('finance', 'reconcile'),
      target: figureTarget('finance-reconcile'),
      title: 'Reconcile',
      body: 'Where the plan and the HRIS disagree, by kind. Mark reviewed records that someone looked at an exception.',
      placement: 'top',
      wording: [
        {
          ...HRBP,
          body: 'Where the plan and the HRIS disagree in your business unit, by kind. Mark reviewed records that you looked at an exception.',
        },
      ],
    },
    {
      ...at('finance', 'export'),
      target: figureTarget('finance-export-preview'),
      title: 'The load file',
      body: 'The FP&A load file for the version you pick: the long CSV for the whole company at Finance’s rules, with its control totals beside it.',
      placement: 'top',
      wording: [
        {
          unless: 'tab:finance.export',
          ...at('finance', 'assumptions:trade-rates'),
          target: figureTarget('finance-trade-rates'),
          title: 'Trade rates',
          body: 'The standard head and each level and location’s weight in basis points, which trades are quoted in. Read only in this mode.',
        },
      ],
    },
  ],
}

export const TOURS: readonly Tour[] = [
  GETTING_STARTED,
  HOME_START,
  REQUESTS_START,
  OWN_DATA,
  HOME,
  MY_TEAM,
  PLAN,
  REQUESTS,
  FORECAST,
  TARGETS,
  WHAT_IF,
  FINANCE_TOUR,
]

const BY_ID = new Map(TOURS.map((t) => [t.id, t]))

export const tourById = (id: string | null | undefined): Tour | null => (id ? (BY_ID.get(id) ?? null) : null)

/** The tour for a page ("Tour this page"), or null when the page has none. */
export const tourForRoute = (view: RouteView): Tour | null => TOURS.find((t) => t.route === view) ?? null

/** Every step's target name: `[data-tour="kpi-strip"]` → "kpi-strip". */
export function targetName(step: TourStep): string | null {
  const m = step.target?.match(/^\[data-tour="([^"]+)"\]$/)
  return m ? m[1] : null
}
