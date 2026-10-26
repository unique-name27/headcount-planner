/**
 * The shell on the sample, in every mode (React markup through renderToStaticMarkup, the node
 * environment): the first frame, the masthead (Mode button, pay and read-only tags, the Data room in
 * HR admin only), the folder tabs the mode shows, a view's header with the version and comparison
 * pickers, the filter row with its pins, and the Settings sections each mode shows (the as-of date in
 * HR admin only). The views and pages themselves are their builders'; the shell mounts the pages'
 * bodies (the Data room, the Action center, Audit) and says "<view> is not part of this build yet."
 * for a view still being built (What if was the last, until M3; it renders since). Every view tab and page rendering through the
 * shell in every mode is src/app/routes.slow.test.ts.
 */
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { StateCreator, StoreApi } from 'zustand/vanilla'
import { MemoryStorage } from '@/testkit/memoryStorage'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
/**
 * Server rendering reads a store's initial state (zustand's server snapshot), so markup of a loaded
 * shell would always show the first frame. In this file the server snapshot is the live state.
 */
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
const { modeButtonLabel, MODES, MODE_LABEL } = await import('@/access/modes')
const { NOT_SECURITY_SHORT, PAY_SHOWN_TAG } = await import('@/access/copy')
const { cachedSample, SAMPLE_AS_OF } = await import('@/data/sample')
const { READ_ONLY_NOTE } = await import('@/plan/store/types')
const { MemoryStore } = await import('@/plan/store/memoryStore')
const { Popover } = await import('@base-ui/react/popover')
const { useAnalytics } = await import('@/data/context')
const { folderViews, viewByKey } = await import('@/views/registry')
const { App } = await import('./App')
const { APP_NAME, DOM_IDS } = await import('./brand')
const { FilterBar } = await import('./FilterBar')
const { FolderTabs } = await import('./FolderTabs')
const { Masthead } = await import('./Masthead')
const { ModeMenu } = await import('./ModeMenu')
const { startPlan } = await import('./planState')
const { ShellProviders } = await import('./providers')
const { DataSection } = await import('./settings/DataSection')
const { ModeSection } = await import('./settings/ModeSection')
const { ViewErrorBoundary } = await import('./ErrorBoundary')
const { notBuilt } = await import('@/plan/notBuilt')
const { shownSections } = await import('./settings/SettingsSheet')
const { ViewHeader } = await import('./ViewHeader')

type Mode = (typeof MODES)[number]

/** Text as a reader sees it (entities decoded, tags dropped). */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')

let accessOf: (mode: Mode) => ReturnType<typeof useAnalytics>['access']

/** Render inside the shell's providers in a mode. */
function render(mode: Mode, node: ReactNode): string {
  useMode.setState({ mode, picking: null })
  return renderToStaticMarkup(createElement(ShellProviders, null, node))
}

beforeAll(async () => {
  setSampleSource({ data: () => cachedSample().datasets, asOf: SAMPLE_AS_OF })
  await useStore.getState().init()
  await startPlan(new MemoryStore())
  // Registers the guards and fills every mode's pick with its sample persona (docs/PLAN.md 13.3).
  connectAccess({ notify: () => undefined })
  accessOf = (mode) => {
    let out: ReturnType<typeof useAnalytics>['access'] | null = null
    function Probe() {
      out = useAnalytics().access
      return null
    }
    render(mode, createElement(Probe))
    if (!out) throw new Error('no access context')
    return out
  }
}, 120_000)

describe('the first frame', () => {
  it('is the loading shell with the wordmark and the main landmark', () => {
    useStore.setState({ ready: false })
    const html = renderToStaticMarkup(createElement(App))
    useStore.setState({ ready: true })
    const text = textOf(html)
    expect(text).toContain(APP_NAME)
    expect(text).toContain('Preparing the data. Nothing leaves this browser.')
    expect(html).toContain(`<main id="${DOM_IDS.main}"`)
    expect(html).toContain('aria-busy="true"')
    expect(text).not.toContain('!')
  })
})

describe('the masthead in every mode', () => {
  it('names the mode and who it acts as, and shows the Data room in HR admin only', () => {
    for (const mode of MODES) {
      const html = render(mode, createElement(Masthead))
      const text = textOf(html)
      const access = accessOf(mode)
      expect(text, mode).toContain(modeButtonLabel(mode, access.unset ? null : access.actingAs))
      expect(text.includes('Data room'), mode).toBe(mode === 'hr-admin')
      // Audit and the Data room follow their pages' decisions: no button leads to a page the mode hides.
      expect(text.includes('Audit'), mode).toBe(access.can('page:audit'))
      expect(text.includes('Data room'), mode).toBe(access.can('page:data'))
      expect(text.includes('Actions'), mode).toBe(access.can('page:actions'))
      expect(text, mode).toContain('Settings')
      expect(text, mode).toContain('As of 30 Sep 2026')
      expect(text, mode).toContain('Northgate Semiconductor')
      expect(text, mode).not.toContain(READ_ONLY_NOTE)
      expect(text, mode).not.toContain(PAY_SHOWN_TAG)
      expect(text, mode).not.toContain('!')
    }
  })

  it('says when this tab is read only, and when pay amounts are shown in HR admin', () => {
    useStore.setState({ readOnly: true, showPay: true })
    try {
      expect(textOf(render('hr-admin', createElement(Masthead)))).toContain(READ_ONLY_NOTE)
      expect(textOf(render('hr-admin', createElement(Masthead)))).toContain(`${PAY_SHOWN_TAG} Hide`)
      // Only HR admin has the switch, so no other mode shows the tag.
      expect(textOf(render('finance', createElement(Masthead)))).not.toContain(PAY_SHOWN_TAG)
    } finally {
      useStore.setState({ readOnly: false, showPay: false })
    }
  })

  it('opens a Mode menu with the five modes and the wording that modes are not security', () => {
    const menu = createElement(ModeMenu, { onClose: () => undefined })
    const text = textOf(render('hrbp', createElement(Popover.Root, { open: true }, menu)))
    for (const mode of MODES) expect(text).toContain(MODE_LABEL[mode])
    expect(text).toContain('Leaders and managers')
    expect(text).toContain(NOT_SECURITY_SHORT)
  })
})

describe('the folder tabs', () => {
  it('are the views the mode shows, My team in Manager mode only, with a headline each', () => {
    for (const mode of MODES) {
      const html = render(mode, createElement(FolderTabs))
      const tabs = [...html.matchAll(/role="tab" id="tab-([a-z]+)"/g)].map((m) => m[1])
      expect(tabs, mode).toEqual(folderViews(accessOf(mode)).map((v) => v.key))
      expect(tabs.includes('team'), mode).toBe(mode === 'manager')
    }
  })
})

describe('a view header', () => {
  it('names the view, the scope line and the version and comparison pickers', () => {
    const plan = viewByKey.get('plan')
    if (!plan) throw new Error('no Plan view')
    const fin = textOf(render('finance', createElement(ViewHeader, { view: plan, tab: 'overview' })))
    expect(fin).toContain('Plan')
    expect(fin).toContain('as of 30 Sep 2026')
    expect(fin).toContain('FY27 Working')
    expect(fin).toContain('vs FY27 Budget')
    const hrbp = textOf(render('hrbp', createElement(ViewHeader, { view: plan, tab: 'overview' })))
    expect(hrbp).toContain('vs plan of record (Q1 Reforecast)')
    expect(hrbp).toContain('Silicon Engineering')
  })
})

describe('the filter row', () => {
  it('renders in every mode, with the period and the mode’s own filters', () => {
    for (const mode of MODES) {
      const text = textOf(render(mode, createElement(FilterBar)))
      expect(text, mode).toContain('Fiscal year')
      expect(text, mode).toMatch(/in (scope|.+)/)
    }
    // Finance filters unit, cost center, legal entity, country and currency, never a leader or level.
    const fin = textOf(render('finance', createElement(FilterBar)))
    expect(fin).toContain('Cost center')
    expect(fin).not.toContain('Leader')
    expect(fin).not.toContain('Level')
    // HRBP mode pins its business unit.
    const hrbp = render('hrbp', createElement(FilterBar))
    expect(textOf(hrbp)).toContain('Business unit Silicon Engineering')
  })
})

describe('Settings', () => {
  it('shows each mode its sections, the as-of date in HR admin only', () => {
    for (const mode of MODES) {
      const access = accessOf(mode)
      const sections = shownSections((s) => access.can(s))
      expect(sections[0], mode).toBe('mode')
      expect(sections.includes('data'), mode).toBe(mode === 'hr-admin')
      expect(sections.includes('privacy'), mode).toBe(mode === 'hr-admin')
    }
    const text = textOf(render('hr-admin', createElement(DataSection)))
    expect(text).toContain('Reporting date')
    expect(text).toContain('In use: 30 Sep 2026')
  })
})

describe('Settings > Mode', () => {
  it('says who the mode acts as and that modes are not security, long and short', () => {
    for (const mode of MODES) {
      const text = textOf(render(mode, createElement(ModeSection)))
      const access = accessOf(mode)
      if (!access.unset && access.actingAs) expect(text, mode).toContain(`Acting as ${access.actingAs.name}`)
      expect(text, mode).toContain(NOT_SECURITY_SHORT)
      expect(text, mode).toContain('They are not security')
    }
  })
})

describe('a view still being built', () => {
  it('reads "<view> is not part of this build yet." instead of an error', () => {
    // Server rendering has no error boundaries, so the boundary's two faces are read directly. No
    // view is a stub from M3 on (What if was the last); the boundary still words any contract stub so.
    const boundary = new ViewErrorBoundary({ resetKey: 'whatif.levers', label: 'What if', children: null })
    boundary.state = { error: notBuilt('whatif/index.View'), key: 'whatif.levers' }
    const stub = textOf(renderToStaticMarkup(boundary.render() as never))
    expect(stub).toContain('What if is not part of this build yet.')
    expect(stub).not.toContain('could not be drawn')
    boundary.state = { error: new Error('odd data'), key: 'whatif.levers' }
    const failed = textOf(renderToStaticMarkup(boundary.render() as never))
    expect(failed).toContain('This tab could not be drawn')
    expect(failed).not.toContain('odd data')
  })

  it('is no longer What if: its Levers tab renders in every mode that shows it (M3)', () => {
    const whatif = viewByKey.get('whatif')
    if (!whatif) throw new Error('no What if view')
    let shown = 0
    for (const mode of MODES) {
      if (!accessOf(mode).can('view:whatif')) continue
      shown++
      const text = textOf(render(mode, createElement(whatif.View, { tab: 'levers' })))
      expect(text, mode).toContain('Heads change')
      expect(text, mode).toContain('Add a lever')
      expect(text, mode).not.toContain('not part of this build')
    }
    expect(shown).toBe(4)
  })
})

describe('the whole shell on a masthead page', () => {
  it('renders the band, the Action center with the filter row, and the footer', () => {
    useMode.setState({ mode: 'hr-admin' })
    useStore.getState().navigate('actions', '', { history: 'replace' })
    const html = renderToStaticMarkup(createElement(App))
    const text = textOf(html)
    expect(text).toContain('Skip to content')
    expect(text).toContain('Action center')
    expect(text).toContain('Open items from every view, grouped by who they wait on')
    expect(text).not.toContain('not part of this build')
    // The Action center has the filter row; the footer says where everything stays.
    expect(text).toContain('Fiscal year')
    expect(text).toContain('Everything stays in this browser')
    expect(text).toContain('Northgate Semiconductor is a fictional company')
    expect(html).toContain(`id="${DOM_IDS.view}"`)
    expect(html).toContain(`<main id="${DOM_IDS.main}"`)
  })

  it('leaves the filter row and the storage line off the Data room, which says it itself', () => {
    useStore.getState().navigate('data', '', { history: 'replace' })
    const text = textOf(renderToStaticMarkup(createElement(App)))
    expect(text).toContain('Data room')
    expect(text).toContain('Datasets Data quality Metric definitions Lists Workspace')
    expect(text).not.toContain('not part of this build')
    expect(text).not.toContain('Fiscal year')
    expect(text).not.toContain('Everything stays in this browser')
  })

  it('opens the Audit page with its entries line', () => {
    useStore.getState().navigate('audit', '', { history: 'replace' })
    const text = textOf(renderToStaticMarkup(createElement(App)))
    expect(text).toContain('Audit')
    // HR admin sees the chain check (docs/PLAN.md 8.4 rule 7).
    expect(text).toMatch(/Chain checks out \([\d,]+ (entry|entries)\)/)
    expect(text).not.toContain('not part of this build')
  })
})
