/**
 * Plan > Recruiting summary's model under the states its build review (27 Oct 2026) found wrong, each
 * with a control where the old reading differs (docs/PLAN.md 9.8, change C38; the readings are in
 * ./recruitingModel.ts's module comment):
 *  - openings the forecast starts on the as-of date, a closed month, count from the first month
 *    ahead, as the forecast counts their heads (they were left out of projected starts);
 *  - an approved internal move into an Open seat that the HRIS has not recorded takes the seat: the
 *    forecast's start on it is no projected start, so the move is not counted twice;
 *  - a year that is over opens a projected starts card that says so, with the tile's "—";
 *  - with no close, a quarter that ends on the as-of date is not a quarter ahead;
 *  - with no Working forecast there is no projection: projected heads and the gap read "—", and
 *    projected attrition says it holds known exits only;
 *  - open to hire's note names the moves in when a quarter ahead holds one;
 *  - where hiring happened keeps Plan > Hiring's order on a tie ("No location" last).
 * Heads only throughout.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { listsInForce } from '@/access/lists'
import type { Column } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import { monthKey } from '@/data/fiscal'
import { unitHrbps } from '@/data/lists/roles'
import type { Sample } from '@/data/sample'
import type { ISODate, PositionRow, WorkerRow } from '@/data/schema'
import { type CalcSpec, calcProblems, resolveCalc, sameResult } from '@/drill/calc'
import { ctxAs, leakSample, sampleCtx, sampleSources, withDatasets, withPlan } from '@/testkit/sample'
import { forecastHeads } from '@/views/forecast/engine/heads'
import { hiringForecast, hiringPrepOf } from './hiringData'
import { hiringBuiltOf } from './hiringModel'
import { ALL_DEPARTMENTS, type HiringRecentRow, planHiringModel } from './hiringTab'
import { rankWhere } from './recruitingModel'
import {
  KNOWN_EXITS_ONLY_NOTE,
  NO_FORECAST_NOTE,
  type PlanRecruiting,
  planRecruitingModel,
  type RecruitingMonthRow,
  type RecruitingQuarterRow,
} from './recruitingTab'

let s: Sample
let seH: string
let gtmH: string
const SE = 'Silicon Engineering'
const GTM = 'Go-to-Market'
const AS_OF: ISODate = '2026-09-30'

beforeAll(() => {
  s = leakSample()
  const hrbps = unitHrbps(listsInForce(null, s.datasets, sampleSources(s.datasets)))
  seH = hrbps.get(SE) as string
  gtmH = hrbps.get(GTM) as string
}, 120_000)

/* ───────────── reading the model ───────────── */

const hrbp = (unit: string, x: Sample = s, extra: { asOfOverride?: ISODate } = {}) =>
  ctxAs('hrbp', unit === SE ? seH : gtmH, { unit, sample: x, ...extra })
const admin = (x: Sample = s, extra: { asOfOverride?: ISODate; version?: string } = {}) =>
  sampleCtx('hr-admin', { sample: x, ...extra })
const tile = (m: PlanRecruiting, id: string) => m.kpis.find((k) => k.id === id)
const cardOf = (src: unknown): CalcSpec => resolveCalc(src as never) as CalcSpec
const monthRow = (m: PlanRecruiting, month: string) =>
  m.months.rows.find((r) => r.month === month) as RecruitingMonthRow
const cellCard = <R extends object>(fig: { columns: readonly Column<R>[] }, key: string, r: R): CalcSpec =>
  cardOf((fig.columns.find((c) => c.key === key) as Column<R>).calc?.(r))

/** The forecast's starts on Open and Planned seats in scope, each with its probability. */
function openingStarts(ctx: AnalyticsContext) {
  const h = hiringPrepOf(ctx)
  const fp = hiringForecast(ctx, h.p.scope.ids)
  const run = fp.run
  if (!run) throw new Error('No Working forecast.')
  const out: { id: string; start: ISODate; p: number }[] = []
  for (const [id, starts] of run.starts) {
    if (!h.p.scope.ids.has(id)) continue
    for (const x of starts) if (x.kind !== 'offer') out.push({ id, start: x.start, p: x.probability })
  }
  return { fp, run, out }
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

interface Move {
  mover: WorkerRow
  from: PositionRow
  to: PositionRow
}

/** An SE individual contributor alone on a Filled seat, and an Open GTM seat with no offer (as hiringReview.test.ts). */
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
const withMovePlanned = (x: Sample, m: Move, on: ISODate) =>
  withPlan(x, {
    overlay: {
      ...x.plan.overlay,
      positions: [
        ...x.plan.overlay.positions,
        { ...m.from, effectiveDate: on, status: 'On hold', sourceRequestId: 'REQ-REVIEW-MOVE' },
        { ...m.to, effectiveDate: on, status: 'Filled', sourceRequestId: 'REQ-REVIEW-MOVE' },
      ],
    },
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

/** The sample with FY27 Working retired: FY27 has no Working forecast (FY28 Working stays). */
const noWorking = (x: Sample): Sample =>
  withPlan(x, {
    versions: x.plan.versions.map((v) =>
      v.versionId === 'fy27-working' ? ({ ...v, state: 'retired' } as typeof v) : v,
    ),
  })

/* ───────────── openings due on the as-of date ───────────── */

describe('openings the forecast starts on the as-of date, a closed month', () => {
  it('count in the first month ahead, where the forecast counts their heads', () => {
    const ctx = hrbp(SE)
    const { fp, run, out } = openingStarts(ctx)
    const due = out.filter((x) => monthKey(x.start) <= run.actualThrough)
    // Ten Open seats past their time to fill: the forecast starts each on the as-of date (September,
    // closed) at its fill rate, and counts it as a head from October, its first projected month.
    expect([due.length, run.actualThrough]).toEqual([10, '2026-09'])
    expect(due.every((x) => x.start === AS_OF)).toBe(true)
    const heads = forecastHeads(fp)
    for (const x of due) expect(heads.bySeat.get('2026-10')?.get(x.id), x.id).toBeCloseTo(x.p, 9)
    // The summary counts them in October, each at its fill rate.
    const oct = hiringPrepOf(ctx).projected?.get('2026-10')
    for (const x of due) expect(oct?.openingSeats.get(x.id), x.id).toBeCloseTo(x.p, 12)
    const sum = due.reduce((a, x) => a + x.p, 0)
    expect(sum).toBeCloseTo(8.5, 12)
    const m = planRecruitingModel(ctx)
    expect(monthRow(m, '2026-10').projectedStarts).toBeGreaterThanOrEqual(sum - 1e-9)
    const card = cellCard(m.months, 'projectedStarts', monthRow(m, '2026-10'))
    expect(calcProblems(card)).toEqual([])
    const listed = new Set(
      (resolveDrillRows(card) as readonly { positionId: string }[]).map((r) => r.positionId),
    )
    for (const x of due) expect(listed.has(x.id), x.id).toBe(true)
    // Every opening the forecast starts by the year end is in projected starts, once.
    const fy = out.filter((x) => x.start <= '2027-03-31').reduce((a, x) => a + x.p, 0)
    const openings = [...(hiringPrepOf(ctx).projected?.values() ?? [])].reduce((a, x) => a + x.openings, 0)
    expect(openings).toBeCloseTo(fy, 9)
  })

  it('control: at 15 Oct the forecast dates the same starts in October, and the summary reads them the same', () => {
    const at30 = openingStarts(hrbp(SE))
    const due = at30.out.filter((x) => monthKey(x.start) <= at30.run.actualThrough).map((x) => x.id)
    const later = hrbp(SE, s, { asOfOverride: '2026-10-15' })
    const at15 = openingStarts(later).out.filter((x) => due.includes(x.id))
    expect(at15.map((x) => x.start)).toEqual(due.map(() => '2026-10-15'))
    const oct = hiringPrepOf(later).projected?.get('2026-10')
    for (const x of at15) expect(oct?.openingSeats.get(x.id), x.id).toBeCloseTo(x.p, 12)
  })
})

/* ───────────── a move in the HRIS has not recorded ───────────── */

describe('a seat an approved internal move takes is no projected start', () => {
  const ON: ISODate = '2026-11-16'

  it('approved ahead in the plan only: the same projected starts as with the HRIS recording the move', () => {
    const m = moveSides(s)
    const planned = hrbp(GTM, withMovePlanned(s, m, ON))
    const recorded = hrbp(GTM, withMoveRecorded(s, m, ON, '2026-11-15'))
    for (const ctx of [planned, recorded])
      expect(hiringPrepOf(ctx).input.moves.map((x) => x.positionId)).toEqual([m.to.positionId])
    // Control: the forecast reads the HRIS, so with the plan alone it still starts the seat at its fill rate.
    expect(
      openingStarts(planned)
        .out.filter((x) => x.id === m.to.positionId)
        .map((x) => x.p),
    ).toEqual([0.9])
    expect(openingStarts(recorded).out.filter((x) => x.id === m.to.positionId)).toEqual([])
    for (const x of hiringPrepOf(planned).projected?.values() ?? [])
      expect(x.openingSeats.get(m.to.positionId) ?? 0, x.month).toBe(0)
    const a = planRecruitingModel(planned)
    const b = planRecruitingModel(recorded)
    expect(tile(a, 'recruiting-projected')?.value).toBeCloseTo(
      tile(b, 'recruiting-projected')?.value as number,
      9,
    )
    // The move is one head, in moves in: H + S + M + projected starts − E.
    const q4 = a.quarters.rows.find((r) => r.key === 'q4') as RecruitingQuarterRow
    expect(q4.movesIn).toBe(1)
    expect(q4.projectedHeads).toBeCloseTo(
      (tile(a, 'recruiting-current')?.value as number) +
        (q4.futureStarts as number) +
        1 +
        (q4.projectedStarts as number) -
        (q4.projectedExits as number),
      9,
    )
    // The card's records still add up to its value.
    expect(calcProblems(cardOf(tile(a, 'recruiting-projected')?.calc))).toEqual([])
  })

  it('in effect in the plan only: the seat counts in current heads, and the forecast’s start on it is left out', () => {
    const m = moveSides(s)
    const held = withMovePlanned(s, m, '2026-09-21')
    const ctx = hrbp(GTM, held)
    expect(hiringPrepOf(ctx).seats.get(m.to.positionId)?.filled).toBe(true)
    expect(
      openingStarts(ctx)
        .out.filter((x) => x.id === m.to.positionId)
        .map((x) => x.p),
    ).toEqual([0.9])
    for (const x of hiringPrepOf(ctx).projected?.values() ?? [])
      expect(x.openingSeats.get(m.to.positionId) ?? 0, x.month).toBe(0)
    // The openings are the base sample's less that seat's start.
    const openings = (c: AnalyticsContext) =>
      [...(hiringPrepOf(c).projected?.values() ?? [])].reduce((a, x) => a + x.openings, 0)
    expect(openings(ctx)).toBeCloseTo(openings(hrbp(GTM)) - 0.9, 9)
  })

  it('names the moves in in open to hire’s note, only when there are some', () => {
    const m = moveSides(s)
    const a = planRecruitingModel(hrbp(GTM, withMoveRecorded(s, m, ON, '2026-11-15')))
    expect(tile(a, 'recruiting-open')?.note).toBe('Approved − current − future starts − moves in')
    expect(tile(a, 'recruiting-open')?.formula).toMatch(/− 4 future starts − 1 move in by then\.$/)
    expect(tile(planRecruitingModel(hrbp(GTM)), 'recruiting-open')?.note).toBe(
      'Approved − current − future starts',
    )
  })
})

/* ───────────── a year that is over ───────────── */

describe('a year that is over (FY27 at 15 Apr 2027)', () => {
  it('opens a projected starts card that says so, with the tile’s 0 (none left to come, review RU-7)', () => {
    const m = planRecruitingModel(admin(s, { asOfOverride: '2027-04-15', version: 'fy27-working' }))
    const t = tile(m, 'recruiting-projected')
    expect([t?.value, t?.note, t?.calcWhenEmpty]).toEqual([0, 'FY27 is over', true])
    const card = cardOf(t?.calc)
    expect(card.value).toBe(0)
    expect(sameResult(card.value, t?.value ?? null, card.format)).toBe(true)
    expect(calcProblems(card)).toEqual([])
    expect(card.steps.at(-1)?.label).toMatch(/^FY27 is over/)
    // Every tile's card agrees with its tile.
    for (const k of m.kpis) {
      const c = resolveCalc(k.calc as never)
      if (c) expect(sameResult(c.value, k.value, c.format), k.id).toBe(true)
    }
    expect(m.quarters.rows).toEqual([])
    expect(m.months.rows.every((r) => r.kind !== 'ahead')).toBe(true)
  })
})

/* ───────────── no close ───────────── */

describe('no closed month', () => {
  it('shows the quarters that end after the as-of date only: Q2 ends on it', () => {
    const ctx = admin(withPlan(s, { closes: [] }))
    // Control: Plan > Hiring reads Q2 as a quarter ahead (it holds the as-of date, no month closed).
    expect(hiringBuiltOf(ctx).r.table.quarters.map((q) => q.kind)).toEqual([
      'history',
      'ahead',
      'ahead',
      'ahead',
    ])
    const m = planRecruitingModel(ctx)
    expect(m.quarters.rows.map((r) => r.key)).toEqual(['q3', 'q4'])
    // The months ahead start in October and add up to each quarter row.
    const ahead = m.months.rows.filter((r) => r.kind === 'ahead')
    expect(ahead.map((r) => r.month)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
    ])
    expect(m.months.rows.some((r) => r.kind === 'actual')).toBe(false)
    const q3 = m.quarters.rows[0]
    expect(monthRow(m, '2026-12').projectedHeads).toBeCloseTo(q3.projectedHeads as number, 9)
    expect(ahead.slice(0, 3).reduce((a, r) => a + (r.futureStarts ?? 0), 0)).toBe(q3.futureStarts)
    expect(tile(m, 'recruiting-velocity')?.value).toBeNull()
    expect(tile(m, 'recruiting-velocity')?.note).toBe('The 3-month pace needs 3 closed months')
    expect(calcProblems(cardOf(tile(m, 'recruiting-velocity')?.calc))).toEqual([])
    expect(m.where.rows).toEqual([])
    expect(m.where.empty).toBe('The last 3 months show once 3 months are closed.')
  })
})

/* ───────────── no Working forecast ───────────── */

describe('no Working forecast (FY27 Working retired)', () => {
  it('shows no projection: projected starts, projected heads and the gap read "—", attrition holds known exits only', () => {
    const ctx = admin(noWorking(s))
    expect(hiringPrepOf(ctx).projected).toBeNull()
    const m = planRecruitingModel(ctx)
    const t = tile(m, 'recruiting-projected')
    expect([t?.value, t?.note]).toEqual([null, NO_FORECAST_NOTE])
    const card = cardOf(t?.calc)
    expect([card.value, calcProblems(card)]).toEqual([null, []])
    // Projected attrition is Plan > Hiring's E: the known exits alone, and says so.
    const hiring = planHiringModel(ctx)
    const a = tile(m, 'recruiting-attrition')
    expect(a?.value).toBe(hiring.quarters.rows.find((r) => r.key === 'exits')?.q4)
    expect(a?.note).toBe(KNOWN_EXITS_ONLY_NOTE)
    expect(KNOWN_EXITS_ONLY_NOTE).toBe('Known exits only: no Working forecast yet')
    for (const r of m.quarters.rows) {
      expect([r.projectedStarts, r.projectedHeads, r.gap, r.gapNote], r.key).toEqual([null, null, null, null])
      expect(r.futureStarts, r.key).toBeGreaterThan(0)
    }
    for (const r of m.months.rows.filter((x) => x.kind === 'ahead'))
      expect([r.projectedStarts, r.projectedHeads], r.month).toEqual([null, null])
    expect(m.months.note).toBe(
      `${NO_FORECAST_NOTE}: projected starts and modeled exits show once there is one.`,
    )
    // Control: with FY27 Working, the same tab projects heads.
    const base = planRecruitingModel(admin())
    expect(base.quarters.rows.every((r) => typeof r.projectedHeads === 'number')).toBe(true)
    expect(tile(base, 'recruiting-attrition')?.note).toMatch(/^Attrition \(heads\) /)
  })
})

/* ───────────── where hiring happened ───────────── */

describe('where hiring happened ranks by hires, keeping Plan > Hiring’s order on a tie', () => {
  const loc = (location: string, total: number): HiringRecentRow => ({
    key: `location|${location}`,
    kind: 'location',
    department: ALL_DEPARTMENTS,
    location,
    m1: total,
    m2: 0,
    m3: 0,
    total,
    perMonth: total / 3,
  })

  it('puts "No location" after the named places with as many hires', () => {
    // Plan > Hiring's order: names alphabetically, "No ..." last.
    const rows = [loc('Austin', 3), loc('Bengaluru', 5), loc('Shanghai', 3), loc('No location', 3)]
    expect(rankWhere(rows, 'location').map((r) => r.location)).toEqual([
      'Bengaluru',
      'Austin',
      'Shanghai',
      'No location',
    ])
  })
})

/** A card's records, resolved. */
function resolveDrillRows(card: CalcSpec): readonly unknown[] {
  const src = card.rows
  const spec = typeof src === 'function' ? src() : src
  return spec?.rows ?? []
}
