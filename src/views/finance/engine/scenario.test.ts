/**
 * Finance's tabs walked through the write path as the app runs them (docs/PLAN.md 6.5, 6.6, 6.10,
 * 7.4, 10.4, C28, C32, 16.1; docs/CONTRACTS-M3.md 3, finance-ui): every step takes its input from the
 * tab's model (`writes`), runs the action through the write harness (src/app/write/harness.ts, the
 * MemoryStore and a ticking clock) and reads the models again. After each flow the audit chain
 * verifies and every entry is signed by the step's Acting as person.
 *
 *  - Versions: lock FY27 Working as the Q2 Reforecast ("Hash still verifies", every other hash
 *    unchanged, Working still editable), change one rate, then reopen the Q2 Reforecast (the confirm
 *    lists that rate; exactly one FY27 Working after, the old one retired and read only).
 *  - Month close: October's actual rates set from September's through the close form, October closed
 *    (its close in the list, its hash verifying, its atom index and one-time items stored), and its
 *    back-dated adjustments: counts and a company-level sum in Finance, counts only in HRBP mode,
 *    every amount in HR admin with Show pay amounts on.
 *  - Assumptions: a Taiwan burden rate refused under 7.4 and nothing written; an EUR plan rate saved
 *    and shown; an HRBP's own fill rate saved, another unit's refused.
 *  - Freezes: a freeze created holds openings (savings in Finance, openings held only in HRBP mode),
 *    and its end date changed.
 *  - Reconcile: Mark reviewed from the model's list; an HRBP is refused outside its unit.
 */
import { describe, expect, it } from 'vitest'
import { chainOk, hrbpUnitOf, scenario, type Who } from '@/app/write/scenario.testkit'
import { editRefusedText } from '@/cost/edits'
import { SHOWS_IN_FINANCE_NOTE } from '@/cost/guard'
import { monthEnd } from '@/data/fiscal'
import type { Sample } from '@/data/sample'
import { OUTSIDE_UNIT_TEXT } from '@/plan/actions/copy'
import type { AnyVersion, PlanLine } from '@/plan/types'
import { leakSample, personaOf, sampleCtx, withBackDatedComp } from '@/testkit/sample'
import { closeLinesOf, versionLinesOf } from '@/views/plan/engine/core'
import { financeModel } from './index'
import { COMPANY_ONLY_NOTE } from './versions'

const SE = 'Silicon Engineering'
const finOf = (s: Sample): Who => ({ mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId })
const hrbpOf = (s: Sample): Who => ({ mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE })
const signedBy = (entries: readonly { by: string }[], who: Who) => entries.every((e) => e.by === who.personId)

describe('Finance > Versions: lock and reopen (C28, 16.1)', () => {
  it('locks the Q2 Reforecast from the model’s choice and reopens it as the one FY27 Working', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin = finOf(s)
    let m = financeModel(await sc.ctx(fin))
    const choice = m.versions.writes.lock.choices.find((c) => c.workingId === 'fy27-working')
    expect(choice).toMatchObject({ kind: 'reforecast', suggestedName: 'FY27 Q2 Reforecast' })
    const hashes = m.versions.versions.rows.filter((r) => r.hash).map((r) => [r.versionId, r.hash] as const)
    expect(hashes.length).toBe(2)

    const lock = await sc.run(fin, 'lockVersion', {
      workingId: 'fy27-working',
      as: { kind: 'reforecast', name: choice?.suggestedName ?? '' },
    })
    expect(lock.outcome).toEqual({
      ok: true,
      notice: 'FY27 Q2 Reforecast is locked. Working stays editable.',
    })
    expect(signedBy(lock.entries, fin)).toBe(true)
    m = financeModel(await sc.ctx(fin))
    const rows = m.versions.versions.rows
    expect(rows.find((r) => r.name === 'FY27 Q2 Reforecast')).toMatchObject({
      state: 'locked',
      kind: 'reforecast',
      verifies: true,
      verifiesText: 'Hash still verifies',
      lockedBy: personaOf(s, 'finance-fpa').name,
    })
    for (const [id, h] of hashes)
      expect(
        rows.find((r) => r.versionId === id),
        id,
      ).toMatchObject({ hash: h, verifies: true })
    expect(m.versions.kpis.find((k) => k.id === 'finance-versions-locked')?.value).toBe(3)
    // Working stays editable: the next lock is the Q3 Reforecast, and Q2 can be reopened.
    expect(m.versions.writes.lock.choices.find((c) => c.workingId === 'fy27-working')?.suggestedName).toBe(
      'FY27 Q3 Reforecast',
    )

    // One rate changed in Working after the lock: the reopen confirm lists it.
    const eur = (await sc.ctx(fin)).all.assumptions.find(
      (r) => r.version === 'fy27-working' && r.table === 'fx' && r.key === 'EUR|plan|2026-11',
    )
    const next = Math.round((eur?.value ?? 1) * 1.01 * 1e6) / 1e6
    const fx = await sc.run(fin, 'setFx', {
      versionId: 'fy27-working',
      rates: [{ currency: 'EUR', set: 'plan', month: '2026-11', usdPerLocal: next }],
    })
    expect(fx.outcome).toEqual({ ok: true, notice: 'FX rates saved in Working.' })
    m = financeModel(await sc.ctx(fin))
    const reopen = m.versions.writes.reopen.choices.find((c) => c.reforecastId === 'fy27-q2-reforecast')
    expect(reopen?.replaced).toContainEqual({
      table: 'FX rates (plan)',
      org: null,
      key: 'EUR|plan|2026-11',
      working: next,
      reforecast: eur?.value,
    })

    const out = await sc.run(fin, 'reopenVersion', { reforecastId: 'fy27-q2-reforecast' })
    expect(out.outcome.ok).toBe(true)
    m = financeModel(await sc.ctx(fin))
    const fy27 = m.versions.versions.rows.filter((r) => r.fiscalYear === 'FY27')
    expect(fy27.filter((r) => r.state === 'working').map((r) => r.versionId)).toEqual(['fy27-working-2'])
    expect(fy27.find((r) => r.versionId === 'fy27-working')).toMatchObject({
      state: 'retired',
      verifiesText: 'Working, not locked',
    })
    expect(fy27.find((r) => r.versionId === 'fy27-working')?.name).toMatch(
      /^FY27 Working \(replaced \d+ \w+ \d{4}\)$/,
    )
    for (const r of fy27.filter((x) => x.state === 'locked'))
      expect(r.verifiesText, r.name).toBe('Hash still verifies')
    for (const [id, h] of hashes) expect(fy27.find((r) => r.versionId === id)?.hash, id).toBe(h)
    // The new Working is where edits and locks go now.
    expect(m.versions.writes.lock.choices.find((c) => c.fiscalYear === 'FY27')?.workingId).toBe(
      'fy27-working-2',
    )
    // HRBP reads the same versions, read only.
    const hr = financeModel(await sc.ctx(hrbpOf(s))).versions
    expect(hr.versions.rows.map((r) => r.versionId)).toEqual(m.versions.versions.rows.map((r) => r.versionId))
    expect(hr.writes.lock.choices).toEqual([])
    expect(chainOk(await sc.log())).toBe(true)
  }, 240_000)
})

describe('Finance > Versions: a Budget lock sets the standard head computed from it (11.2, SP-13)', () => {
  it('shows "Compute from Budget" in the lock dialog and the lock stores the value Finance confirmed', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin = finOf(s)
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const choiceOf = async () =>
      financeModel(await sc.ctx(fin)).versions.writes.lock.choices.find((c) => c.workingId === 'fy28-working')
    // On the sample the computed value (178,357.92) rounds to the 178,000 in use.
    expect((await choiceOf())?.standardHeadUsd).toBe(178_000)
    // HR admin raises every FY28 P-level band by 15%: the Budget's own computation moves, Working's row does not.
    const bands = s.datasets.assumptions.filter(
      (a) =>
        a.version === 'fy28-working' &&
        a.table === 'band' &&
        a.key.startsWith('P') &&
        a.key.endsWith('|FY28'),
    )
    expect(bands.length).toBeGreaterThan(0)
    const raised = await sc.run(admin, 'editAssumptions', {
      versionId: 'fy28-working',
      rows: bands.map((r) => ({ ...r, value: Math.round(r.value * 1.15) })),
    })
    expect(raised.outcome.ok).toBe(true)
    const choice = await choiceOf()
    expect(choice).toMatchObject({ kind: 'budget', standardHeadUsd: 197_000 })
    expect(choice?.standardHeadNote).toMatch(/^Computed from this Budget\./)
    const lock = await sc.run(fin, 'lockVersion', {
      workingId: 'fy28-working',
      as: { kind: 'budget', name: 'FY28 Budget' },
      standardHeadUsd: choice?.standardHeadUsd ?? null,
    })
    expect(lock.outcome).toEqual({ ok: true, notice: 'FY28 Budget is locked. Working stays editable.' })
    const budget = (await sc.plan()).versions.find((v) => v.fiscalYear === 'FY28' && v.state === 'locked')
    const head =
      budget && 'assumptions' in budget
        ? budget.assumptions.find((a) => a.table === 'trade' && a.key === 'standardHeadUsd')
        : null
    expect(head?.value).toBe(197_000)
    // The next lock of FY28 is a reforecast: it carries the Budget's value, so there is nothing to confirm.
    expect((await choiceOf())?.standardHeadUsd).toBeNull()
    expect(chainOk(await sc.log())).toBe(true)
  }, 240_000)
})

describe('Finance > Versions: month close with back-dated adjustments (6.6, C32)', () => {
  it('sets October’s rates from the form, closes October and posts the back-dated raises', async () => {
    // Six back-dated raises in August (an HRIS import after the August close): October's close posts them.
    const base = leakSample()
    const people = base.datasets.workers
      .filter(
        (w) =>
          !w.terminationDate &&
          w.workerType === 'Employee' &&
          base.datasets.comp.some((c) => c.employeeId === w.employeeId && c.effectiveDate < '2026-08-01'),
      )
      .slice(0, 6)
      .map((w) => w.employeeId)
    let changed = base
    for (const id of people) changed = withBackDatedComp(changed, id, '2026-08-01', 6_000)
    // R47 (browser B8): October closes once the data is as of its month-end; at the sample's own
    // 30 September the close is offered disabled with its reason.
    expect(financeModel(sampleCtx('finance', { sample: changed })).versions.writes.close.choice?.notYet).toBe(
      'Oct 2026 closes once the data is as of 31 Oct 2026 or later.',
    )
    const sc = scenario({ sample: changed, asOf: '2026-10-31' })
    const s = sc.sample
    const fin = finOf(s)
    let m = financeModel(await sc.ctx(fin))
    const close = m.versions.writes.close.choice
    expect(close?.month).toBe('2026-10')
    expect(close?.notYet).toBeNull()
    expect(close?.missingRates.length).toBeGreaterThan(0)
    // The form's start: September's actual rates for October, through fx.set (no current line moves).
    const rates = await sc.run(fin, 'setFx', { versionId: close?.workingId ?? '', rates: close?.carry ?? [] })
    expect(rates.outcome).toEqual({ ok: true, notice: 'FX rates saved in Working.' })
    m = financeModel(await sc.ctx(fin))
    expect(m.versions.writes.close.choice?.missingRates).toEqual([])

    const done = await sc.run(fin, 'closeMonth', { month: '2026-10' })
    expect(done.outcome).toEqual({ ok: true, notice: 'Oct 2026 is closed.' })
    expect(signedBy(done.entries, fin)).toBe(true)
    const ctx = await sc.ctx(fin)
    m = financeModel(ctx)
    expect(m.versions.closes.rows[0]).toMatchObject({
      month: '2026-10',
      closedBy: personaOf(s, 'finance-fpa').name,
      verifiesText: 'Hash still verifies',
    })
    expect(m.versions.writes.close.choice?.month).toBe('2026-11')
    // The close stores its atom index (7.3a, C20) and the month's one-time items (C32).
    const oct = ctx.plan?.closes.find((c) => c.month === '2026-10')
    expect(oct?.atoms.closeDate).toBe(monthEnd('2026-10'))
    expect(oct?.atoms.atoms.length).toBeGreaterThan(40)
    const before = sampleCtx('hr-admin', { sample: s })
    const w = before.versions.find((v) => v.versionId === 'fy27-working') as AnyVersion
    const booked = (lines: readonly PlanLine[]) =>
      [
        ...new Set(
          lines.filter((l) => l.month === '2026-10' && l.usd.oneTime > 0.005).map((l) => l.positionId),
        ),
      ].sort()
    const planned = booked(versionLinesOf(before, w).filter((l) => l.basis !== 'band'))
    expect(planned.length).toBeGreaterThan(0)
    expect(booked(closeLinesOf(ctx.plan))).toEqual(planned)

    // Back-dated adjustments: Finance reads counts and the month's sum at company level.
    const posted = (ctx.plan?.adjustments ?? []).filter((a) => a.postedIn === '2026-10')
    const mine = posted.filter((a) => people.includes(a.delta.employeeId))
    expect(new Set(mine.map((a) => a.delta.employeeId)).size).toBe(6)
    const finRow = m.versions.adjustmentsByMonth.rows.find((r) => r.postedIn === '2026-10')
    expect(finRow?.other).toBe(posted.filter((a) => a.kind === 'other').length)
    expect(finRow?.amountUsd).not.toBeNull()
    expect(m.versions.adjustments.rows.every((r) => r.kind !== ('other' as string))).toBe(true)
    // HRBP sees counts only, never an amount or the company's other changes.
    const hr = financeModel(await sc.ctx(hrbpOf(s))).versions.adjustmentsByMonth.rows
    for (const r of hr) {
      expect(r.amountUsd, r.postedIn).toBeNull()
      expect(r.other, r.postedIn).toBeNull()
      expect([SHOWS_IN_FINANCE_NOTE, COMPANY_ONLY_NOTE]).toContain(r.reason)
    }
    // HR admin with Show pay amounts on reads every amount.
    const open = sampleCtx('hr-admin', {
      sample: { ...s, plan: ctx.plan ?? s.plan },
      audit: await sc.log(),
      showPay: true,
      asOfOverride: '2026-10-31',
    })
    const adminRow = financeModel(open).versions.adjustmentsByMonth.rows.find((r) => r.postedIn === '2026-10')
    expect(adminRow?.amountUsd).toBeCloseTo(
      posted.reduce((a, x) => a + x.delta.usd.loaded, 0),
      6,
    )
    expect(chainOk(await sc.log())).toBe(true)
  }, 240_000)
})

describe('Finance > Assumptions under 7.4 (R18, R37)', () => {
  it('refuses a Taiwan burden rate, saves an EUR rate, and an HRBP saves only its own unit’s fill rate', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin = finOf(s)
    const hr = hrbpOf(s)
    let m = financeModel(await sc.ctx(fin)).assumptions
    const burden = m.writes.tables.find((t) => t.table === 'burden')
    const taiwan = burden?.values.find((v) => v.org == null && v.key === 'Taiwan|social')
    expect(taiwan?.note).toBeNull()
    const refused = await sc.run(fin, 'editAssumptions', {
      versionId: 'fy27-working',
      rows: [{ version: 'fy27-working', table: 'burden', org: null, key: 'Taiwan|social', value: 0.11 }],
    })
    expect(refused.outcome).toEqual({ ok: false, refused: editRefusedText(5) })
    expect(refused.entries).toEqual([])
    m = financeModel(await sc.ctx(fin)).assumptions
    expect(
      m.values.rows.find((r) => r.table === 'burden' && r.key === 'Taiwan|social' && !r.org)?.value,
    ).toBe(taiwan?.value)

    const ok = await sc.run(hr, 'editOperational', {
      versionId: 'fy27-working',
      rows: [{ version: 'fy27-working', table: 'fillRate', org: SE, key: '*', value: 0.9 }],
    })
    expect(ok.outcome).toEqual({ ok: true, notice: 'Assumptions saved in Working.' })
    expect(signedBy(ok.entries, hr)).toBe(true)
    const hrModel = financeModel(await sc.ctx(hr)).assumptions
    expect(hrModel.writes.tables.find((t) => t.table === 'fillRate')?.values).toEqual([
      {
        org: SE,
        key: '*',
        value: 0.9,
        note: null,
        parent: {
          value: 0.9,
          from: 'Company',
          note: 'Silicon Engineering overrides the company’s value. Remove override to use the company’s value again; the change is audited.',
        },
      },
    ])
    expect(
      financeModel(await sc.ctx(fin)).assumptions.values.rows.find(
        (r) => r.table === 'fillRate' && r.org === SE,
      )?.value,
    ).toBe(0.9)
    const elsewhere = await sc.run(hr, 'editOperational', {
      versionId: 'fy27-working',
      rows: [{ version: 'fy27-working', table: 'fillRate', org: 'Go-to-Market', key: '*', value: 0.9 }],
    })
    expect(elsewhere.outcome).toEqual({ ok: false, refused: OUTSIDE_UNIT_TEXT })
    expect(chainOk(await sc.log())).toBe(true)
  }, 240_000)
})

describe('Finance > Assumptions: Remove override (CONTRACTS-M3 7.4 item 2)', () => {
  it('takes an org’s value back to its parent’s, audited, from the model’s choice', async () => {
    const sc = scenario()
    const s = sc.sample
    const hr = hrbpOf(s)
    const values = async () =>
      financeModel(await sc.ctx(hr)).assumptions.writes.tables.find((t) => t.table === 'fillRate')?.values ??
      []
    // Silicon Engineering's fill rate (0.85) overrides the company's (0.9).
    const se = (await values()).find((v) => v.org === SE)
    expect(se).toMatchObject({ value: 0.85, parent: { value: 0.9, from: 'Company' } })
    const out = await sc.run(hr, 'removeOverride', {
      versionId: 'fy27-working',
      table: 'fillRate',
      org: se?.org as string,
      key: se?.key as string,
    })
    expect(out.outcome.ok).toBe(true)
    expect(out.entries.map((e) => [e.object, e.field, e.old, e.new, e.by])).toEqual([
      ['assumption', 'override removed', 0.85, 0.9, hr.personId],
    ])
    // The unit's row is gone: Silicon Engineering reads the company's value.
    expect((await values()).find((v) => v.org === SE)).toBeUndefined()
    const fin = finOf(s)
    const rows = financeModel(await sc.ctx(fin)).assumptions.values.rows
    expect(rows.find((r) => r.table === 'fillRate' && r.org === SE)).toBeUndefined()
    // The company's own row is no override: nothing to remove.
    const company = (await values()).find((v) => v.org == null)
    expect(company?.parent ?? null).toBeNull()
    expect(chainOk(await sc.log())).toBe(true)
  }, 240_000)
})

describe('Finance > Freezes (10.4, R10)', () => {
  it('creates a freeze from the model’s orgs: it holds openings, savings in Finance only; its end changes', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin = finOf(s)
    let m = financeModel(await sc.ctx(fin)).freezes
    const org = m.writes.create.orgs.find((o) => o.kind === 'unit' && o.value === SE)
    expect(org).toBeDefined()
    const heldBefore = m.openings.rows.length
    const made = await sc.run(fin, 'createFreeze', {
      businessUnit: SE,
      department: null,
      costCenter: null,
      leaderPositionId: null,
      startDate: m.writes.create.defaultStart,
      endDate: null,
      allowBackfill: false,
      reason: 'Hold while the FY28 plan is set',
    })
    expect(made.outcome.ok).toBe(true)
    expect(signedBy(made.entries, fin)).toBe(true)
    const id = made.entries[0]?.id as string
    m = financeModel(await sc.ctx(fin)).freezes
    const row = m.freezes.rows.find((r) => r.freezeId === id)
    expect(row).toMatchObject({ org: SE, startDate: '2026-09-30', endDate: null, allowBackfill: false })
    expect(row?.openingsHeld).toBeGreaterThan(0)
    expect(row?.savingsUsd).toBeGreaterThan(0)
    expect(m.openings.rows.length).toBe(heldBefore + (row?.openingsHeld ?? 0))
    expect(m.writes.edit.freezeIds).toContain(id)
    // HRBP sees the openings it holds, never the savings amount.
    const hr = financeModel(await sc.ctx(hrbpOf(s))).freezes
    const hrRow = hr.freezes.rows.find((r) => r.freezeId === id)
    expect(hrRow?.openingsHeld).toBe(row?.openingsHeld)
    expect(hrRow?.savingsUsd).toBeNull()
    expect(hrRow?.reason).toBe(SHOWS_IN_FINANCE_NOTE)
    const edit = await sc.run(fin, 'editFreeze', { freezeId: id, patch: { endDate: '2027-03-31' } })
    expect(edit.entries.map((e) => [e.object, e.field, e.new])).toEqual([['freeze', 'endDate', '2027-03-31']])
    expect(financeModel(await sc.ctx(fin)).freezes.freezes.rows.find((r) => r.freezeId === id)?.endDate).toBe(
      '2027-03-31',
    )
    expect(chainOk(await sc.log())).toBe(true)
  }, 240_000)
})

describe('Finance > Reconcile: Mark reviewed (6.10)', () => {
  it('marks the model’s first open exception reviewed; an HRBP is refused outside its unit', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin = finOf(s)
    let r = financeModel(await sc.ctx(fin)).reconcile
    const first = r.writes.reviewable[0]
    const out = await sc.run(fin, 'markReviewed', { exceptionIds: [first] })
    expect(out.outcome).toEqual({ ok: true, notice: 'Marked reviewed.' })
    expect(signedBy(out.entries, fin)).toBe(true)
    r = financeModel(await sc.ctx(fin)).reconcile
    expect(r.exceptions.rows.find((x) => x.id === first)).toMatchObject({
      reviewed: true,
      reviewedText: 'Reviewed',
      reviewable: false,
    })
    expect(r.writes.reviewable).not.toContain(first)
    expect(r.kpis.find((k) => k.id === 'finance-recon-exceptions')?.formula).toMatch(/1 marked reviewed\.$/)
    // An HRBP marks only its own unit's: one outside it is refused with the action's words.
    const hr = hrbpOf(s)
    const hrRows = financeModel(await sc.ctx(hr)).reconcile.exceptions.rows
    const outside = r.exceptions.rows.find((x) => !x.reviewed && !hrRows.some((y) => y.id === x.id))
    expect(outside).toBeDefined()
    const no = await sc.run(hr, 'markReviewed', { exceptionIds: [outside?.id as string] })
    expect(no.outcome).toEqual({ ok: false, refused: OUTSIDE_UNIT_TEXT })
    expect(hrbpUnitOf(s)(hr.personId)).toBe(SE)
    expect(chainOk(await sc.log())).toBe(true)
  }, 240_000)
})
