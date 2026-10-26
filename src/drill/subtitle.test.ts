import { describe, expect, it } from 'vitest'
import { asOfLine, subtitleOf, windowLine } from './subtitle'

describe('drill subtitles', () => {
  it('writes a window with an en dash, then the scope', () => {
    expect(windowLine({ start: '2025-10-01', end: '2026-09-30' }, 'Whole company')).toBe(
      '1 Oct 2025 – 30 Sep 2026 · Whole company',
    )
    expect(windowLine({ start: '2026-04-01', end: '2026-09-30' }, 'Go-to-Market')).toBe(
      '1 Apr 2026 – 30 Sep 2026 · Go-to-Market',
    )
  })

  it('writes a snapshot as "As of", then the scope and any qualifier', () => {
    expect(asOfLine('2026-09-30', 'Whole company')).toBe('As of 30 Sep 2026 · Whole company')
    expect(asOfLine('2026-09-30', "Dana Ito's org", 'positions matching the filters')).toBe(
      "As of 30 Sep 2026 · Dana Ito's org · positions matching the filters",
    )
  })

  it('leaves out the parts that are not set', () => {
    expect(asOfLine('2026-09-30')).toBe('As of 30 Sep 2026')
    expect(windowLine({ start: '2025-10-01', end: '2026-09-30' }, null, false, '')).toBe(
      '1 Oct 2025 – 30 Sep 2026',
    )
    expect(subtitleOf('Opened 1 Apr 2026 to 30 Sep 2026', undefined, 'Whole company')).toBe(
      'Opened 1 Apr 2026 to 30 Sep 2026 · Whole company',
    )
  })
})
