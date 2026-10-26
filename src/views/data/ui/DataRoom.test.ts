/**
 * The Data room as the shell renders it (React markup through renderToStaticMarkup, HR admin, the
 * sample loaded through the stores): each of the five tabs, a dataset's four panels, a metric's detail
 * and a list's values; pay columns stay hidden while pay amounts are off; and the room's own copy
 * keeps the house rules (no em dash in a sentence, no "!", no banned mode words).
 */
import { readdirSync, readFileSync } from 'node:fs'
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
const { BANNED_MODE_WORDS } = await import('@/access/copy')
const { cachedSample, SAMPLE_AS_OF } = await import('@/data/sample')
const { MemoryStore } = await import('@/plan/store/memoryStore')
const { startPlan } = await import('@/app/planState')
const { ShellProviders } = await import('@/app/providers')
const { CurrentViewProvider } = await import('@/components/currentView')
/** The provider as a component that takes its children as createElement's third argument. */
const InView = CurrentViewProvider as unknown as (p: { value: unknown }) => ReactNode
const { DATA_ROOM_TABS } = await import('../engine')
const { DATA_FIGURES } = await import('../engine/figures')
const { Page } = await import('../index')
const { WorkspaceMenu } = await import('./WorkspaceMenu')

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')

function render(tab: string): string {
  useMode.setState({ mode: 'hr-admin', picking: null })
  const current = {
    key: 'data' as const,
    label: 'Data room',
    tabs: [...DATA_ROOM_TABS],
    tab: tab.split(/[-:/]/)[0],
  }
  return renderToStaticMarkup(
    createElement(
      ShellProviders,
      null,
      createElement(InView, { value: current }, createElement(Page, { tab })),
    ),
  )
}

beforeAll(async () => {
  setSampleSource({ data: () => cachedSample().datasets, asOf: SAMPLE_AS_OF })
  await useStore.getState().init()
  await startPlan(new MemoryStore())
  connectAccess({ notify: () => undefined })
}, 120_000)

describe('the Data room on screen', () => {
  it('draws each tab under its header', () => {
    const datasets = textOf(render(''))
    for (const t of DATA_ROOM_TABS) expect(datasets).toContain(t.label)
    expect(datasets).toContain('Records by month')
    expect(datasets).toContain('Positions')
    expect(textOf(render('quality'))).toContain('Metrics by view and tier')
    expect(textOf(render('quality'))).toContain('Fields')
    expect(textOf(render('metrics'))).toContain('Metric definitions')
    expect(textOf(render('lists'))).toContain('Official lists')
    expect(textOf(render('workspace'))).toContain('Workspace files')
  })

  it('opens a dataset on each of its four panels, pay columns hidden while pay amounts are off', () => {
    const raw = textOf(render('comp-raw'))
    expect(raw).toContain('The sample is generated in this browser')
    expect(raw).not.toContain('Base salary')
    expect(raw).toContain('Pay and leave columns are hidden')
    expect(textOf(render('positions-mapping'))).toContain('no column mapping to review')
    expect(textOf(render('positions-quality'))).toMatch(/Passes|Fails/)
    expect(textOf(render('workers-certify'))).toMatch(/Certif/)
  })

  it('lists the Workspace tab’s files to save and bring in, the Full file needing pay amounts shown', () => {
    const t = textOf(render('workspace'))
    for (const label of [
      'Save a Shareable file',
      'Export requests',
      'Export for a manager',
      'Save a Full file',
      'Open a shared file',
      'Import requests',
      'Import a workspace file',
    ])
      expect(t, label).toContain(label)
    expect(t).toContain('Turn on Show pay amounts to save a Full file.')
    expect(t).toContain('Workspace files')
    expect(t).not.toContain('arrive with the write path')
  })

  it('draws the masthead’s Workspace menu with the items each mode lists', () => {
    const menu = (mode: 'manager' | 'hrbp' | 'finance' | 'hr-admin') => {
      useMode.setState({ mode, picking: null })
      return textOf(
        renderToStaticMarkup(createElement(ShellProviders, null, createElement(WorkspaceMenu, {}))),
      )
    }
    const mgr = menu('manager')
    expect(mgr).toContain('Lists only the files this mode saves and opens.')
    for (const label of ['Save a Shareable file', 'Export requests', 'Open a shared file'])
      expect(mgr, label).toContain(label)
    for (const label of [
      'Import requests',
      'Export for a manager',
      'Save a Full file',
      'Import a workspace file',
    ])
      expect(mgr, label).not.toContain(label)
    expect(menu('hrbp')).toContain('Export for a manager')
    expect(menu('finance')).toContain('Import requests')
    expect(menu('finance')).not.toContain('Export for a manager')
    const admin = menu('hr-admin')
    expect(admin).toContain('Import a workspace file')
    expect(admin).not.toContain('Lists only the files')
    expect(admin).toContain('Checksums catch damage to a file, not who made it.')
  })

  it('opens a metric’s detail and a list’s values', () => {
    const metric = textOf(render('metrics/team.budget.status'))
    expect(metric).toContain('Budget status')
    expect(metric).toContain('At risk within')
    const list = textOf(render('lists/department'))
    expect(list).toContain('Departments')
    expect(list).toContain('In the data, not on the list')
  })
})

/** A Figure's or KPI strip's id, written as a literal before any other prop that holds a ">". */
const FIGURE_ID = /<(?:Figure|KpiStrip)\s[^>]*?\bid="([a-z0-9-]+)"/g

describe('the Data room source', () => {
  it('draws every figure id the room lists', () => {
    const ui = ['../ui/', '../metrics/']
      .flatMap((d) =>
        readdirSync(new URL(d, import.meta.url))
          .filter((f) => f.endsWith('.tsx'))
          .map((f) => readFileSync(new URL(`${d}${f}`, import.meta.url), 'utf8')),
      )
      .join('\n')
    // Figure and strip ids are written as literals (docs/CONTRACTS-M2.md 4), so the scan sees them.
    const drawn = new Set([...ui.matchAll(FIGURE_ID)].map((m) => m[1]))
    expect([...drawn].sort()).toEqual(Object.values(DATA_FIGURES).sort())
    expect(ui).not.toMatch(/id=\{DATA_FIGURES\./)
    for (const chunk of ui.split('<Figure').slice(1)) {
      if (!/^\s/.test(chunk)) continue
      expect(chunk.slice(0, 400)).toMatch(/\bmetric=\{/)
      expect(chunk.slice(0, 400)).toMatch(/\buses=\{/)
    }
  })

  const dirs = ['../ui/', '../engine/', '../metrics/', '../metrics/ui/', '../quality-overview/']
  const files = dirs.flatMap((d) =>
    readdirSync(new URL(d, import.meta.url))
      .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'))
      .map((f) => new URL(`${d}${f}`, import.meta.url)),
  )

  it('writes no em dash into a sentence, no "!" and no banned mode word in its copy', () => {
    expect(files.length).toBeGreaterThan(10)
    for (const f of files) {
      const t = readFileSync(f, 'utf8')
      expect(t, f.pathname).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
      expect(t, f.pathname).not.toMatch(/'[^'\n]*!'/)
      // Sentences in quotes (with a space and a capital or a full stop), never an import path or classes.
      const quoted = [...t.matchAll(/['"`]([^'"`\n]{12,})['"`]/g)]
        .map((m) => m[1])
        .filter(
          (q) =>
            q.includes(' ') &&
            !q.startsWith('@/') &&
            /[A-Z.]/.test(q) &&
            !/\b(text|bg|px|py|mt|flex|rounded)-/.test(q),
        )
        .map((q) => q.toLowerCase())
      for (const w of BANNED_MODE_WORDS)
        for (const q of quoted)
          expect(q.includes(w.toLowerCase()), `${f.pathname}: ${w} in "${q}"`).toBe(false)
    }
  })
})
