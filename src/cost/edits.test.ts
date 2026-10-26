/**
 * 7.4's edit rule as counting (docs/PLAN.md 7.4 "Assumption edits are differences too", C14, R37):
 * an edit is refused when it moves 1 to 4 positions in all, or 1 to 4 in one month of one part of
 * Finance's fold; 0 or 5 or more everywhere goes through. The minimum is the one passed in (the locked
 * `cost.guard.minCosted`), never a constant.
 */
import { describe, expect, it } from 'vitest'
import { type EditMove, editMovers, editRefusal, editRefusedText } from './edits'

const CENTER = 'Corporate|center|1500-SJC'
const OTHER = 'Corporate|other|Facilities|Taiwan'

/** n positions moved in one part and month. */
const moved = (n: number, part: string, month: string, prefix = 'P'): EditMove[] =>
  Array.from({ length: n }, (_, i) => ({ positionId: `${prefix}-${i + 1}`, month, part }))

describe('editMovers', () => {
  it('counts distinct positions in all, and the smallest part and month above 0', () => {
    const moves = [
      ...moved(6, CENTER, '2026-10'),
      ...moved(3, OTHER, '2026-10', 'Q'),
      ...moved(6, CENTER, '2026-11'),
    ]
    expect(editMovers(moves)).toEqual({ total: 9, smallest: { part: OTHER, month: '2026-10', count: 3 } })
    expect(editMovers([])).toEqual({ total: 0, smallest: null })
  })

  it('counts a position once per part and month, whatever the order of the moves', () => {
    const moves = [...moved(5, CENTER, '2026-10'), ...moved(5, CENTER, '2026-10')]
    expect(editMovers(moves)).toEqual({ total: 5, smallest: { part: CENTER, month: '2026-10', count: 5 } })
    const a = [...moved(2, OTHER, '2026-11', 'Q'), ...moved(2, CENTER, '2026-10')]
    expect(editMovers(a)).toEqual(editMovers([...a].reverse()))
    // A tie goes to the first part in sorted order.
    expect(editMovers(a).smallest?.part).toBe(CENTER)
  })

  it('keeps months of different series apart', () => {
    const moves = [...moved(5, CENTER, '2026-10'), ...moved(1, CENTER, 'forecast 2026-10')]
    expect(editMovers(moves).smallest).toEqual({ part: CENTER, month: 'forecast 2026-10', count: 1 })
  })
})

describe('editRefusal', () => {
  const min = 5
  it('refuses 1 to 4 in all with the 7.4 sentence', () => {
    for (const n of [1, 2, 3, 4])
      expect(editRefusal(moved(n, CENTER, '2026-10'), min), String(n)).toBe(
        'This change would move cost for fewer than 5 costed people.',
      )
  })

  it('refuses 1 to 4 in one part and month even when 5 or more move in all', () => {
    const moves = [...moved(20, CENTER, '2026-10'), ...moved(3, OTHER, '2026-10', 'Q')]
    expect(editRefusal(moves, min)).toBe(editRefusedText(min))
    // The same 3 in a forecast month only: still one figure series with 3 movers.
    const forecastOnly = [...moved(20, CENTER, '2026-10'), ...moved(3, CENTER, 'forecast 2026-10')]
    expect(editRefusal(forecastOnly, min)).toBe(editRefusedText(min))
  })

  it('lets through an edit that moves nobody, or 5 or more in every part and month', () => {
    expect(editRefusal([], min)).toBeNull()
    const moves = [
      ...moved(5, CENTER, '2026-10'),
      ...moved(7, OTHER, '2026-10', 'Q'),
      ...moved(5, CENTER, '2026-11'),
    ]
    expect(editRefusal(moves, min)).toBeNull()
  })

  it('reads the minimum it is given', () => {
    const moves = moved(5, CENTER, '2026-10')
    expect(editRefusal(moves, 5)).toBeNull()
    expect(editRefusal(moves, 6)).toBe('This change would move cost for fewer than 6 costed people.')
  })
})
