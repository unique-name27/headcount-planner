/**
 * The Plan view's Action center items (docs/PLAN.md 9.6): Planned seats starting within 45 days with
 * no req, openings past their target start, openings held by a freeze, and an open req on an
 * Eliminated or Traded seat. Pure `actions(ctx)` output, read from the cached plan model's openings;
 * ids are `<kind>:<record>`; no amount in `what` or `note`; every item has `due` or `closesWhen` and
 * `place`.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); the views-1 builder filled `planActions`.
 *
 * Readings taken here (views-1 builder, M2):
 *  - A manager item's owner is the holder of the seat's manager position on the as-of date; a vacant
 *    manager seat passes the item up to the nearest held seat above.
 *  - An HRBP item's owner is the HRBP the Units list names for the seat's unit; with no list in
 *    force the item is the unit's HR business partners' (no person named).
 *  - Openings past target start that a freeze holds raise their frozen-opening item only (the freeze
 *    is why they wait), so one seat is never listed twice.
 *  - Severity: a Planned seat with no req starting within two weeks, and an opening more than 30 days
 *    past its target start, are warnings; the rest are information.
 */
import type { ItemKind } from '@/access/ids'
import { contextLists } from '@/access/lists'
import type { AnalyticsContext } from '@/data/context'
import { unitHrbps } from '@/data/lists/roles'
import type { ISODate, ReqRow } from '@/data/schema'
import { workerNames } from '@/drill/seats'
import { daysBetween, formatDate } from '@/lib/dates'
import { reqAsOf } from '@/plan/engine/cost'
import type { Position } from '@/plan/types'
import type { ActionItem, ActionPlace } from '../../types'
import { prepare } from './base'
import { seatOn, seatsOf } from './core'
import { positionsSpec, reqsSpec } from './drill'
import { FIGURE } from './lineage'
import { type Opening, openingsOf } from './openings'

/** The item kinds this view raises (every one in src/access/ids.ts `ITEM_KINDS`). */
export const PLAN_ITEM_KINDS = [
  'plan:planned-no-req',
  'plan:past-start',
  'plan:frozen-opening',
  'plan:req-on-eliminated',
] as const satisfies readonly ItemKind[]

const placeOf = (pos: Position): ActionPlace => ({
  positionId: pos.positionId,
  businessUnit: pos.businessUnit,
  department: pos.department,
  costCenter: pos.costCenter,
  location: pos.location,
  legalEntity: pos.legalEntity,
})

const label = (pos: Position) => `${pos.positionId}${pos.title ? ` ${pos.title}` : ''}`

/** The holder of the nearest held manager seat above a position on a day. */
function managerOwner(
  ctx: AnalyticsContext,
  pos: Position,
  on: ISODate,
): { id: string | null; name: string } {
  const names = workerNames(ctx)
  const seen = new Set<string>()
  let cur = pos.managerPositionId
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const s = seatOn(ctx, cur, on)
    const holder = s?.holderIds[0]
    if (holder) return { id: holder, name: names.get(holder) ?? holder }
    cur = s?.position.managerPositionId ?? null
  }
  return { id: null, name: 'The manager' }
}

/** The unit's HRBP from the Units list in force, else the unit's HR business partners. */
function hrbpOwner(ctx: AnalyticsContext, unit: string): { id: string | null; name: string } {
  const lists = contextLists(ctx)
  const id = lists ? (unitHrbps(lists).get(unit) ?? null) : null
  return id ? { id, name: workerNames(ctx).get(id) ?? id } : { id: null, name: `${unit} HRBP` }
}

const cache = new WeakMap<AnalyticsContext, ActionItem[]>()

/** The Plan view's open items for the Action center. */
export function planActions(ctx: AnalyticsContext): ActionItem[] {
  const hit = cache.get(ctx)
  if (hit) return hit
  const p = prepare(ctx)
  const o = openingsOf(p)
  const on = p.on
  const out: ActionItem[] = []
  const subject = (pos: Position) => ({ kind: 'positions' as const, id: pos.positionId, label: label(pos) })
  const one = (pos: Position, title: string) => () => positionsSpec(p, title, [pos.positionId])

  for (const x of o.nearNoReq) {
    const pos = x.position
    const start = x.state.plannedStart as ISODate
    const owner = managerOwner(ctx, pos, ctx.asOf)
    out.push({
      id: `plan:planned-no-req:${pos.positionId}`,
      ownerRole: 'manager',
      ownerId: owner.id,
      ownerName: owner.name,
      due: start,
      severity: daysBetween(on, start) <= 14 ? 'warning' : 'info',
      what: `Planned seat ${pos.positionId} starts on ${formatDate(start)} with no req`,
      subject: subject(pos),
      view: 'plan',
      tab: 'openings',
      drill: one(pos, `Planned seat ${pos.positionId}`),
      note: 'A req in the recruiting system starts the hiring for this seat.',
      uses: p.uses(FIGURE.noReq),
      kind: 'Planned seat with no req',
      closesWhen: 'Closes when the seat has a req or someone starts in it',
      place: placeOf(pos),
      forOwner: {
        what: `Your Planned seat ${pos.positionId} starts on ${formatDate(start)} with no req`,
        due: start,
      },
    })
  }

  const pastOnly = o.pastStart.filter((x) => x.frozenBy == null)
  for (const x of pastOnly) {
    const pos = x.position
    const owner = managerOwner(ctx, pos, ctx.asOf)
    const target = x.targetStart as ISODate
    out.push({
      id: `plan:past-start:${pos.positionId}`,
      ownerRole: 'manager',
      ownerId: owner.id,
      ownerName: owner.name,
      due: target,
      severity: daysBetween(target, on) > 30 ? 'warning' : 'info',
      what: `Opening ${pos.positionId} is past its target start of ${formatDate(target)}`,
      subject: subject(pos),
      view: 'plan',
      tab: 'openings',
      drill: one(pos, `Opening ${pos.positionId}`),
      note: stageNote(x),
      uses: p.uses(FIGURE.pastStart),
      kind: 'Opening past target start',
      closesWhen: 'Closes when someone starts in the seat or its target start moves',
      place: placeOf(pos),
    })
  }

  for (const x of o.frozen) {
    const pos = x.position
    const owner = hrbpOwner(ctx, pos.businessUnit)
    out.push({
      id: `plan:frozen-opening:${pos.positionId}`,
      ownerRole: 'hrbp',
      ownerId: owner.id,
      ownerName: owner.name,
      severity: 'info',
      what: `Opening ${pos.positionId} is held by freeze ${x.frozenBy}`,
      subject: subject(pos),
      view: 'plan',
      tab: 'openings',
      drill: one(pos, `Opening ${pos.positionId}`),
      note: 'The forecast does not start it while the freeze lasts. An exception needs a business reason.',
      uses: p.uses(FIGURE.frozen),
      kind: 'Opening under a freeze',
      closesWhen: 'Closes when the freeze ends, or the seat is filled or eliminated',
      place: placeOf(pos),
    })
  }

  // An open req on an Eliminated or Traded seat (11.4: the app never edits reqs).
  const seats = seatsOf(ctx)
  for (const raw of ctx.data.reqs) {
    const r = reqAsOf(raw, ctx.asOf)
    if (!r || (r.status !== 'Open' && r.status !== 'On hold') || !r.positionId) continue
    const s = seatOn(ctx, r.positionId, ctx.asOf)
    if (s?.status !== 'Eliminated' || !seats.has(r.positionId)) continue
    const pos = s.position
    const traded = pos.endReason === 'Traded'
    const owner = hrbpOwner(ctx, pos.businessUnit)
    out.push({
      id: `plan:req-on-eliminated:${r.reqId}`,
      ownerRole: 'hrbp',
      ownerId: owner.id,
      ownerName: owner.name,
      severity: r.stage === 'Interviewing' ? 'warning' : 'info',
      what: `Close req ${r.reqId} in the ATS: its seat was ${traded ? 'traded' : 'eliminated'}`,
      subject: { kind: 'reqs', id: r.reqId, label: `Req ${r.reqId}` },
      view: 'plan',
      tab: 'openings',
      drill: () => reqsSpec(p, `Req ${r.reqId}`, [raw as ReqRow]),
      note: `Seat ${pos.positionId} is ${traded ? 'traded' : 'eliminated'}; the req stays open until the recruiting system closes it.`,
      uses: p.uses(FIGURE.reqsNotInPlan),
      kind: 'Req on an ended seat',
      closesWhen: "Closes when the imported req's status is Filled or Cancelled",
      place: placeOf(pos),
    })
  }
  cache.set(ctx, out)
  return out
}

function stageNote(x: Opening): string {
  if (x.stage === 'Planned') return 'No req yet.'
  if (x.stage === 'Offer accepted')
    return x.offerAccepted
      ? `An offer was accepted on ${formatDate(x.offerAccepted)}.`
      : 'An offer was accepted.'
  return `The req is at ${x.stage.toLowerCase()}.`
}
