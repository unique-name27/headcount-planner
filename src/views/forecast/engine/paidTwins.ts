/**
 * The paid twin of each unpaid seat line of a forecast run: the line the same forecast gives that
 * seat, month and holder with the leave read as paid. The bridge's shape reads these
 * (./bridge.ts `neutralListOf`), so it never reads leave (lead decision C34, on C26: "guard counts,
 * folds, atoms, drills and contributor lists never read leave"). Pure (memoized per run).
 *
 * Readings taken here (bridge shape fix, M2 close, attack A1):
 *  - Before, the twin came from the Working version's line context at the as-of date
 *    (src/views/lineSource.ts `paidLineOf`). That context does not know a person hired after the
 *    as-of date, but the forecast does: it reads the last close and every HRIS assignment (lead
 *    decision D-PREHIRE), and `actualThrough` stays at the last close. With the reporting date set
 *    before the last close (31 August on the sample, September closed), 9 September hires had no
 *    twin (40 at 30 June), the unpaid line stood in for its own twin, and the FX tile's count and the
 *    fold read their leave. A twin is now priced from the run's own inputs, by the engine that
 *    priced the line.
 *  - Projected months (after `actualThrough`): cost.ts `positionLines` on the forecast's own line
 *    context, built from the inputs forecast.ts `forecastDetail` builds its context from (every HRIS
 *    assignment, the forecast's rates with actual rates through `actualThrough`, no vacancy
 *    allowance, the closes), with `unpaidLeave` read false. Leave changes a line's amounts, never its
 *    segments, so every unpaid line has a twin, and the twin is the line the run gives the seat when
 *    the leave is paid, field by field (`paidTwins.test.ts`).
 *  - Actual months (on or before `actualThrough`): close.ts `actualLines` for the month with the
 *    leave read as paid (the reading the run itself takes for an actual month without a close), with
 *    the line's own rate, one-time and allowance kept. For a month without a close that is the paid
 *    line itself. A closed month's line is the close's stored line; its twin is the holder's HRIS pay
 *    for the month read now. Where HRIS no longer places the close's holder on that seat in that
 *    month, or a needed actual rate is missing, the stored line has no twin and stands for itself: no
 *    HRIS leave flag reaches a stored line, so no leave change moves it.
 */
import { monthEnd } from '@/data/fiscal'
import type { Month, WorkerRow } from '@/data/schema'
import { actualLines } from '@/plan/engine/close'
import { type LineContext, lineContext, positionLines } from '@/plan/engine/cost'
import type { ForecastInput } from '@/plan/engine/forecast'
import { ENGINE_VERSION, toPosition } from '@/plan/engine/versions'
import type { ActualLine, PlanLine, Version } from '@/plan/types'
import { isUnpaidLine } from '@/views/lineSource'
import { type ForecastRun, isSpreadLine, runInputOf } from './run'

/** Seat, month, holder and basis: the lines one segment of a holder can be. */
const keyOf = (l: Pick<PlanLine, 'positionId' | 'month' | 'holderId' | 'basis'>): string =>
  `${l.positionId}|${l.month}|${l.holderId ?? ''}|${l.basis}`

const memo = new WeakMap<ForecastRun, ReadonlyMap<PlanLine, PlanLine>>()

/**
 * Each unpaid seat line of the run (src/views/lineSource.ts `isUnpaidLine`) with its paid twin (see
 * the module comment). A line missing from the map has none: a closed month's stored line whose
 * holder HRIS no longer places on the seat then, or whose month now lacks a needed actual rate.
 */
export function paidTwinsOf(run: ForecastRun): ReadonlyMap<PlanLine, PlanLine> {
  let hit = memo.get(run)
  if (!hit) {
    hit = twinsOf(run)
    memo.set(run, hit)
  }
  return hit
}

function twinsOf(run: ForecastRun): Map<PlanLine, PlanLine> {
  const out = new Map<PlanLine, PlanLine>()
  const seat = run.lines.filter((l) => !isSpreadLine(l) && !!l.positionId && l.active > 0)
  const unpaid = seat.filter(isUnpaidLine)
  if (!unpaid.length) return out
  // Each unpaid line's place among the run's lines of its seat, month, holder and basis: the engines
  // give a holder's segments of a month in one order, and the run keeps it (a stable sort).
  const wanted = new Set(unpaid.map(keyOf))
  const seen = new Map<string, number>()
  const order = new Map<PlanLine, number>()
  for (const l of seat) {
    const k = keyOf(l)
    if (!wanted.has(k)) continue
    const i = seen.get(k) ?? 0
    seen.set(k, i + 1)
    order.set(l, i)
  }
  const input = runInputOf(run)
  const projected = unpaid.filter((l) => l.month > run.actualThrough)
  const actual = unpaid.filter((l) => l.month <= run.actualThrough)
  if (projected.length) projectedTwins(run, input, projected, order, out)
  if (actual.length) actualTwins(input, actual, order, out)
  return out
}

/** Lines grouped by a key, in order. */
function groupBy<T>(items: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const x of items) {
    const k = key(x)
    const list = out.get(k)
    if (list) list.push(x)
    else out.set(k, [x])
  }
  return out
}

/** Projected months: the forecast's own seat lines with every month paid (see the module comment). */
function projectedTwins(
  run: ForecastRun,
  input: ForecastInput,
  lines: readonly PlanLine[],
  order: ReadonlyMap<PlanLine, number>,
  out: Map<PlanLine, PlanLine>,
): void {
  const v = input.version
  // The context forecast.ts `forecastDetail` prices its projected months with, leave read as paid.
  const base = lineContext({
    version: v,
    asOf: input.asOf,
    positions: input.positions,
    workers: input.workers,
    comp: input.comp,
    reqs: input.reqs,
    requests: input.requests,
    assumptions: input.assumptions,
    rates: { table: input.rates, use: 'actual-forecast', closedThrough: run.actualThrough },
    closes: input.closes,
    futureAssignments: true,
    vacancyAllowance: false,
  })
  const ctx: LineContext = { ...base, unpaidLeave: () => false }
  // The version `forecastDetail` prices seat lines under (its grid, ID and proration are read).
  const full: Version = {
    ...v,
    kind: 'working',
    state: 'working',
    createdAt: input.asOf,
    lockedAt: null,
    lockedBy: null,
    engineVersion: ENGINE_VERSION,
    parentId: null,
    hash: null,
  }
  const months = new Set<Month>(run.months.filter((m) => m > run.actualThrough))
  for (const [positionId, own] of groupBy(lines, (l) => l.positionId)) {
    const rows = ctx.rowsOf(positionId)
    if (!rows.length) continue
    let priced: PlanLine[]
    try {
      priced = positionLines(toPosition(rows[0]), full, ctx, months)
    } catch {
      continue // a rate the run priced the seat with is missing: never, the run read the same table
    }
    const twins = groupBy(
      priced.filter((t) => t.active > 0),
      keyOf,
    )
    for (const l of own) {
      const twin = twins.get(keyOf(l))?.[order.get(l) ?? 0]
      if (twin) out.set(l, twin)
    }
  }
}

/** A worker row with its leave read as paid (pay lines priced in full). */
const paid = (w: WorkerRow): WorkerRow =>
  w.onLeave === true && w.leavePaid === false ? { ...w, leavePaid: true } : w

/** Actual months: each holder's HRIS pay for the month read now with the leave paid (see the module comment). */
function actualTwins(
  input: ForecastInput,
  lines: readonly PlanLine[],
  order: ReadonlyMap<PlanLine, number>,
  out: Map<PlanLine, PlanLine>,
): void {
  for (const [month, own] of groupBy(lines, (l) => l.month)) {
    const people = new Set(own.map((l) => l.holderId as string))
    // Every row of the holders (an assignment is one row), and the rows of every seat they hold:
    // close.ts prices each assignment from its own row, pay and seat only.
    const workers = input.workers.filter((w) => people.has(w.employeeId)).map(paid)
    const seats = new Set<string>(own.map((l) => l.positionId))
    for (const w of workers) if (w.positionId) seats.add(w.positionId)
    let rows: ActualLine[]
    try {
      rows = actualLines({
        month: month as Month,
        positions: input.positions.filter((r) => seats.has(r.positionId)),
        workers,
        comp: input.comp.filter((c) => people.has(c.employeeId)),
        assumptions: input.assumptions,
        versionId: input.version.versionId,
        versionName: input.version.name,
        rates: input.rates,
        reqs: [],
        asOf: monthEnd(month as Month) < input.asOf ? monthEnd(month as Month) : input.asOf,
      })
    } catch {
      continue // no actual rate for a currency the month now needs: the stored lines stand
    }
    const twins = groupBy(
      rows.filter((a) => a.active > 0 && !!a.positionId),
      (a) =>
        keyOf({ positionId: a.positionId as string, month: a.month, holderId: a.employeeId, basis: 'hris' }),
    )
    for (const l of own) {
      const a = twins.get(keyOf(l))?.[order.get(l) ?? 0]
      if (a) out.set(l, withPay(l, a))
    }
  }
}

/** A line with a twin's pay (base, bonus, burden, benefits, equity) at the line's own rate. */
function withPay(l: PlanLine, twin: ActualLine): PlanLine {
  const rate = l.rate || twin.rate
  const local = {
    base: twin.local.base,
    bonus: twin.local.bonus,
    burden: twin.local.burden,
    benefits: twin.local.benefits,
    oneTime: l.local.oneTime,
    vacancy: l.local.vacancy,
  }
  const usd = {
    base: local.base * rate,
    bonus: local.bonus * rate,
    burden: local.burden * rate,
    benefits: local.benefits * rate,
    oneTime: l.usd.oneTime,
    vacancy: l.usd.vacancy,
    equity: twin.usd.equity,
    loaded: 0,
  }
  usd.loaded = usd.base + usd.bonus + usd.burden + usd.benefits + usd.oneTime + usd.vacancy
  return { ...l, local, usd }
}
