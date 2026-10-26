/**
 * Every figure id on the Requests view (docs/PLAN.md 9.4), by tab. Ids start with `requests-` (the
 * policy decides them by that prefix). Requests > New is the write path: its three ids were added in
 * the M3 freeze. Frozen in the M2 freeze: the builder may add ids with the prefix, never rename these.
 */
export const REQUESTS_FIGURES = {
  // Queue
  queueKpis: 'requests-queue-kpis',
  queue: 'requests-queue',
  queueByState: 'requests-queue-by-state',
  // Mine
  mineKpis: 'requests-mine-kpis',
  mine: 'requests-mine',
  // Approvals
  approvalsKpis: 'requests-approvals-kpis',
  approvals: 'requests-approvals',
  /** M3: the gap after approval of each target org with a request waiting on you. */
  approvalsGaps: 'requests-approvals-gaps',
  // Cycle
  cycleKpis: 'requests-cycle-kpis',
  cycleAsks: 'requests-cycle-asks',
  cycleNotSubmitted: 'requests-cycle-not-submitted',
  // New (M3 freeze): the seats a form may name, the chain preview and the trade quote card
  newSeats: 'requests-new-seats',
  newChain: 'requests-new-chain',
  newQuote: 'requests-new-quote',
} as const
export type RequestsFigureId = (typeof REQUESTS_FIGURES)[keyof typeof REQUESTS_FIGURES]
