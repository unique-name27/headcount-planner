/**
 * Targets > Gap (docs/PLAN.md 6.9, 9.4, 11.5): each target row of the fiscal year against its asks
 * at the target date, in heads and cost, with the heads trades add (`targets.trades.heads`), and the
 * tab's KPIs: Target heads, Asks, Gap (heads), Target cost, Gap (cost) and Unallocated.
 *
 * - Asks (heads) = Working seats Filled, Open or Planned on the target date with a start on or before
 *   it, plus the head effect of each pending request the viewer may see that takes effect by then
 *   (C2: a pending elimination subtracts). The two parts drill apart: the seats as positions, the
 *   requests with their head effect as "Counts as" (a weighted drill), so each drill adds up to its
 *   cell.
 * - Heads from trades: pending trades by their head effect at the target date (seats received − Open
 *   or Planned seats given; an On hold seat given counts 0), plus approved trades of the year by the
 *   seats they created in the org that count then, less the Open or Planned seats they gave from it.
 * - Cost: ./cost.ts (the guard by mode; Finance's org-row rule below the unit).
 * - The KPIs add up the rows no other shown row holds (a unit row holds its departments' rows), so a
 *   sub-unit row is never counted twice.
 */
import type { Column } from '@/charts/types'
import type { Kpi } from '@/components/types'
import type { TargetRow } from '@/data/schema'
import { type CalcSpec, calcInput, calcStep, costCalc } from '@/drill/calc'
import { requestRecord } from '@/drill/requestRecord'
import { seatIndex, workerNames } from '@/drill/seats'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { fmt, plural } from '@/lib/format'
import { headEffect, seatWorkerType, targetKindOf } from '@/plan/engine/targets'
import { seatOn } from '@/plan/engine/versions'
import type { HcRequest, Position } from '@/plan/types'
import type { FigureData } from '../../types'
import { ID } from '../metrics'
import { type Prep, shownTargetCost, shownTargetRow, targetLabel, targetOrg, targetShows } from './base'
import { type OrgAsksCost, orgAsksCost, unionFigure } from './cost'
import { TARGETS_FIGURES } from './figures'
import type { TargetGapRow, TargetOrgLevel } from './index'
import { dateOfTarget, type OrgDef } from './working'

/** What a row's asks are made of, for its drills and calculation card. */
export interface AsksParts {
  /** Working seats counted on the target date. */
  seats: Position[]
  /** Pending requests with a head effect at the date, and that effect. */
  requests: { request: HcRequest; heads: number }[]
  heads: number
}

/** A gap row with what its cells drill to (internal to the model). */
export interface GapRowFacts {
  row: TargetGapRow
  target: TargetRow
  org: OrgDef
  parts: AsksParts
  trades: { request: HcRequest; heads: number }[]
  cost: OrgAsksCost
}

const LEVEL_OF: Readonly<Record<ReturnType<typeof targetKindOf>, TargetOrgLevel>> = {
  unit: 'unit',
  department: 'department',
  'cost-center': 'costCenter',
  leader: 'leader',
}

const COUNTED = new Set(['Filled', 'Open', 'Planned'])

/** The org's asks at a date: the seats counted and each visible pending request's head effect. */
export function asksParts(p: Prep, org: OrgDef, date: string): AsksParts {
  const seats: Position[] = []
  const index = seatIndex(p.ctx)
  for (const id of p.actx.positionIds) {
    const s = p.actx.seatOn(id, date)
    if (!s || !COUNTED.has(s.status) || (s.start != null && s.start > date)) continue
    if (s.status !== 'Filled' && seatWorkerType(s) !== 'Employee') continue
    if (!org.match(s.place, date)) continue
    const h = index.get(id)
    const state = h ? seatOn(h, date) : null
    if (state) seats.push(state.position)
  }
  const requests: { request: HcRequest; heads: number }[] = []
  let pendingHeads = 0
  for (const r of p.pending) {
    const heads = headEffect(r, org.match, date, p.actx)
    if (heads === 0) continue
    requests.push({ request: r, heads })
    pendingHeads += heads
  }
  return { seats, requests, heads: seats.length + pendingHeads }
}

/** Heads trades add to the org at the date: pending by head effect, approved by their seats. */
export function tradeHeads(p: Prep, org: OrgDef, date: string): { request: HcRequest; heads: number }[] {
  const out: { request: HcRequest; heads: number }[] = []
  const index = seatIndex(p.ctx)
  for (const r of p.visible) {
    if (r.type !== 'Trade' || !r.trade) continue
    let heads = 0
    if (r.state === 'Submitted' || r.state === 'In review' || r.state === 'Sent back') {
      heads = headEffect(r, org.match, date, p.actx)
    } else if (r.state === 'Approved' || r.state === 'Approved with changes') {
      for (const id of r.outcome?.createdPositionIds ?? []) {
        const s = p.actx.seatOn(id, date)
        if (s && COUNTED.has(s.status) && (s.start == null || s.start <= date) && org.match(s.place, date))
          heads++
      }
      for (const id of r.trade.givePositionIds) {
        const h = index.get(id)
        const last = h?.rows.find((x) => x.status === 'Eliminated')?.endDate ?? null
        const before = h && last ? seatOn(h, last) : null
        if (
          before &&
          (before.status === 'Open' || before.status === 'Planned') &&
          before.approvedHead &&
          org.match(
            {
              positionId: id,
              managerPositionId: before.position.managerPositionId,
              businessUnit: before.position.businessUnit,
              department: before.position.department,
              costCenter: before.position.costCenter,
            },
            last as string,
          )
        )
          heads--
      }
    }
    if (heads !== 0) out.push({ request: r, heads })
  }
  return out
}

const rowsMemo = new WeakMap<Prep, GapRowFacts[]>()

/** The year's target rows the scope and filters reach, each with its asks, gap and cost (cached). */
export function gapRows(p: Prep): GapRowFacts[] {
  const hit = rowsMemo.get(p)
  if (hit) return hit
  const out: GapRowFacts[] = []
  for (const t of p.targets) {
    const org = targetOrg(p, t)
    if (!targetShows(p, t, org)) continue
    const date = dateOfTarget(t)
    const parts = asksParts(p, org, date)
    const trades = tradeHeads(p, org, date)
    const level = LEVEL_OF[targetKindOf(t)]
    const cost = orgAsksCost(p, org, level !== 'unit')
    const targetCostUsd = shownTargetCost(p, t.targetCost)
    const gapCost = targetCostUsd != null && cost.usd != null ? targetCostUsd - cost.usd : null
    out.push({
      row: {
        orgKey: org.key,
        org: targetLabel(p, t),
        level,
        targetDate: date,
        targetHeads: t.targetHeads,
        asksHeads: parts.heads,
        workingHeads: parts.seats.length,
        pendingHeads: parts.heads - parts.seats.length,
        gapHeads: t.targetHeads - parts.heads,
        gapText: gapWords(t.targetHeads - parts.heads),
        tradesHeads: trades.reduce((n, x) => n + x.heads, 0),
        targetCostUsd,
        asksCostUsd: cost.usd,
        gapCostUsd: gapCost,
        reason: cost.reason,
      },
      target: t,
      org,
      parts,
      trades,
      cost,
    })
  }
  const rank = { unit: 0, department: 1, costCenter: 2, leader: 3 } as const
  out.sort(
    (a, b) =>
      a.target.businessUnit.localeCompare(b.target.businessUnit) ||
      rank[a.row.level] - rank[b.row.level] ||
      a.row.org.localeCompare(b.row.org),
  )
  rowsMemo.set(p, out)
  return out
}

/** A gap in heads as words: "18 over" when asks exceed the target, "3 under", or "On target" at 0 (CP-11). */
export const gapWords = (gap: number): string =>
  gap === 0 ? 'On target' : gap < 0 ? `${fmt(-gap, 'int')} over` : `${fmt(gap, 'int')} under`

/** The rows no other shown row holds (a unit row holds its departments'): what the KPIs add up. */
export function topRows(rows: readonly GapRowFacts[]): GapRowFacts[] {
  const holds = (a: GapRowFacts, b: GapRowFacts) => {
    if (a === b || a.org.positionIds.size <= b.org.positionIds.size) return false
    for (const id of b.org.positionIds) if (!a.org.positionIds.has(id)) return false
    return true
  }
  return rows.filter((r) => !rows.some((o) => holds(o, r)))
}

/* ───────────── drills and cards ───────────── */

/** The seats counted in the asks, as positions. */
export function seatsDrill(p: Prep, title: string, seats: readonly Position[]): DrillSpec<'positions'> {
  return drillSpec({
    kind: 'positions',
    title,
    subtitle: `${p.fiscalYear} Working · ${p.ctx.scopeLabel}`,
    rows: seats,
    note: 'Working seats Filled, Open or Planned on the target date, with a start on or before it.',
    uses: p.uses(ID.asksHeads),
  })
}

/** Pending requests with their head effect as "Counts as": the weights add up to the pending part. */
export function requestsDrill(
  p: Prep,
  title: string,
  list: readonly { request: HcRequest; heads: number }[],
  note: string,
  metricId: string,
): DrillSpec<'requests'> {
  const names = workerNames(p.ctx)
  const weights = new Map<object, number>()
  const rows = []
  for (const { request, heads } of list) {
    const rec = requestRecord(request, {
      viewer: p.viewer,
      asOf: p.ctx.asOf,
      nameOf: (id) => names.get(id) ?? null,
    })
    if (!rec) continue
    weights.set(rec, heads)
    rows.push(rec)
  }
  return drillSpec({
    kind: 'requests',
    title,
    subtitle: `${p.fiscalYear} · ${p.ctx.scopeLabel}`,
    rows,
    note,
    uses: p.uses(metricId),
    weight: (r) => weights.get(r) ?? 0,
  })
}

/** The target rows behind a KPI, as the mode shows them, each counting as its heads or cost. */
function targetsDrill(
  p: Prep,
  title: string,
  rows: readonly GapRowFacts[],
  by: 'heads' | 'cost',
): DrillSpec<'targets'> {
  const shown = rows.map((r) => shownTargetRow(p, r.target))
  return drillSpec({
    kind: 'targets',
    title,
    subtitle: `${p.fiscalYear} · ${p.ctx.scopeLabel}`,
    rows: shown,
    uses: p.uses(by === 'heads' ? ID.targetHeads : ID.targetCost),
    weight: (t) => (by === 'heads' ? t.targetHeads : (t.targetCost ?? 0)),
  })
}

/** The asks calculation card: seats counted plus the pending head effects. */
function asksCard(
  p: Prep,
  label: string,
  seats: number,
  pending: number,
  uses = p.uses(ID.asksHeads),
): CalcSpec {
  return {
    title: `Asks, ${label}`,
    subtitle: `${p.fiscalYear} Working · ${p.ctx.scopeLabel}`,
    metricId: ID.asksHeads,
    value: seats + pending,
    format: 'int',
    inputs: [
      calcInput('Working seats counted on the target date', seats, 'int', `${p.fiscalYear} Working`),
      calcInput('Head effect of pending requests by then', pending, 'int', 'Requests you can see'),
    ],
    steps: [
      calcStep(
        'Asks = seats + pending head effect',
        `${fmt(seats, 'int')} + ${fmt(pending, 'int')}`,
        seats + pending,
        'int',
      ),
    ],
    uses,
  }
}

/** A gap card: target − asks, in heads or cost. */
function gapCard(
  p: Prep,
  label: string,
  target: number | null,
  asks: number | null,
  unit: 'heads' | 'cost',
  note?: string | null,
): CalcSpec {
  const format = unit === 'heads' ? 'int' : p.money
  const value = target != null && asks != null ? target - asks : null
  return {
    title: unit === 'heads' ? `Gap, ${label}` : `Cost gap, ${label}`,
    subtitle: `${p.fiscalYear} · ${p.ctx.scopeLabel}`,
    metricId: unit === 'heads' ? ID.gapHeads : ID.gapCost,
    value,
    format,
    inputs: [
      calcInput(unit === 'heads' ? 'Target heads' : 'Target cost', target, format, 'Targets'),
      calcInput(
        unit === 'heads' ? 'Asks' : 'Asks cost',
        asks,
        format,
        `${p.fiscalYear} Working and pending requests`,
      ),
    ],
    steps: [
      calcStep(
        'Gap = target − asks',
        value == null ? '—' : `${fmt(target, format)} − ${fmt(asks, format)}`,
        value,
        format,
      ),
    ],
    ...(note ? { note } : {}),
    uses: p.uses(unit === 'heads' ? ID.gapHeads : ID.gapCost),
  }
}

/* ───────────── the figure and the strip ───────────── */

/** The Gap table: one row per target org. */
export function gapFigure(p: Prep, facts: readonly GapRowFacts[]): FigureData<TargetGapRow> {
  const byRow = new Map(facts.map((f) => [f.row, f]))
  const of = (r: TargetGapRow) => byRow.get(r) as GapRowFacts
  const columns: Column<TargetGapRow>[] = [
    { key: 'org', label: 'Org' },
    { key: 'level', label: 'Kind' },
    { key: 'targetDate', label: 'Target date', format: 'date' },
    { key: 'targetHeads', label: 'Target heads', format: 'int' },
    {
      key: 'asksHeads',
      label: 'Asks',
      format: 'int',
      calc: (r) => () => asksCard(p, r.org, r.workingHeads, r.pendingHeads),
    },
    {
      key: 'workingHeads',
      label: 'Working seats',
      format: 'int',
      drill: (r) => () => seatsDrill(p, `Working seats counted in the asks, ${r.org}`, of(r).parts.seats),
    },
    {
      key: 'pendingHeads',
      label: 'Pending requests',
      format: 'int',
      drill: (r) => () =>
        requestsDrill(
          p,
          `Pending requests in the asks, ${r.org}`,
          of(r).parts.requests,
          'Each pending request counts as its head effect at the target date.',
          ID.asksHeads,
        ),
    },
    {
      key: 'gapHeads',
      label: 'Gap',
      format: 'int',
      calc: (r) => () => gapCard(p, r.org, r.targetHeads, r.asksHeads, 'heads'),
    },
    {
      key: 'tradesHeads',
      label: 'Heads from trades',
      format: 'int',
      drill: (r) => () =>
        requestsDrill(
          p,
          `Trades in ${r.org}`,
          of(r).trades,
          'Each trade counts as the seats it receives less the Open or Planned seats it gives.',
          ID.tradesHeads,
        ),
    },
    { key: 'targetCostUsd', label: 'Target cost (USD)', format: p.money, cost: true },
    {
      key: 'asksCostUsd',
      label: 'Asks cost (USD)',
      format: p.money,
      cost: true,
      calc: (r) => {
        const fig = of(r).cost.figure
        return fig
          ? () =>
              costCalc({
                title: `Asks cost, ${r.org}`,
                subtitle: `${p.fiscalYear} Working and pending requests`,
                metricId: ID.asksCost,
                figure: fig,
                uses: p.uses(ID.asksCost),
              })
          : null
      },
    },
    {
      key: 'gapCostUsd',
      label: 'Cost gap (USD)',
      format: p.money,
      cost: true,
      calc: (r) => () => gapCard(p, r.org, r.targetCostUsd, r.asksCostUsd, 'cost', r.reason),
    },
    { key: 'reason', label: 'Note' },
  ]
  const rows = facts.map((f) => f.row)
  return {
    id: TARGETS_FIGURES.gap,
    metric: ID.gapHeads,
    title: 'Gap by org',
    subtitle: `${p.fiscalYear} targets against asks at each target date`,
    rows,
    columns,
    note: wholeOrgNote(p),
    empty: rows.length ? null : noTargetsText(p),
    uses: p.uses(ID.gapHeads),
  }
}

/** Why there is nothing to show (a leader's org with no target of its own says how its requests are checked). */
export const noTargetsText = (p: Prep): string =>
  p.ctx.access.scope?.kind === 'tree'
    ? `No ${p.fiscalYear} target is set for this org. Requests in it are checked against the nearest target above it.`
    : `No ${p.fiscalYear} targets for this scope.`

/** Filters that pick part of an org change which rows show, never what a row counts. */
function wholeOrgNote(p: Prep): string | null {
  const f = p.ctx.filters
  const partial =
    f.location.length ||
    f.level.length ||
    f.costCenter.length ||
    f.legalEntity.length ||
    f.country.length ||
    f.currency.length
  return partial ? 'A target is for a whole org: each row counts its whole org, whatever the filters.' : null
}

/** The Gap tab's KPIs (9.4): Target heads, Asks, Gap (heads), Target cost, Gap (cost), Unallocated. */
export function gapKpis(p: Prep, facts: readonly GapRowFacts[], unallocated: Kpi): Kpi[] {
  const top = topRows(facts)
  const label = p.ctx.scopeLabel
  const targetHeads = top.reduce((n, f) => n + f.row.targetHeads, 0)
  const asks = top.reduce((n, f) => n + f.row.asksHeads, 0)
  const seats = top.reduce((n, f) => n + f.parts.seats.length, 0)
  const has = top.length > 0
  const costs = top.map((f) => f.cost)
  const fig = has ? unionFigure(p, costs) : null
  const asksCost = fig?.total.totalUsd ?? null
  const targetCosts = top.map((f) => f.row.targetCostUsd)
  const targetCost =
    has && targetCosts.every((c) => c != null) ? (targetCosts as number[]).reduce((a, b) => a + b, 0) : null
  const gapCost = targetCost != null && asksCost != null ? targetCost - asksCost : null
  const costReason = p.mode === 'none' ? null : (costs.find((c) => c.reason)?.reason ?? fig?.reason ?? null)
  const def = (id: string) => p.definition(id)
  const rows = `${plural(top.length, 'target')}`
  const kpis: Kpi[] = [
    {
      id: 'targets-target-heads',
      metricId: ID.targetHeads,
      label: 'Target heads',
      value: has ? targetHeads : null,
      format: 'int',
      note: rows,
      definition: def(ID.targetHeads),
      formula: `Σ target heads over ${rows}.`,
      drill: () => targetsDrill(p, `Targets, ${label}`, top, 'heads'),
      uses: p.uses(ID.targetHeads),
    },
    {
      id: 'targets-asks',
      metricId: ID.asksHeads,
      label: 'Asks',
      value: has ? asks : null,
      format: 'int',
      note: `${plural(seats, 'seat')}, ${fmt(asks - seats, 'int')} from pending requests`,
      definition: def(ID.asksHeads),
      // A count of 1 reads "1 head", and pending requests that remove heads subtract (the crawl's count
      // scan, fix step, loose ends: "+ -1 heads" before).
      formula: `${plural(seats, 'Working seat')} ${asks - seats < 0 ? '−' : '+'} ${plural(Math.abs(asks - seats), 'head')} from pending requests.`,
      calc: () => asksCard(p, label, seats, asks - seats),
      uses: p.uses(ID.asksHeads),
    },
    {
      id: 'targets-gap-heads',
      metricId: ID.gapHeads,
      label: 'Gap',
      value: has ? targetHeads - asks : null,
      format: 'int',
      goodDirection: 'up',
      note: has ? (targetHeads - asks < 0 ? 'Asks exceed the target' : 'Asks within the target') : undefined,
      definition: def(ID.gapHeads),
      formula: `${plural(targetHeads, 'target head')} − ${plural(asks, 'ask')}.`,
      calc: () => gapCard(p, label, has ? targetHeads : null, has ? asks : null, 'heads'),
      uses: p.uses(ID.gapHeads),
    },
    {
      id: 'targets-target-cost',
      metricId: ID.targetCost,
      label: 'Target cost',
      value: targetCost,
      format: p.money,
      ...(p.mode === 'rounded' ? { note: 'Rounded down per team' } : {}),
      definition: def(ID.targetCost),
      drill: () => targetsDrill(p, `Target cost, ${label}`, top, 'cost'),
      uses: p.uses(ID.targetCost),
    },
    {
      id: 'targets-gap-cost',
      metricId: ID.gapCost,
      label: 'Gap (cost)',
      value: gapCost,
      format: p.money,
      goodDirection: 'up',
      ...(gapCost == null && costReason ? { suppressed: true, suppressedNote: costReason } : {}),
      definition: def(ID.gapCost),
      calc: () => gapCard(p, label, targetCost, asksCost, 'cost', costReason),
      uses: p.uses(ID.gapCost),
    },
    unallocated,
  ]
  return kpis
}
