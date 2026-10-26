/**
 * The records behind the Plan view's numbers (docs/PLAN.md 9.5): every counted number opens exactly
 * the rows it counts (`rows.length === value`), a weighted one opens rows whose "Counts as" adds up
 * to it, and a group of a filter dimension carries the filter that reproduces it ("Filter to this",
 * "Leave out"). Specs are built on click (thunks), so nothing is built until someone opens one.
 */
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { ISODate, Month, ReqRow, WorkerRow } from '@/data/schema'
import { asOfLine, subtitleOf } from '@/drill/subtitle'
import type { DrillFilter, DrillSpec } from '@/drill/types'
import { formatMonth } from '@/lib/dates'
import type { Assignment, Position } from '@/plan/types'
import type { Prep } from './base'
import { positionOf } from './core'
import { seatsOnDay } from './heads'

/** Positions by ID, as the drill lists them: their row on the day, else their placement row. */
export function positionsFor(p: Prep, ids: readonly string[], on: ISODate = p.on): Position[] {
  const day = seatsOnDay(p, on)
  const out: Position[] = []
  for (const id of ids) {
    const pos = day.states.get(id)?.position ?? positionOf(p.ctx, id)
    if (pos) out.push(pos)
  }
  return out
}

/** A list of positions. */
export function positionsSpec(
  p: Prep,
  title: string,
  ids: readonly string[],
  opts: {
    on?: ISODate
    subtitle?: string
    note?: string
    filter?: DrillFilter
    filterLabel?: string
    weight?: (pos: Position) => number
    noun?: readonly [string, string]
    /** The records' own lineage, when it is not the number's (a tile's drill takes the tile's otherwise). */
    uses?: readonly FieldRef[]
  } = {},
): DrillSpec<'positions'> {
  return {
    kind: 'positions',
    title,
    subtitle: opts.subtitle ?? asOfLine(opts.on ?? p.on, p.ctx.scopeLabel),
    rows: positionsFor(p, ids, opts.on),
    ...(opts.note ? { note: opts.note } : {}),
    ...(opts.filter ? { filter: opts.filter } : {}),
    ...(opts.filterLabel ? { filterLabel: opts.filterLabel } : {}),
    ...(opts.weight ? { weight: opts.weight } : {}),
    ...(opts.noun ? { noun: opts.noun } : {}),
    ...(opts.uses?.length ? { uses: opts.uses } : {}),
  }
}

/** A list of people (worker rows). */
export function workersSpec(
  p: Prep,
  title: string,
  rows: readonly WorkerRow[],
  opts: { subtitle?: string; note?: string; filter?: DrillFilter } = {},
): DrillSpec<'workers'> {
  return {
    kind: 'workers',
    title,
    subtitle: opts.subtitle ?? asOfLine(p.ctx.asOf, p.ctx.scopeLabel),
    rows,
    ...(opts.note ? { note: opts.note } : {}),
    ...(opts.filter ? { filter: opts.filter } : {}),
  }
}

/** Assignments with what each counts as (a weighted number: average FTE). */
export function assignmentsSpec(
  p: Prep,
  title: string,
  rows: readonly Assignment[],
  weight: (a: Assignment) => number,
  opts: { subtitle?: string; note?: string } = {},
): DrillSpec<'assignments'> {
  return {
    kind: 'assignments',
    title,
    subtitle: opts.subtitle ?? asOfLine(p.ctx.asOf, p.ctx.scopeLabel),
    rows,
    weight,
    ...(opts.note ? { note: opts.note } : {}),
  }
}

/** A list of reqs. */
export function reqsSpec(
  p: Prep,
  title: string,
  rows: readonly ReqRow[],
  opts: { subtitle?: string; note?: string } = {},
): DrillSpec<'reqs'> {
  return {
    kind: 'reqs',
    title,
    subtitle: opts.subtitle ?? asOfLine(p.ctx.asOf, p.ctx.scopeLabel),
    rows,
    ...(opts.note ? { note: opts.note } : {}),
  }
}

/** "Sep 2026 month-end · Whole company · FY27 Working". */
export const monthEndLine = (ctx: AnalyticsContext, m: Month, version?: string | null): string =>
  subtitleOf(`${formatMonth(`${m}-01`)} month-end`, ctx.scopeLabel, version)
