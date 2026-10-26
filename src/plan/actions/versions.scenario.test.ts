/**
 * Versions, closes, FX and assumptions through the write path (docs/PLAN.md 5.4, 6.5, 6.6, 7.4, C28,
 * 16.1 "Locked totals hold", 17 M3): Finance locks FY27 Working into the Q2 Reforecast (its forecast
 * stored, its hash verifying, the Budget's and Q1's unchanged, Working still editable) and reopens it
 * as the new Working (exactly one Working for FY27, the old one retired and read only); a month
 * closes only in order and only with its actual rates, posting back-dated changes as adjustments;
 * Finance's FX and assumption edits pass through 7.4's edit rule (`env.assumptionEditRefusal`, the
 * finance-ui check) and a table HR admin sets by import is refused with "Set by import."; a new
 * Working for FY29 starts from FY28's rows.
 *
 * M3 review fixes: a month closes only once the as-of date is on or after its month-end (B8, R47);
 * a lock, a close and a new version are dated the as-of date while their entries keep the wall
 * clock (R47); a version's name refuses an amount (UI-3); Finance cannot close on an 'actual' rate it
 * wrote that moves 1 to 4 costed people (PV-1), set a rate for a closed month (PV-2), or create a
 * version with a set the check cannot price (PV-3); a Budget lock sets the standard head computed
 * from the Budget, and Working takes it (SP-13).
 */
import { describe, expect, it } from 'vitest'
import { actionContextOf, actionEnvOf } from '@/app/write/context'
import { budgetStandardHead } from '@/app/write/lock'
import { chainOk, said, scenario, type Who } from '@/app/write/scenario.testkit'
import { verifyLock, workingOf } from '@/plan/engine/versions'
import type { AssumptionRow, LockedVersion, WorkingVersion } from '@/plan/types'
import { leakSample, personaOf, withBackDatedComp } from '@/testkit/sample'
import { workingFrame, workingLines } from '@/views/targets/engine/working'
import {
  CANNOT_PRICE_TEXT,
  CLOSE_ORDER_TEXT,
  CLOSED_MONTH_RATE_TEXT,
  FX_SAVED_NOTICE,
  monthClosedNotice,
  ORG_FX_TEXT,
  REMOVE_AMOUNT_TEXT,
  reopenedNotice,
  SET_BY_IMPORT_TEXT,
  versionLockedNotice,
  WORKING_ONLY_TEXT,
  workingExistsText,
} from './copy'
import { editAssumptions, setFx } from './index'
import { STANDARD_HEAD_MOVED_TEXT } from './versions'

describe('lock and reopen (C28, 16.1)', () => {
  it('locks FY27 Working into a reforecast and reopens it as the one FY27 Working', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const hashes = new Map(s.plan.versions.filter((v) => v.hash).map((v) => [v.versionId, v.hash]))

    // HRBP mode does not lock; a second Budget is refused with lockInto's own sentence.
    const hr: Who = {
      mode: 'hrbp',
      personId: personaOf(s, 'hrbp-se').employeeId,
      unit: 'Silicon Engineering',
    }
    expect(
      (await sc.run(hr, 'lockVersion', { workingId: 'fy27-working', as: { kind: 'reforecast', name: 'x' } }))
        .outcome,
    ).toEqual({ ok: false, refused: 'Versions, closes, FX and freezes are Finance’s.'.replace('’', "'") })
    expect(
      (
        await sc.run(fin, 'lockVersion', {
          workingId: 'fy27-working',
          as: { kind: 'budget', name: 'FY27 Budget 2' },
        })
      ).outcome,
    ).toEqual({ ok: false, refused: 'FY27 already has a locked Budget. Lock a reforecast instead.' })

    const lock = await sc.run(fin, 'lockVersion', {
      workingId: 'fy27-working',
      as: { kind: 'reforecast', name: 'FY27 Q2 Reforecast' },
    })
    expect(lock.outcome).toEqual({ ok: true, notice: versionLockedNotice('FY27 Q2 Reforecast') })
    expect(lock.entries.map((e) => [e.object, e.id, e.field, e.by])).toEqual([
      ['version', 'fy27-q2-reforecast', 'locked', fin.personId],
    ])
    let plan = await sc.plan()
    const q2 = plan.versions.find((v) => v.versionId === 'fy27-q2-reforecast') as LockedVersion
    expect(q2).toMatchObject({
      state: 'locked',
      kind: 'reforecast',
      parentId: 'fy27-working',
      fiscalYear: 'FY27',
    })
    expect(verifyLock(q2)).toBe(true)
    expect(q2.forecast?.closedThrough).toBe('2026-09')
    expect(q2.lines.length).toBeGreaterThan(10_000)
    expect(workingOf(plan.versions, 'FY27')?.versionId).toBe('fy27-working')
    for (const [id, h] of hashes) expect(plan.versions.find((v) => v.versionId === id)?.hash, id).toBe(h)

    const reopen = await sc.run(fin, 'reopenVersion', { reforecastId: 'fy27-q2-reforecast' })
    plan = await sc.plan()
    const fy27 = plan.versions.filter((v) => v.fiscalYear === 'FY27')
    const working = fy27.filter((v) => v.state === 'working')
    expect(working).toHaveLength(1)
    expect(working[0]).toMatchObject({
      versionId: 'fy27-working-2',
      name: 'FY27 Working',
      parentId: 'fy27-q2-reforecast',
    })
    const retired = fy27.find((v) => v.versionId === 'fy27-working')
    expect(retired?.state).toBe('retired')
    expect(reopen.outcome).toEqual({
      ok: true,
      notice: reopenedNotice('FY27 Working', retired?.name as string),
    })
    expect(reopen.entries.map((e) => [e.object, e.id, e.field, e.old, e.new])).toEqual([
      ['version', 'fy27-working', 'state', 'working', 'retired'],
      ['version', 'fy27-working-2', 'state', null, 'working'],
    ])
    for (const [id, h] of hashes) expect(plan.versions.find((v) => v.versionId === id)?.hash, id).toBe(h)
    expect(verifyLock(plan.versions.find((v) => v.versionId === 'fy27-q2-reforecast') as LockedVersion)).toBe(
      true,
    )
    // The new Working carries the reforecast's rows, its FX as rows the engines read.
    const rows = plan.overlay.assumptions.filter((r) => r.version === 'fy27-working-2')
    expect(rows.length).toBe(
      q2.assumptions.filter((r) => r.table !== 'fx').length + rows.filter((r) => r.table === 'fx').length,
    )
    expect(rows.some((r) => r.table === 'fx' && r.key.includes('|plan|'))).toBe(true)
    // A retired version is read only: FX on it is refused.
    expect(
      (
        await sc.run(fin, 'setFx', {
          versionId: 'fy27-working',
          rates: [{ currency: 'EUR', set: 'plan', month: '2026-10', usdPerLocal: 1.1 }],
        })
      ).outcome,
    ).toEqual({ ok: false, refused: WORKING_ONLY_TEXT })
    expect(chainOk(await sc.log())).toBe(true)
  }, 180_000)
})

describe('month close (6.6)', () => {
  it('closes October once its actual rates are set, in order only, posting back-dated changes', async () => {
    // A back-dated raise in August (an HRIS import after the August close): October's close posts it.
    const base = leakSample()
    const raised = base.datasets.comp.find(
      (c) =>
        c.effectiveDate < '2026-08-01' &&
        base.datasets.workers.some((w) => w.employeeId === c.employeeId && !w.terminationDate),
    )?.employeeId as string
    // October closes once the data is as of its month-end (B8, R47): HR admin's reporting date.
    const sc = scenario({ sample: withBackDatedComp(base, raised, '2026-08-01', 6_000), asOf: '2026-10-31' })
    const s = sc.sample
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    // Months close in order from the first open month (October).
    expect((await sc.run(admin, 'closeMonth', { month: '2026-11' })).outcome).toEqual({
      ok: false,
      refused: CLOSE_ORDER_TEXT,
    })
    // October has no actual rates yet: the close says which.
    const early = await sc.run(admin, 'closeMonth', { month: '2026-10' })
    expect(early.outcome.ok).toBe(false)
    expect(early.outcome.ok ? '' : early.outcome.refused).toMatch(
      /^No actual rate for [A-Z]{3} in 2026-10\.$/,
    )

    // HR admin sets October's actual rates (September's, carried) in FY27 Working.
    const sep = s.datasets.assumptions.filter(
      (r) => r.version === 'fy27-working' && r.table === 'fx' && r.key.endsWith('|actual|2026-09'),
    )
    expect(sep.length).toBeGreaterThan(3)
    const fx = await sc.run(admin, 'setFx', {
      versionId: 'fy27-working',
      rates: sep.map((r) => ({
        currency: r.key.split('|')[0],
        set: 'actual' as const,
        month: '2026-10',
        usdPerLocal: r.value,
      })),
    })
    expect(fx.outcome).toEqual({ ok: true, notice: FX_SAVED_NOTICE })
    expect(fx.entries.every((e) => e.object === 'assumption' && e.field === 'value')).toBe(true)

    const close = await sc.run(admin, 'closeMonth', { month: '2026-10' })
    expect(close.outcome).toEqual({ ok: true, notice: monthClosedNotice('Oct 2026') })
    const plan = await sc.plan()
    const oct = plan.closes.find((c) => c.month === '2026-10')
    expect(oct?.by).toBe(admin.personId)
    expect(oct?.lines.length).toBeGreaterThan(1000)
    expect(close.entries[0]).toMatchObject({
      object: 'close',
      id: '2026-10',
      field: 'closed',
      new: oct?.hash,
    })
    // Back-dated changes to April to September post in October, the raise among them (August and
    // September, 'Other HRIS change'); the count is audited.
    const posted = plan.adjustments.filter((a) => a.postedIn === '2026-10')
    expect(posted.every((a) => a.forMonth < '2026-10')).toBe(true)
    const mine = posted.filter((a) => a.delta.employeeId === raised)
    expect(mine.map((a) => [a.forMonth, a.kind, a.reason])).toEqual([
      ['2026-08', 'other', 'Other HRIS change'],
      ['2026-09', 'other', 'Other HRIS change'],
    ])
    for (const a of mine) expect(a.delta.local.base).toBeGreaterThan(0)
    expect(close.entries.find((e) => e.field === 'adjustments')?.new).toBe(posted.length)
    // The next close is November's; October cannot close twice.
    expect((await sc.run(admin, 'closeMonth', { month: '2026-10' })).outcome).toEqual({
      ok: false,
      refused: CLOSE_ORDER_TEXT,
    })
    expect(chainOk(await sc.log())).toBe(true)
  }, 180_000)
})

describe('Finance’s FX and assumption edits under 7.4’s edit rule', () => {
  const rule = 'This change would move cost for fewer than 5 costed people.'

  it('refuses through the action what the finance check refuses, and a table set by import', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const ctx = await sc.ctx(fin)
    const base = actionContextOf(ctx, { readOnly: false, at: '2026-09-30T10:00:00.000Z' })
    const asked: { rows: readonly AssumptionRow[]; version: string }[] = []
    // The finance-ui check (src/views/finance/engine/edits.ts) is the env's; here it refuses TWD.
    const a = {
      ...base,
      env: {
        ...base.env,
        assumptionEditRefusal: (rows: readonly AssumptionRow[], version: string) => {
          asked.push({ rows, version })
          return rows.some((r) => r.key.startsWith('TWD')) ? rule : null
        },
      },
    }
    const twd = setFx(s.plan, a, {
      versionId: 'fy27-working',
      rates: [{ currency: 'TWD', set: 'plan', month: '2026-10', usdPerLocal: 0.032 }],
    })
    expect(twd).toEqual({ ok: false, refused: rule })
    expect(asked[0].version).toBe('fy27-working')
    expect(asked[0].rows[0]).toMatchObject({
      version: 'fy27-working',
      table: 'fx',
      org: null,
      key: 'TWD|plan|2026-10',
    })
    const eur = setFx(s.plan, a, {
      versionId: 'fy27-working',
      rates: [{ currency: 'EUR', set: 'plan', month: '2026-10', usdPerLocal: 1.09 }],
    })
    expect(eur.ok).toBe(true)
    if (eur.ok) {
      expect(eur.next.overlay.assumptions).toContainEqual({
        version: 'fy27-working',
        table: 'fx',
        org: null,
        key: 'EUR|plan|2026-10',
        value: 1.09,
      })
      expect(eur.audit[0]).toMatchObject({
        object: 'assumption',
        id: 'fy27-working|fx||EUR|plan|2026-10',
        field: 'value',
        by: fin.personId,
      })
    }
    // A cap, a date or a pay percentage is HR admin's: "Set by import." before any check runs.
    const n = asked.length
    for (const table of ['burdenCap', 'merit', 'bonusTarget'] as const) {
      const out = editAssumptions(s.plan, a, {
        versionId: 'fy27-working',
        rows: [{ version: 'x', table, org: null, key: '*', value: 1 }],
      })
      expect(out, table).toEqual({ ok: false, refused: SET_BY_IMPORT_TEXT })
    }
    expect(asked.length).toBe(n)
    // A Finance-editable value goes through the check, and is written when it passes.
    const band = editAssumptions(s.plan, a, {
      versionId: 'fy27-working',
      rows: [{ version: 'x', table: 'attrition', org: 'Go-to-Market', key: '*', value: 0.11 }],
    })
    expect(band.ok).toBe(true)
    expect(asked.length).toBe(n + 1)
  }, 120_000)

  it('creates FY29 Working once, from FY28’s rows; a set carrying a pay percentage is refused in Finance', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const input = {
      fiscalYear: 'FY28' as const,
      name: 'FY28 Working',
      proration: 'daily' as const,
      from: null,
      assumptions: [],
    }
    expect((await sc.run(admin, 'createVersion', input)).outcome).toEqual({
      ok: false,
      refused: workingExistsText('FY28'),
    })
    const pay = await sc.run(fin, 'createVersion', {
      ...input,
      fiscalYear: 'FY29',
      name: 'FY29 Working',
      from: 'fy28-working',
      assumptions: [{ version: 'fy29-working', table: 'merit', org: null, key: 'pct|FY29', value: 0.05 }],
    })
    expect(pay.outcome).toEqual({ ok: false, refused: SET_BY_IMPORT_TEXT })
    const ok = await sc.run(admin, 'createVersion', {
      ...input,
      fiscalYear: 'FY29',
      name: 'FY29 Working',
      from: 'fy28-working',
    })
    expect(ok.outcome).toEqual({ ok: true, notice: 'FY29 Working is the FY29 Working.' })
    const plan = await sc.plan()
    const v = plan.versions.find((x) => x.versionId === 'fy29-working')
    expect(v).toMatchObject({
      state: 'working',
      fiscalYear: 'FY29',
      grid: { from: '2028-04', to: '2029-09' },
      parentId: 'fy28-working',
    })
    const fy28Rows = s.datasets.assumptions.filter((r) => r.version === 'fy28-working')
    expect(plan.overlay.assumptions.filter((r) => r.version === 'fy29-working')).toHaveLength(fy28Rows.length)
    expect(ok.entries.map((e) => [e.object, e.field])).toEqual([['version', 'created']])
  }, 120_000)
})

describe('the business date of a version write (R47) and when a month closes (B8)', () => {
  it('refuses a close before the month ends, dates a lock the as-of date and keeps the clock on its entry', async () => {
    // The wall clock is weeks after the data's as-of date (30 Sep 2026).
    const sc = scenario({ start: '2026-10-24T13:05:00.000Z' })
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    for (const who of [fin, admin])
      expect((await sc.run(who, 'closeMonth', { month: '2026-10' })).outcome).toEqual({
        ok: false,
        refused: 'Oct 2026 closes once the data is as of 31 Oct 2026 or later.',
      })
    const lock = await sc.run(fin, 'lockVersion', {
      workingId: 'fy27-working',
      as: { kind: 'reforecast', name: 'FY27 Q2 Reforecast' },
    })
    expect(lock.outcome.ok).toBe(true)
    const q2 = (await sc.plan()).versions.find((v) => v.versionId === 'fy27-q2-reforecast') as LockedVersion
    expect(q2.lockedAt?.slice(0, 10)).toBe('2026-09-30')
    expect(lock.entries[0].at.slice(0, 10)).toBe('2026-10-24')
    expect(lock.entries[0].effectiveDate).toBe('2026-09-30')
    const made = await sc.run(admin, 'createVersion', {
      fiscalYear: 'FY29',
      name: 'FY29 Working',
      proration: 'daily',
      from: 'fy28-working',
      assumptions: [],
    })
    expect(made.outcome.ok).toBe(true)
    const fy29 = (await sc.plan()).versions.find((v) => v.versionId === 'fy29-working')
    expect(fy29?.createdAt.slice(0, 10)).toBe('2026-09-30')
    expect(made.entries[0].at.slice(0, 10)).toBe('2026-10-24')
    // A reconciliation review is dated the as-of date too.
    const ex = actionEnvOf(await sc.ctx(fin)).exceptions()
    expect(ex.length).toBeGreaterThan(0)
    const review = await sc.run(fin, 'markReviewed', { exceptionIds: [ex[0].id] })
    expect(review.outcome.ok).toBe(true)
    expect((await sc.plan()).reviewed.find((r) => r.exceptionId === ex[0].id)?.at.slice(0, 10)).toBe(
      '2026-09-30',
    )
    expect(review.entries[0].at.slice(0, 10)).toBe('2026-10-24')
    expect(chainOk(await sc.log())).toBe(true)
  }, 180_000)
})

describe('a version name a manager reads (UI-3, 8.4 rule 5)', () => {
  it('refuses an amount in a lock’s name or a new Working’s name at entry', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const lock = await sc.run(fin, 'lockVersion', {
      workingId: 'fy27-working',
      as: { kind: 'reforecast', name: 'FY27 Q2 Reforecast, cut to $57.1M' },
    })
    expect(lock.outcome).toEqual({ ok: false, refused: REMOVE_AMOUNT_TEXT })
    const made = await sc.run(fin, 'createVersion', {
      fiscalYear: 'FY29',
      name: 'FY29 Working at 95k a head',
      proration: 'daily',
      from: 'fy28-working',
      assumptions: [],
    })
    expect(made.outcome).toEqual({ ok: false, refused: REMOVE_AMOUNT_TEXT })
    expect(await sc.log()).toEqual([])
  })
})

describe('FX rates Finance cannot use to price one person (PV-1, PV-2, PV-3)', () => {
  const rule = 'This change would move cost for fewer than 5 costed people.'

  it('refuses a close on an actual rate written in the app that moves 1 to 4 costed people', async () => {
    const sc = scenario({ asOf: '2026-10-31' })
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const sep = s.datasets.assumptions.filter(
      (r) => r.version === 'fy27-working' && r.table === 'fx' && r.key.endsWith('|actual|2026-09'),
    )
    expect(sep.some((r) => r.key.startsWith('CAD|'))).toBe(true)
    const rates = (cad: number) =>
      sep.map((r) => {
        const currency = r.key.split('|')[0]
        return {
          currency,
          set: 'actual' as const,
          month: '2026-10' as const,
          usdPerLocal: currency === 'CAD' ? cad : r.value,
        }
      })
    // HR admin writes October's actual rates with CAD at 1,000 USD a dollar (what a probe would try).
    expect((await sc.run(admin, 'setFx', { versionId: 'fy27-working', rates: rates(1000) })).outcome.ok).toBe(
      true,
    )
    expect((await sc.run(fin, 'closeMonth', { month: '2026-10' })).outcome).toEqual({
      ok: false,
      refused: rule,
    })
    // At the month's forecast rate the close goes through.
    const cad = sep.find((r) => r.key.startsWith('CAD|'))?.value as number
    expect((await sc.run(admin, 'setFx', { versionId: 'fy27-working', rates: rates(cad) })).outcome.ok).toBe(
      true,
    )
    expect(said((await sc.run(fin, 'closeMonth', { month: '2026-10' })).outcome)).toBe(
      monthClosedNotice('Oct 2026'),
    )
  }, 240_000)

  it('keeps a closed month’s rates read only outside HR admin', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    for (const [currency, set] of [
      ['CAD', 'plan'],
      ['EUR', 'plan'],
      ['EUR', 'actual'],
    ] as const)
      expect(
        (
          await sc.run(fin, 'setFx', {
            versionId: 'fy27-working',
            rates: [{ currency, set, month: '2026-05', usdPerLocal: 1000 }],
          })
        ).outcome,
        `${currency} ${set}`,
      ).toEqual({ ok: false, refused: CLOSED_MONTH_RATE_TEXT })
    expect(
      (
        await sc.run(admin, 'setFx', {
          versionId: 'fy27-working',
          rates: [{ currency: 'EUR', set: 'plan', month: '2026-05', usdPerLocal: 1.08 }],
        })
      ).outcome.ok,
    ).toBe(true)
  }, 120_000)

  it('refuses a new Working’s set it cannot price on the months it reaches', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const input = {
      fiscalYear: 'FY29' as const,
      name: 'FY29 Working',
      proration: 'daily' as const,
      from: 'fy28-working' as string | null,
      assumptions: [{ version: 'x', table: 'fx' as const, org: null, key: 'CAD|plan|2028-10', value: 1000 }],
    }
    // October 2028 is outside FY28 Working's grid (Apr 2027 to Sep 2028): no check could price it there.
    expect((await sc.run(fin, 'createVersion', input)).outcome).toEqual({
      ok: false,
      refused: CANNOT_PRICE_TEXT,
    })
    // From no version at all, nothing prices a set.
    expect(
      (
        await sc.run(fin, 'createVersion', {
          ...input,
          from: null,
          assumptions: [{ version: 'x', table: 'attrition', org: null, key: '*', value: 0.2 }],
        })
      ).outcome,
    ).toEqual({ ok: false, refused: CANNOT_PRICE_TEXT })
    // HR admin's set is not refused by the rule.
    expect((await sc.run(admin, 'createVersion', input)).outcome.ok).toBe(true)
  }, 120_000)
})

describe('an FX row keyed to an org (review recheck)', () => {
  it('is refused in every mode, and a month close never prices one', async () => {
    const sc = scenario({ asOf: '2026-10-31' })
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const row = {
      version: 'fy27-working',
      table: 'fx' as const,
      org: 'Corporate',
      key: 'CAD|actual|2026-10',
      value: 1000,
    }
    for (const who of [fin, admin]) {
      expect(
        (await sc.run(who, 'editAssumptions', { versionId: 'fy27-working', rows: [row] })).outcome,
        who.mode,
      ).toEqual({
        ok: false,
        refused: ORG_FX_TEXT,
      })
      expect(
        (
          await sc.run(who, 'removeOverride', {
            versionId: 'fy27-working',
            table: 'fx',
            org: 'Corporate',
            key: row.key,
          })
        ).outcome,
        who.mode,
      ).toEqual({ ok: false, refused: ORG_FX_TEXT })
    }
    expect(
      (
        await sc.run(admin, 'createVersion', {
          fiscalYear: 'FY29',
          name: 'FY29 Working',
          proration: 'daily',
          from: 'fy28-working',
          assumptions: [{ ...row, key: 'CAD|plan|2028-06' }],
        })
      ).outcome,
    ).toEqual({ ok: false, refused: ORG_FX_TEXT })
    // A state that holds one anyway (written before this rule, or merged in) closes October once
    // October's company rates are in: the rate table never reads the org's row, nor does the close.
    const rates = s.datasets.assumptions
      .filter(
        (r) =>
          r.version === 'fy27-working' && r.table === 'fx' && !r.org && r.key.endsWith('|actual|2026-09'),
      )
      .map((r) => ({
        currency: r.key.split('|')[0],
        set: 'actual' as const,
        month: '2026-10' as const,
        usdPerLocal: r.value,
      }))
    expect((await sc.run(admin, 'setFx', { versionId: 'fy27-working', rates })).outcome.ok).toBe(true)
    const stored = await sc.harness.store.load()
    await sc.harness.store.save({
      ...stored,
      overlay: { ...stored.overlay, assumptions: [...stored.overlay.assumptions, row] },
    })
    expect(said((await sc.run(fin, 'closeMonth', { month: '2026-10' })).outcome)).toBe(
      monthClosedNotice('Oct 2026'),
    )
  }, 240_000)
})

describe('the standard head at a Budget lock (11.2, SP-13)', () => {
  it('stores the one computed from the Budget, which Working takes with an entry, and refuses a stale one', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    // HR admin raises every FY28 P-level band by 15%, so the computed head moves off the one in use.
    const bands = s.datasets.assumptions.filter(
      (r) => r.version === 'fy28-working' && r.table === 'band' && /^P\d\|/.test(r.key),
    )
    expect(bands.length).toBeGreaterThan(10)
    const raised = await sc.run(admin, 'editAssumptions', {
      versionId: 'fy28-working',
      rows: bands.map((r) => ({ ...r, value: Math.round(r.value * 1.15) })),
    })
    expect(raised.outcome.ok).toBe(true)
    const inUse = s.datasets.assumptions.find(
      (r) => r.version === 'fy28-working' && r.table === 'trade' && r.key === 'standardHeadUsd',
    )?.value as number
    const ctx = await sc.ctx(fin)
    const working = workingOf(ctx.versions, 'FY28') as WorkingVersion
    const computed = budgetStandardHead(
      ctx,
      working,
      workingLines(ctx, workingFrame(ctx, 'FY28')),
      `${ctx.asOf}T09:00:00.000Z`,
    )
    expect(computed).not.toBeNull()
    expect(computed).not.toBe(inUse)
    expect((computed as number) % 1000).toBe(0)

    const stale = await sc.run(fin, 'lockVersion', {
      workingId: 'fy28-working',
      as: { kind: 'budget', name: 'FY28 Budget' },
      standardHeadUsd: inUse,
    })
    expect(stale.outcome).toEqual({ ok: false, refused: STANDARD_HEAD_MOVED_TEXT })

    const lock = await sc.run(fin, 'lockVersion', {
      workingId: 'fy28-working',
      as: { kind: 'budget', name: 'FY28 Budget' },
      standardHeadUsd: computed,
    })
    expect(lock.outcome).toEqual({ ok: true, notice: versionLockedNotice('FY28 Budget') })
    const plan = await sc.plan()
    const budget = plan.versions.find((v) => v.versionId === 'fy28-budget') as LockedVersion
    expect(budget.assumptions.find((r) => r.table === 'trade' && r.key === 'standardHeadUsd')?.value).toBe(
      computed,
    )
    expect(verifyLock(budget)).toBe(true)
    expect(lock.entries.map((e) => [e.object, e.id, e.field, e.old, e.new])).toEqual([
      ['version', 'fy28-budget', 'locked', null, expect.anything()],
      ['assumption', 'fy28-working|trade||standardHeadUsd', 'value', inUse, computed],
    ])
    expect(
      plan.overlay.assumptions.find(
        (r) => r.version === 'fy28-working' && r.table === 'trade' && r.key === 'standardHeadUsd',
      )?.value,
    ).toBe(computed)
    expect(chainOk(await sc.log())).toBe(true)
  }, 300_000)
})
