/**
 * The Finance view's model on the generated sample (docs/PLAN.md 6.6, 6.10, 9.4, 9.6, 11.5): story 7
 * (9 reconciliation exceptions, 6 not in plan and 3 cost-center mismatches) and story 4 (3 openings
 * under the Corporate freeze) through the model; versions and their locks; assumptions with "Set by
 * import." outside HR admin and the Trade rates part; freeze savings in Finance and HR admin only;
 * the tab KPIs of 9.4 with drills that open exactly their rows; the Action center items
 * `finance:reconcile`, `finance:envelope-exception` and `finance:cycle-due`.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { METRIC_IDS } from '@/access/ids'
import { itemInScope, itemShown, lensOf, roleItems } from '@/access/items'
import { hasAmount } from '@/access/visibility'
import type { Kpi } from '@/components/types'
import { SWITCH_FILTER_NOTE } from '@/cost/fit'
import { SHOWS_IN_FINANCE_NOTE } from '@/cost/guard'
import { FY28_WORKING } from '@/data/sample'
import type { Mode } from '@/data/schema'
import { calcProblems, resolveCalc, weightSum } from '@/drill/calc'
import { type DrillSpec, resolveDrill } from '@/drill/types'
import type { Adjustment, HcRequest } from '@/plan/types'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ID as PLAN_ID } from '@/views/plan/metrics'
import { personaPick, sample, sampleCtx } from '@/views/targets/engine/fixtures'
import { ID } from '../metrics'
import { FINANCE_ITEM_KINDS, financeActions } from './actions'
import { SET_BY_IMPORT } from './assumptions'
import { financeHeadline, financeModel } from './index'
import { CLOSES_SUBTITLE, COMPANY_ONLY_NOTE } from './versions'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const WHOLE: readonly Mode[] = ['finance', 'hr-admin']
const ALL: readonly Mode[] = ['manager', 'hrbp', 'leader', 'finance', 'hr-admin']

beforeAll(() => {
  sample()
})

function checkKpi(k: Kpi, label: string) {
  expect(METRIC_IDS, `${label} ${k.id}`).toContain(k.metricId)
  expect(k.uses?.length ?? 0, `${label} ${k.id} uses`).toBeGreaterThanOrEqual(
    k.metricId === ID.versionsLocked ? 0 : 1,
  )
  expect(!!k.drill || !!k.calc, `${label} ${k.id} opens something`).toBe(true)
  const spec = resolveDrill(k.drill)
  if (spec && k.value != null) {
    const w = weightSum(spec as never)
    if (w != null) expect(w, `${label} ${k.id}`).toBeCloseTo(k.value, 2)
    else expect(spec.rows.length, `${label} ${k.id} rows`).toBe(k.value)
  }
  const card = resolveCalc(k.calc)
  if (card) expect(calcProblems(card), `${label} ${k.id} card`).toEqual([])
}

describe('story 7: 6 people not in the plan and 3 cost-center mismatches', () => {
  it('reconciles to exactly 9 exceptions of two kinds in Finance and HR admin', () => {
    for (const mode of WHOLE) {
      const r = financeModel(sampleCtx(mode)).reconcile
      const k = (id: string) => r.kpis.find((x) => x.metricId === id)?.value
      expect(k(ID.reconExceptions), mode).toBe(9)
      expect(k(PLAN_ID.headsNotInPlan), mode).toBe(6)
      expect(k(ID.reconCostCenterMismatch), mode).toBe(3)
      expect(r.exceptions.rows, mode).toHaveLength(9)
      const kinds = new Set(r.exceptions.rows.map((e) => e.kind))
      expect([...kinds].sort(), mode).toEqual(['cost-center-mismatch', 'not-in-plan'])
      expect(
        r.exceptions.rows.every((e) => !e.reviewed),
        mode,
      ).toBe(true)
    }
  })

  it('keeps the HRBP to its unit (story 7 sits outside Silicon Engineering)', () => {
    const r = financeModel(sampleCtx('hrbp')).reconcile
    expect(r.kpis.find((k) => k.metricId === ID.reconExceptions)?.value).toBe(0)
  })

  it('counts an exception marked reviewed, but no longer as open', () => {
    const s = sample()
    const first = financeModel(sampleCtx('finance')).reconcile.exceptions.rows[0]
    const plan = { ...s.plan, reviewed: [{ exceptionId: first.id, at: '2026-09-30T10:00', by: 'E10001' }] }
    const r = financeModel(sampleCtx('finance', { plan })).reconcile
    expect(r.exceptions.rows.find((e) => e.id === first.id)?.reviewed).toBe(true)
    const items = financeActions(sampleCtx('finance', { plan })).filter((i) =>
      i.id.startsWith('finance:reconcile:'),
    )
    expect(items.reduce((n, i) => n + (i.size ?? 0), 0)).toBe(8)
  })
})

describe('story 4: the Corporate freeze holds 3 openings', () => {
  it('counts 3 openings under a freeze, with savings in Finance and HR admin only', () => {
    for (const mode of WHOLE) {
      const f = financeModel(sampleCtx(mode)).freezes
      expect(f.kpis.find((k) => k.metricId === PLAN_ID.openingsFrozen)?.value, mode).toBe(3)
      expect(f.openings.rows, mode).toHaveLength(3)
      const savings = f.kpis.find((k) => k.metricId === ID.freezeSavings)?.value
      expect(savings, mode).toBeGreaterThan(0)
      expect(savings, mode).toBeCloseTo(
        f.freezes.rows.reduce((a, r) => a + (r.savingsUsd ?? 0), 0),
        2,
      )
      // Accepted offers are honored: none of the held openings has one.
      expect(f.freezes.rows[0].openingsHeld, mode).toBe(3)
    }
    const hrbp = financeModel(sampleCtx('hrbp', { filters: {} }))
    const tile = hrbp.freezes.kpis.find((k) => k.metricId === ID.freezeSavings)
    expect(resolveCalc(tile?.calc)?.inputs.every((i) => i.value == null)).toBe(true)
    expect(tile?.value).toBeNull()
    expect(tile?.suppressedNote).toBe(SHOWS_IN_FINANCE_NOTE)
    for (const r of hrbp.freezes.freezes.rows) expect(r.savingsUsd).toBeNull()
  })
})

describe('the freeze savings card can be recomputed from what it shows (RC-8)', () => {
  it('lists each held opening’s band estimate for the months held and the stopped backfills, adding up to the savings', () => {
    for (const mode of WHOLE) {
      const f = financeModel(sampleCtx(mode)).freezes
      const tile = f.kpis.find((k) => k.metricId === ID.freezeSavings)
      const card = resolveCalc(tile?.calc)
      expect(card?.value, mode).toBe(tile?.value)
      const inputs = card?.inputs ?? []
      // Before the fix the card had one input, the freeze's whole savings.
      const held = inputs.filter((i) => / held by /.test(i.label))
      const backfills = inputs.filter((i) => /^Modeled backfills /.test(i.label))
      expect(held.length, mode).toBe(3)
      expect(backfills.length, mode).toBe(f.freezes.rows.length)
      for (const i of held) expect(i.label, mode).toMatch(/^P-\d+ held by FRZ-\d+, .+ to .+$/)
      const sum = inputs.reduce((a, i) => a + (i.value as number), 0)
      expect(sum, mode).toBeCloseTo(tile?.value as number, 2)
      expect(
        card?.steps.map((x) => x.label),
        mode,
      ).toEqual([
        'Openings held: Σ band estimate × months held ÷ 12',
        'Stopped backfills: Σ modeled backfills at midpoint',
        'Freeze savings = openings held + stopped backfills',
      ])
      const [a, b] = card?.steps ?? []
      expect((a?.result ?? 0) + (b?.result ?? 0), mode).toBeCloseTo(tile?.value as number, 2)
      expect(card && calcProblems(card), mode).toEqual([])
      // The records are the openings held, with no amount column.
      expect(resolveDrill(card?.rows)?.rows, mode).toHaveLength(3)
    }
  })
})

describe('Finance > Versions', () => {
  it('lists every version, both locks verifying, and counts the shown year’s locked versions', () => {
    const v = financeModel(sampleCtx('finance')).versions
    expect(v.versions.rows.map((r) => r.versionId)).toEqual(sample().plan.versions.map((x) => x.versionId))
    const locked = v.versions.rows.filter((r) => r.state === 'locked')
    expect(locked.map((r) => r.verifies)).toEqual([true, true])
    expect(locked.every((r) => r.hash?.startsWith('sha256-'))).toBe(true)
    expect(
      v.versions.rows.filter((r) => r.state === 'working').every((r) => r.hash == null && r.verifies == null),
    ).toBe(true)
    expect(v.kpis.find((k) => k.metricId === ID.versionsLocked)?.value).toBe(2)
    expect(financeHeadline(sampleCtx('finance')).value).toBe('2')
    expect(financeModel(sampleCtx('finance', { version: FY28_WORKING })).versions.kpis[0].value).toBe(0)
    // The drill holds a version's facts, never its lines.
    const d = resolveDrill(v.kpis[0].drill) as DrillSpec<'versions'>
    expect(d.rows.every((r) => !('lines' in r))).toBe(true)
  })
})

/** The sample's active employees in Silicon Engineering seats, for planted adjustments. */
function seWorkers(n: number, unit = 'Silicon Engineering') {
  const s = sample()
  const se = new Set(s.datasets.positions.filter((p) => p.businessUnit === unit).map((p) => p.positionId))
  return s.datasets.workers
    .filter(
      (w) =>
        w.workerType === 'Employee' &&
        !!w.positionId &&
        se.has(w.positionId) &&
        !w.assignmentEnd &&
        !w.terminationDate,
    )
    .slice(0, n)
}

/** A back-dated adjustment posted in October for August, moving loaded cost by `usd`. */
function adjustment(
  w: { employeeId: string; positionId?: string | null },
  kind: Adjustment['kind'],
  usd: number,
) {
  const z = { base: 0, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0 }
  const a: Adjustment = {
    id: `adj-2026-08-${w.employeeId}-${kind}`,
    postedIn: '2026-10',
    forMonth: '2026-08',
    positionId: w.positionId ?? null,
    kind,
    delta: {
      employeeId: w.employeeId,
      positionId: w.positionId ?? null,
      month: '2026-08',
      heads: kind === 'hire' ? 1 : 0,
      fte: kind === 'hire' ? 1 : 0,
      active: kind === 'hire' ? 1 : 0,
      currency: 'USD',
      rate: 1,
      local: { ...z, base: usd },
      usd: { ...z, base: usd, equity: 0, loaded: usd },
      leave: kind === 'other' ? 'unpaid' : 'none',
    },
    reason: kind === 'hire' ? 'Back-dated hire' : kind === 'exit' ? 'Back-dated exit' : 'Other HRIS change',
  }
  return a
}

describe('back-dated adjustments in Finance > Versions (6.6, C26)', () => {
  const versionsOf = (mode: Mode, adjustments: Adjustment[], showPay = false) => {
    const s = sample()
    const v = financeModel(sampleCtx(mode, { plan: { ...s.plan, adjustments }, showPay })).versions
    return {
      months: v.adjustmentsByMonth,
      list: v.adjustments,
      kpis: v.kpis.map((k) => [k.id, k.value, k.note ?? null]),
    }
  }
  const json = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'function' ? undefined : v))

  it('moves no row, count or note for one back-dated unpaid leave (an Other HRIS change under 5)', () => {
    const [w] = seWorkers(1)
    for (const mode of ['finance', 'hrbp', 'hr-admin'] as const) {
      const before = versionsOf(mode, [])
      const after = versionsOf(mode, [adjustment(w, 'other', -12_345.67)])
      expect(json(after), mode).toBe(json(before))
      expect(after.months.rows, mode).toEqual([])
    }
    // HR admin with pay amounts shown sees the change and its amount.
    const open = versionsOf('hr-admin', [adjustment(w, 'other', -12_345.67)], true).months.rows
    expect(open.map((r) => [r.postedIn, r.other, r.amountUsd])).toEqual([['2026-10', 1, -12_345.67]])
  })

  it('counts Other HRIS changes from 5 in a month, and shows the sum over 5 or more contributors in Finance only', () => {
    const five = seWorkers(5).map((w, i) => adjustment(w, 'other', 1_000 * (i + 1)))
    const fin = versionsOf('finance', five).months.rows
    expect(fin.map((r) => [r.month, r.hires, r.exits, r.other, r.amountUsd, r.contributors])).toEqual([
      ['2026-10', 0, 0, 5, 15_000, 5],
    ])
    // C33 (d): the count and the amount show at company level only, never under a scope (an HRBP's unit).
    const hrbp = versionsOf('hrbp', five).months.rows
    expect(hrbp.map((r) => [r.other, r.amountUsd, r.contributors, r.reason])).toEqual([
      [null, null, null, COMPANY_ONLY_NOTE],
    ])
    // Four of them: the month shows nothing at all.
    expect(versionsOf('finance', five.slice(0, 4)).months.rows).toEqual([])
  })

  it('RF-3: the amount and the Other HRIS change count show at company level only, never under a filter', () => {
    // Five other changes in Corporate and two in Executive Office, posted in October.
    const corp = seWorkers(5, 'Corporate').map((w, i) => adjustment(w, 'other', 1_000 + i))
    const eo = seWorkers(2, 'Executive Office').map((w, i) => adjustment(w, 'other', i ? 1_999.99 : 2_345.67))
    const all = [...corp, ...eo]
    const units = [...new Set(sample().datasets.positions.map((r) => r.businessUnit))]
    const at = (mode: Mode, filters: object, showPay = false) =>
      financeModel(
        sampleCtx(mode, { plan: { ...sample().plan, adjustments: all }, filters, showPay }),
      ).versions.adjustmentsByMonth.rows.map((r) => [r.postedIn, r.other, r.amountUsd, r.reason])
    const total = all.reduce((a, x) => a + x.delta.usd.loaded, 0)
    expect(at('finance', {})).toEqual([['2026-10', 7, total, null]])
    // Every unit but Executive Office: before C33 it showed 5 and their sum, so the company less it
    // gave the two Executive Office changes.
    expect(at('finance', { businessUnit: units.filter((u) => u !== 'Executive Office') })).toEqual([
      ['2026-10', null, null, COMPANY_ONLY_NOTE],
    ])
    expect(at('finance', { businessUnit: ['Executive Office'] })).toEqual([
      ['2026-10', null, null, COMPANY_ONLY_NOTE],
    ])
    // HR admin with the switch off under a level exclusion: the filter's own reason, no count.
    const level = sample().datasets.positions.find((r) => r.positionId === eo[1].positionId)?.level
    const exclude = { level: [level], modes: { level: 'exclude' } }
    expect(at('hr-admin', {})).toEqual([['2026-10', 7, total, null]])
    expect(at('hr-admin', exclude)).toEqual([['2026-10', null, null, SWITCH_FILTER_NOTE]])
    // With the switch on, the filtered month shows its own count and sum.
    const open = at('hr-admin', exclude, true)[0]
    expect(open[1]).toBeLessThan(7)
    expect(open[2]).not.toBeNull()
  })

  it('lists a back-dated hire by position with no amount, and hides the month’s sum under 5', () => {
    const [w, x] = seWorkers(2)
    const v = versionsOf('finance', [adjustment(w, 'hire', 9_000), adjustment(x, 'other', 500)])
    expect(v.list.rows.map((r) => [r.positionId, r.kind, r.reason])).toEqual([
      [w.positionId, 'hire', 'Back-dated hire'],
    ])
    expect(v.list.columns.some((c) => c.cost || c.pay || c.band)).toBe(false)
    expect(v.months.rows.map((r) => [r.hires, r.other, r.amountUsd, r.contributors, r.reason])).toEqual([
      [1, null, null, null, 'Hidden to protect anonymity (n < 5)'],
    ])
    const tile = financeModel(
      sampleCtx('finance', { plan: { ...sample().plan, adjustments: [adjustment(w, 'hire', 9_000)] } }),
    ).versions.kpis.find((k) => k.metricId === ID.closeAdjustments)
    expect(tile?.value).toBe(1)
    // The drill lists the position with every amount 0 and no person.
    const d = resolveDrill(tile?.drill) as DrillSpec<'adjustments'>
    expect(d.rows.map((r) => [r.positionId, r.delta.employeeId, r.delta.usd.loaded])).toEqual([
      [w.positionId, '', 0],
    ])
  })
})

describe('Finance > Assumptions and Trade rates', () => {
  it('marks the import-only tables "Set by import." outside HR admin', () => {
    const fin = financeModel(sampleCtx('finance')).assumptions.values.rows
    expect(fin.length).toBeGreaterThan(0)
    const bonus = fin.filter((r) => r.table === 'bonusTarget')
    expect(bonus.length).toBeGreaterThan(0)
    expect(bonus.every((r) => r.note === SET_BY_IMPORT)).toBe(true)
    expect(fin.filter((r) => r.table === 'band').every((r) => r.note == null)).toBe(true)
    const admin = financeModel(sampleCtx('hr-admin')).assumptions.values.rows
    expect(admin.every((r) => r.note == null)).toBe(true)
    expect(new Set(fin.map((r) => r.level))).toContain('company')
  })

  it("prices the spec's Munich P4 at €140,026 × 1.08 and weighs it against the standard head in use", () => {
    for (const mode of ['finance', 'hrbp', 'hr-admin'] as const) {
      const a = financeModel(sampleCtx(mode)).assumptions
      const munich = a.tradeRates?.rows.find((r) => r.level === 'P4' && r.location === 'Munich')
      expect(munich?.bandUsd, mode).toBeCloseTo(151_228.08, 2)
      expect(a.standardHead?.inUseUsd, mode).toBe(174_000)
      expect(munich?.weightBp, mode).toBe(Math.round((151_228.08 / 174_000) * 10_000))
      expect(munich?.partTimeAllowed, mode).toBe(true)
      expect(a.standardHead?.computedUsd, mode).toBeGreaterThan(150_000)
    }
  })

  it('shows Manager mode no assumption amount, trade rate or standard head', () => {
    const a = financeModel(sampleCtx('manager')).assumptions
    expect(a.values.rows).toEqual([])
    expect(a.tradeRates).toBeNull()
    expect(a.standardHead).toBeNull()
  })

  it('flags FY28 trade rates as changeable until FY28 locks', () => {
    const a = financeModel(sampleCtx('finance', { version: FY28_WORKING })).assumptions
    expect(a.standardHead?.note).toBe('Rates can change until FY28 locks')
  })
})

describe('Finance > Versions words (review CP-9)', () => {
  it('names the month closes in the glossary’s words: Actual (HRIS estimate), month-end', () => {
    const closes = financeModel(sampleCtx('finance')).versions.closes
    expect(closes.subtitle).toBe(CLOSES_SUBTITLE)
    expect(closes.subtitle).toContain('Actual (HRIS estimate)')
    expect(closes.subtitle).toContain('month-end')
    expect(closes.subtitle).not.toMatch(/snapshotted|HRIS actuals/)
  })
})

describe('with no plan state', () => {
  it('builds every tab with no version, close or freeze savings', () => {
    const m = financeModel(sampleCtx('finance', { plan: null }))
    expect(m.versions.versions.rows).toEqual([])
    expect(m.versions.closes.rows).toEqual([])
    expect(m.assumptions.values.rows).toEqual([])
    expect(m.freezes.kpis.find((k) => k.metricId === PLAN_ID.openingsFrozen)?.value).toBe(3)
    expect(m.reconcile.kpis.find((k) => k.metricId === ID.reconExceptions)?.value).toBe(9)
  })
})

describe('the tab KPIs', () => {
  it('have their metric, lineage and a drill or card that adds up, in every mode', () => {
    for (const mode of ALL) {
      const m = financeModel(sampleCtx(mode))
      for (const tab of [m.versions, m.assumptions, m.freezes, m.reconcile, m.export])
        for (const k of tab.kpis) checkKpi(k, mode)
    }
  })

  it('have no amount in a note, and no em dash between words', () => {
    for (const mode of ALL) {
      const m = financeModel(sampleCtx(mode))
      for (const tab of [m.versions, m.assumptions, m.freezes, m.reconcile])
        for (const k of tab.kpis) {
          const text = `${k.label} ${k.note ?? ''} ${k.suppressedNote ?? ''}`
          expect(/[$€₹₪]|\b(?:USD|EUR)\b/.test(text), `${mode}: ${text}`).toBe(false)
          expect(text).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
        }
    }
  })
})

describe('Action center items (9.6)', () => {
  it('rolls the 9 exceptions up per unit, owned by each unit’s HRBP, with no amount', () => {
    const ctx = sampleCtx('finance')
    const items = financeActions(ctx)
    const recon = items.filter((i) => i.id.startsWith('finance:reconcile:'))
    expect(recon.reduce((n, i) => n + (i.size ?? 0), 0)).toBe(9)
    for (const i of items) {
      expect(i.place, i.id).toBeDefined()
      expect(!!i.due || !!i.closesWhen, i.id).toBe(true)
      expect(hasAmount(i.what) || hasAmount(i.note ?? ''), i.what).toBe(false)
      expect(i.what, i.id).not.toMatch(/\.$/)
    }
    for (const i of recon) {
      expect(i.ownerRole).toBe('hrbp')
      expect(i.ownerId).toBeTruthy()
      const d = resolveDrill(i.drill) as DrillSpec
      expect(d.rows).toHaveLength(i.size ?? -1)
    }
    // Finance lists them in Needs attention.
    const lists = roleItems(
      items.map((item) => ({ item, ownerId: item.ownerId ?? null, ownerName: item.ownerName })),
      lensOf(ctx.access, ctx.asOf),
    )
    expect(lists.needs.length).toBe(items.length)
    for (const i of items) expect(itemShown(ctx.access, i) && itemInScope(ctx.access, i), i.id).toBe(true)
  })

  it('lists the HRBP the reconcile items of its own unit only', () => {
    const s = sample()
    const hrbp = s.personas.find((p) => p.key === 'hrbp-se')
    expect(hrbp).toBeDefined()
    // Story 7 sits outside Silicon Engineering: the SE HRBP has no reconcile item.
    expect(financeActions(sampleCtx('hrbp')).filter((i) => i.id.startsWith('finance:reconcile:'))).toEqual([])
  })

  it("gives each unit's HRBP its own unit's item, in Needs attention", () => {
    const recon = financeActions(sampleCtx('finance')).filter((i) => i.id.startsWith('finance:reconcile:'))
    expect(recon.length).toBeGreaterThan(0)
    for (const item of recon) {
      const unit = item.place.businessUnit as string
      const ctx = sampleCtx('hrbp', {
        pick: { personId: item.ownerId as string, name: item.ownerName, unit },
      })
      const mine = financeActions(ctx).filter((i) => i.id.startsWith('finance:reconcile:'))
      expect(
        mine.map((i) => [i.id, i.size]),
        unit,
      ).toEqual([[item.id, item.size]])
      const lists = roleItems(
        mine.map((x) => ({ item: x, ownerId: x.ownerId ?? null, ownerName: x.ownerName })),
        lensOf(ctx.access, ctx.asOf),
      )
      expect(
        lists.needs.map((x) => x.item.id),
        unit,
      ).toEqual([item.id])
      // The unit's Reconcile tab counts the same exceptions.
      expect(financeModel(ctx).reconcile.kpis[0].value, unit).toBe(item.size)
    }
  })

  it('keep the item contract in every mode (9.6)', () => {
    const NAGGING = /\b(chas\w*|nag\w*|ping\w*|hound\w*|unblock\w*|remind\w*)\b/i
    for (const mode of ALL) {
      const items = financeActions(sampleCtx(mode))
      const ids = items.map((i) => i.id)
      expect(new Set(ids).size, mode).toBe(ids.length)
      for (const i of items) {
        expect(
          FINANCE_ITEM_KINDS.some((k) => i.id.startsWith(`${k}:`) && i.id.length > k.length + 1),
          i.id,
        ).toBe(true)
        expect(i.view, i.id).toBe('finance')
        expect(i.what.endsWith('.'), i.id).toBe(false)
        expect(NAGGING.test(i.what) || NAGGING.test(i.note ?? ''), i.id).toBe(false)
        expect(hasAmount(i.what) || hasAmount(i.note ?? ''), i.id).toBe(false)
        expect(!!i.due || !!i.closesWhen, i.id).toBe(true)
        expect(i.place, i.id).toBeDefined()
        expect(i.ownerName, i.id).toBeTruthy()
      }
    }
    // Manager and Leader mode hide Finance, so they list none of its items.
    expect(financeActions(sampleCtx('manager'))).toEqual([])
    expect(financeActions(sampleCtx('leader'))).toEqual([])
  })

  it('raises the FY28 cycle stage due on 16 Oct 2026 for Finance', () => {
    const due = financeActions(sampleCtx('finance')).filter((i) => i.id.startsWith('finance:cycle-due:'))
    expect(due).toHaveLength(1)
    expect(due[0].due).toBe('2026-10-16')
    expect(due[0].what).toBe('FY28 planning cycle: Open for asks is due 16 Oct')
  })

  it('raises an envelope exception for a pending request waiting on a Finance envelope step', () => {
    const s = sample()
    const fpa = personaPick('finance-fpa').pick
    const req: HcRequest = {
      requestId: 'R-9001',
      type: 'Transfer',
      state: 'In review',
      reasonCode: 'Restructure',
      requesterId: s.personas.find((p) => p.key === 'manager-a')?.employeeId ?? 'E1',
      submittedById: null,
      submittedAt: '2026-09-20T09:00',
      updatedAt: '2026-09-20T09:00',
      positionId: null,
      managerPositionId: s.personas.find((p) => p.key === 'manager-a')?.positionId ?? 'P-1',
      businessUnit: 'Go-to-Market',
      department: 'Sales',
      costCenter: null,
      level: null,
      location: null,
      jobTitle: null,
      fte: null,
      startDate: null,
      priority: null,
      cycleId: null,
      confidential: false,
      exception: null,
      steps: [
        {
          n: 1,
          role: 'finance',
          approverId: fpa.personId,
          reasons: ['envelope-exception'],
          enteredAt: '2026-09-20T09:00',
          decision: null,
          at: null,
          note: null,
        },
      ],
      comments: [],
      changes: null,
      trade: null,
      transfer: null,
      outcome: null,
    }
    const ctx = sampleCtx('finance', { plan: { ...s.plan, requests: [req] } })
    const items = financeActions(ctx).filter((i) => i.id.startsWith('finance:envelope-exception:'))
    expect(items.map((i) => i.id)).toEqual(['finance:envelope-exception:R-9001'])
    expect(items[0].snoozeOnly).toBe(true)
    expect(items[0].approverId).toBe(fpa.personId)
  })
})
