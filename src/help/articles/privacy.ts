/**
 * Help articles, Privacy and trust: the browser, why there is no sign-in (`about-server`), pay, small
 * groups, leave and the sample (docs/PLAN.md 14.2).
 *
 * M4 freeze (docs/CONTRACTS-M4.md): every id of this group is registered with its group, a working
 * title and its structural fields (route, tour, generated content); help-trust writes the summaries
 * and bodies, and may retitle. Ids are frozen. Conditions come from ./when.ts and are written
 * against surfaces, never mode names.
 *
 * `about-server` is shown in every mode and is the only article exempt from the banned-words scan
 * (src/access/copy.ts `BANNED_WORDS_EXEMPT`, pinned to exactly it): it says plainly that real
 * access control needs a server, so it must use a banned word, and ./trust.test.ts checks that it
 * does. Every other article here keeps clear of `BANNED_MODE_WORDS`, and none uses a word of
 * `BANNED_HASH_WORDS`. `privacy-small-groups` carries C33 and C34 (PLAN 15.2) in plain words, its
 * amounts under `AMOUNTS`, `ROUNDED` and `EXACT` and its leave sentences under `LEAVE_COUNTS`, so
 * Manager mode reads no amount and Finance mode no leave.
 */
import { NOT_SECURITY_SHORT } from '@/access/copy'
import type { HelpArticle } from '../types'
import {
  AMOUNTS,
  EXACT,
  FINANCE,
  FORECAST,
  HR_ADMIN,
  HRBP,
  LEADER,
  LEAVE_COUNTS,
  NO_AMOUNTS,
  NO_DATA_ROOM,
  PAY_SWITCH,
  ROUNDED,
} from './when'

export const PRIVACY_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'privacy-browser',
    group: 'privacy',
    title: 'Your data stays in this browser',
    summary:
      'Headcount Planner runs on this device. Files, settings and plan changes are stored in this browser only.',
    keywords: [
      'privacy',
      'local',
      'storage',
      'indexeddb',
      'local storage',
      'upload',
      'server',
      'cloud',
      'origin',
      'shared origin',
      'github pages',
      'download',
      'one file',
      'clear',
      'delete',
      'protected characteristics',
    ],
    body: [
      {
        p: 'Headcount Planner runs entirely in your browser. There is no server and no account. Files are read on this device and stored in this browser’s own storage, and nothing is sent anywhere.',
      },
      { h: 'What is kept in this browser' },
      {
        ul: [
          'The datasets: the sample’s, or the files HR admin loaded, with their versions, original sheets, column choices and certifications.',
          'The plan: versions and their locks, month closes, requests, approvals, comments, cycles, trades and the audit log. Work done on the sample is kept beside it, so a reload keeps your approvals.',
          'Settings, filters, saved views, the metric definitions and official lists in force, your mode and the people you act as, your Action center marks, and which tours you finished.',
        ],
      },
      { ul: ['Show pay amounts is never stored: it lasts for the session.'], ...PAY_SWITCH },
      { ul: ['The sample itself is never stored: it is generated again on every load.'] },
      { h: 'The shared origin' },
      {
        p: 'A browser keeps each site’s storage apart by its origin (the scheme, host and port), not by its path. The live copy at unique-name27.github.io/headcount-planner shares one origin with every other app published at unique-name27.github.io, and any of them can read the others’ browser storage. So use the live copy with the sample only, and download headcount-planner.html for real data: it is the same app in one file that runs from your own computer.',
      },
      {
        p: 'Some browsers, Chrome and Edge among them, may also treat every page opened from a file as one origin. Headcount Planner keeps its data under its own database name and "hcp:" keys, which keeps it apart from another app opened the same way, but not hidden from it. Keep real data in a browser profile on a computer you trust.',
      },
      { h: 'Another browser, another computer' },
      {
        p: 'Another browser, another browser profile or another computer starts on the sample. To move work, save a workspace file. [Workspace files](article:data-workspace-file)',
      },
      {
        p: 'To move your settings, metric definitions, lists and saved views, use the settings file in [Settings, This device](settings:device). It never holds data, plan work or pay amounts.',
        surface: 'settings:device-files',
      },
      {
        p: '"Clear everything on this device", in [Settings, This device](settings:device), deletes everything Headcount Planner stored in this browser and starts over on the sample. A tab that only reads cannot clear: close the other tab first.',
      },
      { h: 'What never comes in' },
      {
        p: 'Headcount Planner has no field for gender, ethnicity, age or any other protected characteristic. When a file has such columns, stand-ins for them such as graduation year, or free-text comment columns, they are dropped as the file is read.',
      },
      {
        note: 'Exports and workspace files are files like any other: once saved, they follow your company’s rules for confidential data. And anyone with the browser’s own developer tools can read what this browser stores, whatever the mode. [Why there is no sign-in](article:about-server)',
      },
    ],
  },
  {
    id: 'about-server',
    group: 'privacy',
    title: 'Why there is no sign-in',
    summary:
      'Headcount Planner runs in this browser with no server: modes change what it shows, not who can see the data.',
    keywords: [
      'server',
      'sign-in',
      'sign in',
      'login',
      'log in',
      'password',
      'account',
      'security',
      'access control',
      'phase 3',
      'checksum',
      'hash',
      'forgery',
      'trust',
    ],
    body: [
      {
        p: 'Headcount Planner runs entirely in this browser. There is no server behind it, no account and no password: the app and its data live on this device.',
      },
      { h: 'Modes are not security' },
      { p: NOT_SECURITY_SHORT },
      {
        p: 'Anyone using Headcount Planner can switch modes or pick who they act as, and every mode reads the same data in this browser. An approval records a decision in this workspace; it does not prove who made it. The browser’s own developer tools can read everything stored here, whatever mode is picked.',
      },
      {
        p: 'So share Headcount Planner, its file and its workspace files only with people who may see all of it. [Modes and Acting as](article:modes)',
      },
      { h: 'What real access control needs' },
      {
        p: 'Real access control needs a server with sign-in: each person signs in, and the server decides what data reaches their browser, so data they may not see never arrives there. That is planned for Phase 3, with HRIS and ATS sync. Until then, the cost guard and the rules about requests and comments decide what each mode shows, and tests check them, but they are not a secure boundary between people.',
      },
      { h: 'Checksums and hashes' },
      {
        p: 'Workspace files carry a checksum, and locked versions and the audit log carry hashes. They catch damage: a file changed by accident or cut short is refused. They do not prove who made a file: anyone who edits one can compute a new checksum. Treat a file as coming from whoever sent it.',
      },
      {
        p: '[Your data stays in this browser](article:privacy-browser) says what is stored and where, including the shared origin of the live copy.',
      },
    ],
  },
  {
    id: 'privacy-pay',
    group: 'privacy',
    title: 'Pay amounts',
    summary:
      'What each mode shows of pay and cost: rounded team totals, exact group totals, or amounts behind a session switch.',
    without: [
      {
        when: ROUNDED,
        summary:
          'This mode shows cost rounded down to $0.1M per team, over groups of 5 or more, never one person’s pay.',
      },
      {
        when: FINANCE,
        summary:
          'Finance mode shows exact cost totals over groups of 5 or more costed people, never one person’s pay.',
      },
      {
        when: PAY_SWITCH,
        summary: 'HR admin sees exact totals, and one person’s amounts only while Show pay amounts is on.',
      },
    ],
    keywords: [
      'salary',
      'pay',
      'amounts',
      'compensation',
      'offer',
      'sign-on',
      'money',
      'dollars',
      'cost',
      'totals',
      'rounded',
      'individual pay',
      'confidential',
    ],
    keywordsWhere: [{ surface: 'pay:switch', words: ['show pay amounts', 'switch', 'full file'] }],
    metrics: ['privacy.payAmounts'],
    body: [
      {
        p: 'Pay is the most sensitive thing Headcount Planner holds. One person’s pay (a base salary, an offer, a sign-on bonus, relocation, an agency fee, or a seat’s own cost) shows only in HR admin mode, behind a switch that lasts one session. Every other number with money in it is a total over a group, guarded before any view, export or file reads it.',
      },
      { h: 'In this mode', ...ROUNDED },
      {
        ul: [
          'Cost is built from cost atoms: a director’s org, or a VP’s own direct staff. Each atom’s cost is rounded down to a whole $0.1M on its own, and a larger row adds the rounded parts.',
          'Cost shows for whole departments and teams, for the quarter to date, year to date and full year. A location, level or cost-center filter, or a month, shows heads with a note.',
          'Atoms with fewer than 5 costed people are left out, with "n people in groups under 5 are left out".',
          'Monthly cost, cost by component, cost with equity and the exit run rate read "—" with "Shows in Finance mode."',
          'Open and Planned seats show their band estimate, built from bands, never from anyone’s pay. Nothing tied to a Filled seat or an accepted offer shows on its own.',
        ],
      },
      { h: 'In this mode', ...FINANCE },
      {
        ul: [
          'Exact totals over groups of 5 or more costed people. Smaller cost centers fold into their unit’s Other (k), and Other always holds 5 or more.',
          'Each unit’s cost centers are folded once, and every figure, filter and export reuses that fold. Country, legal-entity and currency rows are sums of the unit’s shown cost centers.',
          'A total opens the positions it counts, with no amount column. Every export says "Individual pay is left out."',
          'You never see one person’s pay, an offer, or a one-time cost of one hire on its own.',
        ],
      },
      { h: 'In this mode', ...PAY_SWITCH },
      {
        ul: [
          'With Show pay amounts off, HR admin sees exact totals under Finance’s rules, for the whole company. A leader, level or location filter shows heads and "Turn on Show pay amounts to see cost for this filter."',
          'Turn the switch on in [Settings, Privacy](settings:privacy). It lasts for this session only: every mode change turns it off, and amounts are hidden again the next time Headcount Planner opens.',
          'While it is on, the masthead says "Pay amounts shown" with Hide beside it, and every view, drill and export shows amounts per person and per seat, with no minimum group.',
          'Every export made while it is on starts with the line "Contains individual pay": a figure’s CSV, Excel, copy or image, the workbook, the deck, the long CSV and both load files. The Full file needs it on and starts the same way.',
          'A Shareable file is always written as with the switch off, under Finance’s rules, whatever the switch says, and the save dialog says so.',
        ],
      },
      { h: 'In every mode' },
      {
        ul: [
          'A band estimate reads no one’s pay: band midpoint × FTE plus standard loads, at plan rates. Request estimates, the leader threshold and trades use it, and a pending request counts at band estimate until it is approved.',
          'No amount appears in an Action center item, a toast or a comment shown outside its audience. A comment that mentions an amount is for approvers only, and every free-text box says "Do not include pay, performance or health details."',
          'Exports and workspace files carry exactly what the screen shows, through the same guard. [Small groups](article:privacy-small-groups)',
          'Manager mode shows no amounts at all: heads, status words and standard heads.',
        ],
      },
      {
        note: 'Turn pay amounts off before you share your screen, or export for an audience that should not see salaries.',
        ...PAY_SWITCH,
      },
    ],
  },
  {
    id: 'privacy-small-groups',
    group: 'privacy',
    title: 'Small groups',
    summary: 'No cost amount covers fewer than 5 costed people, and no difference moves fewer than 5.',
    without: [
      {
        when: NO_AMOUNTS,
        summary:
          'Manager mode shows no amounts, and no filter or count narrows a group to one or two people.',
      },
    ],
    keywords: [
      'anonymity',
      'minimum',
      'n < 5',
      'hidden',
      'hidden to protect anonymity',
      'suppressed',
      'other',
      'small',
      'dash',
      'fold',
      'contributors',
      'five',
    ],
    keywordsWhere: [
      { surface: 'pay:rounded', words: ['rounded', 'cost atom', 'atoms'] },
      {
        surface: 'cost:monthly',
        words: ['components', 'cost center', 'country', 'legal entity', 'currency'],
      },
    ],
    metrics: ['privacy.anonymity', 'cost.guard.minCosted', 'cost.guard.minContributors'],
    body: [
      {
        p: 'Headcount Planner never shows a number that could point to one person’s pay. The rules below run in the engines, before any view, export, workspace file or help text reads a number.',
      },
      { h: 'In this mode', ...NO_AMOUNTS },
      {
        p: 'Manager mode shows no amount of any kind, in any view, export, workspace file or comment. Budget status reads as a word with its reason in heads, and trades read in standard heads.',
      },
      { p: 'Counts of heads and seats still show, because managers work with named seats.' },
      { h: 'Costed people', ...AMOUNTS },
      {
        p: 'Every cost amount (a total, a variance, a bridge step, the FX effect, a gap, a per-head figure or an average) needs 5 or more costed people, or it reads "—" with "Hidden to protect anonymity (n < 5)". Costed people are employees in Filled seats, and accepted offers from their start date, counted over the figure’s own version and window. Counts of heads still show.',
      },
      {
        p: 'People on leave, paid or unpaid, stay costed people. Leave changes amounts, never who is counted, so a group never turns hidden because someone is on unpaid leave.',
        ...LEAVE_COUNTS,
      },
      {
        p: 'In the sample, cost center 1550-HSZ (Facilities, Hsinchu) has 3 costed people, so its cost reads "—" or sits in its unit’s Other in every mode, unless HR admin shows pay amounts.',
      },
      { h: 'Other (k)', ...AMOUNTS },
      {
        p: 'In a breakdown, groups under 5 fold into "Other (k)", where k is how many groups it holds. While Other is under 5, the smallest shown group joins it, so Other always holds 5 or more, or nothing, and the shown rows plus Other add up to the total.',
      },
      { h: 'Differences', ...AMOUNTS },
      {
        p: 'A difference (a variance, a bridge step, the FX effect, month over month, version against version, a What if change, a gap change or a change on a cost tile) needs 5 or more contributors: costed positions whose amount differs between its two sides. With fewer it reads "—" with "Hidden to protect anonymity (fewer than 5 positions changed)", and a bridge step with fewer folds into Other changes.',
      },
      {
        p: 'Open and Planned seats at band estimate do not count toward the 5. A difference made only of band estimates, such as a What if lever on a Planned seat or a trade’s cost, is a band figure and shows without a count. For the FX effect, only people paid in a currency other than the US dollar count.',
      },
      { h: 'Rounded to $0.1M per team', ...ROUNDED },
      {
        p: 'In this mode cost is built from cost atoms: a director’s org, or a VP’s own direct staff. Each atom’s Filled seats and its Open and Planned seats are two parts, each rounded down to a whole $0.1M on its own, and a department, team, unit or company row adds the rounded parts. Atoms under 5 costed people are left out, with "n people in groups under 5 are left out".',
      },
      {
        p: 'A row shows cost only when it is made of whole atoms, so cost shows for whole departments and teams, and other rows show heads. It shows for the quarter to date, year to date and full year, ending at the last closed month-end; a month shows heads. A difference is built from rounded parts too, so it says nothing the two rounded totals do not.',
      },
      {
        p: 'The atoms are fixed at each month close: edits, requests and approvals never move a seat from one atom to another before the next close.',
      },
      { h: 'Exact totals', ...EXACT },
      {
        p: 'Exact totals cover 5 or more costed people. Each unit’s cost centers are folded once, over every month of the version, and every figure, filter and export in that unit reuses that fold: a filter never folds again.',
      },
      {
        p: 'Country, legal-entity and currency rows are sums of the unit’s shown cost centers with that value. People in the unit’s Other are left out of them, with "n people in cost centers under 5 are left out", so a country row minus its shown cost centers covers nobody.',
      },
      {
        p: 'Cost filters are whole business units. Under a cost-center, legal-entity, country or currency filter, heads still narrow, but cost reads "—" with "Cost shows for whole business units. Cost centers, countries, legal entities and currencies are rows of each unit’s breakdown."',
      },
      {
        p: 'A component (base, bonus, burden, benefits, one-time or equity) needs 5 or more positions with an amount in it in its cell: hires for a sign-on or relocation, accepted offers for an agency fee, eliminated Filled seats for severance. If any component of a cell fails, the cell shows loaded cost only, because loaded cost minus the shown parts would give back the hidden one. In the long CSV and the load file each row is a unit’s cost center or its one Other (k) row, so each is one row of loaded cost, with "Components show for whole units and the company."; their control totals give USD per component for each whole unit and the company, where the split passes the rule below.',
      },
      {
        p: 'The split by component shows only on unit and company figures, and only when every component in every unit it covers passes and each capped burden part has 0 or 5 or more people below its cap and 0 or 5 or more at or above it.',
      },
      // The component control totals as written (src/views/finance/engine/longCsv.ts
      // `componentTotalLines`; M4 review SB-1): only splits the screen shows, the band part apart.
      {
        p: 'Each split in the control totals is one the screen’s calculation card shows for that unit or the company and period: the Filled seats’ base, bonus, burden, benefits, one-time and vacancy allowance, with Open and Planned at band estimate apart. [Finance > Export](route:finance.export) lists them as "Control totals by component".',
        surface: 'tab:finance.export',
      },
      // forecast.accuracy.cost (M4 review SA-1): a ratio of two company totals.
      {
        p: 'Forecast accuracy (cost) divides one company total by another, so it shows for the whole company only, and only when 5 or more costed people are behind the months it compares.',
        surface: 'metric:forecast.accuracy.cost',
      },
      {
        p: 'Org rows below a unit (a leader’s tree, a sub-org, a target row) show cost only when they are made of whole shown cost centers and what is left of their parent is too. Bridge steps and the FX effect show per unit and for the company, and back-dated adjustments and the count of other HRIS changes show for the company only.',
      },
      {
        p: 'With Show pay amounts off, HR admin follows the same rules for the whole company, and a leader, level or location filter shows heads with "Turn on Show pay amounts to see cost for this filter." With it on, every amount shows with no minimum group.',
        ...PAY_SWITCH,
      },
      { h: 'The bridge', ...FORECAST },
      {
        p: 'Which bridge steps show, and which fold into Other changes, is decided once for each mode, comparison and window, over the finest groups a scope can be narrowed to: business units in Finance and HR admin, the kept cost atoms in HRBP and Leader mode. That one fold applies in every scope, so no filter or Acting as pick shows a step another one folds.',
      },
      {
        p: 'The fold never reads leave: contributors are counted as if everyone on unpaid leave were paid, so a change between paid and unpaid leave never adds or removes a bridge row, in any mode or scope.',
        ...LEAVE_COUNTS,
      },
      // PLAN 7.5 (M4 review SA-4).
      {
        p: 'With Show pay amounts on, no step folds: every bridge step shows as its own row.',
        ...PAY_SWITCH,
      },
      {
        p: 'Closed months come from the month closes everywhere, so every view prices a closed month the same way.',
      },
      { h: 'Filters and counts' },
      {
        p: 'Counts of requests, items and approvals are worked out over the rows you may see, so a count never points to a request hidden from you.',
      },
      {
        p: 'An exclusion that would take away 1 to 4 Filled heads cannot be picked, so a filtered count never differs from the whole by one or two people.',
        surface: 'filter:exclude',
      },
      {
        p: 'Leave shows as one count for the whole unit or org at the as-of date, and only when it is 5 or more. [Leave](article:privacy-leave)',
        ...LEAVE_COUNTS,
      },
      { h: 'The minimums' },
      {
        p: 'The minimums are entries in [Metric definitions](route:data.metrics). They can be raised for your organization, never lowered below 5, and the rounding step can only rise.',
        ...HR_ADMIN,
      },
      {
        p: 'HR admin keeps the minimums with the metric definitions. They can be raised for your organization, never lowered below 5.',
        ...NO_DATA_ROOM,
      },
    ],
  },
  {
    id: 'privacy-leave',
    group: 'privacy',
    title: 'Leave',
    summary: 'Leave shows as one count for your whole unit or org, at the as-of date, when it is 5 or more.',
    without: [
      {
        when: PAY_SWITCH,
        summary: 'HR admin sees leave counts, and who is on leave only while Show pay amounts is on.',
      },
    ],
    keywords: ['leave', 'on leave', 'unpaid', 'paid leave', 'absence', 'count', 'privacy'],
    metrics: ['privacy.leaveCounts', 'plan.leave.onLeave'],
    body: [
      {
        p: 'Leave is personal, so Headcount Planner shows as little of it as it can. Manager and Finance mode never see leave at all: no column, filter, count or note.',
      },
      { h: 'In this mode', ...ROUNDED },
      {
        ul: [
          'One figure, people on leave, for your whole unit at the as-of date, and only when it is 5 or more.',
        ],
        ...HRBP,
      },
      {
        ul: [
          'One figure, people on leave, for your whole org at the as-of date, and only when it is 5 or more.',
        ],
        ...LEADER,
      },
      {
        ul: [
          'Under any filter but the version and the comparison, or any period but the default, it reads "—" with "Leave counts show for your whole unit or org at the as-of date."',
          'It has no breakdown, series, change or drill to people: selecting it opens a card with the count only.',
          'Anyone can switch who they act as, so a scope’s count shows only when every group of people the shown counts mark out has 0 or 5 or more on leave. Otherwise the smallest scope that breaks this reads "—".',
        ],
      },
      { h: 'In this mode', ...PAY_SWITCH },
      {
        ul: [
          'HR admin sees leave counts without these limits.',
          'Who is on leave, and whether it is paid, shows per person only while Show pay amounts is on.',
        ],
      },
      { h: 'Leave never changes who is costed' },
      {
        p: 'People on leave are heads and stay costed people. Unpaid leave sets their pay to 0 for those months and changes amounts only. It never changes a count of costed people, a fold into Other, a cost atom, a drill row or a list of contributors, so no cost figure turns hidden, and no bridge row appears or disappears, because someone’s leave turned unpaid.',
      },
      {
        p: 'Back-dated leave changes post as "Other HRIS change" adjustments, which never name leave.',
      },
      {
        note: 'Leave comes in with the Workers dataset and stays hidden in every panel, table and export unless HR admin shows pay amounts.',
      },
    ],
  },
  {
    id: 'privacy-sample',
    group: 'privacy',
    title: 'The sample company',
    summary:
      'Northgate Semiconductor is a fictional company. Its people and numbers are generated in this browser.',
    keywords: [
      'sample',
      'demo',
      'fake',
      'fictional',
      'northgate',
      'test data',
      'synthetic',
      'persona',
      'stories',
    ],
    body: [
      {
        p: 'Headcount Planner comes with a sample company, Northgate Semiconductor, a fictional maker of chips, so every view has something to show before your own data is loaded. Its people, positions, pay and plans are generated; any resemblance to real people is chance.',
      },
      {
        ul: [
          'It is generated again in this browser on every load, the same each time, and never stored.',
          'Its as-of date is 30 Sep 2026. Its fiscal year runs April to March, and April to September 2026 are closed.',
          'It has six business units, 22 departments and 13 sites in 8 countries: about 1,650 positions, with 1,450 people in Filled seats.',
          'Its versions are FY27 Budget, FY27 Q1 Reforecast (the plan of record), FY27 Working and FY28 Working, with the FY28 planning cycle open for asks.',
          'Each mode starts acting as one of its people, tagged "Sample persona", so no first screen is blank.',
          'Its data arrives the way real data does: some datasets are silver or bronze on purpose, with gaps and odd spellings.',
          'Work you do on the sample (requests, approvals, edits, locks) is kept in this browser beside it, so a reload keeps it.',
          'While every dataset is the sample, the masthead says "Sample data" and the footer says the company is fictional.',
        ],
      },
      { h: 'Nine stories' },
      { p: 'Nine stories are planted in the sample, so the views have something real to find:' },
      {
        ol: [
          'Go-to-Market hired ahead of plan.',
          'Silicon Engineering’s Bengaluru seats are late, and its Hsinchu offers beat midpoint.',
          'Systems & Software backfills point at newly created positions.',
          'A hiring freeze on Corporate holds 3 openings.',
          'EUR and ILS rise against plan in Munich and Haifa.',
          'Silicon Engineering’s FY28 asks exceed its target.',
          'People not in the plan, and cost-center mismatches.',
          'A cost center with 3 costed people stays hidden.',
          'A pending Systems & Software trade waits on the leader.',
        ],
      },
      {
        p: 'Replace any dataset with your own export in the [Data room](route:data), and the rest keeps running on the sample. [Loading your data](article:data-loading)',
        ...HR_ADMIN,
      },
      {
        p: 'When HR admin loads your own data, the datasets not replaced keep running on the sample.',
        ...NO_DATA_ROOM,
      },
    ],
  },
]
