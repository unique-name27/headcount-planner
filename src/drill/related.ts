/**
 * Records that lead to more records (docs/PLAN.md 9.5): a position's direct sub-positions and every
 * position below it (the tree through `managerPositionId`), its reqs, and the requests that touch
 * it. The position card and the records panel count these and open them as drills, with one
 * definition each, so the count and the list always agree (`related.test.ts`). Pure (no React).
 *
 * Seats Eliminated on the as-of date are no longer part of the tree: they are not counted or
 * listed. Requests are listed raw here; the position card shapes them for the viewer with
 * `requestRecord` (8.4) before any row exists.
 */
import type { AnalyticsContext } from '@/data/context'
import type { KnownFieldRef } from '@/data/quality/fieldRef'
import type { ReqRow } from '@/data/schema'
import { subtreeIds } from '@/data/scope'
import { formatDate } from '@/lib/dates'
import { endsSeatOn, toPosition } from '@/plan/engine/versions'
import type { HcRequest, Position } from '@/plan/types'
import { type DrillSpec, drillSpec } from './types'

export type RelatedContext = Pick<AnalyticsContext, 'positionIndex' | 'asOf' | 'all'>

const TREE_USES: readonly KnownFieldRef[] = [
  'positions.managerPositionId',
  'positions.status',
  'positions.effectiveDate',
]
const REQ_USES: readonly KnownFieldRef[] = ['reqs.positionId', 'reqs.status', 'reqs.openedDate']

const asOfLine = (ctx: RelatedContext) => `As of ${formatDate(ctx.asOf)}`
/** "P-1042 (Senior engineer)", or the ID alone when the seat has no title. */
const seatName = (ctx: RelatedContext, id: string): string => {
  const title = ctx.positionIndex.byId.get(id)?.title
  return title ? `${id} (${title})` : id
}

const byId = (a: Position, b: Position) => a.positionId.localeCompare(b.positionId, 'en', { numeric: true })

/** The seat's row on the as-of date does not end it (an Eliminated seat has left the tree). */
const live = (ctx: RelatedContext, id: string): boolean => {
  const row = ctx.positionIndex.byId.get(id) ?? null
  return !!row && !endsSeatOn(row, ctx.asOf)
}

/* ───────── the tree below a position ───────── */

/** The positions reporting to it directly on the as-of date, Eliminated seats left out. */
export function subPositions(ctx: RelatedContext, positionId: string): Position[] {
  return (ctx.positionIndex.children.get(positionId) ?? [])
    .filter((r) => live(ctx, r.positionId))
    .map(toPosition)
    .sort(byId)
}

const treeCache = new WeakMap<RelatedContext['positionIndex'], Map<string, Position[]>>()

/** Every position below it at every level on the as-of date, not counting itself, Eliminated seats left out. */
export function positionsBelow(ctx: RelatedContext, positionId: string): Position[] {
  let byKey = treeCache.get(ctx.positionIndex)
  if (!byKey) {
    byKey = new Map()
    treeCache.set(ctx.positionIndex, byKey)
  }
  const key = `${ctx.asOf}|${positionId}`
  const hit = byKey.get(key)
  if (hit) return hit
  const out: Position[] = []
  for (const id of subtreeIds(ctx.positionIndex, positionId)) {
    const row = ctx.positionIndex.byId.get(id)
    if (id !== positionId && row && live(ctx, id)) out.push(toPosition(row))
  }
  out.sort(byId)
  byKey.set(key, out)
  return out
}

export function subPositionsSpec(ctx: RelatedContext, positionId: string): DrillSpec<'positions'> | null {
  const rows = subPositions(ctx, positionId)
  if (!rows.length) return null
  return drillSpec({
    kind: 'positions',
    title: `Positions reporting to ${seatName(ctx, positionId)}`,
    subtitle: asOfLine(ctx),
    rows,
    note: 'Positions whose manager position is this one, Eliminated seats left out.',
    uses: TREE_USES,
  })
}

export function positionsBelowSpec(ctx: RelatedContext, positionId: string): DrillSpec<'positions'> | null {
  const rows = positionsBelow(ctx, positionId)
  if (!rows.length) return null
  return drillSpec({
    kind: 'positions',
    title: `Every position below ${seatName(ctx, positionId)}`,
    subtitle: asOfLine(ctx),
    rows,
    note: 'The tree below this position through each manager position, at every level, Eliminated seats left out.',
    uses: TREE_USES,
  })
}

/* ───────── reqs ───────── */

const reqCache = new WeakMap<readonly ReqRow[], Map<string, ReqRow[]>>()

/** Every req for the position, newest first. */
export function reqsOfPosition(ctx: Pick<RelatedContext, 'all'>, positionId: string): ReqRow[] {
  let byPosition = reqCache.get(ctx.all.reqs)
  if (!byPosition) {
    byPosition = new Map()
    for (const r of ctx.all.reqs) {
      if (!r.positionId) continue
      const list = byPosition.get(r.positionId)
      if (list) list.push(r)
      else byPosition.set(r.positionId, [r])
    }
    for (const list of byPosition.values())
      list.sort((a, b) => b.openedDate.localeCompare(a.openedDate) || a.reqId.localeCompare(b.reqId))
    reqCache.set(ctx.all.reqs, byPosition)
  }
  return byPosition.get(positionId) ?? []
}

/** The position's reqs that are still open (status Open or On hold). */
export function openReqsOfPosition(ctx: Pick<RelatedContext, 'all'>, positionId: string): ReqRow[] {
  return reqsOfPosition(ctx, positionId).filter((r) => r.status === 'Open' || r.status === 'On hold')
}

export function reqsSpec(ctx: RelatedContext, positionId: string): DrillSpec<'reqs'> | null {
  const rows = reqsOfPosition(ctx, positionId)
  if (!rows.length) return null
  return drillSpec({
    kind: 'reqs',
    title: `Reqs for ${seatName(ctx, positionId)}`,
    subtitle: asOfLine(ctx),
    rows,
    note: 'Every req opened for this position, newest first. An accepted offer shows its date.',
    uses: REQ_USES,
  })
}

/* ───────── requests ───────── */

/** The positions a request touches: its seat, the seats a trade gives, a transfer's seats. */
export function touchedPositions(req: HcRequest): string[] {
  const ids = [
    req.positionId,
    ...(req.trade?.givePositionIds ?? []),
    req.transfer?.fromPositionId,
    req.transfer?.toPositionId,
    req.outcome?.createdPositionIds ?? [],
  ].flat()
  return [...new Set(ids.filter((x): x is string => typeof x === 'string' && x !== ''))]
}

/**
 * The requests that touch the position (its own seat, a trade giving it, a transfer from or to it,
 * a seat it created), most recently updated first. Raw: the position card turns each into the
 * viewer's record (`requestRecord`, 8.4), which leaves out the ones the viewer may not see.
 */
export function requestsTouching(requests: readonly HcRequest[], positionId: string): HcRequest[] {
  return requests
    .filter((r) => touchedPositions(r).includes(positionId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.requestId.localeCompare(b.requestId))
}
