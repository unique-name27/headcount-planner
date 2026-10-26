import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import { customPeriodText, describeFocus, filterChips, isFiltered } from './filterLabels'

/** The leader filter holds a position ID; its name is the person in that seat. */
const names: Record<string, string> = { 'P-1001': 'Dana Ito' }
const nameOf = (id: string) => names[id]
const f = (patch: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...patch })

describe('filterChips', () => {
  it('has no chips for the default filters', () => {
    expect(filterChips(DEFAULT_FILTERS, nameOf)).toEqual([])
  })

  it('makes one chip per value with a patch that removes just that value', () => {
    const filters = f({
      leaderId: 'P-1001',
      location: ['Hsinchu', 'Munich'],
      level: ['P4'],
      costCenter: ['1110-SJC'],
    })
    const chips = filterChips(filters, nameOf)
    expect(chips.map((c) => [c.key, c.dimension, c.label])).toEqual([
      ['leaderId', 'Leader', "Dana Ito's org"],
      ['costCenter', 'Cost center', '1110-SJC'],
      ['location', 'Location', 'Hsinchu'],
      ['location', 'Location', 'Munich'],
      ['level', 'Level', 'P4 Senior'],
    ])
    expect(chips[0].remove).toEqual({ leaderId: null })
    expect(chips[2].remove).toEqual({ location: ['Munich'] })
    expect(chips[4].remove).toEqual({ level: [] })
  })

  it('names a vacant leader seat by its position', () => {
    expect(filterChips(f({ leaderId: 'P-9' }), nameOf)[0].label).toBe('The org under P-9')
    expect(filterChips(f({ leaderId: 'P-9', modes: { leaderId: 'exclude' } }), nameOf)[0].label).toBe(
      'Not in the org under P-9',
    )
  })

  it('covers every filter dimension, Finance’s included', () => {
    const chips = filterChips(
      f({ legalEntity: ['Northgate GmbH'], country: ['Germany'], currency: ['EUR'] }),
      nameOf,
    )
    expect(chips.map((c) => c.dimension)).toEqual(['Legal entity', 'Country', 'Currency'])
  })
})

describe('isFiltered', () => {
  it('is true for any org filter or a non-default period', () => {
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false)
    expect(isFiltered(f({ period: 'ytd' }))).toBe(true)
    expect(isFiltered(f({ department: ['Layout'] }))).toBe(true)
    expect(isFiltered(f({ leaderId: 'P-1001' }))).toBe(true)
    expect(isFiltered(f({ currency: ['EUR'] }))).toBe(true)
  })
})

describe('describeFocus', () => {
  it('describes a finding filter in plain words', () => {
    expect(describeFocus({ location: ['Bengaluru'] }, nameOf)).toBe('Bengaluru')
    expect(describeFocus({ leaderId: 'P-1001', department: ['Layout'] }, nameOf)).toBe(
      "Dana Ito's org · Layout",
    )
    expect(describeFocus({ level: ['P1', 'P2', 'P3'] }, nameOf)).toBe('P1 Entry +2')
    expect(describeFocus({ businessUnit: ['Go-to-Market', 'Corporate'] }, nameOf)).toBe(
      'Go-to-Market, Corporate',
    )
    expect(describeFocus({ period: 'ytd' }, nameOf)).toBe('Year to date')
  })

  it('is empty when the patch sets nothing', () => {
    expect(describeFocus({}, nameOf)).toBe('')
    expect(describeFocus({ location: [] }, nameOf)).toBe('')
  })
})

describe('exclusions', () => {
  it('read "Not Go-to-Market" and "Not in Dana Ito’s org" on chips', () => {
    const chips = filterChips(
      f({
        leaderId: 'P-1001',
        businessUnit: ['Go-to-Market'],
        location: ['Hsinchu'],
        modes: { leaderId: 'exclude', businessUnit: 'exclude' },
      }),
      nameOf,
    )
    expect(chips.map((c) => [c.label, c.excluded])).toEqual([
      ["Not in Dana Ito's org", true],
      ['Not Go-to-Market', true],
      ['Hsinchu', false],
    ])
  })

  it('describe a focus that excludes, and a fiscal custom period in words', () => {
    expect(
      describeFocus({ businessUnit: ['Go-to-Market'], modes: { businessUnit: 'exclude' } }, nameOf),
    ).toBe('not Go-to-Market')
    expect(describeFocus({ leaderId: 'P-1001', modes: { leaderId: 'exclude' } }, nameOf)).toBe(
      "not in Dana Ito's org",
    )
    expect(describeFocus({ leaderId: 'P-9', modes: { leaderId: 'exclude' } }, nameOf)).toBe(
      'not in the org under P-9',
    )
    expect(
      describeFocus({ period: 'custom', customStart: '2026-09-01', customEnd: '2026-09-30' }, nameOf),
    ).toBe('Sep 2026')
    expect(
      describeFocus({ period: 'custom', customStart: '2026-07-01', customEnd: '2026-09-30' }, nameOf),
    ).toBe('FY27 Q2')
    expect(
      describeFocus({ period: 'custom', customStart: '2026-03-05', customEnd: '2026-03-31' }, nameOf),
    ).toBe('5 Mar 2026 – 31 Mar 2026')
  })

  it('reads a whole fiscal year, and a calendar quarter that is not a fiscal one as dates', () => {
    expect(customPeriodText('2026-04-01', '2027-03-31')).toBe('FY27')
    expect(customPeriodText('2026-04-01', '2026-06-30')).toBe('FY27 Q1')
    expect(customPeriodText('2026-01-01', '2026-03-31')).toBe('FY26 Q4')
    expect(customPeriodText('2026-02-01', '2026-04-30')).toBe('1 Feb 2026 – 30 Apr 2026')
  })
})
