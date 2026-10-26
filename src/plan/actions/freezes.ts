/**
 * Hiring freezes (docs/PLAN.md 8.3 `freeze.create`, `freeze.edit`, 10.4, R10): Finance (and HR admin)
 * sets a freeze on an org (a unit, department, cost center or leader tree) from a date, open-ended or
 * to a last day, with or without backfills allowed. A freeze blocks new requests in the org (an
 * exception adds a Finance step, ./requests.ts `setFreezeException`), holds unstarted openings (a
 * derived hold, never a status change) and honors accepted offers. Pure.
 *
 * - Checks `freeze.create` / `freeze.edit` first ("Versions, closes, FX and freezes are Finance's.").
 * - Writes the freeze row to `state.overlay.freezes` (it replaces an imported row with the same
 *   `freezeId`); one audit entry per field (object 'freeze', `id` the freezeId). The reason is free
 *   text managers can read in the freeze notice, so it is refused with an amount (8.4 rule 5).
 * - FREEZE_DATES_TEXT when the end comes before the start.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the bodies.
 */
import type { FreezeRow } from '@/data/schema'
import type { AuditDraft, PlanState } from '../types'
import { FREEZE_DATES_TEXT, freezeSavedNotice, NO_SEAT_CHANGE_TEXT, NOT_FOUND_TEXT } from './copy'
import { freeTextRefusal, gate } from './gate'
import { auditOf, no, ok, putFreezes } from './shared'
import type { ActionContext, ActionResult } from './types'

/** A new freeze: every FreezeRow field but the ID (`env.ids.freeze()` gives it). */
export type FreezeInput = Omit<FreezeRow, 'freezeId'>

export interface FreezeEditInput {
  freezeId: string
  /** The fields that change; the org of a freeze never changes (end it and set another). */
  patch: Partial<Pick<FreezeRow, 'startDate' | 'endDate' | 'allowBackfill' | 'reason'>>
}

/** A freeze row with known keys only (never a spread of an input). */
const freezeCopy = (f: FreezeRow): FreezeRow => ({
  freezeId: f.freezeId,
  businessUnit: f.businessUnit,
  department: f.department ?? null,
  costCenter: f.costCenter ?? null,
  leaderPositionId: f.leaderPositionId ?? null,
  startDate: f.startDate,
  endDate: f.endDate ?? null,
  allowBackfill: f.allowBackfill ?? false,
  reason: f.reason ?? null,
})

const FIELDS = [
  'businessUnit',
  'department',
  'costCenter',
  'leaderPositionId',
  'startDate',
  'endDate',
  'allowBackfill',
  'reason',
] as const

/** Dates and the reason, as both actions check them. */
function rowRefusal(ctx: ActionContext, f: FreezeRow): string | null {
  if (f.endDate && f.endDate < f.startDate) return FREEZE_DATES_TEXT
  return f.reason ? freeTextRefusal(ctx, f.reason) : null
}

/** One audit entry per field that differs (a new freeze: every field it sets). */
function freezeAudit(ctx: ActionContext, prev: FreezeRow | null, next: FreezeRow): AuditDraft[] {
  const out: AuditDraft[] = []
  for (const k of FIELDS) {
    const old = prev ? (prev[k] ?? null) : null
    const value = next[k] ?? null
    if (old === value || (prev == null && value == null)) continue
    out.push(auditOf(ctx, 'freeze', next.freezeId, k, old, value, { effectiveDate: next.startDate }))
  }
  return out
}

/** `freeze.create`: a new hiring freeze. */
export function createFreeze(state: PlanState, ctx: ActionContext, input: FreezeInput): ActionResult {
  const g = gate(ctx, 'freeze.create')
  if (g) return no(g)
  const row = freezeCopy({ ...input, freezeId: ctx.env.ids.freeze() })
  if (row.reason) row.reason = row.reason.trim() || null
  const why = rowRefusal(ctx, row)
  if (why) return no(why)
  return ok(putFreezes(state, [row]), freezeAudit(ctx, null, row), freezeSavedNotice(row.freezeId))
}

/** `freeze.edit`: a freeze's dates, backfill rule or reason (ending one early is an edit of its end). */
export function editFreeze(state: PlanState, ctx: ActionContext, input: FreezeEditInput): ActionResult {
  const g = gate(ctx, 'freeze.edit')
  if (g) return no(g)
  const current = ctx.datasets.freezes.find((f) => f.freezeId === input.freezeId)
  if (!current) return no(NOT_FOUND_TEXT)
  const prev = freezeCopy(current)
  const p = input.patch
  const next = freezeCopy({
    ...prev,
    ...(p.startDate !== undefined ? { startDate: p.startDate } : {}),
    ...(p.endDate !== undefined ? { endDate: p.endDate } : {}),
    ...(p.allowBackfill !== undefined ? { allowBackfill: p.allowBackfill } : {}),
    ...(p.reason !== undefined ? { reason: p.reason?.trim() || null } : {}),
  })
  const why = rowRefusal(ctx, next)
  if (why) return no(why)
  const audit = freezeAudit(ctx, prev, next)
  if (!audit.length) return no(NO_SEAT_CHANGE_TEXT)
  return ok(putFreezes(state, [next]), audit, freezeSavedNotice(next.freezeId))
}
