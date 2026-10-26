/**
 * What a version lock stores (docs/PLAN.md 5.4 `lockVersion`, 6.5, 6.7, C28; M3 freeze, M2-REPORT
 * known gap 1 "computeLock still throws"): the year's Working computed as of the lock into lines,
 * assumptions, plan rates and, for a reforecast, its forecast (`LockContent`). One computation,
 * read by both the `lockVersion` action (`env.computeLock`) and the PlanStore's own `lockVersion`
 * (src/app/boot.ts deps `computeLock`, through `computeLockNow`).
 *
 * - lines: Working's plan lines over the version's grid as the Plan view prices them (closed months
 *   from the closes through src/plan/lineSource.ts, later months from Working's own lines, the
 *   vacancy allowance included, C31), every position, no scope or filter;
 * - assumptions: Working's assumption rows (the imported ones for the year with the overlay's in
 *   place), as they are: the lock hash covers them;
 * - rates: Working's FX table; forecast: the forecast run's stored table for a reforecast, null for
 *   a Budget.
 *
 * Readings taken here (core, M3): with no `as` (the PlanStore's own lock, whose deps carry no kind),
 * the lock is a reforecast when the year has a locked Budget already (lockInto refuses a second
 * Budget and a reforecast before one), so its forecast is stored exactly then.
 *
 * The standard head (11.2, M3 review SP-13): a Budget lock stores the one "Compute from Budget" gives
 * over the lines it stores (`budgetStandardHead`: Σ band estimate ÷ Σ FTE over the approved Employee
 * positions at the year end, at band, rounded to the nearest $1,000), in place of Working's trade
 * row; a reforecast lock carries the year's Budget's unchanged. `at` is the lock's business date
 * (R47: the as-of date with the clock's time of day), the date the positions are read on.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the bodies.
 */
import type { AnalyticsContext } from '@/data/context'
import { fyRange } from '@/data/fiscal'
import type { AssumptionRow, ISODateTime, PositionRow } from '@/data/schema'
import { dateOf, monthKey } from '@/lib/dates'
import { standardHeadOf, type TradePosition } from '@/plan/engine/band'
import { forecastTable } from '@/plan/engine/forecast'
import { budgetOf, isLocked, rowOn, toPosition } from '@/plan/engine/versions'
import type { LockAs, LockContent } from '@/plan/store/types'
import type { PlanLine, WorkingVersion } from '@/plan/types'
import { forecastRunOf } from '@/views/forecast/engine/run'
import {
  ratesFor,
  versionAssumptions,
  versionRates,
  workingFrame,
  workingLines,
} from '@/views/targets/engine/working'

/** The lock content of a Working as of `at`, from the analytics context's data and plan state (unscoped). */
export function lockContentOf(
  ctx: AnalyticsContext,
  working: WorkingVersion,
  at: ISODateTime,
  as?: LockAs,
): LockContent {
  const frame = workingFrame(ctx, working.fiscalYear)
  if (frame.version?.versionId !== working.versionId)
    throw new Error(`There is no Working version ${working.versionId} to lock.`)
  const kind = as?.kind ?? (budgetOf(ctx.versions, working.fiscalYear) ? 'reforecast' : 'budget')
  let forecast: LockContent['forecast'] = null
  if (kind === 'reforecast') {
    const run = forecastRunOf(ctx, working)
    if (!run) throw new Error(`The ${working.fiscalYear} forecast cannot be computed for this lock.`)
    forecast = forecastTable(run.detail)
  }
  const lines = workingLines(ctx, frame)
  const rows = versionAssumptions(ctx.all, working)
  let head: number | null = null
  if (kind === 'budget') head = budgetStandardHead(ctx, working, lines, at)
  else {
    const budget = budgetOf(ctx.versions, working.fiscalYear)
    const stored = budget && isLocked(budget) ? budget.assumptions.find(isStandardHeadRow) : undefined
    head = stored ? stored.value : null
  }
  return {
    lines,
    assumptions: head == null ? rows : withStandardHead(rows, working, head),
    rates: versionRates(ctx.all, working),
    forecast,
  }
}

/** The trade table's company standard head row (11.2). */
const isStandardHeadRow = (r: AssumptionRow): boolean =>
  r.table === 'trade' && !(r.org ?? '').trim() && r.key.trim() === 'standardHeadUsd'

/** Working's rows with the standard head row set to `usd` (kept in place, or added). */
function withStandardHead(
  rows: readonly AssumptionRow[],
  working: WorkingVersion,
  usd: number,
): readonly AssumptionRow[] {
  let found = false
  const out = rows.map((r) => {
    if (!isStandardHeadRow(r)) return r
    found = true
    return r.value === usd ? r : { ...r, value: usd }
  })
  if (!found)
    out.push({ version: working.versionId, table: 'trade', org: null, key: 'standardHeadUsd', value: usd })
  return out
}

/**
 * "Compute from Budget" over the lines a Budget lock stores (11.2, SP-13): the approved Employee
 * positions at the fiscal year's last month (Filled, Open or Planned with a head or an active
 * fraction there), each at its row on the lock date, priced at band by Working's rates; Σ band ÷ Σ
 * FTE rounded to the nearest $1,000. Null when no position has a band (the row stays as it is).
 */
export function budgetStandardHead(
  ctx: AnalyticsContext,
  working: WorkingVersion,
  lines: readonly PlanLine[],
  at: ISODateTime,
): number | null {
  const last = monthKey(fyRange(working.fiscalYear).end)
  const ids = new Set<string>()
  for (const l of lines) {
    if (l.month !== last) continue
    if (l.status !== 'Filled' && l.status !== 'Open' && l.status !== 'Planned') continue
    if (l.heads > 0 || l.active > 0) ids.add(l.positionId)
  }
  const byId = new Map<string, PositionRow[]>()
  for (const r of ctx.all.positions) {
    if (!ids.has(r.positionId)) continue
    const list = byId.get(r.positionId)
    if (list) list.push(r)
    else byId.set(r.positionId, [r])
  }
  const on = dateOf(at)
  const positions: TradePosition[] = []
  for (const [id, list] of byId) {
    const sorted = [...list].sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))
    const r = toPosition(rowOn(sorted, on) ?? sorted[0])
    if (r.workerType !== 'Employee') continue
    positions.push({
      positionId: id,
      level: r.level,
      location: r.location,
      fte: r.fte,
      orgPositionId: r.managerPositionId ?? id,
    })
  }
  if (!positions.length) return null
  try {
    return standardHeadOf(positions, ratesFor(ctx.all, working))
  } catch {
    return null
  }
}

let current: (() => AnalyticsContext | null) | null = null

/**
 * Where `computeLockNow` reads the current analytics context (the shell registers the provider's
 * context; null clears it). Plain wiring the core builder fills.
 */
export function setLockContext(get: (() => AnalyticsContext | null) | null): void {
  current = get
}

/** The PlanStore's `computeLock` (src/app/boot.ts): `lockContentOf` over the registered context. */
export function computeLockNow(working: WorkingVersion, at: ISODateTime): LockContent {
  const ctx = current?.() ?? null
  if (!ctx) throw new Error('Headcount Planner is still loading. Try again in a moment.')
  return lockContentOf(ctx, working, at)
}
