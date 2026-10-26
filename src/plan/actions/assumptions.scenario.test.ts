/**
 * Assumption edits through the write path, M3 review fixes: every value is checked against its
 * table's unit before anything else (IN-8: NaN, a fill rate of 7, negative days were stored); and an
 * org's override can be taken back (Remove override, CONTRACTS-M3 7.4 item 2) under the id its owner
 * edits it with, so the value is its parent's again, with one audit entry.
 */
import { describe, expect, it } from 'vitest'
import { chainOk, hrbpUnitOf, said, scenario, type Who } from '@/app/write/scenario.testkit'
import { assumptionLookup } from '@/plan/engine/assumptions'
import { workingOf } from '@/plan/engine/versions'
import type { AssumptionRow } from '@/plan/types'
import { personaOf } from '@/testkit/sample'
import { valueRefusal } from './assumptions'
import {
  ASSUMPTIONS_SAVED_NOTICE,
  NO_OVERRIDE_TEXT,
  OPERATIONAL_ONLY_TEXT,
  OUTSIDE_UNIT_TEXT,
  OVERRIDE_REMOVED_NOTICE,
  SET_BY_IMPORT_TEXT,
} from './copy'

const row = (
  table: AssumptionRow['table'],
  key: string,
  value: number,
  org: string | null = null,
): AssumptionRow => ({
  version: 'fy27-working',
  table,
  org,
  key,
  value,
})

describe('assumption values (IN-8)', () => {
  it('refuses a value its unit does not allow, naming the table, before any check runs', () => {
    expect(valueRefusal([row('fillRate', '*', 7)])).toBe('Fill rate: each value is from 0 to 1.')
    expect(valueRefusal([row('fillRate', '*', Number.NaN)])).toBe('Fill rate: each value is from 0 to 1.')
    expect(valueRefusal([row('timeToFill', 'P3', -30)])).toBe('Time to fill: each value is 0 or more.')
    expect(valueRefusal([row('attrition', '*', Number.POSITIVE_INFINITY)])).toBe(
      'Attrition: each value is from 0 to 1.',
    )
    expect(valueRefusal([row('trade', 'minFte', 0)])).toBe(
      'Smallest FTE: each value is above 0 and at most 1.',
    )
    expect(valueRefusal([row('merit', 'FY27|date', 20260230)])).toBe(
      'Merit date: each value is a date written as YYYYMMDD.',
    )
    expect(valueRefusal([row('trade', 'partTime|*', 2)])).toBe('Part time allowed: each value is 0 or 1.')
    // What fits goes on: a bonus pool may be funded above target.
    expect(
      valueRefusal([
        row('fillRate', '*', 0.85),
        row('timeToFill', 'P3', 45),
        row('bonusFunding', 'FY27', 1.1),
        row('merit', 'FY27|date', 20260401),
        row('trade', 'minFte', 0.5),
      ]),
    ).toBeNull()
  })

  it('refuses through editOperational and editAssumptions, storing nothing', async () => {
    const sc = scenario()
    const s = sc.sample
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const hrbpId = personaOf(s, 'hrbp-se').employeeId
    const hrbp: Who = { mode: 'hrbp', personId: hrbpId, unit: hrbpUnitOf(s)(hrbpId) }
    const unit = hrbp.unit as string
    const nan = await sc.run(hrbp, 'editOperational', {
      versionId: 'fy27-working',
      rows: [row('fillRate', '*', Number.NaN, unit)],
    })
    expect(nan.outcome).toEqual({ ok: false, refused: 'Fill rate: each value is from 0 to 1.' })
    const lag = await sc.run(hrbp, 'editOperational', {
      versionId: 'fy27-working',
      rows: [row('backfillLag', '*', -2, unit)],
    })
    expect(lag.outcome).toEqual({ ok: false, refused: 'Backfill lag: each value is 0 or more.' })
    const neg = await sc.run(admin, 'editAssumptions', {
      versionId: 'fy27-working',
      rows: [row('attrition', '*', -0.5)],
    })
    expect(neg.outcome).toEqual({ ok: false, refused: 'Attrition: each value is from 0 to 1.' })
    expect(await sc.log()).toEqual([])
    expect((await sc.plan()).overlay.assumptions.filter((r) => r.version === 'fy27-working')).toEqual([])
  })
})

describe('Remove override (CONTRACTS-M3 7.4 item 2)', () => {
  it("takes an org's row back so the value is its parent's again, and setting it again brings it back", async () => {
    const sc = scenario()
    const s = sc.sample
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const override = s.datasets.assumptions.find(
      (r) => r.version === 'fy27-working' && r.table === 'attrition' && (r.org ?? '').trim(),
    ) as AssumptionRow
    expect(override).toBeTruthy()
    const company = s.datasets.assumptions.find(
      (r) => r.version === 'fy27-working' && r.table === 'attrition' && !(r.org ?? '').trim(),
    ) as AssumptionRow
    expect(company.value).not.toBe(override.value)
    const org = override.org as string

    const valueFor = async () => {
      const ctx = await sc.ctx(admin)
      const w = workingOf(ctx.versions, 'FY27')
      if (!w) throw new Error('no FY27 Working')
      return assumptionLookup(ctx.all.assumptions, w).get('attrition', [], {
        businessUnit: org,
        department: null,
      })
    }
    expect((await valueFor())?.value).toBe(override.value)

    const out = await sc.run(admin, 'removeOverride', {
      versionId: 'fy27-working',
      table: 'attrition',
      org,
      key: '*',
    })
    expect(out.outcome).toEqual({ ok: true, notice: OVERRIDE_REMOVED_NOTICE })
    expect(out.entries.map((e) => [e.object, e.id, e.field, e.old, e.new, e.by])).toEqual([
      [
        'assumption',
        `fy27-working|attrition|${org}|*`,
        'override removed',
        override.value,
        company.value,
        admin.personId,
      ],
    ])
    const after = await valueFor()
    expect(after?.value).toBe(company.value)
    expect(after?.level).toBe('company')
    // Nothing is left to remove.
    expect(
      (
        await sc.run(admin, 'removeOverride', {
          versionId: 'fy27-working',
          table: 'attrition',
          org,
          key: '*',
        })
      ).outcome,
    ).toEqual({ ok: false, refused: NO_OVERRIDE_TEXT })

    // Setting the org's value again takes the removal back.
    const set = await sc.run(admin, 'editAssumptions', {
      versionId: 'fy27-working',
      rows: [row('attrition', '*', 0.2, org)],
    })
    expect(set.outcome).toEqual({ ok: true, notice: ASSUMPTIONS_SAVED_NOTICE })
    expect((await valueFor())?.value).toBe(0.2)
    expect((await sc.plan()).overlay.removedAssumptions ?? []).toEqual([])
    expect(chainOk(await sc.log())).toBe(true)
  })

  it('follows the owner’s id: Finance not on a table set by import, an HRBP on its own unit’s operational rows', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const hrbpId = personaOf(s, 'hrbp-se').employeeId
    const hrbp: Who = { mode: 'hrbp', personId: hrbpId, unit: hrbpUnitOf(s)(hrbpId) }
    const unit = hrbp.unit as string
    expect(
      (
        await sc.run(fin, 'removeOverride', {
          versionId: 'fy27-working',
          table: 'merit',
          org: unit,
          key: 'FY27|pct',
        })
      ).outcome,
    ).toEqual({ ok: false, refused: SET_BY_IMPORT_TEXT })
    expect(
      (
        await sc.run(hrbp, 'removeOverride', {
          versionId: 'fy27-working',
          table: 'attrition',
          org: unit,
          key: '*',
        })
      ).outcome,
    ).toEqual({ ok: false, refused: OPERATIONAL_ONLY_TEXT })
    // Another unit's rows are not the HRBP's (the check comes before the row is looked for).
    const other = { org: unit === 'Go-to-Market' ? 'Operations' : 'Go-to-Market' }
    expect(
      (
        await sc.run(hrbp, 'removeOverride', {
          versionId: 'fy27-working',
          table: 'fillRate',
          org: other.org as string,
          key: '*',
        })
      ).outcome,
    ).toEqual({ ok: false, refused: OUTSIDE_UNIT_TEXT })
    const own = await sc.run(hrbp, 'removeOverride', {
      versionId: 'fy27-working',
      table: 'fillRate',
      org: unit,
      key: '*',
    })
    expect(said(own.outcome)).toBe(OVERRIDE_REMOVED_NOTICE)
    expect(own.entries[0]).toMatchObject({ object: 'assumption', field: 'override removed', by: hrbpId })
  })
})
