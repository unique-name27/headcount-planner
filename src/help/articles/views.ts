/**
 * Help articles, Each view: one article per folder-tab view and masthead page, reached from its page
 * ("About this view") (docs/PLAN.md 14.2): what the view answers and how to read each tab, as the
 * views draw them (PLAN 9.1 to 9.6, 10, 11.5, readings R1 to R91). `view-home` has one section per
 * role home, each under its mode's condition.
 *
 * Every block that names a page, tab, control or amount kind a mode hides carries a condition from
 * ./when.ts or a surface, never a mode name, so each mode reads only about what it shows; text with
 * an amount ("$0.1M") is written under a condition Manager mode does not meet. Ids are frozen
 * (docs/CONTRACTS-M4.md); help-views wrote the titles, summaries and bodies.
 */
import { FREE_TEXT_HINT } from '@/access/copy'
import { HIRING_KEYWORDS, HIRING_SECTION } from '../hiring'
import { RECRUITING_KEYWORDS, RECRUITING_SECTION } from '../recruiting'
import type { HelpArticle } from '../types'
import {
  AMOUNTS,
  EXACT,
  FINANCE,
  HR_ADMIN,
  HRBP,
  IMPORTS_REQUESTS,
  LEADER,
  LOAD_FILE,
  MANAGER,
  NO_AMOUNTS,
  NO_DATA_ROOM,
  PAY_SWITCH,
  RAISES_REQUESTS,
  ROUNDED,
  RUNS_CYCLE,
  SCOPED,
  SEAT_EDITS,
} from './when'

/** HRBP mode on the Finance view: the view is read only but for the unit's operational settings. */
const FINANCE_READ_ONLY = { surface: 'view:finance', unless: 'tab:finance.export' } as const

export const VIEW_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'view-home',
    group: 'views',
    title: 'Home',
    summary:
      'Your mode’s first page: the number your role is judged on, the key figures, Needs attention and My list.',
    keywords: ['home', 'my home', 'hero', 'key figures', 'needs attention', 'my list', 'first page'],
    keywordsWhere: [
      { surface: 'figure:home-unit-heads-vs-plan', words: ['unit plan', 'heads vs plan'] },
      { surface: 'figure:home-rollup-heads-vs-target', words: ['rollup vs target', 'sub-orgs'] },
      { surface: 'figure:home-fin-cost-vs-budget', words: ['plan vs actual', 'cost vs budget'] },
    ],
    route: { view: 'home' },
    tour: 'view-home',
    body: [
      {
        p: 'Home is your mode’s first page, and its title names your role’s home. Every number on it is the producing view’s own figure for the scope on screen, so it matches that view, and each opens its records or its calculation card.',
      },
      { h: 'Every home has the same parts' },
      {
        ul: [
          'At the top, the hero: the one number the role is judged on, with what it compares with under it.',
          'The key figures beside it. Each is a tile from the tab it comes from, and its label opens that tab.',
          'Needs attention: your own open items, most pressing first, the same items the [Action center](route:actions) lists as yours.',
          'My list: one table of the records you work on. The page shows the first 50 rows with "Show all"; its export holds every row.',
          'Then the home’s own charts.',
        ],
      },
      { h: 'Unit plan', ...HRBP },
      {
        ul: [
          'The hero: heads vs plan, your unit’s actual heads at the last closed month-end against plan heads.',
          'Key figures: heads vs plan, hires year to date against plan, openings past target start, open to hire this fiscal year (approved heads less current heads and the future starts to come, from [Plan > Hiring](route:plan.hiring)), the year-end heads forecast against target, and full-year cost against the comparison, rounded down to $0.1M per team.',
          'Needs attention: requests waiting 5 or more days, managers who have not sent their ranked asks, Planned seats near their start with no req, and reconciliation exceptions in the unit.',
          'My list: the unit’s open requests by the step they wait on, the longest waiting first.',
          'Then openings by stage, forecast heads by month, and your latest changes to the unit’s seats in Working, with the ways to make them on [Plan > Positions](route:plan.positions) and [Plan > Transfers](route:plan.transfers).',
        ],
        ...HRBP,
      },
      { h: 'Rollup vs target', ...LEADER },
      {
        ul: [
          'The hero: your org’s year-end heads forecast against its target.',
          'Key figures: heads and cost against target (cost rounded down to $0.1M per team), the year-end gap, open to hire this fiscal year (from [Plan > Hiring](route:plan.hiring)), the approvals waiting on you, and what is unallocated: target not yet split into sub-orgs.',
          'Needs attention: approvals waiting on you, and sub-orgs over their target.',
          'My list: each sub-org’s heads, asks and gap at its target date.',
          'Then a bullet per sub-org: its asks against its heads target, on one scale.',
        ],
        ...LEADER,
      },
      { h: 'Plan vs actual', ...FINANCE },
      {
        ul: [
          'The hero: the full-year cost forecast against the Budget.',
          'Key figures: heads against Budget, reqs not in plan, openings under a freeze, the FX effect year to date, freeze savings and reconciliation exceptions.',
          'Needs attention: Finance steps waiting on you, envelope exceptions, and a cycle stage that is due.',
          'My list: units by cost variance against the comparison.',
          'Then the bridge from the comparison’s cost to the forecast, and cost by unit against the comparison.',
        ],
        ...FINANCE,
      },
      { h: 'Questions to ask in a meeting' },
      {
        ul: [
          'Which openings are past their target start, and what is holding each one?',
          'Which requests have waited longest, and on whom?',
        ],
        ...HRBP,
      },
      {
        ul: [
          'Which sub-orgs ask for more than their target, and is the unallocated target where it is needed?',
        ],
        ...LEADER,
      },
      {
        ul: [
          'Which units drive the variance against the Budget, and how much of it is FX?',
          'Which reqs are not in the plan, and should they be?',
        ],
        ...FINANCE,
      },
    ],
  },
  {
    id: 'view-team',
    group: 'views',
    title: 'My team',
    summary:
      'Your team in heads: what is left to fill and open to hire, your allocation and budget status, Needs attention, the request tracker and heads by month.',
    keywords: [
      'my team',
      'team',
      'allocation',
      'left to fill',
      'open to hire',
      'left to request',
      'budget status',
      'over',
      'at risk',
      'on track',
      'tracker',
      'pending',
      'manager',
    ],
    route: { view: 'team' },
    tour: 'view-team',
    metrics: [
      'team.allocation.leftToFill',
      'plan.hiring.open',
      'team.allocation.heads',
      'team.allocation.leftToRequest',
      'team.requests.pending',
      'team.budget.status',
    ],
    body: [
      {
        p: 'My team is Manager mode’s home: the seats in the tree below your own seat, in heads. It shows no amounts, and nothing about your own seat is on it.',
      },
      { h: 'Left to fill' },
      {
        p: 'The hero is Left to fill: the Open and Planned seats in your allocation. The bar under it splits them into Open, requested (Planned seats with a req or a Start recruiting request) and left to request (Planned seats with neither). The parts add up to the number, and each part opens its own seats.',
      },
      {
        p: 'Under it, Open to hire comes from [Plan > Hiring](route:plan.hiring): approved heads at the fiscal year end, less current heads, less the future starts due by then. Left to fill counts seats; Open to hire counts heads, so a person in your team who is not in plan counts against it. Below 0 it reads "Over by" and is never a hiring target.',
      },
      { h: 'Key figures' },
      {
        ul: [
          'Allocation: the heads your team has for this fiscal year, from the plan of record and the adds approved since it locked. Level, location and FTE changes do not move it.',
          'Filled, Open and Planned: the allocation’s seats by status.',
          'Pending: your requests waiting on a decision. They are not in the allocation until they are approved.',
          'Left to request: Planned seats with no req and no Start recruiting request yet.',
          'Budget status: On track, At risk or Over, with its reason. It weighs your staffed seats, and your pending requests, against the allocation to the fiscal year end. Standard heads show as a note on Allocation and never set the status.',
        ],
      },
      { h: 'Needs attention' },
      {
        p: 'Your own open items, most pressing first: approvals waiting on you, requests sent back to you, Planned seats near their start with no req, and trade credit about to lapse.',
      },
      { h: 'My list: the request tracker' },
      {
        p: 'Your team’s requests, where each one is and who it waits on: its type, state, step, owner and days in step, and once approved, when the req opened, when interviewing started, the date the offer was accepted and the start. An accepted offer shows as a date only.',
      },
      { h: 'Changed by your HRBP' },
      {
        p: 'Start, level, location, FTE and hold changes your HRBP made in Working to your Open and Planned seats, each with its reason. The same note shows on the seat in [Plan > Positions](route:plan.positions).',
      },
      { h: 'Heads by month' },
      {
        p: 'Staffed heads by month to the fiscal year end, with and without your pending requests, against your allocation.',
      },
      {
        p: 'Raise a request on [Requests > New](route:requests.new) and follow it on [Requests > Mine](route:requests.mine). [Raising a request](tour:requests-start)',
      },
    ],
  },
  {
    id: 'view-plan',
    group: 'views',
    title: 'Plan',
    summary:
      'The plan overview against the comparison, every position by month for the version shown, openings, hiring progress, a recruiting summary and transfers.',
    without: [
      {
        surface: 'tab:plan.overview',
        summary:
          'Your team’s positions by month, its openings, its hiring progress, its recruiting summary and its transfers, in heads.',
      },
      {
        surface: 'tab:plan.transfers',
        summary:
          'The plan overview against the comparison, every position by month for the version shown, openings, hiring progress and a recruiting summary.',
      },
    ],
    keywords: [
      'plan',
      'positions',
      'seats',
      'grid',
      'openings',
      'reqs',
      'hiring',
      'transfers',
      'approved heads',
      'actual heads',
      'standard heads',
      ...HIRING_KEYWORDS,
      ...RECRUITING_KEYWORDS,
    ],
    keywordsWhere: [
      { surface: 'action:position.edit', words: ['edit seat', 'change a seat', 'working edit'] },
    ],
    route: { view: 'plan' },
    tour: 'view-plan',
    body: [
      {
        p: 'Plan shows the version on screen for your scope, seat by seat, against the comparison.',
        surface: 'tab:plan.overview',
      },
      {
        p: 'In Manager mode Plan shows your team’s seats in heads: no cost and no other teams.',
        unless: 'tab:plan.overview',
      },
      { h: 'Overview', surface: 'tab:plan.overview' },
      {
        ul: [
          'Key figures: approved heads, actual heads against the comparison’s plan heads, openings, openings past target start, average FTE year to date, and loaded cost year to date against the comparison.',
          'The readout: findings for your scope, most serious first, each naming positions, never people.',
          'Heads by month (actual heads against the plan lines), heads by unit, positions by status, loaded cost by unit and openings by stage.',
        ],
        surface: 'tab:plan.overview',
      },
      { ul: ['Cost is rounded down to $0.1M per team, and shows year to date here.'], ...ROUNDED },
      { h: 'Positions' },
      {
        p: 'Every position in scope by month of the version shown: its status and heads in each month, its level, location and FTE, and its standard heads.',
      },
      {
        p: 'A Band estimate column shows each Open and Planned seat’s band estimate. Nothing tied to a filled seat or an offer shows.',
        ...AMOUNTS,
        unless: 'pay:switch',
      },
      {
        p: 'A Band estimate column shows each Open and Planned seat’s band estimate, and each position’s annual cost shows while Show pay amounts is on.',
        ...PAY_SWITCH,
      },
      {
        p: 'In Manager mode it shows heads, status and standard heads by month, with no cost columns.',
        ...NO_AMOUNTS,
      },
      {
        p: 'Changes in Working lists the latest start, level, location, FTE and hold changes to the scope’s seats.',
        ...AMOUNTS,
      },
      {
        p: 'Changed by your HRBP lists the start, level, location, FTE and hold changes your HRBP made to your team’s Open and Planned seats.',
        ...NO_AMOUNTS,
      },
      { h: 'Changing a seat in Working', ...SEAT_EDITS },
      {
        p: 'Pick an Open seat with no accepted offer, or a Planned seat, to change it in Working: its start, level, location, FTE, or On hold, always with a reason. A seat with an accepted offer cannot be changed: its start date and terms come from the recruiting system. The seat’s manager sees "Changed by your HRBP" with what moved.',
        ...SEAT_EDITS,
      },
      {
        p: 'In HRBP mode these are the seats in your business unit. A change to a site where the seat’s department has no cost center is refused until HR admin adds one.',
        ...HRBP,
      },
      { h: 'Openings' },
      {
        ul: [
          'Key figures: openings past target start, openings under a freeze, Planned seats near their start with no req, and hires year to date against plan.',
          'Openings by stage (req opened, interviewing, offer accepted, started) and by age, and a table with days in stage, target start, past start, frozen and no req.',
          'A freeze holds an opening without changing its status: it stays an approved head, but the forecast does not start it while the freeze lasts. An opening with an approved freeze exception is not held.',
        ],
      },
      { ul: ['Your team’s openings; an accepted offer shows as a date only.'], ...NO_AMOUNTS },
      { ul: ['No offer amounts or one-time hiring costs per req show.'], ...FINANCE },
      // Plan > Hiring (docs/PLAN.md 9.7, change C36): src/help/hiring.ts.
      ...HIRING_SECTION,
      // Plan > Recruiting summary (docs/PLAN.md 9.8, change C38): src/help/recruiting.ts.
      ...RECRUITING_SECTION,
      { h: 'Transfers', surface: 'tab:plan.transfers' },
      {
        p: 'Transfers in progress and done that touch your scope: the person, from and to, the effective date, the state and the approvals. No amounts.',
        surface: 'tab:plan.transfers',
      },
      {
        p: 'Process a transfer here: the moving person and their seat, and the receiving side. Your transfer drafts list the ones not yet submitted; submit one to start its approvals. Move budget too moves the target with the person.',
        surface: ['action:transfer.process', 'action:transfer.move-budget'],
      },
      {
        p: 'Finance mode does not show this tab: transfers move named people, and Finance sees their effect in the bridge and in Targets.',
        unless: 'tab:plan.transfers',
      },
    ],
  },
  {
    id: 'view-requests',
    group: 'views',
    title: 'Requests',
    summary:
      'Raise requests, follow them through their approval chain, decide the steps that wait on you, and the planning cycle.',
    without: [
      {
        surface: 'tab:requests.new',
        summary: 'Every request in progress, the steps that wait on you, and the planning cycle you run.',
      },
    ],
    keywords: [
      'requests',
      'request',
      'approval',
      'approve',
      'reject',
      'send back',
      'chain',
      'queue',
      'tracker',
      'new role',
      'backfill',
      'elimination',
      'trade',
      'cycle',
      'ranked asks',
      'draft',
      'submit',
    ],
    route: { view: 'requests' },
    tour: 'view-requests',
    body: [
      {
        p: 'Every change to the plan that is not a Working edit is a request: a New role, a Backfill, a Level or Location change, a Transfer, an Elimination, a Trade, Start recruiting or a Start date. Each moves through its approval chain, and an approved request writes its change to Working.',
      },
      // The chain as CHAIN_RULES builds it (PLAN 10.2; M4 review HL-1); the threshold's amount only
      // where amounts show (7.6).
      {
        p: 'The chain is stored on the request when it is submitted, so every viewer reads the same steps. It starts with the requester’s manager, then the unit’s HRBP:',
      },
      {
        ul: [
          'The leader joins for a seat at Director or above, or a request out of plan: one that would push its org over target. A Transfer takes leaders only when it crosses units.',
        ],
      },
      {
        ul: [
          'The leader also joins when the band estimate is over the leader threshold ($250,000 by default).',
        ],
        ...AMOUNTS,
      },
      { ul: ['The leader also joins when the request is over the leader threshold.'], ...NO_AMOUNTS },
      {
        ul: [
          'Finance approves every New role, every freeze or envelope exception, and trades that cross units or are out of plan.',
          'A Transfer or a Trade across units adds the receiving unit’s HRBP and both unit leaders.',
          'Start recruiting and Start date go to the HRBP only, and an in-plan like-for-like Backfill stops at the HRBP.',
        ],
      },
      { h: 'Queue', surface: 'tab:requests.queue' },
      {
        p: 'The requests in progress in your scope, by state and step, with the days each has waited. Counts are over the rows you can see.',
        surface: 'tab:requests.queue',
      },
      {
        p: 'An elimination or a change to a filled seat that you are not on shows only its position ID, title, level and org.',
        ...LEADER,
      },
      {
        p: 'An elimination or a change to a filled seat shows only its position ID, title, level and org, and a transfer only as that, never the person.',
        ...FINANCE,
      },
      {
        p: 'Import requests, in the header, merges requests from files other people exported. Its preview says what merges and names every conflict before anything changes, and you choose for each.',
        ...IMPORTS_REQUESTS,
      },
      // R17: a Leader with a tree merges only its org's requests; the CEO, CFO and CHRO merge all
      // (M4 review HL-3).
      {
        p: 'In Leader mode it merges only requests that touch your org or wait on you; others in the file are left as they are.',
        ...LEADER,
        scoped: true,
      },
      {
        p: 'Acting as the CEO, CFO or CHRO, it merges every request in the file, as HR admin does.',
        ...LEADER,
        scoped: false,
      },
      {
        p: 'Export requests, in the header and on Mine, saves the requests you can read in full, with their steps and the comments you may read.',
      },
      { h: 'New', ...RAISES_REQUESTS },
      {
        p: 'Pick a type and fill in its form. The preview beside it says what the form still needs, shows the freeze notice where the org is frozen, and the approval chain the request would store. Save draft keeps it; Submit sends it to its first step.',
        ...RAISES_REQUESTS,
      },
      {
        p: 'The preview also shows the band estimate and the target org’s gap after approval.',
        surface: ['tab:requests.new', 'cost:band'],
      },
      {
        p: 'In this mode the gap after approval shows in heads: the cost gap shows on Targets, with this request’s band estimate beside it.',
        surface: ['pay:rounded', 'tab:requests.new'],
      },
      {
        p: 'In Manager mode a request stays inside your team, the preview shows heads only, and your HRBP processes transfers.',
        ...MANAGER,
      },
      {
        p: 'Submit for submits on behalf of a manager in your unit.',
        surface: 'action:request.submit-on-behalf',
      },
      {
        p: 'While a cycle is open, a New role, Level change or Trade can go in as a ranked ask for the cycle, with your rank.',
        surface: ['tab:requests.new', 'action:cycle.rank'],
      },
      {
        p: 'A Trade gives up seats for new ones worth no more standard heads; what is left over stays as trade credit. Its quote card shows the weights and the credit. [Trading heads](article:trading-heads)',
        ...RAISES_REQUESTS,
      },
      {
        p: `Every free-text box says "${FREE_TEXT_HINT}" A comment that mentions an amount goes to approvers only.`,
      },
      { h: 'Mine' },
      {
        p: 'Your requests, in progress first, then the tracker after approval. Pick a row to open its card: the chain and each step, the changes an HRBP made at approval and why, a send-back or reject reason, the comments you may read, and what you can do now: submit or submit again, withdraw, add the freeze exception, or comment.',
        ...RAISES_REQUESTS,
      },
      {
        p: 'Finance mode raises no requests, so Mine holds only requests raised by the person you act as in another mode. Export requests here saves the requests you can read in full.',
        unless: 'tab:requests.new',
      },
      {
        p: 'A draft or a sent-back request expires after 60 idle days. Its requester can still withdraw it.',
        ...RAISES_REQUESTS,
      },
      { h: 'Approvals' },
      {
        p: 'The requests whose waiting step is yours, the longest waiting first. Open one to approve it, send it back or reject it, with a reason the requester reads; a reason cannot mention an amount.',
      },
      {
        p: 'Approve with changes, on the HRBP step, approves with a different level, start or location, and says why.',
        surface: 'action:request.approve-with-changes',
      },
      { p: 'The card adds the band estimate and the gap after approval.', ...AMOUNTS },
      {
        p: 'In Manager mode the card shows heads, your allocation after approval and your status after approval, never an amount.',
        ...NO_AMOUNTS,
      },
      {
        p: 'An approval item closes when the request is decided, so the Action center offers it Snooze only.',
      },
      { h: 'Cycle' },
      { p: 'The planning cycle for the next fiscal year: its stage strip and due dates.' },
      {
        p: 'In Manager mode you see your own ranked asks, rank them with Rank your asks, and read the cycle’s dates.',
        ...MANAGER,
      },
      {
        p: 'Order your unit’s ranked asks against its target and drag the cut line: the heads and in-year band estimate above and below it. The managers who have not sent their asks are listed with Copy note, a polite message to send them. Finish HRBP review for your unit when it is done; during HRBP review you can also approve an ask with changes.',
        ...HRBP,
      },
      {
        p: 'Adjust the ranking and the cut line within your org’s envelope: a line that puts more heads above it than the target has room for is refused. Then finish Leader review for your org.',
        ...LEADER,
      },
      {
        p: 'Open the cycle and set its dates, move the stage on, then lock the cycle or return it. The lock decides each unit by the cut line the tab shows: asks above it are approved and asks below it rejected as "Below the cut line". It waits while any ask still waits on its manager.',
        ...RUNS_CYCLE,
      },
    ],
  },
  {
    id: 'view-forecast',
    group: 'views',
    title: 'Forecast',
    summary:
      'Year-end heads and full-year cost: closed months from the closes and open months projected, the variance against the comparison, and the bridge between them.',
    keywords: [
      'forecast',
      'projection',
      'year end',
      'full year',
      'starts',
      'exits',
      'attrition',
      'backfills',
      'variance',
      'bridge',
      'waterfall',
      'fx',
    ],
    keywordsWhere: [{ surface: 'cost:component', words: ['exit run rate', 'run rate'] }],
    route: { view: 'forecast' },
    tour: 'view-forecast',
    metrics: [
      'forecast.heads.yearEnd',
      'forecast.cost.fullYear',
      'forecast.starts.expected',
      'forecast.exits.modeled',
    ],
    body: [
      {
        p: 'The forecast keeps the closed months from the month closes and projects the open ones, month by month to the end of the version’s grid:',
      },
      {
        ul: [
          'Open seats start by their expected dates (the target start, or the time to fill from when the seat opened), each with the fill rate as its chance. Planned seats start at their planned start, or the time to fill after the as-of date if that is later, also at the fill rate. The rest is Unfilled at horizon. Accepted offers start on their start date; On hold seats never start.',
          'People exit at the attrition rate, with known exits on their last day; a named exit is never predicted.',
          'Backfills reopen the seat of a modeled exit, after the lag, at the backfill rate, and none under a freeze.',
          'A freeze holds openings that have not started, but honors accepted offers.',
        ],
      },
      { h: 'Overview' },
      {
        ul: [
          'Key figures: the year-end heads forecast against target, the full-year cost forecast against the comparison, expected starts, modeled exits and unfilled at horizon.',
          'The readout beside heads by month: closed actuals, then the projection. Then starts and exits by month.',
        ],
      },
      {
        ul: ['The exit run rate, one month’s cost times 12, shows as a sixth key figure.'],
        surface: 'cost:component',
      },
      {
        ul: [
          'Cost is rounded down to $0.1M per team; the exit run rate and cost with equity show in Finance mode.',
        ],
        ...ROUNDED,
      },
      // forecast.accuracy.* (PLAN 12, R14; M4 review SA-1), each where the mode shows it: two key
      // figures on Variance (src/views/forecast/engine/kpis.ts `accuracyKpis`).
      { h: 'Forecast accuracy', surface: 'metric:forecast.accuracy.heads' },
      {
        p: 'Forecast accuracy says how close the forecast stored with a reforecast came to the actuals of the months closed since that reforecast locked: 1 − |forecast − actual| ÷ actual, for heads at each closed month-end, and for loaded cost.',
        surface: ['metric:forecast.accuracy.heads', 'metric:forecast.accuracy.cost'],
      },
      {
        p: 'Forecast accuracy says how close the forecast stored with a reforecast came to the actuals of the months closed since that reforecast locked: 1 − |forecast heads − actual heads| ÷ actual heads, at each closed month-end. Its cost figure shows in Finance mode.',
        surface: 'metric:forecast.accuracy.heads',
        unless: 'metric:forecast.accuracy.cost',
      },
      {
        p: 'Forecast accuracy is among the key figures of the Variance tab. A reforecast stores the company’s forecast, so the figure is the whole company’s: under an org filter, or for a team, unit or org, it reads "—" with the reason.',
        surface: 'metric:forecast.accuracy.heads',
      },
      { h: 'Variance' },
      {
        p: 'Each org’s heads, average FTE and cost against the comparison, by month, quarter to date, year to date and full year. Positive cost is over.',
      },
      { p: 'In this mode cost shows at quarter to date, year to date and full year only.', ...ROUNDED },
      { h: 'Bridge' },
      {
        p: 'From the comparison’s total to the forecast’s, one driver at a time: timing (back-dated adjustments included), position changes, attrition against the vacancy factor, mix (level, location and FTE changes), pay rate, assumption rates, transfers and FX. Each step opens its calculation card and the positions behind it, and the FX effect for the period sits above it.',
      },
      {
        p: 'A step with fewer than 5 positions whose amount moved folds into Other changes, so a step never isolates a few people. Transfers reads 0: moved seats carry their plan with them, so a move between orgs shows in the other steps.',
      },
      // PLAN 7.5 (M4 review SA-4): with the switch on nothing folds.
      { p: 'With Show pay amounts on, no step folds: every step shows as its own row.', ...PAY_SWITCH },
      {
        p: 'In this mode the bridge is built from each team’s rounded parts: most steps show their band part, and the rest of each step sits in Other changes.',
        ...ROUNDED,
      },
      { h: 'Against a target' },
      {
        p: 'When the comparison is a target (a fiscal year with no locked version yet, or the target picked), year-end heads compare with target heads and full-year cost with target cost, while Variance and Bridge show an empty state: a target has no monthly plan.',
      },
    ],
  },
  {
    id: 'view-targets',
    group: 'views',
    title: 'Targets',
    summary:
      'Each org’s heads and cost target for the fiscal year against what it asks for, sub-org targets, and the leader tree by cost center.',
    keywords: [
      'targets',
      'target',
      'gap',
      'asks',
      'envelope',
      'sub-org',
      'unallocated',
      'split',
      'cost center',
    ],
    route: { view: 'targets' },
    tour: 'view-targets',
    metrics: [
      'targets.target.heads',
      'targets.asks.heads',
      'targets.gap.heads',
      'targets.subOrg.unallocated',
    ],
    body: [
      {
        p: 'Finance sets a heads and cost target per org for each fiscal year. Asks are what the org will have at its target date: the Working seats that start by then, plus the effect of each pending request. The gap is the target less the asks, in heads and cost.',
      },
      {
        p: 'A pending request enters asks at its band estimate, for the months of the year from its start, never at anyone’s pay. Pay and offers move asks only once a request is approved.',
      },
      { h: 'Gap' },
      {
        ul: [
          'Key figures: target heads, asks, the gap in heads, target cost, the gap in cost, and what is unallocated.',
          'Gap by org: each target org’s asks against its target as a bullet, with the table behind it, heads from trades included.',
          'Target changes: every change to a target, with who made it and when.',
        ],
      },
      {
        ul: [
          'In this mode target and asks cost are rounded down to $0.1M per team, and an org that is not a whole set of teams compares heads only.',
        ],
        ...ROUNDED,
      },
      {
        ul: [
          'Below the business unit, an org row shows cost only where it is a whole set of shown cost centers; other rows show heads.',
        ],
        ...FINANCE,
      },
      {
        ul: [
          'With Show pay amounts off, HR admin reads org rows below the unit under the same rule as Finance.',
        ],
        ...PAY_SWITCH,
      },
      {
        ul: ['Set a target sets an org’s heads and cost target for the fiscal year shown, or changes one.'],
        surface: 'action:target.set',
      },
      { h: 'Sub-org targets' },
      {
        p: 'A parent org’s target split into its sub-orgs’ targets. What is not split yet is Unallocated. A move past a sub-org’s cost envelope needs a Finance exception, listed under the envelope exceptions waiting on Finance.',
      },
      {
        p: 'In HRBP mode this tab is read only: leaders split sub-org targets.',
        unless: 'action:target.split',
      },
      {
        p: 'Split a target divides your org’s target among its sub-orgs; Move target moves target from one sub-org to another, inside the envelope.',
        surface: 'action:target.split',
      },
      { p: 'A split or a move past the envelope needs Finance.', ...LEADER },
      {
        p: 'A sub-org gets a cost target only where it is a whole set of teams; the others get heads targets.',
        ...ROUNDED,
      },
      { h: 'Tree × cost center' },
      { p: 'Approved heads for each node of the leader tree and each cost center.' },
      { p: 'Cost shows for each unit and cost center, under the unit’s one fold.', ...EXACT },
      { p: 'With Show pay amounts on, nothing folds: every cost center shows on its own.', ...PAY_SWITCH },
      { p: 'In this mode the tab shows heads only, since cost centers are not whole teams.', ...ROUNDED },
    ],
  },
  {
    id: 'view-whatif',
    group: 'views',
    title: 'What if',
    summary:
      'Try levers on Working and see what they change: heads, cost and the gap, before anything is requested.',
    keywords: [
      'what if',
      'scenario',
      'levers',
      'lever',
      'defer',
      'cancel',
      'shift',
      'freeze',
      'trade',
      'model',
      'simulate',
    ],
    keywordsWhere: [{ surface: 'action:whatif.turn-into-requests', words: ['turn into requests', 'drafts'] }],
    route: { view: 'whatif' },
    tour: 'view-whatif',
    metrics: ['whatif.delta.heads', 'whatif.delta.cost', 'whatif.delta.gap'],
    body: [
      {
        p: 'What if is a tool, not a report. Its one tab, Levers, holds the lever list and, beside it, a result strip of exactly three results: the heads change, the cost change and the gap change, plus a trade rate for each trade lever. Results compare Working with the levers against Working without them.',
      },
      {
        p: 'It covers the scope of the person you act as, for the shown version’s fiscal year, and the filters never narrow it.',
      },
      { h: 'The levers' },
      {
        ul: [
          'Defer a start, or shift starts by a number of months.',
          'Cancel an Open or Planned seat.',
          'Change level, or change location.',
          'Freeze a sub-org from a date.',
          'Trade: give seats for new ones worth no more standard heads; what is left over stays as trade credit. [Trading heads](article:trading-heads)',
        ],
      },
      {
        p: 'Levers act on Planned seats and Open seats with no accepted offer, listed under Seats a lever can change; a seat with an accepted offer is never offered. Levers stay in this browser tab until you clear them or reload, and are never saved. Copy scenario copies the levers and the heads and gap change as text, never an amount.',
      },
      { h: 'The results' },
      {
        ul: [
          'Heads change: heads at the scope’s target date with the levers, less heads without them.',
          'Cost change: loaded cost with the levers less loaded cost without them, the levers costed at band estimate from each change’s date to the year end.',
          'Gap change: the gap with the levers less the gap without them, against the scope’s target. With no target for the year it reads empty, with a sentence that says so.',
          'Trade rate: for each trade lever, how many wanted seats the seats given buy, in standard heads. Nothing rounds up.',
        ],
      },
      {
        p: 'Each result opens its calculation card. Pending requests count on both sides, so the results show only what the levers change.',
      },
      {
        p: 'In this mode the cost change is a band figure; a difference that would move anyone’s pay never shows.',
        ...ROUNDED,
      },
      { h: 'Turn into requests', surface: 'action:whatif.turn-into-requests' },
      {
        p: 'Turn into requests makes Draft requests for review in Requests > Mine, one per seat a lever touches: a deferred or shifted start becomes a Start date, a cancelled seat an Elimination, a level or location change a Level or Location change, and a trade a Trade. The freeze lever is never turned into a request: freezes are Finance’s, so it stays in What if for you to share with Finance.',
        surface: 'action:whatif.turn-into-requests',
      },
      {
        p: 'Finance mode shows the levers and their results; HRBPs and leaders make requests from them. Copy scenario gives them the levers as text.',
        unless: 'action:whatif.turn-into-requests',
      },
    ],
  },
  {
    id: 'view-finance',
    group: 'views',
    title: 'Finance',
    summary:
      'Versions and locks, month closes, assumptions and FX, freezes, reconciliation and the FP&A load file.',
    without: [
      {
        surface: 'tab:finance.export',
        summary:
          'Versions and locks, month closes, assumptions, freezes and reconciliation, read only but for your unit’s settings.',
      },
    ],
    keywords: [
      'finance',
      'versions',
      'lock',
      'hash',
      'close',
      'month close',
      'assumptions',
      'fx',
      'rates',
      'bands',
      'freezes',
      'reconcile',
      'reconciliation',
      'standard head',
    ],
    keywordsWhere: [{ surface: 'tab:finance.export', words: ['load file', 'fp&a', 'export'] }],
    route: { view: 'finance' },
    tour: 'view-finance',
    body: [
      {
        p: 'In HRBP mode this view is read only, except your unit’s time to fill, fill rate and backfill settings in Working, and Mark reviewed on your unit’s reconciliation exceptions.',
        ...FINANCE_READ_ONLY,
      },
      { h: 'Versions' },
      {
        p: 'Every version with its state, lock date, lock hash and engine version, and whether the hash still verifies. Each fiscal year has one Working version that changes. Locking writes a new locked version and keeps Working editable; reopening a reforecast retires the year’s Working and starts a new one from it.',
      },
      {
        p: 'Lock, reopen and close a month from the changes bar above the list. A Budget lock also stores the standard head.',
        surface: 'action:version.lock',
      },
      {
        p: 'Month closes fix a month’s actuals. Hires and exits recorded after a close show as back-dated adjustments by position, with no amount.',
      },
      { p: 'Adjustment amounts show only as sums by posted month, for the company.', ...EXACT },
      { p: 'In HRBP mode adjustments show as counts only.', ...FINANCE_READ_ONLY },
      // forecast.accuracy.cost on Finance > Versions (src/views/finance/engine/versions.ts; M4 review SA-1).
      {
        p: 'Forecast accuracy (cost) compares the loaded cost that the fiscal year’s latest reforecast stored for the months closed since it locked with their actual cost: 1 − |forecast − actual| ÷ actual. A reforecast stores the company’s forecast, so the figure is the whole company’s and reads "—" while an org filter is set.',
        surface: ['metric:forecast.accuracy.cost', 'tab:finance.versions'],
      },
      { h: 'Assumptions' },
      {
        p: 'Every assumption value of the version shown, with the level it is set at (org, unit or company): bands, FX, burden, benefits, bonus, equity, severance, forecast drivers and GL accounts. Trade rates holds the standard head and each level and location’s weight, which trades are quoted in. Locked versions read only.',
      },
      {
        p: 'Finance changes rates and drivers in Working when the change moves 5 or more costed people; a change that would move fewer is refused, with the reason. Burden caps, the merit and promotion-pool dates and percentages, and bonus targets come from import and read "Set by import."',
        ...FINANCE,
      },
      {
        p: 'Bands, FX, loads and attrition are read only in this mode; your unit’s time to fill, fill rate and backfill settings can be changed in Working.',
        surface: 'action:assumptions.edit-operational',
        unless: 'action:assumptions.edit',
      },
      { p: 'HR admin changes every value, and sets the others by import.', ...HR_ADMIN },
      { p: 'Remove override takes an org’s value back to its parent’s.', surface: 'action:assumptions.edit' },
      { h: 'Freezes' },
      {
        p: 'Each freeze with the org and dates it covers and whether it allows backfills, and the openings it holds. A freeze holds openings without changing their status: they stay approved heads and stay in the gap, but the forecast does not start them while it lasts.',
      },
      { p: 'Freeze savings show the cost the held openings would have added.', ...EXACT },
      { p: 'Savings amounts are Finance’s; this mode shows the openings held.', ...FINANCE_READ_ONLY },
      {
        p: 'Create a freeze, or change its dates, backfills and reason, from the changes bar.',
        surface: 'action:freeze.create',
      },
      { h: 'Reconcile' },
      {
        p: 'Where the plan and the HRIS disagree, by kind: active employees not in the plan, reqs not in plan, cost-center mismatches and the rest. Mark reviewed records that someone looked at an exception.',
      },
      { p: 'In HRBP mode the tab covers your business unit.', ...FINANCE_READ_ONLY },
      { h: 'Export', ...LOAD_FILE },
      {
        p: 'The FP&A load file: the long CSV for the whole company at Finance’s rules, for the version you pick here, never cut by the filters on screen. Its control totals show beside it.',
        ...LOAD_FILE,
      },
      {
        p: 'Groups under 5 are suppressed in the file: cost centers under 5 fold into their unit’s Other (k), and each row is one row of loaded cost. Its control totals give USD per component for each whole unit and the company wherever the screen shows that split, never for a cost center.',
        ...FINANCE,
      },
      // The finance-export-components figure (src/views/finance/engine/export.ts; M4 review SB-1).
      {
        p: 'Control totals by component lists those splits, one row per unit or the whole company and period: base, bonus, burden, benefits, one-time and vacancy allowance, then Open and Planned at band estimate apart, then loaded cost and the costed people behind it. A unit or the company has a row in a period only where every component it covers has 5 or more contributing positions. The file carries the same lines after its control totals.',
        surface: ['tab:finance.export', 'cost:monthly'],
      },
      {
        p: 'With Show pay amounts on, HR admin is also offered the unsuppressed file. The file at Finance’s rules is still written as with the switch off, and, made with it on, both start with "Contains individual pay".',
        ...PAY_SWITCH,
      },
    ],
  },
  {
    id: 'view-data',
    group: 'views',
    title: 'Data room',
    summary:
      'HR admin’s home: the eight datasets and their tiers, data quality, metric definitions, the official lists and workspace files.',
    keywords: [
      'data room',
      'data',
      'datasets',
      'upload',
      'import',
      'replace',
      'mapping',
      'quality',
      'tier',
      'certify',
      'definitions',
      'lists',
      'workspace',
    ],
    route: { view: 'data' },
    tour: 'own-data',
    body: [
      {
        p: 'The Data room is HR admin’s home. It shows what data is loaded and how good it is, and holds the definitions and lists every number is checked against. Every number on it is a count of rows; none shows a value from a row.',
      },
      { h: 'Datasets' },
      {
        p: 'Records by month for each dataset (a gap shows here before it moves a number), then the manifest of the eight datasets: Positions, Workers, Compensation, Requisitions, Requests, Targets, Hiring freezes and Assumptions, each with its tier and source. Open a row for its four panels:',
      },
      {
        ul: [
          'Raw: the sheet as it came in, with its import log, or the rows as generated for the sample.',
          'Mapping: which column filled each field. Confirm mapping records your review.',
          'Quality: the tier, what keeps it from the next one, every check and each field’s coverage.',
          'Certify: a local attestation by the data owner that this exact version is right, with an optional note and control total. Gold also needs the mapping confirmed, the checks passing and fresh data.',
        ],
      },
      {
        p: 'Replace with your file, on a dataset, loads one Excel or CSV export for that dataset. You review how its columns were mapped and what the import changed before it replaces the dataset; the others keep running as they are, and an uploaded dataset can go back to the sample. [Loading your data](article:data-loading)',
      },
      { h: 'Data quality' },
      {
        p: 'The quality story across the plan: datasets by tier, the field matrix, and metrics by view and tier. [Data quality](article:data-quality)',
      },
      { h: 'Metric definitions' },
      {
        p: 'The dictionary of every number: its definition, formula and the fields it reads. Edit definition changes one for every page at once. [How definitions work](article:definitions-how)',
      },
      { h: 'Lists' },
      {
        p: 'The official lists the data is checked against: business units, departments, cost centers, locations, regions, legal entities, currencies, levels, job families, reason codes, worker types and the Roles list. Each shows where it came from, how many values it holds and how many rows hold a value not on it.',
      },
      { h: 'Workspace' },
      {
        p: 'The workspace files: save a Shareable or a Full file, export requests or a file for a manager, open a shared file, import requests, and import a workspace file with Replace or Merge. [Workspace files](article:data-workspace-file)',
      },
    ],
  },
  {
    id: 'view-actions',
    group: 'views',
    title: 'Action center',
    summary: 'Open items from every view: what needs your attention, and what is waiting on others.',
    without: [
      {
        surface: 'ui:attention-lists',
        summary: 'Every open item from every view, grouped by who it waits on.',
      },
    ],
    keywords: [
      'action center',
      'actions',
      'items',
      'open items',
      'needs attention',
      'waiting on others',
      'overdue',
      'snooze',
      'handled',
      'weekly review',
    ],
    route: { view: 'actions' },
    metrics: ['actions.items.open', 'actions.items.overdue'],
    body: [
      {
        p: 'The Action center gathers the open items the views raise, such as an approval waiting on you or a request waiting 5 or more days in a step. Each item says what is open, who it waits on, when it is due and where to act on it. No item carries an amount.',
      },
      {
        p: 'Two lists: Needs attention, your own items with the most pressing first, and Waiting on others, the items in your area that someone else holds, grouped by owner. The key figures and charts follow the list you pick, and the number on the Actions button is your Needs attention.',
        surface: 'ui:attention-lists',
      },
      {
        p: 'Each owner’s sheet has Copy note, a polite message to send them about their items.',
        surface: ['ui:attention-lists', 'action:cycle.copy-note'],
      },
      {
        p: 'This mode lists every open item, grouped by who it waits on, and the number on the Actions button is the open count.',
        unless: 'ui:attention-lists',
      },
      { p: 'Items are about your team, unit or org.', ...SCOPED },
      { p: 'In Finance mode no item is about one person.', ...FINANCE },
      {
        p: 'Mark handled takes an item off the list once it is in hand, and Snooze hides it for a few days. Both are kept in this browser, with your name if you type one, and can be reopened; a roll-up that changes after you marked it is open again. Approval items offer Snooze only, since they close when the request is decided.',
      },
      { p: 'Items from data below the data standard are listed with their tier and counted.' },
      { p: 'On a phone the list comes first and the overview follows.' },
    ],
  },
  {
    id: 'view-audit',
    group: 'views',
    title: 'Audit',
    summary: 'Every change to the plan, newest first: what changed, who made it, in which mode and when.',
    keywords: ['audit', 'log', 'history', 'changes', 'who changed', 'checksum', 'chain'],
    route: { view: 'audit' },
    metrics: ['audit.entries.count'],
    body: [
      {
        p: 'The Audit page lists the changes you can see, newest first: the record and field, the old and new values, who made the change and in which mode, when, the date it takes effect, and the comment. Filter by record type, record, person or dates; the count follows the filters.',
      },
      {
        p: 'Who made a change is the person the mode was acting as. Each entry carries a checksum of the one before it, so damage shows.',
      },
      {
        p: 'In HR admin mode the page checks the whole chain: "Chain checks out (n entries)", or the entry where it breaks.',
        ...HR_ADMIN,
      },
      {
        p: 'In this mode the page shows "n entries", counted over the rows you can see, and pay and cost changes read "changed".',
        ...NO_DATA_ROOM,
      },
      { p: 'The page covers your unit or org.', ...SCOPED },
      {
        p: 'An entry about an elimination or a change to a filled seat that you are not on shows only its state, position ID, title, level and org, made by "Approver" or "Requester".',
        ...LEADER,
      },
      {
        p: 'An entry about an elimination, a change to a filled seat or a transfer shows only its state, position ID, title, level and org, made by "Approver" or "Requester".',
        ...FINANCE,
      },
      {
        p: 'A request’s own changes also show on its card, on Requests > Mine and Approvals.',
      },
    ],
  },
]
