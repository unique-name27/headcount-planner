/**
 * One line source for Working's figures (change C33, review RF-4): Targets prices Working's closed
 * months from the closes, as Plan and Forecast do (src/plan/lineSource.ts), so no two Finance
 * figures read a closed month from different lines. Before C33 Targets priced every month from
 * Working's own recomputed lines while Plan read the closes, and a cost center's Targets figure less
 * Plan's open months and Plan's year to date gave a back-dated raise of one person at one as-of date.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Datasets } from '@/data/schema'
import { withClosedMonths } from '@/plan/lineSource'
import type { PlanLine } from '@/plan/types'
import { closedMonthsOf, shownLines } from '@/views/plan/engine/core'
import { foldsOf as planFoldsOf } from '@/views/plan/engine/guarded'
import { sample, sampleCtx } from './fixtures'
import { foldsOf, workingFrame, workingLines, workingOwnLines } from './working'

const cents = (x: number) => Math.round(x * 100)

/** Loaded USD by cost center and month, from the lines of the given positions' latest rows. */
function byCenterMonth(
  lines: readonly PlanLine[],
  centerOf: ReadonlyMap<string, string>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const l of lines) {
    const cc = centerOf.get(l.positionId)
    if (!cc) continue
    const k = `${cc}|${l.month}`
    out.set(k, (out.get(k) ?? 0) + l.usd.loaded)
  }
  return out
}

function centersOf(data: Datasets): Map<string, string> {
  const latest = new Map<string, { at: string; cc: string }>()
  for (const r of data.positions) {
    const cur = latest.get(r.positionId)
    if (!cur || r.effectiveDate >= cur.at) latest.set(r.positionId, { at: r.effectiveDate, cc: r.costCenter })
  }
  return new Map([...latest].map(([id, v]) => [id, v.cc]))
}

/** The sample with a back-dated raise of one 1110-SJC holder, effective 1 Jul 2026 (closes unchanged). */
function withBackDatedRaise(data: Datasets): { data: Datasets; employeeId: string } {
  const centers = centersOf(data)
  const w = data.workers.find(
    (x) =>
      x.workerType === 'Employee' &&
      x.positionId != null &&
      centers.get(x.positionId) === '1110-SJC' &&
      x.hireDate < '2026-01-01' &&
      !x.terminationDate,
  )
  if (!w) throw new Error('No 1110-SJC holder.')
  const latest = data.comp
    .filter((c) => c.employeeId === w.employeeId && c.effectiveDate <= '2026-07-01')
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1))[0]
  const comp = [
    ...data.comp,
    { ...latest, effectiveDate: '2026-07-01', baseSalary: latest.baseSalary + 12_000 },
  ]
  return { data: { ...data, comp }, employeeId: w.employeeId }
}

describe("Targets reads Working's closed months from the closes (C33, RF-4)", () => {
  beforeAll(() => {
    sample()
  })

  it("Targets' Working lines and Plan's shown lines agree by cost center and month, to the cent", () => {
    const ctx = sampleCtx('finance')
    const frame = workingFrame(ctx, ctx.version?.fiscalYear ?? 'FY27')
    const v = frame.version
    expect(v?.state).toBe('working')
    if (!v) return
    const centers = centersOf(ctx.all)
    const targets = byCenterMonth(workingLines(ctx, frame), centers)
    const plan = byCenterMonth(shownLines(ctx, v), centers)
    expect(targets.size).toBeGreaterThan(500)
    const diff: string[] = []
    for (const k of new Set([...targets.keys(), ...plan.keys()]))
      if (cents(targets.get(k) ?? 0) !== cents(plan.get(k) ?? 0)) diff.push(k)
    expect(diff).toEqual([])
    // The closed months are the closes': no vacancy allowance on them (C31).
    const closed = new Set(closedMonthsOf(ctx.plan))
    expect(closed.size).toBe(6)
    for (const l of workingLines(ctx, frame)) if (closed.has(l.month)) expect(l.usd.vacancy).toBe(0)
  })

  it('a back-dated raise in a closed month moves no Targets figure of that month (the closes hold)', () => {
    const base = sampleCtx('finance')
    const { data } = withBackDatedRaise(base.all)
    const ctx = sampleCtx('finance', { data })
    const fy = ctx.version?.fiscalYear ?? 'FY27'
    const before = byCenterMonth(workingLines(base, workingFrame(base, fy)), centersOf(base.all))
    const after = byCenterMonth(workingLines(ctx, workingFrame(ctx, fy)), centersOf(data))
    for (const m of ['2026-07', '2026-08', '2026-09'])
      expect(cents(after.get(`1110-SJC|${m}`) ?? 0), m).toBe(cents(before.get(`1110-SJC|${m}`) ?? 0))
    // Working's own recomputed lines do move (the raise), which Targets no longer reads for July to
    // September: that difference was one person's back-dated raise at one as-of date (RF-4).
    const own = byCenterMonth(workingOwnLines(ctx, workingFrame(ctx, fy)), centersOf(data))
    const ownBefore = byCenterMonth(workingOwnLines(base, workingFrame(base, fy)), centersOf(base.all))
    expect(
      cents((own.get('1110-SJC|2026-07') ?? 0) - (ownBefore.get('1110-SJC|2026-07') ?? 0)),
    ).toBeGreaterThan(0)
    // And the same one rule as Plan's, line for line.
    const v = ctx.version
    if (!v) return
    const centers = centersOf(data)
    const plan = byCenterMonth(shownLines(ctx, v), centers)
    for (const [k, x] of after) expect(cents(x), k).toBe(cents(plan.get(k) ?? 0))
  })

  it("Plan's and Targets' one cost-center fold per unit agree, built from the same line source", () => {
    const ctx = sampleCtx('finance')
    const frame = workingFrame(ctx, ctx.version?.fiscalYear ?? 'FY27')
    const text = (m: ReturnType<typeof foldsOf> | null) =>
      [...(m ?? new Map()).values()]
        .map((f) => `${f.unit}: ${f.shown.join(',')} | ${f.other.join(',')}`)
        .sort()
    expect(text(foldsOf(ctx, frame))).toEqual(text(planFoldsOf(ctx, frame.version)))
    expect(text(foldsOf(ctx, frame)).length).toBe(6)
  })

  it('withClosedMonths keeps an org to its own close lines, and passes own lines through with no close', () => {
    const ctx = sampleCtx('finance')
    const frame = workingFrame(ctx, ctx.version?.fiscalYear ?? 'FY27')
    const own = workingOwnLines(ctx, frame)
    expect(withClosedMonths(own, [])).toBe(own)
    const closes = ctx.plan?.closes ?? []
    const keep = new Set(own.slice(0, 50).map((l) => l.positionId))
    const kept = withClosedMonths(own, closes, (id) => keep.has(id))
    const closed = new Set(closes.map((c) => c.month))
    for (const l of kept) if (closed.has(l.month)) expect(keep.has(l.positionId)).toBe(true)
  })
})
