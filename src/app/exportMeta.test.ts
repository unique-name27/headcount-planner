/**
 * What the shell stamps on screens and exports (the template app's exportMeta test, with HCP's plan
 * header, docs/PLAN.md 14.1 item 1): provenance, the export meta, the plan facts on the sample, and
 * the mode an off-screen render rebuilds.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { accessFor } from '@/access/context'
import { MODES, NO_PICKS } from '@/access/modes'
import { samplePicks } from '@/access/store'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample, type Sample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import {
  accessInputOf,
  buildExportMeta,
  COST_DEFINITION,
  companyLine,
  datasetNote,
  FORECAST_RATES,
  planHeaderOf,
  ratesLine,
  rateText,
  resolveTab,
  roundingLine,
  uploadedCount,
} from './exportMeta'

const sources = (uploaded: Partial<Record<DatasetKey, SourceMeta>> = {}) =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, uploaded[k] ?? { kind: 'sample', rowCount: 10 }])) as Record<
    DatasetKey,
    SourceMeta
  >

describe('provenance', () => {
  it('counts uploaded datasets out of all of them', () => {
    expect(uploadedCount(sources())).toEqual({ uploaded: 0, total: DATASET_KEYS.length })
    const s = sources({
      reqs: { kind: 'upload', rowCount: 40, fileName: 'reqs.xlsx' },
      workers: { kind: 'upload', rowCount: 900 },
    })
    expect(uploadedCount(s)).toEqual({ uploaded: 2, total: DATASET_KEYS.length })
  })

  it('says "Sample data" when every dataset a view reads is sample', () => {
    const note = datasetNote(['positions', 'reqs'], sources())
    expect(note.text).toBe('Sample data')
    expect(note.allSample).toBe(true)
    expect(note.datasets.map((d) => d.key)).toEqual(['positions', 'reqs'])
  })

  it('says how many of the view datasets were uploaded', () => {
    const s = sources({ reqs: { kind: 'upload', rowCount: 1200, fileName: 'reqs.csv' } })
    const note = datasetNote(['reqs', 'positions', 'workers'], s)
    expect(note.text).toBe('Uploaded 1 of 3 datasets')
    expect(note.allSample).toBe(false)
    expect(note.datasets[0]).toMatchObject({
      key: 'reqs',
      kind: 'upload',
      rowCount: 1200,
      fileName: 'reqs.csv',
    })
  })

  it('names the company only for sample data', () => {
    expect(companyLine(true, 'Northgate Semiconductor')).toBe('Northgate Semiconductor')
    expect(companyLine(false, 'Northgate Semiconductor')).toBe('Your data')
  })
})

describe('resolveTab', () => {
  const tabs = [{ key: 'overview' }, { key: 'positions' }]
  it('keeps a known tab and falls back to the first', () => {
    expect(resolveTab(tabs, 'positions')).toBe('positions')
    expect(resolveTab(tabs, '')).toBe('overview')
    expect(resolveTab(tabs, 'nope')).toBe('overview')
    expect(resolveTab([], 'x')).toBe('')
  })
})

describe('buildExportMeta', () => {
  const window = { start: '2026-04-01', end: '2027-03-31', months: 12, label: '1 Apr 2026 – 31 Mar 2027' }
  const base = {
    viewLabel: 'Plan',
    scopeLabel: 'Whole company',
    window,
    asOf: '2026-09-30',
    isSample: true,
    sampleCompany: 'Northgate Semiconductor',
  }

  it('stamps view, tab, scope, window and as-of', () => {
    expect(buildExportMeta({ ...base, tabLabel: 'Positions' })).toEqual({
      view: 'Plan',
      tab: 'Positions',
      scope: 'Whole company',
      window: '1 Apr 2026 – 31 Mar 2027',
      asOf: '2026-09-30',
      isSample: true,
      company: 'Northgate Semiconductor',
    })
  })

  it('does not name the sample company on uploaded data', () => {
    const meta = buildExportMeta({ ...base, isSample: false })
    expect(meta.company).toBe('Company data')
    expect(meta.tab).toBeUndefined()
  })

  it('carries the data standard, the mode lines and the plan facts when given', () => {
    const plan = {
      version: 'FY27 Working',
      versionState: 'working' as const,
      lockHash: null,
      comparison: 'vs FY27 Budget',
      proration: 'daily' as const,
      rates: 'Plan rates (EUR 1.08)',
      costDefinition: COST_DEFINITION,
      filters: 'Whole company; period: FY27',
      rounding: 'Exact for groups of 5 or more',
    }
    const meta = buildExportMeta({
      ...base,
      standard: 'gold',
      modeLine: 'Made in Finance mode.',
      costLine: 'Cost amounts cover groups of 5 or more costed people. Individual pay is left out.',
      plan,
    })
    expect(meta.standard).toBe('gold')
    expect(meta.modeLine).toBe('Made in Finance mode.')
    expect(meta.plan).toEqual(plan)
    expect('standard' in buildExportMeta(base)).toBe(false)
  })

  it('stamps no scope, window, as-of, standard, mode or plan lines for a page that reads no datasets', () => {
    const meta = buildExportMeta({
      ...base,
      viewLabel: 'Action center',
      standard: 'bronze',
      modeLine: 'Made in HRBP mode.',
      readsData: false,
    })
    expect(meta).toEqual({
      view: 'Action center',
      scope: '',
      window: '',
      asOf: '',
      isSample: false,
      company: '',
    })
  })
})

describe('the plan header on the sample', () => {
  let sample: Sample
  let ctx: (
    mode: (typeof MODES)[number],
    extra?: Partial<Parameters<typeof buildContext>[0]>,
  ) => AnalyticsContext

  beforeAll(() => {
    sample = generateSample()
    const src = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: sample.datasets[k].length }]),
    ) as Record<DatasetKey, SourceMeta>
    ctx = (mode, extra = {}) =>
      buildContext({
        data: sample.datasets,
        sources: src,
        filters: DEFAULT_FILTERS,
        asOfOverride: null,
        mode,
        plan: sample.plan,
        ...extra,
      })
  }, 60_000)

  it('names FY27 Working, not locked, against the mode default comparison', () => {
    const fin = planHeaderOf(ctx('finance'))
    expect(fin.version).toBe('FY27 Working')
    expect(fin.versionState).toBe('working')
    expect(fin.lockHash).toBeNull()
    expect(fin.comparison).toBe('vs FY27 Budget')
    expect(fin.proration).toBe('daily')
    expect(fin.costDefinition).toBe(COST_DEFINITION)
    expect(fin.rounding).toBe('Exact for groups of 5 or more')
    expect(fin.filters).toBe('Whole company; period: FY27')
    expect(planHeaderOf(ctx('hrbp')).comparison).toBe('vs plan of record (Q1 Reforecast)')
  })

  it('names a tree scope by its label in the Filters fact, never by a position ID (review CP-10)', () => {
    const picks = samplePicks(sample.personas)
    const manager = ctx('manager', { actingAs: picks })
    const tree = manager.access.scope
    if (tree?.kind !== 'tree') throw new Error('Manager mode holds a tree')
    expect(manager.filters.leaderId).not.toBeNull()
    expect(planHeaderOf(manager).filters).toBe(`${tree.label}; period: FY27`)
    expect(planHeaderOf(manager).filters).not.toMatch(/P-\d/)
    const leader = ctx('leader', { actingAs: picks })
    expect(planHeaderOf(leader).filters).toBe(`${leader.access.scope?.label}; period: FY27`)
    // A leader filter outside a tree scope names the seat's holder.
    const admin = ctx('hr-admin', { filters: { ...DEFAULT_FILTERS, leaderId: manager.filters.leaderId } })
    expect(planHeaderOf(admin).filters).toMatch(/^[^;]+'s org; period: FY27$/)
    expect(planHeaderOf(admin).filters).not.toMatch(/P-\d/)
  })

  it('states a locked version with its hash, and the plan rates it stores', () => {
    const h = planHeaderOf(
      ctx('finance', { picks: { version: sample.locks.budget.versionId, compare: null } }),
    )
    expect(h.version).toBe('FY27 Budget')
    expect(h.versionState).toBe('locked')
    expect(h.lockHash).toBe(sample.locks.budget.hash)
    expect(h.lockHash).toMatch(/^sha256-[0-9a-f]{64}$/)
    expect(h.rates).toMatch(/^Plan rates \((?:[A-Z]{3} \d+(?:\.\d+)?)(?:, [A-Z]{3} \d+(?:\.\d+)?)*\)$/)
    expect(h.rates).toContain('EUR 1.08')
    expect(h.rates).toContain('ILS 0.27')
  })

  it('states rates, cost definition and rounding in Manager mode as amount-free words (7.6, SB-4), and every rate as a number above 0', () => {
    const h = planHeaderOf(ctx('manager'))
    expect([h.rates, h.costDefinition, h.rounding]).toEqual([
      'Not used: no amounts in Manager mode',
      'Heads and FTE only',
      'No amounts',
    ])
    expect(h.rounding).toBe(roundingLine(ctx('manager').guard))
    // No ISO code and no amount in any Manager fact.
    for (const fact of Object.values(h)) expect(String(fact)).not.toMatch(/\b[A-Z]{3} \d|\$|USD/)
    expect(h.version).toBe('FY27 Working')
    expect(planHeaderOf(ctx('manager'), 'forecast').rates).toBe('Not used: no amounts in Manager mode')
    expect(planHeaderOf(ctx('finance'), 'forecast').rates).toBe(FORECAST_RATES)
    // A small rate (VND) keeps its significant digits rather than reading "VND 0".
    const fin = planHeaderOf(ctx('finance')).rates
    expect(fin).not.toMatch(/[A-Z]{3} 0(?:[,)])/)
    expect(rateText(0.000039684)).toBe('0.00003968')
    expect(rateText(1.08)).toBe('1.08')
    expect(rateText(0.27)).toBe('0.27')
  })

  it('reads Working plan rates from its assumption rows', () => {
    const c = ctx('hr-admin')
    expect(ratesLine(c.version, c.all.assumptions)).toContain('EUR 1.08')
    expect(ratesLine(null, [])).toBe('Plan rates')
  })

  it('says the rounding each mode applies', () => {
    const rules = { minCosted: 5, floorUsd: 100_000, minContributors: 5 }
    expect(roundingLine({ mode: 'exact', rules })).toBe('Exact for groups of 5 or more')
    expect(roundingLine({ mode: 'rounded', rules })).toBe('Rounded down to $0.1M per team')
    expect(roundingLine({ mode: 'open', rules })).toBe('None: HR admin with pay amounts shown')
    expect(roundingLine({ mode: 'none', rules })).toBe('No amounts')
    expect(roundingLine(ctx('hrbp').guard)).toBe('Rounded down to $0.1M per team')
    expect(roundingLine(ctx('hr-admin', { showPay: true }).guard)).toBe(
      'None: HR admin with pay amounts shown',
    )
  })
})

describe('the mode a whole-view export renders in', () => {
  it('rebuilds the same mode, pick and switch', () => {
    const pick = { personId: 'E10077', name: 'Da-eun Oh', unit: 'Silicon Engineering' }
    for (const mode of MODES) {
      const access = accessFor(mode, null, null, false, { actingAs: pick, switchOn: true })
      const input = accessInputOf(access)
      expect(input.mode).toBe(mode)
      expect(input.picks).toEqual({ ...NO_PICKS, [mode]: pick })
      // Only HR admin has the switch.
      expect(input.switchOn).toBe(mode === 'hr-admin')
    }
    // A mode with no pick yet renders with none, so the off-screen tabs hold nobody too.
    expect(accessInputOf(accessFor('manager')).picks).toEqual(NO_PICKS)
  })
})
