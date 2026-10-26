/**
 * The Audit page as the shell renders it (React markup through renderToStaticMarkup, the sample
 * loaded through the stores, the page mounted under the shell's current view with every dataset, as
 * src/app/pages.tsx mounts it): audit entries are plan state, so neither the page's KPI nor its
 * figure carries a data tier (M2 browser finding B4: the "Audit entries" tile read Bronze, from the
 * requests dataset). Control: a tile with no fields of its own, drawn under the shell's view outside
 * the page, does take the fallback datasets' tier, so the page's own view is what keeps it off.
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

const { useStore, setSampleSource } = await import('@/data/store')
const { useMode } = await import('@/access/store')
const { connectAccess } = await import('@/access/connect')
const { cachedSample, SAMPLE_AS_OF } = await import('@/data/sample')
const { DATASET_KEYS } = await import('@/data/schema')
const { TIER_LABEL } = await import('@/data/quality/tier')
const { MemoryStore } = await import('@/plan/store/memoryStore')
const { startPlan } = await import('@/app/planState')
const { ShellProviders } = await import('@/app/providers')
const { CurrentViewProvider } = await import('@/components/currentView')
const { KpiStrip } = await import('@/components/KpiStrip')
const { AuditPage } = await import('./AuditPage')
/** The provider as a component that takes its children as createElement's third argument. */
const InView = CurrentViewProvider as unknown as (p: { value: unknown }) => ReactNode

const SHELL_VIEW = { key: 'audit' as const, label: 'Audit', tabs: [], tab: '', datasets: DATASET_KEYS }

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

function render(mode: 'hr-admin' | 'hrbp', body: ReactNode): string {
  useMode.setState({ mode, picking: null })
  return textOf(
    renderToStaticMarkup(
      createElement(ShellProviders, null, createElement(InView, { value: SHELL_VIEW }, body)),
    ),
  )
}

const TIER_WORDS = Object.values(TIER_LABEL)

beforeAll(async () => {
  setSampleSource({ data: () => cachedSample().datasets, asOf: SAMPLE_AS_OF })
  await useStore.getState().init()
  await startPlan(new MemoryStore())
  connectAccess({ notify: () => undefined })
}, 120_000)

describe('the Audit page takes no data tier (B4)', () => {
  it('draws its KPI and entries with no tier word, in HR admin and in HRBP mode', () => {
    for (const mode of ['hr-admin', 'hrbp'] as const) {
      const html = render(mode, createElement(AuditPage))
      expect(html, mode).toContain('Audit entries')
      for (const w of TIER_WORDS) expect(html.includes(` ${w} `), `${mode}: ${w}`).toBe(false)
    }
    expect(render('hr-admin', createElement(AuditPage))).toContain('Chain checks out (0 entries)')
    expect(render('hrbp', createElement(AuditPage))).toContain('0 entries')
  })

  it('control: a tile with no fields, drawn under the shell’s view outside the page, takes a tier', () => {
    const kpi = { id: 'probe', label: 'Probe tile', value: 3, format: 'int' as const, uses: [] }
    const html = render('hr-admin', createElement(KpiStrip, { kpis: [kpi] }))
    expect(TIER_WORDS.some((w) => html.includes(` ${w} `))).toBe(true)
  })
})
