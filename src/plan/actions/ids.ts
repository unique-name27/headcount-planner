/**
 * The policy action ids the write path checks (docs/PLAN.md 8.3 "Actions" and 11.6), written out
 * because plan/ never imports src/access/ids.ts. Together `WRITE_ACTION_IDS` and
 * `NOT_PLAN_WRITE_IDS` are exactly src/access/ids.ts `ACTION_IDS` (src/plan/actions/contracts.test.ts
 * checks it), so an id added to the policy must say here whether it writes plan state. Plain data.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md).
 */

/** Every action id an action in src/plan/actions/ checks before it writes plan state. */
export const WRITE_ACTION_IDS = [
  'request.draft',
  'request.submit',
  'request.withdraw',
  'request.submit-on-behalf',
  'request.recruit',
  'request.propose-start',
  'request.trade',
  'request.approve',
  'request.reject',
  'request.send-back',
  'request.approve-with-changes',
  'request.comment',
  'request.import',
  'position.edit',
  'transfer.process',
  'transfer.approve',
  'transfer.move-budget',
  'target.set',
  'target.exception',
  'target.split',
  'target.move',
  'whatif.turn-into-requests',
  'cycle.open',
  'cycle.dates',
  'cycle.lock',
  'cycle.return',
  'cycle.advance',
  'cycle.rank',
  'cycle.cut-line',
  'version.create',
  'version.lock',
  'version.reopen',
  'close.month',
  'fx.set',
  'freeze.create',
  'freeze.edit',
  'assumptions.edit',
  'assumptions.edit-operational',
  'freeze.exception',
  'recon.review',
  'workspace.import',
] as const
export type WriteActionId = (typeof WRITE_ACTION_IDS)[number]

/**
 * Action ids that never write plan state: reads (`request.read-approvers-only`, `whatif.use`,
 * `workspace.open-shared`), the clipboard (`cycle.copy-note`), dataset imports (the data store's
 * `replaceDataset`, `data.import`) and file exports. The views check them with `ctx.access.can`.
 */
export const NOT_PLAN_WRITE_IDS = [
  'request.read-approvers-only',
  'whatif.use',
  'cycle.copy-note',
  'data.import',
  'workspace.open-shared',
  'export.shareable',
  'export.requests',
  'export.for-manager',
  'export.full',
  'export.load-file-full',
  'export.load-file',
  'export.figure',
  'export.view',
  'export.deck',
  'export.long-csv',
] as const
export type NotPlanWriteId = (typeof NOT_PLAN_WRITE_IDS)[number]

export const isWriteActionId = (v: unknown): v is WriteActionId =>
  typeof v === 'string' && (WRITE_ACTION_IDS as readonly string[]).includes(v)

/** The policy surface of an action id: 'action:request.submit'. */
export const actionSurface = (id: WriteActionId): `action:${WriteActionId}` => `action:${id}`
