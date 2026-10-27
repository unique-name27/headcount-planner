/**
 * The Plan view's tabs render on the sample in every mode (React markup through
 * renderToStaticMarkup inside the shell's providers, in the node environment, as
 * src/app/shell.test.ts does): each tab draws its key figures and figures, and the markup carries
 * no exclamation mark and, in Manager mode, no amount at all; the Working edit and transfer buttons
 * show in HRBP and HR admin mode only (M3) (the copy rules on the model's words are
 * src/views/plan/engine/lineage.test.ts's; a table's empty cell reads the placeholder "—").
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

type Mode = 'manager' | 'hrbp' | 'leader' | 'finance' | 'hr-admin'

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')

function markup(mode: Mode, tab: string): string {
  useMode.setState({ mode, picking: null })
  return renderToStaticMarkup(createElement(ShellProviders, null, createElement(view.View, { tab })))
}

function render(mode: Mode, tab: string): string {
  return textOf(markup(mode, tab))
}

beforeAll(async () => {
  setSampleSource({ data: () => cachedSample().datasets, asOf: SAMPLE_AS_OF })
  await useStore.getState().init()
  await startPlan(new MemoryStore())
  connectAccess({ notify: () => undefined })
}, 120_000)

describe('the Plan tabs', () => {
  it('render their strips and figures in every mode', () => {
    for (const mode of ['manager', 'hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const tabs = {
        overview: render(mode, 'overview'),
        positions: render(mode, 'positions'),
        openings: render(mode, 'openings'),
        transfers: render(mode, 'transfers'),
      }
      expect(tabs.overview, mode).toContain('Heads by month')
      expect(tabs.overview, mode).toContain('Approved heads')
      expect(tabs.positions, mode).toContain('Positions by month')
      expect(tabs.positions, mode).toContain('Standard heads')
      expect(tabs.openings, mode).toContain('Openings by age')
      expect(tabs.transfers, mode).toContain('Transfers')
      for (const t of Object.values(tabs)) {
        expect(t, mode).not.toContain('!')
      }
      if (mode === 'manager') for (const t of Object.values(tabs)) expect(t, mode).not.toMatch(/\$\s?\d/)
      // M3: Working edits and transfers show where the mode makes them (HRBP and HR admin), never elsewhere.
      const writes = mode === 'hrbp' || mode === 'hr-admin'
      expect(tabs.positions.includes('Change a seat in Working'), mode).toBe(writes)
      expect(tabs.positions, mode).toContain('Changes in Working')
      expect(tabs.transfers.includes('Process a transfer'), mode).toBe(writes)
      expect(tabs.transfers.includes('Your transfer drafts'), mode).toBe(writes)
    }
  })

  it('render Plan > Hiring in every mode: its tiles, the quarter table, the bar chart, velocity, recent hires and the readout, heads only', () => {
    for (const mode of ['manager', 'hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const html = markup(mode, 'hiring')
      const text = textOf(html)
      for (const words of [
        'Open to hire, FY27',
        'Future starts',
        'Future starts by quarter end',
        'Hires per month, 3-month pace',
        'Exits per month, 3-month pace',
        'Net hiring pace',
        'Months to close at this pace',
        'Open to hire by quarter',
        'Approved heads by quarter end',
        'Hires needed per month',
        'Q1, Apr to Jun (closed)',
        'Q3, Oct to Dec',
        'Open to hire at each quarter end',
        'Hiring velocity',
        '3-month pace:',
        'Hires in the last 3 months, by location and department',
        'Readout',
      ])
        expect(text, `${mode}: ${words}`).toContain(words)
      // C37: no accepted, expected or forecast start reads on the tab.
      expect(text, mode).not.toMatch(/accepted starts?|expected starts?/i)
      // The table of recent hires: its columns where a hire was made, its words where none was (Manager A).
      if (mode === 'manager') expect(text, mode).toContain('No hire in Jul 2026 to Sep 2026.')
      else
        for (const words of [
          'Department',
          'Location',
          'Jul 2026',
          'Sep 2026',
          'Hires per month',
          'All locations',
        ])
          expect(text, `${mode}: ${words}`).toContain(words)
      // The tour's target and every figure's id (the export layer reads the registered figures).
      for (const id of [
        'plan-hiring-quarters',
        'plan-hiring-open',
        'plan-hiring-velocity',
        'plan-hiring-recent',
      ])
        expect(html, `${mode} ${id}`).toContain(`data-tour="figure-${id}"`)
      expect(text, mode).not.toContain('!')
      // Heads only, in every mode: no amount anywhere on the tab.
      expect(text, mode).not.toMatch(/[$€£¥₹₪]\s?\d/)
      // Every chart names itself for the keyboard; none is announced as a bare "Chart." (review HU-6).
      expect(html, mode).not.toMatch(/aria-label="Chart\./)
      expect(html, mode).toContain(
        'aria-label="Open to hire at each quarter end. Arrow keys move through the data."',
      )
    }
  })

  it('opens the card of a Plan > Hiring tile that shows "—", which says why (review HU-8)', () => {
    // Manager A's net hiring pace is 0, so Months to close has no value.
    const html = markup('manager', 'hiring')
    expect(html).toContain('aria-label="Months to close at this pace: show why there is no value"')
    // Control: a tile with a value opens its card the usual way.
    expect(html).toMatch(/aria-label="Open to hire, FY27: show how 2 is calculated"/)
  })
})
