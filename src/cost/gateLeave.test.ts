/**
 * The component gate never reads leave (M2 carry-over, docs/PLAN.md 7.2 rule 1, C26, R44, D-FIN (b)):
 * with the lines' paid twins, a month of unpaid leave counts the twin's base, bonus, burden, benefits
 * and equity as contributors, the way the bridge counts its contributors, so flipping anyone's leave
 * leaves every unit's decision unchanged. The amounts a figure shows keep their real prices. Control:
 * counting the lines' own amounts, one unpaid month turns a unit of exactly 5 bonus contributors off.
 */
import { describe, expect, it } from 'vitest'
import type { Month } from '@/data/schema'
import type { PlanLine } from '@/plan/types'
import { componentGate, costRow, isUnpaidCostedLine, LEAVE_COMPONENTS } from './guard'
import { FY27, filled, line, membersOf, RULES, seat } from './guard.testkit'

const OCT: Month = '2026-10'

/** A unit of `n` Filled seats paid base, bonus, burden, benefits and equity every month. */
function unit(n: number, months: readonly Month[] = FY27) {
  const lines: PlanLine[] = []
  for (let i = 1; i <= n; i++)
    lines.push(
      ...filled(`U-${i}`, months, { base: 10_000, bonus: 1_000, burden: 800, benefits: 600, equity: 400 }),
    )
  return lines
}

/** The same lines with one seat's month on unpaid leave: pay components 0, the seat still costed. */
function unpaid(lines: readonly PlanLine[], positionId: string, month: Month): PlanLine[] {
  return lines.map((l) =>
    l.positionId === positionId && l.month === month
      ? line(positionId, month, { oneTime: l.usd.oneTime, vacancy: l.usd.vacancy })
      : l,
  )
}

/** The paid twins of the lines as the app finds them (the paid copy of the same seat, month and holder). */
const twinsOf =
  (paid: readonly PlanLine[]) =>
  (l: PlanLine): PlanLine | null =>
    paid.find((x) => x.positionId === l.positionId && x.month === l.month && x.holderId === l.holderId) ??
    null

const okOf = (
  lines: readonly PlanLine[],
  months: readonly Month[],
  paidLineOf?: (l: PlanLine) => PlanLine | null,
): boolean | undefined =>
  componentGate(
    { lines, months, seatOf: () => seat({ businessUnit: 'U' }), paidLineOf },
    RULES.minCosted,
  ).units.get('U')?.ok

describe('the component gate at leave-neutral prices (C26, R44)', () => {
  it('a month of unpaid leave is the line the guard reads as unpaid', () => {
    const lines = unpaid(unit(5), 'U-1', OCT)
    expect(lines.filter(isUnpaidCostedLine).map((l) => [l.positionId, l.month])).toEqual([['U-1', OCT]])
    expect([...LEAVE_COMPONENTS].sort()).toEqual(['base', 'benefits', 'bonus', 'burden', 'equity'])
  })

  it('control: counting the lines’ own amounts, one unpaid month turns 5 contributors into 4', () => {
    const paid = unit(5)
    expect(okOf(paid, [OCT])).toBe(true)
    expect(okOf(unpaid(paid, 'U-3', OCT), [OCT])).toBe(false)
    expect(okOf(unpaid(paid, 'U-3', OCT), FY27)).toBe(false)
  })

  it('with the paid twins, flipping any one leave, or all of them, changes no decision', () => {
    for (const n of [4, 5, 6, 10]) {
      const paid = unit(n)
      const twins = twinsOf(paid)
      for (const months of [[OCT], FY27, FY27.slice(0, 6)] as const) {
        const want = okOf(paid, months, twins)
        for (let i = 1; i <= n; i++)
          expect(okOf(unpaid(paid, `U-${i}`, OCT), months, twins), `${n} U-${i} ${months.length}`).toBe(want)
        let all = paid
        for (let i = 1; i <= n; i++) for (const m of months) all = unpaid(all, `U-${i}`, m)
        expect(okOf(all, months, twins), `${n} all ${months.length}`).toBe(want)
      }
    }
  })

  it('keeps the real amounts on the figure: only the counts are leave-neutral', () => {
    const paid = unit(6, [OCT])
    const lines = unpaid(paid, 'U-1', OCT)
    const gate = componentGate(
      { lines, months: [OCT], seatOf: () => seat({ businessUnit: 'U' }), paidLineOf: twinsOf(paid) },
      RULES.minCosted,
    )
    const row = costRow(
      'u',
      'U',
      membersOf(lines, [OCT], {}).map((m) => ({ ...m, seat: seat({ businessUnit: 'U' }) })),
      {
        mode: 'exact',
        rules: RULES,
        bandShown: true,
        components: gate,
      },
    )
    expect(row.componentsHidden).toBe(false)
    expect(row.costed).toBe(6)
    expect(row.amounts.base).toBe(5 * 10_000)
    expect(row.amounts.bonus).toBe(5 * 1_000)
  })

  it('an unpaid line with no paid twin hides its unit’s split, as an unknown cap side does', () => {
    const lines = unpaid(unit(10), 'U-1', OCT)
    expect(okOf(lines, [OCT], () => null)).toBe(false)
    expect(okOf(unit(10), [OCT], () => null)).toBe(true)
  })
})
