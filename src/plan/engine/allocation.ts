/**
 * Manager allocation (docs/PLAN.md 6.9, 11.4, 15.1 R2): constant for the fiscal year. Built by engines
 * C in M1. Pure.
 *
 * The tree's Filled, Open and Planned positions at FY end in the plan of record, each priced at its
 * plan-of-record level, location and FTE (the row effective on the lock date), + approved adds since
 * the lock at their approved values (trade get seats included) − approved eliminations since the lock
 * (trade give seats included). On hold and Eliminated seats are not in it. Band cost = Σ midpoint × FTE
 * at the current band year (no loads). Approved Level, Location and FTE changes and HRBP Working edits
 * do not change it. The manager's own seat and anything above it are never in their tree. Standard
 * heads show only as a note (`team.trade.standardHeads` = Σ weight ÷ 10,000) and never set status.
 *
 * Readings taken here:
 *  - Tree membership reads each seat's current row (the latest on or before FY end), because plan lines
 *    follow a moved position (R26); pricing reads the row on the lock date.
 *  - Approved adds and eliminations are read from the position rows the approvals wrote, never from
 *    the requests (M2 known gap 6, browser finding B3): every row an approval writes carries its
 *    `sourceRequestId` (requests.ts, trade.ts), so the allocation's lineage is the positions'.
 *  - An approved add since the lock is a seat whose first row an approval wrote (a New role's seat, a
 *    trade's get seat: the only approvals that create seats) and that the plan of record has no line
 *    for, so its lock never saw it. It is priced at that first row, which holds its approved values; a
 *    later Level or Location change adds a later row and never reprices it. An add whose first row
 *    starts after FY end is not in this year's allocation. Adds follow the plan-of-record seats in
 *    request ID order (natural: "R-999" before "R-1000"), then in the order of the positions.
 *  - An approved elimination since the lock is an Eliminated row an approval wrote (endReason
 *    Eliminated, or Traded for a trade's give seat; blank reads Eliminated as in cost.ts) that ends a
 *    seat of the allocation on or before FY end. It leaves the allocation even before the seat's last
 *    day: the allocation is the year-end shape. A plan-of-record seat is alive at FY end in the lock's
 *    lines, so such a row was written after the lock (the one exception, a seat that a later row
 *    reopened before FY end after an elimination the lock saw, reads as eliminated). An elimination
 *    whose last day is FY end or later leaves this year's shape as it is (as an add starting after FY
 *    end does).
 */

import { fyRange } from '@/data/fiscal'
import type { FiscalYear, ISODate, PositionRow } from '@/data/schema'
import type { OrgMatch, PositionStatus, SeatPlace } from '../types'
import { type SeatType, SH_BP } from './band'

/** A seat in the allocation, priced as the allocation prices it. */
export interface AllocationSeatInput {
  positionId: string
  /** The seat's current Working status (for the Filled, Open and Planned split). */
  status: 'Filled' | 'Open' | 'Planned'
  /** The priced seat type: the plan-of-record row on the lock date, or the approved values of an add. */
  seat: SeatType
  source: 'plan-of-record' | 'approved-add'
  /** The seat has a req (Planned seats with one are "requested"). */
  hasReq: boolean
  /** A pending Start recruiting request names the seat. */
  pendingStartRecruiting: boolean
}

export interface AllocationSeat extends AllocationSeatInput {
  /** Midpoint × FTE, USD at plan rates, current band year. */
  bandCost: number
  /** The seat's weight in bp, or null when no weight function was given. */
  weightBp: number | null
}

export interface AllocationInput {
  fiscalYear: FiscalYear
  seats: readonly AllocationSeatInput[]
  /** Seats removed by approved eliminations since the lock (trade give seats included). */
  eliminated: ReadonlySet<string>
  /** Midpoint × FTE in USD at plan rates for the current band year. */
  bandCost(seat: SeatType): number
  /** A seat's weight in bp of the standard head (band.ts `weightBp`), for the note. */
  weightBp?(seat: SeatType): number
}

/** The allocation and its parts (the My team hero adds up: Open + Planned = left to fill). */
export interface Allocation {
  heads: number
  bandCost: number
  seats: readonly AllocationSeat[]
  filled: number
  open: number
  planned: number
  /** Open + Planned. */
  leftToFill: number
  /** Planned seats with a req or a pending Start recruiting request. */
  requested: number
  /** Planned seats with no req and no pending Start recruiting request. */
  leftToRequest: number
  /** Σ weight ÷ 10,000, or null with no weights. */
  standardHeads: number | null
}

/**
 * The allocation from its seats (minus eliminated ones). A seat listed twice counts once.
 *
 * Fixture: A1 (6 seats at $80,000: 6 heads, $480,000).
 */
export function allocation(input: AllocationInput): Allocation {
  const seats: AllocationSeat[] = []
  const seen = new Set<string>()
  let bandCost = 0
  let weight = 0
  let filled = 0
  let open = 0
  let planned = 0
  let requested = 0
  for (const s of input.seats) {
    if (input.eliminated.has(s.positionId) || seen.has(s.positionId)) continue
    seen.add(s.positionId)
    const cost = input.bandCost(s.seat)
    const w = input.weightBp ? input.weightBp(s.seat) : null
    seats.push({ ...s, bandCost: cost, weightBp: w })
    bandCost += cost
    if (w != null) weight += w
    if (s.status === 'Filled') filled++
    else if (s.status === 'Open') open++
    else {
      planned++
      if (s.hasReq || s.pendingStartRecruiting) requested++
    }
  }
  return {
    heads: seats.length,
    bandCost,
    seats,
    filled,
    open,
    planned,
    leftToFill: open + planned,
    requested,
    leftToRequest: planned - requested,
    standardHeads: input.weightBp ? weight / SH_BP : null,
  }
}

export interface AllocationSeatsInput {
  fiscalYear: FiscalYear
  /** The plan of record's lock date: each of its seats is priced at its row in effect on that date. */
  lockDate: ISODate
  /** Positions whose plan-of-record line is Filled, Open or Planned at FY end. */
  planOfRecordSeats: readonly string[]
  /** Every position the plan of record has a line for: the seats its lock saw. */
  lockedPositions: ReadonlySet<string>
  /**
   * Every position row (imported plus overlay), with the rows approvals wrote (`sourceRequestId`):
   * the created seats of New roles and trades, and the Eliminated rows of Eliminations and trades.
   */
  positions: readonly PositionRow[]
  /** The manager's tree, strictly below the manager's own seat. */
  tree: OrgMatch
  /** A seat's current Working state; null when it does not exist. */
  seatNow(
    positionId: string,
  ): { status: PositionStatus; hasReq: boolean; pendingStartRecruiting: boolean } | null
}

const IN_ALLOCATION: ReadonlySet<PositionStatus> = new Set<PositionStatus>(['Filled', 'Open', 'Planned'])

/**
 * Whether `r` is an Eliminated row an approval wrote (an Elimination's, or a trade's for a give seat)
 * that ends the seat on or before `d`: from the later of its effective date and the day after its last
 * day (versions.ts `endsSeatOn`). A Transferred row is not an elimination.
 */
export function approvalEndsBy(r: PositionRow, d: ISODate): boolean {
  return (
    r.status === 'Eliminated' &&
    !!r.sourceRequestId &&
    r.endReason !== 'Transferred' &&
    r.effectiveDate <= d &&
    (!r.endDate || r.endDate < d)
  )
}

/** Request IDs in natural order: digit runs compare as numbers ("R-999" before "R-1000"). */
export function byRequestId(a: string, b: string): number {
  const x = a.match(/\d+|\D+/g) ?? []
  const y = b.match(/\d+|\D+/g) ?? []
  for (let i = 0; i < x.length && i < y.length; i++) {
    if (x[i] === y[i]) continue
    if (/^\d/.test(x[i]) && /^\d/.test(y[i])) {
      const n = Number(x[i]) - Number(y[i])
      if (n !== 0) return n
    }
    return x[i] < y[i] ? -1 : 1
  }
  return x.length - y.length
}

/**
 * The allocation's seats: plan-of-record seats in the tree priced at their row on the lock date (never
 * at a later approved Level, Location or FTE change), approved adds since the lock at their approved
 * values, and the set of those seats an approved elimination since the lock removes. Seats now On hold
 * or Eliminated are left out. Reads positions only, never a request (see the readings above).
 *
 * Fixture: A1 (5): a seat raised from P3 to P4 by a Level change approved after the lock stays priced
 * at P3, so the allocation stays $480,000 (pricing it at Working's P4 is the negative control).
 */
export function allocationSeats(input: AllocationSeatsInput): {
  seats: AllocationSeatInput[]
  eliminated: Set<string>
} {
  const fyEnd = fyRange(input.fiscalYear).end
  const byId = new Map<string, PositionRow[]>()
  for (const r of input.positions) {
    const list = byId.get(r.positionId)
    if (list) list.push(r)
    else byId.set(r.positionId, [r])
  }
  for (const list of byId.values())
    list.sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : 0))
  const rowOn = (rows: readonly PositionRow[], d: ISODate): PositionRow | null => {
    let hit: PositionRow | null = null
    for (const r of rows) if (r.effectiveDate <= d) hit = r
    return hit
  }
  const placeOf = (r: PositionRow): SeatPlace => ({
    positionId: r.positionId,
    managerPositionId: r.managerPositionId ?? null,
    businessUnit: r.businessUnit,
    department: r.department ?? null,
    costCenter: r.costCenter,
  })
  const typeOf = (r: PositionRow): SeatType => ({ level: r.level, location: r.location, fte: r.fte ?? 1 })

  const seats: AllocationSeatInput[] = []
  const taken = new Set<string>()
  const add = (positionId: string, priced: PositionRow, source: AllocationSeatInput['source']) => {
    if (taken.has(positionId)) return
    const rows = byId.get(positionId) ?? []
    const current = rowOn(rows, fyEnd) ?? rows[rows.length - 1] ?? priced
    if (!input.tree(placeOf(current), fyEnd)) return
    const now = input.seatNow(positionId)
    if (!now || !IN_ALLOCATION.has(now.status)) return
    taken.add(positionId)
    seats.push({
      positionId,
      status: now.status as AllocationSeatInput['status'],
      seat: typeOf(priced),
      source,
      hasReq: now.hasReq,
      pendingStartRecruiting: now.pendingStartRecruiting,
    })
  }

  for (const id of input.planOfRecordSeats) {
    const rows = byId.get(id)
    if (!rows?.length) continue
    add(id, rowOn(rows, input.lockDate) ?? rows[0], 'plan-of-record')
  }

  // Approved adds since the lock: seats an approval created that the lock never saw.
  const adds: { id: string; first: PositionRow; by: string }[] = []
  for (const [id, rows] of byId) {
    const first = rows[0]
    if (!first.sourceRequestId || input.lockedPositions.has(id)) continue
    if (first.startDate && first.startDate > fyEnd) continue
    adds.push({ id, first, by: first.sourceRequestId })
  }
  adds.sort((a, b) => byRequestId(a.by, b.by))
  for (const a of adds) add(a.id, a.first, 'approved-add')

  // Approved eliminations since the lock: the allocation's seats an approval's Eliminated row ends by FY end.
  const eliminated = new Set<string>()
  for (const id of taken) if ((byId.get(id) ?? []).some((r) => approvalEndsBy(r, fyEnd))) eliminated.add(id)
  return { seats, eliminated }
}
