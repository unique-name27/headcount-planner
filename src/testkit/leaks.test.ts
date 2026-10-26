/**
 * The leak scanner's amount grammar (docs/PLAN.md 7.6, 16.1; review RM-1): the spellings the guard's
 * `hasAmount` learned in M2 read as amounts to the scanner too, written apart from the guard, so a
 * Manager crawl that leaked one would fail. Counts, rates, dates and IDs stay clean.
 */
import { describe, expect, it } from 'vitest'
import { amountsIn } from './leaks'

describe('amountsIn', () => {
  it('finds the review’s amount spellings', () => {
    for (const t of [
      'Budget holds 140.000 for this role',
      'Offer of 14 lakh agreed',
      'Send back: the offer would be 140.000 €',
      'Business need: offer 12,40,000 a year',
      'Approved after the 140 000 review',
      'Approved after the 140 000 review',
      'Approved after the 140 000 review',
      "Budget of 140'000 agreed",
      'Budget of 140’000 agreed',
      'Offer of 1.4 crore',
      'Budget 140.000,00',
      'A 140 grand offer',
      'Offer came in at INR140000',
      'Offer came in at 140000INR',
      'Offer of Rs 140000',
      'Range -140,000 to the top',
      'Budget of 1.400.000',
      'Budget of 2 million',
    ])
      expect(amountsIn(t).length, t).toBeGreaterThan(0)
  })

  it('keeps counts, rates, dates and IDs clean', () => {
    for (const t of [
      '1.043 standard heads',
      'Rate 0.753',
      'Weight 2.044',
      '1,609 heads',
      '1 450 heads',
      'P-1002 reports to P-1001',
      '1550-HSZ',
      'Due 2026-12-31',
      'Effective 31.12.2026',
      'In FY27 and FY28',
      'Starts in 2027',
      '3 Filled + 2 Open',
      'R-1025 waits on E10077',
      "Sebastian Wagner's team",
    ])
      expect(amountsIn(t), t).toEqual([])
  })
})
