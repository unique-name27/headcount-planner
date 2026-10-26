/**
 * The Finance view's tabs render on the sample in the modes that show them (React markup through
 * renderToStaticMarkup inside the shell's providers, the node environment, as src/app/shell.test.ts
 * does): each tab draws its KPI strip and tables;
 * the markup carries no exclamation mark. HRBP mode draws no savings tile. From M4 Export draws the
 * load file's buttons, control totals and full-year rows in Finance and HR admin, none in HRBP mode.
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

type Mode = 'hrbp' | 'finance' | 'hr-admin'

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')

function render(mode: Mode, tab: string): string {
  useMode.setState({ mode, picking: null })
  return renderToStaticMarkup(createElement(ShellProviders, null, createElement(view.View, { tab })))
}

beforeAll(async () => {
  setSampleSource({ data: () => cachedSample().datasets, asOf: SAMPLE_AS_OF })
  await useStore.getState().init()
  await startPlan(new MemoryStore())
  connectAccess({ notify: () => undefined })
}, 120_000)

describe('the Finance tabs', () => {
  it('render their strips and tables in the modes that show Finance', () => {
    for (const mode of ['hrbp', 'finance', 'hr-admin'] as const) {
      const versions = textOf(render(mode, 'versions'))
      expect(versions, mode).toContain('Locked versions')
      expect(versions, mode).toContain('FY27 Budget')
      const assumptions = textOf(render(mode, 'assumptions'))
      expect(assumptions, mode).toContain('Assumptions')
      const rates = textOf(render(mode, 'assumptions:trade-rates'))
      expect(rates, mode).toContain('Trade rates')
      const freezes = textOf(render(mode, 'freezes'))
      expect(freezes, mode).toContain('Openings under a freeze')
      const reconcile = textOf(render(mode, 'reconcile'))
      expect(reconcile, mode).toContain('Reconciliation exceptions')
      const exp = textOf(render(mode, 'export'))
      // M4: Finance > Export holds the load file in Finance and HR admin; HRBP mode has none.
      if (mode === 'hrbp') expect(exp).toContain('No load file in this mode')
      else
        for (const t of [
          'FP&A load file',
          'Download the load file',
          'Control totals',
          'The load file, full year',
        ])
          expect(exp, `${mode} ${t}`).toContain(t)
      // The unsuppressed file needs Show pay amounts on.
      expect(exp, mode).not.toContain('with individual pay')
      for (const t of [versions, assumptions, rates, freezes, reconcile, exp])
        expect(t, mode).not.toContain('!')
      // HRBP mode hides the savings tile (a cost component in rounded modes); the openings held show.
      if (mode === 'hrbp') expect(freezes).not.toContain('Freeze savings')
      else expect(freezes, mode).toContain('Freeze savings')
    }
  })

  it('draw the changes each mode offers (M3)', () => {
    for (const mode of ['finance', 'hr-admin'] as const) {
      const versions = textOf(render(mode, 'versions'))
      for (const b of ['Lock a version', 'Reopen as new', 'Close Oct 2026', 'New Working version'])
        expect(versions, `${mode} ${b}`).toContain(b)
      expect(versions, mode).toContain('Hash still verifies')
      // R47 (browser B8): October ends after the as-of date, so its close is disabled with the reason.
      expect(versions, mode).toContain('Oct 2026 closes once the data is as of 31 Oct 2026 or later.')
      const close = render(mode, 'versions').match(/<button[^>]*>\s*Close Oct 2026\s*<\/button>/)?.[0] ?? ''
      expect(close, mode).toMatch(/\sdisabled(=""|\s|>)/)
      const assumptions = textOf(render(mode, 'assumptions'))
      expect(assumptions, mode).toContain('Change a value')
      expect(assumptions, mode).toContain('Set FX rates')
      // The Trade rates part has no changes bar.
      expect(textOf(render(mode, 'assumptions:trade-rates')), mode).not.toContain('Change a value')
      const freezes = textOf(render(mode, 'freezes'))
      expect(freezes, mode).toContain('New freeze')
      expect(freezes, mode).toContain('Change a freeze')
      expect(textOf(render(mode, 'reconcile')), mode).toContain('Mark reviewed')
    }
    // HRBP: Versions and Freezes read only; its unit's settings and its unit's exceptions only.
    const versions = textOf(render('hrbp', 'versions'))
    for (const b of ['Lock a version', 'Reopen as new', 'Close Oct', 'New Working version'])
      expect(versions, b).not.toContain(b)
    const assumptions = textOf(render('hrbp', 'assumptions'))
    expect(assumptions).toContain('Change your unit’s settings')
    expect(assumptions).not.toContain('Set FX rates')
    expect(textOf(render('hrbp', 'freezes'))).not.toContain('New freeze')
    expect(textOf(render('hrbp', 'reconcile'))).toContain('Mark reviewed')
  })
})
