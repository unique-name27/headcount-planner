/**
 * Plain counts in Plan's calculation cards (docs/PLAN.md 14.3, R86; M4 review CP-5): the band card
 * of Open and Planned seats counts "1 seat", never "1 seats" (Architecture holds one such seat in
 * HR admin with Show pay amounts on).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { resolveCalc } from '@/drill/calc'
import { pluralSlips } from '@/testkit/counts'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ctxAs, leakSample, personaCtx, sampleCtx } from '@/testkit/sample'
import { planModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

beforeAll(() => {
  leakSample()
}, 120_000)

const bandStep = (department: string) => {
  const m = planModel(sampleCtx('hr-admin', { showPay: true, filters: { department: [department] } }))
  const k = [...m.overview.kpis, ...m.positions.kpis].find((x) => x.id === 'open-band')
  return resolveCalc(k?.calc)?.steps[0]?.expression
}

describe('Plan’s band card counts seats in plain words (review CP-5)', () => {
  it('says "1 seat" for one seat and "n seats" for more', () => {
    expect(bandStep('Architecture')).toBe('1 seat')
    expect(bandStep('Facilities')).toBe('1 seat')
    expect(bandStep('Design Verification')).toMatch(/^\d+ seats$/)
  })
})

describe('Hires YTD’s formula counts in plain words (fix step, loose ends: the crawl’s count scan)', () => {
  it('says "1 planned hire" where Manager A’s comparison plans one', () => {
    const m = planModel(personaCtx('manager-a'))
    const k = m.openings.kpis.find((x) => x.id === 'hires-ytd')
    expect(k?.formula).toMatch(/ − 1 planned hire in /)
    expect(pluralSlips(k?.formula ?? '')).toEqual([])
    // Every other mode's formula keeps the plural for a count other than 1.
    const finance = planModel(sampleCtx('finance')).openings.kpis.find((x) => x.id === 'hires-ytd')
    expect(finance?.formula).toMatch(/^[\d,]+ employees hired .* − [\d,]+ planned hires in /)
  })
})

describe('Openings’ formula counts in plain words (fix step, loose ends: the crawl’s count scan)', () => {
  it('names each status with its count, so one Planned seat never reads "1 Planned seats"', () => {
    // A leader whose tree holds 3 Open seats and 1 Planned seat nobody has started in.
    const k = planModel(ctxAs('leader', 'E10087')).overview.kpis.find((x) => x.id === 'openings')
    expect(k?.formula).toBe('3 Open + 1 Planned: the seats nobody has started in.')
    expect(pluralSlips(k?.formula ?? '')).toEqual([])
  })
})
