import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  businessAtOf,
  daysBetween,
  daysToAsOf,
  formatDate,
  formatRange,
  isCalendarDate,
  iso,
  monthEnd,
  monthEndPoints,
  monthsBetween,
  ms,
  onAsOf,
} from './dates'

describe('dates', () => {
  it('adds days and calendar months, clamping the day to a shorter month', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-04-15', -1)).toBe('2026-03-15')
    expect(daysBetween('2026-04-01', '2027-03-31')).toBe(364)
  })

  it('finds month ends and the months between two dates, inclusive', () => {
    expect(monthEnd('2026-09-12')).toBe('2026-09-30')
    expect(monthEnd('2027-02-01')).toBe('2027-02-28')
    expect(monthsBetween('2026-04-01', '2027-03-31')).toHaveLength(12)
    expect(monthsBetween('2026-04-20', '2026-06-01')).toEqual(['2026-04', '2026-05', '2026-06'])
    expect(monthEndPoints('2026-09-30', 3)).toEqual(['2026-07-31', '2026-08-31', '2026-09-30'])
  })

  it('reads the month tables exactly as Date reads the same days, inside and outside the tables', () => {
    const viaDate = (d: string) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
      return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : Number.NaN
    }
    const lastViaDate = (d: string) => {
      const t = new Date(viaDate(`${d.slice(0, 7)}-01`))
      return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
    }
    const days = [
      '1949-12-31',
      '1950-01-01',
      '2000-02-29',
      '2026-02-28',
      '2026-02-30',
      '2026-09-00',
      '2026-09-30',
      '2027-03-31',
      '2028-02-29',
      '2100-02-28',
      '2149-12-31',
      '2150-01-01',
      '2026-13-01',
      '2026-00-15',
    ]
    for (const d of days) {
      expect(ms(d), d).toBe(viaDate(d))
      expect(monthEnd(d), d).toBe(lastViaDate(d))
    }
    for (let t = Date.UTC(1949, 11, 25); t <= Date.UTC(1950, 0, 5); t += 86_400_000)
      expect(iso(t)).toBe(new Date(t).toISOString().slice(0, 10))
    for (let t = Date.UTC(2026, 0, 1); t <= Date.UTC(2028, 11, 31); t += 86_400_000) {
      const d = new Date(t).toISOString().slice(0, 10)
      expect(iso(t)).toBe(d)
      expect(ms(d)).toBe(t)
      expect(addDays(d, 1)).toBe(new Date(t + 86_400_000).toISOString().slice(0, 10))
    }
    expect(iso(Date.UTC(2026, 8, 30, 14, 5))).toBe('2026-09-30')
    expect(ms('2026-09-30T14:05')).toBe(Date.UTC(2026, 8, 30, 14, 5))
    expect(ms('2026/09/30')).toBeNaN()
    expect(ms('2026-9-30')).toBeNaN()
  })

  it('accepts only real calendar dates', () => {
    expect(isCalendarDate('2026-09-30')).toBe(true)
    expect(isCalendarDate('2026-02-30')).toBe(false)
    expect(isCalendarDate('2026-9-30')).toBe(false)
    expect(isCalendarDate(20260930)).toBe(false)
  })

  it('formats dates, with the placeholder for a missing one', () => {
    expect(formatDate('2026-09-30')).toBe('30 Sep 2026')
    expect(formatDate(null)).toBe('—')
    expect(formatRange('2026-04-01', '2027-03-31')).toBe('1 Apr 2026 – 31 Mar 2027')
  })
})

describe('the business date of a write (PLAN R47)', () => {
  it('is the as-of date with the wall clock’s time of day', () => {
    expect(businessAtOf('2026-09-30', '2026-10-24T13:05:09.120Z')).toBe('2026-09-30T13:05:09.120Z')
    expect(businessAtOf('2026-09-30', '2026-09-01T08:00')).toBe('2026-09-30T08:00')
    expect(businessAtOf('2026-09-30', '2026-10-24')).toBe('2026-09-30T00:00:00.000Z')
  })

  it('reads a stored date after the as-of date as the as-of date, and measures never go negative', () => {
    expect(onAsOf('2026-10-24T13:05:00.000Z', '2026-09-30')).toBe('2026-09-30T13:05:00.000Z')
    expect(onAsOf('2026-10-24', '2026-09-30')).toBe('2026-09-30')
    expect(onAsOf('2026-09-12T09:00', '2026-09-30')).toBe('2026-09-12T09:00')
    expect(daysToAsOf('2026-10-24T13:05:00.000Z', '2026-09-30')).toBe(0)
    expect(daysToAsOf('2026-09-20T23:59', '2026-09-30')).toBe(10)
  })
})
