/**
 * The FY28 planning cycle (docs/PLAN.md 10.3, 13.2, 13.4 story 6): the sample's only cycle record,
 * opened by Finance on 15 Sep 2026 and Open for asks, asks due 16 Oct 2026. FY27 has no cycle record,
 * so the locked-cycle clause of out of plan applies to no sample request. Draws from the `cycle`
 * stream only (appended after the base streams, so no calibrated story moves).
 *
 * Silicon Engineering's managers have sent their ranked asks, all but 4:
 *  - "Managers" are the metric's population (`requests.cycle.notSubmitted`): holders of a position
 *    another position reports to, on 30 Sep 2026. In Silicon Engineering that is every M1 manager,
 *    director, VP and the SVP. 4 M1 managers have sent nothing (the Cycle tab's "Copy note").
 *  - The asks add 58 heads: 58 New role asks (+1 head each by 31 Mar 2028). Each director, VP and the
 *    SVP asks for one senior seat in their own staff; the M1 managers ask for the rest, some for two
 *    seats ranked 1 and 2. A manager can send in only one ask a head, and 58 heads cannot cover every
 *    manager in the unit, so the M1 managers who ask for no new seat send a Level change ask instead
 *    (a promotion of a Filled seat on their team from 1 Apr 2027: 0 heads, so the unit's asks still
 *    add exactly 58). A Level change takes effect in FY28 and moves no FY27 figure.
 *  - Every ask starts in FY28 (a New role on a Monday from 5 Apr 2027 to 28 Feb 2028), so no FY27
 *    ask, gap or cost moves, and the FY28 gap is the target (FY28 Working approved heads at 31 Mar
 *    2028 + 40) less the asks (+58): −18, with the default cut line after the 40th ranked head.
 *  - Cycle asks take the submitter's manager step only (the HRBP, leader and Finance stages replace
 *    the per-request steps): asks the manager has approved read In review, the rest Submitted.
 */
import type { Cycle } from '@/plan/types'
import type { ISODate, Level, ReasonCode, RequestRow, RequestState, StepRow } from '../schema'
import {
  AS_OF,
  ASKS_DUE,
  CYCLE_OPENED,
  type Day,
  day,
  iso,
  isoAt,
  nextMonday,
  onOrAfterWeekday,
} from './calendar'
import { costCenter, deptSpec, IC_LEVELS, type IcLevel, SE } from './departments'
import { drawIcLevel, holderOn, icRole, managerOn, type Seat, titleAtLevel, type World } from './org'
import { rowOnDay, seatStatusOn } from './positions'
import { rngFor } from './prng'

export const FY28_CYCLE_ID = 'cycle-fy28'
export const CYCLE_OPENED_AT = `${iso(CYCLE_OPENED)}T09:00`
/** Heads Silicon Engineering's asks add by 31 Mar 2028 (story 6). */
export const SE_ASK_HEADS = 58
/** Silicon Engineering managers with no ask in the cycle (story 6). */
export const SE_NOT_SUBMITTED = 4
/** M1 managers who ask for two new seats, ranked 1 and 2. */
const TWO_SEAT_MANAGERS = 5

const FIRST_START = day('2027-04-05')
const LAST_START = day('2028-02-28')
const LEVEL_CHANGE_ON: ISODate = '2027-04-01'
const FIRST_SUBMIT = day('2026-09-16')
const LAST_SUBMIT = AS_OF

/** The FY28 cycle record, opened by Finance (`openedBy`, the FP&A lead). */
export function fy28Cycle(openedBy: string): Cycle {
  return {
    cycleId: FY28_CYCLE_ID,
    fiscalYear: 'FY28',
    stage: 'Open for asks',
    openedAt: CYCLE_OPENED_AT,
    openedBy,
    dates: {
      asksDue: iso(ASKS_DUE),
      hrbpReviewDue: '2026-10-30',
      leaderReviewDue: '2026-11-13',
      financeReviewDue: '2026-12-04',
    },
    hrbpDone: [],
    leaderDone: [],
    cutLines: [],
    lockedAt: null,
    lockedBy: null,
  }
}

/** A seat in a unit whose holder manages someone on 30 Sep 2026, with that holder. */
export interface CycleManager {
  seat: Seat
  person: number
  level: Level
}

/**
 * The unit's managers on 30 Sep 2026 (the metric's population): holders of a seat that another seat
 * reports to (any seat in effect that day but an Eliminated one), in position ID order.
 */
export function unitManagers(w: World, bu: string): CycleManager[] {
  const hasReports = new Set<number>()
  for (const s of w.seats) {
    const row = rowOnDay(s, AS_OF)
    if (!row || row.status === 'Eliminated') continue
    const mgr = row.mgr !== undefined ? row.mgr : s.mgr
    if (mgr != null) hasReports.add(mgr)
  }
  const out: CycleManager[] = []
  for (const s of w.seats) {
    if (s.bu !== bu || !hasReports.has(s.idx)) continue
    const person = holderOn(w, s.idx, AS_OF)
    const row = rowOnDay(s, AS_OF)
    if (person == null || !row) continue
    out.push({ seat: s, person, level: row.level })
  }
  return out.sort((a, b) => (a.seat.id < b.seat.id ? -1 : 1))
}

export interface CycleAsks {
  /** The asks as `requests` rows, in raised order (IDs assigned by the caller). */
  rows: RequestRow[]
  /** Silicon Engineering's managers (employee IDs) on 30 Sep 2026. */
  managers: string[]
  /** The 4 who have not submitted. */
  notSubmitted: string[]
}

interface AskPlan {
  manager: CycleManager
  type: 'New role' | 'Level change'
  rank: number
  /** A Level change's seat. */
  seat: Seat | null
}

/** Weekdays from `from` to `to`, both included. */
function weekdays(from: Day, to: Day): Day[] {
  const out: Day[] = []
  for (let d = from; d <= to; d++) if (onOrAfterWeekday(d) === d) out.push(d)
  return out
}

/** A Filled individual contributor seat on the manager's team, P1 to P5, held through 1 Apr 2027. */
function promotable(w: World, m: CycleManager, used: Set<number>): Seat | null {
  const on = day(LEVEL_CHANGE_ON)
  for (const s of w.seats) {
    if (s.mgr !== m.seat.idx || s.role !== 'ic' || used.has(s.idx) || s.tags.size) continue
    const row = rowOnDay(s, AS_OF)
    if (!row || seatStatusOn(s, AS_OF) !== 'Filled') continue
    const i = IC_LEVELS.indexOf(row.level as IcLevel)
    if (i < 0 || i >= IC_LEVELS.length - 1) continue
    const h = holderOn(w, s.idx, AS_OF)
    if (h == null || holderOn(w, s.idx, on) !== h || w.people[h].tags.size) continue
    return s
  }
  return null
}

/**
 * Silicon Engineering's ranked asks (see the module comment). `idOf(i)` names the i-th ask in raised
 * order.
 */
export function cycleAsks(w: World, idOf: (i: number) => string): CycleAsks {
  const rng = rngFor('cycle')
  const managers = unitManagers(w, SE)
  const m1 = managers.filter((m) => m.level === 'M1')
  const leaders = managers.filter((m) => m.level !== 'M1')
  const quiet = new Set(rng.sample(m1, SE_NOT_SUBMITTED).map((m) => m.seat.idx))
  const asking = rng.shuffle(m1.filter((m) => !quiet.has(m.seat.idx)))

  const plans: AskPlan[] = []
  for (const m of leaders) plans.push({ manager: m, type: 'New role', rank: 1, seat: null })
  let heads = SE_ASK_HEADS - leaders.length
  const used = new Set<number>()
  asking.forEach((m, i) => {
    const want = i < TWO_SEAT_MANAGERS ? 2 : 1
    if (heads >= want) {
      for (let r = 1; r <= want; r++) plans.push({ manager: m, type: 'New role', rank: r, seat: null })
      heads -= want
      return
    }
    const seat = promotable(w, m, used)
    if (!seat) throw new Error(`Manager seat ${m.seat.id} has no seat to promote for a cycle ask.`)
    used.add(seat.idx)
    plans.push({ manager: m, type: 'Level change', rank: 1, seat })
  })
  if (heads !== 0) throw new Error(`The cycle asks add ${SE_ASK_HEADS - heads} heads, not ${SE_ASK_HEADS}.`)

  // Each manager sends their ranked list on one weekday; asks the manager's manager has approved read In review.
  const days = weekdays(FIRST_SUBMIT, LAST_SUBMIT)
  const sentOn = new Map<number, { day: Day; minute: number; approved: Day | null }>()
  for (const m of managers) {
    if (quiet.has(m.seat.idx)) continue
    const d = rng.pick(days)
    const minute = 8 * 60 + rng.int(0, 9 * 60)
    const later = days.filter((x) => x > d && x <= d + 6)
    const approved = later.length && rng.chance(0.6) ? rng.pick(later) : null
    sentOn.set(m.seat.idx, { day: d, minute, approved })
  }

  const drafts = plans.map((p) => {
    const m = p.manager
    const s = m.seat
    const when = sentOn.get(s.idx)!
    const approver = managerOn(w, s.idx, when.day)
    if (!approver) throw new Error(`Manager seat ${s.id} has no manager to approve its asks.`)
    const state: RequestState = when.approved != null ? 'In review' : 'Submitted'
    const step: StepRow = {
      role: 'Manager',
      approverId: w.people[approver.person].id,
      decision: when.approved != null ? 'Approved' : 'Pending',
      at: when.approved != null ? iso(when.approved) : null,
    }
    const minute = when.minute + (p.rank - 1) * 3 + (p.type === 'Level change' ? 1 : 0)
    const base = {
      state,
      requesterId: w.people[m.person].id,
      submittedById: w.people[m.person].id,
      submittedAt: isoAt(when.day, minute),
      updatedAt:
        when.approved != null
          ? isoAt(when.approved, Math.min(23 * 60, minute + 47))
          : isoAt(when.day, minute),
      businessUnit: SE,
      priority: p.rank,
      cycleId: FY28_CYCLE_ID,
      steps: [step],
      confidential: null,
      exception: null,
      transferKind: null,
      personId: null,
      fromPositionId: null,
      toManagerPositionId: null,
      toPositionId: null,
      effectiveDate: null,
      moveBudget: null,
    }
    if (p.type === 'Level change') {
      const seat = p.seat!
      const from = rowOnDay(seat, AS_OF)!.level as IcLevel
      const level = IC_LEVELS[IC_LEVELS.indexOf(from) + 1]
      const row: RequestRow = {
        requestId: '',
        type: 'Level change',
        reasonCode: 'Level mix',
        ...base,
        positionId: seat.id,
        department: seat.dept,
        costCenter: costCenter(seat.dept, seat.site),
        managerPositionId: s.id,
        level,
        location: seat.site,
        jobTitle: titleAtLevel(deptSpec(seat.dept), rowOnDay(seat, AS_OF)!.title, level),
        fte: seat.fte,
        startDate: LEVEL_CHANGE_ON,
      }
      return { row, at: row.submittedAt! }
    }
    const spec = deptSpec(s.dept)
    const site = s.site
    const icLevel: IcLevel = m.level === 'M1' ? drawIcLevel(spec, site, rng) : 'P6'
    const role = icRole(spec, icLevel, rng)
    const start = nextMonday(rng.int(FIRST_START, LAST_START))
    const reasonCode: ReasonCode = rng.chance(0.75) ? 'Growth' : 'New capability'
    const row: RequestRow = {
      requestId: '',
      type: 'New role',
      reasonCode,
      ...base,
      positionId: null,
      department: s.dept,
      costCenter: costCenter(s.dept, site),
      managerPositionId: s.id,
      level: role.level,
      location: site,
      jobTitle: role.title,
      fte: 1,
      startDate: iso(Math.min(start, LAST_START)),
    }
    return { row, at: row.submittedAt! }
  })

  drafts.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  const rows = drafts.map((d, i) => ({ ...d.row, requestId: idOf(i) }))
  return {
    rows,
    managers: managers.map((m) => w.people[m.person].id),
    notSubmitted: managers.filter((m) => quiet.has(m.seat.idx)).map((m) => w.people[m.person].id),
  }
}
