/**
 * Reconciliation (docs/PLAN.md 6.10, 8.3 `recon.review`, 9.4 Finance > Reconcile): marking an
 * exception reviewed. HRBP limited (its unit's exceptions: OUTSIDE_UNIT_TEXT), Finance and HR admin
 * shown. The review is `state.reviewed` ({ exceptionId, at, by }); the exception itself stays as long
 * as its data does (reconcile.ts ids are stable across loads). One audit entry (object 'position' for
 * a position's exception, else 'workspace'; field 'reviewed', `id` the exception's position or
 * employee ID). Pure.
 *
 * Readings taken here (core, M3): an exception is in an HRBP's unit when its position's latest row
 * (else the employee's workers row) sits in a unit the HRBP holds; one already reviewed is left as
 * it is (its first review stands), and a call that reviews nothing new is refused.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the body.
 */
import type { PlanState, ReconReview } from '../types'
import { ALREADY_REVIEWED_TEXT, NOT_FOUND_TEXT, OUTSIDE_UNIT_TEXT, REVIEWED_NOTICE } from './copy'
import { gate, isLimited } from './gate'
import { auditOf, latestRows, no, ok } from './shared'
import type { ActionContext, ActionResult } from './types'

export interface MarkReviewedInput {
  /** reconcile.ts `ReconException.id` ('<kind>:<positionId or employeeId>'), one of `env.exceptions()`. */
  exceptionIds: readonly string[]
}

/** `recon.review`: exceptions marked reviewed. */
export function markReviewed(state: PlanState, ctx: ActionContext, input: MarkReviewedInput): ActionResult {
  const g = gate(ctx, 'recon.review')
  if (g) return no(g)
  const all = new Map(ctx.env.exceptions().map((e) => [e.id, e]))
  const latest = latestRows(ctx.datasets.positions)
  const unitOf = (positionId: string | null, employeeId: string | null): string | null => {
    if (positionId) return latest.get(positionId)?.businessUnit ?? null
    if (employeeId) return ctx.datasets.workers.find((w) => w.employeeId === employeeId)?.businessUnit ?? null
    return null
  }
  const done = new Set(state.reviewed.map((r) => r.exceptionId))
  const added: ReconReview[] = []
  const audit = []
  for (const id of input.exceptionIds) {
    const e = all.get(id)
    if (!e) return no(NOT_FOUND_TEXT)
    if (isLimited(ctx, 'recon.review')) {
      const unit = unitOf(e.positionId, e.employeeId)
      if (!unit || !ctx.rules.hrbpUnits.has(unit)) return no(OUTSIDE_UNIT_TEXT)
    }
    if (done.has(id)) continue
    done.add(id)
    added.push({ exceptionId: id, at: ctx.businessAt, by: ctx.actor.personId })
    audit.push(
      auditOf(
        ctx,
        e.positionId ? 'position' : 'workspace',
        e.positionId ?? e.employeeId ?? id,
        'reviewed',
        null,
        e.kind,
      ),
    )
  }
  if (!added.length) return no(ALREADY_REVIEWED_TEXT)
  return ok({ ...state, reviewed: [...state.reviewed, ...added] }, audit, REVIEWED_NOTICE)
}
