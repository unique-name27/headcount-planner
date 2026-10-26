/**
 * Manager budget status (docs/PLAN.md 6.9, 11.4, 15.1 R3 and R32). Built by engines C in M1. Pure.
 *
 * Staffed at each month-end from the as-of month to FY end: heads = employees in the tree's Filled
 * seats (a known exit leaves after its last day) + known starts by then (accepted offers at their start
 * date) + not-in-plan employees who report into the tree. Band cost = Σ midpoint × FTE of those
 * people's seats at the seats' current Working level, location and FTE (a not-in-plan person at their
 * HRIS level and location).
 *
 * Budget status never reads HRIS pay or offers. Pending requests add their head effect and their band
 * cost (midpoint × FTE) from their start, for the crossing test only. The first that applies shows:
 *  1. Over: staffed heads or band cost above the allocation at the as-of month-end;
 *  2. At risk, crossing: staffed, or staffed + pending, above the allocation at any month-end to FY end;
 *  3. At risk, within 2%: staffed band cost at 98% or more of the allocation's at the as-of month-end;
 *  4. On track.
 * A fully staffed team reads At risk (the literal "within 2%"). Reasons are in heads or plain drivers,
 * never amounts: "Start dates push you over in Feb", "A pending request adds 1 head in Mar", "A pending
 * trade adds 7 heads from Jan", "Level changes put your band cost over your allocation in Feb", "Your
 * band cost is within 2% of your allocation".
 *
 * How a reason is chosen:
 *  - Over at the as-of month-end: heads first ("You have 1 more head than your allocation"), else the
 *    band cost drivers present then ("Level changes put your band cost over your allocation"), else
 *    "Your band cost is over your allocation".
 *  - Crossing, staffed alone over in a month: heads over means starts ("Start dates push you over in
 *    Feb"); band cost over names the level, location or FTE drivers present, else start dates.
 *  - Crossing only with pending requests: the requests that begin in the crossing month (or, at the
 *    as-of month, every one counted by then) are named in heads ("A pending request adds 1 head in
 *    Mar"; a trade "adds 7 heads from Jan"), or, when they add no head, as moving band cost ("A pending
 *    level change puts your band cost over your allocation in Mar").
 */

import { monthEnd } from '@/data/fiscal'
import type { ISODate, Month, RequestType } from '@/data/schema'
import { formatMonthShort } from '@/lib/dates'
import type { SeatType } from './band'

/** Someone the team is staffed with. */
export interface StaffedPerson {
  /** The employee, or the req of an accepted offer. */
  id: string
  /** The seat; null for a not-in-plan employee who reports into the tree. */
  positionId: string | null
  /** First day (a known start's date). */
  start: ISODate
  /** Last day, inclusive; null when none is known. */
  lastDay: ISODate | null
  /** The seat at its current Working level, location and FTE (a not-in-plan person at their HRIS level and location). */
  seat: SeatType
  /** How the allocation prices the same seat; null when the seat is not in the allocation. Drivers compare the two. */
  allocated: SeatType | null
}

/** What moved staffed band cost against the allocation's pricing. */
export type StaffedDriver = 'start-dates' | 'level-changes' | 'location-changes' | 'fte-changes'

export interface StaffedMonth {
  month: Month
  monthEnd: ISODate
  heads: number
  bandCost: number
  /** Drivers present at this month-end: a start by then, or a seat whose level, location or FTE differs from its allocated pricing. */
  drivers: readonly StaffedDriver[]
}

/**
 * Staffed heads and band cost at each month-end of `months` (the as-of month to FY end). A person
 * counts at a month-end when they have started by it and their last day is not before it. The
 * 'start-dates' driver marks people counted who start after the first month's end.
 *
 * Fixture: A1 ((1) $400,000 at 30 Sep 2026, 6 heads and $480,000 from Feb 2027).
 */
export function staffed(
  people: readonly StaffedPerson[],
  months: readonly Month[],
  bandCost: (seat: SeatType) => number,
): StaffedMonth[] {
  const firstEnd = months.length ? monthEnd(months[0]) : null
  return months.map((month) => {
    const end = monthEnd(month)
    let heads = 0
    let cost = 0
    const drivers = new Set<StaffedDriver>()
    for (const p of people) {
      if (p.start > end || (p.lastDay != null && p.lastDay < end)) continue
      heads++
      cost += bandCost(p.seat)
      if (firstEnd != null && p.start > firstEnd) drivers.add('start-dates')
      const a = p.allocated
      if (!a) continue
      if (a.level !== p.seat.level) drivers.add('level-changes')
      if (a.location !== p.seat.location) drivers.add('location-changes')
      if (Math.abs(a.fte - p.seat.fte) > 1e-9) drivers.add('fte-changes')
    }
    const order: StaffedDriver[] = ['start-dates', 'level-changes', 'location-changes', 'fte-changes']
    return { month, monthEnd: end, heads, bandCost: cost, drivers: order.filter((d) => drivers.has(d)) }
  })
}

/** A pending request's effect on the team, for the crossing test only. */
export interface PendingEffect {
  requestId: string
  type: RequestType
  /** The month it starts or takes effect. */
  month: Month
  /** Its head effect on the tree (targets.ts `headEffect`). */
  heads: number
  /** Midpoint × FTE from its start (negative for seats removed); never `bandEffect`. */
  bandCost: number
}

export type BudgetStatusWord = 'Over' | 'At risk' | 'On track'

export interface BudgetStatus {
  status: BudgetStatusWord
  /** Which rule applied. */
  rule: 'over' | 'crossing' | 'within' | 'on-track'
  /** The reason in sentence case ("A pending request adds 1 head in Mar"); null for On track. */
  reason: string | null
  /** "<status>: <reason with a lower-case first letter>", or "On track". */
  text: string
  /** The month the crossing happens, for rule 'crossing'. */
  month: Month | null
}

export interface BudgetStatusInput {
  allocation: { heads: number; bandCost: number }
  /** The as-of month-end first, then each month-end to FY end. */
  staffed: readonly StaffedMonth[]
  pending: readonly PendingEffect[]
  /** `team.budget.status` setting `atRiskShare` (0.02). */
  atRiskShare: number
}

/** Cents of slack so float sums never flip a comparison. */
const EPS = 0.005

const heads = (n: number): string => `${n} ${n === 1 ? 'head' : 'heads'}`

/** "Level changes", "Level and location changes", "Level, location and FTE changes". */
function changesPhrase(drivers: readonly StaffedDriver[]): string | null {
  const words: string[] = []
  if (drivers.includes('level-changes')) words.push('level')
  if (drivers.includes('location-changes')) words.push('location')
  if (drivers.includes('fte-changes')) words.push('FTE')
  if (!words.length) return null
  const list =
    words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
  return `${list[0].toUpperCase()}${list.slice(1)} changes`
}

/** The reason for a staffed month over the allocation (`suffix` " in Feb" for a later month). */
function staffedReason(
  m: StaffedMonth,
  alloc: BudgetStatusInput['allocation'],
  suffix: string,
  atAsOf: boolean,
): string {
  const headsOver = m.heads > alloc.heads
  if (headsOver) {
    if (atAsOf) {
      const extra = m.heads - alloc.heads
      return `You have ${extra} more ${extra === 1 ? 'head' : 'heads'} than your allocation`
    }
    return `Start dates push you over${suffix}`
  }
  const changes = changesPhrase(m.drivers)
  if (changes) return `${changes} put your band cost over your allocation${suffix}`
  if (!atAsOf && m.drivers.includes('start-dates')) return `Start dates push you over${suffix}`
  return `Your band cost is over your allocation${suffix}`
}

/** The reason when pending requests tip a month over. */
function pendingReason(tipping: readonly PendingEffect[], month: Month): string {
  const name = formatMonthShort(month)
  const added = tipping.reduce((n, p) => n + p.heads, 0)
  const trade = tipping.length > 0 && tipping.every((p) => p.type === 'Trade')
  const one = tipping.length === 1
  if (added > 0) {
    if (trade) return `${one ? 'A pending trade adds' : 'Pending trades add'} ${heads(added)} from ${name}`
    return `${one ? 'A pending request adds' : 'Pending requests add'} ${heads(added)} in ${name}`
  }
  if (one) {
    const t = tipping[0].type
    const what =
      t === 'Level change' || t === 'Location change'
        ? `pending ${t.toLowerCase()}`
        : t === 'Trade'
          ? 'pending trade'
          : 'pending request'
    return `A ${what} puts your band cost over your allocation in ${name}`
  }
  return `Pending requests put your band cost over your allocation in ${name}`
}

const lowerFirst = (s: string): string => (s ? `${s[0].toLowerCase()}${s.slice(1)}` : s)

function result(
  status: BudgetStatusWord,
  rule: BudgetStatus['rule'],
  reason: string | null,
  month: Month | null,
): BudgetStatus {
  return { status, rule, reason, text: reason ? `${status}: ${lowerFirst(reason)}` : status, month }
}

/**
 * The first rule that applies (see the module comment). Month names are short ("Mar"); heads are
 * whole numbers ("1 head", "7 heads"); no amount ever appears.
 *
 * Fixture: A1 ((1) On track; (2) "At risk: a pending request adds 1 head in Mar"; (3) "At risk: your
 * band cost is within 2% of your allocation"; (4) "Over: level changes put your band cost over your
 * allocation").
 */
export function budgetStatus(input: BudgetStatusInput): BudgetStatus {
  const { allocation: alloc, staffed: months, pending } = input
  const over = (h: number, cost: number): boolean => h > alloc.heads || cost > alloc.bandCost + EPS
  if (!months.length) return result('On track', 'on-track', null, null)

  // 1. Over at the as-of month-end.
  const first = months[0]
  if (over(first.heads, first.bandCost))
    return result('Over', 'over', staffedReason(first, alloc, '', true), null)

  // 2. Crossing at any month-end to FY end: staffed alone, then staffed + pending.
  for (let i = 0; i < months.length; i++) {
    const m = months[i]
    const suffix = ` in ${formatMonthShort(m.month)}`
    if (over(m.heads, m.bandCost))
      return result('At risk', 'crossing', staffedReason(m, alloc, suffix, false), m.month)
    const counted = pending.filter((p) => p.month <= m.month)
    const h = counted.reduce((n, p) => n + p.heads, m.heads)
    const c = counted.reduce((n, p) => n + p.bandCost, m.bandCost)
    if (over(h, c)) {
      // Name the requests that begin this month; at the as-of month, or when none begins now (a
      // start pushed staffed up under requests already counted), every request counted by then.
      const starting = i === 0 ? counted : counted.filter((p) => p.month === m.month)
      return result(
        'At risk',
        'crossing',
        pendingReason(starting.length ? starting : counted, m.month),
        m.month,
      )
    }
  }

  // 3. Within the share of the allocation's band cost at the as-of month-end.
  if (alloc.bandCost > 0 && first.bandCost >= alloc.bandCost * (1 - input.atRiskShare) - EPS) {
    const pct = Math.round(input.atRiskShare * 1000) / 10
    return result('At risk', 'within', `Your band cost is within ${pct}% of your allocation`, null)
  }
  return result('On track', 'on-track', null, null)
}
