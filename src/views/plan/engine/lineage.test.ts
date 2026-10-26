/**
 * What the Plan view's numbers read (the template app's lineage test): every lineage names schema
 * fields only, every figure, tile and finding declares one, the active filters add the fields they
 * read, and the model's words keep the copy rules (docs/PLAN.md 14.3: sentence case, no em dash
 * between words, no "!", no mode words, never the template's name).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { NO_PICKS } from '@/access/modes'
import { samplePicks } from '@/access/store'
import { buildContext } from '@/data/context'
import { invalidRefs } from '@/data/quality/fieldRef'
import { buildSampleState } from '@/data/quality/seed'
import { cachedSample, SAMPLE_AS_OF } from '@/data/sample'
import { starterSample } from '@/data/sample/raw/starter'
import { DATASET_KEYS } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import { resolveDrill } from '@/drill/types'
import { homeModel } from '@/views/home/engine'
import { ID } from '../metrics'
import { planModel } from '.'
import { planActions } from './actions'
import { everyMode, sample, sampleCtx } from './fixtures'
import { allRefs, FIGURE } from './lineage'
import { expectPlainCopy, wordsOf } from './testing'

beforeAll(() => {
  sample()
}, 60_000)

describe('lineage', () => {
  it('names schema fields only', () => {
    expect(invalidRefs(allRefs())).toEqual([])
    for (const [k, refs] of Object.entries(FIGURE)) expect(refs.length, k).toBeGreaterThan(0)
  })

  it('is declared on every figure, tile and finding, with the filters’ fields', () => {
    const ctx = sampleCtx('hr-admin', { filters: { location: ['Munich'], level: ['P4'] } })
    const m = planModel(ctx)
    const figs = [
      m.overview.headsByMonth,
      m.overview.headsByUnit,
      m.overview.positionsByStatus,
      m.overview.costByUnit,
      m.overview.openingsByStage,
      m.positions.grid,
      m.openings.byAge,
      m.openings.table,
      m.transfers.table,
      m.positions.changes,
      m.transfers.drafts,
    ]
    for (const f of figs) {
      expect(invalidRefs(f.uses), f.id).toEqual([])
      expect(f.uses, f.id).toContain('positions.location')
      expect(f.uses, f.id).toContain('positions.level')
    }
    for (const k of [...m.overview.kpis, ...m.openings.kpis])
      expect(k.uses, k.id).toContain('positions.level')
    for (const f of m.overview.findings) expect(f.uses?.length, f.id).toBeGreaterThan(0)
  })
})

describe('lineage of the heads tiles (B3)', () => {
  it('lists no requests field on a heads tile; actual heads and hires read workers and positions only', () => {
    // Transfers in progress is the one request-driven tile of the view.
    const requestDriven = new Set([ID.transfersOpen])
    for (const { mode, ctx } of everyMode()) {
      const m = planModel(ctx)
      const kpis = [...m.overview.kpis, ...m.positions.kpis, ...m.openings.kpis, ...m.transfers.kpis]
      for (const k of kpis) {
        if (requestDriven.has(k.metricId as never)) continue
        expect(
          (k.uses ?? []).filter((r) => r.startsWith('requests.')),
          `${mode} ${k.id}`,
        ).toEqual([])
      }
      for (const id of [ID.headsActual, ID.hiresYtd]) {
        const k = kpis.find((x) => x.metricId === id)
        if (!k) continue
        const datasets = new Set((k.uses ?? []).map((r) => r.split('.')[0]))
        expect([...datasets].sort(), `${mode} ${id}`).toEqual(['positions', 'workers'])
      }
      for (const f of m.overview.findings.filter((x) => x.id.startsWith('heads-')))
        expect(
          (f.uses ?? []).filter((r) => r.startsWith('requests.') || r.startsWith('reqs.')),
          `${mode} ${f.id}`,
        ).toEqual([])
    }
  })

  it('gives the planned hires their own records lineage, transfers included', () => {
    const m = planModel(sampleCtx('finance'))
    const k = m.openings.kpis.find((x) => x.metricId === ID.hiresYtd)
    const spec = resolveDrill(k?.deltaDrill)
    expect(spec?.uses).toContain('requests.toPositionId')
    expect(k?.uses).not.toContain('requests.toPositionId')
  })
})

describe('the head-count tiles take the tier of what they read (B4)', () => {
  it('on the app’s sample, Actual heads, Hires YTD, Openings, Average FTE and the Unit plan hero read Gold', () => {
    // The sample as the app loads it: the raw extracts' rows with their certifications (data store).
    const st = starterSample()
    const state = buildSampleState(st.data, st.seed, SAMPLE_AS_OF)
    const s = cachedSample()
    const ctx = buildContext({
      data: state.data,
      sources: Object.fromEntries(
        DATASET_KEYS.map((k) => [k, { kind: 'sample' as const, rowCount: state.data[k].length }]),
      ) as never,
      filters: { ...DEFAULT_FILTERS },
      asOfOverride: null,
      today: SAMPLE_AS_OF,
      mode: 'hrbp',
      actingAs: { ...NO_PICKS, ...samplePicks(s.personas) },
      plan: s.plan,
      picks: { version: null, compare: null },
      datasetVersions: state.versions,
    })
    const tierOf = (uses: readonly string[] | undefined) => ctx.quality.limitingOf(uses as never, []).tier
    const m = planModel(ctx)
    const tiles = [...m.overview.kpis, ...m.openings.kpis]
    for (const id of [ID.headsActual, ID.hiresYtd, ID.openingsCount, ID.fteAverage]) {
      const k = tiles.find((x) => x.metricId === id)
      expect(k, id).toBeTruthy()
      expect(tierOf(k?.uses), id).toBe('gold')
    }
    expect(tierOf(homeModel(ctx)?.hero.uses)).toBe('gold')
    // Control: a tile that reads a seat's target start keeps that field's tier.
    const past = tiles.find((x) => x.metricId === ID.openingsPastStart)
    expect(past?.uses).toContain('positions.startDate')
    expect(tierOf(past?.uses)).toBe(tierOf(['positions.startDate']))
    expect(tierOf(['positions.startDate'])).not.toBe('gold')
  })
})

describe('copy', () => {
  it('keeps the rules in every mode, items included', () => {
    for (const { mode, ctx } of everyMode()) {
      const m = planModel(ctx)
      const words = wordsOf({
        kpis: [...m.overview.kpis, ...m.positions.kpis, ...m.openings.kpis, ...m.transfers.kpis].map((k) => ({
          label: k.label,
          note: k.note,
          formula: k.formula,
          deltaLabel: k.deltaLabel,
          suppressedNote: k.suppressedNote,
        })),
        findings: m.overview.findings.map((f) => ({ title: f.title, detail: f.detail, action: f.action })),
        figures: [
          m.overview.headsByMonth,
          m.overview.headsByUnit,
          m.overview.positionsByStatus,
          m.overview.costByUnit,
          m.overview.openingsByStage,
          m.positions.grid,
          m.openings.byStage,
          m.openings.byAge,
          m.openings.table,
          m.transfers.table,
          m.positions.changes,
          m.transfers.drafts,
        ].map((f) => ({
          title: f.title,
          subtitle: f.subtitle,
          note: f.note,
          empty: f.empty,
          labels: f.columns.map((c) => c.label),
        })),
        items: planActions(ctx).map((i) => ({
          what: i.what,
          note: i.note,
          closesWhen: i.closesWhen,
          kind: i.kind,
        })),
      })
      expect(words.length, mode).toBeGreaterThan(30)
      expectPlainCopy(words, mode)
    }
  })
})
