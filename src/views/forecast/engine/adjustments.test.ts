/**
 * Back-dated adjustments post (the spec's "back-dated changes post as adjustments in the first open
 * month", docs/PLAN.md 6.6 and C33 (e); M4 review SA-2, lead decision D-SPEC). Twelve people get a
 * pay raise dated 1 June 2026 after June to September closed; October's close finds it and posts one
 * adjustment a person and month in October. From then on every Working figure reads close +
 * adjustments through the one line source (src/plan/lineSource.ts `withClosedMonths`): Plan's
 * closed months and cost to date, Targets' Working lines, the forecast's October and year, and the
 * bridge, whose timing step takes the posted amount. Each moves by exactly the sum posted, against
 * the same plan state with those adjustments taken out.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { scenario, type Who } from '@/app/write/scenario.testkit'
import type { AnalyticsContext } from '@/data/context'
import { monthsOf } from '@/data/fiscal'
import type { Sample } from '@/data/sample'
import { adjustmentLines, withClosedMonths } from '@/plan/lineSource'
import type { Adjustment, AnyVersion, PlanLine, PlanState } from '@/plan/types'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaOf, sampleCtx, withBackDatedComp, withPlan } from '@/testkit/sample'
import { planModel } from '@/views/plan/engine'
import { shownLines, versionLinesOf } from '@/views/plan/engine/core'
import { workingFrame, workingLines } from '@/views/targets/engine/working'
import { prepare } from './base'
import { bridgeWindow } from './bridge'
import { forecastRunOf } from './run'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const AS_OF = '2026-10-31'
const OCT = '2026-10'

let s: Sample
let plan: PlanState
/** The adjustments of the raised people paid in USD, posted in October. */
let mine: Adjustment[]
/** Every adjustment of a position posted in October (the close also posts the sample's own). */
let posted: Adjustment[]

beforeAll(async () => {
  const base = leakSample()
  // Twelve active employees in seats with a pay row before June.
  const raised = base.datasets.workers
    .filter(
      (w) =>
        w.workerType === 'Employee' &&
        !!w.positionId &&
        !w.terminationDate &&
        base.datasets.comp.some((c) => c.employeeId === w.employeeId && c.effectiveDate < '2026-06-01'),
    )
    .slice(0, 12)
    .map((w) => w.employeeId)
  let changed = base
  for (const id of raised) changed = withBackDatedComp(changed, id, '2026-06-01', 12_000)
  const sc = scenario({ sample: changed, asOf: AS_OF })
  s = sc.sample
  const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
  // October's actual rates: September's, as Finance > Versions' close form starts them.
  const sep = s.datasets.assumptions.filter(
    (r) => r.version === 'fy27-working' && r.table === 'fx' && r.key.endsWith('|actual|2026-09'),
  )
  const rates = await sc.run(admin, 'setFx', {
    versionId: 'fy27-working',
    rates: sep.map((r) => ({
      currency: r.key.split('|')[0],
      set: 'actual' as const,
      month: OCT,
      usdPerLocal: r.value,
    })),
  })
  expect(rates.outcome.ok).toBe(true)
  const close = await sc.run(admin, 'closeMonth', { month: OCT })
  expect(close.outcome).toEqual({ ok: true, notice: 'Oct 2026 is closed.' })
  plan = await sc.plan()
  posted = plan.adjustments.filter((a) => a.postedIn === OCT && !!(a.delta.positionId ?? a.positionId))
  mine = posted.filter((a) => raised.includes(a.delta.employeeId) && a.delta.currency === 'USD')
}, 600_000)

/** HR admin with Show pay amounts on (no fold, no rounding), on the plan state with these adjustments. */
const ctxWith = (adjustments: readonly Adjustment[]): AnalyticsContext =>
  sampleCtx('hr-admin', {
    sample: withPlan(s, { ...plan, adjustments: [...adjustments] }),
    showPay: true,
    asOfOverride: AS_OF,
    compare: 'fy27-budget',
  })

const loaded = (lines: readonly PlanLine[], month?: string) =>
  lines.filter((l) => !month || l.month === month).reduce((n, l) => n + l.usd.loaded, 0)
const sumOf = (xs: readonly Adjustment[]) => xs.reduce((n, a) => n + a.delta.usd.loaded, 0)

const working = (ctx: AnalyticsContext): AnyVersion =>
  ctx.versions.find((v) => v.versionId === 'fy27-working') as AnyVersion

describe('back-dated adjustments post into every Working figure (review SA-2)', () => {
  let sum = 0
  /** Every adjustment posted. */
  let on: AnalyticsContext
  /** The raised people's USD adjustments taken out. */
  let off: AnalyticsContext
  /** No adjustment at all. */
  let none: AnalyticsContext

  beforeAll(() => {
    sum = sumOf(mine)
    on = ctxWith(plan.adjustments)
    off = ctxWith(plan.adjustments.filter((a) => !mine.includes(a)))
    none = ctxWith([])
  }, 300_000)

  it('posts one adjustment a raised person and closed month, in October, each a line of its own', () => {
    // June to September for each raised person paid in USD.
    const people = new Set(mine.map((a) => a.delta.employeeId))
    expect(people.size).toBeGreaterThanOrEqual(3)
    expect(new Set(mine.map((a) => `${a.delta.employeeId}|${a.forMonth}`)).size).toBe(4 * people.size)
    expect(sum).toBeGreaterThan(4 * people.size * 1_000)
    const lines = adjustmentLines(plan.adjustments).filter((l) => l.month === OCT)
    expect(lines).toHaveLength(posted.length)
    for (const l of lines) expect([l.heads, l.fte, l.basis, l.versionId]).toEqual([0, 0, 'hris', 'actual'])
    expect(loaded(lines)).toBeCloseTo(sumOf(posted), 6)
  })

  it('the line source holds close + adjustments in the posting month, and only there', () => {
    const v = working(on)
    const withAdj = shownLines(on, v)
    // Plan reads the shared helper's own output, adjustments included.
    expect(withAdj).toBe(
      withClosedMonths(versionLinesOf(on, v), on.plan?.closes ?? [], null, on.plan?.adjustments),
    )
    for (const [other, amount, count] of [
      [off, sum, mine.length],
      [none, sumOf(posted), posted.length],
    ] as const) {
      const own = shownLines(other, v)
      expect(loaded(withAdj, OCT) - loaded(own, OCT)).toBeCloseTo(amount, 4)
      expect(loaded(withAdj) - loaded(own)).toBeCloseTo(amount, 4)
      expect(withAdj.length - own.length).toBe(count)
      // Heads and FTE do not move: an adjustment changes a closed month's cost, not anyone's seat.
      const heads = (ls: readonly PlanLine[]) =>
        ls.filter((l) => l.month === OCT).reduce((n, l) => n + l.heads, 0)
      expect(heads(withAdj)).toBe(heads(own))
    }
  })

  it('Plan’s loaded cost to date and Targets’ Working lines move by the sum posted', () => {
    const ytd = (c: AnalyticsContext) =>
      planModel(c).overview.kpis.find((k) => k.id === 'cost-ytd')?.value as number
    expect(ytd(on) - ytd(off)).toBeCloseTo(sum, 2)
    expect(ytd(on) - ytd(none)).toBeCloseTo(sumOf(posted), 2)
    const lines = (c: AnalyticsContext) => workingLines(c, workingFrame(c, 'FY27'))
    expect(loaded(lines(on), OCT) - loaded(lines(off), OCT)).toBeCloseTo(sum, 4)
    expect(loaded(lines(on)) - loaded(lines(none))).toBeCloseTo(sumOf(posted), 4)
  })

  it('the forecast’s October and year move by the sum posted, and the bridge books it in timing', () => {
    const a = forecastRunOf(on)
    const b = forecastRunOf(off)
    const c = forecastRunOf(none)
    if (!a || !b || !c) throw new Error('no forecast run')
    const oct = (r: typeof a) => r.detail.months.find((m) => m.month === OCT)
    expect(oct(a)?.closed).toBe(true)
    for (const [r, amount] of [
      [b, sum],
      [c, sumOf(posted)],
    ] as const) {
      expect((oct(a)?.cost.filled.loaded ?? 0) - (oct(r)?.cost.filled.loaded ?? 0)).toBeCloseTo(amount, 4)
      expect(a.detail.yearEnd.cost.loaded - r.detail.yearEnd.cost.loaded).toBeCloseTo(amount, 4)
      expect(loaded(a.lines) - loaded(r.lines)).toBeCloseTo(amount, 4)
    }
    const window = (ctx: AnalyticsContext) => {
      const p = prepare(ctx)
      return bridgeWindow(p, monthsOf(p.fiscalYear))
    }
    const wa = window(on)
    const wb = window(off)
    expect((wa.end ?? 0) - (wb.end ?? 0)).toBeCloseTo(sum, 2)
    // USD adjustments: the whole amount is timing (6.6), and no other step moves.
    const step = (w: typeof wa, key: string) => w.steps.find((x) => x.key === key)?.value ?? 0
    expect(step(wa, 'timing') - step(wb, 'timing')).toBeCloseTo(sum, 2)
    for (const x of wa.steps.filter((y) => y.key !== 'timing'))
      expect(x.value - step(wb, x.key), x.key).toBeCloseTo(0, 2)
    // With every adjustment taken out, the end moves by them all (timing and FX together).
    const wc = window(none)
    expect((wa.end ?? 0) - (wc.end ?? 0)).toBeCloseTo(sumOf(posted), 2)
  })
})
