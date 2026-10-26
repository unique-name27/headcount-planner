import { describe, expect, it } from 'vitest'
import {
  labelInSentence,
  positionsChipLabel,
  positionsCount,
  positionsPreview,
  readoutRows,
  severityCounts,
  sortFindings,
} from './readoutModel'
import type { Finding, FindingPosition } from './types'

const finding = (id: string, severity: Finding['severity'], extra: Partial<Finding> = {}): Finding => ({
  id,
  severity,
  title: `Finding ${id}`,
  ...extra,
})

const seats = (n: number): FindingPosition[] =>
  Array.from({ length: n }, (_, i) => ({ positionId: `P-${1000 + i}`, title: `Seat ${i}` }))

describe('sortFindings', () => {
  it('puts critical first, then warning, info and good, keeping order within a severity', () => {
    const sorted = sortFindings([
      finding('g1', 'good'),
      finding('w1', 'warning'),
      finding('i1', 'info'),
      finding('c1', 'critical'),
      finding('w2', 'warning'),
      finding('c2', 'critical'),
    ])
    expect(sorted.map((f) => f.id)).toEqual(['c1', 'c2', 'w1', 'w2', 'i1', 'g1'])
  })

  it('does not mutate its input', () => {
    const input = [finding('g', 'good'), finding('c', 'critical')]
    sortFindings(input)
    expect(input.map((f) => f.id)).toEqual(['g', 'c'])
  })

  it('counts by severity', () => {
    expect(severityCounts([finding('a', 'warning'), finding('b', 'warning'), finding('c', 'good')])).toEqual({
      critical: 0,
      warning: 2,
      info: 0,
      good: 1,
    })
  })
})

describe('positionsPreview', () => {
  const positions = seats(12)
  it('shows the first five and counts the rest', () => {
    const { shown, more } = positionsPreview(positions)
    expect(shown.map((p) => p.positionId)).toEqual(['P-1000', 'P-1001', 'P-1002', 'P-1003', 'P-1004'])
    expect(more).toBe(7)
  })
  it('has nothing more for a short list', () => {
    expect(positionsPreview(positions.slice(0, 3)).more).toBe(0)
  })
})

describe('readoutRows', () => {
  it('exports findings in severity order with positions counted, not listed', () => {
    const rows = readoutRows([
      finding('a', 'info', { detail: 'Detail a' }),
      finding('b', 'critical', {
        action: 'Review the openings with the hiring managers this week.',
        positions: seats(2),
      }),
    ])
    expect(rows).toEqual([
      {
        severity: 'Critical',
        finding: 'Finding b',
        detail: '',
        nextStep: 'Review the openings with the hiring managers this week.',
        positions: 2,
      },
      { severity: 'Note', finding: 'Finding a', detail: 'Detail a', nextStep: '', positions: null },
    ])
    // No position ID or title reaches an export row.
    expect(JSON.stringify(rows)).not.toMatch(/P-100|Seat/)
  })
})

describe('readoutRows with tiers', () => {
  it('adds the tier of each finding, in severity order', () => {
    const tierOf = (id: string) => (id === 'b' ? 'gold' : id === 'a' ? 'bronze' : null)
    const rows = readoutRows([finding('a', 'info'), finding('b', 'critical'), finding('c', 'good')], (f) => {
      const tier = tierOf(f.id)
      return tier
        ? {
            tier,
            standard: 'bronze',
            limiting: { tier, dataset: 'positions', ref: null },
            shown: true,
            explain: '',
            reason: null,
          }
        : null
    })
    expect(rows.map((r) => [r.finding, r.tier])).toEqual([
      ['Finding b', 'Gold'],
      ['Finding a', 'Bronze'],
      ['Finding c', ''],
    ])
  })
})

describe('labelInSentence', () => {
  it('lowers the first letter of ordinary labels and keeps acronyms', () => {
    expect(labelInSentence('Openings')).toBe('openings')
    expect(labelInSentence('Tree × cost center')).toBe('tree × cost center')
    expect(labelInSentence('HRBP view')).toBe('HRBP view')
    expect(labelInSentence('FX effect')).toBe('FX effect')
    expect(labelInSentence('9-box')).toBe('9-box')
    expect(labelInSentence('A')).toBe('A')
    expect(labelInSentence('')).toBe('')
  })
})

describe('capped position lists', () => {
  it('labels the toggle with the total when the list is capped', () => {
    expect(positionsChipLabel(50, 57)).toBe('57 positions (first 50 listed)')
    expect(positionsChipLabel(1, 2)).toBe('2 positions (first 1 listed)')
    expect(positionsChipLabel(12)).toBe('12 positions')
    expect(positionsChipLabel(12, 12)).toBe('12 positions')
    expect(positionsChipLabel(1)).toBe('1 position')
    // A total below the list length is stale; the list wins.
    expect(positionsChipLabel(12, 10)).toBe('12 positions')
  })

  it('counts positionsTotal, else the list length', () => {
    expect(positionsCount({ positions: seats(50), positionsTotal: 57 })).toBe(57)
    expect(positionsCount({ positions: seats(3) })).toBe(3)
    expect(positionsCount({ positionsTotal: 9 })).toBe(9)
    expect(positionsCount({ positions: seats(3), positionsTotal: 2 })).toBe(3)
    expect(positionsCount({})).toBeNull()
  })

  it('exports positionsTotal in the Positions column', () => {
    const rows = readoutRows([
      finding('capped', 'warning', { positions: seats(50), positionsTotal: 57 }),
      finding('full', 'info', { positions: seats(4) }),
      finding('none', 'good'),
    ])
    expect(rows.map((r) => r.positions)).toEqual([57, 4, null])
  })
})
