/**
 * The audit field ids the write path writes, by object (docs/PLAN.md 5.3, 8.4 rule 7, 10.7; M3
 * freeze): what `AuditEntry.field` may read for each `AuditEntry.object`, and how each entry's `id`
 * is formed. Redaction is src/access/visibility.ts `auditView` alone; this list lets its tests (and
 * the leak crawl) check every field the write path writes: the amount fields read "changed" outside
 * HR admin (`isPayField`), basis-point fields show, and no other field carries an amount.
 *
 * Fields written as a pattern use `<n>` for a step number and `<unit>` for a business unit. Plain
 * data, written in full in the M3 freeze (docs/CONTRACTS-M3.md): a builder that writes a new field
 * adds it here in the same change.
 */
import type { AuditObject } from '../types'

/** The position fields an approval or a seat edit writes, one entry per changed field (requests.ts `rowAudit`). */
export const POSITION_AUDIT_FIELDS = [
  'status',
  'title',
  'jobFamily',
  'level',
  'businessUnit',
  'department',
  'costCenter',
  'location',
  'legalEntity',
  'managerPositionId',
  'workerType',
  'fte',
  'startDate',
  'openedDate',
  'reqType',
  'leaderLevel',
  'endDate',
  'endReason',
] as const

/** Every field per object, and what the entry's `id` is. */
export const AUDIT_FIELDS: Readonly<Record<AuditObject, { id: string; fields: readonly string[] }>> = {
  position: {
    id: 'positionId',
    fields: [...POSITION_AUDIT_FIELDS, 'reviewed'],
  },
  request: {
    id: 'requestId',
    fields: [
      'state',
      'steps',
      'submittedById',
      // Submit on behalf: the manager the request is for (core, M3)
      'requesterId',
      'step <n>',
      'comment',
      'reasonCode',
      // Approved with changes (ChangeSet fields)
      'level',
      'location',
      'fte',
      'startDate',
      'count',
      // Drafts and edits
      'type',
      'positionId',
      'managerPositionId',
      'jobTitle',
      'priority',
      'cycleId',
      'confidential',
      'exception',
      // Trades: the stored quote and the credit ledger, in basis points (they show)
      'giveBp',
      'getBp',
      'creditBp',
      'creditUsedBp',
      'giveOrgPositionId',
      'restFte',
      'rateVersion',
      'rateHash',
      // A transfer draft's own fields, edited before it is submitted (core, M3)
      'kind',
      'personId',
      'fromPositionId',
      'toManagerPositionId',
      'toPositionId',
      'effectiveDate',
      'moveBudget',
    ],
  },
  version: {
    id: 'versionId',
    fields: ['created', 'locked', 'state'],
  },
  assumption: {
    id: '<version>|<table>|<org>|<key>',
    // 'override removed': an org's row taken back, old its value, new its parent's (M3 review).
    fields: ['value', 'override removed'],
  },
  target: {
    id: 'transfer.ts targetKey (<fiscalYear>|<businessUnit>|<department>|<costCenter>|<leaderPositionId>)',
    fields: ['targetHeads', 'targetCost', 'targetDate'],
  },
  freeze: {
    id: 'freezeId',
    // A new freeze writes each field it sets; an edit, each field it changes (core, M3).
    fields: [
      'created',
      'businessUnit',
      'department',
      'costCenter',
      'leaderPositionId',
      'startDate',
      'endDate',
      'allowBackfill',
      'reason',
    ],
  },
  cycle: {
    id: 'cycleId',
    fields: ['stage', 'dates', 'hrbpDone', 'leaderDone', 'cutLine <unit>', 'order <unit>'],
  },
  close: {
    id: 'month',
    fields: ['closed', 'adjustments'],
  },
  transfer: {
    id: 'requestId',
    fields: ['state', 'effectiveDate', 'moveBudget'],
  },
  workspace: {
    id: 'the file name, or the exception ID for a review',
    fields: ['replaced', 'merged', 'requests merged', 'reviewed'],
  },
}

/**
 * The fields whose old and new values are amounts: `auditView` must read them "changed" outside HR
 * admin (src/access/visibility.ts `isPayField`; a test keeps the two in step). An assumption's
 * `value` is redacted wherever `cost:band` is hidden instead (review RM-2), since a rate is not an
 * amount but a band midpoint is.
 */
export const AMOUNT_AUDIT_FIELDS: readonly string[] = ['targetCost']
