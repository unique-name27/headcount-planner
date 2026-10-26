import { describe, expect, it } from 'vitest'
import {
  copiedRowsText,
  firstCutField,
  type SummaryPosition,
  showsSummary,
  summaryCut,
  unnamedRowsText,
} from './summary'

const seat = (businessUnit: string, department: string, level: string | null): SummaryPosition => ({
  businessUnit,
  department,
  level,
})

describe('records panel summary', () => {
  const positions = [
    seat('Silicon Engineering', 'Design Verification', 'P3'),
    null,
    seat('Silicon Engineering', 'Fab Operations', 'P2'),
    seat('Silicon Engineering', 'Design Verification', 'P2'),
    seat('Silicon Engineering', 'Design Verification', null),
    undefined,
  ]

  it('counts the positions behind a list by department, largest first, keeping their rows', () => {
    const cut = summaryCut(positions, 'department')
    expect(cut.groups).toEqual([
      { label: 'Design Verification', count: 3, rows: [0, 3, 4] },
      { label: 'Fab Operations', count: 1, rows: [2] },
    ])
    expect(cut.positions).toBe(4)
    expect(cut.unnamed).toBe(2)
  })

  it('names levels in words, a blank one "Not set", and adds up to the positions counted', () => {
    const cut = summaryCut(positions, 'level')
    expect(cut.groups.map((g) => [g.label, g.count])).toEqual([
      ['P2 Developing', 2],
      ['Not set', 1],
      ['P3 Career', 1],
    ])
    expect(cut.groups.reduce((s, g) => s + g.count, 0)).toBe(cut.positions)
  })

  it('splits by business unit when the list spans several, else by department', () => {
    expect(firstCutField(positions)).toBe('department')
    expect(firstCutField([...positions, seat('Corporate', 'Finance', 'P4')])).toBe('businessUnit')
  })
})

describe('when the summary shows', () => {
  it('needs ten positions, and most rows naming one', () => {
    expect(showsSummary({ positions: 9, unnamed: 0 })).toBe(false)
    expect(showsSummary({ positions: 10, unnamed: 0 })).toBe(true)
    expect(showsSummary({ positions: 38, unnamed: 54 })).toBe(false)
    expect(showsSummary({ positions: 50, unnamed: 42 })).toBe(true)
  })
})

describe('counts in plain words (docs/PLAN.md 14.3, R86; M4 review CP-5)', () => {
  it('says "1 row" and "1 row names no position", never "1 rows"', () => {
    expect(copiedRowsText(1)).toBe('Copied 1 row')
    expect(copiedRowsText(1234)).toBe('Copied 1,234 rows')
    expect(unnamedRowsText(1)).toBe('1 row names no position')
    expect(unnamedRowsText(3)).toBe('3 rows name no position')
  })
})
