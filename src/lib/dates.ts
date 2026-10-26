/**
 * UTC calendar helpers over ISO strings. Every date in Headcount Planner is a calendar date with no
 * time zone ("2026-09-30"); timestamps add a time ("2026-09-30T14:05"). Engines call `ms`, `iso`,
 * `addDays` and `monthEnd` in tight loops, so a plain date between 1950 and 2149 reads precomputed
 * month tables (`MONTH_START_DAY`, the day tables) with no parsing, no Date and no string slicing;
 * anything else takes the general path, cached. Calendar months only: fiscal years, quarters and
 * periods (April to March) are `src/data/fiscal.ts`. Pure.
 */

/** An ISO calendar date, "2026-09-30" (the same alias as `ISODate` in `src/data/schema.ts`). */
type ISODate = string

const DAY = 86_400_000

/* ───────────── month tables (1950 to 2149) ───────────── */

/** The first year the tables cover, and how many years. */
const TABLE_FROM = 1950
const TABLE_YEARS = 200

/** Days since 1970-01-01 of the first day of each month, by (year − 1950) × 12 + month − 1. */
const MONTH_START_DAY = new Int32Array(TABLE_YEARS * 12)
for (let i = 0; i < MONTH_START_DAY.length; i++)
  MONTH_START_DAY[i] = Date.UTC(TABLE_FROM + Math.floor(i / 12), i % 12, 1) / DAY

/** The first and last day the day tables cover, in days since 1970-01-01. */
const FIRST_DAY = MONTH_START_DAY[0]
const DAY_SPAN = Date.UTC(TABLE_FROM + TABLE_YEARS, 0, 1) / DAY - FIRST_DAY

/** A digit's value, or −1. */
const digit = (s: string, i: number): number => {
  const c = s.charCodeAt(i) - 48
  return c >= 0 && c <= 9 ? c : -1
}

/**
 * The month table's index of 'YYYY-MM…' (four digits, a dash, a month 01 to 12, at least 7
 * characters), or −1 when it is not one or falls outside the tables.
 */
function monthIndex(d: string): number {
  if (d.length < 7 || d.charCodeAt(4) !== 45) return -1
  const y0 = digit(d, 0)
  const y1 = digit(d, 1)
  const y2 = digit(d, 2)
  const y3 = digit(d, 3)
  const m0 = digit(d, 5)
  const m1 = digit(d, 6)
  if ((y0 | y1 | y2 | y3 | m0 | m1) < 0) return -1
  const month = m0 * 10 + m1
  if (month < 1 || month > 12) return -1
  const i = (y0 * 1000 + y1 * 100 + y2 * 10 + y3 - TABLE_FROM) * 12 + month - 1
  return i >= 0 && i < MONTH_START_DAY.length ? i : -1
}

/**
 * Milliseconds of a plain 'YYYY-MM-DD' date in the tables, or NaN. A day past the month's end rolls
 * on as `Date.UTC` rolls it ('2026-02-30' is 2 March), so this equals the general path.
 */
function tableMs(d: string): number {
  if (d.length !== 10 || d.charCodeAt(7) !== 45) return Number.NaN
  const i = monthIndex(d)
  const d0 = digit(d, 8)
  const d1 = digit(d, 9)
  if (i < 0 || (d0 | d1) < 0) return Number.NaN
  return (MONTH_START_DAY[i] + d0 * 10 + d1 - 1) * DAY
}

const cache = new Map<string, number>()

/** Milliseconds since epoch (UTC) for an ISO date or date-time; NaN when unparseable. */
export function ms(iso: string | null | undefined): number {
  if (!iso) return Number.NaN
  const fast = tableMs(iso)
  if (!Number.isNaN(fast)) return fast
  let v = cache.get(iso)
  if (v === undefined) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(iso)
    v = m
      ? Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0)
      : Number.NaN
    if (cache.size > 200_000) cache.clear()
    cache.set(iso, v)
  }
  return v
}

export const isValidDate = (iso: string | null | undefined): iso is string => Number.isFinite(ms(iso))

/**
 * A real calendar date written as YYYY-MM-DD: "2026-02-30" is not one (`isValidDate` reads it as
 * 2 March). For dates someone typed or pasted, such as a link's custom period.
 */
export const isCalendarDate = (v: unknown): v is ISODate =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && isValidDate(v) && iso(ms(v)) === v

const isoCache = new Map<number, ISODate>()
/** ISO dates of whole UTC days in the tables, by days since the tables' first day (filled as read). */
const DAY_ISO: (ISODate | undefined)[] = new Array(DAY_SPAN).fill(undefined)

/** ISO date (YYYY-MM-DD) for a UTC millisecond value (cached: engines call it in tight loops). */
export function iso(t: number): ISODate {
  const k = t / DAY - FIRST_DAY
  if (k >= 0 && k < DAY_SPAN && (k | 0) === k) {
    let s = DAY_ISO[k]
    if (s === undefined) {
      s = new Date(t).toISOString().slice(0, 10)
      DAY_ISO[k] = s
    }
    return s
  }
  let s = isoCache.get(t)
  if (s === undefined) {
    s = new Date(t).toISOString().slice(0, 10)
    if (isoCache.size > 200_000) isoCache.clear()
    isoCache.set(t, s)
  }
  return s
}
/** ISO date-time (YYYY-MM-DDTHH:mm) for a UTC millisecond value. */
export function isoDateTime(t: number): string {
  return new Date(t).toISOString().slice(0, 16)
}
/** Date part of an ISO date or date-time. */
export const dateOf = (s: string): ISODate => s.slice(0, 10)

/**
 * A write's business date-time (PLAN R47): the as-of date with the wall clock's time of day, so the
 * app's business "today" is the as-of date and writes within one day keep their order. A wall clock
 * with no time part reads as midnight UTC.
 */
export function businessAtOf(asOf: ISODate, wallClock: string): string {
  const time = wallClock.length > 10 ? wallClock.slice(10) : 'T00:00:00.000Z'
  return `${dateOf(asOf)}${time}`
}

/**
 * A stored business date or date-time read on the as-of date (PLAN R47): one dated after the as-of
 * date (a row stored before R47 with the wall clock's date) reads as entered on the as-of date, its
 * time of day kept; anything else is returned as it is.
 */
export function onAsOf(stored: string, asOf: ISODate): string {
  return dateOf(stored) > asOf ? `${asOf}${stored.slice(10)}` : stored
}

/** Whole days from a stored business date to the as-of date (R47): never negative. */
export function daysToAsOf(stored: string, asOf: ISODate): number {
  return Math.max(0, daysBetween(onAsOf(stored, asOf), asOf))
}

export function todayISO(): ISODate {
  const d = new Date()
  return iso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

export function addDays(d: ISODate, n: number): ISODate {
  return iso(ms(d) + n * DAY)
}

/** Calendar-month arithmetic; the day clamps to the end of a shorter month. */
export function addMonths(d: ISODate, n: number): ISODate {
  const t = new Date(ms(d))
  const y = t.getUTCFullYear()
  const m = t.getUTCMonth() + n
  const day = t.getUTCDate()
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return iso(Date.UTC(y, m, Math.min(day, last)))
}

/** Whole days from a to b (b - a). Works for dates and date-times (fractional for the latter via hoursBetween). */
export function daysBetween(a: string, b: string): number {
  return Math.round((ms(dateOf(b)) - ms(dateOf(a))) / DAY)
}
export function hoursBetween(a: string, b: string): number {
  return (ms(b) - ms(a)) / 3_600_000
}

/** Monday-to-Friday days from a (exclusive) to b (inclusive); negative when b < a. No holiday calendar. */
export function businessDaysBetween(a: ISODate, b: ISODate): number {
  const sign = ms(b) >= ms(a) ? 1 : -1
  let [from, to] = sign > 0 ? [ms(a), ms(b)] : [ms(b), ms(a)]
  let n = 0
  while (from < to) {
    from += DAY
    const wd = new Date(from).getUTCDay()
    if (wd !== 0 && wd !== 6) n++
  }
  return n * sign
}

export function addBusinessDays(d: ISODate, n: number): ISODate {
  let t = ms(d)
  const step = n >= 0 ? 1 : -1
  let left = Math.abs(n)
  while (left > 0) {
    t += step * DAY
    const wd = new Date(t).getUTCDay()
    if (wd !== 0 && wd !== 6) left--
  }
  return iso(t)
}

export const monthKey = (d: string): string => d.slice(0, 7)
export const monthStart = (d: string): ISODate => `${d.slice(0, 7)}-01`
const monthEndCache = new Map<string, ISODate>()
/** Month-ends in the tables, by month index (filled as read). */
const MONTH_END: (ISODate | undefined)[] = new Array(TABLE_YEARS * 12).fill(undefined)

/** The last day of the month of `d` (a date or a YYYY-MM month; a month table, else cached by month). */
export function monthEnd(d: string): ISODate {
  const i = monthIndex(d)
  if (i >= 0) {
    let e = MONTH_END[i]
    if (e === undefined) {
      e = monthEndOf(d)
      MONTH_END[i] = e
    }
    return e
  }
  return monthEndOf(d)
}

/** `monthEnd` by the general path. */
function monthEndOf(d: string): ISODate {
  const k = d.slice(0, 7)
  let e = monthEndCache.get(k)
  if (e === undefined) {
    const t = new Date(ms(`${k}-01`))
    e = iso(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0))
    if (monthEndCache.size > 10_000) monthEndCache.clear()
    monthEndCache.set(k, e)
  }
  return e
}
export function quarterKey(d: string): string {
  const m = +d.slice(5, 7)
  return `${d.slice(0, 4)} Q${Math.ceil(m / 3)}`
}
export function quarterStart(d: string): ISODate {
  const m = +d.slice(5, 7)
  const q0 = Math.floor((m - 1) / 3) * 3 + 1
  return `${d.slice(0, 4)}-${String(q0).padStart(2, '0')}-01`
}

/** Month keys (YYYY-MM) from the month of `start` to the month of `end`, inclusive. */
export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = []
  let cur = monthStart(start)
  const stop = monthKey(end)
  for (let guard = 0; guard < 600 && monthKey(cur) <= stop; guard++) {
    out.push(monthKey(cur))
    cur = addMonths(cur, 1)
  }
  return out
}

/** Month-end snapshot dates for the `n` months ending at (and including) the month of `asOf`. The last point is asOf itself. */
export function monthEndPoints(asOf: ISODate, n: number): ISODate[] {
  const pts: ISODate[] = []
  for (let i = n - 1; i >= 1; i--) pts.push(monthEnd(addMonths(monthStart(asOf), -i)))
  pts.push(asOf)
  return pts
}

export const inRange = (d: string | null | undefined, start: ISODate, end: ISODate): boolean => {
  if (!d) return false
  const x = dateOf(d)
  return x >= start && x <= end
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "30 Sep 2026" */
export function formatDate(d: string | null | undefined): string {
  if (!d || !isValidDate(d)) return '—'
  return `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`
}
/**
 * A date in a sentence: "12 Sep" in the as-of date's year, "5 Dec 2024" in any other, so a date
 * written into item text never loses its year.
 */
export function dateWords(d: string | null | undefined, asOf: string): string {
  const full = formatDate(d)
  if (!d || full === '—' || d.slice(0, 4) !== asOf.slice(0, 4)) return full
  return full.replace(/ \d{4}$/, '')
}
/** "Sep 2026" */
export function formatMonth(d: string): string {
  return `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`
}
/** "Sep" or "Sep '26" */
export function formatMonthShort(d: string, withYear = false): string {
  const m = MONTHS[+d.slice(5, 7) - 1]
  return withYear ? `${m} '${d.slice(2, 4)}` : m
}
/** "1 Oct 2025 – 30 Sep 2026" */
export function formatRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`
}
