/**
 * The Audit page's words for what an entry changed (docs/PLAN.md 9.4, 10.7, 14.3; M3 review UI-14
 * and B7): each audit field id (src/plan/audit/fields.ts `AUDIT_FIELDS`) as a label in sentence
 * case, and the values that name people as the people's names. Pure.
 *
 * - Fields: `FIELD_LABEL` covers every field the write path writes; the patterns read "Step 2",
 *   "Cut line, Silicon Engineering" and "Ranked order, Operations"; an id not listed reads as its
 *   words ("someField" reads "Some field"), never as the raw id.
 * - Values that name a person: a chain of steps ("hrbp E11076, leader E10057") reads "HRBP Zhiwei
 *   Zhou, Leader Veronica Ortiz", and a person field (submitted by, requester, the moving person)
 *   reads the name. Only rows the viewer may read reach here (`auditView` has already left out, or
 *   cut to its seat, every entry 8.4 hides), so a name shows exactly where the request's own card
 *   shows it. A person the data does not name keeps the ID.
 * - Other values: a list reads its items, a record its parts ("merged 14, files 6").
 */
import type { StepRoleCode } from '@/plan/types'

/** Every audit field the write path writes, as the Audit page's Field column reads it. */
export const FIELD_LABEL: Readonly<Record<string, string>> = {
  // Positions (an approval's rows, a seat edit)
  status: 'Status',
  title: 'Title',
  jobFamily: 'Job family',
  level: 'Level',
  businessUnit: 'Business unit',
  department: 'Department',
  costCenter: 'Cost center',
  location: 'Location',
  legalEntity: 'Legal entity',
  managerPositionId: 'Manager seat',
  workerType: 'Worker type',
  fte: 'FTE',
  startDate: 'Start date',
  openedDate: 'Opened',
  reqType: 'Req type',
  leaderLevel: 'Leader level',
  endDate: 'End date',
  endReason: 'End reason',
  reviewed: 'Reviewed',
  // Requests
  state: 'State',
  steps: 'Approval steps',
  submittedById: 'Submitted by',
  requesterId: 'Requester',
  comment: 'Comment',
  reasonCode: 'Reason',
  count: 'Count',
  type: 'Type',
  positionId: 'Seat',
  jobTitle: 'Job title',
  priority: 'Priority',
  cycleId: 'Planning cycle',
  confidential: 'Confidential',
  exception: 'Freeze exception',
  giveBp: 'Give weight (bp)',
  getBp: 'Get weight (bp)',
  creditBp: 'Trade credit (bp)',
  creditUsedBp: 'Credit used (bp)',
  giveOrgPositionId: 'Giving org',
  restFte: 'Rest FTE',
  rateVersion: 'Rate version',
  rateHash: 'Rate hash',
  kind: 'Kind',
  personId: 'Person',
  fromPositionId: 'From seat',
  toManagerPositionId: 'To manager seat',
  toPositionId: 'To seat',
  effectiveDate: 'Effective date',
  moveBudget: 'Move budget',
  // Versions, assumptions, targets, freezes, cycles, closes, files
  created: 'Created',
  locked: 'Locked',
  value: 'Value',
  'override removed': 'Override removed',
  targetHeads: 'Target heads',
  targetCost: 'Target cost',
  targetDate: 'Target date',
  leaderPositionId: 'Leader seat',
  allowBackfill: 'Backfill allowed',
  reason: 'Reason',
  stage: 'Stage',
  dates: 'Due dates',
  hrbpDone: 'HRBP review done',
  leaderDone: 'Leader review done',
  closed: 'Closed',
  adjustments: 'Back-dated adjustments',
  replaced: 'Workspace replaced',
  merged: 'Workspace merged',
  'requests merged': 'Requests merged',
}

/** "someField" as words in sentence case ("Some field"); a field the list does not name reads so. */
export function words(id: string): string {
  const spaced = id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : id
}

/** An audit field id as the Field column reads it ("step 2" reads "Step 2"). */
export function fieldLabel(field: string): string {
  const known = FIELD_LABEL[field]
  if (known) return known
  const step = /^step (\d+)$/.exec(field)
  if (step) return `Step ${step[1]}`
  const cut = /^cutLine (.+)$/.exec(field)
  if (cut) return `Cut line, ${cut[1]}`
  const order = /^order (.+)$/.exec(field)
  if (order) return `Ranked order, ${order[1]}`
  return words(field)
}

/** A step's role as the chain names it. */
export const STEP_ROLE_WORD: Readonly<Record<StepRoleCode, string>> = {
  manager: 'Manager',
  hrbp: 'HRBP',
  leader: 'Leader',
  finance: 'Finance',
}

/** Fields whose value is one person's ID. */
const PERSON_FIELDS: ReadonlySet<string> = new Set(['submittedById', 'requesterId', 'personId'])

/** One step of a chain as the engine writes it ("hrbp E11076"). */
const STEP_PART = /^(manager|hrbp|leader|finance) (\S+)$/

/**
 * A chain of steps with each approver named ("HRBP Zhiwei Zhou, Leader Veronica Ortiz"); a part that
 * is not "<role> <person ID>" (a chain already named, in a file) stays as it is.
 */
export function chainWithNames(value: string, nameOf: (personId: string) => string | null): string {
  return value
    .split(', ')
    .map((part) => {
      const m = STEP_PART.exec(part)
      if (!m) return part
      return `${STEP_ROLE_WORD[m[1] as StepRoleCode]} ${nameOf(m[2]) ?? m[2]}`
    })
    .join(', ')
}

/** An entry's old or new value with the people it names by name (see the module comment). */
export function valueWithNames(
  field: string,
  value: unknown,
  nameOf: (personId: string) => string | null,
): unknown {
  if (typeof value !== 'string' || !value) return value
  if (field === 'steps') return chainWithNames(value, nameOf)
  if (PERSON_FIELDS.has(field)) return nameOf(value) ?? value
  return value
}
