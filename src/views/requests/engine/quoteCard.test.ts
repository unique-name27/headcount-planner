/**
 * The trade quote card's sentences (docs/PLAN.md 11.5, 11.7): T1 and T6 read as the plan writes them,
 * in weights and heads only; an On hold seat given adds its sentence; a blocked ask lists its blocks
 * with their seats; USD band estimates only where `cost:band` shows, and no sentence holds an amount.
 */
import { describe, expect, it } from 'vitest'
import { hasAmount } from '@/access/visibility'
import { TRADE_RATES_11_7 } from '@/plan/engine/fixtures/band'
import {
  type QuoteCase,
  T1,
  T1H,
  T3,
  T4,
  T6,
  T7A,
  TRADE_SEATS,
  tradeContext,
} from '@/plan/engine/fixtures/trade'
import { tradeQuote } from '@/plan/engine/trade'
import { canGetText, creditText, quoteCard } from './quoteCard'

const card = (c: QuoteCase, bandShown = true, onHoldGiven = 0) =>
  quoteCard(tradeQuote(c.ask, TRADE_SEATS, TRADE_RATES_11_7, tradeContext(c.creditBalanceBp)), {
    year: 'FY27',
    creditUsedBp: c.ask.creditUsedBp,
    bandShown,
    onHoldGiven,
  })

describe('the trade quote card (11.5)', () => {
  it('reads T1 as the plan writes it', () => {
    const c = card(T1)
    expect(c.lines).toEqual([
      'Give 1 P5 San Jose (1.92).',
      'Get 8 P3 Bengaluru (1.81).',
      'Credit 0.11 standard heads.',
      'Heads +7.',
      'In FY27 this saves 0.35 standard heads (start dates).',
    ])
    expect(canGetText(c)).toBe('You can get 8 (8.49)')
    expect(c).toMatchObject({
      ok: true,
      giveBp: 19_160,
      getBp: 18_056,
      creditBp: 1_104,
      headsDelta: 7,
      maxSeats: 8,
    })
    expect(creditText(c.creditBp)).toBe('Use trade credit (0.11)')
  })

  it('reads T6 across units: credit held by the giving org, no head change', () => {
    expect(card(T6).lines).toEqual([
      'Give 1 P4 San Jose (1.57).',
      'Get 1 P4 Haifa (1.07).',
      'Credit 0.50 standard heads.',
      'Heads 0.',
      'In FY27 this saves 0.26 standard heads (start dates).',
    ])
  })

  it('says when the seat given is On hold, and words trade credit used', () => {
    expect(card(T1H, true, 1).lines).toContain('The On hold seat you give was not counted in your heads.')
    const t3 = card(T3).lines
    expect(t3[0]).toBe('Give 8 P3 Bengaluru (1.81) and 0.11 standard heads of trade credit.')
    expect(t3).toContain('No trade credit is left over.')
    expect(t3).toContain('Heads −7.')
    expect(t3.at(-1)).toMatch(/^In FY27 this costs 0\.03 standard heads \(start dates\)\.$/)
  })

  it('groups a part-time rest seat apart, and lists each blocked seat with its first block', () => {
    expect(card(T4).lines[1]).toBe('Get 1 P4 Munich and 1 P4 Munich at 0.8 FTE (1.84).')
    const blocked = card(T7A)
    expect(blocked.ok).toBe(false)
    expect(blocked.blocks.map((b) => b.positionId)).toEqual(['P-T7-F', 'P-T7-O', 'P-T7-C'])
    expect(blocked.blocks[0].text).toBe(
      'Filled seats are never traded: request an Elimination, then a New role.',
    )
  })

  it('carries USD band estimates only where cost:band shows, and no sentence holds an amount', () => {
    expect(card(T1).bandUsd?.give).toBe(287_400)
    expect(card(T1).bandUsd?.get).toBeCloseTo(270_873.6, 6)
    expect('bandUsd' in card(T1, false)).toBe(false)
    for (const c of [T1, T1H, T3, T4, T6, T7A])
      for (const line of [...card(c, false).lines, ...card(c, false).blocks.map((b) => b.text)])
        expect(hasAmount(line), line).toBe(false)
  })
})
