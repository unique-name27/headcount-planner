/**
 * The sample's working model and today's organization (docs/PLAN.md 13.1). `buildOrg` lays out every
 * Filled seat at 30 Sep 2026, CEO down to individual contributors, each with its current holder: the
 * generic team builder for each department (with the planted persona teams), and the hand-built
 * Executive Office and People teams whose HRBPs, recruiters and HRIS lead appear across other
 * datasets. Dates, history and the seats that are not Filled are added by `positions.ts`.
 *
 * Seats and people are referenced by array index until IDs are assigned at the end
 * (`assignIds`): positions in creation order, employees in hire order.
 */
import {
  type EndReason,
  type Level,
  type PositionStatus,
  type ReasonCode,
  type ReqStage,
  type ReqStatus,
  type ReqType,
  type RequestState,
  type RequestType,
  type StepDecision,
  type StepRole,
  siteByLocation,
  type TransferKind,
  type WorkerType,
} from '../schema'
import { type Day, day } from './calendar'
import {
  CORP,
  DEPTS,
  type DeptSpec,
  deptSpec,
  EO,
  EXEC_SLOTS,
  GTM,
  IC_LEVELS,
  type IcLevel,
  type Ladder,
  OPS,
  SE,
  SS,
  type Track,
} from './departments'
import type { NameBook } from './names'
import type { Rng } from './prng'

/* ───────────────────────── the working model ───────────────────────── */

export type SeatRole = 'exec' | 'director' | 'manager' | 'ic'

/** One dated row of a seat, as `positions` will hold it. */
export interface RowEvent {
  from: Day
  status: PositionStatus
  level: Level
  title: string
  startDate: Day | null
  openedDate: Day | null
  reqType: ReqType | null
  endDate: Day | null
  endReason: EndReason | null
  /** The request plan (index into `World.requests`) that made the row, if any. */
  request: number | null
  /**
   * The day the row was recorded. A lock "as of" a date reads only rows recorded by then
   * (`asKnownOn` in base.ts): an exit's Open row is recorded on the day after the last day, a planned
   * row change (an approved elimination, a move) on its approval day.
   */
  known: Day
  /** The manager seat on this row when it differs from the seat's current one (a position move). */
  mgr?: number | null
}

/** A person in a seat from `start` to `end` (both inclusive; null: no known end). */
export interface Stint {
  person: number
  start: Day
  end: Day | null
  /** The day an end that is not the person's exit (an internal move) was recorded. */
  endKnown?: Day | null
}

export interface Seat {
  idx: number
  /** Position ID, assigned by `assignIds`. */
  id: string
  bu: string
  dept: string
  site: string
  level: Level
  title: string
  family: string
  /** Manager seat (index), or null for the CEO. */
  mgr: number | null
  fte: number
  role: SeatRole
  tags: Set<string>
  /** The first row's effective date. */
  created: Day
  rows: RowEvent[]
  stints: Stint[]
}

export interface LeaveSpell {
  from: Day
  paid: boolean
}

export interface Person {
  idx: number
  /** Employee ID, assigned by `assignIds` in hire order. */
  id: string
  name: string
  type: WorkerType
  /** Hire day; -1 until assigned. */
  hire: Day
  /** Last day of employment, inclusive. */
  term: Day | null
  /** The day the exit was known (the notice day); a lock before it does not see the exit. */
  termKnown: Day | null
  /** The person's seat (index), or null for a person not in plan, a contractor or an intern. */
  seat: number | null
  bu: string
  dept: string
  site: string
  level: Level
  title: string
  /** Manager for a seatless person (index into people). */
  mgrPerson: number | null
  /** A cost center on the worker row that differs from the seat's (story 7), or null. */
  costCenter: string | null
  /** Pay position against the band midpoint (comp.ts). */
  compa: number
  /** On leave on the extract date (30 Sep 2026). */
  leave: LeaveSpell | null
  /** The level before an FY26 promotion (positions.ts), or null. */
  promotedFrom: Level | null
  tags: Set<string>
}

/** A requisition as the generator plans it (reqs.ts fills the amounts and emits the row). */
export interface ReqPlan {
  idx: number
  id: string
  seat: number
  status: ReqStatus
  stage: ReqStage | null
  type: ReqType
  opened: Day
  target: Day | null
  accepted: Day | null
  start: Day | null
  closed: Day | null
  /** The hire this req filled (index into people), or null. */
  hire: number | null
  /** Offer above the band midpoint by this factor (story 2), or null for the default draw. */
  offerFactor: number | null
  /** Story 2's Hsinchu offers and story 4's honored offer carry one-time amounts. */
  oneTime: 'all' | 'sign-on-agency' | 'draw'
  offerBase: number | null
  signOn: number | null
  relocation: number | null
  agencyFee: number | null
  tags: Set<string>
}

/** One approval step as the generator plans it. */
export interface StepPlan {
  role: StepRole
  approver: number
  decision: StepDecision
  at: Day | null
}

export interface TradePlan {
  give: number[]
  giveOrg: number
  creditUsedBp: number
  count: number
  jobFamily: string | null
  partTimeRest: boolean
  rateVersion: string | null
}

export interface TransferPlan {
  kind: TransferKind
  person: number
  from: number
  toManager: number | null
  to: number | null
  effective: Day
  moveBudget: boolean
}

/** A headcount request as the generator plans it (requests.ts adds steps and emits the row). */
export interface RequestPlan {
  idx: number
  id: string
  type: RequestType
  state: RequestState
  reason: ReasonCode
  requester: number
  submittedBy: number | null
  /** Submit day and minute of day; null for a draft. */
  submitted: Day | null
  updated: Day
  minute: number
  seat: number | null
  mgrSeat: number
  bu: string
  dept: string | null
  site: string | null
  level: Level | null
  title: string | null
  fte: number | null
  start: Day | null
  priority: number | null
  cycleId: string | null
  confidential: boolean
  exception: boolean
  /** The day the last decision was taken (approved, rejected, withdrawn), or null. */
  decided: Day | null
  /** Which step the request waits on while pending ('manager', 'hrbp', 'leader', 'finance'). */
  waitingOn: StepRole | null
  steps: StepPlan[]
  trade: TradePlan | null
  transfer: TransferPlan | null
  tags: Set<string>
}

export interface RecruiterDesk {
  person: number
  covers: (bu: string, dept: string, site: string) => boolean
}

export interface World {
  seats: Seat[]
  people: Person[]
  /** Executive slot key ('ceo', 'svp-se', ...) to seat index. */
  execs: Map<string, number>
  /** Business unit to HRBP person index. */
  hrbp: Map<string, number>
  /** Named people by key ('hris-lead', ...), person index. */
  named: Map<string, number>
  recruiters: RecruiterDesk[]
  reqs: ReqPlan[]
  requests: RequestPlan[]
}

export function newSeat(
  w: World,
  init: Pick<Seat, 'bu' | 'dept' | 'site' | 'level' | 'title' | 'family' | 'mgr' | 'role'> & Partial<Seat>,
): Seat {
  const s: Seat = {
    idx: w.seats.length,
    id: '',
    fte: 1,
    tags: new Set(),
    created: -1,
    rows: [],
    stints: [],
    ...init,
  }
  w.seats.push(s)
  return s
}

export function newPerson(
  w: World,
  init: Pick<Person, 'name' | 'bu' | 'dept' | 'site' | 'level' | 'title'> & Partial<Person>,
): Person {
  const p: Person = {
    idx: w.people.length,
    id: '',
    type: 'Employee',
    hire: -1,
    term: null,
    termKnown: null,
    seat: null,
    mgrPerson: null,
    costCenter: null,
    compa: 1,
    leave: null,
    promotedFrom: null,
    tags: new Set(),
    ...init,
  }
  w.people.push(p)
  return p
}

export function newReq(
  w: World,
  init: Pick<ReqPlan, 'seat' | 'status' | 'type' | 'opened'> & Partial<ReqPlan>,
): ReqPlan {
  const r: ReqPlan = {
    idx: w.reqs.length,
    id: '',
    stage: null,
    target: null,
    accepted: null,
    start: null,
    closed: null,
    hire: null,
    offerFactor: null,
    oneTime: 'draw',
    offerBase: null,
    signOn: null,
    relocation: null,
    agencyFee: null,
    tags: new Set(),
    ...init,
  }
  w.reqs.push(r)
  return r
}

export function newRequest(
  w: World,
  init: Pick<RequestPlan, 'type' | 'state' | 'reason' | 'requester' | 'mgrSeat' | 'bu' | 'updated'> &
    Partial<RequestPlan>,
): RequestPlan {
  const r: RequestPlan = {
    idx: w.requests.length,
    id: '',
    submittedBy: null,
    submitted: init.updated,
    minute: 9 * 60,
    seat: null,
    dept: null,
    site: null,
    level: null,
    title: null,
    fte: null,
    start: null,
    priority: null,
    cycleId: null,
    confidential: false,
    exception: false,
    decided: null,
    waitingOn: null,
    steps: [],
    trade: null,
    transfer: null,
    tags: new Set(),
    ...init,
  }
  w.requests.push(r)
  return r
}

/** The person holding a seat on day d (the stint covering d), or null. */
export function holderOn(w: World, seat: number, d: Day): number | null {
  for (const st of w.seats[seat].stints)
    if (st.start <= d && (st.end == null || st.end >= d)) return st.person
  return null
}

/** The nearest seat above `seat` with a holder on day d, and that holder; null at the top. */
export function managerOn(w: World, seat: number, d: Day): { seat: number; person: number } | null {
  let m = w.seats[seat].mgr
  while (m != null) {
    const h = holderOn(w, m, d)
    if (h != null) return { seat: m, person: h }
    m = w.seats[m].mgr
  }
  return null
}

/** Leader seat: Director (M2) or above. */
export const isLeaderSeat = (s: Seat): boolean => s.level === 'M2' || s.level.startsWith('E')

/** The seat's ancestors, nearest first. */
export function ancestors(w: World, seat: number): number[] {
  const out: number[] = []
  for (let m = w.seats[seat].mgr; m != null; m = w.seats[m].mgr) out.push(m)
  return out
}

/** The seat itself and everything below it. */
export function subtree(w: World, seat: number): number[] {
  const kids = new Map<number, number[]>()
  for (const s of w.seats) if (s.mgr != null) kids.set(s.mgr, [...(kids.get(s.mgr) ?? []), s.idx])
  const out: number[] = []
  const stack = [seat]
  while (stack.length) {
    const s = stack.pop()!
    out.push(s)
    for (const k of kids.get(s) ?? []) stack.push(k)
  }
  return out
}

/* ───────────────────────── titles and levels ───────────────────────── */

const icIndex = (l: string): number => IC_LEVELS.indexOf(l as IcLevel)

const LADDERS: Record<Ladder, Record<IcLevel, (r: string) => string>> = {
  eng: {
    P1: (r) => `Associate ${r}`,
    P2: (r) => r,
    P3: (r) => `${r} II`,
    P4: (r) => `Senior ${r}`,
    P5: (r) => `Staff ${r}`,
    P6: (r) => `Principal ${r}`,
  },
  biz: {
    P1: (r) => `Associate ${r}`,
    P2: (r) => r,
    P3: (r) => `${r} II`,
    P4: (r) => `Senior ${r}`,
    P5: (r) => `Lead ${r}`,
    P6: (r) => `Principal ${r}`,
  },
  tech: {
    P1: (r) => r,
    P2: (r) => `${r} II`,
    P3: (r) => `Senior ${r}`,
    P4: (r) => `Lead ${r}`,
    P5: (r) => `Lead ${r}`,
    P6: (r) => `Lead ${r}`,
  },
}

export function titleFor(track: Track, level: IcLevel): string {
  return track.titles?.[level] ?? LADDERS[track.ladder ?? 'eng'][level](track.role)
}

const fits = (t: Track, l: IcLevel): boolean =>
  icIndex(l) >= icIndex(t.min ?? 'P1') && icIndex(l) <= icIndex(t.max ?? 'P6')

/** A career track for an IC level in a department; the level is clamped into the track's range. */
export function roleFor(spec: DeptSpec, level: IcLevel, rng: Rng): { track: Track; level: IcLevel } {
  const ok = spec.tracks.filter((t) => fits(t, level))
  if (ok.length)
    return {
      track: rng.weighted(
        ok,
        ok.map((t) => t.w),
      ),
      level,
    }
  const track = rng.weighted(
    spec.tracks,
    spec.tracks.map((t) => t.w),
  )
  const lo = icIndex(track.min ?? 'P1')
  const hi = icIndex(track.max ?? 'P6')
  return { track, level: IC_LEVELS[Math.min(hi, Math.max(lo, icIndex(level)))] }
}

const JUNIOR_SITES = new Set(['Bengaluru', 'Ho Chi Minh City', 'Shanghai'])

/** An IC level from the department mix; offshore engineering centers skew a step junior. */
export function drawIcLevel(spec: DeptSpec, site: string, rng: Rng): IcLevel {
  let i = icIndex(rng.weighted(IC_LEVELS, spec.mix))
  if (JUNIOR_SITES.has(site) && i > 0 && rng.chance(0.3)) i--
  return IC_LEVELS[i]
}

/** An IC seat's level, title and job family in a department. */
export function icRole(
  spec: DeptSpec,
  level: IcLevel,
  rng: Rng,
): { level: IcLevel; title: string; family: string } {
  const { track, level: l } = roleFor(spec, level, rng)
  return { level: l, title: titleFor(track, l), family: track.family ?? spec.name }
}

/** The title of an IC seat at a level on a given track (for history rows after a promotion). */
export function titleAtLevel(spec: DeptSpec, title: string, level: IcLevel): string {
  for (const t of spec.tracks)
    for (const l of IC_LEVELS) if (fits(t, l) && titleFor(t, l) === title) return titleFor(t, level)
  return title
}

/* ───────────────────────── the team builder ───────────────────────── */

/** Split n into whole-number parts proportional to weights (largest remainder). */
export function apportion(n: number, weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0 || n <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (n * w) / total)
  const out = raw.map(Math.floor)
  let left = n - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++
  return out
}

/** Even split of n into k teams, with a little variation, kept within [lo, hi]. */
function splitTeams(n: number, k: number, rng: Rng, lo = 4, hi = 8): number[] {
  const sizes = apportion(n, Array(k).fill(1))
  for (let s = 0; s < k * 2; s++) {
    const a = rng.int(0, k - 1)
    const b = rng.int(0, k - 1)
    if (a !== b && sizes[a] > lo && sizes[b] < hi) {
      sizes[a]--
      sizes[b]++
    }
  }
  return sizes
}

interface Team {
  site: string
  /** Sites of the team's individual contributors. */
  members: string[]
  tag?: string
}

/** Manager and IC seats per site: pinned sites exactly, the rest by the site weights. */
function siteBodies(spec: DeptSpec, body: number): Map<string, number> {
  const pins = spec.pins ?? {}
  const pinned = Object.values(pins).reduce((a, b) => a + b, 0)
  const free = spec.sites.filter(([s]) => pins[s] == null)
  const parts = apportion(
    body - pinned,
    free.map(([, w]) => w),
  )
  const out = new Map<string, number>()
  for (const [s] of spec.sites) out.set(s, pins[s] ?? parts[free.findIndex(([f]) => f === s)])
  return out
}

function planTeams(spec: DeptSpec, body: number, rng: Rng): Team[] {
  const counts = siteBodies(spec, body)
  const teams: Team[] = []
  for (const plant of spec.plants ?? []) {
    teams.push({ site: plant.site, members: Array(plant.size).fill(plant.site), tag: plant.tag })
    counts.set(plant.site, counts.get(plant.site)! - plant.size - 1)
  }
  const floating: string[] = []
  const fixed = spec.managers
  const free: Team[] = []
  for (const [site] of spec.sites) {
    const n = counts.get(site)!
    if (fixed != null) {
      if (n > 0)
        for (const size of splitTeams(n - fixed, fixed, rng))
          free.push({ site, members: Array(size).fill(site) })
      continue
    }
    if (n < 4) {
      for (let k = 0; k < n; k++) floating.push(site)
      continue
    }
    const m = Math.max(1, Math.round(n / 7.5))
    for (const size of splitTeams(n - m, m, rng)) free.push({ site, members: Array(size).fill(site) })
  }
  // ICs at sites too small for a local manager report remotely to the smallest main-site team.
  const main = spec.sites[0][0]
  for (const s of floating) {
    const home = free.filter((t) => t.site === main)
    const pool = home.length ? home : free
    const t = pool.reduce((a, b) => (b.members.length < a.members.length ? b : a))
    t.members.push(s)
  }
  return [...teams, ...free]
}

interface Ctx {
  w: World
  rng: Rng
  names: NameBook
}

function seatWithHolder(
  ctx: Ctx,
  init: Pick<Seat, 'bu' | 'dept' | 'site' | 'level' | 'title' | 'family' | 'mgr' | 'role'> & Partial<Seat>,
  hire?: Day,
): Seat {
  const s = newSeat(ctx.w, init)
  const p = newPerson(ctx.w, {
    name: ctx.names.name(s.site),
    bu: s.bu,
    dept: s.dept,
    site: s.site,
    level: s.level,
    title: s.title,
    seat: s.idx,
    hire: hire ?? -1,
  })
  s.stints.push({ person: p.idx, start: hire ?? -1, end: null })
  return s
}

function directorTitle(spec: DeptSpec, k: number, site: string): string {
  if (spec.directorTitles?.[k]) return spec.directorTitles[k]
  const country = siteByLocation.get(site)?.country
  return country && country !== 'United States'
    ? `Director, ${spec.name}, ${country}`
    : `Director, ${spec.name}`
}

function buildDept(spec: DeptSpec, ctx: Ctx): void {
  const { w, rng } = ctx
  const seated = w.seats.filter((s) => s.dept === spec.name).length
  const body = spec.size - seated - spec.directors - spec.directors * spec.dirIcs
  const teams = planTeams(spec, body, rng)
  const boss = w.execs.get(spec.boss)!

  const addTeam = (team: Team, bossSeat: number) => {
    const m = seatWithHolder(ctx, {
      bu: spec.bu,
      dept: spec.name,
      site: team.site,
      level: 'M1',
      title: spec.manager,
      family: spec.name,
      mgr: bossSeat,
      role: 'manager',
    })
    if (team.tag) m.tags.add(team.tag)
    for (const site of team.members) {
      const r = icRole(spec, drawIcLevel(spec, site, rng), rng)
      const ic = seatWithHolder(ctx, {
        bu: spec.bu,
        dept: spec.name,
        site,
        level: r.level,
        title: r.title,
        family: r.family,
        mgr: m.idx,
        role: 'ic',
      })
      if (team.tag) ic.tags.add(`${team.tag}-report`)
    }
  }

  if (spec.directors === 0) {
    for (const t of teams) addTeam(t, boss)
    return
  }
  const order = new Map(spec.sites.map(([s], i) => [s, i]))
  const sorted = teams.slice().sort((a, b) => order.get(a.site)! - order.get(b.site)!)
  let at = 0
  apportion(sorted.length, Array(spec.directors).fill(1)).forEach((size, k) => {
    const group = sorted.slice(at, at + size)
    at += size
    const siteCount = new Map<string, number>()
    for (const t of group) siteCount.set(t.site, (siteCount.get(t.site) ?? 0) + 1)
    const site =
      [...siteCount].sort((a, b) => b[1] - a[1] || order.get(a[0])! - order.get(b[0])!)[0]?.[0] ??
      spec.sites[0][0]
    const d = seatWithHolder(ctx, {
      bu: spec.bu,
      dept: spec.name,
      site,
      level: 'M2',
      title: directorTitle(spec, k, site),
      family: spec.name,
      mgr: boss,
      role: 'director',
    })
    for (let i = 0; i < spec.dirIcs; i++) {
      const r = icRole(spec, rng.chance(0.6) ? 'P6' : 'P5', rng)
      seatWithHolder(ctx, {
        bu: spec.bu,
        dept: spec.name,
        site,
        level: r.level,
        title: r.title,
        family: r.family,
        mgr: d.idx,
        role: 'ic',
      })
    }
    for (const t of group) addTeam(t, d.idx)
  })
}

function buildExecutiveOffice(ctx: Ctx): void {
  const ceo = ctx.w.execs.get('ceo')!
  const base = { bu: EO, dept: 'Executive Office', site: 'San Jose' }
  const cos = seatWithHolder(
    ctx,
    {
      ...base,
      level: 'M2',
      title: 'Chief of Staff',
      family: 'Corporate strategy',
      mgr: ceo,
      role: 'director',
    },
    day('2019-04-08'),
  )
  const staff: [string, Level, string, number, string][] = [
    ['Executive Business Partner', 'P4', 'Executive administration', ceo, '2016-09-12'],
    ['Executive Business Partner', 'P4', 'Executive administration', cos.idx, '2021-03-01'],
    ['Strategy and Operations Lead', 'P5', 'Corporate strategy', cos.idx, '2020-08-03'],
    ['Strategy Analyst II', 'P3', 'Corporate strategy', cos.idx, '2023-06-05'],
    ['Communications Lead', 'P5', 'Communications', cos.idx, '2018-11-05'],
  ]
  for (const [title, level, family, mgr, hire] of staff)
    seatWithHolder(ctx, { ...base, level, title, family, mgr, role: 'ic' }, day(hire))
}

/** The People team is built by hand: its HRBPs, recruiters and HRIS lead appear across other datasets. */
function buildPeopleTeam(ctx: Ctx): void {
  const { w } = ctx
  const cpo = w.execs.get('cpo')!
  const person = (
    title: string,
    level: Level,
    site: string,
    mgr: number,
    family: string,
    key?: string,
  ): Seat => {
    const role: SeatRole = level === 'M2' ? 'director' : level === 'M1' ? 'manager' : 'ic'
    const s = seatWithHolder(ctx, { bu: CORP, dept: 'People', site, level, title, family, mgr, role })
    if (key) w.named.set(key, s.stints[0].person)
    return s
  }
  const holder = (s: Seat) => s.stints[0].person
  const dirHrbp = person('Director, HR Business Partners', 'M2', 'San Jose', cpo, 'HR business partnering')
  const hrbpSe = person(
    'Principal HR Business Partner',
    'P6',
    'San Jose',
    dirHrbp.idx,
    'HR business partnering',
  )
  const hrbpSs = person('Senior HR Business Partner', 'P5', 'San Jose', dirHrbp.idx, 'HR business partnering')
  const hrbpOps = person('Senior HR Business Partner', 'P5', 'Hsinchu', dirHrbp.idx, 'HR business partnering')
  const hrbpGtm = person(
    'Senior HR Business Partner',
    'P5',
    'San Jose',
    dirHrbp.idx,
    'HR business partnering',
  )
  const hrbpCorp = person('HR Business Partner', 'P4', 'Austin', dirHrbp.idx, 'HR business partnering')
  person('HR Business Partner', 'P4', 'Bengaluru', dirHrbp.idx, 'HR business partnering')
  person('Learning and Development Partner', 'P4', 'San Jose', dirHrbp.idx, 'Learning and development')
  person('Learning and Development Partner', 'P3', 'Bengaluru', dirHrbp.idx, 'Learning and development')

  const dirTa = person('Director, Talent Acquisition', 'M2', 'San Jose', cpo, 'Talent acquisition')
  const taAm = person(
    'Talent Acquisition Manager, Americas',
    'M1',
    'San Jose',
    dirTa.idx,
    'Talent acquisition',
  )
  const taIntl = person(
    'Talent Acquisition Manager, International',
    'M1',
    'Bengaluru',
    dirTa.idx,
    'Talent acquisition',
  )
  const rec = (title: string, level: Level, site: string, mgr: Seat) =>
    person(title, level, site, mgr.idx, 'Talent acquisition')
  const r1 = rec('Senior Technical Recruiter', 'P4', 'San Jose', taAm)
  const r2 = rec('Senior Technical Recruiter', 'P4', 'San Jose', taAm)
  const r3 = rec('Technical Recruiter II', 'P3', 'Austin', taAm)
  const r4 = rec('Technical Recruiter II', 'P3', 'Toronto', taAm)
  const r9 = rec('Recruiter II', 'P3', 'San Jose', taAm)
  rec('Recruiting Coordinator II', 'P2', 'San Jose', taAm)
  rec('Recruiting Coordinator II', 'P2', 'Austin', taAm)
  const r5 = rec('Senior Technical Recruiter', 'P4', 'Bengaluru', taIntl)
  const r6 = rec('Technical Recruiter II', 'P3', 'Bengaluru', taIntl)
  const r7 = rec('Technical Recruiter II', 'P3', 'Hsinchu', taIntl)
  // Covers Munich and Haifa from Seattle, so no People seat sits in a Munich cost center (story 5).
  const r8 = rec('Technical Recruiter II', 'P3', 'Seattle', taIntl)
  rec('Recruiting Coordinator II', 'P2', 'Bengaluru', taIntl)
  rec('Recruiting Coordinator', 'P1', 'Hsinchu', taIntl)

  const dirPo = person('Director, People Operations', 'M2', 'San Jose', cpo, 'People operations')
  const poAm = person('People Operations Manager, Americas', 'M1', 'Austin', dirPo.idx, 'People operations')
  const poApac = person(
    'People Operations Manager, Asia Pacific',
    'M1',
    'Bengaluru',
    dirPo.idx,
    'People operations',
  )
  person('Payroll Specialist II', 'P3', 'Austin', poAm.idx, 'Payroll')
  person('Senior Payroll Specialist', 'P4', 'San Jose', poAm.idx, 'Payroll')
  person('Benefits Specialist II', 'P3', 'Austin', poAm.idx, 'Benefits')
  person('Leave and Accommodation Specialist II', 'P3', 'Austin', poAm.idx, 'People operations')
  person('HR Operations Specialist', 'P2', 'Austin', poAm.idx, 'People operations')
  // The HR admin persona (docs/PLAN.md 13.3).
  person('HRIS Lead', 'P5', 'San Jose', poAm.idx, 'HRIS', 'hris-lead')
  person('Senior HRIS Analyst', 'P4', 'Raleigh', poAm.idx, 'HRIS')
  person('HR Operations Specialist', 'P2', 'Bengaluru', poApac.idx, 'People operations')
  person('HR Operations Specialist II', 'P3', 'Hsinchu', poApac.idx, 'People operations')
  person('Benefits Specialist', 'P2', 'Bengaluru', poApac.idx, 'Benefits')
  person('Leave and Accommodation Specialist II', 'P3', 'Bengaluru', poApac.idx, 'People operations')
  person('Senior Global Mobility Specialist', 'P4', 'San Jose', dirPo.idx, 'Global mobility')
  person('Lead Employee Relations Partner', 'P5', 'San Jose', dirPo.idx, 'Employee relations')
  person('Compensation and Equity Specialist II', 'P3', 'San Jose', dirPo.idx, 'Total rewards')

  const tr = person('Total Rewards Manager', 'M1', 'San Jose', cpo, 'Total rewards')
  person('Compensation Analyst II', 'P3', 'San Jose', tr.idx, 'Total rewards')
  person('Senior Compensation Analyst', 'P4', 'San Jose', tr.idx, 'Total rewards')

  const americas = new Set(['San Jose', 'Austin', 'Raleigh', 'Boulder', 'Seattle'])
  const canada = new Set(['Toronto', 'Vancouver'])
  const desk = (s: Seat, covers: RecruiterDesk['covers']): RecruiterDesk => ({ person: holder(s), covers })
  w.recruiters = [
    desk(r5, (bu, _d, s) => s === 'Bengaluru' && bu === SE),
    desk(r6, (_b, _d, s) => s === 'Bengaluru'),
    desk(r7, (_b, _d, s) => s === 'Hsinchu' || s === 'Shanghai' || s === 'Ho Chi Minh City'),
    desk(r8, (_b, _d, s) => s === 'Munich' || s === 'Haifa'),
    desk(r9, (bu) => bu === GTM || bu === CORP || bu === EO),
    desk(r1, (bu, d) => bu === SE && ['Architecture', 'Digital Design', 'Design Verification'].includes(d)),
    desk(r2, (bu) => bu === SE),
    desk(r4, (bu, _d, s) => bu === SS && (canada.has(s) || s === 'Seattle')),
    desk(r3, (bu, _d, s) => americas.has(s) || canada.has(s) || bu === OPS),
  ]
  w.hrbp = new Map([
    [SE, holder(hrbpSe)],
    [SS, holder(hrbpSs)],
    [OPS, holder(hrbpOps)],
    [GTM, holder(hrbpGtm)],
    [CORP, holder(hrbpCorp)],
    [EO, holder(dirHrbp)],
  ])
}

/** Today's organization: every Filled seat at 30 Sep 2026 with its holder (no dates yet but executives'). */
export function buildOrg(rng: Rng, names: NameBook): World {
  const w: World = {
    seats: [],
    people: [],
    execs: new Map(),
    hrbp: new Map(),
    named: new Map(),
    recruiters: [],
    reqs: [],
    requests: [],
  }
  const ctx: Ctx = { w, rng, names }
  for (const slot of EXEC_SLOTS) {
    const spec = deptSpec(slot.dept)
    const s = seatWithHolder(
      ctx,
      {
        bu: spec.bu,
        dept: slot.dept,
        site: slot.site,
        level: slot.level,
        title: slot.title,
        family: 'Executive leadership',
        mgr: slot.boss ? w.execs.get(slot.boss)! : null,
        role: 'exec',
      },
      day(slot.hire),
    )
    s.tags.add(`exec:${slot.key}`)
    w.execs.set(slot.key, s.idx)
  }
  buildExecutiveOffice(ctx)
  for (const spec of DEPTS) if (!spec.explicit) buildDept(spec, ctx)
  buildPeopleTeam(ctx)

  // The FP&A director reports to the CFO (the FP&A lead persona).
  const fpa = w.seats.find((s) => s.title === 'Director, FP&A')!
  fpa.mgr = w.execs.get('cfo')!
  fpa.tags.add('fpa-lead')
  // The manager below Manager C reports to C.
  const c = w.seats.find((s) => s.tags.has('manager-c'))!
  const cSub = w.seats.find((s) => s.tags.has('manager-c-sub'))!
  cSub.mgr = c.idx
  return w
}
