/**
 * Plan > Transfers (docs/PLAN.md 9.4, 10.5): transfers in progress and done, with names, from and
 * to, and their approvals, never an amount. Each request passes 8.4 before it is listed or counted
 * (src/drill/requestRecord.ts): rule 2a's viewers see the moving person's name, a limited viewer
 * (Finance) sees position IDs and orgs only, and a request rule 3 hides is no row and no count.
 *
 * Readings taken here (views-1 builder, M2):
 *  - A transfer is in scope when a seat it touches is: its from seat, its receiving seat or the
 *    receiving manager position.
 *  - In progress: Submitted, In review or Sent back, or approved with an effective date after the
 *    as-of date (PLAN 12 `plan.transfers.open`). Done: approved and in effect. Drafts, withdrawn,
 *    rejected and expired transfers are not listed.
 *  - The step reads "HRBP (step 2 of 3)" while one waits, else the request's state.
 *
 * Added by the plan-ui builder (M3): the Acting as person's own transfer drafts (`transferDrafts`),
 * the ones they processed (its submitter, or its requester when it has none), in the modes that
 * process transfers, so the HRBP who processed one submits it here. A draft is no transfer in
 * progress: it is not counted.
 */
import { viewerOf } from '@/access/visibility'
import type { Column } from '@/charts/types'
import { APPROVED_REQUEST_STATES, PENDING_REQUEST_STATES } from '@/data/schema'
import { requestRecord, waitingStep } from '@/drill/requestRecord'
import { effectiveRequestsOf, workerNames } from '@/drill/seats'
import { asOfLine } from '@/drill/subtitle'
import type { DrillSpec, RequestRecord } from '@/drill/types'
import type { HcRequest } from '@/plan/types'
import type { FigureData } from '../../types'
import { ID } from '../metrics'
import type { TransferDraftRow, TransferRow } from '.'
import type { Prep } from './base'
import { placementOf } from './core'
import { PLAN_FIGURES } from './figures'
import { FIGURE } from './lineage'

const ROLE_WORD = { manager: 'Manager', hrbp: 'HRBP', leader: 'Leader', finance: 'Finance' } as const

/** A transfer the viewer may see, with its record. */
export interface ShownTransfer {
  request: HcRequest
  record: RequestRecord
  inProgress: boolean
}

const memo = new WeakMap<Prep, ShownTransfer[]>()

export function transfersOf(p: Prep): ShownTransfer[] {
  const hit = memo.get(p)
  if (hit) return hit
  const ctx = p.ctx
  const viewer = viewerOf(ctx)
  const names = workerNames(ctx)
  const out: ShownTransfer[] = []
  // Every request in its effective state (D-EXPIRY): an expired Sent back transfer is not in progress.
  for (const req of effectiveRequestsOf(ctx)) {
    if (req.type !== 'Transfer' || !req.transfer) continue
    const t = req.transfer
    const touched = [t.fromPositionId, t.toPositionId, t.toManagerPositionId, req.positionId].filter(
      (x): x is string => !!x,
    )
    if (!touched.some((id) => p.scope.ids.has(id))) continue
    const pending = PENDING_REQUEST_STATES.includes(req.state)
    const approved = APPROVED_REQUEST_STATES.includes(req.state)
    if (!pending && !approved) continue
    const record = requestRecord(req, { viewer, asOf: ctx.asOf, nameOf: (id) => names.get(id) ?? null })
    if (!record) continue
    const effective = t.effectiveDate
    out.push({ request: req, record, inProgress: pending || (approved && effective > ctx.asOf) })
  }
  out.sort((a, b) => (a.request.requestId < b.request.requestId ? -1 : 1))
  memo.set(p, out)
  return out
}

/** "Silicon Engineering · Design Verification" for a seat (its placement row). */
function orgOf(p: Prep, positionId: string | null): string {
  if (!positionId) return '—'
  const r = placementOf(p.ctx).get(positionId)
  return r ? [r.businessUnit, r.department].filter(Boolean).join(' · ') : '—'
}

/** The requests drill of transfers. */
export function transfersSpec(p: Prep, title: string, list: readonly ShownTransfer[]): DrillSpec<'requests'> {
  return {
    kind: 'requests',
    title,
    subtitle: asOfLine(p.ctx.asOf, p.ctx.scopeLabel),
    rows: list.map((x) => x.record),
  }
}

export function transfersTable(p: Prep): FigureData<TransferRow> {
  const list = transfersOf(p)
  const rows: (TransferRow & { progress: string; kindText: string })[] = list.map(
    ({ request: req, record, inProgress }) => {
      const t = req.transfer!
      const full = record.view === 'full'
      const step = waitingStep(req)
      const stepText =
        full && step ? `${ROLE_WORD[step.role]} (step ${step.n} of ${req.steps.length})` : req.state
      const to = t.toPositionId ?? t.toManagerPositionId
      return {
        requestId: req.requestId,
        state: req.state,
        kind: t.kind,
        personName: full ? record.transferPersonName : null,
        fromPositionId: t.fromPositionId,
        fromOrg: orgOf(p, t.fromPositionId),
        toPositionId: t.toPositionId,
        toOrg: orgOf(p, to),
        effectiveDate: full ? t.effectiveDate : null,
        step: stepText,
        progress: inProgress ? 'In progress' : 'Done',
        kindText: t.kind === 'position' ? 'Position move' : 'Internal move',
      }
    },
  )
  const columns: Column<TransferRow>[] = [
    { key: 'requestId', label: 'Request' },
    { key: 'progress', label: 'Progress' },
    { key: 'kindText', label: 'Kind' },
    { key: 'personName', label: 'Person' },
    { key: 'fromPositionId', label: 'From position' },
    { key: 'fromOrg', label: 'From' },
    { key: 'toPositionId', label: 'To position' },
    { key: 'toOrg', label: 'To' },
    { key: 'effectiveDate', label: 'Effective', format: 'date' },
    { key: 'state', label: 'State' },
    { key: 'step', label: 'Step' },
  ]
  return {
    id: PLAN_FIGURES.transfersTable,
    metric: ID.transfersOpen,
    title: 'Transfers',
    subtitle: 'Position moves and internal moves that touch this scope, in progress and done. No amounts.',
    rows,
    columns,
    note: null,
    empty: rows.length ? null : 'No transfers touch this scope.',
    uses: p.uses(FIGURE.transfers),
  }
}

const DRAFT_COLUMNS: readonly Column<TransferDraftRow & { kindText: string; budgetText: string }>[] = [
  { key: 'requestId', label: 'Request' },
  { key: 'kindText', label: 'Kind' },
  { key: 'personName', label: 'Person' },
  { key: 'fromPositionId', label: 'From position' },
  { key: 'fromOrg', label: 'From' },
  { key: 'toPositionId', label: 'To' },
  { key: 'toOrg', label: 'To org' },
  { key: 'effectiveDate', label: 'Effective', format: 'date' },
  { key: 'budgetText', label: 'Moves budget' },
]

/** Plan > Transfers: the Acting as person's own transfer drafts, oldest request first (M3). */
export function transferDrafts(p: Prep): FigureData<TransferDraftRow> {
  const ctx = p.ctx
  const me = ctx.access.actingAs?.personId ?? null
  const viewer = viewerOf(ctx)
  const names = workerNames(ctx)
  // Only where the mode processes transfers, and only the drafts the Acting as person processed: a
  // draft names the moving person's manager as its requester, and it is the HRBP's until submitted.
  const decision = ctx.access.decide('action:transfer.process')
  const rows: (TransferDraftRow & { kindText: string; budgetText: string })[] = []
  if (me && decision.access !== 'hidden')
    // An expired draft (D-EXPIRY) reads Expired: it is no draft to submit.
    for (const req of effectiveRequestsOf(ctx)) {
      if (req.type !== 'Transfer' || !req.transfer || req.state !== 'Draft') continue
      const processedBy = req.submittedById ?? req.requesterId
      if (processedBy !== me) continue
      const record = requestRecord(req, { viewer, asOf: ctx.asOf, nameOf: (id) => names.get(id) ?? null })
      if (!record) continue
      const t = req.transfer
      const to = t.toPositionId ?? t.toManagerPositionId
      rows.push({
        requestId: req.requestId,
        kind: t.kind,
        kindText: t.kind === 'position' ? 'Position move' : 'Internal move',
        personName: record.view === 'full' ? record.transferPersonName : null,
        fromPositionId: t.fromPositionId,
        fromOrg: orgOf(p, t.fromPositionId),
        toPositionId: to,
        toOrg: orgOf(p, to),
        effectiveDate: t.effectiveDate || null,
        moveBudget: t.moveBudget,
        budgetText: t.moveBudget ? 'Yes' : 'No',
      })
    }
  rows.sort((a, b) => (a.requestId < b.requestId ? -1 : 1))
  return {
    id: PLAN_FIGURES.transfersDrafts,
    metric: ID.transfersOpen,
    title: 'Your transfer drafts',
    subtitle: 'Transfers you processed that are not submitted yet. Submit one to start its approvals.',
    rows,
    columns: DRAFT_COLUMNS as readonly Column<TransferDraftRow>[],
    note: null,
    empty: rows.length
      ? null
      : decision.access === 'hidden'
        ? (decision.how ?? 'Transfers are processed by HRBPs.')
        : 'No transfer drafts.',
    uses: p.uses(FIGURE.transfers),
  }
}
