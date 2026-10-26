/**
 * Targets > Sub-org targets (docs/PLAN.md 6.9, 7.2 rule 8, 9.4, 9.6), read only in M2: a parent org's
 * target split into its direct sub-orgs, what is left unallocated, and the requests waiting on a
 * Finance envelope exception. Each sub-org row is the value the Leader home's My list, its bullet per
 * sub-org and the `targets:suborg-over` item read.
 *
 * - The parent: a Leader's (or Manager's) own seat in a tree scope; the seat a leader filter picks;
 *   otherwise each business unit in scope, headed by its top seat (the seat whose manager sits outside
 *   the unit), or by the unit itself when it has more than one top seat.
 * - A sub-org is a direct report seat and every position below it. Its target is a target row keyed
 *   by that seat (`leaderPositionId`); the parent's is the target of exactly the parent's org
 *   (`ownTargetOf`: a row keyed by its seat, else the unit's row when the seat is the unit's one top
 *   seat), never a wider org's, so a director with no target of their own has nothing to split and
 *   no Unallocated.
 * - A sub-org carries a cost target only when it is a whole union of cost atoms (6.9); others get
 *   heads targets only. Its asks cost shows under the mode's rules (./cost.ts).
 * - Over (7.2 rule 8): asks at the target date above the sub-org's heads target, or, where it has a
 *   cost target, the rounded asks cost (`guardedUsd`, the same in every mode) above it; heads only
 *   for a sub-org whose rounded cost reads "—".
 * - Unallocated = the parent's target − Σ its sub-orgs' targets, in heads and target cost (an input,
 *   rounded down to the cost step in HRBP and Leader mode).
 */
import type { Column } from '@/charts/types'
import type { Kpi } from '@/components/types'
import type { TargetRow } from '@/data/schema'
import { type CalcSpec, calcInput, calcStep, costCalc } from '@/drill/calc'
import { requestRecord } from '@/drill/requestRecord'
import { workerNames } from '@/drill/seats'
import { drillSpec, type RequestRecord } from '@/drill/types'
import { fmt, plural } from '@/lib/format'
import type { FigureData } from '../../types'
import { ID } from '../metrics'
import { orgInScope, ownTargetOf, type Prep, seatLabel, shownTargetCost, unitHeads } from './base'
import { type OrgAsksCost, orgAsksCost } from './cost'
import { TARGETS_FIGURES } from './figures'
import { type AsksParts, asksParts, requestsDrill, seatsDrill } from './gap'
import type { SubOrgRow } from './index'
import { dateOfTarget, fieldOrg, leaderOrg, type OrgDef, yearEnd } from './working'

/** A parent org and its direct sub-orgs. */
export interface ParentOrg {
  key: string
  label: string
  businessUnit: string
  org: OrgDef
  target: TargetRow | null
  subOrgs: { positionId: string; label: string; org: OrgDef }[]
}

/** What is left of a parent's target once its sub-orgs' targets are taken out. */
export interface UnallocatedRow {
  parentKey: string
  parent: string
  targetHeads: number | null
  allocatedHeads: number
  unallocatedHeads: number | null
  targetCostUsd: number | null
  allocatedCostUsd: number | null
  unallocatedCostUsd: number | null
}

/** A sub-org row with what its cells drill to. */
export interface SubOrgFacts {
  row: SubOrgRow
  parent: ParentOrg
  org: OrgDef
  target: TargetRow | null
  parts: AsksParts
  cost: OrgAsksCost
}

const live = (p: Prep, id: string): boolean => {
  const r = p.latest.get(id)
  return !!r && r.status !== 'Eliminated'
}

/** Live direct reports of a seat by latest rows, optionally within one unit. */
function childrenOf(p: Prep, head: string, unit?: string): string[] {
  const out: string[] = []
  for (const [id, r] of p.latest)
    if (r.managerPositionId === head && id !== head && live(p, id) && (!unit || r.businessUnit === unit))
      out.push(id)
  return out.sort()
}

const subOrg = (p: Prep, id: string) => ({
  positionId: id,
  label: seatLabel(p, id),
  org: leaderOrg(p.ctx.all.positions, id),
})

/** The parent orgs the scope and filters reach (see the module comment). */
export function parentsOf(p: Prep): ParentOrg[] {
  const { ctx } = p
  const positions = ctx.all.positions
  const scope = ctx.access.scope
  if (ctx.access.unset) return []
  if (scope?.kind === 'tree') {
    return [...scope.rootPositionIds].sort().map((root) => {
      const subs = scope.subOrgs
        .filter((s) => p.latest.get(s.positionId)?.managerPositionId === root)
        .map((s) => ({ positionId: s.positionId, label: s.label, org: leaderOrg(positions, s.positionId) }))
      return {
        key: `tree:${root}`,
        label: scope.label,
        businessUnit: p.latest.get(root)?.businessUnit ?? '',
        org: leaderOrg(positions, root),
        target: ownTargetOf(p, root),
        subOrgs: subs,
      }
    })
  }
  const leader = ctx.filters.leaderId
  if (leader && ctx.filters.modes.leaderId !== 'exclude' && p.latest.has(leader)) {
    return [
      {
        key: `tree:${leader}`,
        label: seatLabel(p, leader),
        businessUnit: p.latest.get(leader)?.businessUnit ?? '',
        org: leaderOrg(positions, leader),
        target: ownTargetOf(p, leader),
        subOrgs: childrenOf(p, leader).map((id) => subOrg(p, id)),
      },
    ]
  }
  const units = [...new Set(ctx.data.positions.map((r) => p.latest.get(r.positionId)?.businessUnit))]
    .filter((u): u is string => !!u)
    .sort()
  const out: ParentOrg[] = []
  for (const unit of units) {
    const heads = unitHeads(p, unit)
    if (!heads.length) continue
    const unitTarget =
      p.targets.find(
        (t) => t.businessUnit === unit && !t.department && !t.costCenter && !t.leaderPositionId,
      ) ?? null
    if (heads.length === 1) {
      const head = heads[0]
      out.push({
        key: `tree:${head}`,
        label: `${unit} (${p.holderOf(head) ?? 'vacant'})`,
        businessUnit: unit,
        org: leaderOrg(positions, head),
        // The unit's one top seat heads the whole unit: its own row, else the unit's.
        target: ownTargetOf(p, head) ?? unitTarget,
        subOrgs: childrenOf(p, head, unit).map((id) => subOrg(p, id)),
      })
    } else
      out.push({
        key: `unit:${unit}`,
        label: unit,
        businessUnit: unit,
        org: fieldOrg(positions, 'unit', unit, null),
        target: unitTarget,
        subOrgs: heads.map((id) => subOrg(p, id)),
      })
  }
  return out
}

const FACTS = new WeakMap<SubOrgRow, SubOrgFacts>()

/** What a sub-org row was built from (its seats and requests), for the item's drill. */
export const subOrgFactsOf = (row: SubOrgRow): SubOrgFacts | undefined => FACTS.get(row)

/** Every sub-org row of the parents, with its asks, target, cost and the over flag. */
export function subOrgRows(p: Prep, parents: readonly ParentOrg[]): SubOrgFacts[] {
  const out: SubOrgFacts[] = []
  for (const parent of parents) {
    for (const s of parent.subOrgs) {
      if (!orgInScope(p, s.org)) continue
      const target = p.targets.find((t) => t.leaderPositionId === s.positionId) ?? null
      const date = target
        ? dateOfTarget(target)
        : parent.target
          ? dateOfTarget(parent.target)
          : yearEnd(p.fiscalYear)
      const parts = asksParts(p, s.org, date)
      const cost = orgAsksCost(p, s.org, true)
      const rawCostTarget = cost.union ? (target?.targetCost ?? null) : null
      const targetCostUsd = shownTargetCost(p, rawCostTarget)
      const targetHeads = target?.targetHeads ?? null
      const overHeads = targetHeads != null && parts.heads > targetHeads
      const overCost = rawCostTarget != null && cost.guardedUsd != null && cost.guardedUsd > rawCostTarget
      out.push({
        row: {
          positionId: s.positionId,
          label: s.label,
          parentKey: parent.key,
          parent: parent.label,
          targetDate: date,
          heads: parts.seats.length,
          pendingHeads: parts.heads - parts.seats.length,
          asksHeads: parts.heads,
          targetHeads,
          gapHeads: targetHeads == null ? null : targetHeads - parts.heads,
          targetCostUsd,
          asksCostUsd: cost.usd,
          gapCostUsd: targetCostUsd != null && cost.usd != null ? targetCostUsd - cost.usd : null,
          over: overHeads || overCost,
          overCost,
          overText: overHeads || overCost ? 'Yes' : 'No',
          reason: cost.reason,
        },
        parent,
        org: s.org,
        target,
        parts,
        cost,
      })
      FACTS.set(out[out.length - 1].row, out[out.length - 1])
    }
  }
  return out
}

/** Each parent's unallocated target. */
export function unallocatedRows(
  p: Prep,
  parents: readonly ParentOrg[],
  subs: readonly SubOrgFacts[],
): UnallocatedRow[] {
  return parents.map((parent) => {
    const mine = subs.filter((s) => s.parent === parent)
    const allocated = mine.reduce((n, s) => n + (s.target?.targetHeads ?? 0), 0)
    const targetHeads = parent.target?.targetHeads ?? null
    const rawCost = parent.target?.targetCost ?? null
    const allocatedCost = mine.reduce((n, s) => n + (s.cost.union ? (s.target?.targetCost ?? 0) : 0), 0)
    return {
      parentKey: parent.key,
      parent: parent.label,
      targetHeads,
      allocatedHeads: allocated,
      unallocatedHeads: targetHeads == null ? null : targetHeads - allocated,
      targetCostUsd: shownTargetCost(p, rawCost),
      allocatedCostUsd: shownTargetCost(p, allocatedCost),
      unallocatedCostUsd: rawCost == null ? null : shownTargetCost(p, rawCost - allocatedCost),
    }
  })
}

/** The Unallocated tile (`targets.subOrg.unallocated`), on the Gap tab (the Leader home's) and here. */
export function unallocatedKpi(p: Prep, id: string, rows: readonly UnallocatedRow[]): Kpi {
  // The tile and its card are heads only: they read no target cost (B4 follow-up, the homes re-link it).
  const uses = p.uses(ID.subOrgUnallocated).filter((r) => r !== 'targets.targetCost')
  const known = rows.filter((r) => r.unallocatedHeads != null)
  const value = known.length ? known.reduce((n, r) => n + (r.unallocatedHeads as number), 0) : null
  const targets = known.reduce((n, r) => n + (r.targetHeads as number), 0)
  const allocated = known.reduce((n, r) => n + r.allocatedHeads, 0)
  const card = (): CalcSpec => ({
    title: `Unallocated, ${p.ctx.scopeLabel}`,
    subtitle: `${p.fiscalYear} targets`,
    metricId: ID.subOrgUnallocated,
    value,
    format: 'int',
    inputs: [
      calcInput('Parent targets', value == null ? null : targets, 'int', `${p.fiscalYear} targets`),
      calcInput('Sub-org targets', value == null ? null : allocated, 'int', `${p.fiscalYear} targets`),
    ],
    steps: [
      calcStep(
        'Unallocated = parent targets − Σ sub-org targets',
        value == null ? '—' : `${fmt(targets, 'int')} − ${fmt(allocated, 'int')}`,
        value,
        'int',
      ),
    ],
    uses,
  })
  return {
    id,
    metricId: ID.subOrgUnallocated,
    label: 'Unallocated',
    value,
    format: 'int',
    note: `${plural(known.length, 'parent org')} with a target`,
    definition: p.definition(ID.subOrgUnallocated),
    formula:
      value == null
        ? undefined
        : `${fmt(targets, 'int')} parent target heads − ${fmt(allocated, 'int')} split into sub-orgs.`,
    calc: card,
    uses,
  }
}

/** The sub-org table. */
export function subOrgFigure(p: Prep, facts: readonly SubOrgFacts[]): FigureData<SubOrgRow> {
  const byRow = new Map(facts.map((f) => [f.row, f]))
  const of = (r: SubOrgRow) => byRow.get(r) as SubOrgFacts
  const columns: Column<SubOrgRow>[] = [
    { key: 'label', label: 'Sub-org' },
    { key: 'parent', label: 'Parent org' },
    { key: 'targetDate', label: 'Target date', format: 'date' },
    {
      key: 'heads',
      label: 'Working seats',
      format: 'int',
      drill: (r) => () => seatsDrill(p, `Working seats, ${r.label}`, of(r).parts.seats),
    },
    {
      key: 'pendingHeads',
      label: 'Pending requests',
      format: 'int',
      drill: (r) => () =>
        requestsDrill(
          p,
          `Pending requests, ${r.label}`,
          of(r).parts.requests,
          'Each pending request counts as its head effect at the target date.',
          ID.asksHeads,
        ),
    },
    { key: 'asksHeads', label: 'Asks', format: 'int' },
    { key: 'targetHeads', label: 'Target heads', format: 'int' },
    { key: 'gapHeads', label: 'Gap', format: 'int' },
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
                title: `Asks cost, ${r.label}`,
                subtitle: `${p.fiscalYear} Working and pending requests`,
                metricId: ID.asksCost,
                figure: fig,
                uses: p.uses(ID.asksCost),
              })
          : null
      },
    },
    { key: 'gapCostUsd', label: 'Cost gap (USD)', format: p.money, cost: true },
    { key: 'overText', label: 'Over target' },
    { key: 'reason', label: 'Note' },
  ]
  const rows = facts.map((f) => f.row)
  return {
    id: TARGETS_FIGURES.suborgs,
    metric: ID.gapHeads,
    title: 'Sub-orgs against their targets',
    subtitle: `${p.fiscalYear} · asks at each target date`,
    rows,
    columns,
    note: 'A sub-org carries a cost target only when it is made of whole cost atoms; the others have heads targets only.',
    empty: rows.length ? null : 'No sub-orgs in this scope.',
    uses: p.uses(ID.gapHeads),
  }
}

/** The unallocated table. */
export function unallocatedFigure(p: Prep, rows: readonly UnallocatedRow[]): FigureData<UnallocatedRow> {
  return {
    id: TARGETS_FIGURES.unallocated,
    metric: ID.subOrgUnallocated,
    title: 'Unallocated by parent org',
    subtitle: `${p.fiscalYear} · parent target less its sub-orgs' targets`,
    rows,
    columns: [
      { key: 'parent', label: 'Parent org' },
      { key: 'targetHeads', label: 'Target heads', format: 'int' },
      { key: 'allocatedHeads', label: 'Split into sub-orgs', format: 'int' },
      { key: 'unallocatedHeads', label: 'Unallocated heads', format: 'int' },
      { key: 'targetCostUsd', label: 'Target cost (USD)', format: p.money, cost: true },
      { key: 'allocatedCostUsd', label: 'Split into sub-orgs (USD)', format: p.money, cost: true },
      { key: 'unallocatedCostUsd', label: 'Unallocated cost (USD)', format: p.money, cost: true },
    ],
    note: null,
    empty: rows.length ? null : 'No parent org in this scope.',
    uses: p.uses(ID.subOrgUnallocated),
  }
}

/** Pending requests in scope waiting on a Finance step for a move past a sub-org's cost envelope. */
export function envelopeExceptions(p: Prep): RequestRecord[] {
  const names = workerNames(p.ctx)
  const out: RequestRecord[] = []
  for (const r of p.pending) {
    if (!r.steps.some((s) => s.role === 'finance' && s.reasons.includes('envelope-exception'))) continue
    const seats = [
      r.positionId,
      r.managerPositionId,
      r.transfer?.fromPositionId,
      r.transfer?.toManagerPositionId,
    ]
    if (!seats.some((id) => !!id && p.selected.has(id))) continue
    const rec = requestRecord(r, {
      viewer: p.viewer,
      asOf: p.ctx.asOf,
      nameOf: (id) => names.get(id) ?? null,
    })
    if (rec) out.push(rec)
  }
  return out
}

/** The envelope exceptions figure. */
export function exceptionsFigure(p: Prep, rows: readonly RequestRecord[]): FigureData<RequestRecord> {
  return {
    id: TARGETS_FIGURES.exceptions,
    metric: ID.subOrgUnallocated,
    title: 'Envelope exceptions waiting on Finance',
    subtitle: 'Moves past a sub-org’s cost envelope need a Finance exception',
    rows,
    columns: [
      { key: 'requestId', label: 'Request' },
      { key: 'type', label: 'Type' },
      { key: 'state', label: 'State' },
      { key: 'positionId', label: 'Position ID' },
      { key: 'jobTitle', label: 'Title', freeText: true },
      { key: 'businessUnit', label: 'Business unit' },
    ],
    note: null,
    empty: rows.length ? null : 'No request is waiting on an envelope exception.',
    uses: p.uses(ID.subOrgUnallocated),
  }
}

/** The Sub-org targets tab's KPIs: parent target heads, the sub-orgs' asks and Unallocated. */
export function subOrgKpis(
  p: Prep,
  parents: readonly ParentOrg[],
  subs: readonly SubOrgFacts[],
  unallocated: Kpi,
): Kpi[] {
  const withTarget = parents.filter((x) => x.target)
  const targets = withTarget.reduce((n, x) => n + (x.target as TargetRow).targetHeads, 0)
  const asks = subs.reduce((n, s) => n + s.row.asksHeads, 0)
  const seats = subs.reduce((n, s) => n + s.row.heads, 0)
  return [
    {
      id: 'targets-suborgs-target',
      metricId: ID.targetHeads,
      label: 'Parent target heads',
      value: withTarget.length ? targets : null,
      format: 'int',
      note: plural(withTarget.length, 'parent org'),
      definition: p.definition(ID.targetHeads),
      drill: () =>
        drillSpec({
          kind: 'targets',
          title: `Parent targets, ${p.ctx.scopeLabel}`,
          rows: [...new Set(withTarget.map((x) => x.target as TargetRow))].map((t) =>
            t.targetCost == null ? t : { ...t, targetCost: shownTargetCost(p, t.targetCost) },
          ),
          weight: (t) => t.targetHeads,
          uses: p.uses(ID.targetHeads),
        }),
      uses: p.uses(ID.targetHeads),
    },
    {
      id: 'targets-suborgs-asks',
      metricId: ID.asksHeads,
      label: 'Sub-orgs’ asks',
      value: subs.length ? asks : null,
      format: 'int',
      note: plural(subs.length, 'sub-org'),
      definition: p.definition(ID.asksHeads),
      calc: () => ({
        title: `Sub-orgs’ asks, ${p.ctx.scopeLabel}`,
        metricId: ID.asksHeads,
        value: subs.length ? asks : null,
        format: 'int',
        inputs: [
          calcInput('Working seats counted', seats, 'int', `${p.fiscalYear} Working`),
          calcInput('Head effect of pending requests', asks - seats, 'int', 'Requests you can see'),
        ],
        steps: [
          calcStep(
            'Asks = seats + pending head effect',
            `${fmt(seats, 'int')} + ${fmt(asks - seats, 'int')}`,
            subs.length ? asks : null,
            'int',
          ),
        ],
        uses: p.uses(ID.asksHeads),
      }),
      uses: p.uses(ID.asksHeads),
    },
    unallocated,
  ]
}
