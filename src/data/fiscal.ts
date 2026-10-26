/**
 * The fiscal calendar (docs/PLAN.md 6 and 9.2). The fiscal year runs April to March and is named by
 * the calendar year it ends in: FY27 is 1 Apr 2026 to 31 Mar 2027. Quarters are fiscal (Q1 is April
 * to June). Months are keyed "2026-09".
 *
 * Period presets are fiscal too: `fy` (the default, the as-of date's whole fiscal year), `ytd`,
 * `qtd`, `month` and `custom`. HRBP and Leader cost reads `ytd` and `qtd` ending at the last closed
 * month-end (docs/PLAN.md 9.2 and 15.2 C21): pass `closedThrough` to `periodWindow`.
 *
 * Calendar arithmetic is `src/lib/dates.ts`; this file adds the fiscal year on top. Pure; dates are
 * ISO strings compared as strings. `plan/` and `cost/` may import it (docs/PLAN.md 4).
 */
import {
  addDays,
  addMonths,
  formatMonth,
  formatRange,
  isCalendarDate,
  monthEnd as lastDayOf,
  ms,
} from '@/lib/dates'
import type { FiscalYear, ISODate, Month } from './schema'

export type { FiscalYear, Month } from './schema'

/** The fiscal year starts on the first day of this calendar month (4 = April). */
export const FY_START_MONTH: number = 4

const pad2 = (n: number): string => String(n).padStart(2, '0')

/* ───────────── months ───────────── */

/** "2026-09" is a month key: four-digit year, month 01 to 12. */
export const isMonth = (v: unknown): v is Month => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)

/** The month of a date ("2026-09-16" gives "2026-09"); a month key gives itself. */
export const monthKey = (d: ISODate | Month): Month => d.slice(0, 7) as Month

/** The first day of a month or of a date's month. */
export const monthStart = (m: Month | ISODate): ISODate => `${m.slice(0, 7)}-01`

/** The last day of a month or of a date's month: monthEnd('2027-02') is '2027-02-28'. */
export const monthEnd = (m: Month | ISODate): ISODate => lastDayOf(m)

/** Days in a month: 30 for '2026-09', 29 for '2028-02'. */
export const daysInMonth = (m: Month | ISODate): number => +lastDayOf(m).slice(8, 10)

/** The month `n` months after `m` (before, for negative n): shiftMonth('2026-12', 1) is '2027-01'. */
export function shiftMonth(m: Month, n: number): Month {
  const i = +m.slice(0, 4) * 12 + (+m.slice(5, 7) - 1) + n
  return `${Math.floor(i / 12)}-${pad2((i % 12) + 1)}` as Month
}

/** Every month from `from` to `to`, both included; empty when `to` is before `from`. */
export function monthRange(from: Month, to: Month): Month[] {
  const out: Month[] = []
  for (let m = from; m <= to && out.length < 1200; m = shiftMonth(m, 1)) out.push(m)
  return out
}

/** The latest month-end on or before a date: '2026-10-15' gives '2026-09-30'; a month-end gives itself. */
export function monthEndOnOrBefore(d: ISODate): ISODate {
  return lastDayOf(d) === d ? d : addDays(monthStart(d), -1)
}

/* ───────────── fiscal years ───────────── */

/** 'FY27' is a fiscal year: "FY" and two digits. */
export const isFiscalYear = (v: unknown): v is FiscalYear => typeof v === 'string' && /^FY\d{2}$/.test(v)

/** The calendar year a fiscal year ends in: 2027 for 'FY27'. */
export function fyEndYear(fy: FiscalYear): number {
  const n = +fy.slice(2)
  return n < 100 ? 2000 + n : n
}

/** A fiscal year from the calendar year it ends in: 2027 gives 'FY27'. */
const fyOfEndYear = (year: number): FiscalYear => `FY${pad2(year % 100)}` as FiscalYear

/** The fiscal year a date or month falls in: '2026-04-01' and '2027-03-31' are FY27, '2026-03-31' is FY26. */
export function fiscalYearOf(d: ISODate | Month): FiscalYear {
  const y = +d.slice(0, 4)
  const m = +d.slice(5, 7)
  return fyOfEndYear(FY_START_MONTH === 1 || m < FY_START_MONTH ? y : y + 1)
}

/** First and last day of a fiscal year, both included: FY27 is 2026-04-01 to 2027-03-31. */
export function fyRange(fy: FiscalYear): { start: ISODate; end: ISODate } {
  const end = fyEndYear(fy)
  const start = `${FY_START_MONTH === 1 ? end : end - 1}-${pad2(FY_START_MONTH)}-01`
  return { start, end: lastDayOf(addMonths(start, 11)) }
}

/** The twelve months of a fiscal year, in order: FY27 is '2026-04' to '2027-03'. */
export function monthsOf(fy: FiscalYear): Month[] {
  const first = monthKey(fyRange(fy).start)
  return monthRange(first, shiftMonth(first, 11))
}

/** The fiscal year `n` years after `fy`: shiftFiscalYear('FY27', 1) is 'FY28'. */
export const shiftFiscalYear = (fy: FiscalYear, n: number): FiscalYear => fyOfEndYear(fyEndYear(fy) + n)

/** A month's place in its fiscal year: 0 for April up to 11 for March. */
export const fiscalMonthIndex = (m: Month | ISODate): number => (+m.slice(5, 7) - FY_START_MONTH + 12) % 12

/* ───────────── quarters ───────────── */

export interface FiscalQuarter {
  fiscalYear: FiscalYear
  /** Q1 is the fiscal year's first three months (April to June). */
  quarter: 1 | 2 | 3 | 4
  start: ISODate
  end: ISODate
  /** "FY27 Q2" */
  label: string
}

/** The fiscal quarter a date or month falls in: '2026-09-30' is FY27 Q2, 1 Jul to 30 Sep 2026. */
export function quarterOf(d: ISODate | Month): FiscalQuarter {
  const fiscalYear = fiscalYearOf(d)
  const q = Math.floor(fiscalMonthIndex(d) / 3)
  const months = monthsOf(fiscalYear)
  const quarter = (q + 1) as FiscalQuarter['quarter']
  return {
    fiscalYear,
    quarter,
    start: monthStart(months[q * 3]),
    end: monthEnd(months[q * 3 + 2]),
    label: `${fiscalYear} Q${quarter}`,
  }
}

/* ───────────── periods ───────────── */

/** The period presets, in picker order; `fy` is the default (docs/PLAN.md 9.2). */
export const PERIOD_PRESETS = ['fy', 'ytd', 'qtd', 'month', 'custom'] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]
export const isPeriodPreset = (v: unknown): v is PeriodPreset =>
  typeof v === 'string' && (PERIOD_PRESETS as readonly string[]).includes(v)

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  fy: 'Fiscal year',
  ytd: 'Year to date',
  qtd: 'Quarter to date',
  month: 'Month',
  custom: 'Custom range',
}

/** Inclusive date window. `months` is its length in months (whole for whole months). */
export interface Window {
  start: ISODate
  end: ISODate
  months: number
  /** "1 Apr 2026 – 30 Sep 2026" */
  label: string
}

/** A window for a period preset, with what it was built from. */
export interface PeriodWindow extends Window {
  preset: PeriodPreset
  /** The fiscal year the window belongs to (for `custom`, the fiscal year of its end). */
  fiscalYear: FiscalYear
  /** The period in words: "FY27", "FY27 year to date", "FY27 Q2 to date", "Sep 2026", "Custom range". */
  name: string
  /** `ytd` or `qtd` ended at the last closed month-end instead of the as-of date. */
  toClose: boolean
  /**
   * No day in it: `ytd` or `qtd` to the last close when no month of the year or quarter has closed
   * yet. `months` is 0 and `end` is the day before `start`.
   */
  empty: boolean
}

export interface PeriodOptions {
  /** The custom range (`Filters.customStart` and `customEnd`). A blank or invalid side defaults to the as-of date's fiscal year start, or the as-of date. */
  customStart?: ISODate | null
  customEnd?: ISODate | null
  /**
   * The last closed month-end. When given, `ytd` and `qtd` end there, or at the as-of date if that is
   * earlier (HRBP and Leader cost, docs/PLAN.md 9.2). `fy`, `month` and `custom` ignore it.
   */
  closedThrough?: ISODate | null
  /**
   * The fiscal year `fy`, `ytd` and `qtd` cover: the shown version's (docs/PLAN.md 9.2); the as-of
   * date's when not given. Year and quarter to date of a year that has not started are empty ("FY28
   * has not started yet"); of a year that has ended, its whole year and last quarter. `month` and
   * `custom` ignore it.
   */
  fiscalYear?: FiscalYear | null
}

const DAY = 86_400_000

/** Whole months when the window starts on a month's first day and ends on a month's last day; else days ÷ 30.436875. */
function monthsIn(start: ISODate, end: ISODate): number {
  if (end < start) return 0
  if (start.slice(8) === '01' && lastDayOf(end) === end) {
    return (+end.slice(0, 4) - +start.slice(0, 4)) * 12 + (+end.slice(5, 7) - +start.slice(5, 7)) + 1
  }
  return (ms(end) - ms(start) + DAY) / DAY / 30.436875
}

/**
 * The window a period preset covers at an as-of date:
 *  - `fy`: the as-of date's whole fiscal year (plans and forecasts cover it all);
 *  - `ytd`: the fiscal year's first day to the as-of date;
 *  - `qtd`: the fiscal quarter's first day to the as-of date;
 *  - `month`: the as-of date's month, from its first day to the as-of date;
 *  - `custom`: `customStart` to `customEnd` (swapped when the wrong way round).
 * With `closedThrough`, `ytd` and `qtd` end at the earlier of it and the as-of date, and are `empty`
 * when that is before their first day. With `fiscalYear`, `fy`, `ytd` and `qtd` cover that year
 * (see `PeriodOptions.fiscalYear`).
 */
export function periodWindow(preset: PeriodPreset, asOf: ISODate, opts: PeriodOptions = {}): PeriodWindow {
  const fiscalYear = opts.fiscalYear ?? fiscalYearOf(asOf)
  const fy = fyRange(fiscalYear)
  const notStarted = asOf < fy.start
  const make = (
    start: ISODate,
    end: ISODate,
    name: string,
    extra: { fiscalYear?: FiscalYear; toClose?: boolean } = {},
  ): PeriodWindow => {
    const empty = end < start
    return {
      start,
      end,
      months: monthsIn(start, end),
      label: empty
        ? notStarted && preset !== 'month' && preset !== 'custom'
          ? `${fiscalYear} has not started yet`
          : 'No closed month in this period yet'
        : formatRange(start, end),
      preset,
      fiscalYear: extra.fiscalYear ?? fiscalYear,
      name,
      toClose: extra.toClose ?? false,
      empty,
    }
  }
  /**
   * The end of a to-date period: the as-of date, or the last close when it is earlier, and never past
   * the year's end (a year that has ended runs whole); empty before `start`.
   */
  const toDate = (start: ISODate): { end: ISODate; toClose: boolean } => {
    const close = opts.closedThrough
    const toClose = isCalendarDate(close)
    let end = toClose && close < asOf ? close : asOf
    if (end > fy.end) end = fy.end
    return { end: end < start ? addDays(start, -1) : end, toClose }
  }
  switch (preset) {
    case 'fy':
      return make(fy.start, fy.end, fiscalYear)
    case 'ytd': {
      const { end, toClose } = toDate(fy.start)
      return make(fy.start, end, `${fiscalYear} year to date`, { toClose })
    }
    case 'qtd': {
      // The as-of date's quarter; in another year, its first quarter (not started) or its last (ended).
      const q = quarterOf(asOf < fy.start ? fy.start : asOf > fy.end ? fy.end : asOf)
      const { end, toClose } = toDate(q.start)
      return make(q.start, end, `${q.label} to date`, { toClose })
    }
    case 'month':
      return make(monthStart(asOf), asOf, formatMonth(asOf), { fiscalYear: fiscalYearOf(asOf) })
    case 'custom': {
      let start = isCalendarDate(opts.customStart) ? opts.customStart : fy.start
      let end = isCalendarDate(opts.customEnd) ? opts.customEnd : asOf
      if (end < start) [start, end] = [end, start]
      return make(start, end, PERIOD_LABELS.custom, { fiscalYear: fiscalYearOf(end) })
    }
  }
}
