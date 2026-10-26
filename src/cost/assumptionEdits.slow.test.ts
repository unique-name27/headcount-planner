/**
 * Assumption edits are differences too (docs/PLAN.md 7.4, 16.1). Finance edits FX, bands, burden
 * rates, benefits, severance months, equity, forecast drivers and trade rates; each edit, and each
 * assumption set given to `version.create`, is refused with "This change would move cost for fewer
 * than 5 costed people." when the positions whose Working or forecast amount it changes (its
 * contributors, 7.2 rule 5) number 1 to 4 in all, or 1 to 4 in any one month within one part of
 * Finance's fold (a shown cost center, or one department × country share of a unit's Other). Caps,
 * dates, cutoffs and the four pay percentages come from the import and read only in Finance.
 *
 * The refusal itself is the M3 write path (`assumptions.edit` and `fx.set` under 7.4, through
 * src/views/finance/engine/edits.ts `assumptionEditCheck`, the action environment's check). This file
 * checks on the sample:
 *  (a) the contributors of a +δ edit of every Finance-editable key at the company level (each
 *      currency's plan and forecast rate, each country's burden components, benefits and severance
 *      months, each level's equity, the vacancy factor, and attrition at the company and each unit),
 *      and of the Taiwan and United States burden rates at each unit: the edits the rule must refuse
 *      include the TWD rate and a company or Corporate Taiwan burden rate (1550-HSZ's 3 people sit
 *      in Corporate's Other), and a rate that moves 5 or more in every part (EUR) is allowed; then
 *      the write path refuses them (`fx.set`, `assumptions.edit` and a `version.create` carrying one)
 *      with the 7.4 sentence while the EUR plan rate goes through, and the check refuses R37's list;
 *  (b) every shown Finance total is affine in each FX, burden-rate, benefits, equity and
 *      severance-months value: in assumptionAffine.slow.test.ts, so each file stays inside the slow
 *      project's time budget (every point there prices the company again);
 *  (c) in Finance mode the caps, dates, cutoffs and pay percentages read "Set by import.", and the
 *      write path refuses an edit of one, or a `version.create` carrying one, with the same words;
 *  (d) the control: the same sweep as HR admin on the United States social security cap and on a
 *      level's target bonus finds US people's base + bonus near $176,100, to the sweep's step;
 *  (e) under an attrition edit, the filled part moves only in the HRIS cohort's modeled exits, each
 *      unit's priced at one average cost per FTE whatever the rate (the unit's, or the company's);
 *      and the control: a department's average would let Facilities' average × its costed people
 *      less its shown cost centers give Facilities' share of Corporate's Other (1550-HSZ's people
 *      and 6 others on the sample), a group finer than any the build shows;
 *  (f) leave never moves the check (R44, C26; M3 recheck): a vacancy factor edit by department, in
 *      FY27 and FY28 Working, has the same verdict and the same movers when three of the department's
 *      people go on unpaid leave (the vacancy allowance and the forecast's cohort lines read no leave).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type ModePicks, NO_PICKS } from '@/access/modes'
import { samplePicks } from '@/access/store'
import { chainOk, scenario, type Who } from '@/app/write/scenario.testkit'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { cachedSample, SAMPLE_AS_OF, type Sample } from '@/data/sample'
import {
  type AssumptionRow,
  assumptionKey,
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  isHrAdminOnly,
  LEVELS,
  type Mode,
  type Month,
} from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { CLOSED_MONTH_RATE_TEXT, SET_BY_IMPORT_TEXT } from '@/plan/actions/copy'
import type { AnyVersion, PlanLine } from '@/plan/types'
import { leakSample, personaCtx, personaOf, withWorker } from '@/testkit/sample'
import { financeModel } from '@/views/finance/engine'
import { SET_BY_IMPORT } from '@/views/finance/engine/assumptions'
import { assumptionEditCheck, editMovesOf, editNoteOf } from '@/views/finance/engine/edits'
import { forecastRunOf } from '@/views/forecast/engine/run'
import { costSeatOf, gridMonths, shownLines, versionLinesOf } from '@/views/plan/engine/core'
import { foldsOf, membersOf } from '@/views/plan/engine/guarded'
import { editRefusedText } from './edits'
import type { FinanceFold } from './fold'
import { memberIdOf, peopleOf } from './guard'
import { RULES } from './guard.testkit'

/* ───────────── contexts and lines ───────────── */

const sourcesOf = (data: Datasets): Record<DatasetKey, SourceMeta> =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

function ctxOf(s: Sample, data: Datasets, mode: Mode, picks: ModePicks): AnalyticsContext {
  return buildContext({
    data,
    sources: sourcesOf(data),
    filters: { ...DEFAULT_FILTERS },
    asOfOverride: null,
    today: SAMPLE_AS_OF,
    mode,
    actingAs: picks,
    plan: s.plan,
    showPay: false,
    picks: { version: null, compare: null },
  })
}

const WORKING = 'fy27-working'

/** Working FY27's own lines and its forecast's lines (the forecast alone, or the plan alone, when asked). */
function linesOf(
  ctx: AnalyticsContext,
  which: 'both' | 'plan' | 'forecast' = 'both',
): { source: string; lines: readonly PlanLine[] }[] {
  const v = ctx.versions.find((x) => x.versionId === WORKING) as AnyVersion
  const out: { source: string; lines: readonly PlanLine[] }[] = []
  if (which !== 'forecast') out.push({ source: 'plan', lines: versionLinesOf(ctx, v) })
  if (which !== 'plan') out.push({ source: 'forecast', lines: forecastRunOf(ctx, v)?.lines ?? [] })
  return out
}

/** Each position's filled-part amounts per source and month (loaded and equity). */
function byPosition(
  ctx: AnalyticsContext,
  which: 'both' | 'plan' | 'forecast' = 'both',
): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>()
  for (const { source, lines } of linesOf(ctx, which))
    for (const l of lines) {
      if (l.basis === 'band') continue
      const k = `${memberIdOf(l)}|${source}|${l.month}`
      const v = out.get(k) ?? [0, 0]
      v[0] += l.usd.loaded
      v[1] += l.usd.equity
      out.set(k, v)
    }
  return out
}

/** An assumption row of Working replaced (or added) with a new value. */
function withValue(
  data: Datasets,
  table: AssumptionRow['table'],
  key: string,
  org: string | null,
  value: (old: number | null) => number,
): Datasets {
  const match = (r: AssumptionRow) =>
    r.version === WORKING && r.table === table && r.key === key && (r.org ?? null) === org
  const old = data.assumptions.find(match)?.value ?? null
  return {
    ...data,
    assumptions: [
      ...data.assumptions.filter((r) => !match(r)),
      { version: WORKING, table, org, key, value: value(old) },
    ],
  }
}

/** Several rows of Working at once (an FX set's every month). */
function withValues(
  data: Datasets,
  pick: (r: AssumptionRow) => boolean,
  value: (old: number) => number,
): Datasets {
  return {
    ...data,
    assumptions: data.assumptions.map((r) =>
      r.version === WORKING && pick(r) ? { ...r, value: value(r.value) } : r,
    ),
  }
}

/** The value Working reads for a key at the company level (else any row's). */
const workingValue = (data: Datasets, table: AssumptionRow['table'], key: string): number =>
  (
    data.assumptions.find((r) => r.version === WORKING && r.table === table && r.key === key && !r.org) ??
    data.assumptions.find((r) => r.table === table && r.key === key)
  )?.value ?? 0

/* ───────────── the test ───────────── */

describe('Finance assumption edits move 0 or 5 or more costed people (7.4)', () => {
  let sample: Sample
  let picks: ModePicks
  let base: AnalyticsContext
  let baseline: Map<string, [number, number]>
  let folds: ReadonlyMap<string, FinanceFold>
  /** Each position's part of Finance's fold: a shown cost center, or a department × country share of its unit's Other. */
  let partOf: (positionId: string) => string
  /** Positions that bring costed people (band seats never count, 7.2 rule 5). */
  let costed: ReadonlySet<string>
  let hsz: string[] = []

  beforeAll(() => {
    sample = cachedSample()
    picks = { ...NO_PICKS, ...samplePicks(sample.personas) }
    base = ctxOf(sample, sample.datasets, 'finance', picks)
    baseline = byPosition(base)
    const v = base.versions.find((x) => x.versionId === WORKING) as AnyVersion
    folds = foldsOf(base, v) ?? new Map()
    const seatOf = costSeatOf(base)
    partOf = (id) => {
      const s = seatOf(id)
      if (!s) return `none:${id}`
      const f = folds.get(s.businessUnit)
      return f?.shown.includes(s.costCenter)
        ? `${s.businessUnit}|${s.costCenter}`
        : `${s.businessUnit}|Other|${s.department ?? ''}|${s.country}`
    }
    const members = membersOf(base, shownLines(base, v), gridMonths(v), null)
    costed = new Set(members.filter((m) => m.part === 'filled' && m.people.length).map((m) => m.positionId))
    hsz = [...peopleOf(members.filter((m) => m.seat.costCenter === '1550-HSZ'))]
  }, 900_000)

  /** An edit's contributors: in all, and the most and fewest in one part in one month (above 0). */
  function contributorsOf(data: Datasets, which: 'both' | 'plan' | 'forecast' = 'both') {
    const after = byPosition(ctxOf(sample, data, 'finance', picks), which)
    const all = new Set<string>()
    const perPartMonth = new Map<string, Set<string>>()
    for (const k of new Set([...baseline.keys(), ...after.keys()])) {
      const [id, source, month] = k.split('|')
      if (which !== 'both' && source !== which) continue
      if (!costed.has(id)) continue
      const a = baseline.get(k) ?? [0, 0]
      const b = after.get(k) ?? [0, 0]
      if (Math.abs(a[0] - b[0]) <= 0.005 && Math.abs(a[1] - b[1]) <= 0.005) continue
      all.add(id)
      const pk = `${partOf(id)}|${month}`
      const set = perPartMonth.get(pk) ?? new Set<string>()
      set.add(id)
      perPartMonth.set(pk, set)
    }
    const small = [...perPartMonth]
      .filter(([, s]) => s.size < RULES.minContributors)
      .map(([k, s]) => `${k}: ${s.size}`)
    const refuse = (all.size > 0 && all.size < RULES.minContributors) || small.length > 0
    return { all: all.size, small, refuse }
  }

  it('(a) finds the edits the rule must refuse: the TWD rate and a company or Corporate Taiwan burden rate', () => {
    const data = sample.datasets
    // Each edit is built when it is checked, so no edited copy (and the lines memoized on it) outlives its check.
    const edits: { label: string; data: () => Datasets; which: 'both' | 'plan' | 'forecast' }[] = []
    const currencies = [
      ...new Set(data.assumptions.filter((r) => r.table === 'fx').map((r) => r.key.split('|')[0])),
    ]
      .filter((c) => c !== 'USD')
      .sort()
    for (const c of currencies)
      for (const set of ['plan', 'forecast'] as const)
        edits.push({
          label: `fx ${c} ${set}`,
          data: () =>
            withValues(
              data,
              (r) => r.table === 'fx' && r.key.startsWith(`${c}|${set}|`),
              (x) => x * 1.01,
            ),
          which: set === 'plan' ? 'plan' : 'forecast',
        })
    const burdenKeys = [
      ...new Set(data.assumptions.filter((r) => r.table === 'burden').map((r) => r.key)),
    ].sort()
    const units = [...new Set(data.positions.map((r) => r.businessUnit))].sort()
    for (const key of burdenKeys) {
      edits.push({
        label: `burden ${key}`,
        data: () => withValue(data, 'burden', key, null, (x) => (x ?? 0) + 0.01),
        which: 'both',
      })
      // Each unit's own rate for the two countries story 8 and the control need (the others at the company level).
      if (!key.startsWith('Taiwan|') && !key.startsWith('United States|')) continue
      for (const unit of units)
        edits.push({
          label: `burden ${key} in ${unit}`,
          data: () => withValue(data, 'burden', key, unit, () => workingValue(data, 'burden', key) + 0.01),
          which: 'both',
        })
    }
    for (const table of ['benefits', 'severance'] as const)
      for (const key of [
        ...new Set(data.assumptions.filter((r) => r.table === table).map((r) => r.key)),
      ].sort())
        edits.push({
          label: `${table} ${key}`,
          data: () => withValue(data, table, key, null, (x) => (x ?? 0) * 1.05 + 1),
          which: 'both',
        })
    for (const level of LEVELS)
      edits.push({
        label: `equity ${level}`,
        data: () => withValue(data, 'equity', level, null, (x) => (x ?? 0) + 1_000),
        which: 'both',
      })
    edits.push({
      label: 'vacancy factor',
      data: () => withValue(data, 'vacancyFactor', '*', null, (x) => (x ?? 0) + 0.01),
      which: 'plan',
    })
    edits.push({
      label: 'attrition',
      data: () => withValue(data, 'attrition', '*', null, (x) => (x ?? 0) + 0.02),
      which: 'forecast',
    })
    for (const unit of units)
      edits.push({
        label: `attrition in ${unit}`,
        data: () =>
          withValue(data, 'attrition', '*', unit, () => workingValue(data, 'attrition', '*') + 0.02),
        which: 'forecast',
      })
    const refused = new Map<string, { all: number; small: string[] }>()
    let moving = 0
    for (const e of edits) {
      const r = contributorsOf(e.data(), e.which)
      if (r.all > 0) moving++
      if (r.refuse) refused.set(e.label, r)
    }
    expect(edits.length).toBeGreaterThan(60)
    expect(moving).toBeGreaterThan(30)
    // 1550-HSZ's 3 people are Corporate's only Taiwan people: any Taiwan edit reaching them moves 1 to 4.
    expect(hsz.length).toBeGreaterThan(0)
    expect(refused.has('fx TWD plan'), [...refused.keys()].join('; ')).toBe(true)
    expect(refused.has('fx TWD forecast')).toBe(true)
    const taiwan = burdenKeys.filter((k) => k.startsWith('Taiwan|'))
    expect(taiwan.length).toBeGreaterThan(0)
    for (const k of taiwan) {
      expect(refused.has(`burden ${k}`), k).toBe(true)
      expect(refused.has(`burden ${k} in Corporate`), k).toBe(true)
    }
    // The rule is not a blanket refusal: a rate that moves 5 or more in every part it reaches stays allowed.
    expect(refused.has('fx EUR plan')).toBe(false)
    // As 7.4 words it, a part is also a department × country share of a unit's Other, and an edit
    // keyed by country or level reaches many: on the sample the rule also refuses every United States
    // and Canada burden and benefits rate, every level's equity, the vacancy factor, company and
    // Corporate attrition, and the CAD, INR and TWD forecast rates (Corporate's Other holds People ×
    // Canada with 1 person and People × United States with 2; the forecast prices exits at the unit's
    // average, so a rate a unit's average reads moves every seat of the unit). Reported to the lead.
    expect(refused.has('burden United States|socialSecurity')).toBe(true)
  }, 1_800_000)

  it('(a) refuses each of those edits, and a version.create carrying one, with the 7.4 sentence (M3 write path)', async () => {
    const rule = editRefusedText(RULES.minCosted)
    const sc = scenario()
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    // The open months' rates: a closed month's rate is read only outside HR admin (review PV-2),
    // which the next block checks on its own.
    const lastClose =
      [...s.plan.closes]
        .map((c) => c.month)
        .sort()
        .at(-1) ?? ''
    const rates = (cur: string, set: 'plan' | 'forecast') =>
      s.datasets.assumptions
        .filter((r) => r.version === WORKING && r.table === 'fx' && r.key.startsWith(`${cur}|${set}|`))
        .map((r) => {
          const [currency, , month] = r.key.split('|')
          return { currency, set, month: month as Month, usdPerLocal: r.value * 1.01 }
        })
        .filter((r) => r.month > lastClose)
    expect(lastClose).toBe('2026-09')
    // A closed month's rate, for any currency: read only in Finance (PV-2).
    const closed = await sc.run(fin, 'setFx', {
      versionId: WORKING,
      rates: [{ currency: 'EUR', set: 'plan', month: '2026-05', usdPerLocal: 1.09 }],
    })
    expect(closed.outcome).toEqual({ ok: false, refused: CLOSED_MONTH_RATE_TEXT })
    const taiwan = (org: string | null): AssumptionRow => ({
      version: WORKING,
      table: 'burden',
      org,
      key: 'Taiwan|social',
      value: workingValue(s.datasets, 'burden', 'Taiwan|social') + 0.01,
    })
    // The TWD rate, plan and forecast, through `fx.set`.
    for (const set of ['plan', 'forecast'] as const) {
      const r = await sc.run(fin, 'setFx', { versionId: WORKING, rates: rates('TWD', set) })
      expect(r.outcome, `TWD ${set}`).toEqual({ ok: false, refused: rule })
      expect(r.entries).toEqual([])
    }
    // A company or Corporate Taiwan burden rate, through `assumptions.edit`.
    for (const org of [null, 'Corporate']) {
      const r = await sc.run(fin, 'editAssumptions', { versionId: WORKING, rows: [taiwan(org)] })
      expect(r.outcome, String(org)).toEqual({ ok: false, refused: rule })
    }
    // A new Working carrying one: refused in Finance, made by HR admin.
    const create = {
      fiscalYear: 'FY29' as const,
      name: 'FY29 Working',
      proration: 'daily' as const,
      from: 'fy28-working',
      assumptions: [{ ...taiwan(null), version: 'fy29-working' }],
    }
    expect((await sc.run(fin, 'createVersion', create)).outcome).toEqual({ ok: false, refused: rule })
    // The EUR plan rate moves 5 or more in every part it reaches: it goes through and is audited.
    const eur = await sc.run(fin, 'setFx', { versionId: WORKING, rates: rates('EUR', 'plan') })
    expect(eur.outcome).toEqual({ ok: true, notice: 'FX rates saved in Working.' })
    expect(eur.entries.length).toBe(rates('EUR', 'plan').length)
    for (const e of eur.entries)
      expect(e).toMatchObject({ object: 'assumption', field: 'value', by: fin.personId })
    expect((await sc.run(admin, 'createVersion', create)).outcome.ok).toBe(true)
    expect(chainOk(await sc.log())).toBe(true)

    // R37 on the sample: the check refuses what Corporate's small Other shares reach (People × Canada
    // 1, People × United States 2); a German burden rate reaches 5 or more in every part.
    const check = (rows: AssumptionRow[]) => assumptionEditCheck(base, rows, WORKING)
    const at = (
      table: AssumptionRow['table'],
      key: string,
      org: string | null,
      d: number,
    ): AssumptionRow => ({
      version: WORKING,
      table,
      org,
      key,
      value: workingValue(sample.datasets, table, key) + d,
    })
    const fxRows = (cur: string, set: string) =>
      sample.datasets.assumptions
        .filter((r) => r.version === WORKING && r.table === 'fx' && r.key.startsWith(`${cur}|${set}|`))
        .map((r) => ({ ...r, value: r.value * 1.01 }))
    const refused: [string, AssumptionRow[]][] = [
      ['US social security', [at('burden', 'United States|socialSecurity', null, 0.005)]],
      ['US medicare', [at('burden', 'United States|medicare', null, 0.005)]],
      ['Canada social', [at('burden', 'Canada|social', null, 0.005)]],
      ['US benefits', [at('benefits', 'United States', null, 500)]],
      ['Canada benefits', [at('benefits', 'Canada', null, 500)]],
      ['P3 equity', [at('equity', 'P3', null, 1_000)]],
      ['vacancy factor', [at('vacancyFactor', '*', null, 0.01)]],
      ['company attrition', [at('attrition', '*', null, 0.02)]],
      ['Corporate attrition', [at('attrition', '*', 'Corporate', 0.02)]],
      ['CAD forecast', fxRows('CAD', 'forecast')],
      ['INR forecast', fxRows('INR', 'forecast')],
      ['TWD forecast', fxRows('TWD', 'forecast')],
    ]
    for (const [label, rows] of refused) expect(check(rows), label).toBe(rule)
    expect(check(fxRows('EUR', 'plan'))).toBeNull()
    expect(check([at('burden', 'Germany|social', null, 0.005)])).toBeNull()
    // HR admin sets them by import or in the app: the check never refuses there.
    const adminCtx = ctxOf(sample, sample.datasets, 'hr-admin', picks)
    expect(assumptionEditCheck(adminCtx, refused[0][1], WORKING)).toBeNull()
  }, 1_800_000)

  it('(c) in Finance mode the caps, dates, cutoffs and pay percentages are read only, set by import', () => {
    const m = financeModel(base)
    const rows = m.assumptions.values.rows
    const importOnly = rows.filter((r) => isHrAdminOnly(r.table))
    expect(new Set(importOnly.map((r) => r.table))).toEqual(
      new Set(['burdenCap', 'merit', 'promotionPool', 'bonusTarget', 'bonusFunding']),
    )
    for (const r of importOnly) expect(r.note, `${r.table} ${r.key}`).toBe(SET_BY_IMPORT)
    for (const r of rows.filter((x) => !isHrAdminOnly(x.table)))
      expect(r.note, `${r.table} ${r.key}`).toBeNull()
  })

  it('(c) refuses a Finance edit of a cap, date, cutoff or pay percentage, and a version.create carrying one (M3 write path)', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const importOnly: AssumptionRow[] = [
      {
        version: WORKING,
        table: 'burdenCap',
        org: null,
        key: 'United States|socialSecurity',
        value: 180_000,
      },
      { version: WORKING, table: 'merit', org: null, key: 'FY27|date', value: 20260701 },
      { version: WORKING, table: 'merit', org: null, key: 'FY27|cutoff', value: 20260301 },
      { version: WORKING, table: 'merit', org: null, key: 'FY27|pct', value: 0.04 },
      { version: WORKING, table: 'promotionPool', org: null, key: 'FY27|date', value: 20261101 },
      { version: WORKING, table: 'promotionPool', org: null, key: 'FY27|pct', value: 0.02 },
      { version: WORKING, table: 'bonusTarget', org: null, key: 'P3', value: 0.11 },
      { version: WORKING, table: 'bonusFunding', org: null, key: 'FY27', value: 0.9 },
    ]
    for (const row of importOnly) {
      const r = await sc.run(fin, 'editAssumptions', { versionId: WORKING, rows: [row] })
      expect(r.outcome, `${row.table} ${row.key}`).toEqual({ ok: false, refused: SET_BY_IMPORT_TEXT })
      expect(r.entries).toEqual([])
      // The finance check says the same before anyone tries, and beside the value on the tab.
      expect(assumptionEditCheck(base, [row], WORKING), row.table).toBe(SET_BY_IMPORT)
      expect(editNoteOf(base, row, WORKING), row.table).toBe(SET_BY_IMPORT)
    }
    // A set given to version.create that carries one is refused in Finance too.
    const create = {
      fiscalYear: 'FY29' as const,
      name: 'FY29 Working',
      proration: 'daily' as const,
      from: 'fy28-working',
      assumptions: [
        { version: 'fy29-working', table: 'merit' as const, org: null, key: 'FY29|pct', value: 0.04 },
      ],
    }
    expect((await sc.run(fin, 'createVersion', create)).outcome).toEqual({
      ok: false,
      refused: SET_BY_IMPORT_TEXT,
    })
    // HR admin edits a cap in the app (no rule refuses it there).
    const cap = await sc.run(admin, 'editAssumptions', { versionId: WORKING, rows: [importOnly[0]] })
    expect(cap.outcome).toEqual({ ok: true, notice: 'Assumptions saved in Working.' })
    expect(cap.entries[0]).toMatchObject({
      object: 'assumption',
      field: 'value',
      new: 180_000,
      by: admin.personId,
    })
    expect(chainOk(await sc.log())).toBe(true)
  }, 600_000)

  it('(d) the control: the same sweep run as HR admin on the US social security cap and a target bonus finds US people’s base + bonus', () => {
    const data = sample.datasets
    const admin = (d: Datasets) => ctxOf(sample, d, 'hr-admin', picks)
    const burdenOf = (d: Datasets): number => {
      let t = 0
      for (const { lines } of linesOf(admin(d), 'plan')) for (const l of lines) t += l.usd.burden
      return t
    }
    // What each US person-month's annual base + bonus is (the truth the sweep is after).
    const truth: number[] = []
    for (const { lines } of linesOf(base, 'plan'))
      for (const l of lines)
        if (l.basis !== 'band' && l.currency === 'USD' && l.active > 0 && l.local.base > 0)
          truth.push(((l.local.base + l.local.bonus) * 12) / l.active)
    const key = assumptionKey(['United States', 'socialSecurity'])
    const cap = workingValue(data, 'burdenCap', key)
    expect(cap).toBe(176_100)
    // The cap from $166,100 to $186,100 in $500 steps: the total's kinks are people's base + bonus.
    const step = 500
    const caps = Array.from({ length: 41 }, (_, i) => cap - 10_000 + i * step)
    const t = caps.map((c) => burdenOf(withValue(data, 'burdenCap', key, null, () => c)))
    const kinks: number[] = []
    for (let i = 1; i < caps.length - 1; i++)
      if (Math.abs(t[i + 1] - 2 * t[i] + t[i - 1]) > 0.01) kinks.push(caps[i])
    const near = truth.filter((b) => b > caps[1] && b < caps[caps.length - 2])
    expect(near.length).toBeGreaterThan(0)
    // Every kink sits within a step of someone's base + bonus, and every such person is found.
    for (const k of kinks)
      expect(
        near.some((b) => Math.abs(b - k) <= step),
        String(k),
      ).toBe(true)
    for (const b of near)
      expect(
        kinks.some((k) => Math.abs(b - k) <= step),
        String(b),
      ).toBe(true)
    // A level's target bonus swept moves each person near the cap across it one at a time: the kink
    // at target t gives that person's base, cap ÷ (1 + t) (bonus funding is 100% in the sample).
    const seatOf = costSeatOf(base)
    const bases = new Map<string, number[]>()
    for (const { lines } of linesOf(base, 'plan'))
      for (const l of lines) {
        if (l.basis === 'band' || l.currency !== 'USD' || l.active <= 0 || l.local.base <= 0) continue
        const level = seatOf(l.positionId)?.level ?? ''
        bases.set(level, [...(bases.get(level) ?? []), (l.local.base * 12) / l.active])
      }
    const pcts = Array.from({ length: 21 }, (_, i) => 0.1 + i * 0.01)
    const crossing = (list: readonly number[]) =>
      list.map((x) => cap / x - 1).filter((t) => t > pcts[1] && t < pcts[pcts.length - 2])
    const [level, list] = [...bases].sort((x, y) => crossing(y[1]).length - crossing(x[1]).length)[0]
    const targets = crossing(list)
    expect(targets.length).toBeGreaterThan(0)
    const b = pcts.map((x) => burdenOf(withValue(data, 'bonusTarget', level, null, () => x)))
    const moved = pcts.slice(1, -1).filter((_, i) => Math.abs(b[i + 2] - 2 * b[i + 1] + b[i]) > 0.01)
    for (const t of targets)
      expect(
        moved.some((m) => Math.abs(m - t) <= 0.0101),
        `${level} ${t}`,
      ).toBe(true)
  }, 1_800_000)

  it('(e) an attrition edit moves the filled part only in the HRIS cohort’s modeled exits, at one average per unit', () => {
    const data = sample.datasets
    const fc = (d: Datasets) =>
      forecastRunOf(
        ctxOf(sample, d, 'finance', picks),
        base.versions.find((x) => x.versionId === WORKING) as AnyVersion,
      )
    const at = (rate: number) => fc(withValue(data, 'attrition', '*', 'Corporate', () => rate))
    const r0 = fc(data)
    const r1 = at(0.2)
    const r2 = at(0.3)
    // The HRIS cohort's lines (cohort part 'hris'): USD per FTE, by unit and month, is one average whatever the rate.
    const priced = (r: ReturnType<typeof fc>) => {
      const out = new Map<string, { usd: number; fte: number }>()
      for (const l of r?.detail.lines ?? []) {
        const c = (l as { cohort?: { part: string; businessUnit: string } }).cohort
        if (c?.part !== 'hris' || l.basis !== 'hris') continue
        const k = `${c.businessUnit}|${l.month}|${l.currency}`
        const v = out.get(k) ?? { usd: 0, fte: 0 }
        v.usd += l.usd.base + l.usd.bonus + l.usd.burden + l.usd.benefits
        v.fte += l.fte
        out.set(k, v)
      }
      return out
    }
    const [p0, p1, p2] = [priced(r0), priced(r1), priced(r2)]
    let compared = 0
    for (const [k, a] of p1) {
      const b = p2.get(k)
      if (!b || Math.abs(a.fte) < 1e-6 || Math.abs(b.fte) < 1e-6) continue
      compared++
      expect(a.usd / a.fte, k).toBeCloseTo(b.usd / b.fte, 6)
      const z = p0.get(k)
      if (z && Math.abs(z.fte) > 1e-6) expect(a.usd / a.fte, k).toBeCloseTo(z.usd / z.fte, 6)
    }
    expect(compared).toBeGreaterThan(0)
    // Every other filled-part line (the seats' own) is unchanged by the edit.
    const own = (r: ReturnType<typeof fc>) => {
      const out = new Map<string, number>()
      for (const l of r?.detail.lines ?? []) {
        if ((l as { cohort?: unknown }).cohort || l.basis === 'band') continue
        const k = `${l.positionId}|${l.month}|${l.holderId ?? ''}`
        out.set(k, (out.get(k) ?? 0) + l.usd.loaded)
      }
      return out
    }
    const o0 = own(r0)
    const o2 = own(r2)
    const changed = [...new Set([...o0.keys(), ...o2.keys()])].filter(
      (k) => Math.abs((o0.get(k) ?? 0) - (o2.get(k) ?? 0)) > 0.005,
    )
    expect(changed).toEqual([])
  }, 1_800_000)

  it('(e) the control: a department’s average would give Facilities’ share of Corporate’s Other (1550-HSZ’s people in it) away', () => {
    // Facilities' HRIS cost per costed person over the year, its costed people, and its shown cost centers' cost.
    const v = base.versions.find((x) => x.versionId === WORKING) as AnyVersion
    const members = membersOf(base, shownLines(base, v), gridMonths(v), null).filter(
      (m) => m.part === 'filled',
    )
    const facilities = members.filter(
      (m) => m.seat.businessUnit === 'Corporate' && m.seat.department === 'Facilities',
    )
    const people = peopleOf(facilities)
    expect(people.size).toBeGreaterThan(0)
    const total = facilities.reduce((a, m) => a + m.amounts.loaded, 0)
    const fold = folds.get('Corporate') as FinanceFold
    const shown = facilities.filter((m) => fold.shown.includes(m.seat.costCenter))
    const rest = facilities.filter((m) => !fold.shown.includes(m.seat.costCenter))
    // The department's average × its costed people − its shown cost centers is exactly the rest:
    // Facilities' cost centers in Corporate's Other, 1550-HSZ's people among them. The build prices
    // exits at the unit's average, whose remainder is the whole Other, a set Finance already sees.
    // On the sample the Facilities remainder holds 9 people (1550-HSZ's 3 and 6 in Facilities' other
    // small cost centers), not 1550-HSZ's 3 alone as 7.4 expected: a group finer than any the build
    // shows, but of 5 or more (reported to the lead).
    const average = total / people.size
    const derived = average * people.size - shown.reduce((a, m) => a + m.amounts.loaded, 0)
    const restPeople = peopleOf(rest)
    expect(Math.abs(derived - rest.reduce((a, m) => a + m.amounts.loaded, 0))).toBeLessThan(0.01)
    for (const p of hsz) expect(restPeople.has(p), p).toBe(true)
    const unit = members.filter((m) => m.seat.businessUnit === 'Corporate')
    const other = unit.filter((m) => !fold.shown.includes(m.seat.costCenter))
    expect(peopleOf(other).size).toBeGreaterThanOrEqual(RULES.minCosted)
    expect(restPeople.size).toBeLessThan(peopleOf(other).size)
  })
})

describe('(f) leave never moves the edit check (R44, C26; M3 recheck)', () => {
  it('gives a vacancy factor edit by department the same verdict and movers with three people on unpaid leave', () => {
    const s = leakSample()
    const fin = personaCtx('finance-fpa', { sample: s })
    const departments = [
      'Executive Office',
      'Architecture',
      'Analog & Mixed-Signal',
      'DFT',
      'Systems Validation',
    ]
    const movers = (c: AnalyticsContext, edit: AssumptionRow, v: string) =>
      editMovesOf(c, [edit], v)
        .map((m) => `${m.positionId}|${m.part}|${m.month}`)
        .sort()
    let checked = 0
    for (const department of departments) {
      const seats = new Set(
        fin.all.positions.filter((p) => p.department === department).map((p) => p.positionId),
      )
      const people = [
        ...new Set(
          s.datasets.workers
            .filter(
              (w) =>
                w.positionId && seats.has(w.positionId) && w.workerType === 'Employee' && !w.terminationDate,
            )
            .map((w) => w.employeeId),
        ),
      ].slice(0, 3)
      if (people.length < 3) continue
      let unpaid = s
      for (const id of people) unpaid = withWorker(unpaid, id, { onLeave: true, leavePaid: false })
      const flipped = personaCtx('finance-fpa', { sample: unpaid })
      for (const v of ['fy27-working', 'fy28-working']) {
        const edit: AssumptionRow = {
          version: v,
          table: 'vacancyFactor',
          org: department,
          key: '*',
          value: 0.07,
        }
        expect(assumptionEditCheck(flipped, [edit], v), `${department} ${v}`).toBe(
          assumptionEditCheck(fin, [edit], v),
        )
        expect(movers(flipped, edit, v), `${department} ${v}`).toEqual(movers(fin, edit, v))
        checked += 1
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8)
  }, 900_000)
})
