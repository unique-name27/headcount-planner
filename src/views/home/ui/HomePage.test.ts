/**
 * The role homes as the shell renders them (React markup through renderToStaticMarkup, the sample
 * loaded through the stores; the producing views' models and the Action center's split stood in, as
 * in ../engine/home.test.ts): each home draws its hero, its key figures, Needs attention with its two
 * figures, My list and its other figures under the ids `HOME_FIGURES` lists, the HRBP and Leader
 * homes with Plan > Hiring's Open to hire among their key figures (9.7); Manager mode and HR
 * admin say where their home is; an unset HRBP pick shows only the picker's empty state.
 */
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { StateCreator, StoreApi } from 'zustand/vanilla'
import { MemoryStorage } from '@/testkit/memoryStorage'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.mock('zustand', async () => {
  const React = await import('react')
  const { createStore } = await import('zustand/vanilla')
  type Api = StoreApi<object>
  const useStore = (api: Api, selector: (s: object) => unknown = (s) => s) =>
    React.useSyncExternalStore(
      api.subscribe,
      () => selector(api.getState()),
      () => selector(api.getState()),
    )
  const create = (createState: StateCreator<object>) => {
    const api: Api = createStore(createState)
    const hook = (selector?: (s: object) => unknown) => useStore(api, selector)
    return Object.assign(hook, api)
  }
  return { create, useStore }
})
vi.stubGlobal('localStorage', new MemoryStorage())
vi.stubGlobal('BroadcastChannel', undefined)
vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '', colorScheme: 'light' }))
vi.stubGlobal('document', { documentElement: {} })

const fx = vi.hoisted(() => ({
  plan: null as unknown,
  hiring: null as unknown,
  forecast: null as unknown,
  targets: null as unknown,
  requests: null as unknown,
  finance: null as unknown,
  needs: [] as unknown[],
}))
vi.mock('@/views/plan/engine', () => ({ planModel: () => fx.plan }))
vi.mock('@/views/plan/engine/hiringTab', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/views/plan/engine/hiringTab')>()),
  planHiringModel: () => fx.hiring,
}))
vi.mock('@/views/forecast/engine', () => ({ forecastModel: () => fx.forecast }))
vi.mock('@/views/targets/engine', () => ({
  targetsModel: () => fx.targets,
  targetsHeadline: () => ({ value: '−18', label: 'gap in heads' }),
}))
vi.mock('@/views/requests/engine', () => ({ requestsModel: () => fx.requests }))
vi.mock('@/views/finance/engine', () => ({ financeModel: () => fx.finance }))
vi.mock('@/views/actions/engine', () => ({
  // The split over the items open in this browser, as the Action center's own does.
  actionsModel: (_ctx: unknown, _views: unknown, isOpen?: (a: unknown) => boolean) => {
    const needs = isOpen ? fx.needs.filter(isOpen) : fx.needs
    return { items: needs, kpis: [], needs, waiting: [], left: 0 }
  },
  collectActions: () => fx.needs,
}))

const { useStore, setSampleSource } = await import('@/data/store')
const { useMode } = await import('@/access/store')
const { connectAccess } = await import('@/access/connect')
const { cachedSample, SAMPLE_AS_OF } = await import('@/data/sample')
const { MemoryStore } = await import('@/plan/store/memoryStore')
const { startPlan } = await import('@/app/planState')
const { ShellProviders } = await import('@/app/providers')
const { CurrentViewProvider } = await import('@/components/currentView')
/** The provider as a component that takes its children as createElement's third argument. */
const InView = CurrentViewProvider as unknown as (p: { value: unknown }) => ReactNode
const { producerFixtures } = await import('../engine/fixtures')
const { HOME_FIGURES } = await import('../engine/figures')
const { view } = await import('../index')
const marksModule = await import('@/views/actions/engine/marks')

type Mode = 'manager' | 'hrbp' | 'leader' | 'finance' | 'hr-admin'

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')

function render(mode: Mode, node: ReactNode = createElement(view.View, { tab: 'overview' })): string {
  useMode.setState({ mode, picking: null })
  const current = {
    key: 'home' as const,
    label: 'Home',
    tabs: view.tabs,
    tab: 'overview',
    datasets: view.datasets,
  }
  return renderToStaticMarkup(
    createElement(ShellProviders, null, createElement(InView, { value: current }, node)),
  )
}

beforeAll(async () => {
  setSampleSource({ data: () => cachedSample().datasets, asOf: SAMPLE_AS_OF })
  await useStore.getState().init()
  await startPlan(new MemoryStore())
  connectAccess({ notify: () => undefined })
  const p = producerFixtures([])
  fx.plan = p.plan
  fx.hiring = p.hiring
  fx.forecast = p.forecast
  fx.targets = p.targets
  fx.requests = p.requests
  fx.finance = p.finance
  fx.needs = [
    {
      id: 'requests:waiting:R-2',
      markKey: 'requests:waiting:R-2',
      role: 'hrbp',
      roleLabel: 'HR business partners',
      ownerKey: 'name:Dana Ito',
      ownerId: null,
      ownerName: 'Dana Ito',
      viewLabel: 'Requests',
      tabLabel: 'Queue',
      from: 'Requests · Queue',
      item: {
        id: 'requests:waiting:R-2',
        ownerRole: 'hrbp',
        ownerName: 'Dana Ito',
        due: '2026-09-25',
        severity: 'warning',
        what: 'R-2 has waited 9 days at the HRBP step',
        subject: { kind: 'requests', id: 'R-2', label: 'Request R-2' },
        view: 'requests',
        tab: 'queue',
        kind: 'Waiting',
        place: { positionId: null, businessUnit: 'Silicon Engineering', department: null },
      },
    },
  ]
}, 120_000)

describe('the role homes on screen', () => {
  // Each render builds the homes' models for a fresh context, which can pass 30 s under the full parallel run.
  it('draw every figure their list names, in their own mode', () => {
    for (const [mode, slug] of [
      ['hrbp', 'unit'],
      ['leader', 'rollup'],
      ['finance', 'fin'],
    ] as const) {
      const html = render(mode)
      const text = textOf(html)
      // A key figures strip registers its id for exports and draws a labeled section.
      for (const id of HOME_FIGURES[slug])
        if (id.endsWith('-kpis')) expect(html, `${mode} ${id}`).toContain('aria-label="Key figures"')
        else expect(html, `${mode} ${id}`).toContain(`figure-${id}"`)
      expect(text, mode).toContain('Needs attention')
      expect(text, mode).toContain('My list')
      expect(text, mode).toContain('R-2 has waited 9 days at the HRBP step')
      expect(text, mode).not.toContain('!')
    }
  }, 120_000)

  it('show Open to hire, FY27 among the key figures on Unit plan and Rollup vs target only (9.7)', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const text = textOf(render(mode))
      expect(text, mode).toContain('Open to hire, FY27')
      expect(text, mode).toContain('14 open seats, 2 not in plan')
    }
    expect(textOf(render('finance'))).not.toContain('Open to hire')
  }, 120_000)

  it('leave out what this browser snoozed or handled in the Action center, as the masthead count does', () => {
    const { serializeMarks, STORAGE_KEY, withSnoozed } = marksModule
    localStorage.setItem(
      STORAGE_KEY,
      serializeMarks(withSnoozed({}, ['requests:waiting:R-2'], Date.now(), 3)),
    )
    try {
      for (const mode of ['hrbp', 'leader', 'finance'] as const) {
        const text = textOf(render(mode))
        expect(text, mode).toContain('Needs attention')
        expect(text, mode).not.toContain('R-2 has waited 9 days at the HRBP step')
      }
    } finally {
      localStorage.removeItem(STORAGE_KEY)
    }
    expect(textOf(render('hrbp'))).toContain('R-2 has waited 9 days at the HRBP step')
  }, 120_000)

  it('say where the home is in Manager mode and HR admin', () => {
    for (const mode of ['manager', 'hr-admin'] as const)
      expect(textOf(render(mode)), mode).toContain('Home is each role’s first page')
  })

  it('ask for an HRBP when the pick is missing', () => {
    const picks = useMode.getState().actingAs
    useMode.setState({ actingAs: { ...picks, hrbp: null } })
    try {
      const text = textOf(render('hrbp'))
      expect(text).toContain('Act as an HRBP')
      expect(text).not.toContain('My list')
    } finally {
      useMode.setState({ actingAs: picks })
    }
  })
})
