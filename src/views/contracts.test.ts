/**
 * The M2 freeze's part 2 data (docs/CONTRACTS-M2.md): every view's and page's figure ids carry their
 * prefix and are unique, the homes' lists hold docs/PLAN.md 9.3's ids, key figures and Needs
 * attention kinds (each routed to `needs` in its mode), the views' item kinds are exactly
 * `ITEM_KINDS`, the drill layer's kinds are exactly `DRILL_KINDS`, the Data room's tabs are
 * `DATA_TABS`, an `ActionItem` has what the routing reads, the shared links and marks render
 * nothing outside an analytics context, and the shell's dataset opener does what the contract says.
 * The builders' own tests check the bodies.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  DATA_TABS,
  DRILL_KINDS,
  FIGURE_PREFIXES,
  ITEM_KINDS,
  METRIC_IDS,
  HOME_FIGURES as POLICY_HOME_FIGURES,
  VIEW_TABS,
} from '@/access/ids'
import { ITEM_ROUTING, type ItemFacts } from '@/access/items'
import { HOME_SLUG, MODES, SHARED_HOME_FIGURES } from '@/access/modes'
import { clearDatasetFocus, openDatasetQuality, useDatasetFocus } from '@/app/datasetFocus'
import { openSettings, useSettingsSheet } from '@/app/settings/store'
import type { Mode } from '@/data/schema'
import { useStore } from '@/data/store'
import { type CalcSpec, resolveCalc } from '@/drill/calc'
import { useDrillStore } from '@/drill/store'
import { DRILL_DATASET, DRILL_RECORD_KINDS, type DrillSpec, resolveDrill } from '@/drill/types'
import { LearnMoreLink } from '@/help/ui/LearnMore'
import { ACTIONS_FIGURES } from '@/views/actions/engine/figures'
import { ID as ACTIONS_ID } from '@/views/actions/metrics'
import { AUDIT_FIGURES } from '@/views/audit/engine/figures'
import { DATA_ROOM_TABS } from '@/views/data/engine'
import { DATA_FIGURES } from '@/views/data/engine/figures'
import { DefinitionChangedMark, EditDefinitionLink } from '@/views/data/metrics/ui/EditDefinition'
import { QualityLensLine } from '@/views/data/quality-overview/LensLine'
import { ID as DATA_ID } from '@/views/data/roomMetrics'
import { FINANCE_ITEM_KINDS } from '@/views/finance/engine/actions'
import { FINANCE_FIGURES } from '@/views/finance/engine/figures'
import { FORECAST_FIGURES } from '@/views/forecast/engine/figures'
import { homeTitle } from '@/views/home/engine'
import {
  ALL_HOME_FIGURES,
  HIRING_KEY_FIGURE,
  HIRING_TILE_AT,
  HOME_FIGURES,
  HOME_KEY_COUNT_WITH_HIRING,
  HOME_KEY_FIGURES,
  HOME_NEEDS,
  type HomeSlug,
  SHARED,
  SLUG_OF,
} from '@/views/home/engine/figures'
import { PLAN_ITEM_KINDS } from '@/views/plan/engine/actions'
import { PLAN_FIGURES } from '@/views/plan/engine/figures'
import { REQUESTS_ITEM_KINDS } from '@/views/requests/engine/actions'
import { REQUESTS_FIGURES } from '@/views/requests/engine/figures'
import { TARGETS_ITEM_KINDS } from '@/views/targets/engine/actions'
import { TARGETS_FIGURES } from '@/views/targets/engine/figures'
import { TEAM_FIGURES, TEAM_KEY_METRICS, TEAM_NEEDS } from '@/views/team/engine/figures'
import { ACTION_OWNER_LABEL, ACTION_OWNER_ROLES, type ActionItem } from '@/views/types'
import { WHATIF_FIGURES } from '@/views/whatif/engine/figures'

const VIEW_FIGURES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  team: TEAM_FIGURES,
  plan: PLAN_FIGURES,
  requests: REQUESTS_FIGURES,
  forecast: FORECAST_FIGURES,
  targets: TARGETS_FIGURES,
  whatif: WHATIF_FIGURES,
  finance: FINANCE_FIGURES,
  actions: ACTIONS_FIGURES,
  audit: AUDIT_FIGURES,
  data: DATA_FIGURES,
}

describe('figure ids', () => {
  it('start with their view or page and a prefix the policy decides', () => {
    for (const [view, ids] of Object.entries(VIEW_FIGURES)) {
      expect(FIGURE_PREFIXES, view).toContain(`${view}-`)
      for (const id of Object.values(ids)) {
        expect(id.startsWith(`${view}-`), id).toBe(true)
        expect(id, id).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/)
      }
    }
  })

  it('on each role home start with its slug, or are the three every home draws', () => {
    expect(SHARED).toEqual(SHARED_HOME_FIGURES)
    for (const [slug, ids] of Object.entries(HOME_FIGURES)) {
      expect(FIGURE_PREFIXES).toContain(`home-${slug}-`)
      for (const id of ids) expect(SHARED.includes(id) || id.startsWith(`home-${slug}-`), id).toBe(true)
      for (const id of SHARED) expect(ids, slug).toContain(id)
    }
  })

  it('are unique across the app', () => {
    const all = [...Object.values(VIEW_FIGURES).flatMap((ids) => Object.values(ids)), ...ALL_HOME_FIGURES]
    expect(new Set(all).size).toBe(all.length)
  })

  it("hold every home figure the policy names (docs/PLAN.md 9.3's other figures and the shared three)", () => {
    const drawn = new Set([...ALL_HOME_FIGURES, ...Object.values(TEAM_FIGURES)])
    for (const f of POLICY_HOME_FIGURES) expect(drawn.has(f.id), f.id).toBe(true)
  })
})

describe('homes (docs/PLAN.md 9.3)', () => {
  it('open on the slug the mode table names', () => {
    for (const mode of MODES) expect(SLUG_OF[mode], mode).toBe(HOME_SLUG[mode])
  })

  it('have 7, 6, 6 and 6 key figures, each a known metric on a tab that exists', () => {
    // 9.3 with 9.7 (change C36): Open to hire joins the Unit plan and Rollup vs target strips at
    // HIRING_TILE_AT; Plan vs actual keeps 6, and My team's 7 stay (its tile sits beside the hero).
    expect(TEAM_KEY_METRICS).toHaveLength(7)
    expect(HOME_KEY_FIGURES.unit).toHaveLength(6)
    expect(HOME_KEY_FIGURES.rollup).toHaveLength(6)
    expect(HOME_KEY_FIGURES.fin).toHaveLength(6)
    for (const slug of ['unit', 'rollup', 'fin'] as const)
      expect(HOME_KEY_FIGURES[slug], slug).toHaveLength(HOME_KEY_COUNT_WITH_HIRING[slug])
    expect(HOME_KEY_FIGURES.unit[HIRING_TILE_AT.unit]).toBe(HIRING_KEY_FIGURE)
    expect(HOME_KEY_FIGURES.rollup[HIRING_TILE_AT.rollup]).toBe(HIRING_KEY_FIGURE)
    expect(HOME_KEY_FIGURES.fin).not.toContain(HIRING_KEY_FIGURE)
    expect(TEAM_KEY_METRICS).not.toContain(HIRING_KEY_FIGURE.metricId)
    for (const id of TEAM_KEY_METRICS) expect(METRIC_IDS, id).toContain(id)
    for (const [slug, list] of Object.entries(HOME_KEY_FIGURES)) {
      expect(new Set(list.map((k) => k.metricId)).size, slug).toBe(list.length)
      for (const k of list) {
        expect(METRIC_IDS, k.metricId).toContain(k.metricId)
        expect(
          VIEW_TABS[k.view].map((t) => t.key),
          k.metricId,
        ).toContain(k.tab)
      }
    }
  })

  it('promise Needs attention kinds that route to needs in their mode', () => {
    const modeOf: Record<HomeSlug | 'team', Mode> = {
      team: 'manager',
      unit: 'hrbp',
      rollup: 'leader',
      fin: 'finance',
    }
    const lists = { team: TEAM_NEEDS, ...HOME_NEEDS }
    for (const [home, kinds] of Object.entries(lists)) {
      const mode = modeOf[home as HomeSlug | 'team']
      for (const kind of kinds) {
        expect(ITEM_KINDS, kind).toContain(kind)
        const routes = ITEM_ROUTING[kind][mode] ?? []
        expect(
          routes.some((r) => r.list === 'needs'),
          `${home}: ${kind}`,
        ).toBe(true)
      }
    }
  })

  it('are titled by the role home, else Home', () => {
    expect(MODES.map((m) => homeTitle(m))).toEqual([
      'Home',
      'Unit plan',
      'Rollup vs target',
      'Plan vs actual',
      'Home',
    ])
  })
})

describe('Action center items (docs/PLAN.md 9.6)', () => {
  const byView = [PLAN_ITEM_KINDS, REQUESTS_ITEM_KINDS, TARGETS_ITEM_KINDS, FINANCE_ITEM_KINDS]

  it('are raised by exactly one view each, every kind in ITEM_KINDS', () => {
    const raised = byView.flat()
    expect(new Set(raised).size).toBe(raised.length)
    expect([...raised].sort()).toEqual([...ITEM_KINDS].sort())
    for (const kinds of byView) {
      const views = new Set(kinds.map((k) => k.split(':')[0]))
      expect(views.size).toBe(1)
    }
  })

  it('have what the routing reads', () => {
    const item: ActionItem = {
      id: 'plan:past-start:P-1001',
      ownerRole: 'manager',
      ownerId: 'E10001',
      ownerName: 'Priya Raman',
      due: '2026-10-15',
      severity: 'info',
      what: 'P-1001 is past its target start of 1 Oct',
      subject: { kind: 'positions', id: 'P-1001', label: 'P-1001 Design engineer' },
      view: 'plan',
      tab: 'openings',
      place: { positionId: 'P-1001', businessUnit: 'Silicon Engineering', department: 'Design' },
    }
    const facts: ItemFacts = item
    expect(facts.subject.kind).toBe('positions')
  })

  it('name their owner groups in sentence case', () => {
    expect(ACTION_OWNER_ROLES).toEqual(['manager', 'hrbp', 'leader', 'finance'])
    // Sentence case: a capital first, then lower case but for acronyms ("HR business partners").
    for (const r of ACTION_OWNER_ROLES) expect(ACTION_OWNER_LABEL[r], r).toMatch(/^[A-Z]+[a-z]*( [a-z]+)*$/)
  })
})

describe('the drill layer', () => {
  it('lists exactly the policy drill kinds, each with a dataset', () => {
    expect(DRILL_RECORD_KINDS).toBe(true)
    expect(Object.keys(DRILL_DATASET).sort()).toEqual([...DRILL_KINDS].sort())
  })

  it('resolves sources lazily', () => {
    const spec: DrillSpec<'positions'> = { kind: 'positions', title: 'Openings', rows: [] }
    expect(resolveDrill(spec)).toBe(spec)
    expect(resolveDrill(() => spec)).toBe(spec)
    expect(resolveDrill(null)).toBeNull()
    const card: CalcSpec = {
      title: 'Average FTE',
      metricId: 'plan.fte.average',
      value: 1,
      format: 'num1',
      inputs: [],
      steps: [{ label: 'FTE', expression: '1', result: 1, format: 'num1' }],
      uses: [],
    }
    expect(resolveCalc(() => card)).toBe(card)
    expect(resolveCalc(undefined)).toBeNull()
  })
})

describe('pages', () => {
  it("the Data room's tabs are the policy's", () => {
    expect(DATA_ROOM_TABS).toEqual(DATA_TABS)
  })

  it('metric ids start with their page', () => {
    for (const id of Object.values(ACTIONS_ID)) expect(id.startsWith('actions.'), id).toBe(true)
    for (const id of Object.values(DATA_ID)) expect(id.startsWith('data.'), id).toBe(true)
  })
})

describe('the shared links and marks (docs/PLAN.md 14.2, 8.3)', () => {
  // Built: each one asks the mode, so outside an analytics context it renders nothing. What each
  // shows in every mode is tested by its own module (src/help/access.test.ts for "Learn more").
  it('render nothing outside an analytics context, where there is no mode to ask', () => {
    expect(renderToStaticMarkup(createElement(LearnMoreLink, { metricId: 'plan.heads.approved' }))).toBe('')
    expect(renderToStaticMarkup(createElement(EditDefinitionLink, { metricId: 'plan.heads.approved' }))).toBe(
      '',
    )
    expect(
      renderToStaticMarkup(createElement(DefinitionChangedMark, { metricId: 'plan.heads.approved' })),
    ).toBe('')
    expect(
      renderToStaticMarkup(createElement(QualityLensLine, { label: 'Approved heads', variant: 'tile' })),
    ).toBe('')
  })

  it('keep the dataset focus as plain state, the opener as the shell built it', () => {
    // The shell filled openDatasetQuality (CONTRACTS-M2 2): it closes the drill panel and Settings,
    // bumps the nonce, sets the dataset and panel, and routes to #data.<dataset>-<panel>.
    useDatasetFocus.setState({ key: 'reqs', panel: 'raw', nonce: 3 })
    clearDatasetFocus()
    expect(useDatasetFocus.getState()).toEqual({ key: null, panel: 'raw', nonce: 3 })
    useDrillStore.setState({ stack: [{ type: 'records' } as never] })
    openSettings('data')
    expect(useSettingsSheet.getState().open).toBe(true)
    openDatasetQuality('positions')
    expect(useDrillStore.getState().stack).toEqual([])
    expect(useSettingsSheet.getState().open).toBe(false)
    expect(useDatasetFocus.getState()).toEqual({ key: 'positions', panel: 'quality', nonce: 4 })
    expect(useStore.getState().route).toEqual({ view: 'data', tab: 'positions-quality' })
    openDatasetQuality('reqs', 'mapping')
    expect(useDatasetFocus.getState()).toEqual({ key: 'reqs', panel: 'mapping', nonce: 5 })
    expect(useStore.getState().route).toEqual({ view: 'data', tab: 'reqs-mapping' })
  })
})
