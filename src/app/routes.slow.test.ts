/**
 * Every route through the whole shell, in every mode, on the sample (React markup through
 * renderToStaticMarkup, the node environment): each folder tab the mode shows, each of its shown
 * tabs, and each masthead page. The views and pages are their builders'; this checks that the shell
 * mounts each one through the registry and its frozen ViewDef (or the page's own module) with the
 * band, the filter row where it belongs, the view header and the footer, and that a route the mode
 * hides never renders (the route guard sends it to the mode's home).
 *
 * Server rendering has no error boundaries, so a body that throws fails here. Until M3 What if's body
 * threw its contract's stub error (the browser's boundary shows it as "What if is not part of this
 * build yet.", src/app/shell.test.ts); from M3 every body renders, and a stub fails the route.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { StateCreator, StoreApi } from 'zustand/vanilla'
import { MemoryStorage } from '@/testkit/memoryStorage'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
/** Server rendering reads a store's server snapshot; here it is the live state (as in shell.test.ts). */
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

const { useStore, setSampleSource, homeView } = await import('@/data/store')
const { useMode } = await import('@/access/store')
const { connectAccess } = await import('@/access/connect')
const { MODES } = await import('@/access/modes')
const { cachedSample, SAMPLE_AS_OF } = await import('@/data/sample')
const { MemoryStore } = await import('@/plan/store/memoryStore')
const { useAnalytics } = await import('@/data/context')
const { PAGE_KEYS } = await import('@/data/schema')
const { folderViews } = await import('@/views/registry')
const { App } = await import('./App')
const { DOM_IDS } = await import('./brand')
const { isNotBuilt } = await import('./headlineGate')
const { PAGES } = await import('./pages')
const { startPlan } = await import('./planState')
const { ShellProviders } = await import('./providers')

type Mode = (typeof MODES)[number]
type Access = ReturnType<typeof useAnalytics>['access']

/** The access context the shell builds for a mode. */
function accessOf(mode: Mode): Access {
  useMode.setState({ mode, picking: null })
  let out: Access | null = null
  function Probe() {
    out = useAnalytics().access
    return null
  }
  renderToStaticMarkup(createElement(ShellProviders, null, createElement(Probe)))
  if (!out) throw new Error('no access context')
  return out
}

/** Navigate, then render the whole app; null when the body is still being built. */
function renderRoute(view: string, tab: string): string | null {
  useStore.getState().navigate(view as never, tab, { history: 'replace' })
  try {
    return renderToStaticMarkup(createElement(App))
  } catch (err) {
    if (isNotBuilt(err)) return null
    throw err
  }
}

beforeAll(async () => {
  setSampleSource({ data: () => cachedSample().datasets, asOf: SAMPLE_AS_OF })
  await useStore.getState().init()
  await startPlan(new MemoryStore())
  // Registers the guards (the route guard included) and fills every mode's pick with its persona.
  connectAccess({ notify: () => undefined })
}, 120_000)

describe('every route through the shell', () => {
  for (const mode of MODES) {
    it(`renders every folder tab, tab and page ${mode} mode shows, and sends hidden pages home`, () => {
      const access = accessOf(mode)
      const views = folderViews(access)
      expect(views.length, mode).toBeGreaterThan(0)
      for (const v of views) {
        for (const t of v.tabs) {
          const where = `${mode} #${v.key}.${t.key}`
          const html = renderRoute(v.key, t.key)
          // No view is a stub from M3 on: What if, the last, renders too.
          if (html === null) throw new Error(`${where} threw a contract stub`)
          expect(useStore.getState().route, where).toMatchObject({ view: v.key, tab: t.key })
          expect(html, where).toContain(`id="tab-${v.key}" aria-selected="true"`)
          if (v.tabs.length > 1)
            expect(html, where).toContain(`id="subtab-${v.key}-${t.key}" aria-selected="true"`)
          expect(html, where).toContain(`id="${DOM_IDS.viewBody}"`)
          expect(html, where).toContain(`<main id="${DOM_IDS.main}"`)
        }
      }
      for (const key of PAGE_KEYS) {
        const where = `${mode} #${key}`
        const html = renderRoute(key, '')
        if (!html) throw new Error(`${where} did not render`)
        if (access.can(`page:${key}`)) {
          expect(useStore.getState().route.view, where).toBe(key)
          expect(html, where).toContain(`id="${DOM_IDS.view}"`)
          expect(html, where).toContain(PAGES[key].label)
          expect(html, where).not.toContain('not part of this build')
        } else {
          // The route guard sends a hidden page to the mode's home and the band shows that home.
          expect(useStore.getState().route.view, where).toBe(homeView())
          expect(html, where).toContain(`id="tab-${homeView()}" aria-selected="true"`)
        }
      }
    }, 180_000)
  }
})
