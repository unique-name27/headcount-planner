/**
 * Proration fixtures (docs/PLAN.md 6.2, 15.1 R20). Each case: a method, a month, a span (start and
 * last day, both inclusive; null is open) and the exact active fraction. PR13 pins the in-year
 * fractions T1 and G3 use.
 */
import type { ISODate, Month, Proration } from '@/data/schema'
import { FY27_MONTHS } from './common'

export interface ProrationCase {
  id: string
  note: string
  method: Proration
  month: Month
  start: ISODate | null
  lastDay: ISODate | null
  expected: number
}

export const PRORATION_CASES: readonly ProrationCase[] = [
  // C1's seat: starts 16 Sep 2026.
  {
    id: 'PR1',
    note: 'daily: 15 of 30 days',
    method: 'daily',
    month: '2026-09',
    start: '2026-09-16',
    lastDay: null,
    expected: 0.5,
  },
  {
    id: 'PR2',
    note: 'half-month: a start after the 15th counts 0.5',
    method: 'half-month',
    month: '2026-09',
    start: '2026-09-16',
    lastDay: null,
    expected: 0.5,
  },
  {
    id: 'PR3',
    note: 'full-month: active on the last day counts 1',
    method: 'full-month',
    month: '2026-09',
    start: '2026-09-16',
    lastDay: null,
    expected: 1,
  },
  {
    id: 'PR4',
    note: 'half-month: a start on the 15th counts 1',
    method: 'half-month',
    month: '2026-09',
    start: '2026-09-15',
    lastDay: null,
    expected: 1,
  },
  {
    id: 'PR5',
    note: 'half-month: a start on the 1st counts 1',
    method: 'half-month',
    month: '2026-09',
    start: '2026-09-01',
    lastDay: null,
    expected: 1,
  },
  {
    id: 'PR6',
    note: 'half-month: a last day on the 15th counts 0.5',
    method: 'half-month',
    month: '2026-10',
    start: null,
    lastDay: '2026-10-15',
    expected: 0.5,
  },
  {
    id: 'PR7',
    note: 'half-month: a last day after the 15th counts 1',
    method: 'half-month',
    month: '2026-10',
    start: null,
    lastDay: '2026-10-16',
    expected: 1,
  },
  {
    id: 'PR8',
    note: 'half-month: start and last day in one month count 0.5 (R20, literal)',
    method: 'half-month',
    month: '2026-09',
    start: '2026-09-03',
    lastDay: '2026-09-20',
    expected: 0.5,
  },
  {
    id: 'PR8d',
    note: 'daily: 3 to 20 Sep is 18 of 30 days',
    method: 'daily',
    month: '2026-09',
    start: '2026-09-03',
    lastDay: '2026-09-20',
    expected: 0.6,
  },
  {
    id: 'PR8f',
    note: 'full-month: not active on 30 Sep',
    method: 'full-month',
    month: '2026-09',
    start: '2026-09-03',
    lastDay: '2026-09-20',
    expected: 0,
  },
  {
    id: 'PR9',
    note: 'full-month: a last day of 29 Sep is not active on 30 Sep',
    method: 'full-month',
    month: '2026-09',
    start: null,
    lastDay: '2026-09-29',
    expected: 0,
  },
  {
    id: 'PR10',
    note: 'full-month: a last day of 30 Sep counts (the last day is inclusive)',
    method: 'full-month',
    month: '2026-09',
    start: null,
    lastDay: '2026-09-30',
    expected: 1,
  },
  {
    id: 'PR11',
    note: 'daily: H3, a last day of 15 Oct is 15 of 31 days',
    method: 'daily',
    month: '2026-10',
    start: null,
    lastDay: '2026-10-15',
    expected: 15 / 31,
  },
  {
    id: 'PR12a',
    note: 'daily: a month before the start is 0',
    method: 'daily',
    month: '2026-08',
    start: '2026-09-16',
    lastDay: null,
    expected: 0,
  },
  {
    id: 'PR12b',
    note: 'half-month: a month before the start is 0',
    method: 'half-month',
    month: '2026-08',
    start: '2026-09-16',
    lastDay: null,
    expected: 0,
  },
  {
    id: 'PR12c',
    note: 'full-month: a month before the start is 0',
    method: 'full-month',
    month: '2026-08',
    start: '2026-09-16',
    lastDay: null,
    expected: 0,
  },
  {
    id: 'PR12d',
    note: 'daily: a month after the last day is 0',
    method: 'daily',
    month: '2026-11',
    start: null,
    lastDay: '2026-10-15',
    expected: 0,
  },
  {
    id: 'PR12e',
    note: 'half-month: a month after the last day is 0',
    method: 'half-month',
    month: '2026-11',
    start: null,
    lastDay: '2026-10-15',
    expected: 0,
  },
  {
    id: 'PR12f',
    note: 'daily: a month covered whole is 1',
    method: 'daily',
    month: '2026-10',
    start: '2026-09-16',
    lastDay: null,
    expected: 1,
  },
  {
    id: 'PR12g',
    note: 'half-month: a month covered whole is 1',
    method: 'half-month',
    month: '2026-10',
    start: '2026-09-16',
    lastDay: null,
    expected: 1,
  },
  {
    id: 'PR12h',
    note: 'full-month: a month covered whole is 1',
    method: 'full-month',
    month: '2026-10',
    start: '2026-09-16',
    lastDay: null,
    expected: 1,
  },
]

export interface InYearCase {
  id: string
  note: string
  method: Proration
  months: readonly Month[]
  start: ISODate | null
  lastDay: ISODate | null
  expected: number
}

/** PR13: first-of-month starts give the same in-year fraction under every proration (T1, G3). */
export const IN_YEAR_CASES: readonly InYearCase[] = (['daily', 'half-month', 'full-month'] as const).flatMap(
  (method): InYearCase[] => [
    {
      id: `PR13-${method}-give`,
      note: "T1's give seat from 1 Nov 2026: 5 of FY27's months",
      method,
      months: FY27_MONTHS,
      start: '2026-11-01',
      lastDay: null,
      expected: 5 / 12,
    },
    {
      id: `PR13-${method}-get`,
      note: "T1's get seats from 1 Jan 2027: 3 of FY27's months",
      method,
      months: FY27_MONTHS,
      start: '2027-01-01',
      lastDay: null,
      expected: 3 / 12,
    },
  ],
)
