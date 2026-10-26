/**
 * Pending requests never price a person (docs/PLAN.md 7.2 rules 3 and 4, 6.9, C18, 16.1). In every
 * mode but HR admin with the switch, each of a pending Elimination, Level change and Location change
 * on one Filled seat, and a pending Elimination on one accepted-offer seat, is crawled with and
 * without it, then again with that seat's `baseSalary` (or `offerBase`) perturbed: the set of values
 * that change and every delta between the two crawls are the same for both salaries, so what a
 * pending request moves never depends on the person's pay. In HRBP and Leader mode, sweeping the
 * Elimination's effective date over every day of the fiscal year moves only the atom's band part,
 * never its filled part. The HR admin control with pay amounts shown must differ.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { atomOf } from '@/cost/atoms'
import type { AnalyticsContext } from '@/data/context'
import { FY27_WORKING, type Sample } from '@/data/sample'
import { assumptionsOf } from '@/data/sample/base'
import { guardedAsksCost, ratesOf, unitOrg, workingAsksContext } from '@/data/sample/routing'
import { unitWorkingLines } from '@/data/sample/trades'
import { versionFrame } from '@/data/sample/versions'
import { LEVELS, type Level, PENDING_REQUEST_STATES } from '@/data/schema'
import { fxRatesFromAssumptions } from '@/plan/engine/fx'
import { fromRow } from '@/plan/engine/requests'
import type { HcRequest } from '@/plan/types'
import { type Crawl, crawl, type Seen } from '@/testkit/crawl'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { type Change, changesOf, daysOf, isNoise } from '@/testkit/moves'
import {
  ctxAs,
  leakSample,
  personaOf,
  pinClock,
  sampleCtx,
  seatViewers,
  step,
  unpinClock,
  withPlanRequests,
  withReq,
  withSalaryDelta,
} from '@/testkit/sample'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  pinClock()
  s = leakSample()
}, 120_000)
afterAll(() => unpinClock())

const DELTA = 9_137

/** A Filled seat with no reports in the DV director's tree, its holder, its manager seat and holder. */
function filledSeat() {
  const d = s.datasets
  const dir = personaOf(s, 'leader-dv-director')
  const kids = (id: string) => d.positions.filter((p) => p.managerPositionId === id).map((p) => p.positionId)
  const mgrs = kids(dir.positionId)
  for (const m of mgrs)
    for (const id of kids(m)) {
      if (kids(id).length) continue
      const w = d.workers.find(
        (x) => x.positionId === id && x.workerType === 'Employee' && !x.assignmentEnd && !x.terminationDate,
      )
      const mh = d.workers.find(
        (x) => x.positionId === m && x.workerType === 'Employee' && !x.assignmentEnd && !x.terminationDate,
      )
      if (w && mh) return { seat: id, holder: w.employeeId, manager: m, managerHolder: mh.employeeId }
    }
  throw new Error('No Filled seat in the DV director tree.')
}

/** The latest row of a position. */
const rowOf = (id: string) =>
  s.datasets.positions
    .filter((p) => p.positionId === id)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1))[0]

/** A pending request on a seat, raised by its manager and waiting on the unit HRBP. */
function pending(
  id: string,
  type: HcRequest['type'],
  seat: string,
  requester: string,
  patch: Partial<HcRequest>,
): HcRequest {
  const r = rowOf(seat)
  const v = seatViewers(s, seat)
  const at = `${s.asOf}T07:00:00.000Z`
  return {
    requestId: id,
    type,
    state: 'In review',
    reasonCode: 'Other',
    requesterId: requester,
    submittedById: requester,
    submittedAt: at,
    updatedAt: at,
    positionId: seat,
    managerPositionId: r.managerPositionId as string,
    businessUnit: r.businessUnit,
    department: r.department ?? null,
    costCenter: r.costCenter,
    level: r.level,
    location: r.location,
    jobTitle: r.title ?? null,
    fte: r.fte ?? 1,
    startDate: '2026-12-31',
    priority: null,
    cycleId: null,
    confidential: false,
    exception: null,
    steps: [
      step({ n: 1, role: 'hrbp', approverId: v.hrbp, enteredAt: at }),
      step({ n: 2, role: 'leader', approverId: v.leader }),
    ],
    comments: [],
    changes: null,
    trade: null,
    transfer: null,
    outcome: null,
    ...patch,
  }
}

interface Case {
  what: string
  request: HcRequest
  /** The sample with the seat's person's pay (or offer) perturbed. */
  perturbed: Sample
}

function cases(): Case[] {
  const f = filledSeat()
  const r = rowOf(f.seat)
  const next = LEVELS[LEVELS.indexOf(r.level) + 1] as Level
  const other = r.location === 'Austin' ? 'Raleigh' : 'Austin'
  const offer = s.planted.hsinchuOffers[0]
  const oReq = s.datasets.reqs.find((x) => x.reqId === offer.reqId)
  const oMgr = rowOf(offer.positionId).managerPositionId as string
  const oMgrHolder = s.datasets.workers.find((x) => x.positionId === oMgr && !x.assignmentEnd)
    ?.employeeId as string
  const salary = withSalaryDelta(s, f.holder, DELTA)
  return [
    {
      what: 'Elimination of a Filled seat',
      request: pending('R-9801', 'Elimination', f.seat, f.managerHolder, { reasonCode: 'Restructure' }),
      perturbed: salary,
    },
    {
      what: 'Level change of a Filled seat',
      request: pending('R-9802', 'Level change', f.seat, f.managerHolder, {
        level: next,
        startDate: '2026-11-01',
      }),
      perturbed: salary,
    },
    {
      what: 'Location change of a Filled seat',
      request: pending('R-9803', 'Location change', f.seat, f.managerHolder, {
        location: other,
        startDate: '2026-11-01',
      }),
      perturbed: salary,
    },
    {
      what: 'Elimination of an accepted-offer seat',
      request: pending('R-9804', 'Elimination', offer.positionId, oMgrHolder, { startDate: '2027-01-31' }),
      perturbed: withReq(s, offer.reqId, { offerBase: (oReq?.offerBase ?? 0) + DELTA * 30 }),
    },
  ]
}

/** The modes but HR admin with the switch, each acting as someone who sees the seat. */
function modes(seat: string, requester: string): { key: string; ctx: (x: Sample) => AnalyticsContext }[] {
  const v = seatViewers(s, seat)
  const fpa = personaOf(s, 'finance-fpa').employeeId
  return [
    { key: `manager ${requester}`, ctx: (x) => ctxAs('manager', requester, { sample: x }) },
    { key: `hrbp ${v.hrbp}`, ctx: (x) => ctxAs('hrbp', v.hrbp, { sample: x, unit: v.unit }) },
    { key: `leader ${v.leader}`, ctx: (x) => ctxAs('leader', v.leader, { sample: x }) },
    { key: `finance ${fpa}`, ctx: (x) => ctxAs('finance', fpa, { sample: x }) },
    { key: 'hr-admin', ctx: (x) => sampleCtx('hr-admin', { sample: x }) },
  ]
}

/* ───────────── deltas ───────────── */

const NUM = /-?\d[\d,]*(?:\.\d+)?/g

/** A text's numbers and what is left around them. */
function split(text: string): { skeleton: string; numbers: number[]; units: number[] } {
  const numbers: number[] = []
  const units: number[] = []
  const skeleton = text.replace(NUM, (m) => {
    numbers.push(Number(m.replace(/,/g, '')))
    const dec = m.split('.')[1]?.length ?? 0
    units.push(10 ** -dec)
    return '#'
  })
  return { skeleton, numbers, units }
}

/** What a change did, as a comparable value: a number's delta, a text's number deltas, or the pair. */
function deltaOf(c: Change): { kind: string; value: unknown; tol: number[] } {
  const a = c.before?.value
  const b = c.after?.value
  if (typeof a === 'number' && typeof b === 'number') return { kind: 'number', value: [b - a], tol: [0.01] }
  if (typeof a === 'string' && typeof b === 'string') {
    const x = split(a)
    const y = split(b)
    if (x.skeleton === y.skeleton && x.numbers.length === y.numbers.length)
      return {
        kind: `text ${y.skeleton}`,
        value: y.numbers.map((n, i) => n - x.numbers[i]),
        tol: y.units.map((u, i) => Math.max(u, x.units[i]) * 1.01),
      }
  }
  return { kind: 'pair', value: [a ?? null, b ?? null], tol: [] }
}

/** Where the two diffs part: a value that changed in one only, or changed by another delta. */
function partings(one: readonly Change[], two: readonly Change[]): string[] {
  const keep = (c: Change) => !isNoise(c) && !(c.after ?? c.before)?.tag.derived
  const a = new Map(one.filter(keep).map((c) => [c.where, c]))
  const b = new Map(two.filter(keep).map((c) => [c.where, c]))
  const out: string[] = []
  for (const [w, c] of a) {
    const d = b.get(w)
    if (!d) {
      out.push(`changes with one salary only: ${w}`)
      continue
    }
    const x = deltaOf(c)
    const y = deltaOf(d)
    const same =
      x.kind === y.kind &&
      (x.kind === 'pair'
        ? JSON.stringify(x.value) === JSON.stringify(y.value)
        : (x.value as number[]).every(
            (v, i) => Math.abs(v - (y.value as number[])[i]) <= Math.max(x.tol[i] ?? 0, y.tol[i] ?? 0),
          ))
    if (!same)
      out.push(`moves by another delta: ${w}: ${JSON.stringify(x.value)} vs ${JSON.stringify(y.value)}`)
  }
  for (const w of b.keys()) if (!a.has(w)) out.push(`changes with the other salary only: ${w}`)
  return out
}

describe('a pending request moves the same whatever the person is paid (C18)', () => {
  it('gives the same changes and deltas for both salaries, in every mode but HR admin with the switch', () => {
    const problems: string[] = []
    let moved = 0
    let runs = 0
    for (const k of cases()) {
      for (const m of modes(k.request.positionId as string, k.request.requesterId)) {
        const read = (x: Sample): Crawl => crawl(m.ctx(x), { focus: 'money' })
        const d1 = changesOf(read(s).seen, read(withPlanRequests(s, [k.request])).seen)
        const d2 = changesOf(read(k.perturbed).seen, read(withPlanRequests(k.perturbed, [k.request])).seen)
        moved += d1.length
        runs++
        for (const p of partings(d1, d2).slice(0, 5)) problems.push(`${k.what} | ${m.key} | ${p}`)
      }
    }
    expect(problems.slice(0, 40).join('\n')).toBe('')
    expect(runs).toBe(20)
    // Non-vacuity: the requests do move what each mode sees (counts, queues, asks).
    expect(moved).toBeGreaterThan(100)
  }, 1_800_000)

  it('control: HR admin with pay amounts shown sees the perturbed salary', () => {
    const k = cases()[0]
    const admin = (x: Sample) =>
      crawl(sampleCtx('hr-admin', { sample: x, showPay: true }), {
        views: ['plan'],
        pages: false,
        help: false,
        files: false,
        cards: false,
        focus: 'money',
      })
    expect(changesOf(admin(s).seen, admin(k.perturbed).seen).length).toBeGreaterThan(0)
  }, 300_000)
})

/* ───────────── the effective date sweep ───────────── */

describe("sweeping a pending Elimination's effective date moves only the band part (7.2 rule 3)", () => {
  it("keeps every atom's filled part, to the cent, for every day of the fiscal year", () => {
    const k = cases()[0]
    const unit = k.request.businessUnit
    const data = s.datasets
    const rows = assumptionsOf(data, FY27_WORKING)
    const rates = ratesOf(
      rows,
      fxRatesFromAssumptions(rows),
      versionFrame(FY27_WORKING),
      null,
      data.positions,
    )
    const all = [...data.requests.map(fromRow), k.request]
    const asksCtx = workingAsksContext(data, rates, '2026-10', all)
    const lines = unitWorkingLines(data, unit, s.plan.closes)
    const index = s.plan.closes.at(-1)?.atoms ?? s.plan.closes[0].atoms
    const latest = new Map(data.positions.map((p) => [p.positionId, p]))
    const managerOf = (id: string) => latest.get(id)?.managerPositionId ?? null
    const atom = atomOf(k.request.positionId as string, index, managerOf) as string
    const others = data.requests.map(fromRow).filter((r) => PENDING_REQUEST_STATES.includes(r.state))
    let baseline: number | null = null
    const bands = new Set<number>()
    for (const day of daysOf('FY27')) {
      const g = guardedAsksCost({
        lines,
        requests: [...others, { ...k.request, startDate: day }],
        fiscalYear: 'FY27',
        org: unitOrg(unit),
        ctx: asksCtx,
        index,
        managerOf,
      })
      const own = g.atoms.find((a) => a.atomId === atom)
      expect(own, day).toBeTruthy()
      const filled = Math.round((own?.filled ?? 0) * 100)
      baseline ??= filled
      expect(filled, day).toBe(baseline)
      bands.add(Math.round((own?.band ?? 0) * 100))
    }
    // Non-vacuity: the sweep moves the band part (an Elimination's band effect runs from its date).
    expect(bands.size).toBeGreaterThan(100)
  }, 600_000)

  it("leaves the filled parts on HRBP's and the leader's calculation cards as they were, month by month", () => {
    const k = cases()[0]
    const v = seatViewers(s, k.request.positionId as string)
    const filledParts = (x: Seen[]) =>
      new Map(
        x
          .filter((y) => y.tag.card === 'input' && /filled part, rounded down/.test(y.tag.label ?? ''))
          .map((y) => [y.where, y.value]),
      )
    for (const ctxOf of [
      (x: Sample) => ctxAs('hrbp', v.hrbp, { sample: x, unit: v.unit }),
      (x: Sample) => ctxAs('leader', v.leader, { sample: x }),
    ]) {
      const read = (x: Sample) =>
        crawl(ctxOf(x), {
          views: ['targets', 'home'],
          focus: 'money',
          pages: false,
          files: false,
          cards: false,
        })
      const base = filledParts(read(s).seen)
      expect(base.size).toBeGreaterThan(0)
      for (const day of [
        '2026-04-01',
        '2026-06-15',
        '2026-09-30',
        '2026-10-01',
        '2026-12-31',
        '2027-02-14',
        '2027-03-31',
      ]) {
        const after = filledParts(read(withPlanRequests(s, [{ ...k.request, startDate: day }])).seen)
        for (const [w, val] of base) expect(after.get(w), `${day} ${w}`).toBe(val)
      }
    }
  }, 600_000)
})
