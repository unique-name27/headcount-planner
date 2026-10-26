/**
 * What Targets offers to change (docs/PLAN.md 6.9, 8.3 `target.set`, `target.split`, `target.move`,
 * `target.exception`, 9.4, 10.5; M3): Finance (and HR admin) sets an org's heads and cost target for
 * the fiscal year shown; a leader splits its org's target into sub-org targets and moves target
 * between two of them, inside its envelope (a split or move past it needs Finance); and the target
 * changes the audit log holds, as each mode may read them (`auditView`: a target's cost reads
 * "changed" outside HR admin). Every choice is a model value, so the views render it and compute
 * nothing; nothing here writes (the views run the named action through usePlanWrite, and the action
 * checks the policy and its rules again).
 *
 * Readings taken here (finance-ui builder, M3):
 *  - Set: only where `target.set` shows (Finance, HR admin), so no other mode's model holds a target's
 *    exact cost. The rows to edit are the year's target rows in view, each as stored; a new target may
 *    be set for any unit, department of a unit, cost center or leader seat (the freeze form's orgs).
 *  - Split and move: the parents are the tab's parent orgs headed by one seat (a leader's own org in
 *    a tree scope; a unit's one top seat) that have a target to split (the action's envelope: the
 *    seat's own target, or the unit's for a seat at the top of its unit). The sub-orgs are the action's
 *    (`ActionEnv.subOrgsOf`): the leader seats reporting into the parent's tree with no leader seat
 *    between. A sub-org's target cost shows as the mode shows a target cost (exact in Finance and HR
 *    admin, rounded down to the cost step in Leader mode); it may carry one only when it is a whole
 *    union of cost atoms (6.9), so the form asks heads only for the others.
 *  - Leaving a sub-org's cost blank in a split saves it with no cost target (heads only), as the action
 *    reads a null cost; the form says so beside a sub-org that has one.
 *  - Target changes: the audit log's 'target' entries of the year shown, through the Audit page's
 *    rule (`viewAuditRows`: the mode's scope, "changed" for cost), kept to the target rows the tab
 *    shows, newest first.
 */
import { contextLists } from '@/access/lists'
import { isLeaderSeat, leaderLevelSet } from '@/access/scopes/pickers'
import type { Column } from '@/charts/types'
import type { ISODate, PositionRow, TargetRow } from '@/data/schema'
import type { Format } from '@/lib/format'
import { targetKey } from '@/plan/engine/transfer'
import { type AuditListRow, viewAuditRows } from '@/views/audit/engine'
import {
  type FreezeOrgOption,
  orgOptions,
  type WriteAccess,
  writeAccess,
} from '@/views/finance/engine/writes'
import type { FigureData } from '../../types'
import { ID } from '../metrics'
import { type Prep, shownTargetCost, targetLabel, targetOrg, targetShows } from './base'
import { orgAsksCost } from './cost'
import { TARGETS_FIGURES } from './figures'
import type { ParentOrg } from './suborgs'
import { leaderOrg, yearEnd } from './working'

/* ───────────── Targets > Gap: set ───────────── */

/** One target row the form may change, as stored (Finance and HR admin only). */
export interface TargetEditRow {
  /** transfer.ts `targetKey`. */
  key: string
  label: string
  row: TargetRow
}

export interface TargetSetWrites {
  access: WriteAccess
  fiscalYear: TargetRow['fiscalYear']
  rows: readonly TargetEditRow[]
  /** Orgs a new target may be set for (units, departments, cost centers, leader seats). */
  orgs: readonly FreezeOrgOption[]
  /** The fiscal year's last day, the date a blank target date reads as. */
  yearEnd: ISODate
  /** How amounts print in this mode. */
  money: Format
}

/** Targets > Gap's write side. */
export function targetSetWrites(p: Prep): TargetSetWrites {
  const access = writeAccess(p.ctx, 'setTarget')
  const rows: TargetEditRow[] = access.shown
    ? p.targets
        .filter((t) => targetShows(p, t, targetOrg(p, t)))
        .map((t) => ({ key: targetKey(t), label: targetLabel(p, t), row: t }))
        .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
    : []
  return {
    access,
    fiscalYear: p.fiscalYear,
    rows,
    orgs: access.shown ? orgOptions(p.ctx) : [],
    yearEnd: yearEnd(p.fiscalYear),
    money: p.money,
  }
}

/* ───────────── Targets > Sub-org targets: split and move ───────────── */

/** One sub-org of a parent, as the split and move forms show it. */
export interface SubOrgChoice {
  /** The sub-org's leader seat. */
  leaderPositionId: string
  label: string
  /** Its target heads now, or null when it has no target. */
  targetHeads: number | null
  /** Its target cost as the mode shows a target cost (rounded down in Leader mode), or null. */
  targetCostUsd: number | null
  /** It may carry a cost target: a whole union of cost atoms (6.9). */
  costAllowed: boolean
}

/** One parent org a leader may split, with its envelope. */
export interface SplitChoice {
  parentLeaderPositionId: string
  parentLabel: string
  /** The envelope's heads and cost, as the mode shows a target cost. */
  envelopeHeads: number
  envelopeCostUsd: number | null
  children: readonly SubOrgChoice[]
}

export interface SubOrgWrites {
  fiscalYear: TargetRow['fiscalYear']
  split: { access: WriteAccess; choices: readonly SplitChoice[] }
  move: { access: WriteAccess; choices: readonly SplitChoice[] }
  /** Finance and HR admin may go past a sub-org's envelope (`target.exception`); a leader may not. */
  pastEnvelope: boolean
  /** How amounts print in this mode (rounded in Leader mode). */
  money: Format
  /** Target costs show rounded down to the cost step (Leader mode): saving sets the value typed. */
  costRounded: boolean
}

/**
 * The direct sub-orgs of a leader seat (pure, over latest position rows): the leader seats reporting
 * into its tree with no leader seat between, inside the seat's own business unit (review UI-8). A
 * parent's envelope is its own target, or its unit's for the unit's top seat, so a sub-org in another
 * unit (the CEO's unit heads under Executive Office's 7-head target) is never split from it, and no
 * leader-keyed row is written for another unit's top seat, which would replace that unit's target as
 * the seat's own envelope. The action's `ActionEnv.subOrgsOf` reads this same function.
 */
export function subOrgSeatsOf(
  latest: ReadonlyMap<string, PositionRow>,
  levels: ReturnType<typeof leaderLevelSet>,
  parent: string,
): string[] {
  const unit = latest.get(parent)?.businessUnit
  const children = new Map<string, string[]>()
  for (const [id, r] of latest) {
    const m = r.managerPositionId
    if (!m || m === id || r.businessUnit !== unit) continue
    const list = children.get(m) ?? []
    list.push(id)
    children.set(m, list)
  }
  const out: string[] = []
  const seen = new Set<string>([parent])
  const stack = [...(children.get(parent) ?? [])].sort().reverse()
  while (stack.length) {
    const id = stack.pop() as string
    if (seen.has(id)) continue
    seen.add(id)
    const r = latest.get(id) as PositionRow
    if (isLeaderSeat(r, levels)) out.push(id)
    else for (const c of [...(children.get(id) ?? [])].sort().reverse()) stack.push(c)
  }
  return out.sort()
}

/**
 * One sub-org's share as the split form sends it: `targetCost` absent keeps the stored cost target,
 * null removes it (review UI-2).
 */
export interface SplitChild {
  leaderPositionId: string
  targetHeads: number
  targetCost?: number | null
}

/**
 * The split form's input from its boxes (review UI-2): a sub-org with a heads value, its heads as
 * typed, and a cost only where the viewer changed its cost box (blank removes the cost target). A
 * cost box left as shown keeps the stored cost target: in exact modes the box holds that value and
 * sends it back; in Leader mode it holds the value rounded down, so it sends nothing, and a heads-only
 * change never rewrites a sibling's cost target to its rounded value. A sub-org that may carry no cost
 * target (not a whole union of cost atoms) never sends one, so a cost target Finance set stays.
 */
export function splitChildrenOf(
  choice: SplitChoice,
  writes: Pick<SubOrgWrites, 'costRounded'>,
  heads: Readonly<Record<string, string>>,
  costs: Readonly<Record<string, string>>,
  touched: ReadonlySet<string>,
): SplitChild[] {
  const out: SplitChild[] = []
  for (const c of choice.children) {
    const h = (heads[c.leaderPositionId] ?? '').trim()
    if (h === '') continue
    const child: SplitChild = { leaderPositionId: c.leaderPositionId, targetHeads: Number(h) }
    if (c.costAllowed && touched.has(c.leaderPositionId)) {
      const v = (costs[c.leaderPositionId] ?? '').trim()
      child.targetCost = v === '' ? null : Number(v)
    } else if (!writes.costRounded) child.targetCost = c.targetCostUsd
    out.push(child)
  }
  return out
}

/** The direct sub-orgs a split or move names (`subOrgSeatsOf` over the tab's rows and Lists). */
export function subOrgsOf(p: Prep, parent: string): string[] {
  return subOrgSeatsOf(p.latest, leaderLevelSet(contextLists(p.ctx)), parent)
}

/** The split and move choices over the tab's parents (see the module comment). */
export function subOrgWrites(p: Prep, parents: readonly ParentOrg[]): SubOrgWrites {
  const split = writeAccess(p.ctx, 'splitTarget')
  const move = writeAccess(p.ctx, 'moveTarget')
  const choices: SplitChoice[] = []
  if (split.shown || move.shown)
    for (const parent of parents) {
      if (!parent.key.startsWith('tree:') || !parent.target) continue
      const seat = parent.key.slice(5)
      const kids = subOrgsOf(p, seat)
      if (!kids.length) continue
      choices.push({
        parentLeaderPositionId: seat,
        parentLabel: parent.label,
        envelopeHeads: parent.target.targetHeads,
        envelopeCostUsd: shownTargetCost(p, parent.target.targetCost),
        children: kids.map((id) => {
          const t = p.targets.find((x) => x.leaderPositionId === id) ?? null
          const org = leaderOrg(p.ctx.all.positions, id)
          return {
            leaderPositionId: id,
            label: subOrgLabel(p, id),
            targetHeads: t?.targetHeads ?? null,
            targetCostUsd: shownTargetCost(p, t?.targetCost),
            costAllowed: orgAsksCost(p, org, true).union,
          }
        }),
      })
    }
  return {
    fiscalYear: p.fiscalYear,
    split: { access: split, choices: split.shown ? choices : [] },
    move: { access: move, choices: move.shown ? choices : [] },
    pastEnvelope: p.ctx.access.decide('action:target.exception').access !== 'hidden',
    money: p.money,
    costRounded: p.mode === 'rounded',
  }
}

/**
 * A sub-org by the parents' rule (review UI-13): "<unit> (<holder>)" for a unit's top seat; the
 * department when the seat's org is exactly that one department ("Design Verification (Dana Ito)");
 * otherwise the seat's title ("VP Architecture and Digital Design (Rahul Kamaraj)").
 */
export function subOrgLabel(p: Prep, id: string): string {
  const r = p.latest.get(id)
  const holder = p.holderOf(id) ?? 'vacant'
  if (!r) return `${id} (${holder})`
  const manager = r.managerPositionId ? p.latest.get(r.managerPositionId) : null
  if (!manager || manager.businessUnit !== r.businessUnit) return `${r.businessUnit} (${holder})`
  const depts = new Set<string>()
  for (const x of leaderOrg(p.ctx.all.positions, id).positionIds) {
    const d = p.latest.get(x)?.department
    if (d) depts.add(d)
  }
  if (r.department && depts.size === 1 && depts.has(r.department)) return `${r.department} (${holder})`
  return `${r.title || r.department || id} (${holder})`
}

/* ───────────── target changes (10.5: entries Finance sees in Targets) ───────────── */

/** One target change as the mode may read it. */
export interface TargetChangeRow extends AuditListRow {
  /** The org the target is for, in the tab's words. */
  org: string
  /** "Target heads", "Target cost", "Target date". */
  fieldLabel: string
}

const FIELD_LABEL: Readonly<Record<string, string>> = {
  targetHeads: 'Target heads',
  targetCost: 'Target cost',
  targetDate: 'Target date',
}

/** The target changes of the year shown, as the mode may read them, newest first. */
export function targetChanges(p: Prep): TargetChangeRow[] {
  const shown = new Map<string, TargetRow>()
  for (const t of p.targets) if (targetShows(p, t, targetOrg(p, t))) shown.set(targetKey(t), t)
  const entries = p.ctx.audit.filter((e) => e.object === 'target' && e.id.startsWith(`${p.fiscalYear}|`))
  const out: TargetChangeRow[] = []
  for (const r of viewAuditRows(p.ctx, entries)) {
    const t = shown.get(r.id)
    // A target row the tab does not show (another org's, or one a split took away) is left out.
    if (!t) continue
    out.push({ ...r, org: targetLabel(p, t), fieldLabel: FIELD_LABEL[r.field] ?? r.field })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/** The target changes figure (Targets > Gap). */
export function targetChangesFigure(p: Prep, rows: readonly TargetChangeRow[]): FigureData<TargetChangeRow> {
  const admin = p.ctx.mode === 'hr-admin'
  const columns: Column<TargetChangeRow>[] = [
    { key: 'at', label: 'When', format: 'date' },
    { key: 'byName', label: 'By' },
    { key: 'modeLabel', label: 'Mode' },
    { key: 'org', label: 'Org' },
    { key: 'fieldLabel', label: 'Changed' },
    { key: 'oldText', label: 'From' },
    { key: 'newText', label: 'To' },
  ]
  return {
    id: TARGETS_FIGURES.changes,
    metric: ID.targetHeads,
    title: 'Target changes',
    subtitle: `${p.fiscalYear} · who set, split or moved each target, newest first`,
    rows,
    columns,
    note: admin ? null : 'Cost values read "changed" outside HR admin.',
    empty: rows.length ? null : 'No target has been changed in the app yet.',
    uses: p.uses(ID.targetHeads),
  }
}
