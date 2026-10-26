/**
 * An org's asks cost under the cost guard (docs/PLAN.md 6.9, 7.2 rules 1, 3 and 8, 7.3, 7.4): the
 * fiscal year's loaded cost of the org's Working lines, plus each pending request's in-year band
 * effect as its own band part (a pending request never reads HRIS pay, an offer or severance), built
 * as the guard's members and shown by the mode's rules:
 *
 *  - Manager: no amount (the view is hidden there anyway).
 *  - HRBP and Leader (rounded): only for an org that is a whole union of cost atoms, as `sumRounded`
 *    over each atom's filled part and band part rounded down on its own, atoms under 5 costed people
 *    left out; `costFit`'s reason under the filters and period wins.
 *  - Finance, and HR admin with the switch off (exact): a unit row exactly, under the unit's one
 *    cost-center fold; an org below the unit only under the org-row rule (7.4, `Prep.orgCost`).
 *  - HR admin with the switch on (open): exact, no minimum.
 *
 * The comparison every over or under flag reads (7.2 rule 8, `guardedUsd`) is the rounded value in
 * every mode: never Finance's exact figure. An org that is not a union of atoms, or whose rounded cost
 * reads "—", compares heads only (null).
 *
 * Readings taken here (views-2 builder, M2):
 *  - A pending request's band effect on the org is split by the cost atom of each place it touches
 *    (its seat, its manager position, a trade's give seats, a transfer's two sides), so each atom's
 *    band part carries its own share; a new seat takes its manager position's atom (7.3a). The band
 *    member brings no costed people.
 *  - The requests counted are the pending ones the viewer may see (8.4 rule 6): what the screen
 *    shows is computed over the rows the viewer may see, the rule-8 comparison included.
 *  - A cost gap is the target (an input) less the asks cost, so it shows exactly when the asks cost
 *    does (and the row has a target cost).
 */
import { atomOf } from '@/cost/atoms'
import { NO_AMOUNTS_NOTE, WHOLE_TEAMS_NOTE } from '@/cost/fit'
import { ORG_COST_NOTE } from '@/cost/fold'
import { type CostMember, type CostSeat, type GuardedFigure, guardModel } from '@/cost/guard'
import { bandEffect } from '@/plan/engine/targets'
import type { HcRequest, OrgMatch, SeatPlace } from '@/plan/types'
import { gateFor } from '@/views/plan/engine/guarded'
import type { Prep } from './base'
import { managerOfLatest, membersOver, type OrgDef, orgIsUnion, workingLines } from './working'

/** An amount under half a cent is no effect. */
const EPS = 0.005

/** An org's asks cost as the mode shows it, and the rule-8 value. */
export interface OrgAsksCost {
  /** The guard's members: the org's Working lines over the year and the pending requests' band parts. */
  members: readonly CostMember[]
  /** The org is a whole union of the last close's cost atoms. */
  union: boolean
  /** The guard's figure for the mode, when it may show an amount (a calculation card reads it). */
  figure: GuardedFigure | null
  /** The asks cost as shown; null where it reads "—". */
  usd: number | null
  /** Why it reads "—", else null. */
  reason: string | null
  /** 7.2 rule 8: the rounded asks cost every mode compares a target with; null compares heads only. */
  guardedUsd: number | null
}

const memo = new WeakMap<Prep, Map<string, OrgAsksCost>>()

/** The org's Working members over the fiscal year (both parts). */
function lineMembers(p: Prep, org: OrgDef): CostMember[] {
  const all = membersOver(p.ctx, workingLines(p.ctx, p.frame), p.frame.months)
  return all.filter((m) => org.positionIds.has(m.positionId))
}

/** The atoms of the places a request touches (its seat, manager, give seats, a transfer's sides). */
function atomsOf(p: Prep, r: HcRequest): string[] {
  const managerOf = managerOfLatest(p.ctx.all.positions)
  const ids = [
    r.positionId,
    r.managerPositionId,
    ...(r.trade?.givePositionIds ?? []),
    r.transfer?.fromPositionId,
    r.transfer?.toManagerPositionId,
    r.transfer?.toPositionId,
  ].filter((x): x is string => !!x)
  const out = new Set<string>()
  for (const id of ids) {
    const a = atomOf(id, p.ctx.guard.atoms, managerOf)
    if (a) out.add(a)
  }
  return [...out].sort()
}

/** The pending requests' in-year band effects on the org, one band member per request and atom. */
function pendingMembers(p: Prep, org: OrgDef): CostMember[] {
  const managerOf = managerOfLatest(p.ctx.all.positions)
  const atomOfPlace = (place: SeatPlace) => {
    const id = place.positionId ?? place.managerPositionId
    return id ? atomOf(id, p.ctx.guard.atoms, managerOf) : null
  }
  const zeros = p.frame.months.map(() => 0)
  const out: CostMember[] = []
  for (const r of p.pending) {
    const atoms = atomsOf(p, r)
    const parts: { atomId: string | null; match: OrgMatch }[] =
      atoms.length > 1
        ? atoms.map((a) => ({
            atomId: a,
            match: (place: SeatPlace, on: string) => org.match(place, on) && atomOfPlace(place) === a,
          }))
        : [{ atomId: atoms[0] ?? null, match: org.match }]
    for (const part of parts) {
      const usd = bandEffect(r, part.match, p.fiscalYear, p.actx)
      if (Math.abs(usd) < EPS) continue
      const seat: CostSeat = {
        businessUnit: org.businessUnit,
        department: r.department ?? null,
        costCenter: r.costCenter ?? '',
        location: r.location ?? '',
        legalEntity: '',
        country: '',
        level: r.level ?? 'P1',
        managerPositionId: r.managerPositionId,
      }
      out.push({
        positionId: `request:${r.requestId}${part.atomId ? `|${part.atomId}` : ''}`,
        part: 'band',
        people: [],
        costedByMonth: zeros,
        amounts: {
          base: 0,
          bonus: 0,
          burden: 0,
          benefits: 0,
          oneTime: 0,
          vacancy: 0,
          equity: 0,
          loaded: usd,
        },
        currency: 'USD',
        seat,
        atomId: part.atomId,
      })
    }
  }
  return out
}

/**
 * The org's asks cost (cached per prepared context and org key). `belowUnit`: the org is a row
 * below the unit (a department, cost center or leader's org), which Finance shows only under 7.4.
 */
export function orgAsksCost(p: Prep, org: OrgDef, belowUnit: boolean): OrgAsksCost {
  let byKey = memo.get(p)
  if (!byKey) {
    byKey = new Map()
    memo.set(p, byKey)
  }
  const hit = byKey.get(org.key)
  if (hit) return hit
  const members = [...lineMembers(p, org), ...pendingMembers(p, org)]
  const union = orgIsUnion(p.ctx, org)
  const rounded = union
    ? guardModel({
        members,
        mode: 'rounded',
        rules: p.rules,
        atoms: p.ctx.guard.atoms,
        fit: null,
        bandShown: true,
      })
    : null
  const guardedUsd = rounded?.total.totalUsd ?? null

  let figure: GuardedFigure | null = null
  let reason: string | null = null
  if (p.mode === 'none') reason = NO_AMOUNTS_NOTE
  else if (p.fit) reason = p.fit
  else if (p.mode === 'rounded') {
    if (!union) reason = WHOLE_TEAMS_NOTE
    else figure = p.bandShown ? rounded : guardModel({ ...guardInput(p, members), mode: 'rounded' })
  } else if (p.mode === 'exact' && belowUnit && orgRule(p, org.key) !== null) {
    reason = orgRule(p, org.key)
  } else figure = guardModel(guardInput(p, members))
  const usd = figure?.total.totalUsd ?? null
  if (figure && usd == null) reason = figure.reason ?? figure.total.reason
  const out: OrgAsksCost = { members, union, figure, usd, reason, guardedUsd }
  byKey.set(org.key, out)
  return out
}

/** 7.4's decision for an org below the unit: null when cost shows; an org no surface decided reads heads only. */
const orgRule = (p: Prep, key: string): string | null =>
  p.orgCost.has(key) ? (p.orgCost.get(key) ?? null) : ORG_COST_NOTE

/**
 * The guard's input for the mode (Finance's folds, whole orgs: never a filter's share). The component
 * split shows only on whole units that pass the gate (C33), so an org row below the unit shows
 * loaded cost only.
 */
function guardInput(p: Prep, members: readonly CostMember[]) {
  return {
    members,
    mode: p.mode,
    rules: p.rules,
    atoms: p.ctx.guard.atoms,
    folds: p.mode === 'exact' ? p.folds : null,
    fit: null,
    bandShown: p.bandShown,
    partial: false,
    components: gateFor(p.ctx, members),
  }
}

/** The guarded figure over several orgs together (a total row): the union of their members. */
export function unionFigure(p: Prep, costs: readonly OrgAsksCost[]): GuardedFigure | null {
  if (!costs.length || costs.some((c) => c.usd == null)) return null
  const seen = new Set<CostMember>()
  const members: CostMember[] = []
  for (const c of costs)
    for (const m of c.members)
      if (!seen.has(m)) {
        seen.add(m)
        members.push(m)
      }
  return guardModel(guardInput(p, members))
}
