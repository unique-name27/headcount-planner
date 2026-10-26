/**
 * The records Plan > Hiring's counts open (docs/PLAN.md 9.5 and 9.7): seats as positions, people as
 * workers where the mode lists them, accepted offers as reqs with dates only. Every spec hides
 * src/access/ids.ts `HIRING_DRILL_HIDE`'s columns of its kind in every mode, HR admin with "Show pay
 * amounts" on included, so no amount, band estimate or leave fact reaches the module's records.
 *
 * Manager mode lists no people (`drill:workers` is hidden there, H12): a count of people opens the
 * seats they hold, each seat counting as the people it stands for when two share one; a count that
 * holds someone with no seat (not in plan) opens no records there, and its tile or cell keeps its
 * calculation card. Pure; specs are built on click.
 */
import { HIRING_DRILL_HIDE } from '@/access/ids'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { ISODate, ReqRow } from '@/data/schema'
import type { DrillSpec } from '@/drill/types'
import type { HiringEvent } from '@/plan/engine/hiring'
import type { Position } from '@/plan/types'
import { positionsSpec, reqsSpec, workersSpec } from './drill'
import { eventKey, type HiringPersonRow, type HiringPrep } from './hiringData'

interface SpecOptions {
  subtitle?: string
  note?: string
  uses?: readonly FieldRef[]
}

/** Seats (positions), on the as-of date, with the module's hidden columns. */
export function seatsDrill(
  h: HiringPrep,
  title: string,
  ids: readonly string[],
  opts: SpecOptions & { weight?: (pos: Position) => number; noun?: readonly [string, string] } = {},
): DrillSpec<'positions'> {
  const spec = positionsSpec(h.p, title, ids, {
    ...(opts.subtitle ? { subtitle: opts.subtitle } : {}),
    ...(opts.note ? { note: opts.note } : {}),
    ...(opts.weight ? { weight: opts.weight } : {}),
    ...(opts.noun ? { noun: opts.noun } : {}),
    ...(opts.uses?.length ? { uses: opts.uses } : {}),
  })
  return { ...spec, hide: [...HIRING_DRILL_HIDE.positions] }
}

/** Whether the mode lists people (workers); Manager mode does not. */
export const listsPeople = (h: HiringPrep): boolean => h.p.ctx.access.can('drill:workers')

/**
 * People: their worker rows where the mode lists people, else the seats they hold (each seat
 * counting as its people when two share one). `each` makes every person count as that much (a
 * pace's 1/3). Null when the mode lists no people and someone holds no seat.
 */
export function peopleDrill(
  h: HiringPrep,
  title: string,
  people: readonly HiringPersonRow[],
  opts: SpecOptions & { seatTitle?: string; each?: number } = {},
): DrillSpec | null {
  const each = opts.each
  if (listsPeople(h)) {
    const spec = workersSpec(
      h.p,
      title,
      people.map((x) => x.row),
      {
        ...(opts.subtitle ? { subtitle: opts.subtitle } : {}),
        ...(opts.note ? { note: opts.note } : {}),
      },
    )
    return {
      ...spec,
      hide: [...HIRING_DRILL_HIDE.workers],
      ...(each != null ? { weight: () => each } : {}),
      ...(opts.uses?.length ? { uses: opts.uses } : {}),
    }
  }
  const counts = new Map<string, number>()
  for (const x of people) {
    if (!x.positionId) return null
    counts.set(x.positionId, (counts.get(x.positionId) ?? 0) + 1)
  }
  const ids = [...counts.keys()].sort()
  const shared = [...counts.values()].some((n) => n > 1)
  const seatNote = 'Each row is the seat the person holds.'
  return seatsDrill(h, opts.seatTitle ?? title, ids, {
    ...(opts.subtitle ? { subtitle: opts.subtitle } : {}),
    note: opts.note ? `${opts.note} ${seatNote}` : seatNote,
    ...(shared || each != null
      ? { weight: (pos: Position) => (counts.get(pos.positionId) ?? 0) * (each ?? 1) }
      : {}),
    noun: ['seat', 'seats'],
    ...(opts.uses?.length ? { uses: opts.uses } : {}),
  })
}

/** Accepted offers as reqs, with dates only. */
export function offersDrill(
  h: HiringPrep,
  title: string,
  reqIds: readonly string[],
  opts: SpecOptions = {},
): DrillSpec<'reqs'> {
  const rows = reqIds.map((id) => h.offers.get(id)).filter((r): r is ReqRow => r != null)
  const spec = reqsSpec(h.p, title, rows, {
    ...(opts.subtitle ? { subtitle: opts.subtitle } : {}),
    note: opts.note ?? 'Accepted offers show their dates only.',
  })
  return { ...spec, hide: [...HIRING_DRILL_HIDE.reqs], ...(opts.uses?.length ? { uses: opts.uses } : {}) }
}

/**
 * The rows behind the events dated from `from` to `to` (both included), in the events' order, from
 * the prep's hires or exits (keyed by `eventKey`): each stint of a rehire is its own row, as the
 * engine counts it (review HN-3).
 */
export function eventRows(
  map: ReadonlyMap<string, HiringPersonRow>,
  events: readonly HiringEvent[],
  from: ISODate,
  to: ISODate,
): HiringPersonRow[] {
  const out: HiringPersonRow[] = []
  for (const e of events) {
    if (e.on < from || e.on > to) continue
    const x = map.get(eventKey(e.personId, e.on))
    if (x) out.push(x)
  }
  return out
}

/** The rows of a set of people by ID, from one of the prep's maps (unknown IDs left out). */
export function peopleOf(
  map: ReadonlyMap<string, HiringPersonRow>,
  ids: readonly string[],
): HiringPersonRow[] {
  const out: HiringPersonRow[] = []
  for (const id of ids) {
    const x = map.get(id)
    if (x) out.push(x)
  }
  return out
}
