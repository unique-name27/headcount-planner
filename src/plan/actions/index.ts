/**
 * Every write-path action by name (docs/PLAN.md 8.3, 11.6; milestone M3), the ids each checks, and
 * the names' types. src/app/write/ runs an action by name (`usePlanWrite().run('submitRequest', {
 * requestId })`), so a view never imports an action body and every write goes through one place.
 *
 * `ACTION_CHECKS` is data: the policy ids an action checks with ./gate.ts `gate`, the first one
 * always, the others where its docs say (a Transfer's decision, a transfer that moves budget, a split
 * or move past the envelope). src/plan/actions/contracts.test.ts checks that every write id is
 * checked by some action and that every id is in src/access/ids.ts `ACTION_IDS`.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md).
 */
import { editAssumptions, editOperational, removeOverride } from './assumptions'
import {
  finishStage,
  lockCycle,
  moveCutLine,
  openCycle,
  rankCycleAsks,
  returnCycle,
  setCycleDates,
} from './cycle'
import { createFreeze, editFreeze } from './freezes'
import type { WriteActionId } from './ids'
import { markReviewed } from './recon'
import {
  approveRequest,
  approveWithChanges,
  commentOnRequest,
  createRequest,
  editRequest,
  proposeStart,
  rejectRequest,
  requestElimination,
  requestRecruiting,
  sendBack,
  setFreezeException,
  submitOnBehalf,
  submitRequest,
  withdrawRequest,
} from './requests'
import { editSeat } from './seats'
import { withRevisions } from './shared'
import { moveTarget, setTarget, splitTarget } from './targets'
import { createTrade } from './trades'
import { processTransfer } from './transfers'
import type { ActionContext, ActionResult } from './types'
import { closeMonth, createVersion, lockVersion, reopenVersion, setFx } from './versions'
import { turnLeversIntoRequests } from './whatif'
import { importRequests, mergeWorkspace, replaceWorkspace } from './workspace'

export * from './assumptions'
export * from './copy'
export * from './cycle'
export * from './freezes'
export * from './gate'
export * from './ids'
export * from './recon'
export * from './requests'
export * from './seats'
export * from './targets'
export * from './trades'
export * from './transfers'
export * from './types'
export * from './versions'
export * from './whatif'
export * from './workspace'

/** Every action, by the name the write path runs it under. */
export const ACTIONS = {
  // Requests (./requests.ts)
  createRequest,
  editRequest,
  requestElimination,
  requestRecruiting,
  proposeStart,
  submitRequest,
  submitOnBehalf,
  withdrawRequest,
  approveRequest,
  approveWithChanges,
  sendBack,
  rejectRequest,
  commentOnRequest,
  setFreezeException,
  // Seats, transfers and trades
  editSeat,
  processTransfer,
  createTrade,
  // Freezes, versions, closes, FX and assumptions
  createFreeze,
  editFreeze,
  createVersion,
  lockVersion,
  reopenVersion,
  closeMonth,
  setFx,
  editAssumptions,
  editOperational,
  removeOverride,
  // Targets
  setTarget,
  splitTarget,
  moveTarget,
  // The planning cycle
  openCycle,
  setCycleDates,
  finishStage,
  rankCycleAsks,
  moveCutLine,
  lockCycle,
  returnCycle,
  // Reconciliation and What if
  markReviewed,
  turnLeversIntoRequests,
  // Workspace files
  importRequests,
  replaceWorkspace,
  mergeWorkspace,
} as const

export type ActionName = keyof typeof ACTIONS

/** The input an action takes. */
export type ActionInput<N extends ActionName> = Parameters<(typeof ACTIONS)[N]>[2]

/** The ids each action checks, the first always (see the module comment). */
export const ACTION_CHECKS: Readonly<Record<ActionName, readonly WriteActionId[]>> = {
  createRequest: ['request.draft'],
  editRequest: ['request.draft'],
  requestElimination: ['request.draft'],
  requestRecruiting: ['request.recruit'],
  proposeStart: ['request.propose-start'],
  submitRequest: ['request.submit'],
  submitOnBehalf: ['request.submit-on-behalf'],
  withdrawRequest: ['request.withdraw'],
  approveRequest: ['request.approve', 'transfer.approve'],
  approveWithChanges: ['request.approve-with-changes'],
  sendBack: ['request.send-back', 'transfer.approve'],
  rejectRequest: ['request.reject', 'transfer.approve'],
  commentOnRequest: ['request.comment'],
  setFreezeException: ['freeze.exception'],
  editSeat: ['position.edit'],
  processTransfer: ['transfer.process', 'transfer.move-budget'],
  createTrade: ['request.trade'],
  createFreeze: ['freeze.create'],
  editFreeze: ['freeze.edit'],
  createVersion: ['version.create'],
  lockVersion: ['version.lock'],
  reopenVersion: ['version.reopen'],
  closeMonth: ['close.month'],
  setFx: ['fx.set'],
  editAssumptions: ['assumptions.edit'],
  editOperational: ['assumptions.edit-operational'],
  // The id the row's owner edits it with: assumptions.edit where the mode has it, else the HRBP's
  // (listed first: the button shows where either does, and a mode with neither reads its reason).
  removeOverride: ['assumptions.edit-operational', 'assumptions.edit'],
  setTarget: ['target.set'],
  splitTarget: ['target.split', 'target.exception'],
  moveTarget: ['target.move', 'target.exception'],
  openCycle: ['cycle.open'],
  setCycleDates: ['cycle.dates'],
  finishStage: ['cycle.advance'],
  rankCycleAsks: ['cycle.rank'],
  moveCutLine: ['cycle.cut-line'],
  lockCycle: ['cycle.lock'],
  returnCycle: ['cycle.return'],
  markReviewed: ['recon.review'],
  turnLeversIntoRequests: ['whatif.turn-into-requests'],
  importRequests: ['request.import'],
  replaceWorkspace: ['workspace.import'],
  mergeWorkspace: ['workspace.import'],
}

/** The actions whose requests come from a file: they keep the file's stamps (merge.ts compares them). */
const FROM_FILES: ReadonlySet<ActionName> = new Set(['importRequests', 'replaceWorkspace', 'mergeWorkspace'])

/**
 * Runs an action by name (the write path's one entry; the body is the action's own). Every request
 * the action changes takes the wall clock as its `revisedAt`, and a new one as its `createdAt` too
 * (./shared.ts `withRevisions`, M3 recheck), except in the file imports, which keep the files' stamps.
 */
export function runActionByName<N extends ActionName>(
  name: N,
  state: Parameters<(typeof ACTIONS)[N]>[0],
  ctx: ActionContext,
  input: ActionInput<N>,
): ActionResult {
  const fn = ACTIONS[name] as (s: typeof state, c: ActionContext, i: ActionInput<N>) => ActionResult
  const result = fn(state, ctx, input)
  return result.ok && !FROM_FILES.has(name) ? withRevisions(state, ctx, result) : result
}
