/**
 * The 7.4 edit check (docs/PLAN.md 7.4, C14, R35, R37; M3 freeze `assumptionEditCheck` and
 * `editNoteOf`): HR admin's edits pass; Finance's caps, dates and pay percentages read "Set by import.";
 * every other Finance edit is priced before and after on Working's shown lines and its forecast, its
 * movers placed in the parts of Finance's fold the contract names, and refused when 1 to 4 move in all
 * or in one part and month. The note beside a value says why it cannot be changed in each mode.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { decide } from '@/access/policy'
import { editMovers } from '@/cost/edits'
import type { AnalyticsContext } from '@/data/context'
import type { AssumptionRow } from '@/data/schema'
import { sampleCtx } from '@/testkit/sample'
import { SET_BY_IMPORT } from './assumptions'
import { assumptionEditCheck, editMovesOf, editNoteOf, LOCKED_READ_ONLY, OWN_UNIT_ONLY } from './edits'

const W = 'fy27-working'
const row = (
  table: AssumptionRow['table'],
  key: string,
  value: number,
  org: string | null = null,
): AssumptionRow => ({
  version: W,
  table,
  org,
  key,
  value,
})

describe('assumptionEditCheck', () => {
  let fin: AnalyticsContext
  let admin: AnalyticsContext
  beforeAll(() => {
    fin = sampleCtx('finance')
    admin = sampleCtx('hr-admin')
  }, 120_000)

  it('HR admin edits pass; Finance’s tables set by import read "Set by import." before any pricing', () => {
    expect(assumptionEditCheck(admin, [row('burden', 'Taiwan|social', 0.2)], W)).toBeNull()
    expect(assumptionEditCheck(admin, [row('burdenCap', 'United States|socialSecurity', 1)], W)).toBeNull()
    for (const r of [row('burdenCap', 'United States|socialSecurity', 1), row('merit', 'FY27|pct', 0.05)])
      expect(assumptionEditCheck(fin, [r], W), r.table).toBe(SET_BY_IMPORT)
    expect(assumptionEditCheck(fin, [], W)).toBeNull()
  })

  it('places each mover in a part of Finance’s fold, the plan and forecast series apart', () => {
    const moves = editMovesOf(fin, [row('burden', 'Taiwan|social', 0.12)], W)
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      expect(m.part, m.positionId).toMatch(/^[^|]+\|(center\|[^|]+|other\|[^|]*\|[^|]+)$/)
      expect(m.month, m.positionId).toMatch(/^(forecast )?\d{4}-\d{2}$/)
    }
    expect(moves.some((m) => m.month.startsWith('forecast '))).toBe(true)
    expect(moves.some((m) => !m.month.startsWith('forecast '))).toBe(true)
    // 1550-HSZ's 3 people sit in Corporate's Other (Facilities × Taiwan): the edit moves 1 to 4 there.
    expect(editMovers(moves).smallest?.count).toBeLessThan(5)
    expect(assumptionEditCheck(fin, [row('burden', 'Taiwan|social', 0.12)], W)).toBe(
      'This change would move cost for fewer than 5 costed people.',
    )
  })

  it('lets through an edit that moves 5 or more in every part and month, or nobody', () => {
    expect(assumptionEditCheck(fin, [row('burden', 'Germany|social', 0.215)], W)).toBeNull()
    expect(editMovesOf(fin, [row('glAccount', 'base', 6101)], W)).toEqual([])
    expect(assumptionEditCheck(fin, [row('glAccount', 'base', 6101)], W)).toBeNull()
  }, 60_000)

  it('prices an edit of a locked version on a Working copy of it (a new Working starting from it)', () => {
    const r = { ...row('burden', 'Taiwan|social', 0.12), version: 'fy27-budget' }
    expect(assumptionEditCheck(fin, [r], 'fy27-budget')).toBe(
      'This change would move cost for fewer than 5 costed people.',
    )
  }, 60_000)
})

describe('editNoteOf', () => {
  it('reads the version, the mode and the table', () => {
    const fin = sampleCtx('finance')
    const admin = sampleCtx('hr-admin')
    const hrbp = sampleCtx('hrbp')
    const lead = sampleCtx('leader')
    // A locked version is read only for everyone.
    for (const c of [fin, admin, hrbp])
      expect(editNoteOf(c, row('band', 'P3|Austin|FY27', 1), 'fy27-budget')).toBe(LOCKED_READ_ONLY)
    expect(editNoteOf(admin, row('burdenCap', 'United States|socialSecurity', 1), W)).toBeNull()
    expect(editNoteOf(fin, row('burdenCap', 'United States|socialSecurity', 1), W)).toBe(SET_BY_IMPORT)
    expect(editNoteOf(fin, row('band', 'P3|Austin|FY27', 1), W)).toBeNull()
    expect(editNoteOf(fin, row('fillRate', '*', 0.9, 'Go-to-Market'), W)).toBeNull()
    // An HRBP: its own unit's operational rows only; the rest is Finance's.
    expect(editNoteOf(hrbp, row('fillRate', '*', 0.9, 'Silicon Engineering'), W)).toBeNull()
    expect(editNoteOf(hrbp, row('fillRate', '*', 0.9, 'Go-to-Market'), W)).toBe(OWN_UNIT_ONLY)
    expect(editNoteOf(hrbp, row('fillRate', '*', 0.9), W)).toBe(OWN_UNIT_ONLY)
    expect(editNoteOf(hrbp, row('band', 'P3|Austin|FY27', 1), W)).toBe(
      decide('hrbp', 'action:assumptions.edit').how,
    )
    expect(editNoteOf(lead, row('fillRate', '*', 0.9), W)).toBe(
      decide('leader', 'action:assumptions.edit-operational').how,
    )
  })
})
