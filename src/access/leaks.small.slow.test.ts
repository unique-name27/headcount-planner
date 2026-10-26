/**
 * No cost, rate or average over fewer than 5 costed people (docs/PLAN.md 7.2 rules 1 and 2, 7.4,
 * story 8 in 13.4, 16.1). Story 8's cost center 1550-HSZ (Facilities, Hsinchu) has 3 costed people:
 * every cost figure for it reads "—" or folds into Other in every mode without the switch, under no
 * filter and under a filter on it, and in every crawl an amount the crawl tags with 1 to 4 costed
 * people or contributors reads "—". HR admin with pay amounts shown sees it (the control).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { type Crawl, crawl, type Seen } from '@/testkit/crawl'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ctxAs, leakSample, personaCtx, pinClock, sampleCtx, seatViewers, unpinClock } from '@/testkit/sample'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const HSZ = '1550-HSZ'

let s: Sample
beforeAll(() => {
  pinClock()
  s = leakSample()
}, 120_000)
afterAll(() => unpinClock())

const shown = (v: Seen['value']): boolean => v != null && v !== '' && v !== '—'

/** An amount shown in a row, cell or file entry that names the cost center. */
const aboutHsz = (x: Seen): boolean =>
  x.tag.money === true &&
  shown(x.value) &&
  !x.tag.band &&
  !x.tag.input &&
  new RegExp(`${HSZ}(?![\\w-])`).test(x.where)

/** Amounts the crawl tags with 1 to 4 costed people or contributors (7.2 rules 1 and 5). */
const underMin = (c: Crawl, min: number): Seen[] =>
  c.seen.filter(
    (x) =>
      x.tag.money &&
      !x.tag.band &&
      typeof x.value === 'number' &&
      ((x.tag.costed != null && x.tag.costed > 0 && x.tag.costed < min) ||
        (x.tag.contributors != null && x.tag.contributors > 0 && x.tag.contributors < min)),
  )

/** The contexts without the switch that can see Corporate: Finance, HR admin, the HRBP, the CFO, the nearest leader. */
function viewers(filters = {}): { key: string; ctx: AnalyticsContext }[] {
  const seat = s.datasets.positions.find((p) => p.costCenter === HSZ)?.positionId as string
  const v = seatViewers(s, seat)
  return [
    { key: 'finance', ctx: personaCtx('finance-fpa', { filters }) },
    { key: 'hr-admin', ctx: sampleCtx('hr-admin', { filters }) },
    { key: `hrbp ${v.unit}`, ctx: ctxAs('hrbp', v.hrbp, { unit: v.unit, filters }) },
    { key: 'leader-cfo', ctx: personaCtx('leader-cfo', { filters }) },
    { key: `leader ${v.leader}`, ctx: ctxAs('leader', v.leader, { filters }) },
  ]
}

describe('story 8: 1550-HSZ and its 3 costed people', () => {
  it('has 3 costed people', () => {
    const held = s.datasets.workers.filter(
      (w) => w.workerType === 'Employee' && w.costCenter === HSZ && !w.assignmentEnd && !w.terminationDate,
    )
    expect(held.length).toBe(3)
  })

  it('reads "—" or folds into Other in every mode without the switch', () => {
    let read = 0
    for (const v of viewers()) {
      const c = crawl(v.ctx, { focus: 'money' })
      expect(c.errors, v.key).toEqual([])
      const hits = c.seen.filter(aboutHsz)
      expect(
        hits.slice(0, 5).map((x) => `${x.where} = ${x.value}`),
        v.key,
      ).toEqual([])
      const small = underMin(c, v.ctx.guard.rules.minCosted)
      expect(
        small.slice(0, 5).map((x) => `${x.where} = ${x.value} (${x.tag.costed ?? x.tag.contributors})`),
        v.key,
      ).toEqual([])
      read += c.seen.length
    }
    expect(read).toBeGreaterThan(100_000)
  }, 600_000)

  it('shows no amount under a filter on it, while heads still show', () => {
    for (const v of viewers({ costCenter: [HSZ] })) {
      const c = crawl(v.ctx, { focus: 'money', cards: false })
      const amounts = c.seen.filter(
        (x) => x.tag.money && !x.tag.band && !x.tag.input && !x.tag.derived && typeof x.value === 'number',
      )
      expect(
        amounts.slice(0, 5).map((x) => `${x.where} = ${x.value}`),
        v.key,
      ).toEqual([])
      // Heads show: the filter is not a blank screen.
      expect(
        c.seen.some(
          (x) => !x.tag.money && typeof x.value === 'number' && x.value > 0 && /tile/.test(x.where),
        ),
        v.key,
      ).toBe(true)
    }
  }, 600_000)

  it('control: HR admin with pay amounts shown sees its cost', () => {
    const on = crawl(sampleCtx('hr-admin', { showPay: true, filters: { costCenter: [HSZ] } }), {
      focus: 'money',
      cards: false,
    })
    const amounts = on.seen.filter(
      (x) => x.tag.money && !x.tag.band && typeof x.value === 'number' && x.value !== 0,
    )
    expect(amounts.length).toBeGreaterThan(0)
  }, 300_000)
})

describe('no amount over 1 to 4 costed people anywhere (7.2 rule 1)', () => {
  it('reads "—" for every amount tagged under the minimum, in every persona crawl', () => {
    let tagged = 0
    for (const p of s.personas) {
      if (p.mode === 'hr-admin') continue
      const ctx = personaCtx(p.key)
      const c = crawl(ctx, { focus: 'money' })
      const small = underMin(c, ctx.guard.rules.minCosted)
      expect(
        small.slice(0, 5).map((x) => `${x.where} = ${x.value}`),
        p.key,
      ).toEqual([])
      tagged += c.seen.filter((x) => x.tag.costed != null || x.tag.contributors != null).length
    }
    // Non-vacuity: the crawls tag thousands of amounts with their costed people or contributors.
    expect(tagged).toBeGreaterThan(1000)
  }, 600_000)

  it('control: HR admin with pay amounts shown has amounts over fewer than 5', () => {
    const c = crawl(sampleCtx('hr-admin', { showPay: true }), {
      views: ['plan'],
      focus: 'money',
      cards: false,
    })
    const perPerson = c.seen.filter(
      (x) => x.tag.money && typeof x.value === 'number' && /records positions|positionId=/.test(x.where),
    )
    expect(perPerson.length).toBeGreaterThan(0)
  }, 300_000)
})
