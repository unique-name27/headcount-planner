/**
 * The checks every action runs first (docs/PLAN.md 5.4, 8.2, 8.3, 8.4 rule 5), in this order:
 *  1. the write lock: a reader tab refuses with READ_ONLY_NOTE ("Read only: Headcount Planner is open
 *     in another tab.");
 *  2. the Acting as pick: `ctx.writeBlock` ("Pick who you act as before making changes.");
 *  3. the policy: `ctx.decide('action:<id>')`; hidden refuses with its `how` ("Finance does not raise
 *     requests."); limited and shown go on, and the action applies its own limited rule.
 * Then, for free text a manager can read (the HRBP seat-edit reason, the approve-with-changes,
 * send-back and reject reasons, the freeze-exception business reason, an audit comment), 8.4 rule 5:
 * an amount is refused at entry with REMOVE_AMOUNT_TEXT ("Remove the amount: managers see this note.").
 * Pure.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the bodies.
 */
import { NOT_IN_MODE_TEXT, READ_ONLY_NOTE, REASON_REQUIRED_TEXT, REMOVE_AMOUNT_TEXT } from './copy'
import { actionSurface, type WriteActionId } from './ids'
import type { ActionContext, ActionDecision } from './types'

/**
 * Steps 1 to 3 for one action id: the refusal, or null to go on. An action that checks two ids (a
 * Transfer's decision also checks `transfer.approve`; a transfer that moves budget, `transfer.move-budget`)
 * calls it once for each.
 */
export function gate(ctx: ActionContext, id: WriteActionId): string | null {
  if (ctx.readOnly) return READ_ONLY_NOTE
  if (ctx.writeBlock) return ctx.writeBlock
  const d = decisionOf(ctx, id)
  if (d.access === 'hidden') return d.how?.trim() || NOT_IN_MODE_TEXT
  return null
}

/** The policy's decision for an action id in the context's mode (step 3 alone). */
export function decisionOf(ctx: ActionContext, id: WriteActionId): ActionDecision {
  return ctx.decide(actionSurface(id))
}

/** True when the action id is limited in the context's mode, so the action applies its own rule. */
export function isLimited(ctx: ActionContext, id: WriteActionId): boolean {
  return decisionOf(ctx, id).access === 'limited'
}

/**
 * 8.4 rule 5 at entry for free text a manager can read: REMOVE_AMOUNT_TEXT when it holds an amount,
 * REASON_REQUIRED_TEXT when `required` and it is blank after trimming, else null.
 */
export function freeTextRefusal(ctx: ActionContext, text: string, required = false): string | null {
  const t = (text ?? '').trim()
  if (t && ctx.rules.hasAmount(t)) return REMOVE_AMOUNT_TEXT
  if (required && !t) return REASON_REQUIRED_TEXT
  return null
}
