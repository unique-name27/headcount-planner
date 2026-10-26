/**
 * What the Targets and Finance views read of the Working plan (docs/PLAN.md 6.5, 6.9, 7 and 11), once
 * per loaded data and shared by every mode: the fiscal year a view shows, that year's Working version
 * and its first open month, band estimates at its plan rates (`TradeRates`), the asks context
 * (src/plan/engine/targets.ts), Working's lines (closed months from the closes, C33), the cost
 * guard's members over the year and over the version's grid, Finance's one cost-center fold per unit,
 * and the org a target row or a leader's sub-org holds.
 *
 * Everything here is keyed by the unscoped datasets (`ctx.all`, the same object in every mode), the
 * plan state, the version and the as-of date, so a mode switch or a filter change recomputes no
 * engine. Nothing here decides what a mode sees: the view models apply the guard and 8.4.
 *
 * Readings taken here (views-2 builder, M2):
 *  - The year a Targets or Finance figure is for is the shown version's fiscal year (the as-of date's
 *    when no version is shown); asks always read that year's Working version, whatever version is
 *    shown, because asks are Working's (6.9).
 *  - A position's org for cost is its latest row (R26: orgs join at read time); a seat's org for heads
 *    is its row on the target date, as the asks engine reads it.
 *  - Band estimates price a seat at the Working version's own assumptions and plan rates, with the
 *    org fallback read from the org position's latest row (the sample's routing does the same).
 *  - A leader-keyed org (a target row with `leaderPositionId`, a sub-org) is the leader seat and every
 *    position below it, so a sub-org headed by a leader seat is a whole union of cost atoms (7.3a). For
 *    a new seat the manager position decides.
 *  - Finance's folds are built once per Working version and as-of date over the version's whole grid,
 *    on every position's lines, unfiltered (`financeFolds`), as the cost guard asks.
 *  - Working's figures read its closed months from the closes and the later months from its own
 *    lines (`workingLines`, src/plan/lineSource.ts, change C33 and review RF-4): asks cost, the gap,
 *    Tree x cost center and the folds price every closed month exactly as Plan and Forecast do, so no
 *    two figures difference out a back-dated change. Closes carry no vacancy allowance (C31), so the
 *    asks cost holds it for the open months only.
 *
 * Pure (memoized). Imported by src/views/finance/engine (a view may import another view's engine).
 */
import { isUnionOfAtoms } from '@/cost/atoms'
import type { FinanceFold } from '@/cost/fold'
import { type CostMember, type CostSeat, costMembersOf, financeFolds } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf, fyRange, monthRange, monthsOf } from '@/data/fiscal'
import { type FieldRef, fieldDefOf } from '@/data/quality/fieldRef'
import {
  type AssumptionRow,
  type Datasets,
  type FiscalYear,
  type ISODate,
  type Month,
  type PositionRow,
  siteByLocation,
  type TargetRow,
} from '@/data/schema'
import { requestsOf } from '@/drill/seats'
import { assumptionLookup } from '@/plan/engine/assumptions'
import { type TradeRates, tradeRatesOf } from '@/plan/engine/band'
import { firstOpenMonth, lastCloseDate } from '@/plan/engine/close'
import { lineContext, versionLines } from '@/plan/engine/cost'
import { fxRatesFromAssumptions, rateOf } from '@/plan/engine/fx'
import { toAssignments } from '@/plan/engine/heads'
import { type AsksContext, asksContext, targetDateOf, targetKindOf } from '@/plan/engine/targets'
import { isLocked, workingOf } from '@/plan/engine/versions'
import { withClosedMonths } from '@/plan/lineSource'
import type {
  AnyVersion,
  FxTable,
  HcRequest,
  MonthClose,
  OrgMatch,
  PlanLine,
  PlanState,
  SeatPlace,
} from '@/plan/types'
import { rememberOrigin } from '@/views/plan/engine/guarded'

/* ───────────── memo ───────────── */

const NO_PLAN: object = {}

/** A cache keyed by two objects and a string. */
class Memo<A extends object, B extends object, T> {
  private readonly store = new WeakMap<A, WeakMap<B, Map<string, T>>>()
  get(a: A, b: B, key: string, make: () => T): T {
    let byB = this.store.get(a)
    if (!byB) {
      byB = new WeakMap()
      this.store.set(a, byB)
    }
    let byKey = byB.get(b)
    if (!byKey) {
      byKey = new Map()
      byB.set(b, byKey)
    }
    if (byKey.has(key)) return byKey.get(key) as T
    const v = make()
    byKey.set(key, v)
    return v
  }
}

const planKey = (plan: PlanState | null): object => plan ?? NO_PLAN

/* ───────────── the year and its Working version ───────────── */

/** The fiscal year Targets and Finance figures are for: the shown version's, else the as-of date's. */
export const targetYearOf = (ctx: Pick<AnalyticsContext, 'version' | 'asOf'>): FiscalYear =>
  ctx.version?.fiscalYear ?? fiscalYearOf(ctx.asOf)

/** A year's Working version and what its figures read. */
export interface WorkingFrame {
  fiscalYear: FiscalYear
  /** The year's Working version, or null when the plan state has none (heads still count). */
  version: AnyVersion | null
  /** The year's months, in order. */
  months: readonly Month[]
  /** The version's grid months (the year's months when there is no version). */
  grid: readonly Month[]
  /** The first month not closed (a trade's give seats leave the plan from it). */
  firstOpenMonth: Month
  /** The last close's month-end, or null before the first close. */
  lastClose: ISODate | null
  /** Band estimates and weights at the version's plan rates; null with no version. */
  rates: TradeRates | null
}

const frames = new Memo<Datasets, object, WorkingFrame>()

/** The year's Working frame (memoized per data, plan state and year). */
export function workingFrame(
  ctx: Pick<AnalyticsContext, 'all' | 'plan' | 'versions'>,
  fiscalYear: FiscalYear,
): WorkingFrame {
  return frames.get(ctx.all, planKey(ctx.plan), `${fiscalYear}|${ctx.versions.length}`, () => {
    const version = workingOf(ctx.versions, fiscalYear)
    const months = monthsOf(fiscalYear)
    const grid = version ? monthRange(version.grid.from, version.grid.to) : months
    const closes = ctx.plan?.closes ?? []
    return {
      fiscalYear,
      version,
      months,
      grid,
      firstOpenMonth: firstOpenMonth(closes, grid[0]),
      lastClose: lastCloseDate(closes),
      rates: version ? ratesFor(ctx.all, version) : null,
    }
  })
}

/** A version's assumption rows: a locked version's own, else the rows of the assumptions dataset naming it. */
export function versionAssumptions(all: Datasets, version: AnyVersion): readonly AssumptionRow[] {
  if (isLocked(version)) return version.assumptions
  const id = version.versionId.trim()
  const name = version.name.trim()
  return all.assumptions.filter((r) => {
    const v = (r.version ?? '').trim()
    return v === id || v === name
  })
}

/** A version's plan FX table: a locked version's stored rates, else the fx rows of its assumptions. */
export function versionRates(all: Datasets, version: AnyVersion): FxTable {
  return isLocked(version) ? version.rates : fxRatesFromAssumptions(versionAssumptions(all, version))
}

const latestMemo = new WeakMap<readonly PositionRow[], Map<string, PositionRow>>()

/** Each position's latest row (orgs join at read time, R26), memoized per positions array. */
export function latestRows(positions: readonly PositionRow[]): ReadonlyMap<string, PositionRow> {
  let hit = latestMemo.get(positions)
  if (!hit) {
    hit = new Map()
    for (const r of positions) {
      const cur = hit.get(r.positionId)
      if (!cur || r.effectiveDate >= cur.effectiveDate) hit.set(r.positionId, r)
    }
    latestMemo.set(positions, hit)
  }
  return hit
}

const rateMemo = new WeakMap<Datasets, Map<string, TradeRates>>()

/** Band estimates at a version's plan rates and its trade settings (memoized per data and version). */
export function ratesFor(all: Datasets, version: AnyVersion): TradeRates {
  let byVersion = rateMemo.get(all)
  if (!byVersion) {
    byVersion = new Map()
    rateMemo.set(all, byVersion)
  }
  const key = `${version.versionId}|${version.hash ?? ''}`
  const hit = byVersion.get(key)
  if (hit) return hit
  const rows = versionAssumptions(all, version)
  const table = versionRates(all, version)
  const latest = latestRows(all.positions)
  const first = version.grid.from
  const out = tradeRatesOf({
    version: { versionId: version.versionId, name: version.name, fiscalYear: version.fiscalYear },
    lockHash: version.hash,
    lookup: assumptionLookup(rows, version),
    planRate: (currency) => (currency === 'USD' ? 1 : rateOf(table, currency, 'plan', first)),
    orgPathOf: (id) => {
      const r = latest.get(id)
      return r ? { businessUnit: r.businessUnit, department: r.department ?? null } : null
    },
  })
  byVersion.set(key, out)
  return out
}

/* ───────────── asks, lines and members ───────────── */

const asksMemo = new Memo<Datasets, object, AsksContext>()

/** Working's asks context for the frame's year (band estimates at its plan rates). */
export function asksContextOf(
  ctx: Pick<AnalyticsContext, 'all' | 'plan' | 'asOf'>,
  frame: WorkingFrame,
): AsksContext {
  return asksMemo.get(ctx.all, planKey(ctx.plan), `${frame.version?.versionId ?? frame.fiscalYear}`, () => {
    const rates = frame.rates
    return asksContext({
      positions: ctx.all.positions,
      assignments: toAssignments(ctx.all.workers),
      reqs: ctx.all.reqs,
      requests: requestsOf(ctx),
      proration: frame.version?.proration ?? 'daily',
      firstOpenMonth: frame.firstOpenMonth,
      bandUsd: (seat, place) =>
        rates ? rates.bandUsd(seat, place.positionId ?? place.managerPositionId ?? '') : null,
    })
  })
}

const linesMemo = new Memo<Datasets, object, readonly PlanLine[]>()
const NO_LINES: readonly PlanLine[] = []

/**
 * Working's lines over its grid as its figures read them, as known on the as-of date (memoized):
 * the closed months from the closes and the later months from Working's own lines
 * (src/plan/lineSource.ts `withClosedMonths`, C33 and review RF-4), the one rule Plan, Forecast and
 * the sample's routing read too. Empty with no version.
 */
export function workingLines(
  ctx: Pick<AnalyticsContext, 'all' | 'plan' | 'asOf'>,
  frame: WorkingFrame,
): readonly PlanLine[] {
  const version = frame.version
  if (!version || isLocked(version)) return NO_LINES
  const own = workingOwnLines(ctx, frame)
  // Back-dated adjustments post in the month the close that found them closed (6.6, SA-2).
  return withClosedMonths(own, ctx.plan?.closes ?? NO_CLOSES, null, ctx.plan?.adjustments)
}

const NO_CLOSES: readonly MonthClose[] = []

/** Working's own plan lines over its whole grid, every month priced from its assumptions (memoized). */
export function workingOwnLines(
  ctx: Pick<AnalyticsContext, 'all' | 'plan' | 'asOf'>,
  frame: WorkingFrame,
): readonly PlanLine[] {
  const version = frame.version
  if (!version || isLocked(version)) return NO_LINES
  return linesMemo.get(ctx.all, planKey(ctx.plan), `${version.versionId}|${ctx.asOf}`, () => {
    const lc = lineContext({
      version,
      asOf: ctx.asOf,
      positions: ctx.all.positions,
      workers: ctx.all.workers,
      comp: ctx.all.comp,
      reqs: ctx.all.reqs,
      requests: requestsOf(ctx),
      assumptions: versionAssumptions(ctx.all, version),
      rates: { table: versionRates(ctx.all, version), use: 'plan', closedThrough: null },
      closes: ctx.plan?.closes ?? [],
    })
    return versionLines(version, lc)
  })
}

const seatMemo = new WeakMap<readonly PositionRow[], (id: string) => CostSeat | null>()

/** Where each position sits for the guard (its latest row; country and legal entity from its site). */
export function costSeatOf(positions: readonly PositionRow[]): (id: string) => CostSeat | null {
  let hit = seatMemo.get(positions)
  if (!hit) {
    const latest = latestRows(positions)
    const cache = new Map<string, CostSeat | null>()
    hit = (id) => {
      if (cache.has(id)) return cache.get(id) ?? null
      const r = latest.get(id)
      const site = r ? siteByLocation.get(r.location) : undefined
      const seat: CostSeat | null = r
        ? {
            businessUnit: r.businessUnit,
            department: r.department ?? null,
            costCenter: r.costCenter,
            location: r.location,
            legalEntity: r.legalEntity || site?.legalEntity || '',
            country: site?.country ?? '',
            level: r.level,
            managerPositionId: r.managerPositionId ?? null,
          }
        : null
      cache.set(id, seat)
      return seat
    }
    seatMemo.set(positions, hit)
  }
  return hit
}

/** A position's manager position from its latest row (positions created since the close take its atom). */
export function managerOfLatest(positions: readonly PositionRow[]): (id: string) => string | null {
  const latest = latestRows(positions)
  return (id) => latest.get(id)?.managerPositionId ?? null
}

const memberMemo = new WeakMap<readonly PlanLine[], WeakMap<object, Map<string, readonly CostMember[]>>>()

/** The guard's members of the lines over some months, against the guard's atom index (memoized). */
export function membersOver(
  ctx: Pick<AnalyticsContext, 'all' | 'guard'>,
  lines: readonly PlanLine[],
  months: readonly Month[],
): readonly CostMember[] {
  let byAtoms = memberMemo.get(lines)
  if (!byAtoms) {
    byAtoms = new WeakMap()
    memberMemo.set(lines, byAtoms)
  }
  let byMonths = byAtoms.get(ctx.guard.atoms)
  if (!byMonths) {
    byMonths = new Map()
    byAtoms.set(ctx.guard.atoms, byMonths)
  }
  const key = months.join(',')
  let hit = byMonths.get(key)
  if (!hit) {
    hit = costMembersOf({
      lines,
      months,
      seatOf: costSeatOf(ctx.all.positions),
      atoms: ctx.guard.atoms,
    }).members
    // The component gate of an exact figure reads the lines and window its members came from (C33).
    rememberOrigin(hit, lines, months)
    byMonths.set(key, hit)
  }
  return hit
}

const foldMemo = new WeakMap<readonly PlanLine[], Map<string, ReadonlyMap<string, FinanceFold>>>()

/**
 * Finance's one cost-center fold per unit (7.4) for the frame's Working version: `financeFolds` over
 * the version's whole grid, every position, unfiltered (memoized per lines and minimum).
 */
export function foldsOf(
  ctx: Pick<AnalyticsContext, 'all' | 'plan' | 'asOf' | 'guard'>,
  frame: WorkingFrame,
): ReadonlyMap<string, FinanceFold> {
  const lines = workingLines(ctx, frame)
  let byMin = foldMemo.get(lines)
  if (!byMin) {
    byMin = new Map()
    foldMemo.set(lines, byMin)
  }
  const key = `${ctx.guard.rules.minCosted}|${frame.grid.join(',')}`
  let hit = byMin.get(key)
  if (!hit) {
    hit = financeFolds(membersOver(ctx, lines, frame.grid) as CostMember[], ctx.guard.rules.minCosted)
    byMin.set(key, hit)
  }
  return hit
}

/** The cost centers every unit's fold shows (a Finance cost-center filter may pick only these). */
export function shownCostCenters(folds: ReadonlyMap<string, FinanceFold>): Set<string> {
  const out = new Set<string>()
  for (const f of folds.values()) for (const cc of f.shown) out.add(cc)
  return out
}

/* ───────────── orgs ───────────── */

const childMemo = new WeakMap<readonly PositionRow[], Map<string, string[]>>()

/** Each position's direct reports by their latest rows. */
function latestChildren(positions: readonly PositionRow[]): ReadonlyMap<string, readonly string[]> {
  let hit = childMemo.get(positions)
  if (!hit) {
    hit = new Map()
    for (const [id, r] of latestRows(positions)) {
      const m = r.managerPositionId
      if (!m || m === id) continue
      const list = hit.get(m)
      if (list) list.push(id)
      else hit.set(m, [id])
    }
    for (const list of hit.values()) list.sort()
    childMemo.set(positions, hit)
  }
  return hit
}

/** A seat and every position below it by the latest rows (cycle-safe). */
export function subtreeLatest(positions: readonly PositionRow[], root: string): Set<string> {
  const children = latestChildren(positions)
  const out = new Set<string>()
  const stack = [root]
  while (stack.length) {
    const id = stack.pop() as string
    if (out.has(id)) continue
    out.add(id)
    for (const c of children.get(id) ?? []) if (!out.has(c)) stack.push(c)
  }
  return out
}

const treeMemo = new WeakMap<readonly PositionRow[], (id: string, root: string, on: ISODate) => boolean>()

/** Whether a position sits strictly below a root on a date, walking the rows in effect then (memoized). */
export function inTreeOf(
  positions: readonly PositionRow[],
): (id: string, root: string, on: ISODate) => boolean {
  let hit = treeMemo.get(positions)
  if (!hit) {
    const byId = new Map<string, PositionRow[]>()
    for (const r of positions) {
      const list = byId.get(r.positionId)
      if (list) list.push(r)
      else byId.set(r.positionId, [r])
    }
    for (const list of byId.values()) list.sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))
    const at = new Map<ISODate, Map<string, string | null>>()
    const managersOn = (on: ISODate) => {
      let m = at.get(on)
      if (!m) {
        m = new Map()
        for (const [id, list] of byId) {
          let row: PositionRow | null = null
          for (const r of list) if (r.effectiveDate <= on) row = r
          m.set(id, (row ?? list[0]).managerPositionId ?? null)
        }
        if (at.size > 32) at.clear()
        at.set(on, m)
      }
      return m
    }
    hit = (id, root, on) => {
      const managers = managersOn(on)
      const seen = new Set<string>()
      let cur = managers.get(id) ?? null
      while (cur != null && !seen.has(cur)) {
        if (cur === root) return true
        seen.add(cur)
        cur = managers.get(cur) ?? null
      }
      return false
    }
    treeMemo.set(positions, hit)
  }
  return hit
}

/** What an org a target row or sub-org names is made of. */
export interface OrgDef {
  /** Stable key: 'unit:<unit>', 'dept:<unit>|<dept>', 'cc:<unit>|<cc>', 'tree:<positionId>'. */
  key: string
  kind: 'unit' | 'department' | 'costCenter' | 'leader'
  businessUnit: string
  department: string | null
  costCenter: string | null
  leaderPositionId: string | null
  /** The asks engine's org test (a seat's place on a date). */
  match: OrgMatch
  /** Every position of the org by its latest row (cost members, unions of atoms and cost centers). */
  positionIds: ReadonlySet<string>
}

const orgMemo = new WeakMap<readonly PositionRow[], Map<string, OrgDef>>()

/** The org a target row names (memoized per positions array). */
export function orgOfTarget(positions: readonly PositionRow[], t: TargetRow): OrgDef {
  switch (targetKindOf(t)) {
    case 'leader':
      return leaderOrg(positions, t.leaderPositionId as string, t.businessUnit)
    case 'cost-center':
      return fieldOrg(positions, 'costCenter', t.businessUnit, t.costCenter as string)
    case 'department':
      return fieldOrg(positions, 'department', t.businessUnit, t.department as string)
    case 'unit':
      return fieldOrg(positions, 'unit', t.businessUnit, null)
  }
}

function cached(positions: readonly PositionRow[], key: string, make: () => OrgDef): OrgDef {
  let byKey = orgMemo.get(positions)
  if (!byKey) {
    byKey = new Map()
    orgMemo.set(positions, byKey)
  }
  let hit = byKey.get(key)
  if (!hit) {
    hit = make()
    byKey.set(key, hit)
  }
  return hit
}

/** A unit, or a department or cost center of a unit. */
export function fieldOrg(
  positions: readonly PositionRow[],
  kind: 'unit' | 'department' | 'costCenter',
  businessUnit: string,
  value: string | null,
): OrgDef {
  const key =
    kind === 'unit'
      ? `unit:${businessUnit}`
      : `${kind === 'department' ? 'dept' : 'cc'}:${businessUnit}|${value}`
  return cached(positions, key, () => {
    const holds = (p: { businessUnit: string; department?: string | null; costCenter?: string | null }) =>
      p.businessUnit === businessUnit &&
      (kind === 'unit' ||
        (kind === 'department' ? (p.department ?? null) === value : (p.costCenter ?? null) === value))
    const ids = new Set<string>()
    for (const [id, r] of latestRows(positions)) if (holds(r)) ids.add(id)
    return {
      key,
      kind,
      businessUnit,
      department: kind === 'department' ? value : null,
      costCenter: kind === 'costCenter' ? value : null,
      leaderPositionId: null,
      match: (place: SeatPlace) => holds(place),
      positionIds: ids,
    }
  })
}

/** A leader seat and every position below it (a sub-org, a leader-keyed target). */
export function leaderOrg(positions: readonly PositionRow[], root: string, businessUnit?: string): OrgDef {
  return cached(positions, `tree:${root}`, () => {
    const inTree = inTreeOf(positions)
    const ids = subtreeLatest(positions, root)
    const unit = businessUnit ?? latestRows(positions).get(root)?.businessUnit ?? ''
    return {
      key: `tree:${root}`,
      kind: 'leader',
      businessUnit: unit,
      department: null,
      costCenter: null,
      leaderPositionId: root,
      match: (place: SeatPlace, on: ISODate) => {
        if (place.positionId != null) return place.positionId === root || inTree(place.positionId, root, on)
        const m = place.managerPositionId
        return m != null && (m === root || inTree(m, root, on))
      },
      positionIds: ids,
    }
  })
}

/** The org's live positions (Eliminated seats hold no cost) are a whole union of the guard's atoms. */
export function orgIsUnion(
  ctx: Pick<AnalyticsContext, 'all' | 'guard'>,
  org: Pick<OrgDef, 'positionIds'>,
): boolean {
  const latest = latestRows(ctx.all.positions)
  const live = new Set([...org.positionIds].filter((id) => latest.get(id)?.status !== 'Eliminated'))
  return isUnionOfAtoms(live, ctx.guard.atoms, managerOfLatest(ctx.all.positions))
}

/** A target row's date (blank: the fiscal year's last day). */
export const dateOfTarget = (t: TargetRow): ISODate => targetDateOf(t)

/** The fiscal year's last day. */
export const yearEnd = (fy: FiscalYear): ISODate => fyRange(fy).end

const usesMemo = new WeakMap<object, Map<string, readonly FieldRef[]>>()

/**
 * A metric's lineage with the optional fields that hold no data left out (the template app's
 * `resolveLineage`): a blank optional column (a target date, a department on a unit's target) is a
 * valid value, not a field the figure reads, so it never holds the figure below the data standard.
 * Required fields always stay. Memoized per quality index and metric.
 */
export function presentUses(
  ctx: Pick<AnalyticsContext, 'quality' | 'metrics'>,
  metricId: string,
): readonly FieldRef[] {
  let byId = usesMemo.get(ctx.quality)
  if (!byId) {
    byId = new Map()
    usesMemo.set(ctx.quality, byId)
  }
  let hit = byId.get(metricId)
  if (!hit) {
    hit = ctx.metrics
      .usesOf(metricId)
      .filter((r) => fieldDefOf(r)?.required === true || ctx.quality.fieldStats(r).filled > 0)
    byId.set(metricId, hit)
  }
  return hit
}

/** Pending (Submitted, In review or Sent back) requests among those given. */
export const pendingOf = (requests: readonly HcRequest[]): HcRequest[] =>
  requests.filter((r) => r.state === 'Submitted' || r.state === 'In review' || r.state === 'Sent back')
