/**
 * People and assignments (docs/PLAN.md 5.2 `workers`, 13.1): hire dates for everyone in a seat since
 * before 1 Apr 2025, 8 known future exits (October to December 2026, in Systems & Software and
 * Operations), 20 people on leave on the extract date (4 unpaid; Munich's only P6 on leave and one of
 * Manager B's reports among the paid), story 7's 6 employees not in plan and 3 cost-center mismatches
 * (none in Go-to-Market, Silicon Engineering, Munich or Haifa), 60 contractors and 20 interns with no
 * seat, and the rows: one per person per position (`assignmentEnd` only for a move, `terminationDate`
 * for an exit). Draws from the `workers` stream only.
 */
import { type ISODate, type Level, siteByLocation, type WorkerRow } from '../schema'
import {
  AS_OF,
  type Day,
  day,
  FOUNDED,
  fridayOnOrBefore,
  HISTORY_START,
  iso,
  isoOrNull,
  mondayOnOrBefore,
  nextMonday,
} from './calendar'
import { CORP, costCenter, DEPTS, deptSpec, EO, OPS, SS } from './departments'
import type { NameBook } from './names'
import {
  drawIcLevel,
  holderOn,
  icRole,
  managerOn,
  newPerson,
  type Person,
  type Seat,
  type World,
} from './org'
import { rowOnDay, seatCostCenter } from './positions'
import type { Rng } from './prng'

/** Years in the company before 1 Apr 2025, by level (uniform in the range). */
const TENURE: Readonly<Record<Level, readonly [number, number]>> = {
  P1: [0.1, 2],
  P2: [0.3, 4],
  P3: [0.8, 6],
  P4: [1, 8],
  P5: [1.5, 10],
  P6: [2.5, 11],
  M1: [1.5, 10],
  M2: [2.5, 11],
  E1: [3, 11],
  E2: [4, 11],
  E3: [5, 11],
}

const MUC_HFA = new Set(['Munich', 'Haifa'])
const PERSONA = ['manager-a', 'manager-b', 'manager-c', 'manager-c-sub']
const inPersonaTeam = (s: Seat): boolean => [...s.tags].some((t) => PERSONA.some((p) => t.startsWith(p)))

function mondayIn(rng: Rng, lo: Day, hi: Day): Day {
  const d = nextMonday(rng.int(lo, hi))
  return d > hi ? mondayOnOrBefore(hi) : d
}
function fridayIn(rng: Rng, lo: Day, hi: Day): Day {
  const d = fridayOnOrBefore(rng.int(lo, hi))
  return d < lo ? d + 7 : d
}

/** The seat a person holds on the extract date (30 Sep 2026), or null. */
export function seatOnAsOf(w: World, p: Person): Seat | null {
  if (p.seat == null) return null
  const s = w.seats[p.seat]
  return holderOn(w, s.idx, AS_OF) === p.idx ? s : null
}

/** Current holders on 30 Sep that no story or persona uses: tenured, full time, one seat, no exit or leave. */
function plainHolders(w: World, keep: (s: Seat, p: Person) => boolean): Person[] {
  const out: Person[] = []
  for (const s of w.seats) {
    const h = holderOn(w, s.idx, AS_OF)
    if (h == null) continue
    const p = w.people[h]
    if (
      s.role !== 'ic' ||
      inPersonaTeam(s) ||
      s.tags.size > 0 ||
      s.fte !== 1 ||
      s.stints.length !== 1 ||
      p.hire >= HISTORY_START ||
      p.term != null ||
      p.leave != null ||
      p.costCenter != null ||
      p.tags.size > 0 ||
      seatCostCenter(s) === '1550-HSZ' ||
      s.bu === EO
    )
      continue
    if (keep(s, p)) out.push(p)
  }
  return out
}

/** Hire dates for everyone in a seat since before the window (execs and the Executive Office keep theirs). */
export function assignHireDates(w: World, rng: Rng): void {
  for (const p of w.people) {
    if (p.hire !== -1) continue
    const [lo, hi] = TENURE[p.promotedFrom ?? p.level]
    const years = rng.float(lo, hi)
    p.hire = Math.max(FOUNDED, mondayOnOrBefore(HISTORY_START - 1 - Math.round(years * 365)))
  }
  for (const s of w.seats) for (const st of s.stints) if (st.start === -1) st.start = w.people[st.person].hire
}

export interface WorkerPlants {
  notInPlan: number[]
  mismatches: number[]
  knownExits: number[]
  onLeave: number[]
}

/**
 * Known future exits (8, in Systems & Software and Operations), leave on 30 Sep, story 7's people,
 * contractors and interns. Call after `assignHireDates`.
 */
export function plantWorkers(w: World, rng: Rng, names: NameBook): WorkerPlants {
  // Known future exits: last days October to December 2026, told in September.
  const exitPool = plainHolders(w, (s) => (s.bu === SS || s.bu === OPS) && !MUC_HFA.has(s.site))
  const knownExits: number[] = []
  for (const p of rng.sample(exitPool, 8)) {
    p.term = fridayIn(rng, day('2026-10-09'), day('2026-12-18'))
    p.termKnown = mondayIn(rng, day('2026-09-07'), day('2026-09-28'))
    const s = w.seats[p.seat!]
    s.stints[0].end = p.term
    p.tags.add('known-exit')
    knownExits.push(p.idx)
  }

  // Leave on the extract date: Munich's one P6 on leave (paid), one of Manager B's 3 reports (paid, so
  // the leak tests can flip a leavePaid inside B's team, 16.1), 4 unpaid in S&S and Operations, and 14
  // paid elsewhere outside Munich and Haifa.
  const onLeave: number[] = []
  const leaveFrom = () => mondayIn(rng, day('2026-05-04'), day('2026-09-21'))
  {
    const reports = w.seats.filter((s) => s.tags.has('manager-b-report'))
    const p = w.people[holderOn(w, rng.pick(reports).idx, AS_OF)!]
    p.leave = { from: mondayIn(rng, day('2026-08-03'), day('2026-09-14')), paid: true }
    onLeave.push(p.idx)
  }
  const munichP6 = rng.pick(plainHolders(w, (s) => s.site === 'Munich' && s.level === 'P6'))
  munichP6.leave = { from: leaveFrom(), paid: true }
  onLeave.push(munichP6.idx)
  for (const p of rng.sample(
    plainHolders(w, (s) => (s.bu === SS || s.bu === OPS) && !MUC_HFA.has(s.site)),
    4,
  )) {
    p.leave = { from: mondayIn(rng, day('2026-07-06'), day('2026-09-21')), paid: false }
    onLeave.push(p.idx)
  }
  for (const p of rng.sample(
    plainHolders(w, (s) => !MUC_HFA.has(s.site)),
    14,
  )) {
    p.leave = { from: leaveFrom(), paid: true }
    onLeave.push(p.idx)
  }

  // Story 7: 3 cost-center mismatches (the worker row names another of the department's cost centers).
  const mismatches: number[] = []
  for (const [dept, seatSite, rowSite] of [
    ['Software', 'Vancouver', 'Toronto'],
    ['Test & Product Engineering', 'Ho Chi Minh City', 'Shanghai'],
    ['Finance', 'Bengaluru', 'San Jose'],
  ] as const) {
    const p = rng.pick(plainHolders(w, (s) => s.dept === dept && s.site === seatSite))
    p.costCenter = costCenter(dept, rowSite)
    p.tags.add('cc-mismatch')
    mismatches.push(p.idx)
  }

  // Story 7: 6 employees hired in July to September 2026 with no position.
  const notInPlan: number[] = []
  for (const [dept, site] of [
    ['Software', 'San Jose'],
    ['Firmware', 'Raleigh'],
    ['Hardware Engineering', 'Boulder'],
    ['Test & Product Engineering', 'Hsinchu'],
    ['Supply Chain', 'Shanghai'],
    ['Quality & Reliability', 'Shanghai'],
  ] as const) {
    const spec = deptSpec(dept)
    const r = icRole(spec, drawIcLevel(spec, site, rng), rng)
    const mgr = rng.pick(
      w.seats.filter(
        (s) =>
          s.role === 'manager' &&
          s.dept === dept &&
          s.site === site &&
          !inPersonaTeam(s) &&
          holderOn(w, s.idx, AS_OF) != null,
      ),
    )
    const p = newPerson(w, {
      name: names.name(site),
      bu: spec.bu,
      dept,
      site,
      level: r.level,
      title: r.title,
      hire: mondayIn(rng, day('2026-07-06'), day('2026-09-21')),
      mgrPerson: holderOn(w, mgr.idx, AS_OF),
    })
    p.tags.add('not-in-plan')
    notInPlan.push(p.idx)
  }

  // About 60 contractors and 20 interns, with no Employee seat (0 heads, not costed).
  const contingent = (type: 'Contractor' | 'Intern', n: number) => {
    const depts = DEPTS.filter((d) => !d.explicit && d.bu !== CORP)
    for (let i = 0; i < n; i++) {
      const d = rng.weighted(
        depts,
        depts.map((x) => x.size),
      )
      const sites = d.sites.filter(([s]) => !MUC_HFA.has(s))
      const site = rng.weighted(
        sites.map((x) => x[0]),
        sites.map((x) => x[1]),
      )
      const mgrs = w.seats.filter(
        (s) =>
          s.role === 'manager' && s.dept === d.name && !inPersonaTeam(s) && holderOn(w, s.idx, AS_OF) != null,
      )
      const atSite = mgrs.filter((s) => s.site === site)
      const mgr = rng.pick(atSite.length ? atSite : mgrs)
      const r = icRole(d, type === 'Intern' ? 'P1' : drawIcLevel(d, site, rng), rng)
      const hire =
        type === 'Intern'
          ? mondayIn(rng, day('2026-06-01'), day('2026-09-14'))
          : mondayIn(rng, day('2024-01-08'), day('2026-09-21'))
      const p = newPerson(w, {
        name: names.name(site),
        type,
        bu: d.bu,
        dept: d.name,
        site,
        level: type === 'Intern' ? 'P1' : r.level,
        title: type === 'Intern' ? `${d.name} Intern` : `Contract ${r.title}`,
        hire,
        mgrPerson: holderOn(w, mgr.idx, AS_OF),
      })
      if (type === 'Intern') {
        p.term = day('2026-12-18')
        p.termKnown = hire
      }
    }
  }
  contingent('Contractor', 60)
  contingent('Intern', 20)
  return { notInPlan, mismatches, knownExits, onLeave }
}

/* ───────────────────────── rows ───────────────────────── */

/** What `asKnownOn` needs about each worker row (parallel to the rows). */
export interface WorkerKnown {
  /** The assignment's start: a lock before it does not see the row. */
  start: ISODate
  /** The day the termination date was known (null: no termination date). */
  termKnown: ISODate | null
  /** The day the assignment end (a move) was known (null: no assignment end). */
  endKnown: ISODate | null
  /** The first day of the leave the row shows (null: not on leave). */
  leaveFrom: ISODate | null
}

export interface WorkerOutput {
  rows: WorkerRow[]
  known: WorkerKnown[]
}

/** One row per person per position, people in employee ID order, a person's rows by start. */
export function workerRows(w: World): WorkerOutput {
  const stintsOf = new Map<number, { seat: Seat; start: Day; end: Day | null; endKnown: Day | null }[]>()
  for (const s of w.seats)
    for (const st of s.stints) {
      const list = stintsOf.get(st.person) ?? []
      list.push({ seat: s, start: st.start, end: st.end, endKnown: st.endKnown ?? null })
      stintsOf.set(st.person, list)
    }
  const people = w.people.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const rows: WorkerRow[] = []
  const known: WorkerKnown[] = []
  const idOf = (i: number | null | undefined) => (i == null ? null : w.people[i].id)
  for (const p of people) {
    const list = (stintsOf.get(p.idx) ?? []).sort((a, b) => a.start - b.start)
    const leave = p.leave
    if (list.length === 0) {
      const site = siteByLocation.get(p.site)!
      rows.push({
        employeeId: p.id,
        name: p.name,
        positionId: null,
        assignmentStart: iso(p.hire),
        assignmentEnd: null,
        hireDate: iso(p.hire),
        terminationDate: isoOrNull(p.term),
        workerType: p.type,
        fte: 1,
        level: p.level,
        businessUnit: p.bu,
        department: p.dept,
        costCenter: p.costCenter ?? costCenter(p.dept, p.site),
        location: p.site,
        legalEntity: site.legalEntity,
        managerId: idOf(p.mgrPerson),
        onLeave: null,
        leavePaid: null,
      })
      known.push({
        start: iso(p.hire),
        termKnown: p.term != null ? iso(p.termKnown ?? p.hire) : null,
        endKnown: null,
        leaveFrom: null,
      })
      continue
    }
    for (const st of list) {
      const s = st.seat
      const ended = st.end != null && (p.term == null || st.end < p.term)
      const at = st.end != null && st.end < AS_OF ? st.end : AS_OF
      const row = rowOnDay(s, at) ?? s.rows[0]
      const current = st.start <= AS_OF && (st.end == null || st.end >= AS_OF)
      const site = siteByLocation.get(s.site)!
      const onLeave = current && leave != null
      rows.push({
        employeeId: p.id,
        name: p.name,
        positionId: s.id,
        assignmentStart: iso(st.start),
        assignmentEnd: ended ? iso(st.end!) : null,
        hireDate: iso(p.hire),
        terminationDate: isoOrNull(p.term),
        workerType: p.type,
        fte: s.fte,
        level: row.level,
        businessUnit: s.bu,
        department: s.dept,
        costCenter: current && p.costCenter ? p.costCenter : seatCostCenter(s),
        location: s.site,
        legalEntity: site.legalEntity,
        managerId: idOf(managerOn(w, s.idx, at)?.person),
        onLeave: onLeave ? true : null,
        leavePaid: onLeave ? leave.paid : null,
      })
      known.push({
        start: iso(st.start),
        termKnown: p.term != null ? iso(p.termKnown ?? p.term) : null,
        endKnown: ended ? iso(st.endKnown ?? st.end!) : null,
        leaveFrom: onLeave ? iso(leave.from) : null,
      })
    }
  }
  return { rows, known }
}
