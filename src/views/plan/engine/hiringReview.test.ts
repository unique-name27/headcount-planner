/**
 * Plan > Hiring's review fixes of 25 Oct 2026 (docs/M4-REPORT.md "Hiring progress", review findings
 * HN-1 to HN-11, HU-1 to HU-14 and HP-1 to HP-5): each case builds the state the finding named on the
 * sample (an approved Elimination of Manager C's seat, an internal move across units held in the plan
 * or dated ahead in the HRIS, a backfill offer on a Filled seat, a rehire, a person not in plan with
 * a last day, FY28 shown, a past fiscal year, no close, an as-of date before the last close, a
 * recruiter note with an amount) and holds the tab to what it should read, with a control where the
 * old reading would differ. Heads only throughout.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { HIRING_DRILL_HIDE, type HiringDrillKind } from '@/access/ids'
import { listsInForce } from '@/access/lists'
import type { Column } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import { unitHrbps } from '@/data/lists/roles'
import type { Sample } from '@/data/sample'
import type { ISODate, PositionRow, ReqRow, WorkerRow } from '@/data/schema'
import { type CalcSpec, calcProblems, resolveCalc } from '@/drill/calc'
import { buildDrillTable } from '@/drill/records'
import { type DrillSource, type DrillSpec, resolveDrill } from '@/drill/types'
import { hiringOf } from '@/plan/engine/hiring'
import { fromRow } from '@/plan/engine/requests'
import { amountsIn } from '@/testkit/leaks'
import {
  ctxAs,
  leakSample,
  personaOf,
  sampleCtx,
  sampleSources,
  withDatasets,
  withPlan,
} from '@/testkit/sample'
import { prepare as forecastPrepare } from '@/views/forecast/engine/base'
import { forecastFlows } from '@/views/forecast/engine/heads'
import { teamModel } from '@/views/team/engine'
import { ID } from '../metrics'
import { planModel } from '.'
import { hiringForecast, hiringPrepOf } from './hiringData'
import { BACKFILLS_ONLY_TEXT, ENDED_NOTE, NOTHING_TO_HIRE_TEXT, PACE_NEEDS_TEXT } from './hiringModel'
import { NOT_CLOSING_TEXT, type PlanHiring, planHiringModel } from './hiringTab'

let s: Sample
let seH: string
let gtmH: string
let opsH: string
const SE = 'Silicon Engineering'
const GTM = 'Go-to-Market'
const OPS = 'Operations'
const AS_OF: ISODate = '2026-09-30'

beforeAll(() => {
  s = leakSample()
  const hrbps = unitHrbps(listsInForce(null, s.datasets, sampleSources(s.datasets)))
  seH = hrbps.get(SE) as string
  gtmH = hrbps.get(GTM) as string
  opsH = hrbps.get(OPS) as string
}, 120_000)

/* ───────────── reading the model ───────────── */

const row = (m: PlanHiring, key: string) => m.quarters.rows.find((r) => r.key === key)
const tile = (m: PlanHiring, id: string) => m.kpis.find((k) => k.id === id)
const cardOf = (src: unknown): CalcSpec => resolveCalc(src as never) as CalcSpec
const col = (m: PlanHiring, k: string) => m.quarters.columns.find((c) => c.key === k) as Column
const cellCard = (m: PlanHiring, key: string, q: string) => cardOf(col(m, q).calc?.(row(m, key) as never))
const cellDrill = (m: PlanHiring, key: string, q: string) =>
  resolveDrill(col(m, q).drill?.(row(m, key) as never) as DrillSource)
const engine = (ctx: AnalyticsContext) => hiringPrepOf(ctx)
/** The engine's result for a context (its ids and exact values), from the tab's own input. */
const planHiringModelEngine = (ctx: AnalyticsContext) => hiringOf(hiringPrepOf(ctx).input)
const quarter = (ctx: AnalyticsContext, n: 1 | 2 | 3 | 4) => planHiringModelEngine(ctx).table.quarters[n - 1]

/**
 * What a seat-view note works out to (review HN-1): the first count, less every count after "less",
 * plus every count after "plus" ("No open seat" starts at 0). My team's note carries its own sentence
 * after the first, and the card's note starts "The seat view: ".
 */
function noteValue(note: string): number {
  const text = note.replace(/^The seat view: /, '').split('. ')[0]
  let total: number | null = /^no open seat/i.test(text) ? 0 : null
  let sign = 1
  for (const m of text.matchAll(/\b(less|plus)\b|(\d[\d,]*)/g)) {
    if (m[1]) sign = m[1] === 'less' ? -1 : 1
    else {
      const n = Number(m[2].replace(/,/g, ''))
      total = total === null ? n : total + sign * n
    }
  }
  return total ?? Number.NaN
}

/** The numbers of an "a heads approved by … − b heads now − c offers …" formula, worked out. */
function formulaValue(formula: string): number {
  const nums = [...formula.replace(/\d{1,2} [A-Z][a-z]{2} \d{4}/g, '').matchAll(/(\d[\d,]*)/g)].map((m) =>
    Number(m[1].replace(/,/g, '')),
  )
  return nums.reduce((a, n, i) => (i === 0 ? n : a - n), 0)
}

/* ───────────── the scenarios ───────────── */

const startOf = (w: WorkerRow) => w.assignmentStart || w.hireDate
const endOf = (w: WorkerRow) => {
  const a = w.assignmentEnd || null
  const t = w.terminationDate || null
  return a && t ? (a < t ? a : t) : (a ?? t)
}
const activeOn = (w: WorkerRow, d: string) => {
  const e = endOf(w)
  return startOf(w) <= d && (e == null || e >= d)
}
const isEmp = (w: WorkerRow) => (w.workerType || 'Employee') === 'Employee'

/** Each seat's row on the as-of date. */
function rowsAt(x: Sample): Map<string, PositionRow> {
  const all = [...x.datasets.positions, ...x.plan.overlay.positions].sort((a, b) =>
    a.effectiveDate < b.effectiveDate ? -1 : 1,
  )
  const out = new Map<string, PositionRow>()
  for (const r of all) if (r.effectiveDate <= AS_OF) out.set(r.positionId, r)
  return out
}

/** Manager C's confidential Elimination approved as the write path leaves it (its last day 31 Dec 2026). */
function eliminationApproved(x: Sample): { sample: Sample; seat: string; holder: string } {
  const id = x.planted.managerCElimination
  const req = x.datasets.requests.find((r) => r.requestId === id)
  if (!req?.positionId || !req.startDate) throw new Error('No Elimination of C’s seat.')
  const on = req.startDate
  const base = x.datasets.positions
    .filter((r) => r.positionId === req.positionId && r.effectiveDate <= on)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))
    .at(-1) as PositionRow
  const ended: PositionRow = {
    ...base,
    effectiveDate: '2027-01-01',
    status: 'Eliminated',
    endDate: on,
    endReason: 'Eliminated',
    sourceRequestId: id,
  }
  return {
    seat: req.positionId,
    holder: personaOf(x, 'manager-c').employeeId,
    sample: withPlan(x, {
      requests: [
        ...x.plan.requests.filter((r) => r.requestId !== id),
        { ...fromRow(req), state: 'Approved' },
      ],
      overlay: { ...x.plan.overlay, positions: [...x.plan.overlay.positions, ended] },
    }),
  }
}

interface Move {
  mover: WorkerRow
  from: PositionRow
  to: PositionRow
}

/** An SE individual contributor, alone on a Filled seat, and an open GTM seat with no offer: a move across units. */
function moveSides(x: Sample): Move {
  const at = rowsAt(x)
  const managers = new Set(x.datasets.workers.map((w) => w.managerId).filter(Boolean))
  const mover = x.datasets.workers.find(
    (w) =>
      isEmp(w) &&
      !!w.positionId &&
      at.get(w.positionId)?.businessUnit === SE &&
      at.get(w.positionId)?.status === 'Filled' &&
      activeOn(w, AS_OF) &&
      !w.terminationDate &&
      !w.assignmentEnd &&
      !managers.has(w.employeeId) &&
      x.datasets.workers.filter((y) => y.employeeId === w.employeeId).length === 1,
  ) as WorkerRow
  const offerSeats = new Set(
    x.datasets.reqs.filter((q) => q.stage === 'Offer accepted').map((q) => q.positionId),
  )
  const to = [...at.values()]
    .filter(
      (r) =>
        r.businessUnit === GTM &&
        r.status === 'Open' &&
        (r.workerType || 'Employee') === 'Employee' &&
        !offerSeats.has(r.positionId) &&
        !x.datasets.workers.some((w) => w.positionId === r.positionId && activeOn(w, AS_OF)),
    )
    .sort((a, b) => (a.positionId < b.positionId ? 1 : -1))[0] as PositionRow
  return { mover, from: at.get(mover.positionId as string) as PositionRow, to }
}

/** The plan rows an approved internal move writes (applyTransfer): the from seat held, the receiving seat Filled. */
const moveRows = (m: Move, on: ISODate, id = 'REQ-REVIEW-MOVE'): PositionRow[] => [
  { ...m.from, effectiveDate: on, status: 'On hold', sourceRequestId: id },
  { ...m.to, effectiveDate: on, status: 'Filled', sourceRequestId: id },
]
const withMovePlanned = (x: Sample, m: Move, on: ISODate) =>
  withPlan(x, {
    overlay: { ...x.plan.overlay, positions: [...x.plan.overlay.positions, ...moveRows(m, on)] },
  })
/** The HRIS recording the move: the from assignment ends the day before, the receiving one starts on it. */
const withMoveRecorded = (x: Sample, m: Move, on: ISODate, lastOnFrom: ISODate) =>
  withDatasets(x, {
    workers: [
      ...x.datasets.workers.map((w) => (w === m.mover ? { ...w, assignmentEnd: lastOnFrom } : w)),
      {
        ...m.mover,
        positionId: m.to.positionId,
        assignmentStart: on,
        assignmentEnd: null,
        businessUnit: GTM,
        department: m.to.department ?? m.mover.department,
      },
    ],
  })

const hrbp = (unit: string, x: Sample, version?: string) =>
  ctxAs('hrbp', unit === SE ? seH : unit === GTM ? gtmH : opsH, {
    unit,
    sample: x,
    ...(version ? { version } : {}),
  })
const admin = (x: Sample, extra: { asOfOverride?: ISODate; version?: string } = {}) =>
  sampleCtx('hr-admin', { sample: x, ...extra })
const managerA = (x: Sample, version?: string) =>
  ctxAs('manager', personaOf(x, 'manager-a').employeeId, { sample: x, ...(version ? { version } : {}) })
const managerC = (x: Sample) => ctxAs('manager', personaOf(x, 'manager-c').employeeId, { sample: x })

/** Manager A with an accepted backfill offer on a Filled seat whose holder leaves 30 Nov. */
function backfillOnFilled(x: Sample): Sample {
  const a = personaOf(x, 'manager-a').employeeId
  const leaver = x.datasets.workers.find(
    (w) => isEmp(w) && w.managerId === a && activeOn(w, AS_OF) && !w.terminationDate && w.positionId,
  ) as WorkerRow
  const template = x.datasets.reqs.find((q) => q.stage === 'Offer accepted') as ReqRow
  const req: ReqRow = {
    ...template,
    reqId: 'REQ-REVIEW-BF',
    positionId: leaver.positionId,
    status: 'Open',
    stage: 'Offer accepted',
    openedDate: '2026-09-01',
    offerAcceptedDate: '2026-09-25',
    startDate: '2026-12-14',
    targetStartDate: '2026-12-14',
    closedDate: null,
  }
  return withDatasets(x, {
    workers: x.datasets.workers.map((w) => (w === leaver ? { ...w, terminationDate: '2026-11-30' } : w)),
    reqs: [...x.datasets.reqs, req],
  })
}

/* ───────────── HN-1, HU-11, HU-13: the seat view's words add up ───────────── */

describe('the seat view in words adds up to open to hire (HN-1, HU-11, HU-13)', () => {
  it('reads the base sample with no zero clause, and its card names only the terms that are not 0', () => {
    const fin = planHiringModel(sampleCtx('finance', { sample: s }))
    expect(tile(fin, 'hiring-open')?.note).toBe('138 open seats less 6 people not in plan')
    const card = cardOf(tile(fin, 'hiring-open')?.calc)
    expect(card.steps.map((x) => x.expression)).toEqual(['138 − 6', '1610 − 1456 − 22'])
    expect(card.steps[0].label).toBe('Seat view = open seats − people not in plan')
    expect(card.steps.some((x) => /the rest|in other seats/.test(x.label))).toBe(false)
    expect(tile(planHiringModel(hrbp(SE, s)), 'hiring-open')?.note).toBe('39 open seats')
    expect(tile(planHiringModel(managerA(s)), 'hiring-open')?.note).toBe('2 open seats')
    expect(tile(planHiringModel(managerC(s)), 'hiring-open')?.note).toBe('No open seat')
    for (const m of [fin, planHiringModel(managerA(s))])
      expect(JSON.stringify(m)).not.toMatch(/less 0 people/)
  })

  it('names each extra term: an approved Elimination, a held move, a backfill offer on a Filled seat', () => {
    const elim = eliminationApproved(s).sample
    const move = withMovePlanned(s, moveSides(s), '2026-09-21')
    const backfill = backfillOnFilled(s)
    const cases: [string, AnalyticsContext, number][] = [
      ['HR admin, Elimination approved', admin(elim), 131],
      ['HR admin, move held', admin(move), 131],
      ['SE HRBP, move held', hrbp(SE, move), 39],
      ['GTM HRBP, move held', hrbp(GTM, move), 29],
      ['Manager A, backfill on a Filled seat', managerA(backfill), 1],
    ]
    for (const [what, ctx, value] of cases) {
      const m = planHiringModel(ctx)
      const t = tile(m, 'hiring-open')
      expect(t?.value, what).toBe(value)
      expect(noteValue(t?.note ?? ''), `${what}: ${t?.note}`).toBe(value)
      const card = cardOf(t?.calc)
      expect(noteValue(card.note ?? ''), `${what}: ${card.note}`).toBe(value)
      expect(calcProblems(card), what).toEqual([])
      const q4 = cellCard(m, 'open', 'q4')
      expect(noteValue(q4.note ?? ''), `${what}: ${q4.note}`).toBe(value)
      // The step reads the terms that are not 0 and works out to the value.
      expect(card.steps[0].result, what).toBe(value)
    }
    // The Elimination's term in words, and My team's note for the backfill.
    expect(tile(planHiringModel(admin(elim)), 'hiring-open')?.note).toBe(
      '138 open seats less 6 people not in plan and 1 person in a seat that ends by the quarter end',
    )
    const team = teamModel(managerA(backfill)).openToHire
    expect(team?.value).toBe(1)
    expect(noteValue(team?.note ?? ''), team?.note).toBe(1)
    expect(team?.note).toMatch(/^2 open seats less 1 future start on a seat that is not open\./)
  })

  it('names what is left (a second holder on one seat) instead of a balancing term', () => {
    const a = personaOf(s, 'manager-a').employeeId
    const holder = s.datasets.workers.find(
      (w) => isEmp(w) && w.managerId === a && activeOn(w, AS_OF) && w.positionId,
    ) as WorkerRow
    const second = withDatasets(s, {
      workers: [...s.datasets.workers, { ...holder, employeeId: 'E99777', name: 'Second Holder' }],
    })
    const m = planHiringModel(managerA(second))
    const t = tile(m, 'hiring-open')
    expect(t?.value).toBe(1)
    expect(t?.note).toBe('2 open seats less 1 second holder or offer on one seat')
    const card = cardOf(t?.calc)
    expect(card.steps[0].label).toBe('Seat view = open seats − second holders or offers on one seat')
    expect(card.steps[0].expression).toBe('2 − 1')
    // Control: without the second holder the card reads the open seats alone.
    expect(cardOf(tile(planHiringModel(managerA(s)), 'hiring-open')?.calc).steps[0].expression).toBe('2')
  })
})

/* ───────────── HN-2, HN-6: an approved Elimination of a Filled seat ───────────── */

describe('an approved Elimination of a Filled seat (HN-2, HN-6)', () => {
  it('counts its holder’s last day as a known exit, so to reach plan moves by the modeled exits alone', () => {
    const x = eliminationApproved(s)
    const before = planHiringModelEngine(admin(s)).table.quarters[3]
    const after = planHiringModelEngine(admin(x.sample)).table.quarters[3]
    expect(after.open).toBe((before.open as number) - 1)
    expect(after.expectedExits?.known).toBe((before.expectedExits?.known as number) + 1)
    expect(after.expectedExits?.knownIds).toContain(x.holder)
    const dModeled = (after.expectedExits?.modeled as number) - (before.expectedExits?.modeled as number)
    expect((after.toReachPlan as number) - (before.toReachPlan as number)).toBeCloseTo(dModeled, 9)
    expect((after.toReachPlan as number).toFixed(2)).toBe('211.54')
    // Control: read as before the fix (no known exit for the holder), to reach plan lost a head.
    expect((after.toReachPlan as number) - 1 - (before.toReachPlan as number)).toBeLessThan(-1)
  })

  it('reads the same expected exits as the HRIS recording the holder’s last day on 31 Dec', () => {
    const x = eliminationApproved(s)
    const recorded = withDatasets(x.sample, {
      workers: x.sample.datasets.workers.map((w) =>
        w.employeeId === x.holder && w.positionId === x.seat ? { ...w, terminationDate: '2026-12-31' } : w,
      ),
    })
    for (const n of [3, 4] as const) {
      const a = quarter(admin(x.sample), n)
      const b = quarter(admin(recorded), n)
      expect(a.expectedExits?.known, `Q${n}`).toBe(b.expectedExits?.known)
      expect(a.expectedExits?.modeled, `Q${n}`).toBeCloseTo(b.expectedExits?.modeled as number, 9)
      expect(a.toReachPlan, `Q${n}`).toBeCloseTo(b.toReachPlan as number, 9)
    }
  })

  it('agrees with the forecast’s known exits, which read the clipped assignment too (H5)', () => {
    const x = eliminationApproved(s)
    const flows = (ctx: AnalyticsContext) => forecastFlows(forecastPrepare(ctx))
    expect(flows(admin(x.sample)).get('2026-12')?.knownExits).toBe(
      (flows(admin(s)).get('2026-12')?.knownExits as number) + 1,
    )
    expect(flows(admin(x.sample)).get('2026-12')?.leavers).toContain(x.holder)
    const ctx = admin(x.sample)
    const q4 = quarter(ctx, 4)
    let known = 0
    let modeled = 0
    for (const [m, f] of flows(ctx))
      if (m >= '2026-10' && m <= '2027-03') {
        known += f.knownExits
        modeled += f.modeledExits
      }
    expect(q4.expectedExits?.known).toBe(known)
    expect(q4.expectedExits?.modeled).toBeCloseTo(modeled, 9)
  })

  it('takes its seat out of A(Q4) and says so on the card: Plan > Overview’s 1,610 less 1 (HN-6)', () => {
    const x = eliminationApproved(s)
    const ctx = admin(x.sample)
    const overview = planModel(ctx).overview.kpis.find((k) => k.metricId === ID.headsApproved)?.value
    const m = planHiringModel(ctx)
    expect(overview).toBe(1610)
    expect(row(m, 'approved')?.q4).toBe(1609)
    const card = cardOf(tile(m, 'hiring-open')?.calc)
    expect(card.inputs.find((i) => i.label.startsWith('Seats an approved change ends'))).toMatchObject({
      label: 'Seats an approved change ends by 31 Mar 2027 (not counted)',
      value: 1,
    })
    // Control: the base sample's card has no such line.
    const base = cardOf(tile(planHiringModel(admin(s)), 'hiring-open')?.calc)
    expect(base.inputs.some((i) => i.label.startsWith('Seats an approved change ends'))).toBe(false)
  })
})

/* ───────────── HN-3: rehires ───────────── */

describe('a rehire counts each stint’s hire and last day (HN-3)', () => {
  function rehired(last: ISODate | null): { sample: Sample; who: string } {
    const at = rowsAt(s)
    const offerSeats = new Set(
      s.datasets.reqs.filter((q) => q.stage === 'Offer accepted').map((q) => q.positionId),
    )
    const leavers = s.datasets.workers.filter(
      (w) =>
        isEmp(w) &&
        !!w.positionId &&
        at.get(w.positionId)?.businessUnit === SE &&
        !!w.terminationDate &&
        w.terminationDate < '2025-10-01' &&
        !s.datasets.workers.some((y) => y.employeeId === w.employeeId && activeOn(y, AS_OF)),
    )
    const leaver = leavers.at(-1) as WorkerRow
    const seat = [...at.values()]
      .filter(
        (r) =>
          r.businessUnit === SE &&
          r.status === 'Open' &&
          !offerSeats.has(r.positionId) &&
          !s.datasets.workers.some((w) => w.positionId === r.positionId && activeOn(w, AS_OF)),
      )
      .at(-1) as PositionRow
    const stint: WorkerRow = {
      ...leaver,
      positionId: seat.positionId,
      hireDate: '2026-08-03',
      assignmentStart: '2026-08-03',
      assignmentEnd: null,
      terminationDate: last,
    }
    return { sample: withDatasets(s, { workers: [...s.datasets.workers, stint] }), who: leaver.employeeId }
  }

  it('counts the second hire: Q1 + Q2 hires are Hires YTD, and August is the forecast’s August starts', () => {
    const x = rehired(null)
    const ctx = hrbp(SE, x.sample)
    const m = planHiringModel(ctx)
    const ytd = planModel(ctx).openings.kpis.find((k) => k.metricId === 'plan.hires.ytd')?.value
    expect(ytd).toBe(28)
    expect((row(m, 'hires')?.q1 as number) + (row(m, 'hires')?.q2 as number)).toBe(ytd)
    expect(m.velocity.rows.find((r) => r.month === '2026-08')?.hires).toBe(
      forecastFlows(forecastPrepare(ctx)).get('2026-08')?.starts,
    )
    // The Q2 records list the second stint's row.
    const drill = cellDrill(m, 'hires', 'q2') as DrillSpec
    expect(drill.rows.length).toBe(row(m, 'hires')?.q2)
    expect(
      (drill.rows as WorkerRow[]).some((w) => w.employeeId === x.who && w.hireDate === '2026-08-03'),
    ).toBe(true)
    // Control: the base sample's Hires YTD is one lower.
    expect(planModel(hrbp(SE, s)).openings.kpis.find((k) => k.metricId === 'plan.hires.ytd')?.value).toBe(27)
  })

  it('counts the second last day: E(q) is the forecast’s known + modeled', () => {
    const x = rehired('2026-12-15')
    const ctx = hrbp(SE, x.sample)
    const flows = forecastFlows(forecastPrepare(ctx))
    for (const [n, end] of [
      [3, '2026-12'],
      [4, '2027-03'],
    ] as const) {
      let known = 0
      let modeled = 0
      for (const [m, f] of flows)
        if (m >= '2026-10' && m <= end) {
          known += f.knownExits
          modeled += f.modeledExits
        }
      const q = quarter(ctx, n)
      expect(q.expectedExits?.known, `Q${n}`).toBe(known)
      expect(q.expectedExits?.total, `Q${n}`).toBeCloseTo(known + modeled, 9)
    }
    expect(quarter(ctx, 3).expectedExits?.known).toBe(1)
  })
})

/* ───────────── HN-4, HU-9: a later fiscal year ───────────── */

describe('a later fiscal year’s new to hire (HN-4, HU-9)', () => {
  it('reads 0 in every FY28 quarter on the sample, and FY27’s and FY28’s add up to O(FY28 end) − open now', () => {
    for (const [what, fy27, fy28] of [
      ['HR admin', admin(s), admin(s, { version: 'fy28-working' })],
      ['SE HRBP', hrbp(SE, s), hrbp(SE, s, 'fy28-working')],
      ['Manager A', managerA(s), managerA(s, 'fy28-working')],
    ] as const) {
      const a = planHiringModelEngine(fy27).table
      const b = planHiringModelEngine(fy28).table
      expect(
        b.quarters.map((q) => q.newToHire),
        what,
      ).toEqual([0, 0, 0, 0])
      const sum = (t: typeof a) => t.quarters.reduce((x, q) => x + (q.newToHire ?? 0), 0)
      expect(sum(a) + sum(b), what).toBe(b.openFyEnd - b.openNow)
      expect(b.openBefore?.on, what).toBe('2027-03-31')
    }
  })

  it('says what the first FY28 quarter counts against, and names the year in its finding', () => {
    const m = planHiringModel(admin(s, { version: 'fy28-working' }))
    const card = cellCard(m, 'new', 'q1')
    expect(card.title).toBe('New to hire in Q1, Apr to Jun')
    expect(card.inputs[1].label).toMatch(/^Open to hire on 31 Mar 2027, the day before the quarter/)
    expect(calcProblems(card)).toEqual([])
    expect(m.findings.map((f) => f.title).find((t) => t.startsWith('Reaching plan'))).toMatch(
      /^Reaching plan by Q1 FY28 end takes/,
    )
    // Control: FY27 names no year.
    expect(
      planHiringModel(admin(s))
        .findings.map((f) => f.title)
        .find((t) => t.startsWith('Reaching plan')),
    ).toMatch(/^Reaching plan by Q3 end takes/)
  })
})

/* ───────────── HN-5: a move across scopes ───────────── */

describe('an internal move across scopes reads in each scope as it will once the HRIS records it (HN-5)', () => {
  const ON: ISODate = '2026-09-21'
  const open = (ctx: AnalyticsContext) => planHiringModelEngine(ctx).table.quarters.map((q) => q.open)
  const known = (ctx: AnalyticsContext) =>
    planHiringModelEngine(ctx).table.quarters.map((q) => q.expectedExits?.known ?? null)

  it('held in the plan, in effect: SE 39, GTM 29 and the company 131, as with the HRIS recording it', () => {
    const m = moveSides(s)
    const held = withMovePlanned(s, m, ON)
    const recorded = withMoveRecorded(held, m, ON, '2026-09-20')
    expect(tile(planHiringModel(hrbp(SE, held)), 'hiring-open')?.value).toBe(39)
    expect(tile(planHiringModel(hrbp(GTM, held)), 'hiring-open')?.value).toBe(29)
    expect(tile(planHiringModel(admin(held)), 'hiring-open')?.value).toBe(131)
    for (const [what, ctxOf] of [
      ['SE', (x: Sample) => hrbp(SE, x)],
      ['GTM', (x: Sample) => hrbp(GTM, x)],
      ['HR admin', (x: Sample) => admin(x)],
    ] as const) {
      expect(open(ctxOf(held)), what).toEqual(open(ctxOf(recorded)))
      expect(known(ctxOf(held)), what).toEqual(known(ctxOf(recorded)))
    }
    // The company's seat view is clean: the mover holds the receiving seat.
    const sv = quarter(admin(held), 4).seatView
    expect([sv?.elsewhere, sv?.rest]).toEqual([0, 0])
    // Control: the base sample reads SE 39, GTM 30.
    expect(tile(planHiringModel(hrbp(GTM, s)), 'hiring-open')?.value).toBe(30)
  })

  it('dated ahead in the HRIS: SE counts the move out as a known exit, GTM the move in as a start', () => {
    const m = moveSides(s)
    const ahead = withMoveRecorded(s, m, '2026-11-16', '2026-11-15')
    const se = hrbp(SE, ahead)
    const flows = forecastFlows(forecastPrepare(se))
    let fcKnown = 0
    let fcModeled = 0
    for (const [mo, f] of flows)
      if (mo >= '2026-10' && mo <= '2026-12') {
        fcKnown += f.knownExits
        fcModeled += f.modeledExits
      }
    const q3 = quarter(se, 3)
    expect(q3.expectedExits?.known).toBe(1)
    expect(q3.expectedExits?.known).toBe(fcKnown)
    expect(q3.expectedExits?.total).toBeCloseTo(fcKnown + fcModeled, 9)
    expect(tile(planHiringModel(se), 'hiring-open')?.value).toBe(39)
    const gtm = planHiringModel(hrbp(GTM, ahead))
    expect(tile(gtm, 'hiring-open')?.value).toBe(29)
    // C37: the move in is no future start. Future starts are the 4 signed offers, which they list;
    // the move is its own row, Moves in by quarter end, and opens the seat it takes.
    const future = cardOf(tile(gtm, 'hiring-accepted')?.calc)
    expect(future.steps[0].expression).toBe('4 offers')
    expect(calcProblems(future)).toEqual([])
    expect(tile(gtm, 'hiring-accepted')?.value).toBe(4)
    expect((cellDrill(gtm, 'accepted', 'q4') as DrillSpec).rows).toHaveLength(4)
    expect(row(gtm, 'moves')?.q4).toBe(1)
    expect(row(gtm, 'moves')?.q3).toBe(1)
    const moved = cellDrill(gtm, 'moves', 'q4') as DrillSpec
    expect(moved.kind).toBe('positions')
    expect((moved.rows as readonly { positionId: string }[]).map((r) => r.positionId)).toEqual([
      m.to.positionId,
    ])
    // The open to hire card names the moves' term and step, and works out to its value.
    const open4 = cellCard(gtm, 'open', 'q4')
    expect(open4.steps.at(-1)?.label).toBe(
      'Open to hire = approved heads − current heads − future starts − moves in',
    )
    expect(open4.inputs.find((i) => i.label === 'Moves in by the quarter end')?.value).toBe(1)
    expect(calcProblems(open4)).toEqual([])
    expect(tile(gtm, 'hiring-open')?.formula).toMatch(/− 4 future starts − 1 move in by then\.$/)
    // The velocity's months ahead never count the move as a hire: November reads as it does without it.
    const nov = (x: PlanHiring) => x.velocity.rows.find((r) => r.month === '2026-11')?.hires
    expect(nov(gtm)).toBe(nov(planHiringModel(hrbp(GTM, s))))
    // Control: SE, the scope the person leaves, has no move in, so no such row.
    expect(row(planHiringModel(se), 'moves')).toBeUndefined()
    // The company reads the move as no change.
    expect(tile(planHiringModel(admin(ahead)), 'hiring-open')?.value).toBe(132)
  })

  it('approved ahead in the plan only: each scope reads what the HRIS will read with the move recorded', () => {
    const m = moveSides(s)
    const on: ISODate = '2026-11-16'
    const planned = withMovePlanned(s, m, on)
    const both = withMoveRecorded(planned, m, on, '2026-11-15')
    for (const [what, ctxOf] of [
      ['SE', (x: Sample) => hrbp(SE, x)],
      ['GTM', (x: Sample) => hrbp(GTM, x)],
      ['HR admin', (x: Sample) => admin(x)],
    ] as const) {
      expect(open(ctxOf(planned)), what).toEqual(open(ctxOf(both)))
      expect(known(ctxOf(planned)), what).toEqual(known(ctxOf(both)))
    }
    expect(known(hrbp(SE, planned))[3]).toBe(1)
  })
})

/* ───────────── HN-7, HU-10: negative and tiny targets ───────────── */

/** Manager C's team with a person not in plan: 8 heads against 7 approved seats. */
function cOver(): Sample {
  const report = s.datasets.workers.find((w) => w.positionId === 'P-1946') as WorkerRow
  const planted: WorkerRow = {
    ...report,
    employeeId: 'E99001',
    name: 'Planted Person',
    positionId: null,
    assignmentStart: null,
    assignmentEnd: null,
    hireDate: '2025-01-06',
    terminationDate: null,
    managerId: personaOf(s, 'manager-c').employeeId,
  }
  return withDatasets(s, { workers: [...s.datasets.workers, planted] })
}

describe('a hiring target below 0 never reads as one (HN-7), and backfills only on a small team (HU-10)', () => {
  /** Every ahead cell of the hiring-target rows below 0 carries "Over by" or "Nothing to hire". */
  function negativeTargets(m: PlanHiring): string[] {
    const out: string[] = []
    for (const key of ['toReach', 'needed']) {
      const r = row(m, key)
      for (const q of ['q1', 'q2', 'q3', 'q4'] as const) {
        const v = r?.[q]
        const note = r?.notes[q] ?? ''
        if (typeof v === 'number' && v < 0 && !/^Over by|^Nothing to hire/.test(note))
          out.push(`${key} ${q} ${v}`)
      }
    }
    return out
  }

  it('reads "Over by" beside a negative to reach plan, and 0 hires needed with "Nothing to hire"', () => {
    const m = planHiringModel(managerC(cOver()))
    expect([row(m, 'toReach')?.notes.q3, row(m, 'toReach')?.notes.q4]).toEqual(['Over by 0.8', 'Over by 0.6'])
    expect([row(m, 'needed')?.q3, row(m, 'needed')?.q4]).toEqual([0, 0])
    expect(row(m, 'needed')?.notes.q3).toBe(NOTHING_TO_HIRE_TEXT)
    expect(negativeTargets(m)).toEqual([])
    const card = cellCard(m, 'needed', 'q3')
    expect([card.value, calcProblems(card)]).toEqual([0, []])
    expect(cellCard(m, 'toReach', 'q3').note).toMatch(/^Over by 0\.8: .* It is not a hiring target\.$/)
    // The engine keeps the value below 0 (H24): only the table shows 0.
    expect(quarter(managerC(cOver()), 3).neededPace).toBeLessThan(0)
    for (const ctx of [
      admin(s),
      hrbp(SE, s),
      managerA(s),
      managerC(s),
      admin(s, { version: 'fy28-working' }),
    ])
      expect(negativeTargets(planHiringModel(ctx))).toEqual([])
  })

  it('reads "Backfills only" where nothing is open and the gap is the modeled exits of a small team', () => {
    const c = planHiringModel(managerC(s))
    expect(row(c, 'needed')?.notes).toEqual({ q3: BACKFILLS_ONLY_TEXT, q4: BACKFILLS_ONLY_TEXT })
    expect(JSON.stringify(row(c, 'needed'))).not.toMatch(/Behind by/)
    // Control: a unit with open seats is still behind.
    expect(row(planHiringModel(hrbp(SE, s)), 'needed')?.notes.q3).toMatch(/^Behind by \d+\.\d a month$/)
  })
})

/* ───────────── HN-8, HU-3: a past fiscal year and quarters with no close ───────────── */

describe('a past fiscal year and quarters that are over but not closed (HN-8, HU-3)', () => {
  it('reads "FY27 is over" at 15 Apr 2027, its cards ending at the tiles’ 0', () => {
    const ctx = admin(s, { asOfOverride: '2027-04-15', version: 'fy27-working' })
    const m = planHiringModel(ctx)
    for (const id of ['hiring-open', 'hiring-accepted']) {
      const t = tile(m, id)
      expect([t?.value, t?.note], id).toEqual([0, 'FY27 is over'])
      expect(t?.formula, id).not.toMatch(/−/)
      const card = cardOf(t?.calc)
      expect([card.value, calcProblems(card)], id).toEqual([0, []])
    }
    expect(m.quarters.columns.map((c) => c.label).slice(1, 5)).toEqual([
      'Q1, Apr to Jun (closed)',
      'Q2, Jul to Sep (closed)',
      'Q3, Oct to Dec (ended)',
      'Q4, Jan to Mar (ended)',
    ])
    expect(m.quarters.note).toBe(ENDED_NOTE)
    // The ended quarters' heads come from the HRIS at the quarter end.
    const heads = (d: string) =>
      new Set(s.datasets.workers.filter((w) => isEmp(w) && activeOn(w, d)).map((w) => w.employeeId)).size
    expect([row(m, 'current')?.q3, row(m, 'current')?.q4]).toEqual([heads('2026-12-31'), heads('2027-03-31')])
  })

  it('works its tile formulas out to their values at 15 Jan 2027, with no "(closed)" after the last close', () => {
    const m = planHiringModel(admin(s, { asOfOverride: '2027-01-15' }))
    const t = tile(m, 'hiring-open')
    expect(formulaValue(t?.formula ?? '')).toBe(t?.value)
    expect(cardOf(t?.calc).steps.at(-1)?.result).toBe(t?.value)
    expect(m.quarters.columns[3].label).toBe('Q3, Oct to Dec (ended)')
    expect(typeof row(m, 'current')?.q3).toBe('number')
    // Control: on the sample's own date the closed quarters read "(closed)".
    expect(planHiringModel(admin(s)).quarters.columns[2].label).toBe('Q2, Jul to Sep (closed)')
  })

  it('with no close: Q1 has ended, and the velocity says it reads the forecast alone', () => {
    const m = planHiringModel(admin(withPlan(s, { closes: [] })))
    expect(m.quarters.columns[1].label).toBe('Q1, Apr to Jun (ended)')
    expect(m.quarters.note).toBe(ENDED_NOTE)
    expect(typeof row(m, 'current')?.q1).toBe('number')
    expect(m.velocity.subtitle).not.toMatch(/last 12 closed months/)
    expect(m.velocity.note).toBe('No closed month yet.')
  })
})

/* ───────────── HN-9, HU-1, HU-2, HU-8: no pace yet ───────────── */

describe('no pace yet: the tiles say why, and each opens its card (HN-9, HU-1, HU-2, HU-8)', () => {
  const noClose = () => withPlan(s, { closes: [] })

  it('never claims exits outrun hires without 3 closed months', () => {
    // A closed month is any month to the last close (H20), so only no close at all leaves no pace.
    {
      const what = 'no close'
      const m = planHiringModel(admin(noClose()))
      const t = tile(m, 'hiring-months-to-close')
      expect(t?.value, what).toBeNull()
      expect(t?.note, what).toBe(PACE_NEEDS_TEXT)
      const card = cardOf(t?.calc)
      const words = JSON.stringify([card.steps, card.note])
      expect(words, what).not.toMatch(/outrun hires/i)
      expect(card.steps[0].label, what).toBe(PACE_NEEDS_TEXT)
      expect(card.note, what).toBe(`${PACE_NEEDS_TEXT}.`)
      expect(calcProblems(card), what).toEqual([])
    }
    // Control: Manager A's net pace is 0, so not closing is a fact there.
    expect(tile(planHiringModel(managerA(s)), 'hiring-months-to-close')?.note).toBe(NOT_CLOSING_TEXT)
  })

  it('writes the pace tiles with no "0 ÷ 3" and the 3-month note; the net card lists no 0 inputs', () => {
    const m = planHiringModel(admin(noClose()))
    for (const id of ['hiring-pace', 'hiring-exit-pace']) {
      const t = tile(m, id)
      expect(t?.value, id).toBeNull()
      expect(t?.formula, id).not.toMatch(/0 ÷ 3/)
      expect(t?.note, id).toBe('The 3-month pace needs 3 closed months')
    }
    const net = cardOf(tile(m, 'hiring-net-pace')?.calc)
    expect(net.inputs.map((i) => i.value)).toEqual([null, null])
  })

  it('opens a card behind every tile, a "—" tile included (calcWhenEmpty)', () => {
    for (const ctx of [admin(noClose()), managerA(s)]) {
      const m = planHiringModel(ctx)
      for (const t of m.kpis) {
        expect(t.calc, t.id).toBeTruthy()
        if (t.value == null) expect(t.calcWhenEmpty, t.id).toBe(true)
        expect(calcProblems(cardOf(t.calc)), t.id).toEqual([])
      }
    }
    expect(tile(planHiringModel(managerA(s)), 'hiring-months-to-close')?.value).toBeNull()
  })
})

/* ───────────── HN-10: an as-of date before the last close ───────────── */

describe('an as-of date before the last close reads the closes it knows (HN-10)', () => {
  it('at 31 Aug 2026 with September closed: August is the last close, nothing counted twice', () => {
    const ctx = admin(s, { asOfOverride: '2026-08-31' })
    const r = planHiringModelEngine(ctx)
    expect(engine(ctx).input.lastClose).toBe('2026-08')
    expect(r.table.quarters.map((q) => q.kind)).toEqual(['history', 'ahead', 'ahead', 'ahead'])
    const historyIds = new Set(
      r.table.quarters.filter((q) => q.kind === 'history').flatMap((q) => [...q.hireIds, ...q.exitIds]),
    )
    for (const q of r.table.quarters.filter((x) => x.kind === 'ahead'))
      expect(
        q.expectedExits?.knownIds.filter((id) => historyIds.has(id)),
        q.label,
      ).toEqual([])
    // Every history quarter ends by the as-of date, so its hires and exits are all known then.
    for (const q of r.table.quarters.filter((x) => x.kind === 'history'))
      expect(q.end <= '2026-08-31', q.label).toBe(true)
    // September's hires are not history: a seat a September hire fills is open at 31 Aug, never both.
    const septHires = engine(ctx).input.hires.filter((e) => e.on >= '2026-09-01' && e.on <= '2026-09-30')
    expect(septHires.length).toBeGreaterThan(0)
    const historyHires = new Set(
      r.table.quarters.filter((x) => x.kind === 'history').flatMap((x) => x.hireIds),
    )
    for (const e of septHires) expect(historyHires.has(e.personId), e.personId).toBe(false)
    // The paces read June to August, before the as-of date.
    const actual = r.velocity.months.filter((x) => x.kind === 'actual')
    expect(actual.at(-1)?.month).toBe('2026-08')
    expect(actual.slice(-3).map((x) => x.month)).toEqual(['2026-06', '2026-07', '2026-08'])
    // September, closed after the as-of date, reads as a month ahead with its actual flows.
    const sep = r.velocity.months.find((x) => x.month === '2026-09')
    expect(sep?.kind).toBe('forecast')
    // H5 at a month-end as-of: E(Q3) is the forecast's known + modeled from September.
    const flows = forecastFlows(hiringForecast(ctx, engine(ctx).p.scope.ids))
    let total = 0
    for (const [m, f] of flows) if (m >= '2026-09' && m <= '2026-12') total += f.knownExits + f.modeledExits
    expect(r.table.quarters[2].expectedExits?.total).toBeCloseTo(total, 9)
    // Control: on the sample's own date September is the last close.
    expect(engine(admin(s)).input.lastClose).toBe('2026-09')
  })
})

/* ───────────── HN-11: a person not in plan with a last day ───────────── */

describe('a person not in plan with a last day is a known exit (HN-11)', () => {
  it('frees the head they hold in current heads: known exits + 1, to reach plan + 1', () => {
    const nip = s.datasets.workers.find(
      (w) => isEmp(w) && !w.positionId && w.businessUnit === OPS && activeOn(w, AS_OF) && !w.terminationDate,
    ) as WorkerRow
    expect(nip).toBeTruthy()
    const leaves = withDatasets(s, {
      workers: s.datasets.workers.map((w) => (w === nip ? { ...w, terminationDate: '2026-11-15' } : w)),
    })
    const before = quarter(hrbp(OPS, s), 3)
    const after = quarter(hrbp(OPS, leaves), 3)
    expect(after.expectedExits?.known).toBe((before.expectedExits?.known as number) + 1)
    expect(after.expectedExits?.modeled).toBe(before.expectedExits?.modeled)
    expect(after.toReachPlan).toBeCloseTo((before.toReachPlan as number) + 1, 9)
    const card = cellCard(planHiringModel(hrbp(OPS, leaves)), 'exits', 'q3')
    expect(card.inputs.find((i) => i.label.startsWith('Of which people not in plan'))?.value).toBe(1)
    expect(card.note).toMatch(/^1 person not in plan is among the known exits/)
    expect(calcProblems(card)).toEqual([])
  })
})

/* ───────────── HU-12: current heads with its split ───────────── */

describe('current heads with its split (HU-12)', () => {
  it('names the people in approved seats and not in plan on the card and the records', () => {
    const m = planHiringModel(sampleCtx('finance', { sample: s }))
    const card = cardOf(tile(m, 'hiring-open')?.calc)
    expect(card.inputs.find((i) => i.label === 'People in approved seats')?.value).toBe(1450)
    const drill = cellDrill(m, 'current', 'q3') as DrillSpec
    expect(drill.note).toBe('1,450 heads in approved seats and 6 people not in plan.')
  })
})

/* ───────────── HP-2, HP-4, HP-5: what an accepted offer's records hold ───────────── */

describe('an accepted offer lists IDs, stage and dates only (HP-2, HP-4, HP-5)', () => {
  /** Every hiring drill a model reaches: its tiles', cells' and cards' records. */
  function drillsOf(m: PlanHiring): DrillSpec[] {
    const out: DrillSpec[] = []
    const add = (src: unknown) => {
      const d = resolveDrill(src as DrillSource)
      if (d) out.push(d)
    }
    for (const k of m.kpis) {
      add(k.drill)
      const c = resolveCalc(k.calc as never)
      if (c?.rows) add(c.rows)
    }
    for (const fig of [m.quarters, m.openByQuarter, m.velocity])
      for (const r of fig.rows as unknown as readonly Record<string, unknown>[])
        for (const c of fig.columns as Column[]) {
          if (c.drill) add(c.drill(r))
          const card = c.calc ? resolveCalc(c.calc(r) as never) : null
          if (card?.rows) add(card.rows)
        }
    return out
  }

  it('shows no recruiter note or hiring manager, so a note with an amount reaches nothing', () => {
    const offers = s.datasets.reqs.filter((q) => q.stage === 'Offer accepted')
    const noted = withDatasets(s, {
      reqs: s.datasets.reqs.map((q) =>
        q.stage === 'Offer accepted' ? { ...q, recruiter: 'Kim Ortiz, offer agreed at USD 148,500' } : q,
      ),
    })
    expect(offers.length).toBeGreaterThan(5)
    for (const ctx of [
      sampleCtx('hr-admin', { sample: noted, showPay: true }),
      sampleCtx('finance', { sample: noted }),
      hrbp(SE, noted),
    ]) {
      const m = planHiringModel(ctx)
      const reqs = drillsOf(m).filter((d) => d.kind === 'reqs')
      expect(reqs.length).toBeGreaterThan(0)
      for (const d of reqs) {
        const t = buildDrillTable(d, ctx)
        expect(t.columns.map((c) => c.key)).not.toContain('recruiter')
        expect(t.columns.map((c) => c.key)).not.toContain('hiringManager')
        for (const r of t.rows) {
          expect(Object.keys(r)).not.toContain('recruiter')
          expect(Object.values(r).flatMap((v) => (typeof v === 'string' ? amountsIn(v) : []))).toEqual([])
        }
      }
    }
    // Control: the reqs list without the module's hide shows the note.
    const ctx = sampleCtx('hr-admin', { sample: noted, showPay: true })
    const d = drillsOf(planHiringModel(ctx)).find((x) => x.kind === 'reqs' && x.rows.length) as DrillSpec
    const bare = buildDrillTable({ ...d, hide: [] }, ctx)
    expect(bare.rows.some((r) => String(r.recruiter ?? '').includes('148,500'))).toBe(true)
  })

  it('keeps every hidden key out of the rows, HR admin with Show pay amounts on included (HP-4)', () => {
    const ctx = sampleCtx('hr-admin', { sample: s, showPay: true })
    const drills = drillsOf(planHiringModel(ctx))
    expect(drills.some((d) => d.kind === 'reqs' && d.rows.length > 0)).toBe(true)
    for (const d of drills) {
      const hidden = HIRING_DRILL_HIDE[d.kind as HiringDrillKind]
      for (const r of buildDrillTable(d, ctx).rows)
        for (const k of hidden) expect(Object.keys(r), `${d.kind} ${k}`).not.toContain(k)
    }
    // Control: a records list of the same reqs with no hide carries the offer amounts in its rows.
    const reqs = drills.find((d) => d.kind === 'reqs' && d.rows.length) as DrillSpec
    const bare = buildDrillTable({ ...reqs, hide: [] }, ctx)
    expect(bare.rows.some((r) => 'offerBase' in r)).toBe(true)
  })
})

/* ───────────── blank IDs ───────────── */

describe('data with blank req IDs (the lineage probe blanks every field)', () => {
  it('still builds the tab in every mode: a blank req ID is a req, never a move in', () => {
    const blank = withDatasets(s, { reqs: s.datasets.reqs.map((r) => ({ ...r, reqId: null as never })) })
    for (const ctx of [
      admin(blank),
      hrbp(SE, blank),
      managerA(blank),
      sampleCtx('leader', { sample: blank }),
    ]) {
      const m = planHiringModel(ctx)
      expect(m.kpis).toHaveLength(6)
      expect(
        cardOf(tile(m, 'hiring-accepted')?.calc).inputs.some((i) => i.label.startsWith('Moves in')),
      ).toBe(false)
    }
  })
})

/* ───────────── HP-1: Manager mode nets the tree alone ───────────── */

describe('Manager mode’s modeled exits come from the tree alone (HP-1)', () => {
  it('moves nothing when the manager’s own last day is set, and does move with one in the tree', () => {
    const a = personaOf(s, 'manager-a')
    const own = withDatasets(s, {
      workers: s.datasets.workers.map((w) =>
        w.employeeId === a.employeeId && w.positionId === a.positionId
          ? { ...w, terminationDate: '2026-11-20' }
          : w,
      ),
    })
    const base = planHiringModelEngine(managerA(s))
    const after = planHiringModelEngine(managerA(own))
    expect(JSON.stringify(after)).toBe(JSON.stringify(base))
    // Non-vacuity: a last day inside the tree moves the tab.
    const report = s.datasets.workers.find(
      (w) => isEmp(w) && w.managerId === a.employeeId && activeOn(w, AS_OF) && !w.terminationDate,
    ) as WorkerRow
    const inside = withDatasets(s, {
      workers: s.datasets.workers.map((w) => (w === report ? { ...w, terminationDate: '2026-11-20' } : w)),
    })
    expect(JSON.stringify(planHiringModelEngine(managerA(inside)))).not.toBe(JSON.stringify(base))
    // Control: HR admin's tab moves with the manager's own last day.
    expect(JSON.stringify(planHiringModelEngine(admin(own)))).not.toBe(
      JSON.stringify(planHiringModelEngine(admin(s))),
    )
  })
})
