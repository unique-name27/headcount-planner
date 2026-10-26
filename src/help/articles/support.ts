/**
 * Help articles, Help and support: shortcuts, Report a problem, troubleshooting, questions and What's
 * new (docs/PLAN.md 14.2).
 *
 * M4 freeze (docs/CONTRACTS-M4.md): every id of this group is registered with its group, a working
 * title and its structural fields (route, tour, generated content); help-trust writes the summaries
 * and bodies, and may retitle. Ids are frozen. Conditions come from ./when.ts and are written
 * against surfaces, never mode names.
 *
 * Every article here shows in every mode. The messages quoted (the reader tab's masthead line, the
 * storage notice, the file refusals) are the app's own words, and ./trust.test.ts keeps them equal
 * to the constants that print them. `report-problem` names what the summary holds: the mode and
 * the unit, never a person, a position or a request ID (14.2).
 */
import type { HelpArticle } from '../types'
import {
  AMOUNTS,
  FINANCE,
  FOR_MANAGER,
  HR_ADMIN,
  IMPORTS_REQUESTS,
  MANAGER,
  NO_AMOUNTS,
  NO_DATA_ROOM,
  PAY_SWITCH,
  ROUNDED,
  WORKSPACE_IMPORT,
} from './when'

/** The Full file is HR admin's, with Show pay amounts on (`action:export.full`, limited). */
const FULL_FILE = { surface: 'action:export.full' } as const

export const SUPPORT_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'shortcuts',
    group: 'support',
    title: 'Keyboard shortcuts',
    summary: 'Every control works from the keyboard. These keys make it faster.',
    keywords: ['keyboard', 'keys', 'hotkeys', 'shortcut', 'tab', 'arrow', 'escape', 'esc', 'enter', 'space'],
    body: [
      { h: 'Everywhere' },
      {
        ul: [
          '? opens Help from anywhere outside a text field.',
          'Tab and Shift+Tab move between controls. The first Tab on a page offers "Skip to content".',
          'Left and right arrows move between the folder tabs, and between a view’s tabs; Home and End go to the first and last.',
          'Enter or Space on an underlined number opens the records or the calculation behind it.',
          'Esc closes the open panel, menu or dialog: the records panel, Settings or Help.',
        ],
      },
      { h: 'Tables and charts' },
      {
        ul: [
          'In a table, Enter or Space on a row opens it.',
          'A chart is one tab stop. Left and right arrows move along a series, and up and down across series; Home and End go to the first and last point. Enter or Space opens what the point counts, and Esc clears the selection.',
        ],
      },
      { h: 'Pickers' },
      {
        ul: [
          'In the Mode menu, the arrow keys move between the choices, and Enter or Space picks one.',
          'In the Acting as search, up and down arrows move through the list, and Enter picks the person highlighted.',
        ],
      },
      { h: 'Guided tours' },
      { ul: ['Right arrow: the next step.', 'Left arrow: the step before.', 'Esc: end the tour.'] },
      { h: 'The cut line', surface: 'action:cycle.cut-line' },
      {
        ul: [
          'On [Requests > Cycle](route:requests.cycle), focus the cut line and press the up and down arrows to move it one ask at a time.',
        ],
      },
    ],
  },
  {
    id: 'report-problem',
    group: 'support',
    title: 'Report a problem',
    summary:
      'Copy a summary of where you are and how the data is set up, with no people data, to paste into a message.',
    keywords: [
      'bug',
      'issue',
      'support',
      'ticket',
      'feedback',
      'diagnostic',
      'contact',
      'broken',
      'error',
      'report',
    ],
    body: [
      {
        p: 'When something looks wrong, "Report a problem" in the Help sheet copies a short summary to your clipboard. Paste it into an email, a chat message or a ticket to whoever looks after Headcount Planner for your team, and add what you expected to see.',
      },
      { h: 'What the summary holds' },
      {
        ul: [
          'The mode, with the business unit an HRBP mode keeps to. A manager or a leader is never named: the summary says only that one is set.',
          'The page and tab, the address with any record IDs and filter values taken out, the period, the version shown and the comparison.',
          'Which filters are set, as how many values each one picks, and the leader filter only as set or not set.',
          'How many positions are in the mode’s scope, counted over what the mode shows.',
        ],
      },
      // Row counts only where the Data room shows (diagnosticInput.ts `rowsShown`; M4 review HL-6).
      {
        ul: [
          'The data standard, the as-of date and where it comes from, and each dataset’s source (the sample or a file), rows and tier.',
        ],
        ...HR_ADMIN,
      },
      {
        ul: [
          'The data standard, the as-of date and where it comes from, and each dataset’s source (the sample or a file) and tier.',
        ],
        ...NO_DATA_ROOM,
      },
      {
        ul: [
          'How many metric definitions differ from the defaults, which switches are on, whether this tab only reads because another one writes, and your display settings.',
          'The app version, your browser, the window size and the time.',
        ],
      },
      { h: 'What it never holds' },
      {
        p: 'No people data: no names, no employee or position IDs, no request IDs, no file names and no values from your data. It holds no count of requests or audit entries either, since such a count could change with a request you cannot see. It is plain text: read it before you send it.',
      },
      {
        p: 'Before you report, the [When a number looks wrong](article:data-wrong) checklist solves most surprises.',
        surface: 'help:article:data-wrong',
      },
      {
        p: 'Before you report, open the number: its records or its calculation card often show the cause. [Clicking down to the records](article:clicking-down)',
        unless: 'help:article:data-wrong',
      },
      {
        p: '[Troubleshooting](article:troubleshooting) covers a tab that only reads, storage that did not open and files that will not come in.',
      },
    ],
  },
  {
    id: 'troubleshooting',
    group: 'support',
    title: 'Troubleshooting',
    summary:
      'A tab that only reads, storage that did not open, files that will not come in, and older browsers.',
    keywords: [
      'problem',
      'read only',
      'another tab',
      'two tabs',
      'storage',
      'blocked',
      'private',
      'incognito',
      'sample data',
      'large file',
      'damaged',
      'checksum',
      'browser',
      'old browser',
      'not loading',
      'clear',
    ],
    body: [
      { h: '"Read only: Headcount Planner is open in another tab."' },
      {
        p: 'Only one tab writes at a time, so two tabs never save over each other. The first tab holds the write. Any other tab shows this line in the masthead and only reads: the buttons that change the plan are turned off and say why, while viewing and exporting still work, and it follows the other tab’s changes as they are saved.',
      },
      {
        p: 'Close the other tab, or finish your work there, and this tab takes over writing on its own, without a reload.',
      },
      { h: '"Showing sample data" when you expected your own' },
      {
        p: 'Headcount Planner keeps your work in this browser’s storage. If the browser does not open its storage in time, the app starts on the sample and says "This browser did not open its local storage in time, so files added earlier are not loaded. Reload to try again." Reload the page.',
      },
      {
        p: 'Private or incognito windows, strict privacy settings and some managed browsers block or clear site storage. Use a normal window, and allow site data for Headcount Planner.',
      },
      {
        p: 'Your work lives in the browser you made it in. Another browser, another profile or another computer starts on the sample; move work with a workspace file. [Workspace files](article:data-workspace-file)',
      },
      { h: 'A file that will not come in' },
      {
        ul: [
          '"This file is damaged: its checksum does not match its contents. Nothing was imported." The file changed after it was saved, or was cut short. Ask for it again.',
          '"This file was made by a newer version of Headcount Planner. Nothing was imported." Open it with the newest headcount-planner.html.',
          '"This is not a Headcount Planner workspace file. Nothing was imported." Workspace files end in .hcplan.json.',
          'A Shareable or Requests file can be up to 25 MB.',
        ],
      },
      { ul: ['A Full file can be up to 150 MB.'], ...FULL_FILE },
      {
        ul: [
          '"This file has no requests to merge." Import requests reads Requests and Shareable files only.',
        ],
        ...IMPORTS_REQUESTS,
      },
      {
        ul: [
          '"This file’s FY27 Budget does not match this workspace’s (hash differs). Nothing was imported." The two workspaces locked different versions of that year.',
        ],
        ...WORKSPACE_IMPORT,
      },
      { h: 'A dataset that will not come in', ...HR_ADMIN },
      {
        ul: [
          'A required field with no column stops the replace: add the column to the file and pick it again.',
          'Big workbooks take a few seconds to read. Nothing changes until you choose Replace.',
          'Save only the sheet you need, or save the dataset as a .csv file.',
        ],
      },
      { h: 'A tab that could not be drawn' },
      {
        ul: [
          'A tab that hits a problem says "This tab could not be drawn"; the other tabs still work and your data has not changed. Choose Try again, or Reset filters.',
          '"Clear everything on this device", in [Settings, This device](settings:device), deletes everything Headcount Planner stored in this browser and starts over on the sample.',
        ],
      },
      { ul: ['Save a Full file first if you want to keep the workspace.'], ...FULL_FILE },
      { ul: ['Then [report a problem](article:report-problem).'] },
      { h: 'Older browsers' },
      {
        p: 'Headcount Planner needs a current version of Chrome, Edge, Firefox or Safari. In an older browser, parts of the layout may not show correctly: update the browser, or open Headcount Planner in another one.',
      },
    ],
  },
  {
    id: 'faq',
    group: 'support',
    title: 'Questions people ask',
    summary: 'Short answers to the questions people ask most.',
    keywords: ['faq', 'questions', 'why', 'how do i'],
    body: [
      { h: 'Is my data sent anywhere?' },
      {
        p: 'No. Headcount Planner runs in your browser and keeps everything on this device. [Your data stays in this browser](article:privacy-browser)',
      },
      { h: 'Why is there no sign-in?' },
      {
        p: 'Headcount Planner has no server, so it has nobody to sign in to. Modes and Acting as change what it shows, not who can see the data. [Why there is no sign-in](article:about-server)',
      },
      { h: 'Why does a number show "—"?' },
      {
        p: 'It covers fewer than 5 people, it is below the data standard, the data it needs is missing, or this mode does not show it. The note beside it says which. [Reading a number](article:reading-a-number)',
      },
      { h: 'Why are salaries not shown?', ...AMOUNTS },
      {
        p: 'This mode shows cost rounded down to $0.1M per team, never one person’s pay. [Pay amounts](article:privacy-pay)',
        ...ROUNDED,
      },
      {
        p: 'Finance mode shows exact totals over 5 or more costed people, never one person’s pay. [Pay amounts](article:privacy-pay)',
        ...FINANCE,
      },
      {
        p: 'Pay amounts are off by default, and last one session when you turn them on in [Settings, Privacy](settings:privacy). [Pay amounts](article:privacy-pay)',
        ...PAY_SWITCH,
      },
      { h: 'Why are there no amounts?', ...NO_AMOUNTS },
      {
        p: 'Manager mode shows heads, status words and standard heads, never an amount. Your budget status reads On track, At risk or Over, with the reason in heads.',
      },
      { h: 'Why does Headcount Planner not match our HRIS report?' },
      {
        p: 'Check the scope, the period, the as-of date and the version first. Approved heads count seats; actual heads count the active employees in the HRIS on the date, people with no position included. Contractors and interns count 0 heads.',
      },
      {
        p: 'Actual cost is an estimate from HRIS pay at each month close, not payroll.',
        ...AMOUNTS,
      },
      {
        p: 'The [When a number looks wrong](article:data-wrong) checklist goes through the rest.',
        surface: 'help:article:data-wrong',
      },
      { h: 'Which version does a view show?' },
      {
        p: 'The version picker beside the filters says: Working, by default. Every "vs" figure names what it compares with. [Versions, locks and closes](article:data-versions)',
      },
      { h: 'What is a standard head?' },
      {
        p: 'Finance’s unit for trading seats: an average full-time seat weighs 1.00, so a trade can swap one kind of seat for another at a fair ratio. [Trading heads](article:trading-heads)',
      },
      { h: 'How do decisions get back to a manager?', ...FOR_MANAGER },
      {
        p: 'Use Export for a manager in the Workspace menu. The file is made as Manager mode shows that manager’s team, with no amounts. [Workspace files](article:data-workspace-file)',
      },
      { h: 'How do my requests reach my HRBP?', ...MANAGER },
      {
        p: 'Export requests, in the Workspace menu or on [Requests > Mine](route:requests.mine), saves the requests you see in full. Your HRBP merges the file into their workspace, and sends decisions back in a file made for your team. [Workspace files](article:data-workspace-file)',
      },
      { h: 'Can two people work on one plan?' },
      {
        p: 'Not in one place: each browser holds its own workspace. People share work with workspace files: requests go out with Export requests, and decisions come back the same way.',
      },
      {
        p: 'Import requests merges them by request ID: the later change wins, and a request changed on both sides is listed for you to choose.',
        ...IMPORTS_REQUESTS,
      },
      { h: 'Will my settings follow me to another computer?' },
      {
        p: 'Not on their own. Save a settings file in [Settings, This device](settings:device) and load it on the other computer. The plan moves with a workspace file.',
        surface: 'settings:device-files',
      },
      {
        p: 'Not on their own. Your mode, filters, saved views and display settings are kept in this browser, so on another computer you choose them again.',
        unless: 'settings:device-files',
      },
      { h: 'Can a metric’s calculation change?' },
      {
        p: 'Yes, within its settings: use "Edit definition" in its info button, or [Metric definitions](route:data.metrics). Every view follows at once. [How metrics are defined](article:definitions-how)',
        ...HR_ADMIN,
      },
      {
        p: 'HR admin can, within its settings, and every view follows at once. [How metrics are defined](article:definitions-how)',
        ...NO_DATA_ROOM,
      },
    ],
  },
  {
    id: 'whats-new',
    group: 'support',
    title: "What's new",
    summary: 'Short notes on what changed in each release.',
    keywords: ['release notes', 'changes', 'new', 'updates', 'version', 'changelog'],
    body: [],
    generated: 'whats-new',
  },
]
