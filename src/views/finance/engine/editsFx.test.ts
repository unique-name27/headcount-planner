/**
 * 7.4's edit check in the M3 fixes (review PV-1 to PV-4): one structural FX rule and leave-neutral
 * movers.
 *
 *  - PV-1: an actual rate for the month to close next, set in Working before the close, is checked
 *    against the forecast rate that month reads now: Corporate's one CAD person makes a CAD actual of
 *    1000 a refusal, while September's rates carried into October (the close form's start) still go
 *    through.
 *  - PV-2: a plan rate for an already-closed month moves nobody now but becomes the next lock's
 *    comparison rate: refused for a currency with 1 to 4 costed people in a part.
 *  - PV-3: FX rows for a new Working's months past the version priced (version.create) are checked
 *    against the people paid in the currency, and rows carried unchanged go through; a set for a
 *    version the context does not hold is checked the same way, and any other row cannot be priced.
 *  - PV-4: a leave flip between paid and unpaid never changes the verdict (movers at leave-neutral
 *    prices, R44, C26). M3 recheck: nor the movers of a vacancy factor edit (the vacancy allowance, a
 *    line with no holder) or of an FY28 benefits edit (the forecast's cohort lines, priced at a unit's
 *    average): both sides are priced with nobody's leave unpaid.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { scenario, type Who } from '@/app/write/scenario.testkit'
import { editMovers, editRefusedText } from '@/cost/edits'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import type { AssumptionRow } from '@/data/schema'
import { siteByLocation } from '@/data/schema'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaCtx, personaOf, withWorker } from '@/testkit/sample'
import { assumptionEditCheck, CANNOT_PRICE_TEXT, editMovesOf } from './edits'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const W = 'fy27-working'
const fx = (key: string, value: number, version = W): AssumptionRow => ({
  version,
  table: 'fx',
  org: null,
  key,
  value,
})
const RULE = editRefusedText(5)

describe('the structural FX rule (PV-1 to PV-3)', () => {
  let s: Sample
  let fin: AnalyticsContext
  beforeAll(() => {
    s = leakSample()
    fin = personaCtx('finance-fpa', { sample: s })
  }, 120_000)

  it('PV-1: an actual rate for the month to close next is priced as if closed, against its forecast rate', () => {
    // Corporate's only CAD person (P-2339) is moved by any CAD rate the close would book.
    expect(assumptionEditCheck(fin, [fx('CAD|actual|2026-10', 1000)], W)).toBe(RULE)
    expect(assumptionEditCheck(fin, [fx('CAD|actual|2026-10', 0.74)], W)).toBe(RULE)
    // September's actual rate is October's forecast rate for CAD: it moves nobody and goes through.
    expect(assumptionEditCheck(fin, [fx('CAD|actual|2026-10', 0.73)], W)).toBeNull()
    // EUR and ILS move 5 or more in every part: the close form's carried rates go through.
    expect(
      assumptionEditCheck(fin, [fx('EUR|actual|2026-10', 1.14), fx('ILS|actual|2026-10', 0.287)], W),
    ).toBeNull()
  }, 120_000)

  it('PV-2: a plan rate for a closed month is refused where a part holds 1 to 4 people paid in it', () => {
    expect(assumptionEditCheck(fin, [fx('CAD|plan|2026-05', 1000)], W)).toBe(RULE)
    expect(assumptionEditCheck(fin, [fx('TWD|plan|2026-05', 0.05)], W)).toBe(RULE)
    // The same value as stored moves nothing.
    expect(assumptionEditCheck(fin, [fx('CAD|plan|2026-05', 0.73)], W)).toBeNull()
    expect(assumptionEditCheck(fin, [fx('EUR|plan|2026-05', 1.09)], W)).toBeNull()
  }, 120_000)

  it('PV-3: rows for months past the grid priced are checked against the people paid in the currency', () => {
    // version.create prices a new Working's rows as edits of `from` (FY28 Working: Apr 2027 to Sep 2028).
    expect(assumptionEditCheck(fin, [fx('CAD|plan|2028-10', 1000, 'fy28-working')], 'fy28-working')).toBe(
      RULE,
    )
    // Carried forward unchanged from FY28's last month: nothing moves.
    expect(
      assumptionEditCheck(fin, [fx('CAD|plan|2028-10', 0.73, 'fy28-working')], 'fy28-working'),
    ).toBeNull()
    // A version the context does not hold (a new Working with no `from`).
    expect(assumptionEditCheck(fin, [fx('CAD|plan|2028-10', 1000, 'fy29-working')], 'fy29-working')).toBe(
      RULE,
    )
    expect(
      assumptionEditCheck(fin, [fx('EUR|plan|2028-10', 1.08, 'fy29-working')], 'fy29-working'),
    ).toBeNull()
    const band: AssumptionRow = { version: 'fy29-working', table: 'equity', org: null, key: 'P3', value: 1 }
    expect(assumptionEditCheck(fin, [band], 'fy29-working')).toBe(CANNOT_PRICE_TEXT)
  }, 120_000)
})

describe('movers at leave-neutral prices (PV-4)', () => {
  it('a leave flip between paid and unpaid never changes the verdict', () => {
    const s = leakSample()
    // An allowed edit whose smallest part and month holds exactly 5 movers (1110-AUS in Oct 2026).
    const edit: AssumptionRow = {
      version: W,
      table: 'benefits',
      org: 'Architecture',
      key: 'United States',
      value: 18_181,
    }
    const base = assumptionEditCheck(personaCtx('finance-fpa', { sample: s }), [edit], W)
    expect(base).toBeNull()
    for (const employeeId of ['E10287', 'E10316']) {
      for (const leavePaid of [false, true]) {
        const flipped = withWorker(s, employeeId, { onLeave: true, leavePaid })
        expect(
          assumptionEditCheck(personaCtx('finance-fpa', { sample: flipped }), [edit], W),
          `${employeeId} paid ${leavePaid}`,
        ).toBe(base)
      }
    }
    // The sample's own unpaid leaves turned paid: the same verdict.
    let paid = s
    for (const w of s.datasets.workers.filter((x) => x.onLeave && x.leavePaid === false))
      paid = withWorker(paid, w.employeeId, { leavePaid: true })
    expect(assumptionEditCheck(personaCtx('finance-fpa', { sample: paid }), [edit], W)).toBe(base)
  }, 240_000)

  it('reads no leave through the vacancy allowance or the forecast’s cohort lines (M3 recheck)', async () => {
    const s = leakSample()
    // The movers an edit's check reads, as positions by part and month: the same set whoever is on leave.
    const moversOf = (sample: Sample, edit: AssumptionRow, v: string) =>
      editMovesOf(personaCtx('finance-fpa', { sample }), [edit], v)
        .map((m) => `${m.positionId}|${m.part}|${m.month}`)
        .sort()
    // 1. The vacancy factor: its smallest part and month holds exactly 5 movers (1110-AUS in Oct
    // 2026), one of them E10287's seat, whose allowance is 0 while E10287 is on unpaid leave.
    const vacancy: AssumptionRow = {
      version: W,
      table: 'vacancyFactor',
      org: 'Architecture',
      key: '*',
      value: 0.07,
    }
    const base = moversOf(s, vacancy, W)
    expect(
      editMovers(editMovesOf(personaCtx('finance-fpa', { sample: s }), [vacancy], W)).smallest?.count,
    ).toBe(5)
    for (const leavePaid of [false, true]) {
      const flipped = withWorker(s, 'E10287', { onLeave: true, leavePaid })
      expect(moversOf(flipped, vacancy, W), `paid ${leavePaid}`).toEqual(base)
      expect(assumptionEditCheck(personaCtx('finance-fpa', { sample: flipped }), [vacancy], W)).toBeNull()
    }
    // Through the write path, as Finance: saved with and without the unpaid leave.
    const fin = (sample: Sample): Who => ({
      mode: 'finance',
      personId: personaOf(sample, 'finance-fpa').employeeId,
    })
    for (const sample of [s, withWorker(s, 'E10287', { onLeave: true, leavePaid: false })]) {
      const sc = scenario({ sample })
      expect(
        (await sc.run(fin(sample), 'editAssumptions', { versionId: W, rows: [vacancy] })).outcome,
      ).toEqual({
        ok: true,
        notice: 'Assumptions saved in Working.',
      })
    }

    // 2. An FY28 benefits edit: its forecast's cohort lines are priced at a unit's average, which an
    // unpaid leave pulled down (565 movers on the sample, 8 with two Taiwan people unpaid).
    const v28 = 'fy28-working'
    const ben = s.datasets.assumptions.find(
      (r) => r.version === v28 && !r.org && r.table === 'benefits' && r.key === 'Taiwan',
    )
    const benefits: AssumptionRow = {
      version: v28,
      table: 'benefits',
      org: 'Analog & Mixed-Signal',
      key: 'Taiwan',
      value: (ben?.value ?? 0) * 1.02 + 7,
    }
    const taiwan = new Set(
      s.datasets.positions
        .filter(
          (p) =>
            p.department === 'Analog & Mixed-Signal' && siteByLocation.get(p.location)?.country === 'Taiwan',
        )
        .map((p) => p.positionId),
    )
    const people = [
      ...new Set(
        s.datasets.workers
          .filter(
            (w) =>
              w.positionId && taiwan.has(w.positionId) && w.workerType === 'Employee' && !w.terminationDate,
          )
          .map((w) => w.employeeId),
      ),
    ]
    expect(people.length).toBeGreaterThanOrEqual(2)
    const fy28 = moversOf(s, benefits, v28)
    expect(fy28.length).toBeGreaterThan(500)
    let two = s
    for (const id of people.slice(0, 2)) two = withWorker(two, id, { onLeave: true, leavePaid: false })
    expect(moversOf(two, benefits, v28)).toEqual(fy28)
  }, 300_000)
})
