/**
 * Plan > Recruiting summary's model under the states its fix review (27 Oct 2026) found wrong, each
 * against an independent control: the forecast run's own starts and heads (docs/PLAN.md 9.8, change
 * C38; the readings are in ./recruitingModel.ts's module comment, review ids in the test names).
 *
 *  - RN-1: a month-end as-of date before that month is closed (31 Oct, 30 Nov 2026).
 *  - RN-2: a signed offer past its start date that the HRIS has not recorded (15 Oct 2026).
 *  - RN-3: a last day on the as-of date (and the 1 Oct control).
 *  - RN-4: a pre-hire the HRIS holds with no signed offer (16 Nov 2026; as of 31 Aug 2026).
 *  - AF-2 (the finish audit, 28 Oct 2026): an as-of date before the last close (31 Aug and 15 Aug
 *    2026), where each month ahead is the run's flows month by month.
 *  - RN-5, RU-10: the fiscal year end cards' titles and the span of a later year's flow tiles.
 *  - RN-6: the rate under projected attrition is Plan > Hiring's, over 12 closed months.
 *  - RN-7: a tie at the top-5 cut of where hiring happened is named on the more line.
 *  - RN-8: the quarter table's note names current heads and the rounding.
 *  - RU-5: a mid-month as-of date's month carries its actual hires and exits to date.
 *  - RU-6, RU-7: the words with no Working forecast and in a year that is over.
 *  - RU-9, RU-12, RU-15, RS-1: the velocity note, one name for expected exits, the 0.0 gap, a card
 *    on every tile.
 * Heads only throughout. Each of these failed on the model before its fix (the review's probes,
 * scratchpad/recruiting/verify, hold the old values: 38.71 projected starts at 31 Oct, 2.00 heads short
 * of the run at 15 Oct, 1.00 over with a last day on 30 Sep, 1.00 short with a pre-hire).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Column } from '@/charts/types'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { fyRange, monthEnd, monthKey } from '@/data/fiscal'
import type { PersonaKey, Sample } from '@/data/sample'
import type { Month, WorkerRow } from '@/data/schema'
import { type CalcSpec, calcProblems, resolveCalc, sameResult } from '@/drill/calc'
import { type DrillSource, resolveDrill } from '@/drill/types'
import { leakSample, personaCtx, sampleCtx, withDatasets, withPlan, withWorker } from '@/testkit/sample'
import { forecastFlows, forecastHeads } from '@/views/forecast/engine/heads'
import { hiringForecast, hiringPrepOf } from './hiringData'
import { hiringBuiltOf } from './hiringModel'
import { planHiringModel } from './hiringTab'
import { whereTieOf } from './recruitingModel'
import {
  gapText,
  ON_APPROVED_TEXT,
  type PlanRecruiting,
  planRecruitingModel,
  type RecruitingMonthRow,
  WHERE_TOP,
  whereMoreText,
} from './recruitingTab'

let s: Sample

beforeAll(() => {
  s = leakSample()
}, 120_000)

const SE: PersonaKey = 'hrbp-se'
const CO: PersonaKey = 'finance-fpa'

const tile = (m: { kpis: readonly Kpi[] }, id: string) => m.kpis.find((k) => k.id === id)
const cardOf = (src: unknown): CalcSpec => resolveCalc(src as never) as CalcSpec
const row = (m: PlanRecruiting, month: string) =>
  m.months.rows.find((r) => r.month === month) as RecruitingMonthRow
const cellCard = <R extends object>(fig: { columns: readonly Column<R>[] }, key: string, r: R): CalcSpec =>
  cardOf((fig.columns.find((c) => c.key === key) as Column<R>).calc?.(r))

const isEmp = (w: WorkerRow) => (w.workerType || 'Employee') === 'Employee'
const startOf = (w: WorkerRow) => w.assignmentStart || w.hireDate
const activeOnDay = (w: WorkerRow, d: string) =>
  isEmp(w) &&
  startOf(w) <= d &&
  (!w.assignmentEnd || w.assignmentEnd >= d) &&
  (!w.terminationDate || w.terminationDate >= d)

/**
 * The forecast run Plan > Hiring reads, as an independent control: its heads at each month end (plus
 * the scope's people not in plan, who count in current heads and are in no forecast line), its
 * starts on Open and Planned seats in scope, and its flows.
 */
function runOf(ctx: AnalyticsContext) {
  const h = hiringPrepOf(ctx)
  const ids = h.p.scope.ids
  const fp = hiringForecast(ctx, ids)
  if (!fp.run) throw new Error('No Working forecast.')
  const run = fp.run
  const heads = forecastHeads(fp).heads
  const flows = forecastFlows(fp)
  const notInPlan = (d: string) =>
    new Set(h.p.scope.workers.filter((w) => !w.positionId && activeOnDay(w, d)).map((w) => w.employeeId)).size
  const headsAt = (m: Month) => (heads.get(m) ?? 0) + notInPlan(monthEnd(m))
  const fyEnd = fyRange(h.p.fiscalYear).end
  let openings = 0
  for (const [id, starts] of run.starts) {
    if (!ids.has(id)) continue
    for (const x of starts) if (x.kind !== 'offer' && x.start <= fyEnd) openings += x.probability
  }
  let backfills = 0
  for (const [m, f] of flows)
    if (monthEnd(m) > ctx.asOf && monthEnd(m) <= fyEnd && m > run.actualThrough)
      backfills += f.modeledBackfills
  return { run, flows, headsAt, notInPlan, openings, backfills }
}

const ahead = (m: PlanRecruiting) => m.months.rows.filter((r) => r.kind === 'ahead')

/** Each month's parts net to the line's step: projected heads at its end less at the month before's (RU-5). */
function expectRowsNet(m: PlanRecruiting, where: string) {
  const rows = m.months.rows
  for (const [i, r] of rows.entries()) {
    if (r.kind !== 'ahead' || r.projectedHeads == null) continue
    const prev = rows[i - 1]
    const before = prev ? (prev.kind === 'ahead' ? prev.projectedHeads : prev.heads) : null
    if (before == null) continue
    const step =
      (r.hires ?? 0) -
      (r.exits ?? 0) +
      (r.futureStarts ?? 0) +
      (r.movesIn ?? 0) +
      (r.pastStart ?? 0) +
      (r.preHires ?? 0) -
      (r.leaving ?? 0) +
      (r.projectedStarts ?? 0) -
      (r.projectedExits ?? 0)
    expect(Math.abs(r.projectedHeads - before - step), `${where} ${r.month}`).toBeLessThan(1e-9)
  }
}

/* ───────────── RN-1 ───────────── */

describe('a month-end as-of date before that month is closed (RN-1)', () => {
  it.each([
    [SE, '2026-10-31', 47.21],
    [SE, '2026-11-30', 47.14],
    [CO, '2026-10-31', 163.83],
  ] as const)(
    '%s at %s: projected starts hold every opening the run starts by the year end',
    (key, asOf, want) => {
      const ctx = personaCtx(key, { asOfOverride: asOf, sample: s })
      const m = planRecruitingModel(ctx)
      const ctl = runOf(ctx)
      // The run has not closed the as-of month: it projects from October.
      expect(ctl.run.actualThrough).toBe('2026-09')
      // Independent: the run's openings to the year end, plus its backfills of the months ending after the as-of date.
      const t = tile(m, 'recruiting-projected')?.value as number
      expect(t).toBeCloseTo(ctl.openings + ctl.backfills, 9)
      expect(Math.round(t * 100) / 100).toBe(want)
      // The quarter table and the months ahead read the same openings.
      const sum = ahead(m).reduce((a, r) => a + (r.projectedStarts ?? 0), 0)
      expect(sum).toBeCloseTo(t, 9)
    },
  )

  it('shows the as-of month as ended, from the HRIS, and the months ahead from the next one', () => {
    const at31 = planRecruitingModel(personaCtx(SE, { asOfOverride: '2026-10-31', sample: s }))
    const oct = row(at31, '2026-10')
    expect([oct.kind, oct.kindText, oct.projectedHeads, oct.futureStarts]).toEqual([
      'ended',
      'Ended, not closed',
      null,
      null,
    ])
    // Its heads are current heads on the as-of date, its hires and exits the HRIS's for the month.
    expect(oct.heads).toBe(tile(at31, 'recruiting-current')?.value)
    const b = hiringBuiltOf(personaCtx(SE, { asOfOverride: '2026-10-31', sample: s }))
    const inOct = (which: 'hires' | 'exits') =>
      (which === 'hires' ? b.h.input.hires : b.h.input.exits).filter((e) => monthKey(e.on) === '2026-10')
        .length
    expect([oct.hires, oct.exits]).toEqual([inOct('hires'), inOct('exits')])
    expect(ahead(at31)[0].month).toBe('2026-11')
    // Its records open: the hires and exits of the month, the heads at its end.
    for (const key of ['hires', 'exits', 'heads'] as const) {
      const col = at31.months.columns.find((c) => c.key === key) as Column<RecruitingMonthRow>
      const spec = resolveDrill(col.drill?.(oct) as DrillSource)
      const card = spec ? null : resolveCalc(col.calc?.(oct) as never)
      expect(spec ?? card, key).not.toBeNull()
    }
    const at30 = planRecruitingModel(personaCtx(SE, { asOfOverride: '2026-11-30', sample: s }))
    expect(at30.months.rows.filter((r) => r.kind === 'ended').map((r) => r.month)).toEqual([
      '2026-10',
      '2026-11',
    ])
    expect(ahead(at30)[0].month).toBe('2026-12')
    expectRowsNet(at31, '31 Oct')
    expectRowsNet(at30, '30 Nov')
  })

  it('reaches the run’s heads but for the as-of month’s modeled exits and backfills, which it leaves out (H5)', () => {
    const ctx = personaCtx(SE, { asOfOverride: '2026-10-31', sample: s })
    const m = planRecruitingModel(ctx)
    const ctl = runOf(ctx)
    const oct = ctl.flows.get('2026-10')
    const left = (oct?.modeledExits ?? 0) - (oct?.modeledBackfills ?? 0)
    expect(left).toBeGreaterThan(0)
    for (const r of ahead(m))
      expect((r.projectedHeads as number) - ctl.headsAt(r.month), r.month).toBeCloseTo(left, 6)
  })

  it('control: at 30 Sep (September closed) the as-of month is closed and nothing changes', () => {
    const m = planRecruitingModel(personaCtx(SE, { sample: s }))
    expect(m.months.rows.some((r) => r.kind === 'ended')).toBe(false)
    expect(tile(m, 'recruiting-projected')?.value as number).toBeCloseTo(47.2634, 3)
  })
})

/* ───────────── RN-2, RN-3, RN-4 ───────────── */

/** Projected heads equal the run's heads at every month end ahead (the run is the independent control). */
function expectRunHeads(ctx: AnalyticsContext, tolerance = 1e-6) {
  const m = planRecruitingModel(ctx)
  const ctl = runOf(ctx)
  for (const r of ahead(m))
    expect(Math.abs((r.projectedHeads as number) - ctl.headsAt(r.month)), r.month).toBeLessThan(tolerance)
  return m
}

describe('a signed offer past its start date that the HRIS has not recorded (RN-2)', () => {
  it('counts in projected heads from the first month ahead, named apart, never a future start', () => {
    const ctx = personaCtx(SE, { asOfOverride: '2026-10-15', sample: s })
    const m = expectRunHeads(ctx)
    // REQ-4202 and REQ-4216 started on 12 Oct; Plan > Hiring's future starts and open to hire stay its own.
    const hm = planHiringModel(ctx)
    expect(tile(m, 'recruiting-future')?.value).toBe(tile(hm, 'hiring-accepted')?.value)
    expect(tile(m, 'recruiting-future')?.value).toBe(7)
    expect(tile(m, 'recruiting-open')?.value).toBe(tile(hm, 'hiring-open')?.value)
    const oct = row(m, '2026-10')
    expect([oct.pastStart, oct.futureStarts]).toEqual([2, 1])
    expect(m.months.rows.filter((r) => r.month !== '2026-10').every((r) => !r.pastStart)).toBe(true)
    expect(m.months.columns.find((c) => c.key === 'pastStart')?.label).toBe(
      'Signed offers past their start date',
    )
    // Its records are the two signed offers, dates only; the heads card names the term.
    const col = m.months.columns.find((c) => c.key === 'pastStart') as Column<RecruitingMonthRow>
    const spec = resolveDrill(col.drill?.(oct) as DrillSource)
    expect(spec?.kind).toBe('reqs')
    expect(spec?.rows.map((r) => (r as { reqId: string }).reqId).sort()).toEqual(['REQ-4202', 'REQ-4216'])
    const card = cellCard(m.months, 'projectedHeads', oct)
    expect(calcProblems(card)).toEqual([])
    expect(
      card.inputs.find((i) => i.label === 'Signed offers past their start date, not in the HRIS yet')?.value,
    ).toBe(2)
    expect(card.steps[0].label).toBe(
      'Projected heads = current heads + future starts + signed offers past their start date + projected starts − projected attrition',
    )
    const q3 = m.quarters.rows.find((r) => r.key === 'q3')
    expect(q3?.pastStart).toBe(2)
  })

  it('reaches the run’s heads for the company too (within the P-2015 known exit, 0.03)', () => {
    expectRunHeads(personaCtx(CO, { asOfOverride: '2026-10-15', sample: s }), 0.03)
  })

  it('control: at 30 Sep no signed offer is past its start date, and the column does not show', () => {
    const m = expectRunHeads(personaCtx(SE, { sample: s }))
    expect(m.months.rows.every((r) => !r.pastStart)).toBe(true)
    expect(m.months.columns.some((c) => c.key === 'pastStart')).toBe(false)
  })
})

/** A Silicon Engineering employee alone on a Filled seat with no last day, hired well before the as-of date. */
function seHolder(ctx: AnalyticsContext): WorkerRow {
  const ids = hiringPrepOf(ctx).p.scope.ids
  const workers = s.datasets.workers
  return workers.find(
    (w) =>
      w.positionId &&
      ids.has(w.positionId) &&
      isEmp(w) &&
      !w.terminationDate &&
      !w.assignmentEnd &&
      startOf(w) <= '2026-01-01' &&
      workers.filter((x) => x.employeeId === w.employeeId).length === 1,
  ) as WorkerRow
}

describe('a last day on the as-of date (RN-3)', () => {
  it('is in current heads and out of projected heads from the first month ahead, as the run reads it', () => {
    const holder = seHolder(personaCtx(SE, { sample: s }))
    const ctx = personaCtx(SE, {
      sample: withWorker(s, holder.employeeId, { terminationDate: '2026-09-30' }),
    })
    const m = expectRunHeads(ctx)
    expect(tile(m, 'recruiting-current')?.value).toBe(556)
    const oct = row(m, '2026-10')
    expect(oct.leaving).toBe(1)
    expect(m.months.rows.filter((r) => r.month !== '2026-10').every((r) => !r.leaving)).toBe(true)
    const card = cellCard(m.months, 'projectedHeads', oct)
    expect(calcProblems(card)).toEqual([])
    expect(
      card.inputs.find((i) => i.label === 'Of them, last day on 30 Sep 2026 (not counted after it)')?.value,
    ).toBe(1)
    expect(card.steps[0].label).toMatch(
      /^Projected heads = current heads − last days on the as-of date \+ future starts/,
    )
    // Its records are the one person (or their seat, as the mode lists people).
    const col = m.months.columns.find((c) => c.key === 'leaving') as Column<RecruitingMonthRow>
    const spec = resolveDrill(col.drill?.(oct) as DrillSource)
    expect(spec?.rows.length).toBe(1)
  })

  it('control: a last day on 1 Oct is a known exit, and nothing is left on the as-of date', () => {
    const holder = seHolder(personaCtx(SE, { sample: s }))
    const ctx = personaCtx(SE, {
      sample: withWorker(s, holder.employeeId, { terminationDate: '2026-10-01' }),
    })
    const m = expectRunHeads(ctx)
    expect(m.months.rows.every((r) => !r.leaving)).toBe(true)
  })
})

describe('a pre-hire the HRIS holds with no signed offer on its seat (RN-4)', () => {
  it('counts in projected heads from its hire date, as the run counts it, and moves no Plan > Hiring number', () => {
    const base = personaCtx(SE, { sample: s })
    const ctl0 = runOf(base)
    const ids = hiringPrepOf(base).p.scope.ids
    const seat = [...ctl0.run.starts].find(
      ([id, st]) => ids.has(id) && st.some((x) => x.kind === 'open' && x.start > '2026-11-16'),
    )?.[0] as string
    expect(seat).toBeTruthy()
    const tmpl = s.datasets.workers.find(
      (w) => w.positionId && ids.has(w.positionId) && isEmp(w),
    ) as WorkerRow
    const pre: WorkerRow = {
      ...tmpl,
      employeeId: 'E-FIX-PREHIRE',
      positionId: seat,
      assignmentStart: null,
      assignmentEnd: null,
      hireDate: '2026-11-16',
      terminationDate: null,
    } as WorkerRow
    const ctx = personaCtx(SE, { sample: withDatasets(s, { workers: [...s.datasets.workers, pre] }) })
    const m = expectRunHeads(ctx)
    expect([...hiringPrepOf(ctx).preHires.keys()]).toEqual(['hire:E-FIX-PREHIRE|2026-11-16'])
    expect(row(m, '2026-11').preHires).toBe(1)
    expect(m.months.rows.filter((r) => r.month !== '2026-11').every((r) => !r.preHires)).toBe(true)
    // Plan > Hiring's own numbers stay: no future start, no move in.
    const hm = planHiringModel(ctx)
    expect(tile(m, 'recruiting-future')?.value).toBe(tile(hm, 'hiring-accepted')?.value)
    expect(tile(m, 'recruiting-open')?.value).toBe(tile(hm, 'hiring-open')?.value)
    const card = cellCard(m.months, 'projectedHeads', row(m, '2026-11'))
    expect(calcProblems(card)).toEqual([])
    expect(card.inputs.find((i) => /^Pre-hires in the HRIS/.test(i.label))?.value).toBe(1)
  })

  it('as of 31 Aug 2026, the September hires the HRIS already holds count, and September’s heads are the close’s', () => {
    const ctx = personaCtx(SE, { asOfOverride: '2026-08-31', sample: s })
    const m = planRecruitingModel(ctx)
    const ctl = runOf(ctx)
    const sep = row(m, '2026-09')
    expect(sep.preHires).toBeGreaterThanOrEqual(3)
    expect(sep.projectedHeads as number).toBeCloseTo(ctl.headsAt('2026-09'), 6)
    expect(Math.round(sep.projectedHeads as number)).toBe(556)
  })

  it.each([
    [SE, '2026-08-31'],
    [SE, '2026-08-15'],
    [CO, '2026-08-31'],
  ] as const)(
    '%s as of %s, before the last close: every month ahead from September is the run’s flows (finish audit AF-2)',
    (key, asOf) => {
      const ctx = personaCtx(key, { asOfOverride: asOf, sample: s })
      const m = planRecruitingModel(ctx)
      const ctl = runOf(ctx)
      // The run reads September's close, which the as-of date does not know.
      expect(ctl.run.actualThrough).toBe('2026-09')
      const rows = m.months.rows
      let checked = 0
      for (const [i, r] of rows.entries()) {
        if (r.kind !== 'ahead' || r.month < '2026-09') continue
        const prev = rows[i - 1]
        const before = (prev.kind === 'ahead' ? prev.projectedHeads : prev.heads) as number
        const f = ctl.flows.get(r.month)
        if (!f) throw new Error(`No flows for ${r.month}`)
        // The run's flows: its starts and backfills less its known and modeled exits, and people not in plan.
        const flows =
          f.starts +
          f.modeledBackfills -
          f.knownExits -
          f.modeledExits +
          ctl.notInPlan(monthEnd(r.month)) -
          ctl.notInPlan(monthEnd(prev.month))
        expect((r.projectedHeads as number) - before, r.month).toBeCloseTo(flows, 6)
        checked++
      }
      expect(checked).toBe(7)
      // September's heads are the run's; from October the run's own heads sit below its flows (an open
      // item of the forecast's, PLAN R134), so projected heads are compared with its flows, not its heads.
      expect(row(m, '2026-09').projectedHeads as number).toBeCloseTo(ctl.headsAt('2026-09'), 6)
    },
  )
})

/* ───────────── RN-5, RU-10 ───────────── */

describe('the year end cards and a later year’s flow tiles (RN-5, RU-10)', () => {
  it('title the year end cards by their day and name the span from the as-of date, in every year', () => {
    for (const [version, end] of [
      [undefined, '31 Mar 2027'],
      ['fy28-working', '31 Mar 2028'],
    ] as const) {
      const m = planRecruitingModel(sampleCtx('hrbp', version ? { version } : {}))
      expect(cardOf(tile(m, 'recruiting-projected')?.calc).title).toBe(`Projected starts by ${end}`)
      expect(cardOf(tile(m, 'recruiting-attrition')?.calc).title).toBe(`Projected attrition by ${end}`)
      expect(tile(m, 'recruiting-projected')?.formula).toContain(`from 30 Sep 2026 to ${end}`)
      expect(tile(m, 'recruiting-attrition')?.formula).toContain(`from 30 Sep 2026 to ${end}`)
    }
  })

  it('name the span of the flow tiles and the quarters only when the year shown does not hold the as-of date', () => {
    const fy28 = planRecruitingModel(sampleCtx('hrbp', { version: 'fy28-working' }))
    expect(
      ['recruiting-future', 'recruiting-projected', 'recruiting-attrition'].map(
        (id) => tile(fy28, id)?.label,
      ),
    ).toEqual([
      'Future starts to FY28 end',
      'Projected starts to FY28 end',
      'Projected attrition to FY28 end',
    ])
    expect(fy28.quarters.rows.map((r) => r.label)).toEqual([
      'Q1 FY28, Apr to Jun',
      'Q2 FY28, Jul to Sep',
      'Q3 FY28, Oct to Dec',
      'Q4 FY28, Jan to Mar',
    ])
    // Control: FY27, the as-of year, keeps the short words.
    const fy27 = planRecruitingModel(sampleCtx('hrbp'))
    expect(
      ['recruiting-future', 'recruiting-projected', 'recruiting-attrition'].map(
        (id) => tile(fy27, id)?.label,
      ),
    ).toEqual(['Future starts', 'Projected starts', 'Projected attrition'])
    expect(fy27.quarters.rows.map((r) => r.label)).toEqual(['Q3, Oct to Dec', 'Q4, Jan to Mar'])
  })
})

/* ───────────── RN-6, RU-9 ───────────── */

describe('the notes under projected attrition and hiring velocity (RN-6, RU-4, RU-9)', () => {
  it.each([['manager'], ['hrbp'], ['leader'], ['finance'], ['hr-admin']] as const)(
    'name the trailing rate in Plan > Hiring’s words, and keep the velocity note short (%s)',
    (mode) => {
      const ctx = sampleCtx(mode)
      const m = planRecruitingModel(ctx)
      const hm = planHiringModel(ctx)
      expect(tile(m, 'recruiting-attrition')?.note).toBe(tile(hm, 'hiring-net-pace')?.note)
      expect(tile(m, 'recruiting-attrition')?.note).toMatch(
        /^Attrition \(heads\) [\d.]+% over 12 closed months$/,
      )
      const v = tile(m, 'recruiting-velocity')
      expect(v?.note).toMatch(/^6-month pace [\d.]+; \d+ hires? in 3 months$/)
      expect((v?.note ?? '').length).toBeLessThanOrEqual(45)
      expect(v?.formula).toContain('3-month pace')
    },
  )

  it('pins Silicon Engineering’s notes', () => {
    const m = planRecruitingModel(personaCtx(SE, { sample: s }))
    expect(tile(m, 'recruiting-attrition')?.note).toBe('Attrition (heads) 6.6% over 12 closed months')
    expect(tile(m, 'recruiting-velocity')?.note).toBe('6-month pace 4.5; 13 hires in 3 months')
  })
})

/* ───────────── RN-7 ───────────── */

describe('a tie at the top-5 cut of where hiring happened (RN-7)', () => {
  it('is counted and named on the more line', () => {
    const co = planRecruitingModel(personaCtx(CO, { sample: s }))
    expect(co.whereMore).toEqual({ locations: 4, departments: 11 })
    expect(co.whereTies).toEqual({ locations: { tied: 1, hires: 3 }, departments: { tied: 2, hires: 3 } })
    expect(whereMoreText(co.whereMore.locations, co.whereTies.locations, ['location', 'locations'])).toBe(
      'and 4 more locations, 1 tied with the fifth at 3 hires',
    )
    expect(
      whereMoreText(co.whereMore.departments, co.whereTies.departments, ['department', 'departments']),
    ).toBe('and 11 more departments, 2 tied with the fifth at 3 hires')
    const se = planRecruitingModel(personaCtx(SE, { sample: s }))
    expect(
      whereMoreText(se.whereMore.departments, se.whereTies.departments, ['department', 'departments']),
    ).toBe('and 1 more department, 1 tied with the fifth at 1 hire')
  })

  it('control: no tie at the cut, the plain more line; nothing beyond the cut, no line', () => {
    const rows = (n: number[]) =>
      n.map((total, i) => ({ kind: 'location', total, key: `l${i}` }) as never) as Parameters<
        typeof whereTieOf
      >[0]
    expect(whereTieOf(rows([5, 4, 4, 3, 3, 2, 1]))).toBeNull()
    expect(whereTieOf(rows([5, 4, 3]))).toBeNull()
    expect(whereTieOf(rows([5, 4, 4, 3, 2, 2, 2]))).toEqual({ tied: 2, hires: 2 })
    expect(whereMoreText(2, null, ['location', 'locations'])).toBe('and 2 more locations')
    expect(whereMoreText(0, null, ['location', 'locations'])).toBeNull()
    expect(WHERE_TOP).toBe(5)
  })
})

/* ───────────── RN-8, RU-15 ───────────── */

describe('the quarter table’s words (RN-8, RU-15)', () => {
  it('names current heads and the rounding, and moves in only when a quarter holds one', () => {
    const m = planRecruitingModel(personaCtx(SE, { sample: s }))
    expect(m.quarters.note).toBe(
      'Future starts and projected attrition are Plan > Hiring’s; projected starts are the forecast’s model. Projected heads begin at current heads, 556 heads on 30 Sep 2026; the parts are rounded to one decimal, so they can be 0.1 off the total.',
    )
    expect(m.quarters.columns.some((c) => c.key === 'movesIn')).toBe(false)
  })

  it('reads a gap that rounds to 0.0 as on approved heads, never the missing-value dash', () => {
    expect([gapText(0.04), gapText(-0.04), gapText(0)]).toEqual([
      ON_APPROVED_TEXT,
      ON_APPROVED_TEXT,
      ON_APPROVED_TEXT,
    ])
    expect(ON_APPROVED_TEXT).toBe('On approved heads')
    expect([gapText(-12.04), gapText(1)]).toEqual(['Short by 12.0', 'Over by 1.0'])
  })
})

/* ───────────── RU-5 ───────────── */

describe('a mid-month as-of date (RU-5)', () => {
  it('gives the as-of month its actual hires and exits to date, so its exits are Plan > Hiring’s and its bars net to the line', () => {
    const ctx = sampleCtx('hr-admin', { asOfOverride: '2026-10-15' })
    const m = planRecruitingModel(ctx)
    const oct = row(m, '2026-10')
    expect([oct.kind, oct.kindText]).toEqual(['ahead', 'Actual to 15 Oct, then ahead'])
    expect([oct.hires, oct.exits]).toEqual([0, 3])
    // Exits to date plus projected attrition ahead are Plan > Hiring's velocity exits of October.
    const v = hiringBuiltOf(ctx).r.velocity.months.find((x) => x.month === '2026-10')
    expect((oct.exits ?? 0) + (oct.projectedExits ?? 0)).toBeCloseTo(v?.exits as number, 9)
    // Current heads less September's close heads are October's hires less exits to date.
    const sep = row(m, '2026-09')
    expect((tile(m, 'recruiting-current')?.value as number) - (sep.heads as number)).toBe(
      (oct.hires ?? 0) - (oct.exits ?? 0),
    )
    expectRowsNet(m, '15 Oct')
    // The to-date cells open the month's own records.
    const col = m.months.columns.find((c) => c.key === 'exits') as Column<RecruitingMonthRow>
    const spec = resolveDrill(col.drill?.(oct) as DrillSource)
    expect(spec?.title).toBe('Exits, Oct 2026 to 15 Oct')
    expect(spec?.rows.length).toBe(3)
  })

  it('control: a month-end as-of date has no part month', () => {
    const m = planRecruitingModel(sampleCtx('hr-admin'))
    expect(ahead(m).every((r) => r.hires == null && r.exits == null && r.kindText === 'Ahead')).toBe(true)
    expectRowsNet(m, '30 Sep')
  })
})

/* ───────────── RU-6, RU-7 ───────────── */

const noWorking = (x: Sample): Sample =>
  withPlan(x, {
    versions: x.plan.versions.map((v) =>
      v.versionId === 'fy27-working' ? ({ ...v, state: 'retired' } as typeof v) : v,
    ),
  })

describe('no Working forecast, and a year that is over (RU-6, RU-7)', () => {
  it('says projected attrition holds known exits only, in its formula too', () => {
    const m = planRecruitingModel(sampleCtx('hr-admin', { sample: noWorking(s) }))
    expect(tile(m, 'recruiting-attrition')?.formula).toBe('Known exits from 30 Sep 2026 to 31 Mar 2027.')
  })

  it('in a year that is over: 0 to come with a card, approved heads "—" with a card, and no promise of months ahead', () => {
    const ctx = sampleCtx('hr-admin', { asOfOverride: '2027-04-15', version: 'fy27-working' })
    const m = planRecruitingModel(ctx)
    for (const [id, value] of [
      ['recruiting-approved', null],
      ['recruiting-projected', 0],
      ['recruiting-attrition', 0],
    ] as const) {
      const t = tile(m, id)
      expect([t?.value, t?.note, t?.calcWhenEmpty], id).toEqual([value, 'FY27 is over', true])
      const card = cardOf(t?.calc)
      expect(calcProblems(card), id).toEqual([])
      expect(sameResult(card.value, value, card.format), id).toBe(true)
      expect(card.steps.at(-1)?.label, id).toMatch(/^FY27 is over: /)
    }
    expect(tile(m, 'recruiting-attrition')?.formula).toBe('FY27 is over.')
    expect(m.months.subtitle).not.toMatch(/future starts|projected|approved/i)
    expect(m.months.subtitle).toMatch(/FY27 is over/)
    expect(m.quarters.rows).toEqual([])
    expect(m.quarters.subtitle).not.toMatch(/^From /)
    expect(m.quarters.subtitle).not.toMatch(/to 31 Mar 2027|15 Apr 2027/)
    expect(m.quarters.note).toBeNull()
  })
})

/* ───────────── RU-12, RS-5 ───────────── */

/** Every word the tab shows: tiles, figures, every cell's card and records titles. */
function wordsOf(m: PlanRecruiting): string[] {
  const out: string[] = []
  for (const k of m.kpis) {
    out.push(k.label, k.note ?? '', k.formula ?? '')
    const c = resolveCalc(k.calc as never)
    if (c) out.push(c.title, ...c.inputs.map((i) => i.label), ...c.steps.map((x) => x.label))
  }
  for (const f of [m.months, m.quarters, m.where] as {
    title: string
    subtitle?: string | null
    note?: string | null
    rows: readonly object[]
    columns: readonly Column<object>[]
  }[]) {
    out.push(f.title, f.subtitle ?? '', f.note ?? '', ...f.columns.map((c) => c.label))
    for (const r of f.rows)
      for (const c of f.columns) {
        const spec = resolveDrill(c.drill?.(r) as DrillSource)
        if (spec) out.push(spec.title)
        else {
          const card = resolveCalc(c.calc?.(r) as never)
          if (card)
            out.push(card.title, ...card.inputs.map((i) => i.label), ...card.steps.map((x) => x.label))
        }
      }
  }
  return out.filter(Boolean)
}

describe('one name for expected exits on the tab (RU-12, RS-5)', () => {
  it.each([['manager'], ['hrbp'], ['finance'], ['hr-admin']] as const)(
    'calls them projected attrition everywhere, never projected exits (%s)',
    (mode) => {
      const m = planRecruitingModel(sampleCtx(mode))
      const words = wordsOf(m)
      expect(words.length).toBeGreaterThan(60)
      expect(words.filter((w) => /projected exits?/i.test(w))).toEqual([])
      expect(m.months.columns.find((c) => c.key === 'projectedExits')?.label).toBe('Projected attrition')
      const oct = row(m, '2026-10')
      expect(cellCard(m.months, 'projectedExits', oct).title).toBe('Projected attrition, Oct 2026')
    },
  )
})

/* ───────────── RS-1 ───────────── */

describe('approved heads and current heads open calculation cards (RS-1)', () => {
  it.each([['manager'], ['hrbp'], ['leader'], ['finance'], ['hr-admin']] as const)(
    'that add up and list their records (%s)',
    (mode) => {
      const ctx = sampleCtx(mode)
      const m = planRecruitingModel(ctx)
      const b = hiringBuiltOf(ctx)
      // The strip opens a tile's records before its card: no drill, so the card opens.
      expect(tile(m, 'recruiting-approved')?.drill).toBeUndefined()
      expect(tile(m, 'recruiting-current')?.drill).toBeUndefined()
      const approved = cardOf(tile(m, 'recruiting-approved')?.calc)
      expect(calcProblems(approved)).toEqual([])
      expect(approved.value).toBe(tile(m, 'recruiting-approved')?.value)
      expect(approved.title).toBe('Approved heads by 31 Mar 2027')
      expect(approved.inputs[0]).toMatchObject({
        label: 'Approved seats on the as-of date (R1)',
        value: b.h.input.seats.length,
      })
      expect(resolveDrill(approved.rows as DrillSource)?.rows.length).toBe(approved.value)
      const current = cardOf(tile(m, 'recruiting-current')?.calc)
      expect(calcProblems(current)).toEqual([])
      expect(current.value).toBe(b.r.table.heads.total)
      if (current.rows) {
        expect(current.steps[0].label).toMatch(/^Current heads = people in approved seats \+ not in plan/)
        expect(current.inputs.reduce((a, i) => a + Number(i.value), 0)).toBe(current.value)
      }
    },
  )
})
