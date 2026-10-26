/**
 * The fields metrics read, in named groups, for the `uses` of every dictionary entry (a metric's
 * lineage: its tier is the lowest of these fields' tiers). Each reference is checked by the type
 * checker against the dataset record types (`KnownFieldRef`) and at run time by `validateCatalog`.
 *
 * Leave fields are named only by the leave count (`plan.leave.onLeave`): cost reads them to zero
 * unpaid months, but no other entry lists them, so no other definition says anything about leave.
 *
 * Plain data with a type-only import, so every view's `metrics.ts` can use it without loading the
 * catalog.
 */
import type { FieldRef, KnownFieldRef } from '@/data/quality/fieldRef'

type Ref = KnownFieldRef

/** Field groups by what they describe. */
export const F = {
  /** A seat on a date: its effective-dated rows, imported status, start and last day. */
  seat: [
    'positions.positionId',
    'positions.effectiveDate',
    'positions.status',
    'positions.startDate',
    'positions.endDate',
    'positions.workerType',
  ],
  /** Where a seat reports: a manager's tree and a leader's org. */
  tree: ['positions.managerPositionId'],
  /** What a seat is: its level, location and FTE (its band estimate and weight). */
  seatType: ['positions.level', 'positions.location', 'positions.fte'],
  /** The org a seat sits in. */
  seatOrg: ['positions.businessUnit', 'positions.department', 'positions.costCenter'],
  /** When a seat last became Open. */
  opened: ['positions.openedDate'],
  /** New or Backfill, on the seat. */
  seatReqType: ['positions.reqType'],
  /** Why a seat ended (Eliminated, Traded, Transferred). */
  ended: ['positions.endReason'],
  /** A person in a seat, start to last day. */
  assignment: [
    'workers.employeeId',
    'workers.positionId',
    'workers.assignmentStart',
    'workers.assignmentEnd',
    'workers.hireDate',
    'workers.terminationDate',
    'workers.workerType',
  ],
  /** A person's FTE. */
  workerFte: ['workers.fte'],
  /** A person's own cost center (reconciliation). */
  workerOrg: ['workers.costCenter'],
  /** A person's level and location (a not-in-plan person's band cost). */
  workerType: ['workers.level', 'workers.location'],
  /** A req and the seat it fills. */
  req: ['reqs.reqId', 'reqs.positionId', 'reqs.status', 'reqs.openedDate', 'reqs.targetStartDate'],
  /** An accepted offer: its stage and dates only. */
  offer: ['reqs.stage', 'reqs.offerAcceptedDate', 'reqs.startDate'],
  /** An offer's amounts. */
  offerPay: ['reqs.offerBase', 'reqs.offerCurrency', 'reqs.signOnBonus', 'reqs.relocation', 'reqs.agencyFee'],
  /** A person's pay. */
  pay: ['comp.employeeId', 'comp.effectiveDate', 'comp.currency', 'comp.baseSalary', 'comp.targetBonusPct'],
  /** The version's assumptions (bands, loads, FX, forecast drivers, trade rates). */
  assumptions: [
    'assumptions.version',
    'assumptions.table',
    'assumptions.org',
    'assumptions.key',
    'assumptions.value',
  ],
  /** A request: its type, state, seat, org and date. */
  request: [
    'requests.requestId',
    'requests.type',
    'requests.state',
    'requests.positionId',
    'requests.businessUnit',
    'requests.managerPositionId',
    'requests.startDate',
  ],
  /** A request's progress: who asked, when, and its approval steps. */
  requestFlow: ['requests.requesterId', 'requests.submittedAt', 'requests.updatedAt', 'requests.steps'],
  /** What a request asks for: a seat type. */
  requestSeat: ['requests.level', 'requests.location', 'requests.fte'],
  /** A cycle ask's cycle and rank. */
  cycle: ['requests.cycleId', 'requests.priority'],
  /** Raised against a freeze. */
  exception: ['requests.exception'],
  /** A trade's give seats, giving org, wanted seats and weights. */
  trade: [
    'requests.givePositionIds',
    'requests.giveOrgPositionId',
    'requests.creditUsedBp',
    'requests.count',
    'requests.partTimeRest',
    'requests.giveBp',
    'requests.getBp',
    'requests.creditBp',
  ],
  /** A transfer: who moves, from where, to where, when. */
  transfer: [
    'requests.transferKind',
    'requests.personId',
    'requests.fromPositionId',
    'requests.toManagerPositionId',
    'requests.toPositionId',
    'requests.effectiveDate',
  ],
  /** A hiring freeze. */
  freeze: [
    'freezes.freezeId',
    'freezes.businessUnit',
    'freezes.department',
    'freezes.costCenter',
    'freezes.leaderPositionId',
    'freezes.startDate',
    'freezes.endDate',
    'freezes.allowBackfill',
  ],
  /** A heads target. */
  target: [
    'targets.fiscalYear',
    'targets.targetDate',
    'targets.businessUnit',
    'targets.department',
    'targets.costCenter',
    'targets.leaderPositionId',
    'targets.targetHeads',
  ],
  /** A cost target. */
  targetCost: ['targets.targetCost'],
  /** Leave, read only by the leave count. */
  leave: ['workers.onLeave'],
} as const satisfies Record<string, readonly Ref[]>

/** Several groups (from `F`, or lineages built with `uses`) as one lineage, each field once, in order. */
export function uses(...groups: readonly (readonly FieldRef[])[]): FieldRef[] {
  return [...new Set(groups.flat())]
}

/** What a seat's plan line reads: status from assignments, start, type and the req that fills it. */
export const PLAN_LINE = uses(F.seat, F.assignment, F.req)

/**
 * What loaded cost reads: plan lines, HRIS pay, accepted offers and the version's assumptions
 * (bands for Open and Planned seats, loads, FX).
 */
export const LOADED_COST = uses(
  F.seat,
  F.seatType,
  F.assignment,
  F.workerFte,
  F.req,
  F.offer,
  F.offerPay,
  F.pay,
  F.assumptions,
)

/** What a band estimate reads: the seat type and the version's bands, loads and plan FX. Never pay. */
export const BAND = uses(F.seatType, F.assumptions)
