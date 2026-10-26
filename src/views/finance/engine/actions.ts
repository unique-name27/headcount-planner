/**
 * The Finance view's Action center items (docs/PLAN.md 9.6): reconciliation exceptions (owner HRBP),
 * envelope exceptions and a cycle stage that is due (owner Finance). Pure `actions(ctx)` output, read
 * from the cached `financeModel`; no amount in `what` or `note`; every item has `due` or
 * `closesWhen` and `place`.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); the views-2 builder filled `financeActions`.
 *
 * Readings taken here (views-2 builder, M2):
 *  - `finance:reconcile` is one item per business unit with open exceptions (a roll-up: no item is
 *    about one person, the Finance mode rule), owned by the unit's HRBP from the Units list, its drill
 *    the unit's open exceptions. An exception marked reviewed no longer counts.
 *  - `finance:envelope-exception` is one item per pending request the viewer may see whose chain
 *    holds a Finance step for a move past a sub-org's cost envelope; it is an approval, so it closes
 *    by request state and offers Snooze only. Its words carry the request's ID, type and seat, which
 *    every view of a request shows (8.4 rule 2).
 *  - `finance:cycle-due` is one item per planning cycle not yet Locked: its current stage and that
 *    stage's due date (overdue once the date has passed), owned by the Finance person who opened it.
 */
import type { ItemKind } from '@/access/ids'
import { contextLists } from '@/access/lists'
import type { AnalyticsContext } from '@/data/context'
import { unitHrbps } from '@/data/lists/roles'
import type { CycleStage } from '@/data/schema'
import { waitingStep } from '@/drill/requestRecord'
import { workerNames } from '@/drill/seats'
import { drillSpec } from '@/drill/types'
import { dateWords } from '@/lib/dates'
import { plural } from '@/lib/format'
import type { Cycle } from '@/plan/types'
import { latestRows } from '@/views/targets/engine/working'
import type { ActionItem } from '../../types'
import { ID } from '../metrics'
import { prepareFinance } from './base'
import { financeModel } from './index'

/** The item kinds this view raises (every one in src/access/ids.ts `ITEM_KINDS`). */
export const FINANCE_ITEM_KINDS = [
  'finance:reconcile',
  'finance:envelope-exception',
  'finance:cycle-due',
] as const satisfies readonly ItemKind[]

/** A cycle's current stage's due date, or null (Locked, or no date set). */
export function stageDue(cycle: Cycle): { stage: CycleStage; due: string } | null {
  const d = cycle.dates
  const due: Partial<Record<CycleStage, string | null>> = {
    'Open for asks': d.asksDue,
    'HRBP review': d.hrbpReviewDue,
    'Leader review': d.leaderReviewDue,
    'Finance review': d.financeReviewDue,
  }
  const date = due[cycle.stage]
  return date ? { stage: cycle.stage, due: date } : null
}

/** The Finance view's open items for the Action center. */
export function financeActions(ctx: AnalyticsContext): ActionItem[] {
  // A mode that hides the view lists none of its items (src/access/items.ts `itemShown`): skip the work.
  if (!ctx.access.can('view:finance') || ctx.access.unset) return []
  const p = prepareFinance(ctx)
  const names = workerNames(ctx)
  const out: ActionItem[] = []

  // Reconciliation exceptions, rolled up per unit.
  const lists = contextLists(ctx)
  const hrbps: ReadonlyMap<string, string> = lists ? unitHrbps(lists) : new Map()
  const latest = latestRows(ctx.all.positions)
  const unitOfWorker = new Map(ctx.all.workers.map((w) => [w.employeeId, w.businessUnit ?? null]))
  const open = financeModel(ctx).reconcile.exceptions.rows.filter((r) => !r.reviewed)
  const byUnit = new Map<string, typeof open>()
  for (const e of open) {
    const unit =
      (e.positionId ? latest.get(e.positionId)?.businessUnit : null) ??
      (e.employeeId ? unitOfWorker.get(e.employeeId) : null) ??
      'No business unit'
    const list = byUnit.get(unit)
    if (list) list.push(e)
    else byUnit.set(unit, [e])
  }
  for (const [unit, list] of [...byUnit].sort(([a], [b]) => a.localeCompare(b))) {
    const hrbp = hrbps.get(unit) ?? null
    out.push({
      id: `finance:reconcile:${unit}`,
      ownerRole: 'hrbp',
      ownerId: hrbp,
      ownerName: (hrbp && names.get(hrbp)) || `${unit} HRBP`,
      severity: 'warning',
      what: `${plural(list.length, 'reconciliation exception')} in ${unit}`,
      subject: { kind: 'none', label: unit },
      view: 'finance',
      tab: 'reconcile',
      drill: () =>
        drillSpec({
          kind: 'exceptions',
          title: `Reconciliation exceptions in ${unit}`,
          rows: list,
          uses: p.uses(ID.reconExceptions),
        }),
      note: 'The imported position status and the HRIS disagree on these seats.',
      uses: p.uses(ID.reconExceptions),
      kind: 'Reconciliation exception',
      fingerprint: list
        .map((e) => e.id)
        .sort()
        .join(','),
      size: list.length,
      closesWhen: 'Closes when each exception is fixed in the data or marked reviewed',
      place: { positionId: null, businessUnit: unit === 'No business unit' ? null : unit, department: null },
    })
  }

  // Envelope exceptions waiting on Finance.
  for (const r of p.visible) {
    if (r.state !== 'Submitted' && r.state !== 'In review' && r.state !== 'Sent back') continue
    const step = r.steps.find((s) => s.role === 'finance' && s.reasons.includes('envelope-exception'))
    if (!step || step.decision != null) continue
    const waiting = waitingStep(r)
    const seat = r.positionId ? latest.get(r.positionId) : undefined
    out.push({
      id: `finance:envelope-exception:${r.requestId}`,
      ownerRole: 'finance',
      ownerId: step.approverId,
      ownerName: names.get(step.approverId) ?? 'Finance',
      requesterId: r.requesterId,
      approverId: waiting?.approverId ?? step.approverId,
      due: null,
      severity: waiting === step ? 'warning' : 'info',
      what: `${r.requestId} (${r.type.toLowerCase()}) moves past a sub-org’s cost envelope`,
      subject: { kind: 'requests', id: r.requestId, label: `Request ${r.requestId}` },
      view: 'finance',
      note:
        waiting === step ? 'The Finance step is waiting.' : 'The Finance step follows the steps before it.',
      uses: p.uses(ID.reconExceptions),
      kind: 'Envelope exception',
      matter: `request:${r.requestId}`,
      closesWhen: 'Closes when the request is approved, rejected, sent back or withdrawn',
      snoozeOnly: true,
      place: {
        positionId: r.positionId ?? r.managerPositionId,
        businessUnit: r.businessUnit,
        department: r.department,
        costCenter: seat?.costCenter ?? r.costCenter,
      },
    })
  }

  // A planning cycle's stage that is due.
  for (const c of ctx.plan?.cycles ?? []) {
    if (c.stage === 'Locked') continue
    const s = stageDue(c)
    if (!s) continue
    const overdue = s.due < ctx.asOf
    out.push({
      id: `finance:cycle-due:${c.cycleId}`,
      ownerRole: 'finance',
      ownerId: c.openedBy,
      ownerName: names.get(c.openedBy) ?? 'Finance',
      due: s.due,
      severity: overdue ? 'warning' : 'info',
      what: `${c.fiscalYear} planning cycle: ${s.stage} is due ${dateWords(s.due, ctx.asOf)}`,
      subject: { kind: 'none', label: `${c.fiscalYear} planning cycle` },
      view: 'finance',
      note: `The cycle is in ${s.stage}.`,
      uses: p.uses(ID.versionsLocked),
      kind: 'Cycle stage due',
      fingerprint: `${c.stage}|${s.due}`,
      closesWhen: 'Closes when the cycle moves to its next stage',
      place: { positionId: null, businessUnit: null, department: null },
    })
  }
  return out
}
