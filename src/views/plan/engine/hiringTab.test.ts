/**
 * Plan > Hiring's model on the sample (docs/PLAN.md 9.7, change C36; docs/CONTRACTS-HIRING.md 3, the
 * tab owner's tests): per mode, the six tiles in `HIRING_KPIS` order with their metric, lineage and
 * card; every counted cell's records hold its number and every card's last step is its value; every
 * drill hides `HIRING_DRILL_HIDE` (HR admin with "Show pay amounts" on included) and keeps to the
 * kinds the mode lists (Manager: seats and offers, never people); no amount, band or leave fact in
 * anything the tab reaches; "Over by n" on a negative open to hire and never a target; the readout's
 * 0 to 3 findings name positions; the model cached per context; and the numbers agree with Plan >
 * Overview (current heads, approved heads), Plan > Openings (open seats, accepted offers) and the
 * forecast (expected exits). Managers A, B and C are pinned, C's model is the same with and without
 * the confidential Elimination on C's own seat, and no salary, offer or leave change moves anything.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { HIRING_DRILL_HIDE, HIRING_DRILL_KINDS, HIRING_KPI_IDS, type HiringDrillKind } from '@/access/ids'
import type { Column } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import { monthEnd } from '@/data/fiscal'
import type { Mode, PositionRow } from '@/data/schema'
import { type CalcSpec, calcProblems, resolveCalc, sameResult, weightSum } from '@/drill/calc'
import { buildDrillTable } from '@/drill/records'
import { type DrillSource, type DrillSpec, resolveDrill } from '@/drill/types'
import { moneyOpts } from '@/lib/export/columns'
import { csvField, toCsv } from '@/lib/export/csv'
import { HIRING_INPUT_KEYS, hiringOf } from '@/plan/engine/hiring'
import { fromRow } from '@/plan/engine/requests'
import { amountsIn, cellsOf, isAmountKey } from '@/testkit/leaks'
import { withoutRequest, withPlan, withReq, withSalaryDelta, withWorker } from '@/testkit/sample'
import { prepare as forecastPrepare } from '@/views/forecast/engine/base'
import { forecastFlows } from '@/views/forecast/engine/heads'
import { type ForecastRun, runInputOf } from '@/views/forecast/engine/run'
import { ID } from '../metrics'
import { planModel } from '.'
import { type CtxOptions, sample, sampleCtx, withData } from './fixtures'
import { hiringForecast, hiringPrepOf, ruleThreeRows } from './hiringData'
import {
  behindByGap,
  behindByText,
  HIRING_KPIS,
  HIRING_ROWS,
  hiringInputOf,
  hiringOpenLabel,
  NOT_CLOSING_TEXT,
  ONLY_WHEN_NOT_ZERO,
  type PlanHiring,
  planHiringModel,
  QUARTER_KEYS,
  UNDER_A_TENTH,
} from './hiringTab'
import { openingsOf } from './openings'
import { expectPlainCopy, wordsOf } from './testing'

beforeAll(() => {
  sample()
}, 60_000)

/* ───────────── what the tab reaches ───────────── */

interface Reached {
  drills: { where: string; spec: DrillSpec; value: number | null }[]
  cards: { where: string; spec: CalcSpec; value: number | null }[]
}

function reach(m: PlanHiring): Reached {
  const out: Reached = { drills: [], cards: [] }
  const addDrill = (where: string, src: DrillSource, value: number | null = null) => {
    const spec = resolveDrill(src)
    if (spec) out.drills.push({ where, spec, value })
  }
  const addCard = (where: string, src: unknown, value: number | null | undefined) => {
    const spec = resolveCalc(src as never)
    if (!spec) return
    out.cards.push({ where, spec, value: value === undefined ? spec.value : value })
    addDrill(`${where} rows`, spec.rows)
  }
  for (const k of m.kpis) {
    addDrill(`tile ${k.id}`, k.drill, k.value)
    addDrill(`tile ${k.id} note`, k.noteDrill)
    addCard(`tile ${k.id}`, k.calc, k.value)
  }
  for (const f of m.findings) {
    addDrill(`finding ${f.id}`, f.drill)
    addCard(`finding ${f.id}`, f.calc, undefined)
  }
  for (const fig of [m.quarters, m.openByQuarter, m.velocity, m.recent] as const) {
    const cols = fig.columns as readonly Column[]
    for (const r of fig.rows as readonly Record<string, unknown>[])
      for (const c of cols) {
        const v = r[c.key]
        const value = typeof v === 'number' ? v : null
        const where = `${fig.id} ${String(r.key ?? r.month)} ${c.key}`
        if (c.drill) addDrill(where, c.drill(r) as DrillSource, value)
        if (c.calc) addCard(where, c.calc(r), value)
      }
  }
  return out
}

/** Every string a reader meets in the model, its records (visible columns) and its cards. */
function textsOf(ctx: AnalyticsContext, m: PlanHiring, r: Reached = reach(m)): string[] {
  const out: string[] = []
  const walk = (v: unknown, depth = 0) => {
    if (depth > 8 || v == null) return
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) for (const x of v) walk(x, depth + 1)
    else if (typeof v === 'object') for (const x of Object.values(v)) walk(x, depth + 1)
  }
  walk(m)
  for (const c of r.cards) walk({ ...c.spec, rows: undefined })
  for (const d of r.drills) {
    const t = buildDrillTable(d.spec, ctx)
    walk([d.spec.title, d.spec.subtitle, d.spec.note, t.columns.map((c) => c.label)])
    for (const row of t.rows) for (const c of t.columns) walk(row[c.key])
  }
  return out
}

/** Every key a reader meets in the model and its records' visible columns. */
function keysOf(ctx: AnalyticsContext, m: PlanHiring, r: Reached = reach(m)): string[] {
  const out = new Set<string>()
  const walk = (v: unknown, depth = 0) => {
    if (depth > 8 || v == null || typeof v !== 'object') return
    if (Array.isArray(v)) for (const x of v) walk(x, depth + 1)
    else
      for (const [k, x] of Object.entries(v)) {
        out.add(k)
        walk(x, depth + 1)
      }
  }
  walk(m)
  for (const c of r.cards) walk({ ...c.spec, rows: undefined })
  for (const d of r.drills) for (const c of buildDrillTable(d.spec, ctx).columns) out.add(c.key)
  return [...out]
}

/** A stable text of everything the tab reaches: the model, its cards and its records. */
function signature(ctx: AnalyticsContext, m: PlanHiring): string {
  const r = reach(m)
  return JSON.stringify({
    m,
    cards: r.cards.map((c) => [c.where, { ...c.spec, rows: undefined }]),
    drills: r.drills.map((d) => {
      const t = buildDrillTable(d.spec, ctx)
      return [
        d.where,
        d.spec.title,
        d.spec.subtitle ?? null,
        t.rows.map((row) => t.columns.map((c) => row[c.key])),
      ]
    }),
  })
}

const MODES: readonly Mode[] = ['manager', 'hrbp', 'leader', 'finance', 'hr-admin']
const CASES: readonly { name: string; mode: Mode; opts: CtxOptions }[] = [
  ...MODES.map((mode) => ({ name: mode, mode, opts: {} })),
  { name: 'manager B', mode: 'manager', opts: { persona: 'manager-b' } },
  { name: 'manager C', mode: 'manager', opts: { persona: 'manager-c' } },
  { name: 'hr-admin with pay amounts', mode: 'hr-admin', opts: { showPay: true } },
  {
    name: 'hr-admin, Silicon Engineering',
    mode: 'hr-admin',
    opts: { filters: { businessUnit: ['Silicon Engineering'] } },
  },
  { name: 'leader CFO', mode: 'leader', opts: { persona: 'leader-cfo' } },
  // A mid-month as-of date (HR admin's override): October's month-end is still ahead.
  { name: 'hr-admin on 15 Oct 2026', mode: 'hr-admin', opts: { asOf: '2026-10-15' } },
]

const row = (m: PlanHiring, key: string) => m.quarters.rows.find((r) => r.key === key)
const tile = (m: PlanHiring, id: string) => m.kpis.find((k) => k.id === id)

/* ───────────── the tests ───────────── */

describe('the key figures', () => {
  it.each(CASES.map((c) => [c.name, c] as const))(
    'are the six of 9.7 in order, each with its metric, lineage and card (%s)',
    (_, c) => {
      const ctx = sampleCtx(c.mode, c.opts)
      const m = planHiringModel(ctx)
      expect(m.kpis.map((k) => k.id)).toEqual([...HIRING_KPI_IDS])
      expect(m.kpis.map((k) => k.metricId)).toEqual(HIRING_KPIS.map((k) => k.metricId))
      expect(m.kpis[0].label).toBe(hiringOpenLabel(m.fiscalYear))
      expect(m.kpis[0].label).toBe('Open to hire, FY27')
      for (const k of m.kpis) {
        expect(k.uses?.length, k.id).toBeGreaterThan(0)
        expect(k.calc ?? k.drill, k.id).toBeTruthy()
        expect(k.tab, k.id).toBe('hiring')
        expect(k.definition, k.id).toBe(ctx.metrics.def(k.metricId as string)?.definition)
        const card = resolveCalc(k.calc)
        expect(card, k.id).not.toBeNull()
        expect(calcProblems(card as CalcSpec), k.id).toEqual([])
        expect(sameResult(card?.value ?? null, k.value, card?.format ?? 'num1'), k.id).toBe(true)
      }
    },
  )

  it('reads the table and the paces: open to hire is its year-end column, the paces the velocity’s', () => {
    for (const c of CASES) {
      const m = planHiringModel(sampleCtx(c.mode, c.opts))
      expect(tile(m, 'hiring-open')?.value, c.name).toBe(row(m, 'open')?.q4)
      expect(tile(m, 'hiring-accepted')?.value, c.name).toBe(row(m, 'accepted')?.q4)
      const actual = m.velocity.rows.filter((r) => r.kind === 'actual').slice(-3)
      const avg = (k: 'hires' | 'exits') => actual.reduce((s, r) => s + r[k], 0) / 3
      expect(tile(m, 'hiring-pace')?.value, c.name).toBeCloseTo(avg('hires'), 12)
      expect(tile(m, 'hiring-exit-pace')?.value, c.name).toBeCloseTo(avg('exits'), 12)
      expect(tile(m, 'hiring-net-pace')?.value, c.name).toBeCloseTo(avg('hires') - avg('exits'), 12)
    }
  })
})

describe('records and cards', () => {
  it.each(CASES.map((c) => [c.name, c] as const))('hold their numbers in %s', (_, c) => {
    const ctx = sampleCtx(c.mode, c.opts)
    const r = reach(planHiringModel(ctx))
    expect(r.drills.length).toBeGreaterThan(5)
    expect(r.cards.length).toBeGreaterThan(10)
    for (const d of r.drills) {
      if (d.value == null) continue
      if (d.spec.weight)
        expect(Math.abs((weightSum(d.spec as never) ?? 0) - d.value), d.where).toBeLessThan(1e-6)
      else expect(d.spec.rows.length, d.where).toBe(d.value)
    }
    for (const card of r.cards) {
      expect(calcProblems(card.spec), card.where).toEqual([])
      expect(
        sameResult(card.spec.value, card.value, card.spec.format),
        `${card.where}: ${card.spec.value} for ${card.value}`,
      ).toBe(true)
    }
  })

  it.each(CASES.map((c) => [c.name, c] as const))(
    'hide every amount, band and leave column, and keep to the kinds the mode lists (%s)',
    (_, c) => {
      const ctx = sampleCtx(c.mode, c.opts)
      const r = reach(planHiringModel(ctx))
      for (const d of r.drills) {
        const kind = d.spec.kind as HiringDrillKind
        expect(HIRING_DRILL_KINDS as readonly string[], d.where).toContain(kind)
        expect(ctx.access.can(`drill:${kind}`), `${d.where} ${kind}`).toBe(true)
        for (const key of HIRING_DRILL_HIDE[kind])
          expect(d.spec.hide ?? [], `${d.where} ${key}`).toContain(key)
        const table = buildDrillTable(d.spec, ctx)
        const shown = table.columns.map((col) => col.key)
        for (const key of HIRING_DRILL_HIDE[kind]) expect(shown, `${d.where} ${key}`).not.toContain(key)
        // Nor in the rows: a later reader of a row's keys finds no amount either (review HP-4).
        for (const r of table.rows)
          for (const key of HIRING_DRILL_HIDE[kind]) expect(key in r, `${d.where} row ${key}`).toBe(false)
        if (c.mode === 'manager') expect(kind, d.where).not.toBe('workers')
      }
    },
  )

  it('control: without the module’s hidden columns, HR admin with pay amounts on would list an offer’s amounts', () => {
    const ctx = sampleCtx('hr-admin', { showPay: true })
    const m = planHiringModel(ctx)
    const accepted = reach(m).drills.find((d) => d.spec.kind === 'reqs' && d.spec.rows.length > 0)
    expect(accepted).toBeTruthy()
    const bare = { ...(accepted?.spec as DrillSpec), hide: [] }
    const shown = buildDrillTable(bare, ctx).columns.map((c) => c.key)
    expect(shown).toContain('offerBase')
    expect(buildDrillTable(accepted?.spec as DrillSpec, ctx).columns.map((c) => c.key)).not.toContain(
      'offerBase',
    )
  })

  it('opens people as workers where the mode lists them, and as the seats they hold in Manager mode', () => {
    const people = (m: PlanHiring) => {
      const cur = m.quarters.columns.find((col) => col.key === 'q3')
      return resolveDrill(cur?.drill?.(row(m, 'current') as never) as DrillSource)
    }
    for (const mode of MODES) {
      const ctx = sampleCtx(mode)
      const m = planHiringModel(ctx)
      const spec = people(m)
      expect(spec?.kind, mode).toBe(mode === 'manager' ? 'positions' : 'workers')
      expect(spec?.rows.length, mode).toBe(row(m, 'current')?.q3)
    }
    // Manager B's exit in June opens the seat it left, never the person.
    const b = planHiringModel(sampleCtx('manager', { persona: 'manager-b' }))
    const q1 = b.quarters.columns.find((col) => col.key === 'q1')
    const exits = resolveDrill(q1?.drill?.(row(b, 'exitsActual') as never) as DrillSource)
    expect(exits?.kind).toBe('positions')
    expect(exits?.rows.map((p) => (p as { positionId: string }).positionId)).toEqual(['P-2372'])
  })
})

describe('heads only', () => {
  it.each(CASES.map((c) => [c.name, c] as const))(
    'no amount, band or leave fact reaches anything the tab shows (%s)',
    (_, c) => {
      const ctx = sampleCtx(c.mode, c.opts)
      const m = planHiringModel(ctx)
      const r = reach(m)
      const texts = textsOf(ctx, m, r)
      expect(texts.length).toBeGreaterThan(100)
      const hits = texts.flatMap((t) => amountsIn(t).map((a) => `${a} in "${t.slice(0, 80)}"`))
      expect(hits.slice(0, 5)).toEqual([])
      const keys = keysOf(ctx, m, r).filter((k) => isAmountKey(k) || /offer(?!ed)|salary|leave|^pay/i.test(k))
      // A req's "Offer accepted" date is a date, the one offer field the module shows.
      expect(keys.filter((k) => k !== 'offerAcceptedDate')).toEqual([])
      // No leave word in Manager or Finance mode, job titles from the data aside ("Leave and
      // Accommodation Specialist II" is a seat's title, not a leave fact).
      if (c.mode === 'manager' || c.mode === 'finance') {
        const titles = new Set(sample().datasets.positions.map((p) => p.title ?? ''))
        expect(texts.filter((t) => /\bleave\b/i.test(t) && !titles.has(t)).slice(0, 3)).toEqual([])
      }
      const uses = new Set(
        [
          ...m.kpis.flatMap((k) => k.uses ?? []),
          m.quarters.uses,
          m.openByQuarter.uses,
          m.velocity.uses,
          m.recent.uses,
        ].flat(),
      )
      for (const ref of uses)
        expect(
          /^comp\.|offerBase|offerCurrency|signOnBonus|relocation|agencyFee|onLeave|leavePaid/.test(ref),
          ref,
        ).toBe(false)
    },
  )

  it('takes an engine input of heads, dates and IDs only, the same when pay, an offer or leave changes', () => {
    const s = sample()
    const b = s.personas.find((p) => p.key === 'manager-b')
    const team = s.datasets.workers.filter(
      (w) => w.positionId && ['P-1999', 'P-2000', 'P-2001'].includes(w.positionId),
    )
    const offer = s.datasets.reqs.find((q) => q.positionId === 'P-2372' && q.stage === 'Offer accepted')
    expect(b && team.length === 3 && offer).toBeTruthy()
    const input = hiringInputOf(sampleCtx('hrbp'))
    const keys = (o: object) => Object.keys(o)
    expect(keys(input).sort()).toEqual([...HIRING_INPUT_KEYS.input].sort())
    for (const x of input.seats) expect(keys(x)).toEqual([...HIRING_INPUT_KEYS.seat])
    for (const x of input.people) expect(keys(x)).toEqual([...HIRING_INPUT_KEYS.person])
    for (const x of input.offers) expect(keys(x)).toEqual([...HIRING_INPUT_KEYS.offer])
    for (const x of [...input.hires, ...input.exits]) expect(keys(x)).toEqual([...HIRING_INPUT_KEYS.event])
    for (const x of input.forecast) expect(keys(x)).toEqual([...HIRING_INPUT_KEYS.forecast])
    const changed = [
      withSalaryDelta(s, team[0].employeeId, 7_500),
      withReq(s, offer?.reqId as string, { offerBase: (offer?.offerBase ?? 0) + 7_500, signOnBonus: 12_000 }),
      withWorker(s, team[1].employeeId, { onLeave: true, leavePaid: false }),
    ]
    for (const mode of MODES) {
      const opts = mode === 'manager' ? ({ persona: 'manager-b' } as const) : {}
      const base = JSON.stringify(hiringInputOf(sampleCtx(mode, opts)))
      for (const x of changed)
        expect(JSON.stringify(hiringInputOf(sampleCtx(mode, { ...opts, sample: x }))), mode).toBe(base)
    }
  })

  it('moves nothing a reader sees when a salary, an offer or a leave flag changes, in every mode (Manager B among them)', () => {
    const s = sample()
    const team = s.datasets.workers.filter(
      (w) => w.positionId && ['P-1999', 'P-2000', 'P-2001'].includes(w.positionId),
    )
    const offer = s.datasets.reqs.find((q) => q.positionId === 'P-2372' && q.stage === 'Offer accepted')
    const changed = [
      withSalaryDelta(s, team[0].employeeId, 7_500),
      withReq(s, offer?.reqId as string, { offerBase: (offer?.offerBase ?? 0) + 7_500, agencyFee: 9_000 }),
      withWorker(s, team[1].employeeId, { onLeave: true, leavePaid: false }),
    ]
    for (const c of [
      ...MODES.map((mode) => ({ mode, opts: {} as CtxOptions })),
      { mode: 'manager' as Mode, opts: { persona: 'manager-b' } as CtxOptions },
      { mode: 'hr-admin' as Mode, opts: { showPay: true } as CtxOptions },
    ]) {
      const base = signature(sampleCtx(c.mode, c.opts), planHiringModel(sampleCtx(c.mode, c.opts)))
      for (const x of changed) {
        const ctx = sampleCtx(c.mode, { ...c.opts, sample: x })
        expect(signature(ctx, planHiringModel(ctx)), `${c.mode} ${JSON.stringify(c.opts)}`).toBe(base)
      }
    }
  }, 120_000)
})

describe('Managers A, B and C (13.3)', () => {
  it('pins Manager A: 9 approved seats by Q3 end, 7 current heads, 2 open to hire, the Munich P4 past its start', () => {
    const m = planHiringModel(sampleCtx('manager'))
    expect([
      row(m, 'approved')?.q3,
      row(m, 'current')?.q3,
      row(m, 'accepted')?.q3,
      row(m, 'open')?.q3,
    ]).toEqual([9, 7, 0, 2])
    expect([row(m, 'approved')?.q4, row(m, 'open')?.q4]).toEqual([9, 2])
    // Open now: 7 Filled and the Munich P4 (planned 16 Sep) less 7 heads; the Open seat starts 2 Nov.
    expect([row(m, 'new')?.q3, row(m, 'new')?.q4]).toEqual([1, 0])
    expect([row(m, 'current')?.q1, row(m, 'current')?.q2]).toEqual([7, 7])
    expect(tile(m, 'hiring-open')?.value).toBe(2)
    expect(tile(m, 'hiring-pace')?.value).toBe(0)
    expect(tile(m, 'hiring-months-to-close')?.value).toBeNull()
    expect(tile(m, 'hiring-months-to-close')?.note).toBe(NOT_CLOSING_TEXT)
    expect(m.findings.find((f) => f.id === 'hiring-past-start')?.positions?.map((p) => p.positionId)).toEqual(
      ['P-2637'],
    )
  })

  it('pins Manager B: 5 approved, 3 current heads, 1 accepted start, 1 open, the June exit', () => {
    const m = planHiringModel(sampleCtx('manager', { persona: 'manager-b' }))
    expect([
      row(m, 'approved')?.q3,
      row(m, 'current')?.q3,
      row(m, 'accepted')?.q3,
      row(m, 'open')?.q3,
    ]).toEqual([5, 3, 1, 1])
    expect([row(m, 'exitsActual')?.q1, row(m, 'exitsActual')?.q2]).toEqual([1, 0])
    expect(tile(m, 'hiring-accepted')?.value).toBe(1)
    expect(tile(m, 'hiring-exit-pace')?.value).toBe(0)
    expect(tile(m, 'hiring-months-to-close')?.value).toBeNull()
    const accepted = resolveDrill(
      m.quarters.columns.find((c) => c.key === 'q3')?.drill?.(row(m, 'accepted') as never) as DrillSource,
    )
    expect(accepted?.kind).toBe('reqs')
    expect(accepted?.rows.length).toBe(1)
  })

  it('pins Manager C: 7 Filled seats, nothing open to hire, 0 months to close', () => {
    const m = planHiringModel(sampleCtx('manager', { persona: 'manager-c' }))
    expect([row(m, 'approved')?.q4, row(m, 'current')?.q4, row(m, 'open')?.q4]).toEqual([7, 7, 0])
    expect(tile(m, 'hiring-months-to-close')?.value).toBe(0)
  })

  it('gives Manager C the same tab with and without the confidential Elimination on C’s own seat', () => {
    const s = sample()
    const without = withoutRequest(s, s.planted.managerCElimination).sample
    const a = sampleCtx('manager', { persona: 'manager-c' })
    const b = sampleCtx('manager', { persona: 'manager-c', sample: without })
    expect(signature(b, planHiringModel(b))).toBe(signature(a, planHiringModel(a)))
    // Control: the request is in the sample, on C's own seat.
    expect(s.datasets.requests.some((r) => r.requestId === s.planted.managerCElimination)).toBe(true)
  })
})

describe('a request 8.4 rule 3 hides, approved (9.7 Privacy)', () => {
  /**
   * The sample with Manager C's confidential Elimination approved as the write path leaves it
   * (src/plan/actions/managerC.scenario.test.ts): the request Approved in plan state and C's seat
   * Eliminated in the overlay from 1 Jan 2027, its last day 31 Dec 2026.
   */
  const approved = () => {
    const s = sample()
    const id = s.planted.managerCElimination
    const req = s.datasets.requests.find((r) => r.requestId === id)
    if (!req?.positionId || !req.startDate) throw new Error('The sample has no Elimination of C’s seat.')
    const on = req.startDate
    const base = s.datasets.positions
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
      sample: withPlan(s, {
        requests: [
          ...s.plan.requests.filter((r) => r.requestId !== id),
          { ...fromRow(req), state: 'Approved' },
        ],
        overlay: { ...s.plan.overlay, positions: [...s.plan.overlay.positions, ended] },
      }),
    }
  }
  const scopeOf = (ctx: AnalyticsContext) => hiringPrepOf(ctx).p.scope.ids
  /** Σ the modeled exits of a forecast preparation's flows over its months. */
  const modeled = (fp: ReturnType<typeof forecastPrepare>) =>
    [...forecastFlows(fp).values()].reduce((a, f) => a + f.modeledExits, 0)

  it('gives Manager C and the manager below C the same tab: the forecast it reads leaves out the Eliminated row', () => {
    const x = approved()
    const c = { persona: 'manager-c' } as const
    const before = sampleCtx('manager', c)
    const after = sampleCtx('manager', { ...c, sample: x.sample })
    expect(signature(after, planHiringModel(after))).toBe(signature(before, planHiringModel(before)))
    // What it leaves out: the one row of the hidden request, on C's own seat outside C's tree.
    const rows = [...ruleThreeRows(after, scopeOf(after))]
    expect(rows.map((r) => [r.positionId, r.effectiveDate, r.status])).toEqual([
      [x.seat, '2027-01-01', 'Eliminated'],
    ])
    expect(scopeOf(after).has(x.seat)).toBe(false)
    expect(ruleThreeRows(before, scopeOf(before)).size).toBe(0)
    // Control: the Forecast view's own run nets C's clipped assignment (a known exit in C's cohort in
    // December) against the tree's modeled exits, so reading it would move C's expected exits.
    expect(modeled(forecastPrepare(after))).not.toBeCloseTo(modeled(forecastPrepare(before)), 6)
    expect(modeled(hiringForecast(after, scopeOf(after)))).toBeCloseTo(
      modeled(hiringForecast(before, scopeOf(before))),
      12,
    )
  })

  it('leaves the forecast alone where rule 3 hides nothing: HR admin and Finance; Manager A nets its tree alone', () => {
    const x = approved()
    for (const mode of ['hr-admin', 'manager', 'finance'] as const) {
      const ctx = sampleCtx(mode, { sample: x.sample })
      expect(ruleThreeRows(ctx, scopeOf(ctx)).size, mode).toBe(0)
      if (mode !== 'manager') expect(hiringForecast(ctx, scopeOf(ctx)), mode).toBe(forecastPrepare(ctx))
      else {
        // Manager mode reads a run with the tree's seats in a cohort of their own (review HP-1).
        const own = hiringForecast(ctx, scopeOf(ctx))
        expect(own, mode).not.toBe(forecastPrepare(ctx))
        expect([...(runInputOf(own.run as ForecastRun).ownCohort ?? [])].sort(), mode).toEqual(
          [...scopeOf(ctx)].sort(),
        )
        expect(runInputOf(forecastPrepare(ctx).run as ForecastRun).ownCohort, mode).toBeUndefined()
      }
    }
    // Control: HR admin's tab sees the approval: C's seat leaves the approved heads by Q4 end.
    const admin = (ctx: AnalyticsContext) => row(planHiringModel(ctx), 'approved')
    const a = admin(sampleCtx('hr-admin'))
    const b = admin(sampleCtx('hr-admin', { sample: x.sample }))
    expect(b?.q3).toBe(a?.q3)
    expect(b?.q4).toBe((a?.q4 as number) - 1)
  })
})

describe('the needed-pace note', () => {
  it('reads the gap at one decimal, and a gap one decimal would show as 0.0 as less than 0.1', () => {
    expect(behindByGap(0.7)).toBe(behindByText('0.7'))
    expect(behindByGap(0.06)).toBe('Behind by 0.1 a month')
    expect(behindByGap(0.04)).toBe(`Behind by ${UNDER_A_TENTH} a month`)
    expect(behindByGap(1e-6)).toBe('Behind by less than 0.1 a month')
    expect(behindByGap(1e-6)).not.toMatch(/0\.0/)
    // Control: the bare text with a rounded gap would read "0.0".
    expect(behindByText('0.0')).toMatch(/0\.0/)
  })

  it('never reads "Behind by 0.0" on any quarter or finding, in any case', () => {
    for (const c of CASES) {
      const m = planHiringModel(sampleCtx(c.mode, c.opts))
      const texts = JSON.stringify([m.quarters.rows, m.findings])
      expect(texts, c.name).not.toMatch(/Behind by 0\.0 /)
    }
  })
})

describe('the Future starts card', () => {
  it('writes a plain count: "1 offer", "2 offers"', () => {
    const m = planHiringModel(sampleCtx('manager', { persona: 'manager-b' }))
    const card = resolveCalc(tile(m, 'hiring-accepted')?.calc as never)
    expect(card?.steps[0].expression).toBe('1 offer')
    const admin = resolveCalc(tile(planHiringModel(sampleCtx('hr-admin')), 'hiring-accepted')?.calc as never)
    expect(admin?.steps[0].expression).toMatch(/^\d+ offers$/)
    expect(admin?.value).toBeGreaterThan(1)
  })
})

describe('over plan', () => {
  // A person not in plan in Manager C's team: 8 heads against 7 approved seats.
  const planted = () => {
    const s = sample()
    const report = s.datasets.workers.find((w) => w.positionId === 'P-1946')
    const extra = {
      ...(report as NonNullable<typeof report>),
      employeeId: 'E99001',
      name: 'Planted Person',
      positionId: null,
      assignmentStart: null,
      assignmentEnd: null,
      hireDate: '2025-01-06',
      terminationDate: null,
      managerId: s.personas.find((p) => p.key === 'manager-c')?.employeeId ?? null,
    }
    return withData({ workers: [...s.datasets.workers, extra] }, s)
  }

  it('reads "Over by 1" beside a negative open to hire, and never as a hiring target', () => {
    const ctx = sampleCtx('manager', { persona: 'manager-c', sample: planted() })
    const m = planHiringModel(ctx)
    expect(row(m, 'current')?.q4).toBe(8)
    expect(row(m, 'open')?.q4).toBe(-1)
    expect(row(m, 'open')?.notes.q4).toBe('Over by 1')
    expect(m.openByQuarter.rows.find((r) => r.key === 'q4')?.note).toBe('Over by 1')
    expect(tile(m, 'hiring-open')?.note).toBe('Over by 1')
    expect(m.findings.find((f) => f.id === 'hiring-over')?.title).toBe(
      'Over by 1 at FY27 end: current heads and future starts are above approved heads.',
    )
    // Nothing to hire: to reach plan is below 0, so no needed pace reads as a target.
    expect(row(m, 'needed')?.notes.q4).toBe('Nothing to hire')
    expect(m.findings.some((f) => f.id.startsWith('hiring-behind'))).toBe(false)
    // Manager mode lists no people, and this one holds no seat: the count opens its card.
    const q4 = m.quarters.columns.find((c) => c.key === 'q4')
    expect(q4?.drill?.(row(m, 'current') as never)).toBeNull()
    const card = resolveCalc(q4?.calc?.(row(m, 'current') as never) as never)
    expect(card?.value).toBe(8)
    expect(calcProblems(card as CalcSpec)).toEqual([])
    expect(textsOf(ctx, m).filter((t) => t.includes('Planted Person'))).toEqual([])
  })
})

describe('the readout', () => {
  it('raises 0 to 3 findings, each with its metric, lineage and records or card, naming positions only', () => {
    for (const c of CASES) {
      const m = planHiringModel(sampleCtx(c.mode, c.opts))
      expect(m.findings.length, c.name).toBeLessThanOrEqual(3)
      for (const f of m.findings) {
        expect(f.metricId, f.id).toBeTruthy()
        expect(f.uses?.length, f.id).toBeGreaterThan(0)
        expect(f.drill ?? f.calc, f.id).toBeTruthy()
        for (const p of f.positions ?? []) expect(p.positionId, f.id).toMatch(/^P-/)
      }
    }
    const hrbp = planHiringModel(sampleCtx('hrbp'))
    expect(hrbp.findings.map((f) => f.id)).toEqual([
      'hiring-closes-late',
      'hiring-behind-q3',
      'hiring-past-start',
    ])
    expect(hrbp.findings[0].title).toBe(
      'At the 3-month pace, open to hire closes in 23.4 months, after FY27 end.',
    )
  })
})

describe('agrees with the rest of the app', () => {
  it.each(MODES.map((m) => [m] as const))(
    'current and approved heads are Plan > Overview’s, open seats and offers Plan > Openings’, exits the forecast’s (%s)',
    (mode) => {
      const ctx = sampleCtx(mode)
      const m = planHiringModel(ctx)
      const plan = planModel(ctx)
      const h = hiringPrepOf(ctx)
      const overview = (id: string) =>
        [...plan.overview.kpis, ...plan.positions.kpis].find((k) => k.metricId === id)?.value
      if (mode !== 'manager') expect(row(m, 'current')?.q3).toBe(overview(ID.headsActual))
      expect(row(m, 'approved')?.q4).toBe(
        plan.positions.kpis.find((k) => k.metricId === ID.headsApproved)?.value,
      )
      const o = openingsOf(h.p)
      const open = o.list
        .filter((x) => x.state.approvedHead && x.stage !== 'Offer accepted')
        .map((x) => x.positionId)
      const q4 = m.quarters.columns.find((c) => c.key === 'q4')
      const card = resolveCalc(q4?.calc?.(row(m, 'open') as never) as never)
      expect(card?.inputs.find((x) => x.label.startsWith('Seat view'))?.value).toBe(open.length)
      expect(row(m, 'accepted')?.q4).toBe(
        plan.openings.kpis.find((k) => k.metricId === ID.offersAccepted)?.value,
      )
      // Expected exits: the forecast's known and modeled exits over the same months (H5, a month-end
      // as-of), from the run Plan > Hiring reads (Manager mode: the tree's own cohort, review HP-1).
      const flows = forecastFlows(hiringForecast(ctx, h.p.scope.ids))
      for (const k of ['q3', 'q4'] as const) {
        const end = h.input.fiscalYear === 'FY27' ? (k === 'q3' ? '2026-12-31' : '2027-03-31') : ''
        let sum = 0
        for (const [mm, f] of flows)
          if (monthEnd(mm) > ctx.asOf && monthEnd(mm) <= end) sum += f.knownExits + f.modeledExits
        expect(row(m, 'exits')?.[k], `${mode} ${k}`).toBeCloseTo(sum, 9)
      }
    },
  )
})

describe('the model', () => {
  it('is cached per context and rebuilt for another', () => {
    const ctx = sampleCtx('hrbp')
    expect(planHiringModel(ctx)).toBe(planHiringModel(ctx))
    expect(planHiringModel(sampleCtx('hrbp'))).not.toBe(planHiringModel(ctx))
  })

  it('has the ten rows of 9.7, closed quarters greyed by kind and filled only where the row reads them', () => {
    const m = planHiringModel(sampleCtx('finance'))
    // Moves in by quarter end shows only when a quarter ahead holds one (C37): none on the sample.
    expect(m.quarters.rows.map((r) => r.key)).toEqual(
      HIRING_ROWS.filter((r) => !ONLY_WHEN_NOT_ZERO.has(r.key)).map((r) => r.key),
    )
    expect(m.quarters.rows).toHaveLength(10)
    expect(row(m, 'moves')).toBeUndefined()
    expect(m.openByQuarter.rows.map((r) => r.kind)).toEqual(['history', 'history', 'ahead', 'ahead'])
    for (const def of HIRING_ROWS.filter((r) => !ONLY_WHEN_NOT_ZERO.has(r.key))) {
      const r = row(m, def.key)
      for (const [i, k] of QUARTER_KEYS.entries()) {
        const history = i < 2
        const filled = history ? def.history : def.ahead
        expect(r?.[k] != null, `${def.key} ${k}`).toBe(filled)
      }
    }
    expect(m.quarters.columns.map((c) => c.label)).toEqual([
      'Measure',
      'Q1, Apr to Jun (closed)',
      'Q2, Jul to Sep (closed)',
      'Q3, Oct to Dec',
      'Q4, Jan to Mar',
      'Notes',
    ])
    // The velocity: the 12 closed months, then the forecast months to the year end.
    expect(m.velocity.rows.map((r) => r.kind)).toEqual([
      ...Array(12).fill('actual'),
      ...Array(6).fill('forecast'),
    ])
    expect(m.velocity.rows[0].month).toBe('2025-10')
    expect(m.velocity.rows.at(-1)?.month).toBe('2027-03')
    expect(m.paceNote).toMatch(/^3-month pace: 13\.0 hires and 10\.3 exits a month, net 2\.7\./)
  })

  it('shows FY28 Working’s quarters, all ahead, under the version picker', () => {
    const m = planHiringModel(sampleCtx('hr-admin', { version: 'fy28-working' }))
    expect(m.fiscalYear).toBe('FY28')
    expect(m.kpis[0].label).toBe('Open to hire, FY28')
    expect(m.openByQuarter.rows.map((r) => r.kind)).toEqual(['ahead', 'ahead', 'ahead', 'ahead'])
  })

  it('reads FY28’s expected exits from the as-of date: FY27 Working’s open months before FY28’s grid, then FY28 Working’s', () => {
    const ctx = sampleCtx('hr-admin', { version: 'fy28-working' })
    const m = planHiringModel(ctx)
    // The velocity's forecast months run from the month after the last close to FY28 end, no gap.
    const months = m.velocity.rows.filter((r) => r.kind === 'forecast').map((r) => r.month)
    expect([months[0], months.at(-1), months.length]).toEqual(['2026-10', '2028-03', 18])
    const fy27 = forecastFlows(forecastPrepare(sampleCtx('hr-admin')))
    const fy28 = forecastFlows(forecastPrepare(ctx))
    // Control: FY28 Working's own forecast has no month before its grid (April 2027).
    expect([...fy28.keys()].some((k) => k < '2027-04')).toBe(false)
    let modeled = 0
    for (const [k, f] of fy27) if (k >= '2026-10' && k <= '2027-03') modeled += f.modeledExits
    for (const [k, f] of fy28) if (k >= '2027-04' && k <= '2027-06') modeled += f.modeledExits
    const known = hiringPrepOf(ctx).input.exits.filter((e) => e.on > ctx.asOf && e.on <= '2027-06-30').length
    expect(row(m, 'exits')?.q1).toBeCloseTo(known + modeled, 9)
    expect(modeled).toBeGreaterThan(0)
  })

  it('keeps the copy rules in every mode', () => {
    for (const c of CASES) {
      const ctx = sampleCtx(c.mode, c.opts)
      const m = planHiringModel(ctx)
      const words = wordsOf({
        kpis: m.kpis.map((k) => ({ label: k.label, note: k.note, formula: k.formula })),
        findings: m.findings.map((f) => ({ title: f.title, detail: f.detail, positions: f.positions })),
        figures: [m.quarters, m.openByQuarter, m.velocity, m.recent].map((f) => ({
          title: f.title,
          subtitle: f.subtitle,
          note: f.note,
          empty: f.empty,
          labels: f.columns.map((col) => col.label),
        })),
        rows: m.quarters.rows.map((r) => [r.label, r.notesText]),
        paceNote: m.paceNote,
        cards: reach(m).cards.map((x) => ({
          title: x.spec.title,
          note: x.spec.note,
          inputs: x.spec.inputs.map((i) => i.label),
          steps: x.spec.steps.map((s) => [s.label, s.expression]),
        })),
      })
      expect(words.length, c.name).toBeGreaterThan(40)
      expectPlainCopy(words, c.name)
      for (const w of words) {
        expect(/headcount to hire/i.test(w), w).toBe(false)
        expect(/\b(chase|nag|ping|hound|remind|unblock)\b/i.test(w), w).toBe(false)
      }
    }
  })
})

describe('exports', () => {
  it.each(MODES.map((m) => [m] as const))(
    'write each figure through the export layer, with its columns, its notes and no amount (%s)',
    (mode) => {
      const ctx = sampleCtx(mode)
      const m = planHiringModel(ctx)
      for (const fig of [m.quarters, m.openByQuarter, m.velocity, m.recent]) {
        const csv = toCsv({ columns: fig.columns as never, rows: fig.rows as never }, moneyOpts(ctx))
        const lines = csv
          .replace(/^\uFEFF/, '')
          .trimEnd()
          .split('\r\n')
        expect(lines[0], fig.id).toBe(fig.columns.map((c) => csvField(c.label)).join(','))
        expect(lines.length - 1, fig.id).toBe(fig.rows.length)
        // Heads only: no amount column, so no Suppressed or Why column either (14.1 item 2).
        expect(lines[0], fig.id).not.toMatch(/Suppressed|Why/)
        expect(
          cellsOf(csv, ',').flatMap((c) => amountsIn(c)),
          fig.id,
        ).toEqual([])
      }
      // The quarter table's notes travel with it.
      const quarters = toCsv(
        { columns: m.quarters.columns as never, rows: m.quarters.rows as never },
        moneyOpts(ctx),
      )
      expect(quarters).toMatch(/Q3: (On pace|Behind by (\d+\.\d|less than 0\.1) a month|Nothing to hire)\./)
    },
  )
})

/* ───────────── change C37 ───────────── */

/** The req IDs of the signed offers (accepted, not started) the tab reads, by start month, after the as-of date. */
function signedOffersByMonth(ctx: AnalyticsContext): Map<string, string[]> {
  const h = hiringPrepOf(ctx)
  const out = new Map<string, string[]>()
  for (const o of h.input.offers) {
    if (o.startDate <= ctx.asOf) continue
    const m = o.startDate.slice(0, 7)
    const list = out.get(m) ?? []
    if (!list.includes(o.reqId)) list.push(o.reqId)
    out.set(m, list)
  }
  return out
}

describe('future starts are signed offers only (C37)', () => {
  it.each(CASES.map((c) => [c.name, c] as const))(
    'count signed offers by start date, and the months ahead show them in whole people (%s)',
    (_, c) => {
      const ctx = sampleCtx(c.mode, c.opts)
      const h = hiringPrepOf(ctx)
      const m = planHiringModel(ctx)
      // Every future start is a req at Offer accepted, not started, starting after the as-of date.
      for (const id of hiringOf(h.input).table.quarters.flatMap((q) => q.acceptedIds)) {
        const req = h.offers.get(id)
        expect(req?.stage, `${c.name} ${id}`).toBe('Offer accepted')
        expect((req?.startDate ?? '') > ctx.asOf, `${c.name} ${id}`).toBe(true)
        expect(id.startsWith('move:'), id).toBe(false)
      }
      // The months ahead: each one's hires are the signed offers starting in it, whole people.
      const byMonth = signedOffersByMonth(ctx)
      const ahead = m.velocity.rows.filter((r) => r.kind === 'forecast')
      expect(ahead.length, c.name).toBeGreaterThan(0)
      for (const r of ahead) {
        expect(r.hires, `${c.name} ${r.month}`).toBe(byMonth.get(r.month)?.length ?? 0)
        expect(Number.isInteger(r.hires), `${c.name} ${r.month}`).toBe(true)
      }
      // They add up to the Future starts tile: every signed offer of the year is in a month ahead.
      expect(
        ahead.reduce((a, r) => a + r.hires, 0),
        c.name,
      ).toBe(tile(m, 'hiring-accepted')?.value)
      expect(tile(m, 'hiring-accepted')?.label).toBe('Future starts')
      expect(row(m, 'accepted')?.label).toBe('Future starts by quarter end')
    },
  )

  it('never read a modeled start: the forecast’s own starts differ, and none reaches the input', () => {
    const ctx = sampleCtx('hr-admin')
    const m = planHiringModel(ctx)
    expect([...HIRING_INPUT_KEYS.forecast]).toEqual(['month', 'modeledExits'])
    for (const f of hiringInputOf(ctx).forecast)
      expect(Object.keys(f).sort()).toEqual(['modeledExits', 'month'])
    // Control: the forecast models starts the tab never shows (Open and Planned seats at their fill rates).
    const flows = forecastFlows(forecastPrepare(ctx))
    const ahead = m.velocity.rows.filter((r) => r.kind === 'forecast')
    const modeled = ahead.reduce((a, r) => a + (flows.get(r.month)?.starts ?? 0), 0)
    const signed = ahead.reduce((a, r) => a + r.hires, 0)
    expect(modeled).toBeGreaterThan(signed + 1)
    // January to March hold planned and target starts, and no signed offer: no hire ahead.
    for (const r of ahead.filter((x) => x.month >= '2027-01')) {
      expect(r.hires, r.month).toBe(0)
      expect(flows.get(r.month)?.starts ?? 0, r.month).toBeGreaterThan(0)
    }
    // No forecast or expected start reads anywhere in the tab's words.
    const texts = textsOf(ctx, m)
    expect(texts.filter((t) => /expected starts?|accepted starts?/i.test(t)).slice(0, 3)).toEqual([])
    expect(m.velocity.columns.find((c) => c.key === 'hires')?.label).toBe('Hires (future starts ahead)')
  })

  it('never count an Open or Planned seat without a signed offer', () => {
    for (const c of CASES) {
      const ctx = sampleCtx(c.mode, c.opts)
      const h = hiringPrepOf(ctx)
      const t = hiringOf(h.input).table
      const starting = new Set(
        t.quarters.flatMap((q) => q.acceptedIds).map((id) => h.offers.get(id)?.positionId),
      )
      for (const seat of h.input.seats)
        if (!seat.filled && !seat.acceptedStart)
          expect(starting.has(seat.positionId), seat.positionId).toBe(false)
    }
  })

  it('opens a month ahead’s future starts as their signed offers, dates only', () => {
    const ctx = sampleCtx('hrbp')
    const m = planHiringModel(ctx)
    const r = m.velocity.rows.find((x) => x.kind === 'forecast' && x.hires > 0)
    expect(r).toBeTruthy()
    const hires = m.velocity.columns.find((c) => c.key === 'hires')
    const spec = resolveDrill(hires?.drill?.(r as never) as DrillSource) as DrillSpec
    expect(spec.kind).toBe('reqs')
    expect(spec.rows).toHaveLength(r?.hires ?? -1)
    expect(spec.title).toBe(`Future starts, ${r?.label}`)
    for (const key of HIRING_DRILL_HIDE.reqs) expect(spec.hide).toContain(key)
    // A closed month's hires still open the people hired.
    const closed = m.velocity.rows.find((x) => x.kind === 'actual' && x.hires > 0)
    expect(resolveDrill(hires?.drill?.(closed as never) as DrillSource)?.kind).toBe('workers')
  })
})

describe('hires in the last 3 months, by location and department (C37)', () => {
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
  const KEYS = ['m1', 'm2', 'm3', 'total'] as const

  it.each(CASES.map((c) => [c.name, c] as const))(
    'adds up: pairs to departments and to locations, both to the total, the total to the velocity (%s)',
    (_, c) => {
      const ctx = sampleCtx(c.mode, c.opts)
      const m = planHiringModel(ctx)
      const f = m.recent
      expect(f.id).toBe('plan-hiring-recent')
      expect(f.metric).toBe(ID.hiringRecentHires)
      expect(f.title).toBe('Hires in the last 3 months, by location and department')
      // The last 3 closed months, the velocity's.
      const last3 = m.velocity.rows.filter((r) => r.kind === 'actual').slice(-3)
      expect(m.recentMonths, c.name).toEqual(last3.map((r) => r.month))
      expect(
        f.columns.map((col) => col.label),
        c.name,
      ).toEqual(['Department', 'Location', ...last3.map((r) => r.label), 'Total', 'Hires per month'])
      const of = (kind: string) => f.rows.filter((r) => r.kind === kind)
      const total = of('total')
      expect(total, c.name).toHaveLength(1)
      expect([total[0].m1, total[0].m2, total[0].m3], c.name).toEqual(last3.map((r) => r.hires))
      expect(total[0].perMonth, c.name).toBe(total[0].total / 3)
      expect(total[0].perMonth, c.name).toBeCloseTo(tile(m, 'hiring-pace')?.value as number, 12)
      for (const r of f.rows) {
        expect(r.total, `${c.name} ${r.key}`).toBe(r.m1 + r.m2 + r.m3)
        expect(r.perMonth, `${c.name} ${r.key}`).toBe(r.total / 3)
      }
      // One row per department and location with a hire.
      for (const r of of('pair')) expect(r.total, `${c.name} ${r.key}`).toBeGreaterThan(0)
      expect(new Set(of('pair').map((r) => `${r.department}|${r.location}`)).size).toBe(of('pair').length)
      for (const k of KEYS) {
        for (const d of of('department'))
          expect(
            sum(
              of('pair')
                .filter((r) => r.department === d.department)
                .map((r) => r[k]),
            ),
            `${c.name} ${d.key} ${k}`,
          ).toBe(d[k])
        for (const l of of('location'))
          expect(
            sum(
              of('pair')
                .filter((r) => r.location === l.location)
                .map((r) => r[k]),
            ),
            `${c.name} ${l.key} ${k}`,
          ).toBe(l[k])
        expect(sum(of('department').map((r) => r[k])), `${c.name} departments ${k}`).toBe(total[0][k])
        expect(sum(of('location').map((r) => r[k])), `${c.name} locations ${k}`).toBe(total[0][k])
      }
      // Each department's rows, then its sub-total; the locations' sub-totals; the total last.
      expect(f.rows.at(-1)?.kind).toBe('total')
      const firstLocation = f.rows.findIndex((r) => r.kind === 'location')
      if (firstLocation >= 0)
        expect(
          f.rows.slice(firstLocation, -1).every((r) => r.kind === 'location'),
          c.name,
        ).toBe(true)
      expect(f.empty, c.name).toBe(
        total[0].total ? null : `No hire in ${last3[0].label} to ${last3[2].label}.`,
      )
    },
  )

  it.each(CASES.map((c) => [c.name, c] as const))(
    'opens the hires each count counts, as workers or (Manager mode) the seats hired into (%s)',
    (_, c) => {
      const ctx = sampleCtx(c.mode, c.opts)
      const m = planHiringModel(ctx)
      const f = m.recent
      const manager = c.mode === 'manager'
      for (const r of f.rows)
        for (const col of f.columns.filter((x) => ['m1', 'm2', 'm3', 'total'].includes(x.key))) {
          const v = r[col.key as 'm1']
          const spec = resolveDrill(col.drill?.(r) as DrillSource) as DrillSpec
          expect(spec, `${c.name} ${r.key} ${col.key}`).toBeTruthy()
          expect(spec.kind, `${c.name} ${r.key} ${col.key}`).toBe(manager ? 'positions' : 'workers')
          if (spec.weight) expect(weightSum(spec as never), `${r.key} ${col.key}`).toBeCloseTo(v, 9)
          else expect(spec.rows.length, `${c.name} ${r.key} ${col.key}`).toBe(v)
          for (const key of HIRING_DRILL_HIDE[spec.kind as HiringDrillKind]) expect(spec.hide).toContain(key)
        }
      // Hires per month opens its card: the 3 months' sum ÷ 3, its records each a third.
      for (const r of f.rows) {
        const card = resolveCalc(f.columns.find((x) => x.key === 'perMonth')?.calc?.(r) as never) as CalcSpec
        expect(card.value, r.key).toBe(r.perMonth)
        expect(card.metricId).toBe(ID.hiringPace)
        expect(calcProblems(card), r.key).toEqual([])
      }
    },
  )

  it('files each hire under the department and location of the seat on its hire date, from the raw rows', () => {
    for (const c of CASES.filter((x) => x.mode !== 'manager')) {
      const ctx = sampleCtx(c.mode, c.opts)
      const f = planHiringModel(ctx).recent
      const s = sample()
      const rows = [...s.datasets.positions, ...s.plan.overlay.positions].sort((a, b) =>
        a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : 0,
      )
      const placeOf = (positionId: string, day: string) => {
        const mine = rows.filter((r) => r.positionId === positionId)
        const on = mine.filter((r) => r.effectiveDate <= day).at(-1) ?? mine[0]
        return [on?.department || 'No department', on?.location || 'No location']
      }
      let checked = 0
      for (const r of f.rows.filter((x) => x.kind === 'pair')) {
        const col = f.columns.find((x) => x.key === 'total')
        const spec = resolveDrill(col?.drill?.(r) as DrillSource) as DrillSpec
        for (const w of spec.rows as readonly { positionId: string; hireDate: string }[]) {
          expect(placeOf(w.positionId, w.hireDate), `${c.name} ${r.key}`).toEqual([r.department, r.location])
          checked++
        }
      }
      expect(checked, c.name).toBe(f.rows.find((x) => x.kind === 'total')?.total)
    }
  })

  it('Managers A, B and C: no hire in July to September, so the total row alone, with its words', () => {
    for (const persona of ['manager-a', 'manager-b', 'manager-c'] as const) {
      const m = planHiringModel(sampleCtx('manager', { persona }))
      expect(
        m.recent.rows.map((r) => [r.kind, r.total]),
        persona,
      ).toEqual([['total', 0]])
      expect(m.recent.empty, persona).toBe('No hire in Jul 2026 to Sep 2026.')
    }
  })

  it('Manager A with a hire in August: the seat hired into, under its department and location', () => {
    const s = sample()
    const ctx0 = sampleCtx('manager')
    const open = hiringPrepOf(ctx0).input.seats.find((x) => !x.filled && !x.acceptedStart) as {
      positionId: string
    }
    expect(open).toBeTruthy()
    const a = s.personas.find((p) => p.key === 'manager-a')?.employeeId ?? null
    const template = s.datasets.workers.find((w) => w.managerId === a && w.positionId) as NonNullable<
      (typeof s.datasets.workers)[number]
    >
    const hired = withData(
      {
        workers: [
          ...s.datasets.workers,
          {
            ...template,
            employeeId: 'E99100',
            name: 'Planted Hire',
            positionId: open.positionId,
            hireDate: '2026-08-03',
            assignmentStart: null,
            assignmentEnd: null,
            terminationDate: null,
          },
        ],
      },
      s,
    )
    const ctx = sampleCtx('manager', { sample: hired })
    const m = planHiringModel(ctx)
    const pairs = m.recent.rows.filter((r) => r.kind === 'pair')
    expect(pairs).toHaveLength(1)
    expect([pairs[0].m1, pairs[0].m2, pairs[0].m3, pairs[0].total]).toEqual([0, 1, 0, 1])
    const pos = s.datasets.positions.filter((r) => r.positionId === open.positionId).at(-1)
    expect([pairs[0].department, pairs[0].location]).toEqual([
      pos?.department || 'No department',
      pos?.location,
    ])
    const spec = resolveDrill(
      m.recent.columns.find((x) => x.key === 'm2')?.drill?.(pairs[0]) as DrillSource,
    ) as DrillSpec
    expect(spec.kind).toBe('positions')
    expect((spec.rows as readonly { positionId: string }[]).map((r) => r.positionId)).toEqual([
      open.positionId,
    ])
    // Manager mode lists no people records: every count of the figure, and every card's records, opens seats.
    const kinds = reach(m)
      .drills.filter((d) => d.where.startsWith('plan-hiring-recent'))
      .map((d) => d.spec.kind)
    expect(kinds.length).toBeGreaterThanOrEqual(m.recent.rows.length * 4)
    expect(new Set(kinds)).toEqual(new Set(['positions']))
    // The total row is the velocity's August.
    expect(m.recent.rows.at(-1)?.m2).toBe(m.velocity.rows.find((r) => r.month === '2026-08')?.hires)
  })

  it('shows nothing to add up before a month is closed (control: the sample has 3)', () => {
    const none = planHiringModel(sampleCtx('hr-admin', { sample: withPlan(sample(), { closes: [] }) }))
    expect(none.recentMonths).toEqual([])
    expect(none.recent.rows).toEqual([])
    expect(none.recent.empty).toBe('The last 3 months show once 3 months are closed.')
    expect(planHiringModel(sampleCtx('hr-admin')).recentMonths).toEqual(['2026-07', '2026-08', '2026-09'])
  })
})
