/**
 * Every action in every mode (docs/PLAN.md 8.3 "Actions" and 11.6), row by row as the plan's table
 * lists them: the decision for Manager, HRBP, Leader, Finance and HR admin, with the sentence on each
 * limited or hidden one. Each mode's table takes its column (`actionsFor`), so `RolePolicy.actions`
 * holds one decision per id and none is missing (the record type fails to compile otherwise). Plain
 * data.
 */
import { ACTION_IDS, type ActionId } from '../ids'
import type { Mode } from '../modes'
import { type Decision, hidden, limited, SHOWN } from './types'

type Row = Readonly<Record<Mode, Decision>>

/** One row in the plan's column order: Manager, HRBP, Leader, Finance, HR admin. */
const by = (
  manager: Decision,
  hrbp: Decision,
  leader: Decision,
  finance: Decision,
  admin: Decision,
): Row => ({
  manager,
  hrbp,
  leader,
  finance,
  'hr-admin': admin,
})

const S = SHOWN
const INSIDE = limited('Inside your team or org.')
const NO_RAISE = hidden('Finance does not raise requests.')
const ON_STEPS = 'Only on steps assigned to you.'
const ASSIGNED = limited(ON_STEPS)
const TARGETS_FINANCE = hidden('Targets are set by Finance.')
const CYCLES_FINANCE = hidden('Planning cycles are run by Finance.')
const FINANCE_OWNS = hidden("Versions, closes, FX and freezes are Finance's.")
const ASSUMPTIONS_FINANCE = hidden("Assumptions are Finance's.")
const IMPORTS = hidden("Imports are HR admin's.")
const FULL_FILES = hidden(
  'The Full file and the unsuppressed load file come from HR admin mode with Show pay amounts on.',
)
const SWITCH_ON = limited('With Show pay amounts on.')
const LOAD_FILES = hidden("Load files are Finance's and HR admin's.")
const ROUNDED_EXPORT = limited('Rounded loaded cost only, for whole teams, at QTD, YTD and full year.')
const SEAT_CHANGES = hidden('Seat changes go through requests or the HRBP.')
const TRANSFERS_HRBP = hidden('Transfers are processed by HRBPs.')
const WHATIF_COST = hidden('What if shows cost.')
const RECON = hidden('Reconciliation is for HRBPs and Finance.')

/** docs/PLAN.md 8.3's Actions table. */
export const ACTION_POLICY: Readonly<Record<ActionId, Row>> = {
  'request.draft': by(INSIDE, S, INSIDE, NO_RAISE, S),
  'request.submit': by(INSIDE, S, INSIDE, NO_RAISE, S),
  'request.withdraw': by(INSIDE, S, INSIDE, NO_RAISE, S),
  'request.submit-on-behalf': by(
    hidden("Submitting on behalf of a manager is the HRBP's."),
    S,
    hidden("Submitting on behalf of a manager is the HRBP's."),
    hidden("Submitting on behalf of a manager is the HRBP's."),
    S,
  ),
  'request.recruit': by(INSIDE, S, INSIDE, NO_RAISE, S),
  'request.propose-start': by(INSIDE, S, INSIDE, NO_RAISE, S),
  'request.trade': by(INSIDE, S, INSIDE, hidden('Finance approves trades; it does not start them.'), S),
  'request.approve': by(limited(`${ON_STEPS} In heads, without band cost.`), ASSIGNED, ASSIGNED, ASSIGNED, S),
  'request.reject': by(limited(`${ON_STEPS} In heads, without band cost.`), ASSIGNED, ASSIGNED, ASSIGNED, S),
  'request.send-back': by(
    limited(`${ON_STEPS} In heads, without band cost.`),
    ASSIGNED,
    ASSIGNED,
    ASSIGNED,
    S,
  ),
  'request.approve-with-changes': by(
    hidden("Changes to level, start or location are the HRBP's."),
    S,
    // M3 review SP-8: approve with changes is the HRBP step's only (10.1, 10.3, 11.4); a leader
    // adjusts the cycle within the envelope (cycle.rank, cycle.cut-line). PLAN 15 change to record.
    hidden("Changes to a request are the HRBP's; leaders adjust the cycle within the envelope."),
    hidden('Finance locks or returns.'),
    S,
  ),
  'request.comment': by(S, S, S, S, S),
  'request.read-approvers-only': by(
    hidden('Approvers-only comments do not reach Manager mode.'),
    limited('Only on requests where you are the HRBP or on the approval chain.'),
    limited('Only on requests where you are the HRBP or on the approval chain.'),
    limited('Only on requests where you are the HRBP or on the approval chain.'),
    S,
  ),
  'request.import': by(
    hidden('Import requests is for HRBPs and above.'),
    S,
    limited('Requests that touch your org or wait on you. Others in the file are left as they are.'),
    S,
    S,
  ),
  'position.edit': by(
    SEAT_CHANGES,
    limited(
      'Open and Planned seats in your unit, in Working. A seat with an accepted offer cannot be edited; its start date and terms come from the recruiting system.',
    ),
    SEAT_CHANGES,
    SEAT_CHANGES,
    S,
  ),
  'transfer.process': by(TRANSFERS_HRBP, S, TRANSFERS_HRBP, TRANSFERS_HRBP, S),
  'transfer.approve': by(
    limited(`${ON_STEPS} The manager step; names show, amounts do not.`),
    limited(`${ON_STEPS} Both HRBPs approve.`),
    limited(`${ON_STEPS} Both leaders approve across units.`),
    limited(
      `${ON_STEPS} Only a move past a sub-org's cost envelope; position ID, title, level and org show, never the name.`,
    ),
    S,
  ),
  'transfer.move-budget': by(
    // R52: no Leader action processes a transfer, so the Manager sentence names the HRBP alone (PLAN 8.3).
    hidden("Moving budget with a transfer is the HRBP's."),
    S,
    // M3 review SP-18: "Move budget too?" is set on the processing form (10.5, Plan > Transfers),
    // which only the HRBP uses. PLAN 15 change to record.
    hidden('Move budget too? is set when the HRBP processes the transfer.'),
    hidden('Finance sees the target change in Targets.'),
    S,
  ),
  'target.set': by(TARGETS_FINANCE, TARGETS_FINANCE, TARGETS_FINANCE, S, S),
  'target.exception': by(TARGETS_FINANCE, TARGETS_FINANCE, TARGETS_FINANCE, S, S),
  'target.split': by(
    hidden('Targets are set by Finance and split by leaders.'),
    hidden('Targets are set by Finance and split by leaders.'),
    limited("Inside your envelope; a move past a sub-org's envelope needs Finance."),
    S,
    S,
  ),
  'target.move': by(
    hidden('Targets are set by Finance and split by leaders.'),
    hidden('Targets are set by Finance and split by leaders.'),
    limited("Inside your envelope; a move past a sub-org's envelope needs Finance."),
    S,
    S,
  ),
  'whatif.use': by(WHATIF_COST, S, S, S, S),
  'whatif.turn-into-requests': by(
    WHATIF_COST,
    S,
    S,
    hidden('Finance does not raise requests. Copy the scenario for the HRBP.'),
    S,
  ),
  'cycle.open': by(CYCLES_FINANCE, CYCLES_FINANCE, CYCLES_FINANCE, S, S),
  'cycle.dates': by(CYCLES_FINANCE, CYCLES_FINANCE, CYCLES_FINANCE, S, S),
  'cycle.lock': by(CYCLES_FINANCE, CYCLES_FINANCE, CYCLES_FINANCE, S, S),
  'cycle.return': by(CYCLES_FINANCE, CYCLES_FINANCE, CYCLES_FINANCE, S, S),
  'cycle.advance': by(
    hidden('Managers send ranked asks; the review stages are for HRBPs, leaders and Finance.'),
    limited('Finish HRBP review for your unit.'),
    limited('Finish Leader review for your org.'),
    S,
    S,
  ),
  'cycle.rank': by(
    limited('Your own asks.'),
    S,
    limited('Within the envelope.'),
    hidden('Finance locks or returns the cycle; managers, HRBPs and leaders rank the asks.'),
    S,
  ),
  'cycle.cut-line': by(
    hidden('The cut line is set by HRBPs, leaders and Finance.'),
    S,
    limited('Within the envelope.'),
    S,
    S,
  ),
  'cycle.copy-note': by(
    hidden('Copy note is for the people who run the cycle: HRBPs, leaders and Finance.'),
    S,
    S,
    S,
    S,
  ),
  'version.create': by(FINANCE_OWNS, FINANCE_OWNS, FINANCE_OWNS, S, S),
  'version.lock': by(FINANCE_OWNS, FINANCE_OWNS, FINANCE_OWNS, S, S),
  'version.reopen': by(FINANCE_OWNS, FINANCE_OWNS, FINANCE_OWNS, S, S),
  'close.month': by(FINANCE_OWNS, FINANCE_OWNS, FINANCE_OWNS, S, S),
  'fx.set': by(FINANCE_OWNS, FINANCE_OWNS, FINANCE_OWNS, S, S),
  'freeze.create': by(FINANCE_OWNS, FINANCE_OWNS, FINANCE_OWNS, S, S),
  'freeze.edit': by(FINANCE_OWNS, FINANCE_OWNS, FINANCE_OWNS, S, S),
  'assumptions.edit': by(
    ASSUMPTIONS_FINANCE,
    ASSUMPTIONS_FINANCE,
    ASSUMPTIONS_FINANCE,
    limited(
      'Rates and drivers, when the change moves 5 or more costed people. Caps, dates and pay percentages come from import.',
    ),
    S,
  ),
  'assumptions.edit-operational': by(
    hidden("Time to fill, fill rate and backfill settings are the HRBP's and Finance's."),
    limited("Your unit's time to fill, fill rate and backfill settings, in Working."),
    hidden("Time to fill, fill rate and backfill settings are the HRBP's and Finance's."),
    S,
    S,
  ),
  'freeze.exception': by(
    limited('Submitted with a business reason; it adds a Finance step.'),
    S,
    limited('Submitted with a business reason; it adds a Finance step.'),
    hidden('Finance approves freeze exceptions; it does not raise them.'),
    S,
  ),
  'recon.review': by(RECON, limited('Your unit.'), RECON, S, S),
  'data.import': by(IMPORTS, IMPORTS, IMPORTS, IMPORTS, S),
  'workspace.import': by(IMPORTS, IMPORTS, IMPORTS, IMPORTS, S),
  'workspace.open-shared': by(S, S, S, S, S),
  'export.shareable': by(S, S, S, S, S),
  'export.requests': by(S, S, S, S, S),
  'export.for-manager': by(
    hidden('Managers export their own Shareable file.'),
    S,
    limited('Managers in your org.'),
    hidden("Finance's decisions reach managers through the HRBP."),
    S,
  ),
  'export.full': by(FULL_FILES, FULL_FILES, FULL_FILES, FULL_FILES, SWITCH_ON),
  'export.load-file-full': by(FULL_FILES, FULL_FILES, FULL_FILES, FULL_FILES, SWITCH_ON),
  'export.load-file': by(LOAD_FILES, LOAD_FILES, LOAD_FILES, limited('Groups under 5 suppressed.'), S),
  'export.figure': by(limited('No amount columns.'), ROUNDED_EXPORT, ROUNDED_EXPORT, S, S),
  'export.view': by(limited('No amount columns.'), ROUNDED_EXPORT, ROUNDED_EXPORT, S, S),
  'export.deck': by(limited('No amount columns.'), ROUNDED_EXPORT, ROUNDED_EXPORT, S, S),
  'export.long-csv': by(
    limited('Heads and FTE rows only, no amount columns.'),
    limited(
      'Cost rows are whole departments and teams at QTD, YTD and full year, loaded cost in USD; other rows carry heads and FTE.',
    ),
    limited(
      'Cost rows are whole departments and teams at QTD, YTD and full year, loaded cost in USD; other rows carry heads and FTE.',
    ),
    S,
    S,
  ),
}

/** One mode's column of the Actions table, in `ACTION_IDS` order. */
export function actionsFor(mode: Mode): Record<ActionId, Decision> {
  return Object.fromEntries(ACTION_IDS.map((a) => [a, ACTION_POLICY[a][mode]])) as Record<ActionId, Decision>
}
