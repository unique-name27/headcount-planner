/**
 * Plan > Overview's readout (docs/PLAN.md 9.4, 9.5): findings such as "Go-to-Market is 8 heads over
 * the FY27 Budget at 30 Sep 2026.", each with its number in the title, the positions behind it (never
 * people, never an amount: 7.2 rule 6), its drill and its filter. A finding the mode hides the metric
 * of is left out, and its positions are kept to the scope (`findingsInMode`). Pure.
 *
 * Readings taken here (views-1 builder, M2):
 *  - Heads against the comparison are read by unit, or by department when the scope holds one unit;
 *    a gap shows once it is 3 heads or more (smaller gaps are timing). A target comparison has no
 *    monthly plan, so it raises none.
 *  - Openings past their target start and openings under a freeze are raised per group from 3
 *    openings; Planned seats near their start with no req and reqs not in plan are raised from 1.
 */
import { findingsInMode } from '@/access/numbers'
import type { Finding, FindingPosition, Severity } from '@/components/types'
import { monthEnd } from '@/data/fiscal'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { FilterDimension } from '@/data/scope'
import { groupFilter } from '@/drill/filter'
import { fmt, plural } from '@/lib/format'
import { ID } from '../metrics'
import { monthLabel, type Prep } from './base'
import { placementOf, versionLinesOf } from './core'
import { monthEndLine, positionsFor, positionsSpec, reqsSpec } from './drill'
import { tagFindings } from './drillUses'
import { actualOn, planHeadsAt } from './heads'
import { FIGURE } from './lineage'
import { type Opening, openingsOf } from './openings'

const MIN_GAP = 3
const MIN_GROUP_FINDING = 3
const LIST_CAP = 50

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

/** Which org dimension the readout groups by: units, or departments inside one unit. */
function groupDim(p: Prep): { dim: 'businessUnit' | 'department'; of: (id: string) => string } {
  const place = placementOf(p.ctx)
  const units = new Set<string>()
  for (const id of p.scope.ids) units.add(place.get(id)?.businessUnit ?? '')
  return units.size <= 1
    ? { dim: 'department', of: (id) => place.get(id)?.department ?? '' }
    : { dim: 'businessUnit', of: (id) => place.get(id)?.businessUnit ?? '' }
}

const listOf = (p: Prep, ids: readonly string[], note: (id: string) => string): FindingPosition[] =>
  positionsFor(p, ids.slice(0, LIST_CAP)).map((pos) => ({
    positionId: pos.positionId,
    title: pos.title ?? pos.positionId,
    note: note(pos.positionId),
  }))

/** One group's heads against the comparison, split into what makes the gap (actual − plan). */
export interface HeadsGapParts {
  actual: number
  plan: number
  /** Seats filled with no plan head in the comparison (each +1 to the gap). */
  plus: string[]
  /** Plan heads not filled (each −1 to the gap). */
  minus: string[]
  /** Employees with no seat of their own: people not in the plan (each +1). */
  seatless: number
  /** A second or later holder of a seat already counted (each +1). */
  shared: number
}

/** The heads-gap parts per group (units, or departments inside one unit). actual − plan = plus + seatless + shared − minus. */
export function headsGapParts(p: Prep): Map<string, HeadsGapParts> {
  const byGroup = new Map<string, HeadsGapParts>()
  const v = p.comparison
  if (!v) return byGroup
  const { dim, of } = groupDim(p)
  const planIds = new Set(planHeadsAt(versionLinesOf(p.ctx, v), p.planMonth, p.scope.ids))
  const active = actualOn(p)
  const held = new Set<string>()
  const g = (k: string) => {
    let x = byGroup.get(k)
    if (!x) {
      x = { actual: 0, plan: 0, plus: [], minus: [], seatless: 0, shared: 0 }
      byGroup.set(k, x)
    }
    return x
  }
  for (const e of active.values()) {
    const seat = e.assignment.positionId
    const key = seat
      ? of(seat)
      : ((dim === 'businessUnit' ? e.worker.businessUnit : e.worker.department) ?? '')
    const x = g(key)
    x.actual++
    if (!seat) x.seatless++
    else if (held.has(seat)) x.shared++
    else {
      held.add(seat)
      if (!planIds.has(seat)) x.plus.push(seat)
    }
  }
  for (const id of planIds) {
    g(of(id)).plan++
    if (!held.has(id)) g(of(id)).minus.push(id)
  }
  for (const x of byGroup.values()) {
    x.plus.sort()
    x.minus.sort()
  }
  return byGroup
}

const PLUS_NOTE = 'Filled, with no plan head in the comparison'
const MINUS_NOTE = 'A plan head, not filled'

/** "15 plan heads not filled, 3 people not in the plan": the parts of a gap, the finding's side first. */
function partsText(x: HeadsGapParts, over: boolean): string {
  const minus = x.minus.length ? `${plural(x.minus.length, 'plan head')} not filled` : null
  const plus = x.plus.length ? `${plural(x.plus.length, 'seat')} filled with no plan head` : null
  const seatless = x.seatless ? `${plural(x.seatless, 'person', 'people')} not in the plan` : null
  const shared = x.shared
    ? `${plural(x.shared, 'more person', 'more people')} in a seat already counted`
    : null
  const parts = over ? [plus, seatless, shared, minus] : [minus, plus, seatless, shared]
  return parts.filter((s): s is string => !!s).join(', ')
}

/**
 * Heads against the comparison's plan heads at the plan month-end, per group. The title keeps the net
 * gap; the drill lists the positions behind it on both sides, each with what it counts as toward the
 * title's number (1 on the finding's side, −1 on the other), and the people with no seat (people not
 * in the plan, and a second holder of a seat) are a count in the detail and the drill's note, never a
 * list of names (9.5: findings list positions, not people). So the "Counts as" total plus those
 * people is the title's number (9.5's weighted numbers).
 */
function headsGaps(p: Prep): Finding[] {
  const v = p.comparison
  if (!v) return []
  const { dim } = groupDim(p)
  const at = p.lastClose && p.planMonth === p.lastClose.month ? p.lastClose.date : monthEnd(p.planMonth)
  const out: Finding[] = []
  for (const [key, x] of headsGapParts(p)) {
    if (!key) continue
    const gap = x.actual - x.plan
    if (Math.abs(gap) < MIN_GAP) continue
    const over = gap > 0
    const side = over ? x.plus : x.minus
    const other = over ? x.minus : x.plus
    const ids = [...side, ...other]
    const plusSet = new Set(x.plus)
    // What a position counts as toward the title's number: its own side 1, the other side −1.
    const weightOf = (id: string): number => (plusSet.has(id) ? 1 : -1) * (over ? 1 : -1)
    const unlisted = x.seatless + x.shared
    const filter = groupFilter(dim as FilterDimension, key)
    const n = Math.abs(gap)
    const word = over ? 'over' : 'under'
    const parts = partsText(x, over)
    const counted = ids.reduce((s, id) => s + weightOf(id), 0)
    const who =
      x.seatless && x.shared
        ? 'not in the plan or in a seat already counted'
        : x.seatless
          ? 'not in the plan'
          : 'in a seat already counted'
    const note = [
      `A ${over ? 'seat filled with no plan head' : 'plan head not filled'} counts as 1, ${over ? 'a plan head not filled' : 'a seat filled with no plan head'} as −1.`,
      unlisted
        ? `${plural(unlisted, 'person', 'people')} ${who} ${unlisted === 1 ? 'is' : 'are'} not listed and count as ${over ? '' : '−'}${fmt(unlisted, 'int')}: ${fmt(counted, 'int')} ${over ? '+' : '−'} ${fmt(unlisted, 'int')} is the ${plural(n, 'head')} ${word}.`
        : null,
    ]
      .filter(Boolean)
      .join(' ')
    out.push({
      id: `heads-${word}-${key}`,
      metricId: ID.headsActual,
      severity: over ? 'warning' : 'info',
      title: `${key} is ${plural(n, 'head')} ${word} the ${v.name} at ${fmt(at, 'date')}.`,
      detail: `${plural(x.actual, 'actual head')} against ${plural(x.plan, 'plan head')} at the ${monthLabel(p.planMonth)} month-end: ${parts}.`,
      action: over
        ? 'Check the seats filled ahead of plan against the year’s target.'
        : 'Check the openings behind the gap and their target starts.',
      positions: listOf(p, ids, (id) => (plusSet.has(id) ? PLUS_NOTE : MINUS_NOTE)),
      positionsTotal: ids.length,
      ...(filter ? { filter } : {}),
      filterLabel: key,
      drill: () =>
        positionsSpec(p, `Positions behind the heads ${word} ${v.name} in ${key}`, ids, {
          subtitle: monthEndLine(p.ctx, p.planMonth, v.name),
          note,
          weight: (pos) => weightOf(pos.positionId),
          ...(filter ? { filter } : {}),
        }),
      uses: p.uses(FIGURE.actualVsPlan),
    })
  }
  return out
}

/** Openings with a flag, per group of 3 or more. */
function openingGroups(
  p: Prep,
  list: readonly Opening[],
  make: (key: string, n: number) => { id: string; title: string; metricId: string; severity: Severity },
  note: (o: Opening) => string,
  uses: readonly FieldRef[],
): Finding[] {
  const { dim, of } = groupDim(p)
  const byGroup = new Map<string, Opening[]>()
  for (const o of list) {
    const k = of(o.positionId)
    const l = byGroup.get(k)
    if (l) l.push(o)
    else byGroup.set(k, [o])
  }
  const out: Finding[] = []
  for (const [key, items] of byGroup) {
    if (!key || items.length < MIN_GROUP_FINDING) continue
    const ids = items.map((o) => o.positionId)
    const notes = new Map(items.map((o) => [o.positionId, note(o)]))
    const f = make(key, items.length)
    const filter = groupFilter(dim as FilterDimension, key)
    out.push({
      ...f,
      positions: listOf(p, ids, (id) => notes.get(id) ?? ''),
      positionsTotal: ids.length,
      ...(filter ? { filter } : {}),
      filterLabel: key,
      tab: 'openings',
      drill: () => positionsSpec(p, f.title.replace(/\.$/, ''), ids, filter ? { filter } : {}),
      uses,
    })
  }
  return out
}

export function planFindings(p: Prep): Finding[] {
  const o = openingsOf(p)
  const out: Finding[] = [
    ...headsGaps(p),
    ...openingGroups(
      p,
      o.pastStart,
      (key, n) => ({
        id: `past-start-${key}`,
        metricId: ID.openingsPastStart,
        severity: 'warning',
        title: `${plural(n, 'opening')} in ${key} ${n === 1 ? 'is' : 'are'} past ${n === 1 ? 'its' : 'their'} target start.`,
      }),
      (x) => (x.targetStart ? `Target start ${fmt(x.targetStart, 'date')}` : 'Target start passed'),
      p.uses(FIGURE.pastStart),
    ),
    ...openingGroups(
      p,
      o.frozen,
      (key, n) => ({
        id: `frozen-${key}`,
        metricId: ID.openingsFrozen,
        severity: 'info',
        title: `${plural(n, 'opening')} in ${key} ${n === 1 ? 'is' : 'are'} held by a freeze.`,
      }),
      (x) => `${x.stage === 'Planned' ? 'No req yet' : x.stage}`,
      p.uses(FIGURE.frozen),
    ),
  ]
  if (o.nearNoReq.length) {
    const ids = o.nearNoReq.map((x) => x.positionId)
    out.push({
      id: 'planned-no-req',
      metricId: ID.openingsNoReq,
      severity: 'warning',
      title: `${plural(ids.length, 'Planned seat')} ${ids.length === 1 ? 'starts' : 'start'} within ${plural(p.set.noReqDays, 'day')} with no req.`,
      detail: 'A seat needs a req in the recruiting system before it can be filled by its planned start.',
      positions: listOf(p, ids, (id) => {
        const s = o.byId.get(id)?.state.plannedStart
        return s ? `Planned start ${fmt(s, 'date')}` : 'Planned'
      }),
      positionsTotal: ids.length,
      tab: 'openings',
      drill: () => positionsSpec(p, 'Planned seats near start with no req', ids),
      uses: p.uses(FIGURE.noReq),
    })
  }
  if (o.reqsNotInPlan.length) {
    const reqs = o.reqsNotInPlan
    const seats = [...new Set(reqs.map((r) => r.positionId).filter((x): x is string => !!x))]
    out.push({
      id: 'reqs-not-in-plan',
      metricId: ID.reqsNotInPlan,
      severity: 'warning',
      title: `${plural(reqs.length, 'open req')} ${reqs.length === 1 ? 'has' : 'have'} no approved head behind ${reqs.length === 1 ? 'it' : 'them'}.`,
      detail: 'The app never edits reqs: close them in the recruiting system.',
      positions: listOf(p, seats, () => 'Not an approved head'),
      positionsTotal: seats.length,
      tab: 'openings',
      drill: () => reqsSpec(p, 'Reqs not in plan', reqs),
      uses: p.uses(FIGURE.reqsNotInPlan),
    })
  }
  out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (b.positionsTotal ?? 0) - (a.positionsTotal ?? 0))
  return tagFindings(findingsInMode(p.ctx.access, out))
}
