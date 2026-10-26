/**
 * Help articles, Start here: what Headcount Planner is and how to read and use it (docs/PLAN.md
 * 14.2): `what-headcount-planner-is`, `moving-around` (filters, the period, the version and
 * comparison pickers), `reading-a-number` (heads, FTE, loaded cost, "—", "Other (k)", calculation
 * cards), `clicking-down`, `exporting` (the header lines, the Suppressed flag, the long CSV, workspace
 * files) and `modes` (modes and Acting as, ending with `NOT_SECURITY_LONG`).
 *
 * Every block that names a page, tab, control or amount kind a mode hides carries a condition from
 * ./when.ts or a surface, never a mode name, so each mode reads only about what it shows; text with
 * an amount ("$0.1M") is written under a condition Manager mode does not meet. The `modes` article
 * describes every mode on purpose (src/help/names.ts `namedOnPurpose`), but still holds no amount in
 * Manager mode and no banned word anywhere. Ids are frozen (docs/CONTRACTS-M4.md); help-views wrote
 * the titles, summaries and bodies.
 */
import { FINANCE_EXPORT_LINE, modeExportLine, NOT_SECURITY_LONG, ROUNDED_EXPORT_LINE } from '@/access/copy'
import type { HelpArticle } from '../types'
import {
  AMOUNTS,
  AUDIT,
  EXACT,
  FINANCE,
  FINANCE_VIEW,
  FOR_MANAGER,
  HR_ADMIN,
  HRBP,
  LEADER,
  LEAVE_COUNTS,
  LOAD_FILE,
  MANAGER,
  NO_AMOUNTS,
  NO_DATA_ROOM,
  PAY_SWITCH,
  RAISES_REQUESTS,
  ROLE_HOME,
  ROUNDED,
  SCOPED,
  WHAT_IF,
  WORKSPACE_IMPORT,
} from './when'

/** Every amount-showing mode but HR admin with its switch: Finance, HRBP and Leader. */
const GUARDED_AMOUNTS = { surface: 'cost:band', unless: 'pay:switch' } as const

export const START_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'what-headcount-planner-is',
    group: 'start',
    title: 'What Headcount Planner is',
    summary:
      'A headcount plan built seat by seat: approved heads, openings, requests and approvals, targets, the forecast and cost, in one browser tab.',
    without: [
      {
        surface: 'cost:band',
        summary:
          'A headcount plan built seat by seat: your team’s seats, what is left to fill, and the requests that change them, in heads.',
      },
    ],
    keywords: ['about', 'overview', 'introduction', 'start', 'welcome', 'positions', 'seats', 'headcount'],
    tour: 'getting-started',
    body: [
      {
        p: 'Headcount Planner plans headcount by position. Every seat is a position with a status (Filled, Open, Planned, On hold or Eliminated), a level, a location, an FTE and the manager’s seat above it. The plan, the requests, the targets and the forecast all count those seats, so every number leads back to the positions behind it.',
        surface: 'view:forecast',
      },
      {
        p: 'Headcount Planner plans headcount by position. Every seat is a position with a status (Filled, Open, Planned, On hold or Eliminated), a level, a location, an FTE and the manager’s seat above it. Your team’s plan and requests count those seats, so every number leads back to the positions behind it.',
        unless: 'view:forecast',
      },
      {
        p: 'Each seat also carries a cost: a filled seat its holder’s pay, an Open or Planned seat the band estimate for its level and location. Cost is loaded cost in USD, at the version’s rates. [What loaded cost covers](article:cost-definition)',
        ...AMOUNTS,
      },
      {
        p: 'Manager mode counts heads and seats and shows no amounts. Your budget status is a word, with its reason in heads.',
        ...NO_AMOUNTS,
      },
      { h: 'What it is for' },
      {
        ul: [
          'Planning a fiscal year in versions: a Budget and reforecasts, each locked once agreed, and one Working version per year that changes as requests are approved. [Versions and locks](article:data-versions)',
          'Requests and their approvals: new roles, backfills, level and location changes, transfers, eliminations, trades, start recruiting and start dates, each routed through its approval chain.',
        ],
      },
      {
        ul: [
          'Targets: a heads and cost target for each org and year, against what the org asks for.',
          'The forecast: year-end heads and full-year cost, with closed months from the month closes and open months projected.',
        ],
        surface: ['view:targets', 'view:forecast'],
      },
      {
        ul: [
          'Your team: your allocation for the year, what is left to fill, what you still need to request, and where each of your requests is.',
        ],
        ...MANAGER,
      },
      { h: 'What you can count on' },
      {
        ul: [
          'Every counted number opens the records behind it, and every modeled number opens a calculation card with its inputs and each step. [Clicking down to the records](article:clicking-down)',
          'Every number has one definition, the same on every page. The info button beside a number shows it.',
          'Every number carries a data tier (bronze, silver or gold) that says how far its data has come. [Data tiers](article:data-tiers)',
        ],
      },
      {
        ul: [
          '[Metric definitions](route:data.metrics) holds every definition, and you can change one there.',
        ],
        ...HR_ADMIN,
      },
      {
        ul: [
          'Cost follows your mode’s rules before it reaches a page, an export or a file: a total of fewer than 5 costed people reads "—". [Small groups](article:privacy-small-groups)',
        ],
        ...AMOUNTS,
      },
      {
        ul: [
          'Everything runs in this browser. The data you load and the plan you build stay on this computer. [What stays in the browser](article:privacy-browser)',
        ],
      },
      { h: 'The pages' },
      {
        ul: [
          '[Home](route:home): your mode’s first page, with the number your role is judged on, Needs attention and My list. Headcount Planner opens here.',
        ],
        ...ROLE_HOME,
      },
      {
        ul: [
          '[My team](route:team): your allocation, what is left to fill, Needs attention and your request tracker. Headcount Planner opens here.',
        ],
        ...MANAGER,
      },
      {
        ul: [
          '[Data room](route:data): the eight datasets and their tiers, data quality, metric definitions, the official lists and workspace files. Headcount Planner opens here.',
        ],
        ...HR_ADMIN,
      },
      {
        ul: [
          '[Plan](route:plan): the plan overview against the comparison, every position by month, openings and transfers.',
        ],
        surface: ['tab:plan.overview', 'tab:plan.transfers'],
      },
      {
        ul: [
          '[Plan](route:plan): the plan overview against the comparison, every position by month, and openings.',
        ],
        surface: 'tab:plan.overview',
        unless: 'tab:plan.transfers',
      },
      {
        ul: ['[Plan](route:plan): your team’s positions by month, its openings and its transfers, in heads.'],
        unless: 'tab:plan.overview',
      },
      {
        ul: [
          '[Requests](route:requests): raise requests, follow them through their approvals, decide the steps that wait on you, and the planning cycle.',
        ],
        ...RAISES_REQUESTS,
      },
      {
        ul: [
          '[Requests](route:requests): every request in progress, the steps that wait on you, and the planning cycle, which Finance runs.',
        ],
        unless: 'tab:requests.new',
      },
      {
        ul: [
          '[Forecast](route:forecast): year-end heads and full-year cost, the variance against the comparison and the bridge between them.',
          '[Targets](route:targets): each org’s target against its asks, sub-org targets, and the leader tree by cost center.',
        ],
        surface: ['view:forecast', 'view:targets'],
      },
      {
        ul: [
          '[What if](route:whatif): try levers on Working and see heads, cost and the gap change before anything is requested.',
        ],
        ...WHAT_IF,
      },
      {
        ul: [
          '[Finance](route:finance): versions and locks, month closes, assumptions and FX, freezes, reconciliation and the FP&A export.',
        ],
        ...LOAD_FILE,
      },
      {
        ul: [
          '[Finance](route:finance): versions and locks, month closes, assumptions, freezes and reconciliation, read only but for your unit’s settings.',
        ],
        ...FINANCE_VIEW,
        unless: 'tab:finance.export',
      },
      {
        ul: ['[Action center](route:actions): every open item from every view, grouped by who it waits on.'],
        ...HR_ADMIN,
      },
      {
        ul: [
          '[Action center](route:actions): your Needs attention, and what is waiting on others in your area.',
        ],
        ...NO_DATA_ROOM,
      },
      {
        ul: ['[Audit](route:audit): every change to the plan, who made it, in which mode and when.'],
        ...AUDIT,
      },
      {
        p: 'Headcount Planner starts on sample data for a fictional company, Northgate Semiconductor, generated in this browser, so you can explore before your own data is loaded. [Sample data](article:privacy-sample)',
      },
      {
        p: 'Load your own exports in the [Data room](route:data), one dataset at a time. [Using your own data](tour:own-data)',
        ...HR_ADMIN,
      },
      {
        p: 'New here? [Take the 2-minute tour](tour:getting-started).',
        surface: 'help:tour:getting-started',
      },
      {
        p: 'New here? [Getting started with your home](tour:home-start) takes a minute.',
        surface: 'help:tour:home-start',
      },
    ],
  },
  {
    id: 'moving-around',
    group: 'start',
    title: 'Moving around',
    summary:
      'Folder tabs and sub-tabs, the masthead, the filter row, the period, the version and comparison pickers, links and Back.',
    keywords: [
      'navigate',
      'navigation',
      'tabs',
      'filter',
      'filters',
      'period',
      'fiscal year',
      'year to date',
      'quarter to date',
      'as of',
      'version',
      'comparison',
      'compare',
      'vs',
      'plan of record',
      'saved view',
      'views',
      'link',
      'share',
      'back',
      'bookmark',
    ],
    keywordsWhere: [{ surface: 'filter:exclude', words: ['exclude', 'except', 'leave out'] }],
    body: [
      { h: 'Folder tabs and sub-tabs' },
      {
        p: 'The folder tabs along the top are the views this mode shows, each with one live number for the current scope, such as approved heads on Plan. Click a tab to open its view. With the keyboard, move to the tabs and use the left and right arrow keys, or Home and End for the first and last.',
      },
      {
        p: 'Inside a view, the sub-tabs under its name go deeper. A tab this mode does not show is left out of the row, and a link to it opens the view’s first tab instead.',
      },
      { h: 'The masthead' },
      {
        ul: [
          'The Mode button shows your mode and who you act as. [Modes and Acting as](article:modes)',
          'Actions opens the Action center, with the count of your open items beside it.',
          'Workspace saves and opens plan files. [Workspace files](article:data-workspace-file)',
          'Settings holds your mode, the theme, text size and motion, and an index of every formula. Help is always there.',
        ],
      },
      { ul: ['Audit opens the log of every change to the plan.'], ...AUDIT },
      {
        ul: ['Data room opens your home: the datasets, their quality, the metric definitions and the lists.'],
        ...HR_ADMIN,
      },
      { h: 'The filter row' },
      {
        p: 'Filters narrow every view to part of the scope, and the count at the end of the row says how many people are in it. Each active filter shows as a chip: remove it with its cross, or use Reset to clear them all. The view header always states the scope, the period and the as-of date.',
      },
      {
        ul: [
          'Leader: a seat and every seat below it. Business unit, department, cost center, location, level, legal entity, country and currency narrow who is in scope; pick one or several values in each.',
          'With Show pay amounts off, cost under the filters follows Finance’s rules, so under some filters heads narrow while cost reads "—" with the reason.',
        ],
        ...HR_ADMIN,
      },
      {
        ul: [
          'Your business unit is pinned: its filter shows a pin and names it, and hovering it says why. Leader, department, cost center, location, level, legal entity, country and currency narrow inside it.',
        ],
        ...HRBP,
      },
      {
        ul: [
          'Your org is pinned: the leader filter keeps inside it. Pick a seat inside your org to narrow every view; business unit, department, cost center, location, level, legal entity, country and currency narrow inside it too.',
        ],
        ...LEADER,
        scoped: true,
      },
      {
        ul: [
          'Acting as the CEO, CFO or CHRO, Leader mode covers the whole company: pick a leader to narrow every view, or narrow by business unit, department, cost center, location, level, legal entity, country and currency.',
        ],
        ...LEADER,
        scoped: false,
      },
      {
        ul: [
          'Your team is pinned: the leader filter keeps inside the tree below your seat. Pick a seat inside it to narrow every view, or narrow by location and level.',
        ],
        ...MANAGER,
      },
      {
        ul: [
          'Finance mode filters by business unit, cost center, legal entity, country and currency, include only. Cost shows for whole business units: under a cost center, legal entity, country or currency filter, heads narrow and cost reads "—" with the reason.',
        ],
        ...FINANCE,
      },
      { h: 'Excluding a group', surface: 'filter:exclude' },
      {
        p: 'Each filter menu starts with Include and Exclude. Include keeps only the values you pick; Exclude keeps everyone except them. A group of fewer than 5 filled seats cannot be excluded, since comparing the scope with and without it would single those people out. Someone with no value for a filter you exclude stays in.',
        surface: 'filter:exclude',
      },
      { h: 'The period' },
      {
        p: 'Most numbers cover a fiscal period: the fiscal year of the as-of date (the default), year to date, quarter to date, one month, or a custom range. A month bar’s "Filter to this" picks that month.',
      },
      {
        p: 'In this mode cost shows for the fiscal year, year to date and quarter to date only, and year to date and quarter to date end at the last closed month-end. Under a month or a custom range, cost figures show heads with a note that says so.',
        ...ROUNDED,
      },
      {
        p: 'The as-of date is the plan’s today: months closed before it are actuals, and everything after it is plan or forecast.',
      },
      { p: 'Set it in [Settings, Data](settings:data).', ...HR_ADMIN },
      { p: 'HR admin sets the as-of date for everyone using this browser.', ...NO_DATA_ROOM },
      { h: 'The version and the comparison' },
      {
        p: 'Beside the view’s title, two pickers set what every number reads. The version picker chooses the version the view shows: by default the fiscal year’s Working version, the one plan that changes. The comparison picker chooses what every "vs" figure compares with: a locked version of the same fiscal year, or that year’s target.',
      },
      {
        ul: ['The default comparison is the plan of record: the year’s latest locked version.'],
        unless: 'pay:exact',
      },
      {
        ul: ['The default comparison is the plan of record: the year’s latest locked version.'],
        ...HR_ADMIN,
      },
      { ul: ['The default comparison is the year’s locked Budget.'], ...FINANCE },
      {
        ul: [
          'Every change on a tile names its comparison ("vs FY27 Budget", "vs plan of record (Q1 Reforecast)") and opens the comparison’s rows.',
          'Only the target and the locked versions of the shown version’s fiscal year are offered, so a comparison never crosses years.',
          'A fiscal year with no locked version yet (FY28 today) compares with its target in every mode.',
        ],
      },
      {
        ul: [
          'Against a target, year-end heads compare with target heads and full-year cost with target cost. A target has no months, so monthly "vs" figures, Forecast > Variance and Forecast > Bridge show an empty state until you pick a version.',
        ],
        surface: 'view:forecast',
      },
      {
        p: 'The version and the comparison are pickers, not filters: no mode narrows them, and they stay in this tab’s address.',
      },
      { h: 'Saved views' },
      {
        p: 'Views, at the start of the filter row, saves the scope you use often: the period, the filters, the version and comparison, the data standard and, if you like, the page it opens on. The row shows the view’s name while the scope matches it, and "edited" once you change something. Update saves the change; Save as new keeps both. Saved views are kept in this browser.',
      },
      { h: 'Links, and going back and forward' },
      {
        p: 'The address holds the view, the tab, the filters, the version and the comparison, so a bookmark or a link opens the same page with the same scope. Copy link to this view, in the view’s Export menu, copies it. Names are never in the address: a leader is there by position ID.',
      },
      {
        p: 'The browser’s Back and Forward buttons move between views and tabs, and undo and redo filter changes. Changes made while one filter menu is open are one step. A link shows the same numbers only to someone with the same data loaded.',
      },
      {
        p: 'A link always opens inside your mode’s scope: when it names something outside it, that part is left out and a message says which.',
        ...SCOPED,
      },
    ],
  },
  {
    id: 'reading-a-number',
    group: 'start',
    title: 'Reading a number',
    summary:
      'Heads, FTE and standard heads, loaded cost, "—", "Other (k)", and the calculation card behind a modeled number.',
    without: [
      {
        surface: 'cost:band',
        summary: 'Heads, FTE and standard heads, "—", and the calculation card behind a modeled number.',
      },
    ],
    keywords: [
      'heads',
      'headcount',
      'fte',
      'approved heads',
      'actual heads',
      'standard heads',
      'dash',
      'hidden',
      'missing',
      'calculation',
      'formula',
      'how is this calculated',
    ],
    keywordsWhere: [
      { surface: 'cost:band', words: ['cost', 'loaded cost', 'band estimate', 'other', 'fold', 'rounded'] },
    ],
    metrics: ['plan.heads.approved', 'plan.fte.average', 'plan.trade.weight'],
    body: [
      { h: 'Heads and FTE' },
      {
        ul: [
          'A head is one seat counted once: Filled, Open or Planned. On hold and Eliminated seats are not heads.',
          'Approved heads at a date are the Filled, Open and Planned seats that start on or before the end of that date’s fiscal year, so a seat approved now for next year is not a head this year.',
        ],
      },
      // Actual heads (PLAN 2, M4 review HL-2 and CP-4): people, not seats, and the Not in plan row
      // only where Plan > Overview shows it; "on leave" only where the mode shows leave.
      {
        ul: [
          'Actual heads count the active employees in the HRIS on the date, people on leave and people with no position included; those with no position show on a "Not in plan" row. Contractors and interns count 0, and a person still counts on their last day.',
        ],
        surface: ['tab:plan.overview', 'leave:counts'],
      },
      {
        ul: [
          'Actual heads count the active employees in the HRIS on the date, people with no position included, who show on a "Not in plan" row. Contractors and interns count 0, and a person still counts on their last day.',
        ],
        surface: 'tab:plan.overview',
        unless: 'leave:counts',
      },
      {
        ul: [
          'Actual heads count the active employees in the HRIS on the date, people with no position included. Contractors and interns count 0, and a person still counts on their last day.',
        ],
        unless: 'tab:plan.overview',
      },
      {
        ul: [
          'FTE is a seat’s share of full time: 1 for full time, 0.5 for half. Average FTE spreads it over the days of the period, whatever the version’s proration, so a seat filled for part of the period counts for that part.',
        ],
      },
      {
        ul: [
          'Standard heads weigh a seat by its band estimate against the year’s standard head, so a senior seat counts for more than one. They show beside heads and on trades, and never change a head count. [Trading heads](article:trading-heads)',
        ],
        ...AMOUNTS,
      },
      {
        ul: [
          'Standard heads weigh a seat by its level and location against the year’s standard head, so a senior seat counts for more than one. They show beside heads and on trades, and never change a head count. [Trading heads](article:trading-heads)',
        ],
        ...NO_AMOUNTS,
      },
      { h: 'Cost', ...AMOUNTS },
      {
        ul: [
          'Loaded cost is base pay, bonus, burden, benefits and one-time costs (sign-on, relocation, agency fee and severance), in USD at the version’s rates, for the months of the period.',
          'A filled seat costs its holder’s pay from the HRIS; an Open or Planned seat costs its band estimate: the band midpoint for its level and location × FTE, plus standard bonus, capped burden and benefits, at plan rates. The band part stays apart from the filled part, as "Open and Planned at band estimate".',
          'Proration spreads a year’s cost over the days, half months or months a seat is active, as the version says.',
        ],
        ...AMOUNTS,
      },
      { ul: ['Cost incl. SBC adds equity, and shows only where a figure says so.'], ...EXACT },
      {
        ul: [
          'In this mode cost is loaded cost rounded down to $0.1M per team, for the fiscal year, year to date and quarter to date. Each team’s filled part and band part round down on their own, and a total is built from those parts, so it never says more than they do. Teams with fewer than 5 costed people are left out, with a note that says how many people.',
        ],
        ...ROUNDED,
      },
      {
        ul: [
          'In this mode totals are exact for groups of 5 or more costed people, and never one person’s pay.',
        ],
        ...FINANCE,
      },
      {
        ul: [
          'With Show pay amounts off, totals follow Finance’s rules. With it on, per-person amounts show and nothing is folded or hidden; the switch lasts for this session and turns off when you change mode.',
        ],
        ...PAY_SWITCH,
      },
      { h: 'When a number reads "—"' },
      {
        p: '"—" means the number is not shown here; it never means zero. Hover or focus it for the reason. The usual reasons:',
      },
      {
        ul: [
          'A cost amount of fewer than 5 costed people: "Hidden to protect anonymity (n < 5)". Head counts still show.',
          'A difference (a variance, a bridge step, a change against the comparison) with fewer than 5 positions whose amount moved.',
        ],
        ...AMOUNTS,
      },
      {
        ul: ['A quarter or year to date that covers fewer than two closed months, in this mode.'],
        ...ROUNDED,
      },
      {
        ul: [
          'A figure that needs something the version or the comparison does not have, such as a monthly "vs" figure against a target.',
        ],
      },
      {
        ul: [
          'The leave count under any filter or any period but the default: it shows for your whole scope only.',
        ],
        ...LEAVE_COUNTS,
      },
      { p: 'With Show pay amounts on, no amount is hidden for a small group.', ...PAY_SWITCH },
      {
        p: 'Manager mode shows no amounts, so cost never appears in it; where another mode would show an amount, Manager mode shows heads or a word.',
        ...NO_AMOUNTS,
      },
      { h: '"Other (k)"', ...AMOUNTS },
      {
        p: 'In a breakdown, groups too small to show on their own fold into one row, "Other (k)", where k counts the groups folded in, not people. While Other is itself under 5, the smallest shown group joins it. The shown rows and Other always add up to the total.',
        ...AMOUNTS,
      },
      {
        p: 'Finance mode has one fold per unit, by cost center. Rows by site, country, legal entity or currency are sums of the unit’s shown cost centers, and a folded cost center stays in its unit’s Other everywhere.',
        ...FINANCE,
      },
      {
        p: 'With Show pay amounts off, HR admin reads the same fold as Finance; with it on, nothing folds.',
        ...PAY_SWITCH,
      },
      { h: 'Calculation cards' },
      {
        p: 'A modeled number (a forecast, a band estimate, an allocation, a gap, a standard head) opens a calculation card instead of a list: its inputs, each with where it came from and the level it is set at (org, unit or company), then each step of the arithmetic down to the number on screen, and the comparison it is set against. "Show the n records" opens the rows it adds up.',
        ...AMOUNTS,
      },
      {
        p: 'A modeled number (an allocation, left to fill, budget status, standard heads) opens a calculation card instead of a list: its inputs, then each step down to the number on screen. In this mode a card shows heads, rates and words only. "Show the n records" opens the rows it counts.',
        ...NO_AMOUNTS,
      },
      {
        p: 'A card’s amounts come from the same guarded figure as the page, so an input or step this mode does not show reads "—" on the card too, and a cost card lists its positions with no amount column.',
        ...GUARDED_AMOUNTS,
      },
      {
        p: 'In this mode every amount on a cost card is a team’s rounded part, added step by step with the Rounding step; no exact sum, local amount or cost component shows.',
        ...ROUNDED,
      },
    ],
  },
  {
    id: 'clicking-down',
    group: 'start',
    title: 'Clicking down to the records',
    summary:
      'Counted numbers open the records they count, modeled numbers open a calculation card, and a position opens its card.',
    keywords: ['drill', 'drill down', 'records', 'list', 'rows', 'position card', 'who', 'details', 'back'],
    keywordsWhere: [{ surface: 'focus:leave-out', words: ['leave out', 'filter to this'] }],
    body: [
      {
        p: 'A number with a dotted underline opens the records behind it in a panel on the right. A counted number opens exactly the rows it counts, so the list is as long as the number. Sort, search and download the list, and click a row that leads somewhere to go one step further.',
      },
      {
        p: 'A weighted number (average FTE, probability-weighted starts, half-month heads, asks with eliminations taken off) opens its rows with a "Counts as" column, which adds up to the number.',
      },
      {
        p: 'A modeled number opens its calculation card instead: the inputs and each step down to the number. [Reading a number](article:reading-a-number)',
      },
      {
        p: 'A list of ten or more positions opens with a short summary: the positions by business unit or department and by level, each bar opening just those records on top.',
      },
      { h: 'The position card' },
      {
        p: 'Click a position to open its card: its title, level, org and status, who holds it, the chain of seats above it, its status history and holders over time, its reqs, the requests that touch it, and its standard heads. Seats in the chain open their own cards, and the counts (positions reporting to it, every position below it, its reqs) open their records. No amount is ever on a position card.',
      },
      {
        p: 'The card also lists the position’s audit rows, and its Changes in Working: the start, level, location, FTE and hold changes made in Working.',
        ...AUDIT,
      },
      {
        p: 'A position outside your scope opens a short card that says so, with nothing else on it.',
        ...SCOPED,
      },
      { h: 'Filter to this', surface: 'focus:filter-to' },
      {
        p: 'Where the rows form one group of a filter (a business unit, a department, a location), the panel offers "Filter to" that group, which narrows every view to it.',
        surface: 'focus:filter-to',
      },
      // Manager and Finance never read the word "leave" (CONTRACTS-M4 8.3, M4 review HL-12): where the
      // mode shows no leave, the control is described rather than named.
      {
        p: '"Leave out" keeps everything except that group. Neither is offered where it would drop 1 to 4 filled seats.',
        surface: ['focus:leave-out', 'leave:counts'],
      },
      {
        p: 'The panel can also keep everything except that group. Neither is offered where it would drop 1 to 4 filled seats.',
        surface: 'focus:leave-out',
        unless: 'leave:counts',
      },
      { h: 'Back and the stack' },
      {
        p: 'Records, position cards and calculation cards open on top of each other in the panel. Back walks out one step at a time, and Escape closes the panel with focus back where you were.',
      },
      { h: 'What the records show in this mode' },
      {
        p: 'Manager mode lists positions, requests (your own and the ones you approve), reqs with offer dates only, and Action center items, never an amount.',
        ...NO_AMOUNTS,
      },
      {
        p: 'Records never carry one person’s amount: a cost list shows the positions behind a total, with no amount column.',
        ...GUARDED_AMOUNTS,
      },
      {
        p: 'In HR admin mode per-person amounts show in records only while Show pay amounts is on.',
        ...PAY_SWITCH,
      },
      { p: 'Rows outside your scope are left out of every list.', ...SCOPED },
    ],
  },
  {
    id: 'exporting',
    group: 'start',
    title: 'Exporting',
    summary:
      'A figure’s CSV, Excel or image, the whole view as a workbook or a deck, the long CSV and workspace files, each with the header that says what it holds.',
    keywords: [
      'export',
      'download',
      'csv',
      'excel',
      'xlsx',
      'powerpoint',
      'pptx',
      'deck',
      'slides',
      'png',
      'svg',
      'copy',
      'header',
      'long csv',
      'control totals',
      'file',
      'shareable',
      'about these numbers',
    ],
    keywordsWhere: [
      { surface: 'cost:band', words: ['suppressed', 'why'] },
      { surface: 'tab:finance.export', words: ['load file', 'fp&a', 'fpa'] },
    ],
    body: [
      { h: 'One figure' },
      {
        p: 'At the top right of each figure, the table button shows the rows behind the chart and the info button lists its definitions. The download button saves CSV or Excel, copies the table, or saves the chart as PNG or SVG; some figures add their detail rows as Excel.',
      },
      { h: 'The whole view' },
      {
        p: 'Export, in the view header, saves every figure on this tab, or on every tab of the view, as one Excel workbook (a Summary sheet, then a sheet per figure) or one PowerPoint deck (a title slide, "About these numbers", then a slide per figure). "Copy link to this view" copies the address with the scope spelled out.',
      },
      {
        p: 'Every output carries what the screen shows, from the same figures: a column this mode hides is left out of the file too.',
      },
      { h: 'The header on every output' },
      {
        p: 'Each file says what it holds: the version and its lock (the lock hash, or "Working, not locked"), the comparison, the as-of date, the proration, the rates, the cost definition, the filters and the rounding, then the mode it was made in.',
        ...AMOUNTS,
      },
      {
        p: 'Each file says what it holds: the version and its lock (the lock hash, or "Working, not locked"), the comparison, the as-of date, the proration and the filters, then the mode it was made in. A file made in Manager mode names your team and says it holds no amounts.',
        ...NO_AMOUNTS,
      },
      {
        p: 'The workbook’s Summary and the CSV carry every line, each sheet’s title block a short one, the deck’s "About these numbers" slide all of them, and an image the version and the as-of date.',
      },
      { p: `In this mode the mode line adds: "${FINANCE_EXPORT_LINE}"`, ...FINANCE },
      { p: `In this mode the mode line adds: "${ROUNDED_EXPORT_LINE}"`, ...ROUNDED },
      // HR admin names its mode too (M4 review CP-1, lead decision D-MODELINE), and every output made
      // with the switch on says first that it holds individual pay (D-PAYFILES).
      { p: `In this mode the mode line reads "${modeExportLine('hr-admin')}"`, ...HR_ADMIN },
      {
        p: `With Show pay amounts on, every export’s first line is "Contains individual pay": a figure’s CSV, Excel, copy or image, the workbook, the deck, the long CSV and both load files. The mode line then reads "${modeExportLine('hr-admin').replace(/\.$/, '')} with pay amounts shown.", and the rounding line "None: HR admin with pay amounts shown", except in the load file at Finance’s rules, whose rows and rounding line stay Finance’s.`,
        ...PAY_SWITCH,
      },
      { h: 'Amounts in a table', ...AMOUNTS },
      {
        p: 'Amounts are written as numbers, never text, so they add up in a spreadsheet. A table with an amount column also gets two columns, Suppressed and Why: a hidden amount’s cell is empty, never 0 and never words, with Yes under Suppressed and the reason under Why.',
        ...AMOUNTS,
      },
      { h: 'The long CSV', surface: 'action:export.long-csv' },
      {
        p: 'Export also writes the long CSV: one row per period, org, cost center, account, component and currency, with heads and FTE, and the header facts repeated as columns (version, lock hash, as-of, proration and rate set) so the file stands alone. Its rows come from the same guarded figures as the screen, and its control totals let you check it against the screen.',
        surface: ['action:export.long-csv', 'cost:band'],
      },
      // Manager mode's long CSV has heads and FTE columns only (LONG_HEADS_COLUMNS; M4 review HL-11).
      {
        p: 'Export also writes the long CSV: one row per period, org and cost center, with heads and FTE, and the version, lock hash, as-of and proration as columns so the file stands alone. It holds no amount columns. Its rows come from the same figures as the screen, and its control totals of heads and FTE let you check it against the screen.',
        surface: 'action:export.long-csv',
        unless: 'cost:band',
      },
      {
        ul: [
          'Each row has one currency, with the local amount, the rate and the USD amount; local amounts are never added across currencies.',
        ],
        surface: ['action:export.long-csv', 'cost:monthly'],
      },
      {
        ul: [
          'Rows are by unit and cost center. Cost centers under 5 fold into one Other (k) row per unit, the same fold for every period, account and component.',
          'A cost center row is one row of loaded cost, with the reason "Components show for whole units and the company."',
          // Lead decision D-SPEC (M4 review SB-1, CP-3): the split by component is in the control
          // totals, for whole units and the company, where C33 (b) lets the screen show it.
          'Control totals are heads, FTE, loaded USD and the count of suppressed cells, with USD per component for each whole unit and the company wherever the screen shows that split.',
          // As componentTotalLines writes them (src/views/finance/engine/longCsv.ts; fix step, loose ends).
          'Each split is one line per period for a unit or the company: base, bonus, burden, benefits, one-time and vacancy allowance, then Open and Planned at band estimate apart, then loaded cost. Finance > Export lists the same lines as "Control totals by component".',
        ],
        ...FINANCE,
      },
      {
        ul: [
          'With Show pay amounts off it follows Finance’s rules, with the same folds; with it on, nothing in it is folded or suppressed.',
          // The open file's own split (src/lib/export/controlTotals.ts `ControlTotal.components`).
          'With it on, every row is one component in one currency, and the control totals add a line by component for the file’s scope and for each unit in it.',
        ],
        ...PAY_SWITCH,
      },
      {
        ul: [
          'Rows with an amount are quarter to date, year to date or full year, for whole departments and teams: loaded cost in USD, the screen’s rounded value. Every other row carries heads and FTE only, with Suppressed set to Yes and the reason.',
          'Control totals are heads, FTE and the screen’s rounded loaded total.',
        ],
        ...ROUNDED,
      },
      { h: 'The load file', ...LOAD_FILE },
      {
        p: '[Finance > Export](route:finance.export) writes the FP&A load file: the long CSV for the whole company at Finance’s rules, for the version you pick there, never cut by the filters on screen.',
        ...LOAD_FILE,
      },
      {
        p: 'It is written with no org filter set: while a unit, department, cost center or other org filter narrows the screen, Finance > Export asks you to clear the filters first. The period, version and comparison pickers can stay as they are.',
        ...LOAD_FILE,
      },
      {
        p: 'With Show pay amounts on, HR admin is also offered the unsuppressed load file. Both files then start with "Contains individual pay"; the one at Finance’s rules keeps Finance’s rows.',
        ...PAY_SWITCH,
      },
      { h: 'Workspace files' },
      {
        p: 'Workspace, in the masthead, saves and opens plan files: Save a Shareable file holds what this mode shows; Export requests holds the requests you can read in full, with their steps and the comments you may read; Open a shared file reads a file someone sent you. [Workspace files](article:data-workspace-file)',
      },
      // Lead decision D-PAYFILES (M4 review EX-1, EX-2): a Shareable file is HR admin's view with the
      // switch off, whatever the switch says.
      {
        p: 'A Shareable file is always written as HR admin mode shows the plan with Show pay amounts off, under Finance’s rules, and the save dialog says so. Individual pay goes out only in a Full file or in an output made with the switch on.',
        ...PAY_SWITCH,
      },
      {
        p: 'Export for a manager writes a Shareable file exactly as Manager mode shows it to the manager you pick, so each manager gets a file made for them.',
        ...FOR_MANAGER,
      },
      {
        p: 'HR admin also saves a Full file of the whole workspace and imports one with Replace or Merge.',
        ...WORKSPACE_IMPORT,
      },
      {
        p: 'An opened file is shown through your current mode and who you act as, never the mode it was made in. A file’s contents are readable JSON, so send each person a file made for them. Checksums in a file catch damage; they do not prove who made it.',
      },
      {
        p: 'Comments and reasons in any output follow the same rules as on screen: a comment you may not read is left out.',
      },
      {
        p: 'In Manager mode every reason and comment in an output reads an amount as "an amount".',
        ...NO_AMOUNTS,
      },
    ],
  },
  {
    id: 'modes',
    group: 'start',
    title: 'Modes and Acting as',
    summary:
      'Five modes shape Headcount Planner for how you use it, and Acting as picks whose team, unit or org it shows.',
    keywords: [
      'mode',
      'modes',
      'acting as',
      'act as',
      'manager',
      'hrbp',
      'leader',
      'finance',
      'hr admin',
      'switch mode',
      'who',
      'scope',
      'sign in',
      'login',
    ],
    body: [
      {
        p: 'Headcount Planner has five modes. Each shows the pages, figures and amounts that fit one way of working, and opens on its own home. Change mode with the Mode button in the masthead, or in [Settings, Mode](settings:mode).',
      },
      { h: 'The five modes' },
      {
        ul: [
          'Manager: your team’s roles, to get them approved and filled, and what is left. Opens on My team, in heads only.',
          'HRBP: one business unit’s plan and cycle: positions, requests, approvals and transfers. Opens on Unit plan.',
          'Leader: your org against its target: approvals, sub-org targets and What if. Opens on Rollup vs target.',
          'Finance: the whole company: targets, assumptions, FX, freezes, cycles, month closes and locks. Opens on Plan vs actual.',
          'HR admin: everything, the Data room and imports, with pay amounts behind a switch. Opens on the Data room.',
        ],
      },
      { h: 'Cost in each mode', ...AMOUNTS },
      {
        ul: [
          'Manager mode shows no amounts: heads, seats and words only.',
          'HRBP and Leader mode show loaded cost rounded down to $0.1M per team, for the fiscal year, year to date and quarter to date, and omit teams under 5 costed people.',
          'Finance mode shows exact totals for groups of 5 or more costed people, never one person’s pay.',
          'HR admin mode shows totals under Finance’s rules, and per-person amounts while Show pay amounts is on. The switch lasts for this session and turns off when you change mode.',
          'Every mode but Manager sees band estimates for Open and Planned seats.',
        ],
        ...AMOUNTS,
      },
      {
        p: 'Manager mode shows heads, seats and words; the other modes add cost, each under its own rules.',
        ...NO_AMOUNTS,
      },
      { h: 'Acting as' },
      {
        p: 'Each mode acts as one person: a manager, an HRBP and their business unit, a leader, a Finance person or an HR admin. The pick sets whose team, unit or org the mode shows, who is named on the requests you raise and the steps you decide, and who the audit log records. Pick it with "Change who you act as" in the Mode menu.',
      },
      {
        ul: [
          'Manager mode shows the tree strictly below the manager’s own seat, so nothing about their own seat reaches them.',
          'HRBP mode shows one business unit.',
          'Leader mode shows the leader’s org, or the whole company for the CEO, CFO and CHRO.',
          'Finance and HR admin mode cover the whole company; the pick names who approves and who the audit log records.',
        ],
      },
      {
        p: 'With the sample data, each mode starts acting as its sample person, so no first page is blank. With your own data, a mode that keeps to a team, unit or org shows nobody until you pick who you act as.',
      },
      {
        p: 'Changing mode releases the filters the previous mode pinned, and a link or saved view always opens inside the new mode’s scope.',
      },
      { h: 'What a mode is, and is not' },
      {
        p: 'A mode decides what the pages, exports and files show, and Acting as decides whose steps wait on you. Neither is a sign-in. [Why there is no sign-in](article:about-server)',
      },
      { p: NOT_SECURITY_LONG },
    ],
  },
]
