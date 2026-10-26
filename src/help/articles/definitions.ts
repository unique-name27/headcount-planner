/**
 * Help articles, Definitions: how metrics are defined, the glossary, what cost means and trading
 * heads (docs/PLAN.md 14.2).
 *
 * M4 freeze (docs/CONTRACTS-M4.md): every id of this group is registered with its group, a working
 * title and its structural fields (route, tour, generated content); help-trust writes the summaries
 * and bodies, and may retitle. Ids are frozen. Conditions come from ./when.ts and are written
 * against surfaces, never mode names.
 *
 * `definitions-how` and `glossary` are limited outside HR admin (their Data room links read as
 * text), so each names Metric definitions only under `HR_ADMIN`. `cost-definition` is hidden in
 * Manager mode. `trading-heads` shows in every mode: its worked example (fixture T1 of PLAN 11.7,
 * checked against the trade engine in ./trust.test.ts) is written in standard heads for everyone,
 * and its amounts sit under `AMOUNTS`, so Manager mode reads none (7.6, 11.6).
 */
import type { HelpArticle } from '../types'
import {
  AMOUNTS,
  EXACT,
  FORECAST,
  HR_ADMIN,
  MANAGER,
  NO_AMOUNTS,
  NO_DATA_ROOM,
  RAISES_REQUESTS,
  ROUNDED,
  WHAT_IF,
} from './when'

export const DEFINITION_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'definitions-how',
    group: 'definitions',
    title: 'How metrics are defined',
    summary: 'One definition per metric, the same in every view and export, kept in Metric definitions.',
    without: [
      {
        surface: 'page:data',
        summary:
          'One definition per metric, the same in every view and export, with every formula in Settings.',
      },
    ],
    keywords: [
      'metric',
      'definition',
      'dictionary',
      'formula',
      'population',
      'window',
      'setting',
      'definition changed',
      'formulas',
      'calculation',
      'reset',
    ],
    keywordsWhere: [{ surface: 'ui:edit-definition', words: ['edit definition', 'change a metric', 'undo'] }],
    route: { view: 'data', tab: 'metrics' },
    body: [
      {
        p: 'Every number Headcount Planner shows has one entry in [Metric definitions](route:data.metrics), a tab of the Data room: its definition, formula, population (who counts), window, unit, owner, the data it reads and the settings its calculation uses. The info buttons, the figure notes, the calculation cards and the exports all read that entry.',
        ...HR_ADMIN,
      },
      {
        p: 'Every number Headcount Planner shows has one definition, the same in every view, mode and export: what is counted, who counts, the window and the settings its calculation uses. The info buttons and the figure notes read it. HR admin keeps the definitions, so a change reaches every view at once.',
        ...NO_DATA_ROOM,
      },
      { h: 'What a definition holds' },
      {
        ul: [
          'The definition and the formula.',
          'The population: who counts, and who is left out. Contractors and interns count 0 heads and are not costed.',
          'The window: a month-end, a month, the quarter or year to date, or the fiscal year.',
          'The unit, and which direction is good.',
          'The data used: each field it reads, with its tier.',
          'Settings: the values its calculation reads, with their defaults, such as how many days in a step count as waiting, or the idle days before a request expires.',
        ],
      },
      { h: 'Changing a definition', surface: 'ui:edit-definition' },
      {
        ol: [
          'Open the metric: "Edit definition" in its info button, or pick it from the list in Metric definitions.',
          'Change the wording (definition, formula, population) or a setting, and save. Each setting is checked against its allowed range.',
          'Every view and export follows at once, and the entry’s Changes list says who changed what and when.',
        ],
      },
      {
        p: '"Reset to defaults" puts a metric back. A number worked out with a changed setting carries a "Definition changed" mark.',
      },
      {
        note: 'The privacy and cost guard rules are entries too, marked Locked or Raise only. Their minimums can be raised for your organization, never lowered, and pay amounts stay opt-in.',
      },
      { h: 'Every formula in one place' },
      {
        p: '[Settings, Formulas](settings:formulas) lists how every number is worked out, grouped by view: the definition, formula, population and window, and the settings it uses at their values in force. A changed setting is marked.',
        ...HR_ADMIN,
      },
      {
        p: '[Settings, Formulas](settings:formulas) lists how every number this mode shows is worked out, grouped by view: the definition, formula, population and window, and the settings it uses at their values in force. A changed setting is marked.',
        ...NO_DATA_ROOM,
      },
      {
        p: 'Definitions travel with the settings file in [Settings, This device](settings:device), so another computer can use the same ones.',
        surface: 'settings:device-files',
      },
      {
        p: 'The [Glossary](article:glossary) lists every metric this mode shows with its definition.',
      },
      {
        note: 'The privacy rules are definitions too. Their minimums can be raised for your organization, never lowered, and pay amounts stay opt-in.',
        ...NO_DATA_ROOM,
      },
    ],
  },
  {
    id: 'glossary',
    group: 'definitions',
    title: 'Glossary',
    summary: 'Every metric, with its definition, built from Metric definitions.',
    without: [{ surface: 'page:data', summary: 'Every metric this mode shows, with its definition.' }],
    keywords: ['terms', 'dictionary', 'definitions', 'what does it mean', 'meaning', 'glossary'],
    generated: 'glossary',
    body: [
      {
        p: 'This list is built from [Metric definitions](route:data.metrics), so it always matches what Headcount Planner calculates, your changes included. Select a name to open its entry, with its formula, settings and data.',
        ...HR_ADMIN,
      },
      {
        p: 'This list is built from the metric definitions in force, so it always matches what Headcount Planner calculates. It lists the metrics this mode shows. [Settings, Formulas](settings:formulas) has each formula and its settings.',
        ...NO_DATA_ROOM,
      },
      {
        p: 'The privacy and cost guard rules are listed as "Privacy rule". Search the Help sheet for a term to find it here and in the articles.',
      },
    ],
  },
  {
    id: 'cost-definition',
    group: 'definitions',
    title: 'What cost means',
    summary: 'Loaded cost, band estimates, proration and FX: how a seat’s cost is built.',
    keywords: [
      'loaded',
      'base',
      'bonus',
      'burden',
      'benefits',
      'one-time',
      'sign-on',
      'relocation',
      'agency fee',
      'severance',
      'band',
      'midpoint',
      'proration',
      'daily',
      'half-month',
      'full-month',
      'fx',
      'currency',
      'plan rate',
      'actual rate',
      'forecast rate',
      'equity',
      'sbc',
      'vacancy',
      'hris estimate',
      'merit',
    ],
    metrics: ['plan.cost.loaded', 'plan.cost.bandEstimate', 'plan.cost.openBand', 'forecast.fx.effect'],
    body: [
      {
        p: 'Cost in Headcount Planner is loaded cost: base + bonus + burden + benefits + one-time items, in US dollars. Targets, budgets, variance and the gap all use it. Equity (SBC) is not part of loaded cost.',
      },
      {
        p: 'Figures labeled incl. SBC add equity: the level’s equity amount a year × FTE, for the months each seat is active.',
        ...EXACT,
      },
      { h: 'What each seat costs' },
      {
        ul: [
          'A Filled seat costs at HRIS pay: the full-time base × FTE, so 0.6 FTE at €100,000 is €60,000.',
          'A seat with an accepted offer costs at the offer, from the agreed first day.',
          'Open and Planned seats cost at band estimate.',
        ],
      },
      { p: 'Then, for every seat:' },
      {
        ul: [
          'Bonus = base × target % × funding %.',
          'Burden = Σ over its parts of rate × the lower of base + bonus and the part’s cap. Caps are not scaled by FTE.',
          'Benefits: the country’s amount a head, not scaled by FTE.',
          'One-time items book whole in one month: sign-on and relocation in the start month, the agency fee in the month the offer is accepted, and severance in the month of the day after an eliminated seat’s last day, which is the next month only when the last day is a month-end.',
          'Merit runs from the merit date for people started by its cutoff, and the promotion pool lifts Filled base from its date.',
          'Plan versions carry a vacancy allowance: each month, the vacancy factor (3% in the sample) of the filled cost, taken off as a line of its own. The forecast and the month closes carry none.',
        ],
      },
      { h: 'Band estimate' },
      {
        p: 'A band estimate is the band midpoint × FTE plus standard loads (bonus at target × funding, capped burden and benefits), a year, in US dollars at the version’s plan rates. It reads no one’s pay. Request estimates, the leader threshold, Open and Planned seats, pending requests in the asks and trades use it. In an in-year total it counts only from the start or effective date to the fiscal year’s end, never as a full year.',
      },
      {
        p: 'Open and Planned seats at band estimate are a line of their own, "Open and Planned at band estimate", and are never added into a total over fewer than 5 costed people.',
      },
      {
        p: 'Manager mode never shows a band estimate. A manager’s budget status uses band cost (midpoint × FTE, no loads) and shows words and heads.',
      },
      { h: 'Proration' },
      {
        p: 'Each version has a rule for months a seat is active in part, stored with its lock:',
      },
      {
        ul: [
          'Daily: active days ÷ days in the month.',
          'Half-month: a start on day 1 to 15 counts the whole month and a later start half; a last day on day 1 to 15 counts half and a later one the whole month; a start and a last day in the same month count half.',
          'Full-month: the month counts if the seat is active on its last day, and nothing otherwise.',
        ],
      },
      {
        p: 'Average FTE is always daily, whatever the version’s proration. The sample’s FY27 Budget and Q1 Reforecast are daily.',
      },
      { h: 'A worked example' },
      {
        p: 'The planted Munich P4 seat: Planned, starting 16 Sep 2026, band midpoint €110,000, bonus 10% × funding 100%, burden 21% capped at €90,600, plan rate 1.08, no benefits.',
      },
      {
        ul: [
          'Bonus: €11,000. Burden: 0.21 × the lower of €121,000 and €90,600, so €19,026.',
          'A year: €140,026, which is $151,228.08 at 1.08.',
        ],
      },
      {
        ul: [
          'A month: €11,668.83. For September, daily and half-month proration both count half of it, €5,834.42 or $6,301.17; full-month counts all of it, $12,602.34.',
        ],
        ...EXACT,
      },
      { h: 'Currencies and FX' },
      {
        p: 'Each amount is worked out in the seat’s own currency, then turned into US dollars at the line’s rate: the version’s plan rates for plan lines, actual rates for closed months and forecast rates for open months. Amounts in two currencies are never added together in their own currencies.',
      },
      {
        p: 'The FX effect is what the rates moved against the comparison’s plan rates: Σ actual local amount × (actual rate − plan rate) for closed months, plus Σ forecast local amount × (forecast rate − plan rate) for open months. For example, €120,000 in open months at a plan rate of 1.08 and a forecast rate of 1.15 is $129,600 at plan and $138,000 at forecast, an FX effect of $8,400. The forecast never reads a plan rate, so editing Working’s plan FX moves neither the forecast nor the FX effect against a locked version.',
      },
      { h: 'Actual cost' },
      {
        p: 'Actual cost is an estimate from HRIS pay taken at each month close, "Actual (HRIS estimate)", not payroll. [Versions, locks and closes](article:data-versions)',
      },
      { h: 'In this mode', ...ROUNDED },
      {
        p: 'Cost shows as loaded cost only, rounded down to $0.1M per team, for the quarter to date, year to date and full year. Monthly cost, cost by component, cost with equity and the exit run rate read "—" with "Shows in Finance mode." [Small groups](article:privacy-small-groups)',
      },
      { h: 'In this mode', ...EXACT },
      {
        p: 'Cost shows exactly, for groups of 5 or more costed people, by month and by component where each component has 5 or more positions in it. [Small groups](article:privacy-small-groups)',
      },
    ],
  },
  {
    id: 'trading-heads',
    group: 'definitions',
    title: 'Trading heads',
    summary: 'Give seats for seats of another level, location or org, priced in standard heads.',
    keywords: [
      'trade',
      'trades',
      'standard head',
      'standard heads',
      'weight',
      'ratio',
      'credit',
      'trade credit',
      'basis points',
      'level mix',
      'location strategy',
      'cost-neutral mix',
      'swap',
      'exchange',
    ],
    keywordsWhere: [{ surface: 'cost:band', words: ['band estimate', 'leader threshold'] }],
    metrics: ['plan.trade.weight', 'requests.trade.ratio', 'requests.trade.credit'],
    body: [
      {
        p: 'A trade gives up seats and gets seats of another type (another level, location, FTE or org) worth no more than what was given. Trades are priced in standard heads, so they read the same in every mode, and nobody’s pay goes into them.',
      },
      { h: 'Standard heads and weights' },
      {
        p: 'A standard head is Finance’s unit for trading: the average band estimate per approved full-time seat in the fiscal year’s Budget, set once a year when the Budget locks. A seat’s weight is its band estimate ÷ the standard head, at the seat’s own FTE.',
        ...AMOUNTS,
      },
      {
        p: 'A standard head is Finance’s unit for trading: what an average full-time seat in the fiscal year’s Budget costs at its pay band and standard loads, set once a year when the Budget locks. A seat’s weight says what it costs in standard heads, at its own FTE.',
        ...NO_AMOUNTS,
      },
      {
        p: 'So an average full-time seat weighs 1.00, a senior seat in San Jose more, and a seat in Bengaluru much less. Weights come only from bands, standard loads and plan FX rates, never from anyone’s pay or offer. They are kept to four decimal places (basis points of a standard head), so what is given always equals what is received plus the credit left over.',
      },
      { h: 'What can be traded' },
      {
        ul: [
          'Open seats with no accepted offer, Planned seats and On hold seats, in your scope, that are not in another pending request.',
          'Never a Filled seat: request an Elimination, then a New role.',
          'Never a seat with an accepted offer: its start date and terms come from the recruiting system.',
          'The seats you get take a level, location, FTE, org, job family and a start date in the first open month or later. Part time is offered only where the location allows it.',
        ],
      },
      { h: 'A worked example' },
      {
        p: 'This is the test fixture T1, at its own example rates (the sample’s rates differ). A manager gives 1 Planned P5 seat in San Jose, starting 1 Nov 2026, for P3 seats in Bengaluru from 1 Jan 2027.',
      },
      {
        ul: [
          'The P5 San Jose seat weighs 1.92 standard heads (1.9160). One P3 Bengaluru seat weighs 0.23 (0.2257).',
          'You can get 8: 8 × 0.2257 = 1.81 standard heads. A ninth would need 2.03, more than you give, and nothing rounds up.',
          'The ratio is 8.49 (1.9160 ÷ 0.2257): one P5 San Jose seat is worth 8.49 P3 Bengaluru seats.',
          'Trade credit: 1.9160 − 1.8056 = 0.1104, so 0.11 standard heads stay as credit, held by the giving org until its fiscal year closes. A later trade by the same org can use it.',
          'Heads: +7, the 8 seats received less the 1 Planned seat given. A seat given from On hold counts 0, since it was never an approved head, so the same trade from an On hold seat is +8.',
          'In FY27: the P5 seat drops out for 5 months (November to March) and the P3 seats come for 3 (January to March): 1.8056 × 3/12 − 1.9160 × 5/12 = −0.35, so the trade saves 0.35 standard heads this year.',
        ],
      },
      {
        p: 'The quote reads: "Give 1 P5 San Jose (1.92). Get 8 P3 Bengaluru (1.81). Credit 0.11 standard heads. Heads +7. In FY27 this saves 0.35 standard heads (start dates)."',
      },
      {
        ul: [
          'In the example the standard head is $150,000. The P5 San Jose seat’s band estimate is $287,400.00, and each P3 Bengaluru seat’s ₹2,821,600, which is $33,859.20 at 0.012.',
          'The 8 seats received have a band estimate of $270,873.60, over the $250,000 leader threshold, so the trade goes to the manager, the HRBP and the leader.',
          'The year’s saving is $52,040.00 at the standard head (0.35 standard heads), or $52,031.60 from the exact band estimates.',
          'Band estimate is kept to within half a basis point a seat, credit counted: $287,400.00 given against $270,873.60 received plus $16,560.00 of credit, $33.60 apart where 9 seats allow $67.50.',
          'Heads and band cost (midpoint × FTE, no loads) are not kept: band cost moves from $220,000 to $240,000.',
        ],
        ...AMOUNTS,
      },
      {
        p: 'Manager mode shows a trade in heads and standard heads only, never an amount.',
        ...NO_AMOUNTS,
      },
      { h: 'The approval chain' },
      {
        ul: [
          'The giving unit’s HRBP always approves. A trade across units adds the receiving unit’s HRBP, both unit leaders and Finance.',
          'The leader approves when the seats you get are over the leader threshold, a seat is Director or above, the trade is out of plan, or the giving and receiving orgs sit under different direct reports of that leader.',
          'Finance approves when the trade crosses units, is out of plan, or is a freeze exception.',
          'A trade inside one manager’s tree, in plan, under the threshold and with no Director or above seat stops at the HRBP.',
        ],
      },
      {
        ul: [
          'The HRBP may approve with changes: fewer seats or a later start. The trade is quoted again, and the manager sees the change, such as "Changed by your HRBP: 8 seats to 6, credit 0.11 to 0.56 standard heads".',
        ],
        surface: 'action:request.approve-with-changes',
      },
      {
        ul: [
          'When your HRBP changes a trade, the request says so, such as "Changed by your HRBP: 8 seats to 6, credit 0.11 to 0.56 standard heads".',
        ],
        ...MANAGER,
      },
      { h: 'On approval' },
      {
        p: 'The seats given become Eliminated, as Traded, from the approval date, and the seats received become new Planned seats. A seat given that still has an open requisition keeps it in the recruiting system, and an Action center item asks the HRBP to close it there.',
      },
      {
        p: 'Finance’s targets stay as they are. A pending trade counts net in the asks (seats received, less the Open or Planned seats given), so the gap does not move at approval.',
        ...FORECAST,
      },
      {
        p: 'A trade across units offers Finance "Move target too?" at its last step, which moves the units’ own targets with the seats.',
        ...EXACT,
      },
      {
        p: 'An approved trade becomes part of your allocation: the seats given drop out of it and the seats received join it. Standard heads show beside the allocation as a note and never set your budget status.',
        ...MANAGER,
      },
      { h: 'Where trades show' },
      {
        ul: [
          '[Requests > New](route:requests.new), Trade: pick the seats to give and the seats you want, and see the quote and who it goes to before you submit.',
        ],
        ...RAISES_REQUESTS,
      },
      {
        ul: [
          '[Requests > Approvals](route:requests.approvals) and [Requests > Mine](route:requests.mine): a trade card with the weights and the credit.',
          '[Plan > Positions](route:plan.positions): a Standard heads column for every seat.',
        ],
      },
      {
        ul: [
          'What if: a Trade lever with the same pickers. "Turn into requests" makes one Trade request per lever.',
        ],
        surface: ['view:whatif', 'action:whatif.turn-into-requests'],
      },
      {
        ul: [
          'What if: a Trade lever with the same pickers, to see a trade’s effect before anyone raises it.',
        ],
        ...WHAT_IF,
        unless: 'action:whatif.turn-into-requests',
      },
      {
        ul: ['[Targets > Gap](route:targets.gap): a Heads from trades column for each org.'],
        surface: 'tab:targets.gap',
      },
      {
        ul: [
          'Trade rates, on [Finance > Assumptions](route:finance.assumptions:trade-rates): the band estimate and weight of each level and location, and the standard head.',
        ],
        surface: 'tab:finance.assumptions:trade-rates',
      },
      {
        ul: [
          'My team: the allocation’s note in standard heads and your org’s trade credit, with an item when credit is about to lapse at the fiscal year’s end.',
        ],
        ...MANAGER,
      },
    ],
  },
]
