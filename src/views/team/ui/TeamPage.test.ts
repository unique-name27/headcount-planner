/**
 * My team as the shell renders it (React markup through renderToStaticMarkup, the node environment,
 * the sample loaded through the stores): in Manager mode acting as Manager A the page shows the hero,
 * the seven key figures with their words, Plan > Hiring's Open to hire under the hero (9.7), Needs
 * attention, the request tracker and heads by month, and not one amount; with no pick it shows only
 * the picker's empty state.
 */
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { StateCreator, StoreApi } from 'zustand/vanilla'
import { MemoryStorage } from '@/testkit/memoryStorage'

/** The phone layout, switched per test (review HU-7); the wide layout unless a test sets it. */
let NARROW = false
vi.mock('@/components/useNarrow', async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>
  return { ...orig, useNarrow: () => NARROW }
})
vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
/** Server rendering reads a store's initial state; here the server snapshot is the live state. */
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
// Charts read their colors from the page's CSS; the node environment has none.
vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '', colorScheme: 'light' }))
vi.stubGlobal('document', { documentElement: {} })

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
const { view } = await import('../index')
const actionsEngine = await import('@/views/actions/engine')
const marksModule = await import('@/views/actions/engine/marks')
const { ITEM_SOURCES } = await import('@/views/home/engine/sources')
const { sampleContext } = await import('../engine/testkit')

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')

function render(node: ReactNode): string {
  const current = {
    key: 'team' as const,
    label: 'My team',
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
}, 120_000)

describe('My team on screen', () => {
  it('draws the hero, the seven key figures, Needs attention, the tracker and the month figure', () => {
    useMode.setState({ mode: 'manager', picking: null })
    const html = render(createElement(view.View, { tab: 'overview' }))
    const text = textOf(html)
    for (const words of [
      'Left to fill',
      'Allocation',
      'Filled',
      'Open',
      'Planned',
      'Pending requests',
      'Left to request',
      'Budget status',
      'On track',
      'Needs attention',
      'My list',
      'Request tracker',
      'Heads by month',
    ])
      expect(text, words).toContain(words)
    for (const id of ['team-left-to-fill', 'team-tracker', 'team-heads-vs-allocation'])
      expect(html).toContain(id)
  })

  it('draws Open to hire under the hero with its note, after the key figures in page order (9.7)', () => {
    useMode.setState({ mode: 'manager', picking: null })
    const html = render(createElement(view.View, { tab: 'overview' }))
    const text = textOf(html)
    expect(text).toContain('Open to hire, FY27')
    expect(text).toContain('Left to fill counts Open and Planned seats.')
    const strip = html.indexOf('aria-label="Open to hire"')
    expect(strip).toBeGreaterThan(0)
    // The key figures stay the page's first strip, so the tours' key figures step lands on them.
    expect(html.indexOf('aria-label="Key figures"')).toBeGreaterThan(0)
    expect(html.indexOf('aria-label="Key figures"')).toBeLessThan(strip)
    expect(html.slice(0, html.indexOf('data-tour="kpi-strip"'))).toMatch(/aria-label="Key figures"\s*$/)
    expect(html.indexOf('figure-team-left-to-fill')).toBeLessThan(strip)
  })

  it('gives each tour target one element in both layouts: the key figures, then Open to hire (review HU-7)', () => {
    useMode.setState({ mode: 'manager', picking: null })
    try {
      for (const narrow of [false, true]) {
        NARROW = narrow
        const html = render(createElement(view.View, { tab: 'overview' }))
        const count = (name: string) => html.split(`data-tour="${name}"`).length - 1
        expect(count('kpi-strip'), `narrow ${narrow}`).toBe(1)
        expect(count('team-open-to-hire'), `narrow ${narrow}`).toBe(1)
        // The tours' "Key figures" step lands on the key figures, wherever Open to hire sits.
        expect(html.slice(0, html.indexOf('data-tour="kpi-strip"')), `narrow ${narrow}`).toMatch(
          /aria-label="Key figures"\s*$/,
        )
      }
      // Control: on a phone Open to hire comes before the key figures in the page order.
      const phone = render(createElement(view.View, { tab: 'overview' }))
      expect(phone.indexOf('data-tour="team-open-to-hire"')).toBeLessThan(
        phone.indexOf('data-tour="kpi-strip"'),
      )
    } finally {
      NARROW = false
    }
  })

  it('shows no amount anywhere on the page', () => {
    useMode.setState({ mode: 'manager', picking: null })
    const text = textOf(render(createElement(view.View, { tab: 'overview' })))
    expect(text).not.toMatch(/[$€£¥₹₪]\s?\d|\b(USD|EUR|INR|ILS)\b/)
    expect(text).not.toContain('!')
  })

  it('leaves out of Needs attention what this browser snoozed in the Action center', () => {
    useMode.setState({ mode: 'manager', picking: null })
    const { actionsModel } = actionsEngine
    const needs = actionsModel(sampleContext('manager'), ITEM_SOURCES).needs
    expect(needs.length).toBeGreaterThan(0)
    const before = textOf(render(createElement(view.View, { tab: 'overview' })))
    for (const a of needs) expect(before).toContain(a.item.what)
    const { serializeMarks, STORAGE_KEY, withSnoozed } = marksModule
    localStorage.setItem(STORAGE_KEY, serializeMarks(withSnoozed({}, needs, Date.now(), 3)))
    try {
      const after = textOf(render(createElement(view.View, { tab: 'overview' })))
      for (const a of needs) expect(after).not.toContain(a.item.what)
      expect(after).toContain('Nothing is waiting on you.')
    } finally {
      localStorage.removeItem(STORAGE_KEY)
    }
  })

  it('asks for a manager when the pick is missing', () => {
    const picks = useMode.getState().actingAs
    useMode.setState({ mode: 'manager', picking: null, actingAs: { ...picks, manager: null } })
    try {
      const text = textOf(render(createElement(view.View, { tab: 'overview' })))
      expect(text).toContain('Act as a manager')
      expect(text).not.toContain('Request tracker')
      expect(text).not.toContain('Open to hire')
    } finally {
      useMode.setState({ actingAs: picks })
    }
  })
})
