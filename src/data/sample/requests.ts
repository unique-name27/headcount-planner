/**
 * Headcount requests (docs/PLAN.md 5.2 `requests`, 10, 13.3, 13.4). positions.ts plans the requests
 * that made or changed seats (approved New roles, the two approved transfers, the approved
 * eliminations, Start recruiting, story 3's pending Backfills and two approved Backfills);
 * `planRequests` adds the rest: Manager C's confidential Elimination, Manager A's pending New role,
 * Corporate's 2 freeze exceptions, the cross-unit internal move waiting on the second HRBP, a Level
 * change and a Location change, and one request in each other state. Story 9's trade and the FY28
 * cycle's asks are the stories' (wave 2). Draws from the `requests` stream only.
 *
 * Steps follow the chain rules (10.2) as data: the submitter's manager (none for Start recruiting
 * and Start date), the unit HRBP (and the receiving unit's for a cross-unit transfer), the nearest
 * leader when the band estimate tops $250,000, the seat is Director or above or the request is out
 * of plan (both unit leaders for a cross-unit transfer), and Finance for a New role or a freeze
 * exception. No self-approval (the step moves up to the next person of that role), and one person on
 * two steps keeps the higher step only. Reading taken here: "out of plan" is tested in heads only,
 * against the unit's FY27 target (its Budget heads at 31 Mar 2027); the guarded cost test is the
 * chain engine's, so a later recompute may add a leader step these rows lack, never remove one.
 *
 * No Silicon Engineering request is pending with a head effect (story 6), and no pending request moves
 * Systems & Software's FY27 asks (story 9's headroom is counted after them in positions.ts).
 */
import {
  APPROVED_REQUEST_STATES,
  type ISODate,
  isLeaderLevel,
  PENDING_REQUEST_STATES,
  type RequestRow,
  type RequestState,
  type StepDecision,
  type StepRole,
  type StepRow,
} from '../schema'
import { bandEstimateUsd } from './assumptions'
import { AS_OF, type Day, day, iso, isoAt, isoOrNull } from './calendar'
import { CORP, costCenter, EO, GTM, OPS, SE, SS } from './departments'
import {
  holderOn,
  isLeaderSeat,
  managerOn,
  newRequest,
  type RequestPlan,
  type Seat,
  type StepPlan,
  type World,
} from './org'
import { fy27Heads, seatCostCenter } from './positions'
import type { Rng } from './prng'

/** Each unit's top seat, whose holder is the unit leader on cross-unit transfers. */
export const UNIT_LEADER: Readonly<Record<string, string>> = {
  [SE]: 'svp-se',
  [SS]: 'svp-ss',
  [OPS]: 'coo',
  [GTM]: 'cro',
  [CORP]: 'cfo',
  [EO]: 'ceo',
}

export const LEADER_THRESHOLD_USD = 250_000

const PERSONA = ['manager-a', 'manager-b', 'manager-c', 'manager-c-sub']
const inPersonaTeam = (s: Seat): boolean => [...s.tags].some((t) => PERSONA.some((p) => t.startsWith(p)))

/** A plain Filled seat on 30 Sep (tenured holder, no planted use) in a department at a site. */
function plainSeat(w: World, rng: Rng, dept: string, site: string, level?: string): Seat {
  const ok = w.seats.filter((s) => {
    if (
      s.dept !== dept ||
      s.site !== site ||
      s.role !== 'ic' ||
      s.tags.size ||
      s.fte !== 1 ||
      inPersonaTeam(s)
    )
      return false
    if (level && s.level !== level) return false
    const h = holderOn(w, s.idx, AS_OF)
    if (h == null) return false
    const p = w.people[h]
    return p.tags.size === 0 && p.leave == null && p.term == null && s.stints.length === 1
  })
  return rng.pick(ok)
}

/** The base requests positions.ts does not plan. */
export function planRequests(w: World, rng: Rng): void {
  const seatOf = (tag: string) => w.seats.find((s) => s.tags.has(tag))!

  // Manager C's own seat in a confidential Elimination, raised by C's manager (Supply Chain's
  // director), In review at the HRBP step, effective 31 Dec 2026.
  {
    const c = seatOf('manager-c')
    const requester = holderOn(w, c.mgr!, AS_OF)!
    const q = newRequest(w, {
      type: 'Elimination',
      state: 'In review',
      reason: 'Restructure',
      requester,
      mgrSeat: c.mgr!,
      bu: c.bu,
      dept: c.dept,
      site: c.site,
      level: c.level,
      title: c.title,
      fte: c.fte,
      seat: c.idx,
      start: day('2026-12-31'),
      submitted: day('2026-09-14'),
      updated: day('2026-09-14'),
      confidential: true,
      waitingOn: 'HRBP',
    })
    q.tags.add('manager-c-elimination')
  }

  // Manager A's pending New role: a P3 Account Manager in Munich from 1 Feb 2027.
  {
    const a = seatOf('manager-a')
    const q = newRequest(w, {
      type: 'New role',
      state: 'Submitted',
      reason: 'Growth',
      requester: holderOn(w, a.idx, AS_OF)!,
      mgrSeat: a.idx,
      bu: GTM,
      dept: 'Sales',
      site: 'Munich',
      level: 'P3',
      title: 'Account Manager',
      fte: 1,
      start: day('2027-02-01'),
      submitted: day('2026-09-22'),
      updated: day('2026-09-22'),
    })
    q.tags.add('manager-a-new-role')
  }

  // Corporate's two freeze exceptions (New roles: they add no seat unless approved).
  for (const [dept, site, level, title, start, submitted, state] of [
    ['IT', 'San Jose', 'P4', 'Senior Security Engineer', '2026-12-07', '2026-08-24', 'In review'],
    ['Finance', 'San Jose', 'P3', 'Financial Analyst II', '2027-01-04', '2026-09-08', 'Submitted'],
  ] as const) {
    const mgr = w.seats.find(
      (s) => s.role === 'manager' && s.dept === dept && s.site === site && holderOn(w, s.idx, AS_OF) != null,
    )!
    const q = newRequest(w, {
      type: 'New role',
      state,
      reason: 'Freeze exception',
      requester: holderOn(w, mgr.idx, AS_OF)!,
      mgrSeat: mgr.idx,
      bu: CORP,
      dept,
      site,
      level,
      title,
      fte: 1,
      start: day(start),
      submitted: day(submitted),
      updated: day(submitted) + (state === 'In review' ? 6 : 0),
      exception: true,
      waitingOn: state === 'In review' ? 'Finance' : null,
    })
    q.tags.add('freeze-exception')
  }

  // A cross-unit internal move (Operations to Systems & Software), waiting on the receiving HRBP.
  {
    const to = seatOf('cross-unit-to')
    const from = plainSeat(w, rng, 'Supply Chain', 'San Jose')
    from.tags.add('cross-unit-from')
    const person = holderOn(w, from.idx, AS_OF)!
    const q = newRequest(w, {
      type: 'Transfer',
      state: 'In review',
      reason: 'Other',
      requester: holderOn(w, from.mgr!, AS_OF) ?? managerOn(w, from.mgr!, AS_OF)!.person,
      mgrSeat: from.mgr!,
      bu: OPS,
      dept: from.dept,
      site: from.site,
      level: from.level,
      title: from.title,
      fte: 1,
      seat: from.idx,
      start: day('2026-11-02'),
      submitted: day('2026-09-09'),
      updated: day('2026-09-16'),
      waitingOn: 'HRBP',
      transfer: {
        kind: 'Internal move',
        person,
        from: from.idx,
        toManager: null,
        to: to.idx,
        effective: day('2026-11-02'),
        moveBudget: false,
      },
    })
    q.tags.add('cross-unit-move')
    w.people[person].tags.add('cross-unit-mover')
  }

  // A Level change (Operations, P3 to P4) and a Location change (Systems & Software, San Jose to Seattle).
  {
    const s = plainSeat(w, rng, 'Test & Product Engineering', 'Shanghai', 'P3')
    s.tags.add('level-change')
    const q = newRequest(w, {
      type: 'Level change',
      state: 'Submitted',
      reason: 'Level mix',
      requester: holderOn(w, s.mgr!, AS_OF) ?? managerOn(w, s.mgr!, AS_OF)!.person,
      mgrSeat: s.mgr!,
      bu: OPS,
      dept: s.dept,
      site: s.site,
      level: 'P4',
      title: s.title,
      fte: 1,
      seat: s.idx,
      start: day('2026-11-02'),
      submitted: day('2026-09-21'),
      updated: day('2026-09-21'),
    })
    q.tags.add('level-change')
  }
  {
    const s = plainSeat(w, rng, 'Software', 'San Jose')
    s.tags.add('location-change')
    const q = newRequest(w, {
      type: 'Location change',
      state: 'In review',
      reason: 'Location strategy',
      requester: holderOn(w, s.mgr!, AS_OF) ?? managerOn(w, s.mgr!, AS_OF)!.person,
      mgrSeat: s.mgr!,
      bu: SS,
      dept: s.dept,
      site: 'Seattle',
      level: s.level,
      title: s.title,
      fte: 1,
      seat: s.idx,
      start: day('2027-01-04'),
      submitted: day('2026-09-01'),
      updated: day('2026-09-08'),
      waitingOn: 'HRBP',
    })
    q.tags.add('location-change')
  }

  // One request in each remaining state, outside Silicon Engineering and Systems & Software.
  const newRole = (
    dept: string,
    site: string,
    level: 'P2' | 'P3' | 'P4',
    title: string,
    state: RequestState,
    submitted: Day | null,
    updated: Day,
    tag: string,
    bu: string,
  ) => {
    const mgr = w.seats.find(
      (s) =>
        s.role === 'manager' &&
        s.dept === dept &&
        s.site === site &&
        !inPersonaTeam(s) &&
        holderOn(w, s.idx, updated) != null,
    )!
    const q = newRequest(w, {
      type: 'New role',
      state,
      reason: 'Growth',
      requester: holderOn(w, mgr.idx, updated)!,
      mgrSeat: mgr.idx,
      bu,
      dept,
      site,
      level,
      title,
      fte: 1,
      start: day('2027-01-04'),
      submitted,
      updated,
      decided: state === 'Rejected' || state === 'Withdrawn' ? updated : null,
      waitingOn: state === 'Sent back' ? 'HRBP' : null,
    })
    q.tags.add(tag)
  }
  newRole(
    'Supply Chain',
    'Hsinchu',
    'P2',
    'Supply Chain Planner',
    'Draft',
    null,
    day('2026-09-24'),
    'draft',
    OPS,
  )
  newRole(
    'Test & Product Engineering',
    'Shanghai',
    'P3',
    'Test Engineer II',
    'Sent back',
    day('2026-08-10'),
    day('2026-08-18'),
    'sent-back',
    OPS,
  )
  newRole(
    'Product Marketing',
    'San Jose',
    'P4',
    'Senior Technical Marketing Engineer',
    'Rejected',
    day('2026-06-01'),
    day('2026-06-15'),
    'rejected',
    GTM,
  )
  newRole(
    'Quality & Reliability',
    'Hsinchu',
    'P3',
    'Reliability Engineer II',
    'Withdrawn',
    day('2026-05-11'),
    day('2026-05-20'),
    'withdrawn',
    OPS,
  )
  newRole(
    'Test & Product Engineering',
    'Hsinchu',
    'P2',
    'Product Engineer',
    'Expired',
    null,
    day('2026-06-12'),
    'expired',
    OPS,
  )
}

/* ───────────────────────── steps ───────────────────────── */

/** The person on the step of a role above `seat`: the nearest holder up the tree (vacant seats skipped). */
function holderAbove(w: World, seat: number, d: Day): { seat: number; person: number } | null {
  return managerOn(w, seat, d)
}

/** The nearest leader seat above `seat` (Director or above) whose holder is not `not`, and that holder. */
function leaderAbove(w: World, seat: number, d: Day, not: number): number | null {
  for (let m = w.seats[seat].mgr; m != null; m = w.seats[m].mgr) {
    if (!isLeaderSeat(w.seats[m])) continue
    const h = holderOn(w, m, d)
    if (h != null && h !== not) return h
  }
  return null
}

/** The Finance approver: the FP&A lead's seat (the Finance persona). */
const FINANCE_APPROVER = 'fpa-lead'

/** The request's seat (or the seat a new role reports to): where its org is. */
const orgSeat = (q: RequestPlan): number => q.seat ?? q.mgrSeat

/** Out of plan, in heads (see the module comment): the unit's FY27 asks with this request above its Budget heads. */
function outOfPlan(w: World, q: RequestPlan): boolean {
  if (q.type !== 'New role') return false
  const h = fy27Heads(w, q.bu)
  // A pending New role is in the asks already, and an approved one through the seat it made.
  const counted =
    PENDING_REQUEST_STATES.includes(q.state) || (APPROVED_REQUEST_STATES.includes(q.state) && q.seat != null)
  return h.asks + (counted ? 0 : 1) > h.budget
}

/** The chain (10.2) for a request, as roles and approvers in order. */
export function chainOf(w: World, q: RequestPlan): { role: StepRole; approver: number }[] {
  const d = q.submitted ?? q.updated
  const requester = q.requester
  const reqSeat = w.people[requester].seat
  const steps: { role: StepRole; approver: number; rank: number }[] = []
  const light = q.type === 'Start recruiting' || q.type === 'Start date'
  if (!light && reqSeat != null) {
    let m = holderAbove(w, reqSeat, d)
    while (m && m.person === requester) m = holderAbove(w, m.seat, d)
    if (m) steps.push({ role: 'Manager', approver: m.person, rank: 1 })
  }
  const fromBu = q.transfer ? w.seats[q.transfer.from].bu : q.bu
  const toBu =
    q.transfer?.to != null
      ? w.seats[q.transfer.to].bu
      : q.transfer?.toManager != null
        ? w.seats[q.transfer.toManager].bu
        : fromBu
  const crossUnit = q.type === 'Transfer' && toBu !== fromBu
  steps.push({ role: 'HRBP', approver: w.hrbp.get(fromBu)!, rank: 2 })
  if (crossUnit) steps.push({ role: 'HRBP', approver: w.hrbp.get(toBu)!, rank: 3 })
  if (crossUnit) {
    for (const bu of [fromBu, toBu]) {
      const top = holderOn(w, w.execs.get(UNIT_LEADER[bu])!, d)
      if (top != null) steps.push({ role: 'Leader', approver: top, rank: 4 })
    }
  } else if (!light && q.type !== 'Transfer') {
    const seat = q.seat != null ? w.seats[q.seat] : null
    const level = q.level ?? seat?.level ?? 'P3'
    const site = q.site ?? seat?.site ?? 'San Jose'
    const band = bandEstimateUsd(level, site, q.fte ?? seat?.fte ?? 1)
    if (band > LEADER_THRESHOLD_USD || isLeaderLevel(level) || outOfPlan(w, q)) {
      const leader = leaderAbove(w, orgSeat(q), d, requester)
      if (leader != null) steps.push({ role: 'Leader', approver: leader, rank: 4 })
    }
  }
  if (!light && (q.type === 'New role' || q.exception)) {
    const fpa = w.seats.find((s) => s.tags.has(FINANCE_APPROVER))!
    steps.push({ role: 'Finance', approver: holderOn(w, fpa.idx, d)!, rank: 5 })
  }
  // One person on two steps keeps the higher step only; no one approves their own request.
  const out: { role: StepRole; approver: number }[] = []
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (s.approver === requester) continue
    if (steps.some((t, j) => j > i && t.approver === s.approver)) continue
    out.push({ role: s.role, approver: s.approver })
  }
  return out
}

/** Decisions on each step for the request's state, dated between submit and the last update. */
export function planSteps(w: World, rng: Rng): void {
  for (const q of w.requests) {
    if (q.state === 'Draft' || q.state === 'Expired') {
      q.steps = []
      continue
    }
    const chain = chainOf(w, q)
    const sub = q.submitted ?? q.updated
    const last = q.decided ?? q.updated
    let waiting = chain.length
    if (q.state === 'Submitted') waiting = 0
    else if (q.state === 'In review' || q.state === 'Sent back') {
      // The step waited on: the first of its role, or the second (the receiving HRBP of a cross-unit move).
      const of = chain.flatMap((s, i) => (s.role === q.waitingOn ? [i] : []))
      const i = q.tags.has('cross-unit-move') ? (of[1] ?? of[0]) : of[0]
      waiting = i ?? Math.min(1, chain.length - 1)
    } else if (q.state === 'Rejected' || q.state === 'Withdrawn') waiting = Math.max(0, chain.length - 1)
    const steps: StepPlan[] = []
    const span = Math.max(0, last - sub)
    for (let i = 0; i < chain.length; i++) {
      let decision: StepDecision = 'Pending'
      let at: Day | null = null
      if (i < waiting) {
        decision = 'Approved'
        at = sub + Math.round(((i + 1) * span) / (waiting + (q.state === 'Approved' ? 0 : 1)))
      } else if (i === waiting) {
        if (q.state === 'Rejected') decision = 'Rejected'
        else if (q.state === 'Sent back') decision = 'Sent back'
        if (decision !== 'Pending') at = last
      }
      if (at != null && at > last) at = last
      steps.push({ role: chain[i].role, approver: chain[i].approver, decision, at })
    }
    q.steps = steps
    q.minute = 8 * 60 + rng.int(0, 9 * 60)
  }
}

/* ───────────────────────── rows ───────────────────────── */

const stepRow = (w: World, s: StepPlan): StepRow => ({
  role: s.role,
  approverId: w.people[s.approver].id,
  decision: s.decision,
  at: isoOrNull(s.at),
})

/** The rows, in request ID order (IDs assigned by base.ts in submitted order). */
export function requestRows(w: World): RequestRow[] {
  const out: RequestRow[] = []
  const id = (seat: number | null | undefined) => (seat == null ? null : w.seats[seat].id)
  for (const q of w.requests.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const seat = q.seat != null ? w.seats[q.seat] : null
    const x = q.transfer
    const dept = q.dept ?? seat?.dept ?? null
    const site = q.site ?? seat?.site ?? null
    const updatedDay = q.updated
    out.push({
      requestId: q.id,
      type: q.type,
      state: q.state,
      reasonCode: q.reason,
      requesterId: w.people[q.requester].id,
      submittedById:
        q.submittedBy != null
          ? w.people[q.submittedBy].id
          : q.submitted != null
            ? w.people[q.requester].id
            : null,
      submittedAt: q.submitted != null ? isoAt(q.submitted, q.minute) : null,
      updatedAt: isoAt(updatedDay, Math.min(23 * 60 + 59, q.minute + (updatedDay === q.submitted ? 0 : 47))),
      positionId: q.type === 'New role' ? null : id(q.seat),
      businessUnit: q.bu,
      department: dept,
      costCenter: dept && site ? costCenter(dept, site) : seat ? seatCostCenter(seat) : null,
      managerPositionId:
        x?.kind === 'Position move' && x.toManager != null
          ? id(x.toManager)
          : x?.to != null
            ? id(w.seats[x.to].mgr)
            : id(q.mgrSeat),
      level: q.level,
      location: site,
      jobTitle: q.title,
      fte: q.fte,
      startDate: isoOrNull(q.start),
      priority: q.priority,
      cycleId: q.cycleId,
      steps: q.steps.length ? q.steps.map((s) => stepRow(w, s)) : null,
      confidential: q.confidential ? true : null,
      exception: q.exception ? true : null,
      transferKind: x ? x.kind : null,
      personId: x ? w.people[x.person].id : null,
      fromPositionId: x ? id(x.from) : null,
      toManagerPositionId: x ? id(x.toManager) : null,
      toPositionId: x ? id(x.to) : null,
      effectiveDate: x ? iso(x.effective) : null,
      moveBudget: x ? x.moveBudget : null,
    })
  }
  return out
}

/**
 * A request row as it stood on day d: null when it was not raised yet (submitted, or for a draft
 * last updated, after d); a step decided after d reads Pending, and a request decided after d reads
 * In review (Submitted when no step was decided yet).
 */
export function requestAsKnownOn(row: RequestRow, d: ISODate): RequestRow | null {
  const raised = row.submittedAt ? row.submittedAt.slice(0, 10) : (row.updatedAt ?? '').slice(0, 10)
  if (!raised || raised > d) return null
  const updated = (row.updatedAt ?? '').slice(0, 10)
  if (updated <= d) return row
  const steps = (row.steps ?? []).map((s) =>
    s.at && s.at > d ? { ...s, decision: 'Pending' as const, at: null } : s,
  )
  const anyDecided = steps.some((s) => s.decision !== 'Pending')
  const state: RequestState =
    row.state === 'Draft' || row.state === 'Expired' ? 'Draft' : anyDecided ? 'In review' : 'Submitted'
  return { ...row, state, steps: row.steps ? steps : null, updatedAt: row.submittedAt ?? row.updatedAt }
}
