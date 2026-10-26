/**
 * Help articles, Your data: the eight datasets, mapping, tiers, certification, quality, workspace
 * files and versions (docs/PLAN.md 14.2).
 *
 * M4 freeze (docs/CONTRACTS-M4.md): every id of this group is registered with its group, a working
 * title and its structural fields (route, tour, generated content); help-trust writes the summaries
 * and bodies, and may retitle. Ids are frozen. Conditions come from ./when.ts and are written
 * against surfaces, never mode names.
 *
 * The first six articles are HR admin's (the Data room, HHHHS), so they need no condition but the
 * Show pay amounts switch's. `data-workspace-file` and `data-versions` show in every mode: each
 * sentence that names a page, a file or an action a mode may hide sits under the condition that
 * shows it, and no sentence a Manager reads holds an amount (7.6).
 */
import type { HelpArticle } from '../types'
import {
  AMOUNTS,
  FINANCE_VIEW,
  FOR_MANAGER,
  FORECAST,
  HR_ADMIN,
  IMPORTS_REQUESTS,
  LEADER,
  MANAGER,
  NO_AMOUNTS,
  PAY_SWITCH,
  ROUNDED,
  WORKSPACE_IMPORT,
} from './when'

/** The Full file is HR admin's, with Show pay amounts on (`action:export.full`, limited). */
const FULL_FILE = { surface: 'action:export.full' } as const

export const DATA_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'data-loading',
    group: 'data',
    title: 'Loading your data',
    summary: 'Replace the sample with your own exports, one dataset at a time, in the Data room.',
    keywords: [
      'upload',
      'import',
      'excel',
      'csv',
      'xlsx',
      'tsv',
      'file',
      'workbook',
      'sheet',
      'replace',
      'hris',
      'ats',
      'export',
      'required',
      'optional',
      'back to the sample',
    ],
    body: [
      {
        p: 'Headcount Planner reads eight datasets. Four are required: Positions, Workers, Compensation and Assumptions. The other four are optional: Requisitions, Requests, Targets and Hiring freezes. The views run without an optional dataset and say what is missing.',
      },
      {
        ul: [
          'Positions: every seat, one row per position and effective date, with its status (Filled, Open, Planned, On hold or Eliminated), level, org, cost center, location and FTE. Eliminated seats are kept, and position IDs are never reused.',
          'Workers: HRIS assignments, one row per person per position, from the first day to the last day in it. Contractors and interns come in here too; they count 0 heads and are not costed.',
          'Compensation: pay rows by employee and effective date. Base is the full-time rate, and cost multiplies it by FTE.',
          'Requisitions: reqs from the applicant tracking system, linked to positions, with their stage, accepted offers and one-time hiring costs.',
          'Requests: headcount requests and their approval steps, from one spreadsheet. Files other people export from Headcount Planner come in through Import requests instead.',
          'Targets: Finance’s heads and loaded cost per org and fiscal year.',
          'Hiring freezes: freezes by org and date, and whether backfills may go ahead.',
          'Assumptions: bands, loads, FX rates and forecast drivers in long form, one row per table, org and key. A value falls back from the org to its unit to the company.',
        ],
      },
      { h: 'Replace a dataset' },
      {
        ol: [
          'Open the [Data room](route:data). Its Datasets tab lists the eight datasets.',
          'Select a dataset’s row to open its panels.',
          'Choose "Replace with your file" and pick an Excel or CSV export: .xlsx, .xlsm, .xls, .csv or .tsv.',
          'Check how the columns were mapped and what the import changed: values defaulted, values not recognized and rows left out, each with a count. A required field with no column stops the import until the file has one.',
          'Choose Replace. The other seven datasets keep running as they are.',
        ],
      },
      {
        p: 'Headers from common HRIS, ATS and planning tools are recognized. Headcount Planner remembers your columns for each file layout and maps the next file with the same headers the same way, and says so. "Back to the sample" puts one dataset back.',
      },
      { h: 'The datasets and their panels' },
      {
        ul: [
          'Records by month: how many rows of each dataset fall in each month, so a gap shows before it moves a number.',
          'The datasets, with their source (the sample or your file), rows, tier and version. A row count opens the rows.',
          'Each dataset’s Raw, Mapping, Quality and Certify panels. [Mapping columns](article:data-mapping) and [Certifying a dataset](article:data-certify) say what each one does.',
        ],
      },
      {
        p: '[Take the tour](tour:own-data) to walk through the Data room, from the datasets to certification.',
      },
      {
        note: 'Files are read on this device and kept in this browser; nothing is sent anywhere. Columns for protected characteristics (gender, ethnicity, age or birth date, nationality, religion, disability and health, veteran status, sexual orientation, marital status), stand-ins for them such as graduation year, and free-text comment columns are dropped as the file is read. Pay and leave columns stay hidden in every panel unless Show pay amounts is on. [Your data stays in this browser](article:privacy-browser)',
      },
    ],
  },
  {
    id: 'data-mapping',
    group: 'data',
    title: 'Mapping columns',
    summary:
      'Check which column of your file feeds each field, and confirm it so the dataset can reach silver.',
    keywords: [
      'mapping',
      'columns',
      'headers',
      'fields',
      'confirm mapping',
      'match',
      'unrecognized',
      'not recognized',
      'defaulted',
      'raw',
      'import log',
      'lists',
      'values',
    ],
    body: [
      {
        p: 'When a file comes in, Headcount Planner matches each field to a column by its header and its values, and says how sure each match is. A match is a starting point, not a review.',
      },
      { h: 'Before you replace' },
      {
        ul: [
          'The dialog lists every field with the column that feeds it and how good the match is.',
          'A required field with no column stops the import. Add the column to the file, then pick it again.',
          '"What the import changed" counts the values that were defaulted or not recognized and the rows left out, with examples. Examples from pay and leave columns stay hidden while Show pay amounts is off.',
          'To feed a field from another column, give that column the field’s name in the file and pick the file again.',
        ],
      },
      { h: 'After the upload' },
      {
        p: 'Open the dataset in the Datasets tab and go to its Mapping panel. It lists each field, whether it is required, recommended or optional, the column in the file, the match, and whether a person reviewed it.',
      },
      {
        ul: [
          '"Confirm mapping" records that a person reviewed it, with your Acting as name and the date. With no blocking issues and the checks passing, that is what lifts the dataset to silver. [Data tiers](article:data-tiers)',
          'The Raw panel shows the first 20 rows of the original sheet as it came in, with the import log: what the import changed, row by row.',
        ],
      },
      // The sample's datasets as src/data/sample/raw/plan.ts starts them (M4 review HL-5).
      {
        p: 'On the sample, Positions, Workers, Compensation and Assumptions are generated in this browser with their own fields, so they have no file and no mapping to review. Requisitions, Requests, Targets and Hiring freezes arrive as raw extracts, each with its sheet, mapping and import log, which fill in a moment after the sample opens. The Requests mapping is left unconfirmed on purpose, so it shows bronze.',
      },
      { h: 'Values that are not on a list' },
      {
        p: 'A business unit, department, site, cost center or other category that is not on its official list counts as not recognized, which can hold the field at bronze. The [Lists](route:data.lists) tab shows each list with the values in the data that are not on it. Add a value, retire one (older rows that use it are still recognized), or make a proposed list official. Every change is logged.',
      },
      {
        note: 'Replacing a dataset starts a new version of it: the mapping needs confirming again, and any certification ends.',
      },
    ],
  },
  {
    id: 'data-tiers',
    group: 'data',
    title: 'Data tiers',
    summary: 'No data, bronze, silver and gold: how far a number’s data has come, and the data standard.',
    keywords: [
      'tier',
      'tiers',
      'bronze',
      'silver',
      'gold',
      'no data',
      'data standard',
      'production',
      'validated',
      'everything',
      'badge',
      'trust',
      'quality',
      'fresh',
      'freshness',
      'fill rate',
    ],
    metrics: [
      'quality.rules.fill',
      'quality.rules.problemRate',
      'quality.rules.controlTolerance',
      'quality.rules.freshness',
    ],
    body: [
      {
        p: 'Assume data is messy. Every number Headcount Planner shows carries a tier that says how far its data has come:',
      },
      {
        ul: [
          'No data: the dataset, or a field the number needs, is missing.',
          'Bronze: loaded as it came in. The mapping is not reviewed, and some values may be defaulted or not recognized.',
          'Silver: a person confirmed the mapping, no blocking issues remain, at most 2% of rows have an import error and at most 2% hold a reference that does not resolve.',
          'Gold: silver, certified by its data owner for this exact version, reconciled to its control totals, and fresh.',
        ],
      },
      { h: 'How a number gets its tier' },
      {
        p: 'Each number names the fields it reads, and its tier is the lowest of theirs. A field takes its dataset’s tier, capped at bronze when it is filled for under 95% of the rows it applies to, or when over 2% of its values are not recognized or were defaulted. An optional field nobody filled applies to no row and takes its dataset’s tier, so it never makes a number read "No data".',
      },
      {
        p: 'Fresh means the data is recent for the as-of date: Workers needs a hire, exit or move in the last 120 days, Requisitions one opened in the last 90 days, Requests an update in the last 90 days, and the Compensation extract can be at most 45 days old. These limits, the 95% and the 2% are settings of the quality rules in [Metric definitions](route:data.metrics).',
      },
      {
        p: 'The tier badge explains itself on hover or focus, naming what holds it back. Select it to open that dataset’s Quality panel.',
      },
      {
        p: 'On the sample, Positions, Workers, Compensation and Assumptions are gold; Requisitions, Targets and Hiring freezes are silver; and the requests spreadsheet is bronze, on purpose, so the Data room has real issues to show.',
      },
      { h: 'The data standard' },
      {
        ul: [
          'Production: only gold numbers show. Use it in leadership meetings.',
          'Validated: silver and gold.',
          'Everything: every number, raw data included, each with its tier badge. This is the default, so nothing looks missing while data is being cleaned up.',
        ],
      },
      {
        p: 'A number below the standard reads "Not yet confirmed for production" or "Not yet validated" with a link to its dataset. Every export states the standard in force.',
      },
      {
        p: '"Show data quality" in the view header puts a quiet line under each key figure, figure and finding: its tier, the field limiting it, and the rows used and left out. [Data quality](article:data-quality)',
      },
    ],
  },
  {
    id: 'data-certify',
    group: 'data',
    title: 'Certifying a dataset',
    summary: 'How a data owner takes a dataset to gold, and what ends a certification.',
    keywords: [
      'certify',
      'certification',
      'gold',
      'control totals',
      'reconcile',
      'attest',
      'remove certification',
      'data owner',
      'sign off',
    ],
    body: [
      {
        p: 'Certifying is how a dataset becomes gold. Open the dataset in the [Data room](route:data) and go to its Certify panel.',
      },
      { h: 'Before you certify' },
      {
        p: 'Gold needs silver first (the mapping confirmed, no blocking issues, import errors and unresolved references within 2%) and fresh data. The Quality panel lists every check and says what keeps the dataset from the next tier. A certification lifts the dataset to gold only once those pass.',
      },
      { h: 'Certify' },
      {
        ol: [
          'Add a note if you want one. Do not include pay, performance or health details.',
          'Pick a control total if you have one, such as the headcount your HRIS report gives, the Filled positions or the open requisitions, and enter the number you expect. It must reconcile within 0.5%.',
          'Choose "Certify this version". The panel records your Acting as name, the date and each control total, expected against found.',
        ],
      },
      { h: 'What ends a certification' },
      {
        ul: [
          'A certification belongs to one version of the data. Replacing the dataset starts a new version, so the certification ends.',
          '"Remove certification" ends it on purpose.',
          'A control total that no longer reconciles, or data that is no longer fresh for the as-of date, holds the dataset below gold until it does.',
        ],
      },
      {
        note: 'A certification is a local attestation kept in this browser, like everything else. It is not a sign-in or an approval, and it does not change who can see the data. [Why there is no sign-in](article:about-server)',
      },
    ],
  },
  {
    id: 'data-quality',
    group: 'data',
    title: 'Data quality',
    summary:
      'How many metrics stand at each tier, each dataset’s tier with what holds it back, and every field’s coverage.',
    keywords: [
      'quality',
      'fill rate',
      'coverage',
      'fields',
      'checks',
      'metric tiers',
      'lens',
      'show data quality',
    ],
    route: { view: 'data', tab: 'quality' },
    body: [
      {
        p: 'The [Data quality](route:data.quality) tab of the Data room tells the quality story across the plan. It shows counts only, never a value of a row.',
      },
      {
        ul: [
          'Metrics by tier: how many metrics stand at gold, silver, bronze and no data.',
          'Metrics of each view by tier: the same counts, view by view.',
          'Datasets: each dataset’s tier and what keeps it from the next one. Select a row to open its Quality panel.',
          'Fields: every field’s coverage and tier, with a search. Select a field to open its dataset.',
        ],
      },
      { h: 'A dataset’s own checks' },
      {
        p: 'Each dataset’s Quality panel explains its tier in a sentence, lists what it needs to reach the next one, shows every check as passing or failing (references, duplicates, dates in order, freshness, mapping, certification and control totals) and gives each field’s coverage.',
      },
      { h: 'The quality lens' },
      {
        p: '"Show data quality" in the view header turns on a quiet line under each key figure, figure and finding: its tier, the field limiting it, and the rows used and left out. It is off by default so the views stay clean for meetings, and a link or a saved view carries it. [Data tiers](article:data-tiers)',
      },
    ],
  },
  {
    id: 'data-wrong',
    group: 'data',
    title: 'When a number looks wrong',
    summary: 'A checklist to work through before you report a problem.',
    keywords: [
      'wrong',
      'incorrect',
      'missing',
      'zero',
      'blank',
      'dash',
      'different',
      'mismatch',
      'checklist',
      'does not match',
      'hris',
      'reconcile',
    ],
    body: [
      { p: 'Most surprises have a plain cause. Work down this list:' },
      {
        ol: [
          'Check the scope. The view header names the filters, the period and the as-of date. A filter left on from earlier changes every view.',
          'Check the version and the comparison. The version picker says which version the view shows (Working by default), and every "vs" figure names what it compares with. [Versions, locks and closes](article:data-versions)',
          'Check the period. Periods are fiscal: the year runs April to March, and the quarter and year to date end at the last closed month-end.',
          'Check the as-of date. [Settings, Data](settings:data) shows the date in use and lets you set it; the sample’s is 30 Sep 2026.',
          'Open the records. Select the number to see the positions it counts, or the calculation card of a modeled number, whose last step is the number.',
          'Read the definition. The info button says what is counted and who is left out: contractors and interns count 0 heads and are not costed. A "Definition changed" mark means a setting differs from the default.',
          'Check the tier. Hover the badge for the field holding it back, or turn on "Show data quality" to see the rows left out.',
          'Look at the source. In the Datasets tab, a dataset’s Raw panel shows rows as they came in, Mapping shows which column fed each field, and Quality shows blanks and values not recognized.',
          'Check the reconciliation. [Finance > Reconcile](route:finance.reconcile) lists people not in the plan, seats whose status disagrees with HRIS, cost-center mismatches and overlapping assignments.',
          'Check closed months. A closed month reads its month close, not today’s HRIS rows; a change dated in a closed month posts as an adjustment in the first open month.',
          'Check the privacy rules. "—" with "Hidden to protect anonymity" means fewer than 5 costed people or contributors, not zero, and Other (k) holds k groups under 5. [Small groups](article:privacy-small-groups)',
        ],
      },
      {
        p: 'Still stuck? [Report a problem](article:report-problem) copies a summary of where you are and how the data is set up, with no people data, to paste into a message.',
      },
    ],
  },
  {
    id: 'data-workspace-file',
    group: 'data',
    title: 'Workspace files',
    summary:
      'Save and share what you see as a .hcplan.json file, send requests back, or open a file someone sent you.',
    keywords: [
      'hcplan',
      'json',
      'share',
      'send',
      'file',
      'save',
      'shareable',
      'export requests',
      'open a shared file',
      'checksum',
      'hash',
      'workspace',
    ],
    keywordsWhere: [
      { surface: 'action:export.full', words: ['full', 'backup', 'contains individual pay'] },
      { surface: 'action:export.for-manager', words: ['export for a manager'] },
      { surface: 'action:request.import', words: ['import requests', 'merge', 'conflicts'] },
      { surface: 'action:workspace.import', words: ['replace', 'merge', 'restore'] },
    ],
    route: { view: 'data', tab: 'workspace' },
    body: [
      {
        p: 'A workspace file (.hcplan.json) is how people share Headcount Planner work. There is no server, so a file is the way work moves from one browser to another. The Workspace menu in the masthead lists the files this mode saves and opens.',
      },
      {
        p: 'The [Workspace](route:data.workspace) tab of the Data room lists the same files, with what each one holds and who can make it.',
        ...HR_ADMIN,
      },
      { h: 'Files you save' },
      {
        ul: [
          'Shareable: what you see in this mode, already through the cost guard, to keep or to send. Any mode can save one. It never holds a person’s pay, the plan lines or the pay rows.',
        ],
      },
      {
        ul: ['A Shareable file holds amounts only as this mode shows them: rounded, folded or left out.'],
        ...AMOUNTS,
        unless: 'pay:switch',
      },
      // Lead decision D-PAYFILES (M4 review EX-2): whatever the switch says.
      {
        ul: [
          'A Shareable file is always written as HR admin mode shows the plan with Show pay amounts off, under Finance’s rules: exact totals, folded or left out, never one person’s pay. The save dialog says so.',
        ],
        ...PAY_SWITCH,
      },
      { ul: ['A Shareable file from Manager mode holds no amounts.'], ...NO_AMOUNTS },
      {
        ul: [
          'Requests (Export requests): the requests you see in full, with their steps and comments, for merging into another workspace. Any mode can export one, from the Workspace menu or [Requests > Mine](route:requests.mine). A Requests file from Manager mode holds no amounts.',
        ],
      },
      {
        ul: [
          'Export for a manager: pick a manager, and the file is built exactly as Manager mode shows that manager’s team: heads, request states and decisions, with no amounts, no band estimates, no approvers-only comments and nothing about the manager’s own seat or above. This is the file for sending decisions back to a manager.',
        ],
        ...FOR_MANAGER,
      },
      {
        ul: [
          'Full file: everything in this workspace, individual pay included, to keep as a backup or to move the workspace to another computer. It needs Show pay amounts on, and the save dialog and the file’s first line say "Contains individual pay". Individual pay goes out only in a Full file or in an export made with the switch on.',
        ],
        ...FULL_FILE,
      },
      { h: 'Files you bring in' },
      {
        ul: [
          'Open a shared file: read a file someone sent you. Nothing merges. It is shown through your current mode and the person you act as, never the mode it was made in, so it shows you no more than your own screen would.',
        ],
      },
      {
        ul: [
          'Import requests: merge the requests of Requests and Shareable files into this workspace by request ID. The later change wins, and a preview says what will merge and lists the requests changed on both sides for you to choose, before anything merges. It is also in the [Requests > Queue](route:requests.queue) header.',
        ],
        ...IMPORTS_REQUESTS,
      },
      // R17: the CEO, CFO and CHRO merge all (M4 review HL-3).
      {
        ul: [
          'In this mode Import requests merges only the requests that touch your org or wait on you. The others in a file are left as they are.',
        ],
        ...LEADER,
        scoped: true,
      },
      {
        ul: [
          'Acting as the CEO, CFO or CHRO, Import requests merges every request in a file, as HR admin does.',
        ],
        ...LEADER,
        scoped: false,
      },
      {
        ul: [
          'Import a workspace file: Replace or Merge this workspace with a Full file, after a preview of what changes. Replace takes the file’s audit log too; Merge keeps this workspace’s.',
        ],
        ...WORKSPACE_IMPORT,
      },
      { h: 'Send each person a file made for them' },
      {
        p: 'A workspace file is plain JSON. Opening it in Headcount Planner shows only what your mode shows, but anyone can read the file itself in a text editor. So what you send is what the other person can read: send a file only to people who may see everything in it.',
      },
      {
        p: 'For a manager, use Export for a manager. Guarding a file again when it is opened does not protect a file that was sent anyway.',
        ...FOR_MANAGER,
      },
      {
        p: 'A file made in another mode holds more than Manager mode shows. When you open one, Headcount Planner says so and shows only what Manager mode shows: ask for one made for your team.',
        ...MANAGER,
      },
      { p: 'A Full file holds everyone’s pay. Keep it as you would a payroll file.', ...FULL_FILE },
      { h: 'Checksums' },
      {
        p: 'Every file carries a checksum (sha256) of its contents. Headcount Planner checks it whenever a file comes in and refuses a damaged one: "This file is damaged: its checksum does not match its contents. Nothing was imported." A checksum catches damage, not forgery: anyone who edits a file can compute a new one, so it does not prove who made the file. [Why there is no sign-in](article:about-server)',
      },
      {
        p: 'Replace and Merge also refuse a file whose locked versions differ from this workspace’s by hash, and one whose audit log does not check out.',
        ...WORKSPACE_IMPORT,
      },
      { h: 'Limits' },
      {
        ul: [
          'A Shareable or Requests file can be up to 25 MB.',
          'A file from a newer version of Headcount Planner, or one that is not a workspace file, is refused, and nothing is imported.',
        ],
      },
      { ul: ['A Full file can be up to 150 MB.'], ...FULL_FILE },
    ],
  },
  {
    id: 'data-versions',
    group: 'data',
    title: 'Versions, locks and closes',
    summary:
      'Budget, plan of record and Working: which version a number comes from, what a lock keeps, and what a month close does.',
    keywords: [
      'version',
      'versions',
      'budget',
      'reforecast',
      'plan of record',
      'working',
      'lock',
      'locked',
      'hash',
      'close',
      'month close',
      'actuals',
      'comparison',
      'fiscal year',
      'reopen',
      'retired',
    ],
    body: [
      {
        p: 'Every plan number belongs to a version of a fiscal year. The fiscal year runs April to March: FY27 is 1 Apr 2026 to 31 Mar 2027.',
      },
      { h: 'The versions' },
      {
        ul: [
          'Working: the one version of each fiscal year that changes, as requests are approved and seats change. The sample has FY27 Working and FY28 Working. Views show Working by default.',
          'Budget: the first version Finance locks for a year, such as FY27 Budget, locked 20 Mar 2026. It never unlocks.',
          'Reforecasts: later locks of the same year, such as FY27 Q1 Reforecast, locked 15 Jul 2026. Each one stores its forecast too.',
          'Plan of record: the latest locked version of a year; for FY27, the Q1 Reforecast. A year with no locked version, such as FY28 today, has none and compares with its target instead.',
        ],
      },
      { h: 'Picking a version and a comparison' },
      {
        p: 'The version picker beside the filters says which version a view shows. The comparison picker says what every "vs" figure compares with: a locked version of the same year, or the year’s target. The comparison starts on the year’s Budget in Finance mode and on its plan of record in every other mode. Versions of another year are not offered.',
      },
      {
        p: 'With a target as the comparison, year-end heads compare with target heads and full-year cost with target cost. Monthly, quarter-to-date and year-to-date comparisons, [Forecast > Variance](route:forecast.variance) and [Forecast > Bridge](route:forecast.bridge) need a locked version, and say "FY28 has no locked version yet." until one exists.',
        ...FORECAST,
      },
      {
        p: 'My team’s allocation comes from the plan of record: its seats at the fiscal year’s end, plus approved adds, minus approved eliminations.',
        ...MANAGER,
      },
      { h: 'Locks' },
      {
        p: 'Finance locks the year’s Working into a new locked version: the first lock of a year is its Budget, and later ones are reforecasts. Working stays editable. A lock stores the plan lines, the assumptions, the FX rates, the proration and the engine version, with a hash of them all ("sha256-" and 64 letters and digits). Locked numbers are never worked out again, so changing Working’s assumptions never moves a locked total.',
      },
      {
        p: 'A locked version’s lines follow their positions. When a seat moves to another org, its lines move with it and the hash still checks out, because a lock stores positions, not orgs.',
      },
      {
        p: 'Every export names its version and its lock: the hash, or "Working, not locked". [Exporting](article:exporting)',
      },
      {
        p: '"Reopen as new" retires the year’s Working, which stays readable under its name with the date it was replaced, and starts a new Working from a reforecast. Requests, positions and closes do not change, and there is still exactly one Working for the year.',
      },
      {
        p: 'Finance locks, reopens and closes on [Finance > Versions](route:finance.versions), which lists every version with its state, lock date, hash and engine version.',
        ...FINANCE_VIEW,
      },
      { h: 'Month closes' },
      {
        p: 'Finance closes each month once it has ended. A close takes a snapshot of the HRIS actuals for every assignment: heads, FTE and cost from HRIS pay at that moment. It is an estimate from HRIS, not payroll. Closed months are read from their closes everywhere, never worked out again. The sample is closed April to September 2026.',
      },
      {
        p: 'A change dated in a closed month (a back-dated hire, exit or other HRIS change) does not reopen it: it posts as an adjustment in the first open month. How much of an adjustment shows follows the privacy rules. [Small groups](article:privacy-small-groups)',
      },
      {
        p: 'Each close also fixes the cost atoms, the groups rounded cost is built from, until the next close, so no edit or approval moves a seat from one atom to another before then.',
        ...ROUNDED,
      },
    ],
  },
]
