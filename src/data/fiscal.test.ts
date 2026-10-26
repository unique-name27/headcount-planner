/**
 * The fiscal calendar (docs/PLAN.md 6 and 9.2): April to March, named by the year it ends in, fiscal
 * quarters, and the period windows, including year and quarter to date at the last close.
 */
import { describe, expect, it } from 'vitest'
import {
  daysInMonth,
  FY_START_MONTH,
  fiscalMonthIndex,
  fiscalYearOf,
  fyEndYear,
  fyRange,
  isFiscalYear,
  isMonth,
  isPeriodPreset,
  monthEnd,
  monthEndOnOrBefore,
  monthKey,
  monthRange,
  monthStart,
  monthsOf,
  PERIOD_LABELS,
  PERIOD_PRESETS,
  periodWindow,
  quarterOf,
  shiftFiscalYear,
  shiftMonth,
} from './fiscal'

const AS_OF = '2026-09-30'

describe('fiscal years', () => {
  it('start in April', () => {
    expect(FY_START_MONTH).toBe(4)
  })

  it('are named by the calendar year they end in', () => {
    expect(fiscalYearOf('2026-04-01')).toBe('FY27')
    expect(fiscalYearOf('2026-09-30')).toBe('FY27')
    expect(fiscalYearOf('2027-03-31')).toBe('FY27')
    expect(fiscalYearOf('2026-03-31')).toBe('FY26')
    expect(fiscalYearOf('2027-04-01')).toBe('FY28')
    expect(fiscalYearOf('2026-12')).toBe('FY27')
    expect(fiscalYearOf('2026-01-15T09:30')).toBe('FY26')
    expect(fiscalYearOf('2099-12-31')).toBe('FY00')
  })

  it('run from 1 April to 31 March', () => {
    expect(fyRange('FY27')).toEqual({ start: '2026-04-01', end: '2027-03-31' })
    expect(fyRange('FY28')).toEqual({ start: '2027-04-01', end: '2028-03-31' })
    expect(fyEndYear('FY27')).toBe(2027)
    for (const fy of ['FY26', 'FY27', 'FY28', 'FY30'] as const) {
      const { start, end } = fyRange(fy)
      expect(fiscalYearOf(start)).toBe(fy)
      expect(fiscalYearOf(end)).toBe(fy)
    }
  })

  it('have twelve months, April first', () => {
    const months = monthsOf('FY27')
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-04')
    expect(months[8]).toBe('2026-12')
    expect(months[9]).toBe('2027-01')
    expect(months[11]).toBe('2027-03')
    expect(months.map(fiscalMonthIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('step and validate', () => {
    expect(shiftFiscalYear('FY27', 1)).toBe('FY28')
    expect(shiftFiscalYear('FY27', -1)).toBe('FY26')
    expect(isFiscalYear('FY27')).toBe(true)
    for (const v of ['FY2027', 'fy27', '27', 'FY', null, 27]) expect(isFiscalYear(v), String(v)).toBe(false)
  })
})

describe('months', () => {
  it('key, start and end', () => {
    expect(monthKey('2026-09-16')).toBe('2026-09')
    expect(monthKey('2026-09')).toBe('2026-09')
    expect(monthStart('2026-09-16')).toBe('2026-09-01')
    expect(monthStart('2026-09')).toBe('2026-09-01')
    expect(monthEnd('2026-09')).toBe('2026-09-30')
    expect(monthEnd('2026-09-16')).toBe('2026-09-30')
    expect(monthEnd('2027-02')).toBe('2027-02-28')
    expect(monthEnd('2028-02')).toBe('2028-02-29')
    expect(daysInMonth('2026-09')).toBe(30)
    expect(daysInMonth('2026-10')).toBe(31)
    expect(daysInMonth('2028-02')).toBe(29)
  })

  it('shift across years and list ranges', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2027-01', -1)).toBe('2026-12')
    expect(shiftMonth('2026-04', 17)).toBe('2027-09')
    expect(monthRange('2027-04', '2028-09')).toHaveLength(18)
    expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    expect(monthRange('2026-10', '2026-09')).toEqual([])
  })

  it('find the month-end on or before a date', () => {
    expect(monthEndOnOrBefore('2026-09-30')).toBe('2026-09-30')
    expect(monthEndOnOrBefore('2026-10-15')).toBe('2026-09-30')
    expect(monthEndOnOrBefore('2027-03-01')).toBe('2027-02-28')
  })

  it('validate', () => {
    expect(isMonth('2026-09')).toBe(true)
    for (const v of ['2026-13', '2026-9', '2026-09-01', '', undefined])
      expect(isMonth(v), String(v)).toBe(false)
  })
})

describe('fiscal quarters', () => {
  it('start in April, July, October and January', () => {
    expect(quarterOf('2026-04-01')).toEqual({
      fiscalYear: 'FY27',
      quarter: 1,
      start: '2026-04-01',
      end: '2026-06-30',
      label: 'FY27 Q1',
    })
    expect(quarterOf(AS_OF)).toMatchObject({
      quarter: 2,
      start: '2026-07-01',
      end: '2026-09-30',
      label: 'FY27 Q2',
    })
    expect(quarterOf('2026-12-31')).toMatchObject({ quarter: 3, start: '2026-10-01', end: '2026-12-31' })
    expect(quarterOf('2027-02')).toMatchObject({
      fiscalYear: 'FY27',
      quarter: 4,
      start: '2027-01-01',
      end: '2027-03-31',
    })
  })
})

describe('period windows', () => {
  it('list the five presets, fy first', () => {
    expect(PERIOD_PRESETS).toEqual(['fy', 'ytd', 'qtd', 'month', 'custom'])
    expect(Object.keys(PERIOD_LABELS)).toEqual([...PERIOD_PRESETS])
    expect(isPeriodPreset('qtd')).toBe(true)
    expect(isPeriodPreset('t12m')).toBe(false)
  })

  it('cover the fiscal year, year to date, quarter to date and the month at the as-of date', () => {
    expect(periodWindow('fy', AS_OF)).toMatchObject({
      start: '2026-04-01',
      end: '2027-03-31',
      months: 12,
      fiscalYear: 'FY27',
      name: 'FY27',
      empty: false,
      toClose: false,
    })
    expect(periodWindow('ytd', AS_OF)).toMatchObject({
      start: '2026-04-01',
      end: AS_OF,
      months: 6,
      name: 'FY27 year to date',
    })
    expect(periodWindow('qtd', AS_OF)).toMatchObject({
      start: '2026-07-01',
      end: AS_OF,
      months: 3,
      name: 'FY27 Q2 to date',
    })
    expect(periodWindow('month', AS_OF)).toMatchObject({
      start: '2026-09-01',
      end: AS_OF,
      months: 1,
      name: 'Sep 2026',
    })
    expect(periodWindow('fy', AS_OF).label).toBe('1 Apr 2026 – 31 Mar 2027')
  })

  it("follow another fiscal year when asked: the shown version's (the M2 review, UI-3)", () => {
    expect(periodWindow('fy', AS_OF, { fiscalYear: 'FY28' })).toMatchObject({
      start: '2027-04-01',
      end: '2028-03-31',
      months: 12,
      fiscalYear: 'FY28',
      name: 'FY28',
      label: '1 Apr 2027 – 31 Mar 2028',
      empty: false,
    })
    // A year that has not started: year and quarter to date are empty, and say so.
    expect(periodWindow('ytd', AS_OF, { fiscalYear: 'FY28' })).toMatchObject({
      start: '2027-04-01',
      fiscalYear: 'FY28',
      name: 'FY28 year to date',
      label: 'FY28 has not started yet',
      empty: true,
    })
    expect(periodWindow('qtd', AS_OF, { fiscalYear: 'FY28', closedThrough: AS_OF })).toMatchObject({
      start: '2027-04-01',
      fiscalYear: 'FY28',
      name: 'FY28 Q1 to date',
      label: 'FY28 has not started yet',
      empty: true,
    })
    // A year that has ended: the whole year, and its last quarter.
    expect(periodWindow('ytd', AS_OF, { fiscalYear: 'FY26' })).toMatchObject({
      start: '2025-04-01',
      end: '2026-03-31',
      months: 12,
      fiscalYear: 'FY26',
      empty: false,
    })
    expect(periodWindow('qtd', AS_OF, { fiscalYear: 'FY26' })).toMatchObject({
      start: '2026-01-01',
      end: '2026-03-31',
      name: 'FY26 Q4 to date',
    })
    // The as-of date's own year, the month and a custom range are as without it.
    for (const p of ['fy', 'ytd', 'qtd', 'month', 'custom'] as const)
      expect(periodWindow(p, AS_OF, { fiscalYear: 'FY27' }), p).toEqual(periodWindow(p, AS_OF))
    expect(periodWindow('month', AS_OF, { fiscalYear: 'FY28' })).toEqual(periodWindow('month', AS_OF))
  })

  it('end at the as-of date, so a mid-month as-of date gives part months', () => {
    const w = periodWindow('month', '2026-10-15')
    expect(w).toMatchObject({ start: '2026-10-01', end: '2026-10-15' })
    expect(w.months).toBeCloseTo(15 / 30.436875, 10)
    expect(periodWindow('ytd', '2027-01-10')).toMatchObject({ start: '2026-04-01', end: '2027-01-10' })
  })

  it('end year and quarter to date at the last closed month-end when asked', () => {
    expect(periodWindow('ytd', AS_OF, { closedThrough: '2026-08-31' })).toMatchObject({
      start: '2026-04-01',
      end: '2026-08-31',
      months: 5,
      toClose: true,
      empty: false,
    })
    expect(periodWindow('qtd', AS_OF, { closedThrough: '2026-08-31' })).toMatchObject({
      start: '2026-07-01',
      end: '2026-08-31',
      months: 2,
      toClose: true,
    })
    // The sample: closes April to September 2026, as-of 30 Sep 2026.
    expect(periodWindow('ytd', AS_OF, { closedThrough: AS_OF })).toMatchObject({
      end: AS_OF,
      months: 6,
      toClose: true,
    })
    // A close after the as-of date never reaches past it.
    expect(periodWindow('qtd', AS_OF, { closedThrough: '2026-10-31' }).end).toBe(AS_OF)
    // fy, month and custom ignore the close.
    expect(periodWindow('fy', AS_OF, { closedThrough: '2026-08-31' })).toMatchObject({
      end: '2027-03-31',
      toClose: false,
    })
    expect(periodWindow('month', AS_OF, { closedThrough: '2026-08-31' }).end).toBe(AS_OF)
  })

  it('are empty when no month of the year or quarter has closed yet', () => {
    const q = periodWindow('qtd', '2026-10-15', { closedThrough: '2026-09-30' })
    expect(q).toMatchObject({ start: '2026-10-01', end: '2026-09-30', months: 0, empty: true, toClose: true })
    expect(q.label).toBe('No closed month in this period yet')
    expect(periodWindow('ytd', '2026-10-15', { closedThrough: '2026-09-30' })).toMatchObject({
      start: '2026-04-01',
      end: '2026-09-30',
      months: 6,
      empty: false,
    })
    expect(periodWindow('ytd', '2027-04-20', { closedThrough: '2027-03-31' })).toMatchObject({
      fiscalYear: 'FY28',
      empty: true,
      months: 0,
    })
  })

  it('take a custom range, defaulting a blank side and swapping one given the wrong way round', () => {
    expect(
      periodWindow('custom', AS_OF, { customStart: '2026-09-01', customEnd: '2026-09-30' }),
    ).toMatchObject({
      start: '2026-09-01',
      end: '2026-09-30',
      months: 1,
      name: 'Custom range',
    })
    expect(periodWindow('custom', AS_OF, {})).toMatchObject({ start: '2026-04-01', end: AS_OF })
    expect(periodWindow('custom', AS_OF, { customStart: '2027-02-01', customEnd: null })).toMatchObject({
      start: AS_OF,
      end: '2027-02-01',
      fiscalYear: 'FY27',
    })
    expect(
      periodWindow('custom', AS_OF, { customStart: 'not a date', customEnd: '2026-05-31' }),
    ).toMatchObject({
      start: '2026-04-01',
      end: '2026-05-31',
      months: 2,
    })
    expect(
      periodWindow('custom', AS_OF, { customStart: '2027-04-01', customEnd: '2027-06-30' }).fiscalYear,
    ).toBe('FY28')
  })
})
