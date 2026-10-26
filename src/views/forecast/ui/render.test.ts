/**
 * The Forecast view's tabs render on the sample in every mode that shows the view (React markup
 * through renderToStaticMarkup inside the shell's providers, in the node environment): each tab
 * draws its key figures and figures, and the markup carries no exclamation mark; in HRBP mode every
 * full amount printed is a whole $0.1M.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { StateCreator, StoreApi } from 'zustand/vanilla'
import { MemoryStorage } from '@/testkit/memoryStorage'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
// Server rendering reads a store's initial state; here the server snapshot is the live state.
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
// The chart kit reads the theme's tokens from the page's styles; markup on the server has none.
vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '', colorScheme: 'light' }))
vi.stubGlobal('document', { documentElement: {} })

const { useStore, setSampleSource } = await import('@/data/store')
const { useMode } = await import('@/access/store')
const { connectAccess } = await import('@/access/connect')
const { cachedSample, SAMPLE_AS_OF } = await import('@/data/sample')
const { MemoryStore } = await import('@/plan/store/memoryStore')
const { startPlan } = await import('@/app/planState')
const { ShellProviders } = await import('@/app/providers')
const { view } = await import('../index')

type Mode = 'hrbp' | 'leader' | 'finance' | 'hr-admin'

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')

function render(mode: Mode, tab: string): string {
  useMode.setState({ mode, picking: null })
  return textOf(renderToStaticMarkup(createElement(ShellProviders, null, createElement(view.View, { tab }))))
}

beforeAll(async () => {
  setSampleSource({ data: () => cachedSample().datasets, asOf: SAMPLE_AS_OF })
  await useStore.getState().init()
  await startPlan(new MemoryStore())
  connectAccess({ notify: () => undefined })
}, 120_000)

/** A full dollar amount ("$1,234,567"), not a compact one ("$1.2M"). */
const FULL_AMOUNT = /\$([\d,]+)(?![\d,.]*\s?[MK])/g

describe('the Forecast tabs', () => {
  it('render their strips and figures in every mode that shows the view', () => {
    for (const mode of ['hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const overview = render(mode, 'overview')
      const variance = render(mode, 'variance')
      const bridge = render(mode, 'bridge')
      expect(overview, mode).toContain('Year-end heads forecast')
      expect(overview, mode).toContain('Starts and exits by month')
      expect(variance, mode).toContain('Variance')
      expect(bridge, mode).toContain('Bridge')
      for (const t of [overview, variance, bridge]) {
        expect(t, mode).not.toContain('!')
      }
      if (mode === 'hrbp')
        for (const t of [overview, variance, bridge])
          for (const [, amount] of t.matchAll(FULL_AMOUNT))
            expect(Number(amount.replace(/,/g, '')) % 100_000, `${mode} $${amount}`).toBe(0)
    }
  })
})
