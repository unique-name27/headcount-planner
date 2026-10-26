/**
 * Which rows each field applies to, in one table.
 *
 * A field's coverage counts only the rows it applies to: an end date only exists for eliminated
 * seats, a trade's give seats only for trades. Fields not listed here apply to every row.
 * `blankOk` marks fields whose blanks are normal even among those rows (a blank FTE reads as 1, a
 * blank legal entity reads the location's), so their coverage never lowers the tier.
 */
import type { DatasetKey } from '../schema'

type Row = Record<string, unknown>

export interface Applicability {
  /** Built once per dataset: which rows the field applies to. */
  applies: (rows: readonly Row[]) => (row: Row) => boolean
  /** Shown under the field name, e.g. "Eliminated seats". */
  scope: string
  /** Blanks are normal among the rows it applies to, so coverage does not cap the tier. */
  blankOk?: boolean
}

/** A placeholder some files use for a value nobody filled; it counts as blank. */
export const UNKNOWN_VALUE = 'Unknown'

/**
 * A value that counts as filled: not blank, not NaN, not an empty list, not the "Unknown"
 * placeholder.
 */
export function isFilled(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'number') return Number.isFinite(v)
  if (typeof v === 'string') {
    const t = v.trim()
    return t !== '' && t !== UNKNOWN_VALUE
  }
  if (Array.isArray(v)) return v.length > 0
  return true
}

const has = (v: unknown) => v != null && v !== ''
const each =
  (test: (row: Row) => boolean): Applicability['applies'] =>
  () =>
    test

/** Every row, with blanks normal. */
const optional = (scope: string): Applicability => ({ applies: each(() => true), scope, blankOk: true })

/**
 * Every row but the top of a tree: the row with no parent that heads the largest tree, found by
 * `idKey` and `parentKey` ("positionId" and "managerPositionId"). Only one row's ID is left out,
 * so parents cleared on import still count as gaps.
 */
function notTopOfTree(idKey: string, parentKey: string): Applicability['applies'] {
  return (rows) => {
    const children = new Map<string, Set<string>>()
    for (const r of rows) {
      const m = r[parentKey]
      const id = r[idKey]
      if (typeof m !== 'string' || !m || typeof id !== 'string') continue
      const list = children.get(m)
      if (list) list.add(id)
      else children.set(m, new Set([id]))
    }
    let top: string | null = null
    let topSize = 0
    for (const r of rows) {
      const id = r[idKey]
      if (has(r[parentKey]) || typeof id !== 'string' || !children.has(id)) continue
      const seen = new Set<string>([id])
      const queue = [id]
      while (queue.length) {
        for (const c of children.get(queue.pop() as string) ?? []) {
          if (seen.has(c)) continue
          seen.add(c)
          queue.push(c)
        }
      }
      if (seen.size > topSize) {
        topSize = seen.size
        top = id
      }
    }
    return (row) => row[idKey] !== top
  }
}

/** Everyone but the top of the organization (the person with no manager who heads the most). */
export const notTopOfOrg = notTopOfTree('employeeId', 'managerId')

const OPENINGS = new Set(['Open', 'Planned'])
const isEmployeeRow = (r: Row) => r.workerType !== 'Contractor' && r.workerType !== 'Intern'
const ACCEPTED_STAGES = new Set(['Offer accepted', 'Started'])
const hasOffer = (r: Row) => has(r.offerAcceptedDate) || ACCEPTED_STAGES.has(String(r.stage))
const DECIDED_OR_DRAFT = new Set(['Draft'])
const isTrade = (r: Row) => r.type === 'Trade'
const isTransfer = (r: Row) => r.type === 'Transfer'
const submitted = (r: Row) => !DECIDED_OR_DRAFT.has(String(r.state))
/** Request types about an existing seat. */
const SEAT_TYPES = new Set([
  'Backfill',
  'Level change',
  'Location change',
  'Elimination',
  'Start recruiting',
  'Start date',
])

export const APPLICABILITY: Partial<Record<DatasetKey, Record<string, Applicability>>> = {
  positions: {
    managerPositionId: {
      applies: notTopOfTree('positionId', 'managerPositionId'),
      scope: 'Every seat except the top of the organization',
    },
    jobFamily: optional('All seats'),
    legalEntity: optional('All seats'),
    workerType: optional('All seats'),
    fte: optional('All seats'),
    startDate: { applies: each((r) => OPENINGS.has(String(r.status))), scope: 'Open and Planned seats' },
    // Blank works the date out from reqs and exits.
    openedDate: { applies: each((r) => r.status === 'Open'), scope: 'Open seats', blankOk: true },
    reqType: {
      applies: each((r) => OPENINGS.has(String(r.status))),
      scope: 'Open and Planned seats',
      blankOk: true,
    },
    leaderLevel: optional('All seats'),
    endDate: { applies: each((r) => r.status === 'Eliminated'), scope: 'Eliminated seats' },
    endReason: { applies: each((r) => r.status === 'Eliminated'), scope: 'Eliminated seats' },
    sourceRequestId: optional('All seats'),
  },
  workers: {
    // Contractors and interns hold no Employee seat; an employee without one is not in the plan.
    positionId: { applies: each(isEmployeeRow), scope: 'Employees (not contractors or interns)' },
    assignmentStart: optional('All assignments'),
    assignmentEnd: optional('All assignments'),
    terminationDate: optional('All workers'),
    fte: optional('All workers'),
    managerId: { applies: notTopOfOrg, scope: 'Everyone except the top of the organization' },
    legalEntity: optional('All workers'),
    onLeave: optional('All workers'),
    leavePaid: { applies: each((r) => r.onLeave === true), scope: 'People on leave', blankOk: true },
  },
  comp: {
    currency: optional('All pay rows'),
    targetBonusPct: optional('All pay rows'),
  },
  reqs: {
    stage: {
      applies: each((r) => r.status === 'Open' || r.status === 'Filled'),
      scope: 'Open and filled reqs',
    },
    targetStartDate: {
      applies: each((r) => r.status === 'Open' || r.status === 'On hold'),
      scope: 'Open and on-hold reqs',
    },
    offerAcceptedDate: { applies: each(hasOffer), scope: 'Accepted offers' },
    startDate: { applies: each(hasOffer), scope: 'Accepted offers' },
    closedDate: {
      applies: each((r) => r.status === 'Filled' || r.status === 'Cancelled'),
      scope: 'Filled or cancelled reqs',
    },
    reqType: optional('All reqs'),
    hiringManagerId: optional('All reqs'),
    recruiter: optional('All reqs'),
    offerBase: { applies: each(hasOffer), scope: 'Accepted offers' },
    offerCurrency: { applies: each(hasOffer), scope: 'Accepted offers', blankOk: true },
    signOnBonus: { applies: each(hasOffer), scope: 'Accepted offers', blankOk: true },
    relocation: { applies: each(hasOffer), scope: 'Accepted offers', blankOk: true },
    agencyFee: { applies: each(hasOffer), scope: 'Accepted offers', blankOk: true },
  },
  requests: {
    submittedById: optional('All requests'),
    submittedAt: { applies: each(submitted), scope: 'Requests past Draft' },
    positionId: {
      applies: each((r) => SEAT_TYPES.has(String(r.type))),
      scope: 'Requests about an existing seat',
    },
    department: optional('All requests'),
    costCenter: optional('All requests'),
    managerPositionId: optional('All requests'),
    level: optional('All requests'),
    location: optional('All requests'),
    jobTitle: optional('All requests'),
    fte: optional('All requests'),
    startDate: optional('All requests'),
    priority: optional('All requests'),
    cycleId: optional('All requests'),
    steps: { applies: each(submitted), scope: 'Requests past Draft' },
    confidential: optional('All requests'),
    exception: optional('All requests'),
    givePositionIds: { applies: each(isTrade), scope: 'Trades' },
    giveOrgPositionId: { applies: each((r) => isTrade(r) && submitted(r)), scope: 'Trades past Draft' },
    creditUsedBp: { applies: each(isTrade), scope: 'Trades', blankOk: true },
    count: { applies: each(isTrade), scope: 'Trades' },
    jobFamily: { applies: each(isTrade), scope: 'Trades', blankOk: true },
    partTimeRest: { applies: each(isTrade), scope: 'Trades', blankOk: true },
    restFte: {
      applies: each((r) => isTrade(r) && r.partTimeRest === true),
      scope: 'Trades asking for a part-time seat',
      blankOk: true,
    },
    rateVersion: { applies: each((r) => isTrade(r) && submitted(r)), scope: 'Trades past Draft' },
    // Blank for a quote priced on a Working version.
    rateHash: { applies: each((r) => isTrade(r) && submitted(r)), scope: 'Trades past Draft', blankOk: true },
    giveBp: { applies: each((r) => isTrade(r) && submitted(r)), scope: 'Trades past Draft' },
    getBp: { applies: each((r) => isTrade(r) && submitted(r)), scope: 'Trades past Draft' },
    creditBp: { applies: each((r) => isTrade(r) && submitted(r)), scope: 'Trades past Draft' },
    transferKind: { applies: each(isTransfer), scope: 'Transfers' },
    personId: { applies: each(isTransfer), scope: 'Transfers' },
    fromPositionId: { applies: each(isTransfer), scope: 'Transfers' },
    toManagerPositionId: {
      applies: each((r) => isTransfer(r) && r.transferKind === 'Position move'),
      scope: 'Position moves',
    },
    toPositionId: {
      applies: each((r) => isTransfer(r) && r.transferKind === 'Internal move'),
      scope: 'Internal moves',
    },
    effectiveDate: { applies: each(isTransfer), scope: 'Transfers' },
    moveBudget: { applies: each(isTransfer), scope: 'Transfers', blankOk: true },
  },
  targets: {
    // Blank is the fiscal year's last day; a target can be for a whole unit or department.
    targetDate: optional('All targets'),
    department: optional('All targets'),
    costCenter: optional('All targets'),
    leaderPositionId: optional('All targets'),
  },
  freezes: {
    department: optional('All freezes'),
    costCenter: optional('All freezes'),
    leaderPositionId: optional('All freezes'),
    endDate: optional('All freezes'),
    allowBackfill: optional('All freezes'),
    reason: optional('All freezes'),
  },
  assumptions: {
    // Blank is the company's value.
    org: optional('All assumptions'),
  },
}

/** The rule for one field, or undefined when it applies to every row. */
export const applicabilityOf = (dataset: DatasetKey, field: string): Applicability | undefined => {
  const table = APPLICABILITY[dataset]
  return table && Object.hasOwn(table, field) ? table[field] : undefined
}

/** Which rows a field applies to, decided once per dataset; null when it applies to every row. */
export function appliesTo(
  dataset: DatasetKey,
  field: string,
  rows: readonly object[],
): ((row: object) => boolean) | null {
  const rule = applicabilityOf(dataset, field)
  if (!rule) return null
  const test = rule.applies(rows as readonly Row[])
  return (row) => test(row as Row)
}
