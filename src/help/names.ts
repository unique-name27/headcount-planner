/**
 * The names test's data (PLAN 14.2: the template app's `NAMES` test, "rebuilt for HCP's pages, tabs and
 * switches"): the words that name a page, a tab, a control or an amount kind, each with the surface
 * that shows it, so no article or tour step a mode shows names something the mode hides. Ambiguous
 * single words are named by their tab path ("Finance > Export") or their page word ("Audit page");
 * `NOT_A_PAGE` strips the uses that name no page (mode names, keys). Pure.
 *
 * M4 freeze (docs/CONTRACTS-M4.md): `namesHidden` and the shapes are built; help-engine owns the
 * lists and may add phrases, or a `NOT_A_PAGE` pattern for a use that names no page, recording each
 * in its notes. A phrase is never dropped to make a test pass: the text gets a condition instead.
 */
import type { HelpAccess } from './access'
import { plainText } from './markup'

/** A phrase that names something, and the surface that shows it. */
export interface HelpName {
  phrase: string
  surface: string
}

/** Words that name a page, tab, control or amount kind, and the surface that shows it. */
export const HELP_NAMES: readonly HelpName[] = [
  // Views (bare where the word names nothing else), and every tab by its path
  { phrase: 'My team', surface: 'view:team' },
  { phrase: 'Forecast', surface: 'view:forecast' },
  { phrase: 'Targets', surface: 'view:targets' },
  { phrase: 'What if', surface: 'view:whatif' },
  { phrase: 'Home', surface: 'view:home' },
  { phrase: 'Finance view', surface: 'view:finance' },
  { phrase: 'Finance >', surface: 'view:finance' },
  { phrase: 'Plan > Overview', surface: 'tab:plan.overview' },
  { phrase: 'Plan > Positions', surface: 'tab:plan.positions' },
  { phrase: 'Plan > Openings', surface: 'tab:plan.openings' },
  { phrase: 'Plan > Hiring', surface: 'tab:plan.hiring' },
  { phrase: 'Plan > Recruiting summary', surface: 'tab:plan.recruiting' },
  { phrase: 'Plan > Transfers', surface: 'tab:plan.transfers' },
  { phrase: 'Requests > Queue', surface: 'tab:requests.queue' },
  { phrase: 'Requests > New', surface: 'tab:requests.new' },
  { phrase: 'Requests > Mine', surface: 'tab:requests.mine' },
  { phrase: 'Requests > Approvals', surface: 'tab:requests.approvals' },
  { phrase: 'Requests > Cycle', surface: 'tab:requests.cycle' },
  { phrase: 'Forecast > Variance', surface: 'tab:forecast.variance' },
  { phrase: 'Forecast > Bridge', surface: 'tab:forecast.bridge' },
  { phrase: 'Targets > Gap', surface: 'tab:targets.gap' },
  { phrase: 'Sub-org targets', surface: 'tab:targets.suborgs' },
  { phrase: 'Tree × cost center', surface: 'tab:targets.tree' },
  { phrase: 'Finance > Versions', surface: 'tab:finance.versions' },
  { phrase: 'Finance > Assumptions', surface: 'tab:finance.assumptions' },
  { phrase: 'Trade rates', surface: 'tab:finance.assumptions:trade-rates' },
  { phrase: 'Finance > Freezes', surface: 'tab:finance.freezes' },
  { phrase: 'Finance > Reconcile', surface: 'tab:finance.reconcile' },
  { phrase: 'Finance > Export', surface: 'tab:finance.export' },
  // Pages
  { phrase: 'Data room', surface: 'page:data' },
  { phrase: 'Metric definitions', surface: 'page:data' },
  { phrase: 'Data quality', surface: 'page:data' },
  { phrase: 'Audit page', surface: 'page:audit' },
  // The chain check is HR admin's (8.4 rule 7), as the Data room is.
  { phrase: 'Chain checks out', surface: 'page:data' },
  // Switches and controls
  { phrase: 'Show pay amounts', surface: 'pay:switch' },
  { phrase: 'Edit definition', surface: 'ui:edit-definition' },
  { phrase: 'Exclude', surface: 'filter:exclude' },
  { phrase: 'Leave out', surface: 'focus:leave-out' },
  { phrase: 'Settings, Data', surface: 'settings:data' },
  { phrase: 'Official lists', surface: 'settings:lists' },
  { phrase: 'Settings, Privacy', surface: 'settings:privacy' },
  // Actions a mode may not have
  { phrase: 'Import requests', surface: 'action:request.import' },
  { phrase: 'Export for a manager', surface: 'action:export.for-manager' },
  { phrase: 'Full file', surface: 'action:export.full' },
  { phrase: 'Replace or Merge', surface: 'action:workspace.import' },
  { phrase: 'Turn into requests', surface: 'action:whatif.turn-into-requests' },
  { phrase: 'Approve with changes', surface: 'action:request.approve-with-changes' },
  { phrase: 'approve with changes', surface: 'action:request.approve-with-changes' },
  { phrase: 'Move budget too', surface: 'action:transfer.move-budget' },
  { phrase: 'Copy note', surface: 'action:cycle.copy-note' },
  { phrase: 'Mark reviewed', surface: 'action:recon.review' },
  { phrase: 'on behalf', surface: 'action:request.submit-on-behalf' },
  { phrase: 'cut line', surface: 'action:cycle.cut-line' },
  { phrase: 'load file', surface: 'action:export.load-file' },
  // Amount kinds and leave (7.6, 7.7)
  { phrase: 'band estimate', surface: 'cost:band' },
  { phrase: 'Band estimate', surface: 'cost:band' },
  // Amounts show where band estimates do: every mode but Manager.
  { phrase: 'loaded cost', surface: 'cost:band' },
  { phrase: 'Loaded cost', surface: 'cost:band' },
  { phrase: 'Exit run rate', surface: 'cost:component' },
  { phrase: 'incl. SBC', surface: 'cost:component' },
  { phrase: 'on leave', surface: 'leave:counts' },
  { phrase: 'unpaid leave', surface: 'leave:counts' },
]

/** Mode names and other words that share a page's name without naming the page. */
export const NOT_A_PAGE: readonly RegExp[] = [
  /\b(Manager|HRBP|Leader|Finance|HR admin) mode/g,
  /Home and End/g,
  /Home key/g,
]

/** Reviewed exceptions, by where the text is: the modes article describes every mode. */
export function namedOnPurpose(where: string, _phrase: string): boolean {
  return where.startsWith('modes')
}

/** Every phrase of `HELP_NAMES` in a text that names something the mode hides: "mode | where | phrase". */
export function namesHidden(access: HelpAccess, where: string, text: string): string[] {
  let rest = plainText(text)
  for (const r of NOT_A_PAGE) rest = rest.replace(r, '')
  const out: string[] = []
  for (const n of HELP_NAMES) {
    if (access.can(n.surface) || namedOnPurpose(where, n.phrase)) continue
    const esc = n.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`(^|[^A-Za-z])${esc}([^A-Za-z]|$)`).test(rest))
      out.push(`${access.mode} | ${where} | ${n.phrase}`)
  }
  return out
}
