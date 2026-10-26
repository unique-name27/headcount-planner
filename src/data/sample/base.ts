/**
 * Northgate Semiconductor, the sample company: the base generator (docs/PLAN.md 13.1 to 13.3).
 * `generateSampleBase()` is pure and synchronous and returns the eight datasets, the personas, the
 * day each row was known (for `asKnownOn`, which gives the datasets as they stood on a date, so a
 * lock is computed "as of" its day) and the planted story rows by ID. `generateSample()`
 * (generate.ts) builds the versions (Budget and Q1 Reforecast locked from `asKnownOn`), the closes,
 * the FY28 cycle, story 9's trade and the plan state on top of it; raw/ builds the messy extracts.
 *
 * Streams (`rngFor(name)`, the frozen seed XOR the name's FNV-1a hash). Each is drawn by one module
 * only, and a module that adds people draws their names from its own stream through
 * `NameBook.withRng`, so tuning one module never moves another's rows:
 *
 *   'org'        org.ts        today's 1,450 Filled seats and their holders
 *   'names'      names.ts      the names buildOrg hands out
 *   'positions'  positions.ts  seat histories, leavers, openings, eliminations (story 9's headroom)
 *   'requests'   requests.ts   the planned requests and their step times
 *   'workers'    workers.ts    hire dates, known exits, leave, story 7, contractors and interns
 *   'comp'       comp.ts       pay rows
 *   'reqs'       reqs.ts       offer amounts and one-time items
 *
 * assumptions.ts, targets.ts, freezes.ts and personas.ts draw nothing. New modules take new stream
 * names and run after these, so a calibrated story never moves. positions.ts `seatRemotes` draws
 * nothing either: it seats departments.ts's `remote` engineers at their site after the workers are
 * planted and before comp.ts prices them (story 5's fold).
 *
 * IDs: positions P-1001 up in creation order, employees E10001 up in hire order (contractors and
 * interns too), reqs REQ-4001 up in opened order, requests R-1001 up in raised order, never reused.
 * A later module numbers what it adds after the last ID here.
 *
 * For wave 2: lock the FY27 Budget from `asKnownOn(base, '2026-03-20')` and the Q1 Reforecast from
 * `asKnownOn(base, '2026-07-15')` with each version's own assumption rows (`assumptionsOf`). The FY27
 * merit rows are dated, and recorded, on 1 Apr 2026, so the Budget prices FY27 merit by the 3.5%
 * assumption; story org exits after the lock were noticed after it, so the Budget keeps their
 * leavers. base.test.ts checks the seat-by-seat match of stories 1, 2 and 5 on these views.
 */

import { assumptionLookup } from '@/plan/engine/assumptions'
import { standardHeadOf, type TradePosition, tradeRatesOf } from '@/plan/engine/band'
import { reqAsOf } from '@/plan/engine/cost'
import { toAssignments } from '@/plan/engine/heads'
import { fromRow } from '@/plan/engine/requests'
import { seatDetailOn, seatHistories } from '@/plan/engine/versions'
import { fiscalYearOf } from '../fiscal'
import {
  type AssumptionRow,
  type Datasets,
  type FiscalYear,
  type ISODate,
  type PositionRow,
  siteByLocation,
  type WorkerRow,
} from '../schema'
import { FY27_BUDGET, FY28_WORKING, PLAN_FX, sampleAssumptions, versionSpec } from './assumptions'
import { AS_OF, BUDGET_LOCK, iso, isoOrNull } from './calendar'
import { buildComp } from './comp'
import { costCenter } from './departments'
import { CORPORATE_FREEZE_ID, sampleFreezes } from './freezes'
import { NameBook } from './names'
import { buildOrg, type World } from './org'
import { type Persona, samplePersonas } from './personas'
import { addEliminations, buildPositions, seatRemotes } from './positions'
import { rngFor } from './prng'
import { priceReqs, reqRows } from './reqs'
import { planRequests, planSteps, requestAsKnownOn, requestRows } from './requests'
import { sampleTargets } from './targets'
import { assignHireDates, plantWorkers, type WorkerKnown, workerRows } from './workers'

export const SAMPLE_COMPANY = 'Northgate Semiconductor'
export const SAMPLE_AS_OF: ISODate = iso(AS_OF)
export const BUDGET_LOCK_DATE: ISODate = iso(BUDGET_LOCK)
export { FY27_BUDGET, FY27_Q1_REFORECAST, FY27_WORKING, FY28_WORKING, SAMPLE_VERSIONS } from './assumptions'
export type { Persona, PersonaKey } from './personas'

/** The day each row was known, parallel to each dataset's rows. */
export interface KnownDates {
  positions: readonly ISODate[]
  workers: readonly WorkerKnown[]
  comp: readonly ISODate[]
  targets: readonly ISODate[]
  freezes: readonly ISODate[]
  assumptions: readonly ISODate[]
}

/** The planted story rows (docs/PLAN.md 13.3 and 13.4), by ID. */
export interface Planted {
  /** Story 1: Go-to-Market seats the Budget planned for October to March that started by September. */
  earlyStarts: string[]
  /** Story 2: Silicon Engineering's 10 Bengaluru seats still Open past their target start. */
  lateBengaluru: string[]
  /** Story 2: the 6 Hsinchu offers 25 to 30% above midpoint. */
  hsinchuOffers: { positionId: string; reqId: string }[]
  /** Story 3: the seats left by an exit, the new seats beside them and the Backfill requests naming the new ones. */
  story3: { exitPositionIds: string[]; newPositionIds: string[]; backfillRequestIds: string[] }
  /** Story 4: the freeze, Corporate's 3 Open seats in Interviewing and its 1 honored offer. */
  corporateFreezeId: string
  corporateInterviewing: string[]
  corporateOffer: { positionId: string; reqId: string }
  /** Story 4: the two freeze exception requests. */
  freezeExceptions: string[]
  /** Story 7: employees not in plan and the employees whose worker row names another cost center. */
  notInPlan: string[]
  costCenterMismatches: string[]
  /** Story 9: the Planned P5 San Jose give seat and the S&S seats eliminated for headroom. */
  tradeGive: string
  headroom: string[]
  /** 13.4: the Munich P4 Planned seat, approved 10 Jun 2026, and the request that made it. */
  munichP4: { positionId: string; requestId: string }
  managerAOpen: string
  managerANewRole: string
  managerBOpen: string[]
  managerCElimination: string
  /** 7.3(d): the Open manager seat raised to M2 on 10 Sep 2026. */
  raisedToM2: string
  internalMove: string
  positionMove: string
  crossUnitMove: string
  levelChange: string
  locationChange: string
  /** Filled Operations seat eliminated on 30 Jun 2026 (severance booked in July). */
  eliminatedFilled: string
  partTime: string[]
  onLeave: string[]
  unpaidLeave: string[]
  knownExits: string[]
}

export interface SampleBase {
  datasets: Datasets
  personas: Persona[]
  known: KnownDates
  planted: Planted
  /** S&S Budget seats eliminated so its FY27 asks sit 8 heads under its target (story 9). */
  headroom: number
  /** The standard head in USD (11.2): FY27's from the Budget (in every FY27 version), FY28's from FY28 Working. */
  standardHead: { FY27: number; FY28: number }
  /** The generator's model, for the wave 2 modules (stints, leave spells, tags). */
  world: World
}

/* ───────────────────────── IDs ───────────────────────── */

function assignIds(w: World): void {
  const seats = w.seats.slice().sort((a, b) => a.created - b.created || a.idx - b.idx)
  seats.forEach((s, i) => {
    s.id = `P-${1001 + i}`
  })
  const people = w.people.slice().sort((a, b) => a.hire - b.hire || a.idx - b.idx)
  people.forEach((p, i) => {
    p.id = `E${10_001 + i}`
  })
  const reqs = w.reqs.slice().sort((a, b) => a.opened - b.opened || a.idx - b.idx)
  reqs.forEach((r, i) => {
    r.id = `REQ-${4001 + i}`
  })
  const raised = (q: World['requests'][number]) => q.submitted ?? q.updated
  const requests = w.requests
    .slice()
    .sort((a, b) => raised(a) - raised(b) || a.minute - b.minute || a.idx - b.idx)
  requests.forEach((q, i) => {
    q.id = `R-${1001 + i}`
  })
}

/* ───────────────────────── positions rows ───────────────────────── */

function positionRows(w: World): { rows: PositionRow[]; known: ISODate[] } {
  const rows: PositionRow[] = []
  const known: ISODate[] = []
  const id = (i: number | null | undefined) => (i == null ? null : w.seats[i].id)
  for (const s of w.seats.slice().sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (s.rows.length === 0) throw new Error(`Seat ${s.id} has no rows.`)
    const events = s.rows.slice().sort((a, b) => a.from - b.from)
    // One row a day: a later event on the same day replaces the earlier one.
    const daily = events.filter((e, i) => i === events.length - 1 || events[i + 1].from !== e.from)
    const site = siteByLocation.get(s.site)!
    for (const e of daily) {
      rows.push({
        positionId: s.id,
        effectiveDate: iso(e.from),
        status: e.status,
        title: e.title,
        jobFamily: s.family,
        level: e.level,
        businessUnit: s.bu,
        department: s.dept,
        costCenter: costCenter(s.dept, s.site),
        location: s.site,
        legalEntity: site.legalEntity,
        managerPositionId: id(e.mgr !== undefined ? e.mgr : s.mgr),
        workerType: 'Employee',
        fte: s.fte,
        startDate: isoOrNull(e.startDate),
        openedDate: isoOrNull(e.openedDate),
        reqType: e.reqType,
        leaderLevel: null,
        endDate: isoOrNull(e.endDate),
        endReason: e.endReason,
        sourceRequestId: e.request != null ? w.requests[e.request].id : null,
      })
      known.push(iso(e.known))
    }
  }
  return { rows, known }
}

/* ───────────────────────── as known on a date ───────────────────────── */

/**
 * The datasets as they stood on day d (docs/PLAN.md 13.2: locked lines are computed by the same
 * engine "as of" the lock date): position rows, comp rows, targets, freezes and assumption rows
 * recorded by then; worker rows whose assignment started by then, with an end or termination not yet
 * known cleared and leave as it was that day; reqs opened by then, read through `reqAsOf`; requests
 * raised by then, with later decisions undone (`requestAsKnownOn`).
 */
export function asKnownOn(base: Pick<SampleBase, 'datasets' | 'known'>, d: ISODate): Datasets {
  const { datasets: ds, known } = base
  const keep = <T>(rows: readonly T[], days: readonly ISODate[]) => rows.filter((_, i) => days[i] <= d)
  const workers: WorkerRow[] = []
  ds.workers.forEach((r, i) => {
    const k = known.workers[i]
    if (k.start > d) return
    let row = r
    if (row.terminationDate && k.termKnown != null && k.termKnown > d) row = { ...row, terminationDate: null }
    if (row.assignmentEnd && k.endKnown != null && k.endKnown > d) row = { ...row, assignmentEnd: null }
    if (row.onLeave && (k.leaveFrom == null || k.leaveFrom > d))
      row = { ...row, onLeave: null, leavePaid: null }
    workers.push(row)
  })
  const reqs = []
  for (const r of ds.reqs) {
    const k = reqAsOf(r, d)
    if (k) reqs.push(k)
  }
  const requests = []
  for (const r of ds.requests) {
    const k = requestAsKnownOn(r, d)
    if (k) requests.push(k)
  }
  return {
    positions: keep(ds.positions, known.positions),
    workers,
    comp: keep(ds.comp, known.comp),
    reqs,
    requests,
    targets: keep(ds.targets, known.targets),
    freezes: keep(ds.freezes, known.freezes),
    assumptions: keep(ds.assumptions, known.assumptions),
  }
}

/* ───────────────────────── the standard head ───────────────────────── */

/**
 * The standard head (11.2): Σ band estimate ÷ Σ FTE over the approved Employee positions on `at`,
 * Filled seats at band (never HRIS pay), rounded to the nearest $1,000, priced with the version's
 * bands, loads and plan rates.
 */
export function standardHeadFrom(data: Datasets, versionId: string, at: ISODate): number {
  const spec = versionSpec(versionId)
  const seats = seatHistories({
    positions: data.positions,
    assignments: toAssignments(data.workers),
    reqs: data.reqs,
    requests: data.requests.map(fromRow),
  })
  const positions: TradePosition[] = []
  for (const seat of seats.values()) {
    const s = seatDetailOn(seat, at)
    if (!s?.approvedHead || s.position.workerType !== 'Employee') continue
    positions.push({
      positionId: s.positionId,
      level: s.position.level,
      location: s.position.location,
      fte: s.position.fte,
      orgPositionId: s.position.managerPositionId ?? s.positionId,
    })
  }
  const fy: FiscalYear = fiscalYearOf(at)
  const rates = tradeRatesOf({
    version: { versionId, name: spec.name, fiscalYear: fy },
    lockHash: null,
    lookup: assumptionLookup(data.assumptions, spec),
    planRate: (c) => PLAN_FX[c] ?? null,
    orgPathOf: () => null,
  })
  return standardHeadOf(positions, rates)
}

/* ───────────────────────── the generator ───────────────────────── */

export function generateSampleBase(): SampleBase {
  const names = new NameBook(rngFor('names'))
  const w = buildOrg(rngFor('org'), names)

  const positionsRng = rngFor('positions')
  const positionNames = names.withRng(positionsRng)
  buildPositions(w, positionsRng, positionNames)
  const requestsRng = rngFor('requests')
  planRequests(w, requestsRng)
  const headroom = addEliminations(w, positionsRng, positionNames)
  planSteps(w, requestsRng)

  const workersRng = rngFor('workers')
  assignHireDates(w, workersRng)
  const plants = plantWorkers(w, workersRng, names.withRng(workersRng))
  seatRemotes(w)
  assignIds(w)

  const comp = buildComp(w, rngFor('comp'))
  priceReqs(w, rngFor('reqs'), comp.hireBase)

  const positions = positionRows(w)
  const workers = workerRows(w)
  const freezes = sampleFreezes()
  const datasets: Datasets = {
    positions: positions.rows,
    workers: workers.rows,
    comp: comp.rows,
    reqs: reqRows(w),
    requests: requestRows(w),
    targets: [],
    freezes: freezes.rows,
    assumptions: [],
  }
  const known: KnownDates = {
    positions: positions.known,
    workers: workers.known,
    comp: comp.known,
    targets: [],
    freezes: freezes.known,
    assumptions: [],
  }

  // Assumptions without the standard head first: it is computed from them (bands, loads, plan FX).
  const draft = sampleAssumptions()
  const withDraft = {
    datasets: { ...datasets, assumptions: draft.rows },
    known: { ...known, assumptions: draft.known },
  }
  const budgetView = asKnownOn(withDraft, BUDGET_LOCK_DATE)
  const s27 = standardHeadFrom(budgetView, FY27_BUDGET, '2027-03-31')
  const s28 = standardHeadFrom(withDraft.datasets, FY28_WORKING, '2028-03-31')
  const assumptions = sampleAssumptions((v) => (versionSpec(v).fiscalYear === 'FY28' ? s28 : s27))
  datasets.assumptions = assumptions.rows
  known.assumptions = assumptions.known

  const targets = sampleTargets(datasets, asKnownOn({ datasets, known }, BUDGET_LOCK_DATE))
  datasets.targets = targets.rows
  known.targets = targets.known

  return {
    datasets,
    personas: samplePersonas(w),
    known,
    planted: planted(w, plants),
    headroom,
    standardHead: { FY27: s27, FY28: s28 },
    world: w,
  }
}

function planted(w: World, plants: ReturnType<typeof plantWorkers>): Planted {
  const seats = (tag: string) =>
    w.seats
      .filter((s) => s.tags.has(tag))
      .map((s) => s.id)
      .sort()
  const seat = (tag: string) => seats(tag)[0]
  const request = (tag: string) =>
    w.requests
      .filter((q) => q.tags.has(tag))
      .map((q) => q.id)
      .sort()
  const people = (idx: readonly number[]) => idx.map((i) => w.people[i].id).sort()
  const offerOf = (tag: string) =>
    w.seats
      .filter((s) => s.tags.has(tag))
      .map((s) => ({
        positionId: s.id,
        reqId: w.reqs.find((r) => r.seat === s.idx && r.stage === 'Offer accepted')!.id,
      }))
      .sort((a, b) => (a.positionId < b.positionId ? -1 : 1))
  return {
    earlyStarts: seats('early-start'),
    lateBengaluru: seats('late-blr'),
    hsinchuOffers: offerOf('hsinchu-offer'),
    story3: {
      exitPositionIds: seats('story3-exit'),
      newPositionIds: seats('story3-new'),
      backfillRequestIds: request('story3-backfill'),
    },
    corporateFreezeId: CORPORATE_FREEZE_ID,
    corporateInterviewing: seats('corp-interviewing'),
    corporateOffer: offerOf('corp-offer')[0],
    freezeExceptions: request('freeze-exception'),
    notInPlan: people(plants.notInPlan),
    costCenterMismatches: people(plants.mismatches),
    tradeGive: seat('trade-give'),
    headroom: seats('headroom'),
    munichP4: { positionId: seat('munich-p4'), requestId: request('munich-p4')[0] },
    managerAOpen: seat('manager-a-open'),
    managerANewRole: request('manager-a-new-role')[0],
    managerBOpen: seats('manager-b-open'),
    managerCElimination: request('manager-c-elimination')[0],
    raisedToM2: seat('raised-to-m2'),
    internalMove: request('internal-move')[0],
    positionMove: request('position-move')[0],
    crossUnitMove: request('cross-unit-move')[0],
    levelChange: request('level-change')[0],
    locationChange: request('location-change')[0],
    eliminatedFilled: seat('eliminated-filled'),
    partTime: seats('part-time'),
    onLeave: people(plants.onLeave),
    unpaidLeave: people(plants.onLeave.filter((i) => w.people[i].leave?.paid === false)),
    knownExits: people(plants.knownExits),
  }
}

/** The assumption rows of one version (by ID). */
export const assumptionsOf = (data: Datasets, versionId: string): AssumptionRow[] =>
  data.assumptions.filter((r) => r.version === versionId)
