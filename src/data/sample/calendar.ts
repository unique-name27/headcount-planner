/**
 * Day-number calendar for the generator, and the sample company's fixed dates (docs/PLAN.md 13.1 and
 * 13.2). A Day is an integer count of days since 1970-01-01 (UTC). All generator arithmetic happens on
 * Days and minutes; ISO strings are produced only when rows are emitted, through a small cache
 * because the same few thousand dates repeat constantly.
 */
import type { ISODate, ISODateTime } from '../schema'

export type Day = number

const MS_PER_DAY = 86_400_000
const isoCache = new Map<Day, ISODate>()

export const ymd = (y: number, m: number, d: number): Day => Date.UTC(y, m - 1, d) / MS_PER_DAY

export const day = (s: string): Day => ymd(+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10))

export function iso(d: Day): ISODate {
  let s = isoCache.get(d)
  if (s === undefined) {
    s = new Date(d * MS_PER_DAY).toISOString().slice(0, 10)
    isoCache.set(d, s)
  }
  return s
}

export const isoOrNull = (d: Day | null | undefined): ISODate | null => (d == null ? null : iso(d))

/** `YYYY-MM-DDTHH:mm` for a day and a time of day in minutes (9 * 60 is 09:00). */
export function isoAt(d: Day, minuteOfDay: number): ISODateTime {
  const hh = Math.floor(minuteOfDay / 60)
  const mm = minuteOfDay % 60
  return `${iso(d)}T${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}`
}

/** 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday). */
export const weekday = (d: Day): number => (((d + 4) % 7) + 7) % 7

export function isWeekend(d: Day): boolean {
  const w = weekday(d)
  return w === 0 || w === 6
}

/** d itself on a weekday, otherwise the following Monday. */
export function onOrAfterWeekday(d: Day): Day {
  const w = weekday(d)
  return w === 6 ? d + 2 : w === 0 ? d + 1 : d
}

/** d itself on a weekday, otherwise the preceding Friday. */
export function onOrBeforeWeekday(d: Day): Day {
  const w = weekday(d)
  return w === 6 ? d - 1 : w === 0 ? d - 2 : d
}

/** The first Monday on or after d (start dates fall on Mondays). */
export const nextMonday = (d: Day): Day => d + ((8 - weekday(d)) % 7)

/** The last Monday on or before d. */
export const mondayOnOrBefore = (d: Day): Day => d - ((weekday(d) + 6) % 7)

/** The last Friday on or before d (last days fall on Fridays). */
export const fridayOnOrBefore = (d: Day): Day => d - ((weekday(d) + 2) % 7)

export function addBusinessDays(d: Day, n: number): Day {
  let t = d
  let left = Math.abs(n)
  const step = n >= 0 ? 1 : -1
  while (left > 0) {
    t += step
    if (!isWeekend(t)) left--
  }
  return t
}

function parts(d: Day): [number, number, number] {
  const t = new Date(d * MS_PER_DAY)
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]
}

export const yearOf = (d: Day): number => parts(d)[0]

export function monthStart(d: Day): Day {
  const [y, m] = parts(d)
  return ymd(y, m, 1)
}

export function monthEnd(d: Day): Day {
  const [y, m] = parts(d)
  return Date.UTC(y, m, 0) / MS_PER_DAY
}

/** The first day of the month n months after d's month. */
export function addMonths(d: Day, n: number): Day {
  const [y, m] = parts(d)
  return ymd(y, m + n, 1)
}

/** The last day of every month from `from`'s month to `to`'s month, inclusive. */
export function monthEnds(from: Day, to: Day): Day[] {
  const out: Day[] = []
  for (let m = monthStart(from); m <= to; m = addMonths(m, 1)) out.push(monthEnd(m))
  return out
}

/* ───────────────────────── the sample company's dates ───────────────────────── */

/** The sample's as-of date: the end of the first half of FY27. */
export const AS_OF: Day = day('2026-09-30')
/** First day of the company. */
export const FOUNDED: Day = day('2014-03-03')
/** Effective-dated history starts here (docs/PLAN.md 13.1): every seat has a row on or after it. */
export const HISTORY_START: Day = day('2025-04-01')
/** FY26 promotions take effect on this day (before the Budget lock, so every version knows them). */
export const PROMOTION_DAY: Day = day('2025-10-01')
/** The FY27 Budget was locked on this day (docs/PLAN.md 13.2). */
export const BUDGET_LOCK: Day = day('2026-03-20')
/** The FY27 merit date and cutoff: comp rows dated 1 Apr 2026 hold it for anyone started by 1 Jan 2026. */
export const MERIT_FY27: Day = day('2026-04-01')
export const MERIT_CUTOFF_FY27: Day = day('2026-01-01')
/** The FY27 Q1 Reforecast was locked on this day. */
export const REFORECAST_LOCK: Day = day('2026-07-15')
/** The Corporate hiring freeze starts on this day (story 4). */
export const FREEZE_START: Day = day('2026-08-01')
/** Finance opened the FY28 planning cycle on this day; asks are due on the next. */
export const CYCLE_OPENED: Day = day('2026-09-15')
export const ASKS_DUE: Day = day('2026-10-16')

export const FY27_START: Day = day('2026-04-01')
export const FY27_END: Day = day('2027-03-31')
export const FY28_START: Day = day('2027-04-01')
export const FY28_END: Day = day('2028-03-31')
