/**
 * Seats and their history (docs/PLAN.md 13.1): the effective-dated rows of every position from
 * 1 Apr 2025, who held each seat when, and every seat that is not Filled on 30 Sep 2026. Draws from the
 * `positions` stream only.
 *
 * Starting from `buildOrg`'s 1,450 Filled seats, each seat gets a history: tenured (held since before
 * 1 Apr 2025, maybe promoted on 1 Oct 2025), backfilled (a leaver, then today's holder) or grown (a
 * seat created before the Budget lock and filled since). Then the 200 other seats are added: 100 Open,
 * 60 Planned, 15 On hold and 25 Eliminated on 30 Sep 2026, the planted story seats among them.
 *
 * The rules that keep the stories exact (13.1 and 13.4), each enforced where the seats are made:
 *  - In Go-to-Market, Silicon Engineering, Munich and Haifa ("story orgs") actual heads at 30 Sep match
 *    the Budget's plan heads at Sep month-end seat by seat, except story 1's 8 early starts and story
 *    2's 10 late Bengaluru seats. So: every exit there with a last day from the lock (20 Mar 2026) to
 *    29 Sep 2026 is backfilled into the same seat by 30 Sep, and its notice comes after the lock (the
 *    Budget never saw it); a seat grown there is created before the lock and planned to start on or
 *    before its actual start, which is by 30 Sep; every other opening there is planned to start after
 *    30 Sep or was created after the lock; nothing there is eliminated or put On hold after the lock.
 *  - Corporate (story 4): its only unstarted seats on 30 Sep are 3 Open seats with reqs in
 *    Interviewing and 1 with an accepted offer; its other exits are backfilled by 31 Jul 2026.
 *  - 1550-HSZ (story 8) holds the same 3 people all year; the Executive Office never changes.
 *  - Every opening's planned start is on or before 31 Mar 2027, so the 1,610 seats that are Filled,
 *    Open or Planned on 30 Sep are all approved heads.
 *  - Story 9's headroom: before the Q1 Reforecast lock, `addEliminations` eliminates Systems & Software
 *    Budget seats (Planned, starting after 31 Oct 2026, none in Munich or Haifa) until the unit's FY27
 *    asks at 31 Mar 2027 are exactly 8 heads under its Budget heads (its FY27 target).
 *
 * Every row records the day it was known (`RowEvent.known`), so a lock "as of" its date reads the
 * seats as they stood then (`asKnownOn` in base.ts).
 */
import { type Level, PENDING_REQUEST_STATES, type PositionStatus } from '../schema'
import {
  BUDGET_LOCK,
  type Day,
  day,
  FOUNDED,
  FY27_END,
  fridayOnOrBefore,
  HISTORY_START,
  mondayOnOrBefore,
  nextMonday,
  PROMOTION_DAY,
} from './calendar'
import {
  CORP,
  costCenter,
  DEPTS,
  deptSpec,
  EO,
  GTM,
  type IcLevel,
  isStoryOrg,
  mainSite,
  OPS,
  SE,
  SS,
} from './departments'
import type { NameBook } from './names'
import {
  drawIcLevel,
  holderOn,
  icRole,
  managerOn,
  newPerson,
  newReq,
  newRequest,
  newSeat,
  type Person,
  type ReqPlan,
  type RequestPlan,
  type RowEvent,
  type Seat,
  titleAtLevel,
  type World,
} from './org'
import type { Rng } from './prng'

/* ───────────────────────── counts and dates ───────────────────────── */

/** Seats by derived status on 30 Sep 2026 (docs/PLAN.md 13.1). */
export const SEAT_COUNTS = { Filled: 1_450, Open: 100, Planned: 60, 'On hold': 15, Eliminated: 25 } as const

/** Open seats by unit (Corporate's 4 fixed by story 4) and Planned and On hold seats by unit. */
const OPEN_BY_UNIT: Readonly<Record<string, number>> = { [SE]: 30, [SS]: 28, [OPS]: 20, [GTM]: 18, [CORP]: 4 }
const PLANNED_BY_UNIT: Readonly<Record<string, number>> = { [SE]: 18, [SS]: 16, [OPS]: 10, [GTM]: 16 }
const ON_HOLD_BY_UNIT: Readonly<Record<string, number>> = { [SS]: 9, [OPS]: 6 }

/** Story 9: S&S's FY27 asks at 31 Mar 2027 sit exactly this many heads under its target. */
export const SS_HEADROOM = 8

/** Chance a Filled seat was grown in the window, or saw a leaver and a backfill, by unit. */
const P_GROWTH: Readonly<Record<string, number>> = {
  [SE]: 0.08,
  [SS]: 0.05,
  [OPS]: 0.04,
  [GTM]: 0.06,
  [CORP]: 0.02,
}
const P_BACKFILL: Readonly<Record<string, number>> = {
  [SE]: 0.08,
  [SS]: 0.14,
  [OPS]: 0.14,
  [GTM]: 0.14,
  [CORP]: 0.1,
}
/** Chance a tenured individual contributor was promoted on 1 Oct 2025. */
const P_PROMOTION = 0.07

/** The last day a backfill may start: 28 Sep 2026 (a Monday), 27 Jul 2026 in Corporate (story 4). */
const LAST_START = day('2026-09-28')
const LAST_CORP_START = day('2026-07-27')
const FIRST_FY27_OPEN_START = day('2026-10-05')
const LAST_PLANNED_START = day('2027-03-29')

/* ───────────────────────── helpers ───────────────────────── */

interface Ctx {
  w: World
  rng: Rng
  names: NameBook
}

export const seatCostCenter = (s: Seat): string => costCenter(s.dept, s.site)
const PERSONA_TEAMS = ['manager-a', 'manager-b', 'manager-c', 'manager-c-sub']
const inPersonaTeam = (s: Seat): boolean =>
  [...s.tags].some((t) => PERSONA_TEAMS.some((p) => t.startsWith(p)))
const storyOrg = (s: Seat): boolean => isStoryOrg(s.bu, s.site)
const MUC_HFA = new Set(['Munich', 'Haifa'])

function addRow(s: Seat, from: Day, status: PositionStatus, over: Partial<RowEvent> = {}): RowEvent {
  const r: RowEvent = {
    from,
    status,
    level: s.level,
    title: s.title,
    startDate: null,
    openedDate: null,
    reqType: null,
    endDate: null,
    endReason: null,
    request: null,
    known: from,
    ...over,
  }
  s.rows.push(r)
  return r
}

/** A Monday in [lo, hi]. */
function mondayIn(rng: Rng, lo: Day, hi: Day): Day {
  const d = nextMonday(rng.int(lo, hi))
  return d > hi ? mondayOnOrBefore(hi) : d
}

/** A Friday in [lo, hi] (the range spans a week or more). */
function fridayIn(rng: Rng, lo: Day, hi: Day): Day {
  const d = fridayOnOrBefore(rng.int(lo, hi))
  return d < lo ? d + 7 : d
}

/** A leaver who held seat `s` until `exit` (notice on `notice`), hired before the window opened. */
function leaver(ctx: Ctx, s: Seat, exit: Day, notice: Day): Person {
  const p = newPerson(ctx.w, {
    name: ctx.names.name(s.site),
    bu: s.bu,
    dept: s.dept,
    site: s.site,
    level: s.level,
    title: s.title,
    seat: s.idx,
  })
  const years = ctx.rng.float(0.6, 7)
  p.hire = Math.max(FOUNDED, mondayOnOrBefore(HISTORY_START - 1 - Math.round(years * 365)))
  p.term = exit
  p.termKnown = notice
  p.tags.add('leaver')
  return p
}

/** Manager seats in a department at a site (persona and planted teams left out), else the department's. */
function pickManager(ctx: Ctx, dept: string, site: string): Seat {
  const { w, rng } = ctx
  const ok = (s: Seat) =>
    s.role === 'manager' && s.dept === dept && !inPersonaTeam(s) && !s.tags.has('raised-to-m2')
  let ms = w.seats.filter((s) => ok(s) && s.site === site)
  if (!ms.length) ms = w.seats.filter((s) => ok(s) && s.site === mainSite(dept))
  if (!ms.length) ms = w.seats.filter(ok)
  if (!ms.length) ms = w.seats.filter((s) => s.dept === dept && s.role === 'director')
  return rng.pick(ms)
}

interface SeatInit {
  mgr?: Seat
  level?: Level
  title?: string
  family?: string
  tag?: string
}

/** A new individual-contributor seat (no rows yet) in a department at a site. */
function openingSeat(ctx: Ctx, dept: string, site: string, init: SeatInit = {}): Seat {
  const { w, rng } = ctx
  const spec = deptSpec(dept)
  const mgr = init.mgr ?? pickManager(ctx, dept, site)
  let level: Level
  let title: string
  let family: string
  if (init.level && init.title) {
    level = init.level
    title = init.title
    family = init.family ?? spec.name
  } else {
    const r = icRole(spec, (init.level as IcLevel | undefined) ?? drawIcLevel(spec, site, rng), rng)
    level = r.level
    title = r.title
    family = r.family
  }
  const s = newSeat(w, { bu: spec.bu, dept, site, level, title, family, mgr: mgr.idx, role: 'ic' })
  if (init.tag) s.tags.add(init.tag)
  return s
}

/** The person who raises a request for a seat under `mgr` on day d: the manager seat's holder, else the nearest above. */
function requesterFor(w: World, mgr: number, d: Day): number {
  return holderOn(w, mgr, d) ?? managerOn(w, mgr, d)!.person
}

/** An approved New role that created seat `s` on day `created` (the seat's first row). */
function approvedNewRole(ctx: Ctx, s: Seat, created: Day, start: Day): RequestPlan {
  const { w, rng } = ctx
  const r = newRequest(w, {
    type: 'New role',
    state: 'Approved',
    reason: rng.chance(0.7) ? 'Growth' : 'New capability',
    requester: requesterFor(w, s.mgr!, created),
    mgrSeat: s.mgr!,
    bu: s.bu,
    dept: s.dept,
    site: s.site,
    level: s.level,
    title: s.title,
    fte: s.fte,
    start,
    seat: s.idx,
    submitted: created - rng.int(8, 21),
    updated: created,
    decided: created,
  })
  r.tags.add('creates-seat')
  return r
}

/* ───────────────────────── seat shapes ───────────────────────── */

/**
 * A new seat opened for recruiting: Planned from `created` while the req is not open yet, Open from
 * `opened` (its openedDate), planned to start on `start`. `req` adds the requisition.
 */
function shapeNew(
  ctx: Ctx,
  s: Seat,
  created: Day,
  opened: Day,
  start: Day,
  req: (Pick<ReqPlan, 'status'> & Partial<ReqPlan>) | null,
  request: RequestPlan | null = null,
): void {
  s.created = created
  const source = request?.idx ?? null
  if (opened > created) {
    addRow(s, created, 'Planned', { startDate: start, reqType: 'New', request: source })
    addRow(s, opened, 'Open', { startDate: start, openedDate: opened, reqType: 'New' })
  } else
    addRow(s, created, 'Open', { startDate: start, openedDate: created, reqType: 'New', request: source })
  if (req) newReq(ctx.w, { seat: s.idx, type: 'New', opened, target: start, ...req })
}

/** A seat held since before the window by a leaver whose last day is `exit`, Open from the day after. */
function shapeVacated(ctx: Ctx, s: Seat, exit: Day, notice: Day): Person {
  s.created = HISTORY_START
  const p = leaver(ctx, s, exit, notice)
  s.stints.push({ person: p.idx, start: p.hire, end: exit })
  addRow(s, HISTORY_START, 'Filled')
  addRow(s, exit + 1, 'Open', { openedDate: exit + 1, reqType: 'Backfill' })
  return p
}

/** Planned from `created`, planned to start on `start`. */
function shapePlanned(s: Seat, created: Day, start: Day, request: RequestPlan | null = null): void {
  s.created = created
  addRow(s, created, 'Planned', { startDate: start, reqType: 'New', request: request?.idx ?? null })
}

/* ───────────────────────── today's Filled seats: their history ───────────────────────── */

/** Seats whose history never changes: leaders, the Executive Office, 1550-HSZ, persona teams, named people. */
function stableSeats(w: World): Set<number> {
  const people = new Set<number>([
    ...w.named.values(),
    ...w.hrbp.values(),
    ...w.recruiters.map((r) => r.person),
  ])
  const out = new Set<number>()
  for (const s of w.seats) {
    const holder = s.stints[0]?.person
    if (
      s.role === 'exec' ||
      s.role === 'director' ||
      s.bu === EO ||
      seatCostCenter(s) === '1550-HSZ' ||
      inPersonaTeam(s) ||
      (holder != null && people.has(holder))
    )
      out.add(s.idx)
  }
  return out
}

function tenured(s: Seat): void {
  s.created = HISTORY_START
  addRow(s, HISTORY_START, 'Filled')
}

/** A seat created before the lock and filled on `hire` (planned for `plannedStart`). */
function grown(
  ctx: Ctx,
  s: Seat,
  opts: { created: Day; hire: Day; plannedStart: Day; opened: Day; accepted: Day },
): void {
  const holder = s.stints[0].person
  s.created = opts.created
  if (opts.opened > opts.created)
    addRow(s, opts.created, 'Planned', { startDate: opts.plannedStart, reqType: 'New' })
  addRow(s, Math.max(opts.opened, opts.created), 'Open', {
    startDate: opts.plannedStart,
    openedDate: Math.max(opts.opened, opts.created),
    reqType: 'New',
  })
  addRow(s, opts.hire, 'Filled')
  s.stints[0].start = opts.hire
  ctx.w.people[holder].hire = opts.hire
  newReq(ctx.w, {
    seat: s.idx,
    status: 'Filled',
    stage: 'Started',
    type: 'New',
    opened: Math.max(opts.opened, opts.created),
    target: opts.plannedStart,
    accepted: opts.accepted,
    start: opts.hire,
    closed: opts.hire,
    hire: holder,
  })
}

function growth(ctx: Ctx, s: Seat): void {
  const { rng } = ctx
  const corp = s.bu === CORP
  let hire = mondayIn(rng, day('2025-06-02'), corp ? LAST_CORP_START : LAST_START)
  let created = Math.max(HISTORY_START + 7, hire - rng.int(60, 150))
  // Every grown seat was created before the Budget lock (13.1 (c) in the story orgs; plan data elsewhere).
  if (created > BUDGET_LOCK - 7) created = BUDGET_LOCK - rng.int(7, 60)
  if (hire < created + 30) hire = nextMonday(created + 30)
  const opened = Math.max(created, hire - rng.int(50, 100))
  const accepted = Math.min(hire - 1, Math.max(opened + 10, hire - rng.int(14, 35)))
  grown(ctx, s, { created, hire, plannedStart: hire, opened, accepted })
}

/** Story 1: planned (in the Budget) to start October to March, started June to August. */
function earlyStart(ctx: Ctx, s: Seat): void {
  const { rng } = ctx
  const created = mondayIn(rng, day('2025-12-01'), day('2026-03-02'))
  const plannedStart = mondayIn(rng, FIRST_FY27_OPEN_START, day('2027-03-01'))
  const hire = mondayIn(rng, day('2026-06-01'), day('2026-08-31'))
  const opened = mondayIn(rng, day('2026-04-06'), hire - 45)
  const accepted = mondayIn(rng, opened + 14, hire - 14)
  grown(ctx, s, { created, hire, plannedStart, opened, accepted })
  s.tags.add('early-start')
}

function backfilled(ctx: Ctx, s: Seat): void {
  const { w, rng } = ctx
  const corp = s.bu === CORP
  const story = storyOrg(s)
  let exit = fridayIn(rng, day('2025-05-02'), corp ? day('2026-05-29') : day('2026-09-04'))
  const gap = story && exit >= BUDGET_LOCK ? rng.int(7, 21) : rng.int(14, 60)
  let start = nextMonday(exit + gap)
  const cap = corp ? LAST_CORP_START : LAST_START
  if (start > cap) {
    start = mondayOnOrBefore(cap)
    exit = fridayOnOrBefore(start - 3)
  }
  let notice = exit - rng.int(14, 35)
  // A story-org exit after the lock was not known to the Budget.
  if (story && exit >= BUDGET_LOCK && notice <= BUDGET_LOCK) notice = Math.min(exit, BUDGET_LOCK + 1)
  const holder = s.stints[0].person
  const p = leaver(ctx, s, exit, notice)
  s.created = HISTORY_START
  s.stints = [
    { person: p.idx, start: p.hire, end: exit },
    { person: holder, start, end: null },
  ]
  w.people[holder].hire = start
  addRow(s, HISTORY_START, 'Filled')
  if (start > exit + 1) addRow(s, exit + 1, 'Open', { openedDate: exit + 1, reqType: 'Backfill' })
  addRow(s, start, 'Filled')
  const opened = Math.min(exit, notice + rng.int(0, 5))
  const accepted = Math.min(start - 1, Math.max(opened + 7, start - rng.int(10, 30)))
  newReq(w, {
    seat: s.idx,
    status: 'Filled',
    stage: 'Started',
    type: 'Backfill',
    opened,
    target: start,
    accepted,
    start,
    closed: start,
    hire: holder,
  })
  s.tags.add('backfilled')
}

function promote(ctx: Ctx, s: Seat): void {
  const spec = deptSpec(s.dept)
  const i = ['P2', 'P3', 'P4', 'P5', 'P6'].indexOf(s.level)
  if (i < 0) return
  const from = (['P1', 'P2', 'P3', 'P4', 'P5'] as const)[i]
  s.rows = []
  addRow(s, HISTORY_START, 'Filled', { level: from, title: titleAtLevel(spec, s.title, from) })
  addRow(s, PROMOTION_DAY, 'Filled')
  ctx.w.people[s.stints[0].person].promotedFrom = from
}

/* ───────────────────────── the build ───────────────────────── */

export interface PositionsResult {
  /** Seats whose history never changes (leaders, the Executive Office, 1550-HSZ, persona teams, named people). */
  stableSeats: ReadonlySet<number>
}

/**
 * Histories for today's Filled seats and every other seat but the eliminated ones, which
 * `addEliminations` adds once the requests are planned (story 9 depends on them).
 */
export function buildPositions(w: World, rng: Rng, names: NameBook): PositionsResult {
  const ctx: Ctx = { w, rng, names }
  const stable = stableSeats(w)
  const filled = w.seats.slice()

  // Reserved seats for planted shapes, drawn first so the generic draws below never move them.
  const free = (s: Seat) => !stable.has(s.idx) && s.role === 'ic'
  const early = rng.sample(
    filled.filter((s) => free(s) && s.bu === GTM && !MUC_HFA.has(s.site)),
    8,
  )
  const receiving = rng.pick(filled.filter((s) => free(s) && s.dept === 'Software' && s.site === 'San Jose'))
  const tpeSites = ['Hsinchu', 'Shanghai', 'San Jose'].filter(
    (site) =>
      filled.filter((s) => s.dept === 'Test & Product Engineering' && s.site === site && s.role === 'manager')
        .length >= 2,
  )
  const moveSite = tpeSites[0]
  const mover = rng.pick(
    filled.filter((s) => free(s) && s.dept === 'Test & Product Engineering' && s.site === moveSite),
  )
  const pdManagers = filled.filter(
    (s) =>
      s.role === 'manager' &&
      s.dept === 'Physical Design' &&
      s.site === 'Austin' &&
      !stable.has(s.idx) &&
      filled.filter((r) => r.mgr === s.idx && r.role === 'ic').length >= 6,
  )
  const splitFrom = rng.pick(pdManagers)
  const reserved = new Set<number>([...early.map((s) => s.idx), receiving.idx, mover.idx])

  for (const s of early) earlyStart(ctx, s)
  for (const s of filled) {
    if (reserved.has(s.idx)) continue
    if (stable.has(s.idx)) {
      tenured(s)
      continue
    }
    const r = rng.next()
    const g = P_GROWTH[s.bu] ?? 0
    const b = P_BACKFILL[s.bu] ?? 0
    if (s.role === 'ic' && r < g) growth(ctx, s)
    else if (r < g + b) backfilled(ctx, s)
    else {
      tenured(s)
      if (s.role === 'ic' && rng.chance(P_PROMOTION)) promote(ctx, s)
    }
  }

  // Part-timers (13.1): Munich 8, Haifa 5, Toronto 4, San Jose 3 at 0.5, 0.6 or 0.8 FTE, all tenured.
  const tenuredIc = (s: Seat) =>
    free(s) &&
    !reserved.has(s.idx) &&
    s.rows.length >= 1 &&
    s.rows.every((r) => r.status === 'Filled') &&
    s.stints.length === 1
  for (const [site, n] of [
    ['Munich', 8],
    ['Haifa', 5],
    ['Toronto', 4],
    ['San Jose', 3],
  ] as const) {
    for (const s of rng.sample(
      filled.filter((x) => tenuredIc(x) && x.site === site && x.bu !== CORP),
      n,
    )) {
      s.fte = rng.pick([0.5, 0.6, 0.8])
      s.tags.add('part-time')
    }
  }

  // The position move (approved, Operations): the seat moves to another manager at its site on 3 Aug 2026.
  tenured(mover)
  const newMgr = rng.pick(
    filled.filter(
      (s) =>
        s.role === 'manager' &&
        s.dept === 'Test & Product Engineering' &&
        s.site === moveSite &&
        s.idx !== mover.mgr,
    ),
  )
  const moveDay = day('2026-08-03')
  const moveApproved = day('2026-07-22')
  const oldMgr = mover.mgr!
  const move = newRequest(w, {
    type: 'Transfer',
    state: 'Approved',
    reason: 'Restructure',
    requester: requesterFor(w, oldMgr, moveApproved),
    mgrSeat: oldMgr,
    bu: OPS,
    dept: mover.dept,
    site: mover.site,
    level: mover.level,
    title: mover.title,
    seat: mover.idx,
    start: moveDay,
    submitted: day('2026-07-13'),
    updated: moveApproved,
    decided: moveApproved,
    transfer: {
      kind: 'Position move',
      person: mover.stints[0].person,
      from: mover.idx,
      toManager: newMgr.idx,
      to: null,
      effective: moveDay,
      moveBudget: false,
    },
  })
  move.tags.add('position-move')
  mover.rows[0].mgr = oldMgr
  addRow(mover, moveDay, 'Filled', { known: moveApproved, request: move.idx })
  mover.mgr = newMgr.idx
  mover.tags.add('position-move')

  // The internal move (approved, Systems & Software): the holder of seat A moves into the Open seat
  // `receiving` on 1 Jul 2026, and A goes On hold until it is backfilled or eliminated.
  {
    const p = receiving.stints[0].person
    const moveOn = day('2026-07-01')
    const approved = day('2026-06-10')
    const from = openingSeat(ctx, 'Software', 'San Jose', {
      level: receiving.level,
      title: receiving.title,
      family: receiving.family,
      tag: 'internal-move-from',
    })
    from.created = HISTORY_START
    from.stints = [{ person: p, start: -1, end: moveOn - 1, endKnown: approved }]
    const req = newRequest(w, {
      type: 'Transfer',
      state: 'Approved',
      reason: 'Other',
      requester: requesterFor(w, from.mgr!, approved),
      mgrSeat: from.mgr!,
      bu: SS,
      dept: from.dept,
      site: from.site,
      level: from.level,
      title: from.title,
      seat: from.idx,
      start: moveOn,
      submitted: day('2026-06-01'),
      updated: approved,
      decided: approved,
      transfer: {
        kind: 'Internal move',
        person: p,
        from: from.idx,
        toManager: null,
        to: receiving.idx,
        effective: moveOn,
        moveBudget: false,
      },
    })
    req.tags.add('internal-move')
    addRow(from, HISTORY_START, 'Filled')
    addRow(from, moveOn, 'On hold', { known: approved, request: req.idx })
    receiving.created = day('2025-11-03')
    receiving.stints[0].start = moveOn
    addRow(receiving, receiving.created, 'Planned', { startDate: day('2026-07-06'), reqType: 'New' })
    addRow(receiving, day('2026-03-02'), 'Open', {
      startDate: day('2026-07-06'),
      openedDate: day('2026-03-02'),
      reqType: 'New',
    })
    addRow(receiving, moveOn, 'Filled', { known: approved, request: req.idx })
    receiving.tags.add('internal-move-to')
    w.people[p].tags.add('internal-mover')
  }

  // Story-free shape for the 7.3(d) partition change: an Open manager seat in Physical Design (Austin),
  // vacated on 27 Feb 2026, with 3 of a neighbouring team's people reporting to it, raised to M2 on
  // 10 Sep 2026 before the 30 Sep close.
  {
    const spec = deptSpec('Physical Design')
    const m = newSeat(w, {
      bu: SE,
      dept: spec.name,
      site: 'Austin',
      level: 'M1',
      title: spec.manager,
      family: spec.name,
      mgr: splitFrom.mgr,
      role: 'manager',
    })
    m.tags.add('raised-to-m2')
    const reports = filled.filter((r) => r.mgr === splitFrom.idx && r.role === 'ic').slice(0, 3)
    for (const r of reports) r.mgr = m.idx
    const exit = day('2026-02-27')
    shapeVacated(ctx, m, exit, day('2026-02-06'))
    addRow(m, day('2026-09-10'), 'Open', {
      level: 'M2',
      title: 'Director, Physical Design Methodology',
      openedDate: exit + 1,
      reqType: 'Backfill',
    })
    m.level = 'M2'
    m.title = 'Director, Physical Design Methodology'
    newReq(w, {
      seat: m.idx,
      status: 'Open',
      stage: 'Interviewing',
      type: 'Backfill',
      opened: day('2026-06-15'),
      target: day('2027-01-04'),
    })
  }

  plantOpenings(ctx)
  fillOpenings(ctx)
  return { stableSeats: stable }
}

/* ───────────────────────── planted openings (13.3, 13.4) ───────────────────────── */

function plantOpenings(ctx: Ctx): void {
  const { w, rng } = ctx
  const bySite = (dept: string, site: string) => pickManager(ctx, dept, site)

  // Story 4: Corporate's four unstarted seats.
  {
    const it1 = openingSeat(ctx, 'IT', 'San Jose', { tag: 'corp-interviewing' })
    shapeVacated(ctx, it1, day('2026-06-12'), day('2026-05-22'))
    newReq(w, {
      seat: it1.idx,
      status: 'Open',
      stage: 'Interviewing',
      type: 'Backfill',
      opened: day('2026-06-01'),
      target: day('2026-10-19'),
    })
    const it2 = openingSeat(ctx, 'IT', 'Bengaluru', { tag: 'corp-interviewing' })
    shapeNew(ctx, it2, day('2026-02-02'), day('2026-07-06'), day('2026-11-02'), {
      status: 'Open',
      stage: 'Interviewing',
    })
    const fac = openingSeat(ctx, 'Facilities', 'San Jose', { tag: 'corp-interviewing' })
    shapeNew(ctx, fac, day('2026-01-12'), day('2026-06-22'), day('2026-10-05'), {
      status: 'Open',
      stage: 'Interviewing',
    })
    const fin = openingSeat(ctx, 'Finance', 'San Jose', { tag: 'corp-offer' })
    shapeVacated(ctx, fin, day('2026-05-15'), day('2026-04-24'))
    const offer = newReq(w, {
      seat: fin.idx,
      status: 'Open',
      stage: 'Offer accepted',
      type: 'Backfill',
      opened: day('2026-05-04'),
      target: day('2026-10-19'),
      accepted: day('2026-07-20'),
      start: day('2026-10-19'),
      oneTime: 'sign-on-agency',
    })
    offer.tags.add('corp-offer')
  }

  // Story 2: 10 late Bengaluru seats in Silicon Engineering (5 in 1130-BLR, 3 in 1140-BLR, 2 in 1160-BLR),
  // Budget openings planned to start July to mid-September, still Open past their target start.
  for (const [dept, n] of [
    ['Design Verification', 5],
    ['Physical Design', 3],
    ['DFT', 2],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const s = openingSeat(ctx, dept, 'Bengaluru', { tag: 'late-blr' })
      const created = mondayIn(rng, day('2025-11-03'), day('2026-02-23'))
      const start = mondayIn(rng, day('2026-07-06'), day('2026-09-14'))
      const opened = Math.max(created, mondayIn(rng, start - 120, start - 60))
      shapeNew(ctx, s, created, opened, start, {
        status: 'Open',
        stage: rng.chance(0.7) ? 'Interviewing' : 'Req opened',
      })
    }
  }

  // Story 2: 6 Hsinchu offers 25 to 30% above midpoint, with sign-on, relocation and agency fees,
  // starting October to December (Budget openings planned after September).
  for (const dept of [
    'Design Verification',
    'Design Verification',
    'Physical Design',
    'Physical Design',
    'Analog & Mixed-Signal',
    'DFT',
  ]) {
    const level: IcLevel = rng.chance(0.5) ? 'P4' : 'P5'
    const s = openingSeat(ctx, dept, 'Hsinchu', { level, tag: 'hsinchu-offer' })
    const created = mondayIn(rng, day('2025-12-01'), day('2026-03-02'))
    const start = mondayIn(rng, FIRST_FY27_OPEN_START, day('2026-12-07'))
    const opened = mondayIn(rng, day('2026-04-06'), day('2026-06-15'))
    const accepted = mondayIn(rng, Math.max(opened + 21, day('2026-07-06')), day('2026-09-21'))
    shapeNew(ctx, s, created, opened, start, {
      status: 'Open',
      stage: 'Offer accepted',
      accepted,
      start,
      offerFactor: rng.float(1.255, 1.295),
      oneTime: 'all',
    })
  }

  // Manager A (Sales, Munich): an Open seat (Budget opening, target 2 Nov 2026) and the planted Munich
  // P4, approved 10 Jun 2026 after the Budget lock, planned to start 16 Sep 2026, no req or hire.
  {
    const a = w.seats.find((s) => s.tags.has('manager-a'))!
    const open = openingSeat(ctx, 'Sales', 'Munich', { mgr: a, level: 'P3', tag: 'manager-a-open' })
    shapeNew(ctx, open, day('2026-02-16'), day('2026-08-03'), day('2026-11-02'), {
      status: 'Open',
      stage: 'Interviewing',
    })
    const p4 = openingSeat(ctx, 'Sales', 'Munich', {
      mgr: a,
      level: 'P4',
      title: 'Senior Account Manager',
      family: 'Sales',
      tag: 'munich-p4',
    })
    const approved = day('2026-06-10')
    const req = approvedNewRole(ctx, p4, approved, day('2026-09-16'))
    req.tags.add('munich-p4')
    shapePlanned(p4, approved, day('2026-09-16'), req)
  }

  // Manager B (Quality & Reliability, San Jose): 3 Filled + 2 Open seats. The seat left on 19 Jun has an
  // accepted offer (from 2 Nov), so the leak tests can move an offerBase inside B's team (16.1).
  {
    const b = w.seats.find((s) => s.tags.has('manager-b'))!
    const vac = openingSeat(ctx, 'Quality & Reliability', 'San Jose', { mgr: b, tag: 'manager-b-open' })
    shapeVacated(ctx, vac, day('2026-06-19'), day('2026-05-29'))
    newReq(w, {
      seat: vac.idx,
      status: 'Open',
      stage: 'Offer accepted',
      type: 'Backfill',
      opened: day('2026-06-08'),
      target: day('2026-10-12'),
      accepted: day('2026-09-14'),
      start: day('2026-11-02'),
    })
    const add = openingSeat(ctx, 'Quality & Reliability', 'San Jose', { mgr: b, tag: 'manager-b-open' })
    shapeNew(ctx, add, day('2026-01-20'), day('2026-08-17'), day('2026-11-16'), {
      status: 'Open',
      stage: 'Req opened',
    })
  }

  // Start recruiting (approved 21 Aug 2026, the F3 shape): a Planned seat in Operations made Open.
  {
    const s = openingSeat(ctx, 'Test & Product Engineering', 'Hsinchu', { tag: 'start-recruiting' })
    const approved = day('2026-08-21')
    s.created = day('2026-01-12')
    addRow(s, s.created, 'Planned', { startDate: day('2026-10-05'), reqType: 'New' })
    const req = newRequest(w, {
      type: 'Start recruiting',
      state: 'Approved',
      reason: 'Growth',
      requester: requesterFor(w, s.mgr!, approved),
      mgrSeat: s.mgr!,
      bu: OPS,
      dept: s.dept,
      site: s.site,
      level: s.level,
      title: s.title,
      fte: 1,
      seat: s.idx,
      start: day('2026-10-05'),
      submitted: day('2026-08-17'),
      updated: approved,
      decided: approved,
    })
    req.tags.add('start-recruiting')
    addRow(s, approved, 'Open', {
      startDate: day('2026-10-05'),
      openedDate: approved,
      reqType: 'New',
      request: req.idx,
    })
    newReq(w, {
      seat: s.idx,
      status: 'Open',
      stage: 'Req opened',
      type: 'New',
      opened: day('2026-08-24'),
      target: day('2026-10-05'),
    })
  }

  // Story 3: 4 Systems & Software seats left by a known exit in July to September (no req yet), and
  // beside each a new seat under the same manager, created within 30 days of the exit by an approved
  // New role, that a pending Backfill request names.
  {
    const pairs: [string, string][] = [
      ['Software', 'Seattle'],
      ['Firmware', 'Raleigh'],
      ['Systems Validation', 'San Jose'],
      ['Hardware Engineering', 'Boulder'],
    ]
    for (const [dept, site] of pairs) {
      const mgr = bySite(dept, site)
      const x = openingSeat(ctx, dept, site, { mgr, tag: 'story3-exit' })
      const exit = fridayIn(rng, day('2026-07-10'), day('2026-09-04'))
      shapeVacated(ctx, x, exit, exit - rng.int(14, 28))
      const created = Math.min(day('2026-09-21'), exit + rng.int(-20, 25))
      const y = openingSeat(ctx, dept, site, {
        mgr,
        level: x.level,
        title: x.title,
        family: x.family,
        tag: 'story3-new',
      })
      const start = mondayIn(rng, day('2026-11-02'), day('2026-12-14'))
      const nr = approvedNewRole(ctx, y, created, start)
      shapePlanned(y, created, start, nr)
      const submitted = Math.min(day('2026-09-28'), Math.max(created, exit) + rng.int(3, 14))
      const bf = newRequest(w, {
        type: 'Backfill',
        state: rng.chance(0.5) ? 'In review' : 'Submitted',
        reason: 'Attrition backfill',
        requester: requesterFor(w, mgr.idx, submitted),
        mgrSeat: mgr.idx,
        bu: SS,
        dept,
        site,
        level: y.level,
        title: y.title,
        fte: 1,
        seat: y.idx,
        start,
        submitted,
        updated: submitted,
      })
      bf.tags.add('story3-backfill')
    }
  }

  // Story 9's give seat: a Planned P5 San Jose in Systems & Software (a Budget seat, never eliminated).
  {
    const s = openingSeat(ctx, 'Software', 'San Jose', {
      level: 'P5',
      title: 'Staff Software Engineer',
      family: 'Software',
      tag: 'trade-give',
    })
    shapePlanned(s, day('2026-02-09'), day('2026-11-02'))
  }

  // The cross-unit internal move's receiving seat (pending, requests.ts): an Open S&S seat.
  {
    const s = openingSeat(ctx, 'Systems Validation', 'San Jose', { tag: 'cross-unit-to' })
    shapeNew(ctx, s, day('2026-01-12'), day('2026-07-01'), day('2026-11-02'), null)
  }
}

/* ───────────────────────── generic openings to the counts ───────────────────────── */

function countBy(w: World, status: PositionStatus, bu: string): number {
  let n = 0
  for (const s of w.seats) if (s.bu === bu && seatStatusOn(s, day('2026-09-30')) === status) n++
  return n
}

/** A department and site in a unit for a generic opening (never Munich, Haifa or 1550-HSZ). */
function pickPlace(ctx: Ctx, bu: string): { dept: string; site: string } {
  const { rng } = ctx
  const depts = DEPTS.filter((d) => d.bu === bu && !d.explicit)
  const d = rng.weighted(
    depts,
    depts.map((x) => x.size),
  )
  const sites = d.sites.filter(([s]) => !MUC_HFA.has(s) && !(d.code === 1550 && s === 'Hsinchu'))
  const site = rng.weighted(
    sites.map((x) => x[0]),
    sites.map((x) => x[1]),
  )
  return { dept: d.name, site }
}

type OpenShape = 'new' | 'new-after-lock' | 'offer' | 'vacated' | 'vacated-no-req'

/** Generic Open shapes by unit. Story units never get a vacated seat (13.1 (a)). */
const OPEN_MIX: Readonly<Record<string, readonly (readonly [OpenShape, number])[]>> = {
  [SE]: [
    ['new', 8],
    ['new-after-lock', 2],
    ['offer', 3],
  ],
  [GTM]: [
    ['new', 10],
    ['new-after-lock', 3],
    ['offer', 4],
  ],
  [SS]: [
    ['vacated', 5],
    ['vacated-no-req', 4],
    ['new', 9],
    ['new-after-lock', 1],
    ['offer', 4],
  ],
  [OPS]: [
    ['vacated', 4],
    ['vacated-no-req', 3],
    ['new', 7],
    ['offer', 3],
  ],
}

function fillOpenings(ctx: Ctx): void {
  const { w, rng } = ctx
  for (const bu of [SE, GTM, SS, OPS]) {
    const story = bu === SE || bu === GTM
    const startLo = story ? FIRST_FY27_OPEN_START : day('2026-08-03')
    // Open
    const shapes: OpenShape[] = []
    for (const [shape, n] of OPEN_MIX[bu]) for (let i = 0; i < n; i++) shapes.push(shape)
    const need = OPEN_BY_UNIT[bu] - countBy(w, 'Open', bu)
    if (need !== shapes.length) throw new Error(`${bu}: ${need} Open seats to add, ${shapes.length} planned`)
    for (const shape of shapes) {
      const { dept, site } = pickPlace(ctx, bu)
      const s = openingSeat(ctx, dept, site)
      if (shape === 'new') {
        const created = mondayIn(rng, day('2025-10-06'), BUDGET_LOCK - 10)
        const start = mondayIn(rng, startLo, day('2027-03-08'))
        const opened = Math.max(created, Math.min(day('2026-09-21'), mondayIn(rng, start - 150, start - 30)))
        shapeNew(ctx, s, created, opened, start, {
          status: 'Open',
          stage: rng.chance(0.55) ? 'Interviewing' : 'Req opened',
        })
      } else if (shape === 'new-after-lock') {
        const created = mondayIn(rng, day('2026-04-13'), day('2026-08-17'))
        const start = mondayIn(rng, Math.max(created + 60, FIRST_FY27_OPEN_START), day('2027-03-08'))
        const opened = Math.min(day('2026-09-21'), created + rng.int(7, 40))
        const nr = approvedNewRole(ctx, s, created, start)
        shapeNew(ctx, s, created, opened, start, { status: 'Open', stage: 'Req opened' }, nr)
      } else if (shape === 'offer') {
        const created = mondayIn(rng, day('2025-10-06'), BUDGET_LOCK - 10)
        const start = mondayIn(rng, FIRST_FY27_OPEN_START, day('2026-12-14'))
        const opened = Math.max(created, mondayIn(rng, day('2026-04-06'), day('2026-07-06')))
        const accepted = mondayIn(rng, opened + 21, day('2026-09-21'))
        shapeNew(ctx, s, created, opened, start, { status: 'Open', stage: 'Offer accepted', accepted, start })
      } else {
        const exit = fridayIn(rng, day('2026-04-03'), day('2026-09-18'))
        shapeVacated(ctx, s, exit, exit - rng.int(14, 30))
        if (shape === 'vacated') {
          const opened = Math.min(day('2026-09-25'), exit - rng.int(0, 10))
          newReq(w, {
            seat: s.idx,
            status: 'Open',
            stage: rng.chance(0.5) ? 'Interviewing' : 'Req opened',
            type: 'Backfill',
            opened,
            target: mondayIn(rng, Math.max(FIRST_FY27_OPEN_START, exit + 45), day('2027-01-11')),
          })
        } else s.tags.add('no-req')
      }
    }
    // Planned
    const plannedNeed = PLANNED_BY_UNIT[bu] - countBy(w, 'Planned', bu)
    const afterLock = bu === GTM ? 2 : 1
    for (let i = 0; i < plannedNeed; i++) {
      const { dept, site } = pickPlace(ctx, bu)
      const s = openingSeat(ctx, dept, site)
      const start = mondayIn(rng, FIRST_FY27_OPEN_START, LAST_PLANNED_START)
      if (i < afterLock) {
        const created = mondayIn(rng, day('2026-04-13'), day('2026-09-14'))
        const s2 = Math.max(start, nextMonday(created + 45))
        const nr = approvedNewRole(ctx, s, created, Math.min(s2, LAST_PLANNED_START))
        shapePlanned(s, created, Math.min(s2, LAST_PLANNED_START), nr)
      } else shapePlanned(s, mondayIn(rng, day('2025-10-06'), BUDGET_LOCK - 10), start)
    }
    // On hold (before the lock, so the Budget already had them On hold)
    const holdNeed = (ON_HOLD_BY_UNIT[bu] ?? 0) - countBy(w, 'On hold', bu)
    for (let i = 0; i < holdNeed; i++) {
      const { dept, site } = pickPlace(ctx, bu)
      const s = openingSeat(ctx, dept, site, { tag: 'on-hold' })
      if (rng.chance(0.6)) {
        const exit = fridayIn(rng, day('2025-05-02'), day('2025-12-19'))
        shapeVacated(ctx, s, exit, exit - rng.int(14, 30))
        addRow(s, mondayIn(rng, exit + 20, day('2026-02-23')), 'On hold')
      } else {
        const created = mondayIn(rng, HISTORY_START, day('2025-09-29'))
        shapePlanned(s, created, mondayIn(rng, created + 90, day('2026-06-29')))
        addRow(s, mondayIn(rng, created + 30, day('2026-02-23')), 'On hold')
      }
    }
  }

  // Approved Backfills for two Systems & Software seats left with no req: the request gives the seat
  // its replacement start (6.5); both name seats with an exit, so neither is flagged.
  const noReq = w.seats.filter((s) => s.bu === SS && s.tags.has('no-req')).slice(0, 2)
  for (const s of noReq) {
    const exit = s.stints[0].end!
    const approved = Math.min(day('2026-09-25'), exit + rng.int(5, 15))
    const r = newRequest(w, {
      type: 'Backfill',
      state: 'Approved',
      reason: 'Attrition backfill',
      requester: requesterFor(w, s.mgr!, approved),
      mgrSeat: s.mgr!,
      bu: SS,
      dept: s.dept,
      site: s.site,
      level: s.level,
      title: s.title,
      fte: s.fte,
      seat: s.idx,
      start: mondayIn(rng, Math.max(FIRST_FY27_OPEN_START, exit + 60), day('2027-01-11')),
      submitted: approved - rng.int(2, 6),
      updated: approved,
      decided: approved,
    })
    r.tags.add('approved-backfill')
  }
}

/* ───────────────────────── seat state on a day (World level) ───────────────────────── */

/** The seat's latest row on or before `d` among rows known by `knownBy`. */
export function rowOnDay(s: Seat, d: Day, knownBy = Number.POSITIVE_INFINITY): RowEvent | null {
  let best: RowEvent | null = null
  for (const r of s.rows) if (r.known <= knownBy && r.from <= d && (!best || r.from >= best.from)) best = r
  return best
}

/** The seat's derived status on day d (6.5): Filled with a holder, else the row's (a Filled row with no holder reads Open). */
export function seatStatusOn(s: Seat, d: Day): PositionStatus | null {
  const row = rowOnDay(s, d)
  if (!row) return null
  for (const st of s.stints) if (st.start <= d && (st.end == null || st.end >= d)) return 'Filled'
  return row.status === 'Filled' ? 'Open' : row.status
}

/**
 * Whether the seat is an approved head on day `at` as data known by `knownBy` shows it: a row in
 * effect that is not On hold or Eliminated (every sample opening is planned to start by 31 Mar 2027,
 * and a seat left by an exit stays an approved head).
 */
export function approvedAt(s: Seat, at: Day, knownBy = Number.POSITIVE_INFINITY): boolean {
  const row = rowOnDay(s, at, knownBy)
  return row != null && row.status !== 'On hold' && row.status !== 'Eliminated'
}

/**
 * The head effect on a unit's asks at day `at` of the pending requests (Submitted, In review, Sent
 * back) taking effect by then (6.9): New role +1; Elimination −1 when the seat counts; Backfill +1 on
 * an On hold seat; a transfer −1 where a seat leaves or goes On hold and +1 where a seat joins. Trades
 * are left out (story 9 counts the unit's asks without the trade).
 */
export function pendingHeadEffect(w: World, bu: string, at: Day): number {
  let n = 0
  for (const q of w.requests) {
    if (!PENDING_REQUEST_STATES.includes(q.state)) continue
    const eff = q.transfer?.effective ?? q.start
    if (eff != null && eff > at) continue
    if (q.type === 'New role' && q.bu === bu) n++
    else if (q.type === 'Elimination' && q.seat != null) {
      const s = w.seats[q.seat]
      if (s.bu === bu && approvedAt(s, at)) n--
    } else if (q.type === 'Backfill' && q.seat != null) {
      const s = w.seats[q.seat]
      if (s.bu === bu && rowOnDay(s, at)?.status === 'On hold') n++
    } else if (q.type === 'Transfer' && q.transfer) {
      const from = w.seats[q.transfer.from]
      if (q.transfer.kind === 'Internal move') {
        if (from.bu === bu) n--
      } else {
        const toBu = q.transfer.toManager != null ? w.seats[q.transfer.toManager].bu : from.bu
        if (toBu !== from.bu) {
          if (from.bu === bu) n--
          if (toBu === bu) n++
        }
      }
    }
  }
  return n
}

/** A unit's FY27 asks at 31 Mar 2027 (Working approved heads + pending head effects) and its Budget heads. */
export function fy27Heads(w: World, bu: string): { asks: number; budget: number; working: number } {
  let working = 0
  let budget = 0
  for (const s of w.seats) {
    if (s.bu !== bu) continue
    if (approvedAt(s, FY27_END)) working++
    if (approvedAt(s, FY27_END, BUDGET_LOCK)) budget++
  }
  return { asks: working + pendingHeadEffect(w, bu, FY27_END), budget, working }
}

/* ───────────────────────── eliminations (after the requests are planned) ───────────────────────── */

/**
 * The 25 Eliminated seats: story 9's headroom first (S&S Budget seats, Planned to start after
 * 31 Oct 2026, eliminated in May to early July 2026 before the Q1 Reforecast lock, until S&S's FY27
 * asks are 8 heads under its Budget heads), then one Filled Operations seat eliminated on 30 Jun 2026
 * (severance in July), one Open Operations seat eliminated on 14 May 2026 (its req cancelled) and the
 * rest in FY26, before the Budget lock, across the units. Returns the headroom count.
 */
export function addEliminations(w: World, rng: Rng, names: NameBook): number {
  const ctx: Ctx = { w, rng, names }
  const ss = fy27Heads(w, SS)
  // Each headroom seat adds one Budget head and no Working head: target − asks = budget + e − asks.
  const headroom = SS_HEADROOM + ss.asks - ss.budget
  if (headroom < 0 || headroom > SEAT_COUNTS.Eliminated - 2)
    throw new Error(`Story 9 needs ${headroom} headroom eliminations in Systems & Software.`)
  for (let i = 0; i < headroom; i++) {
    const { dept, site } = pickPlace(ctx, SS)
    const s = openingSeat(ctx, dept, site, { tag: 'headroom' })
    shapePlanned(
      s,
      mondayIn(rng, day('2025-10-06'), BUDGET_LOCK - 10),
      mondayIn(rng, day('2026-11-02'), LAST_PLANNED_START),
    )
    const last = fridayIn(rng, day('2026-05-15'), day('2026-07-10'))
    addRow(s, last + 1, 'Eliminated', { endDate: last, endReason: 'Eliminated', known: last - 3 })
  }

  // A Filled Operations seat eliminated (approved 20 May 2026, last day 30 Jun 2026).
  {
    const s = openingSeat(ctx, 'Supply Chain', 'Shanghai', { tag: 'eliminated-filled' })
    const last = day('2026-06-30')
    const approved = day('2026-05-20')
    const p = shapeVacatedElim(ctx, s, last, approved)
    const r = newRequest(w, {
      type: 'Elimination',
      state: 'Approved',
      reason: 'Restructure',
      requester: requesterFor(w, s.mgr!, approved),
      mgrSeat: s.mgr!,
      bu: OPS,
      dept: s.dept,
      site: s.site,
      level: s.level,
      title: s.title,
      fte: s.fte,
      seat: s.idx,
      start: last,
      submitted: day('2026-05-06'),
      updated: approved,
      decided: approved,
    })
    r.tags.add('eliminated-filled')
    s.rows[s.rows.length - 1].request = r.idx
    w.people[p].tags.add('eliminated')
  }
  // An Open Operations seat eliminated (last day 14 May 2026); its req is cancelled.
  {
    const s = openingSeat(ctx, 'Test & Product Engineering', 'Shanghai', { tag: 'eliminated-open' })
    const last = day('2026-05-14')
    shapeNew(ctx, s, day('2025-11-03'), day('2026-02-02'), day('2026-08-03'), {
      status: 'Cancelled',
      stage: 'Req opened',
      closed: last,
    })
    const r = newRequest(w, {
      type: 'Elimination',
      state: 'Approved',
      reason: 'Cost reduction',
      requester: requesterFor(w, s.mgr!, last),
      mgrSeat: s.mgr!,
      bu: OPS,
      dept: s.dept,
      site: s.site,
      level: s.level,
      title: s.title,
      fte: s.fte,
      seat: s.idx,
      start: last,
      submitted: last - 12,
      updated: last - 2,
      decided: last - 2,
    })
    addRow(s, last + 1, 'Eliminated', {
      endDate: last,
      endReason: 'Eliminated',
      known: last - 2,
      request: r.idx,
    })
  }

  // The rest in FY26, before the Budget lock (the Budget knows them), across the units.
  const units = [OPS, SS, SE, GTM, CORP]
  const rest = SEAT_COUNTS.Eliminated - headroom - 2
  for (let i = 0; i < rest; i++) {
    const bu = units[i % units.length]
    const { dept, site } = pickPlace(ctx, bu)
    const s = openingSeat(ctx, dept, site, { tag: 'eliminated-fy26' })
    const last = fridayIn(rng, day('2025-06-27'), day('2026-02-27'))
    if (rng.chance(0.6)) shapeVacatedElim(ctx, s, last, last - rng.int(20, 40))
    else {
      shapePlanned(s, HISTORY_START, mondayIn(rng, day('2025-07-07'), day('2026-03-30')))
      addRow(s, last + 1, 'Eliminated', {
        endDate: last,
        endReason: 'Eliminated',
        known: last - rng.int(5, 20),
      })
    }
  }
  return headroom
}

/* ───────────────────────── remote seats (after the workers are planted) ───────────────────────── */

/**
 * Seats each department's `remote` individual contributors (departments.ts) at their site: the first
 * main-site seats, in seat order, that report to a team manager, are Filled throughout and have one
 * holder since before 1 Apr 2025 who stays all year with no leave, and that carry no tag, request or
 * req. Each moves with its holder and keeps its manager. It draws nothing and runs once every module
 * that picks seats or people by site has drawn, so no random stream moves; comp.ts then prices the
 * holder at the new site.
 */
export function seatRemotes(w: World): void {
  const named = new Set<number>()
  for (const q of w.requests) {
    if (q.seat != null) named.add(q.seat)
    for (const i of q.trade?.give ?? []) named.add(i)
    if (q.transfer) for (const i of [q.transfer.from, q.transfer.to]) if (i != null) named.add(i)
  }
  for (const r of w.reqs) named.add(r.seat)
  for (const spec of DEPTS)
    for (const [site, n] of Object.entries(spec.remote ?? {})) {
      const main = mainSite(spec.name)
      const moved = w.seats
        .filter((s) => {
          if (s.dept !== spec.name || s.site !== main || s.role !== 'ic' || s.tags.size || named.has(s.idx))
            return false
          if (s.mgr == null || w.seats[s.mgr].role !== 'manager') return false
          if (s.stints.length !== 1 || s.stints[0].end != null || s.rows.some((r) => r.status !== 'Filled'))
            return false
          const p = w.people[s.stints[0].person]
          return p.hire < HISTORY_START && p.term == null && !p.leave && !p.tags.size
        })
        .slice(0, n)
      if (moved.length < n)
        throw new Error(`${spec.name} has ${moved.length} seats it can move to ${site}, not ${n}.`)
      for (const s of moved) {
        s.site = site
        w.people[s.stints[0].person].site = site
      }
    }
}

/** A seat held since before the window whose holder's last day is the seat's last day; Eliminated from the next day. */
function shapeVacatedElim(ctx: Ctx, s: Seat, last: Day, known: Day): number {
  s.created = HISTORY_START
  const p = leaver(ctx, s, last, known)
  s.stints.push({ person: p.idx, start: p.hire, end: last })
  addRow(s, HISTORY_START, 'Filled')
  addRow(s, last + 1, 'Eliminated', { endDate: last, endReason: 'Eliminated', known })
  return p.idx
}
