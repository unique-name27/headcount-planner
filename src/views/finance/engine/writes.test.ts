/**
 * Finance's write side as each mode's model holds it (docs/PLAN.md 8.3, 9.4; M3): every form choice
 * is a model value, built under the policy, so a mode the policy hides an action in gets no choices
 * and no values for it. Finance and HR admin get the lock, reopen, close and create choices, the
 * assumption tables they edit (Finance never the ones set by import), the FX form, the freeze orgs and
 * the exceptions to mark reviewed; HRBP gets only its unit's operational settings and its unit's
 * exceptions; Leader and Manager get nothing. What a mode must not see: no Manager writes model holds
 * an amount, no HRBP, Leader or Finance writes model holds a person's pay, and HRBP's holds no other
 * unit's row.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { decide } from '@/access/policy'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { isHrAdminOnly, type Mode } from '@/data/schema'
import { severanceOf } from '@/plan/engine/cost'
import { C4 } from '@/plan/engine/fixtures/cost'
import { amountsIn, leaks, secretsOf } from '@/testkit/leaks'
import { leakSample, sampleCtx } from '@/testkit/sample'
import { OPERATIONAL_TABLES, ownOrg } from './edits'
import { financeModel } from './index'

const SE = 'Silicon Engineering'
const MODES: readonly Mode[] = ['manager', 'hrbp', 'leader', 'finance', 'hr-admin']

describe('Finance’s write side per mode', () => {
  let s: Sample
  const ctx = new Map<Mode, AnalyticsContext>()
  beforeAll(() => {
    s = leakSample()
    for (const m of MODES) ctx.set(m, sampleCtx(m))
  }, 120_000)
  const writesOf = (m: Mode) => {
    const f = financeModel(ctx.get(m) as AnalyticsContext)
    return {
      versions: f.versions.writes,
      assumptions: f.assumptions.writes,
      freezes: f.freezes.writes,
      reconcile: f.reconcile.writes,
      rows: f.reconcile.exceptions.rows,
    }
  }

  it('Finance: lock, reopen, close and create, with the choices the actions take', () => {
    const w = writesOf('finance').versions
    for (const a of [w.lock.access, w.reopen.access, w.close.access, w.create.access])
      expect(a.shown).toBe(true)
    expect(w.lock.choices.map((c) => [c.workingId, c.kind, c.suggestedName])).toEqual([
      ['fy27-working', 'reforecast', 'FY27 Q2 Reforecast'],
      ['fy28-working', 'budget', 'FY28 Budget'],
    ])
    expect(w.lock.choices[0].locked).toEqual(['FY27 Budget', 'FY27 Q1 Reforecast'])
    expect(w.reopen.choices.map((c) => [c.reforecastId, c.workingName])).toEqual([
      ['fy27-q1-reforecast', 'FY27 Working'],
    ])
    // The confirm lists Working's rows that differ from the reforecast: none on the sample (the
    // scenario test changes a rate and reads it there).
    expect(w.reopen.choices[0].replaced).toEqual([])
    expect(w.close.choice).toMatchObject({ month: '2026-10', label: 'Oct 2026', workingId: 'fy27-working' })
    // October has no actual rates yet: the form offers September's as a start.
    expect(w.close.choice?.missingRates.length).toBeGreaterThan(0)
    expect(w.close.choice?.carry.map((r) => r.currency)).toEqual(w.close.choice?.missingRates)
    expect(w.close.choice?.carryFrom).toBe('Sep 2026')
    // R47 (browser B8): October ends after the data's as-of date (30 Sep), so it cannot close yet.
    expect(w.close.choice?.notYet).toBe('Oct 2026 closes once the data is as of 31 Oct 2026 or later.')
    // From 31 October on it can.
    const later = financeModel(sampleCtx('finance', { asOfOverride: '2026-10-31' })).versions.writes.close
      .choice
    expect(later).toMatchObject({ month: '2026-10', notYet: null })
    expect(w.create.years).toEqual(['FY29'])
    expect(w.create.defaultFrom).toBe('fy28-working')
  })

  it('HRBP sees Versions read only: no choice at all, the policy’s words', () => {
    const w = writesOf('hrbp').versions
    for (const a of [w.lock.access, w.reopen.access, w.close.access, w.create.access]) {
      expect(a.shown).toBe(false)
      expect(a.note).toBe(decide('hrbp', 'action:version.lock').how)
    }
    expect(w.lock.choices).toEqual([])
    expect(w.reopen.choices).toEqual([])
    expect(w.close.choice).toBeNull()
    expect(w.create.years).toEqual([])
  })

  it('assumptions: HR admin edits every table, Finance all but the ones set by import, HRBP its unit’s operational rows', () => {
    const admin = writesOf('hr-admin').assumptions
    expect(admin.tables.some((t) => isHrAdminOnly(t.table))).toBe(true)
    expect(admin.rule).toBeNull()
    expect(admin.fxForm?.currencies).toContain('TWD')
    const fin = writesOf('finance').assumptions
    expect(fin.versionId).toBe('fy27-working')
    expect(fin.tables.some((t) => isHrAdminOnly(t.table))).toBe(false)
    expect(fin.tables.map((t) => t.table)).toContain('burden')
    expect(fin.tables.every((t) => t.action === 'editAssumptions')).toBe(true)
    expect(fin.rule).toBe('A change that moves cost for fewer than 5 costed people is refused.')
    expect(fin.fxForm?.sets).toEqual(['plan', 'actual', 'forecast'])
    for (const t of fin.tables) for (const v of t.values) expect(v.note, `${t.table} ${v.key}`).toBeNull()
    const hr = writesOf('hrbp').assumptions
    const hrCtx = ctx.get('hrbp') as AnalyticsContext
    expect(hr.edit.shown).toBe(false)
    expect(hr.fx.shown).toBe(false)
    expect(hr.fxForm).toBeNull()
    expect(hr.tables.length).toBeGreaterThan(0)
    for (const t of hr.tables) {
      expect(OPERATIONAL_TABLES.has(t.table), t.table).toBe(true)
      expect(t.action).toBe('editOperational')
      for (const v of t.values) expect(ownOrg(hrCtx, v.org), `${t.table} ${v.org}`).toBe(true)
      for (const o of t.orgs) expect(ownOrg(hrCtx, o), o).toBe(true)
    }
    // Silicon Engineering's own fill rate is offered; the company's and another unit's are not.
    expect(hr.tables.find((t) => t.table === 'fillRate')?.values.map((v) => v.org)).toEqual([SE])
    for (const m of ['leader', 'manager'] as const) {
      const w = writesOf(m).assumptions
      expect(w.tables, m).toEqual([])
      expect(w.fxForm, m).toBeNull()
    }
  })

  it('every table hint on Finance > Assumptions is written for a reader (14.3; review CP-6)', () => {
    let read = 0
    for (const m of ['finance', 'hr-admin'] as const)
      for (const t of writesOf(m).assumptions.tables) {
        const where = `${m} ${t.label}`
        read++
        expect(t.hint.trim(), where).not.toBe('')
        // No document path, plan reference or code key spelled as a developer writes it.
        expect(t.hint, where).not.toMatch(/docs\/|PLAN|\.md\b|\b[a-z]+[A-Z][A-Za-z]*\b/)
        expect(t.hint, where).not.toContain('!')
        expect(t.hint.includes(String.fromCharCode(0x2014)), `${where}: an em dash`).toBe(false)
        expect(t.hint[0], where).toBe(t.hint[0].toUpperCase())
      }
    // Both modes list every table they edit, Trade rates included.
    expect(read).toBeGreaterThan(20)
    expect(writesOf('finance').assumptions.tables.map((t) => t.label)).toContain('Trade rates')
  })

  it('the Severance hint books where the engine does: the month of the day after the last day (review HL-4)', () => {
    // Fixture C4: a 31 Dec last day books in January, a 15 Dec one in December (cost.ts severanceOf).
    const booked = C4.severance.flatMap((c) => {
      const item = severanceOf(c.input)
      return item && c.input.endDate ? [{ end: c.input.endDate, month: item.month }] : []
    })
    expect(booked).toEqual([
      { end: '2026-12-31', month: '2027-01' },
      { end: '2026-12-15', month: '2026-12' },
    ])
    for (const m of ['finance', 'hr-admin'] as const) {
      const hint = writesOf(m).assumptions.tables.find((t) => t.table === 'severance')?.hint ?? ''
      expect(hint, m).toBe(
        'Months of local base, booked once in the month of the day after an eliminated Filled seat’s last day.',
      )
      // A 15 Dec last day books in December, not "the month after".
      expect(hint, m).not.toContain('in the month after')
    }
  })

  it('freezes: Finance and HR admin create and edit; HRBP, Leader and Manager are given no org', () => {
    for (const m of ['finance', 'hr-admin'] as const) {
      const w = writesOf(m).freezes
      expect(w.create.access.shown, m).toBe(true)
      expect(new Set(w.create.orgs.map((o) => o.kind))).toEqual(
        new Set(['unit', 'department', 'costCenter', 'leader']),
      )
      expect(w.edit.freezeIds.length, m).toBeGreaterThan(0)
      expect(w.create.defaultStart).toBe('2026-09-30')
    }
    for (const m of ['hrbp', 'leader', 'manager'] as const) {
      const w = writesOf(m).freezes
      expect(w.create.access.shown, m).toBe(false)
      expect(w.create.orgs, m).toEqual([])
      expect(w.edit.freezeIds, m).toEqual([])
    }
  })

  it('Mark reviewed: Finance any open exception; HRBP only its own unit’s', () => {
    const fin = writesOf('finance')
    expect(fin.reconcile.access.shown).toBe(true)
    expect(fin.reconcile.reviewable).toEqual(fin.rows.filter((r) => !r.reviewed).map((r) => r.id))
    expect(fin.reconcile.reviewable.length).toBeGreaterThan(0)
    const hr = writesOf('hrbp')
    expect(hr.reconcile.access.shown).toBe(true)
    // HRBP's scope is its unit: every row it sees is its own, and each is reviewable while open.
    expect(hr.reconcile.reviewable).toEqual(hr.rows.filter((r) => !r.reviewed).map((r) => r.id))
    const outside = fin.rows.filter((r) => !hr.rows.some((x) => x.id === r.id))
    expect(outside.length).toBeGreaterThan(0)
    for (const r of outside) expect(hr.reconcile.reviewable.includes(r.id)).toBe(false)
    for (const m of ['leader', 'manager'] as const) expect(writesOf(m).reconcile.reviewable, m).toEqual([])
  })

  it('what a mode must not see: no amount in Manager’s writes, no person’s pay in any other mode’s', () => {
    const secrets = secretsOf(s.datasets)
    const pay = (text: string) => leaks(text, secrets).filter((x) => x.startsWith('pay '))
    const m = writesOf('manager')
    const managerText = JSON.stringify(m)
    expect(amountsIn(managerText)).toEqual([])
    expect(pay(managerText)).toEqual([])
    for (const mode of ['hrbp', 'leader'] as const)
      expect(pay(JSON.stringify(writesOf(mode))), mode).toEqual([])
    // Finance's and HR admin's version, freeze and reconcile forms carry no pay (assumption values are
    // structure: band midpoints, rates and loads, the tab's own table).
    for (const mode of ['finance', 'hr-admin'] as const) {
      const w = writesOf(mode)
      const text = JSON.stringify({ ...w.versions, reopen: null, freezes: w.freezes, reconcile: w.reconcile })
      expect(pay(text), mode).toEqual([])
    }
    // No HRBP model value names another unit's operational row (the sample’s HRBP supports Silicon Engineering).
    expect(JSON.stringify(writesOf('hrbp').assumptions)).not.toContain('Go-to-Market')
  })
})
