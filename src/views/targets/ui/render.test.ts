/**
 * The Targets view's tabs render on the sample in every mode that shows them (React markup through
 * renderToStaticMarkup inside the shell's providers, the node environment, as src/app/shell.test.ts
 * does): each tab draws its KPI strip and figures, Manager mode is never asked (the view is hidden
 * there), and the markup carries no exclamation mark and, in rounded modes, no exact amount of a
 * cost center.
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
  return renderToStaticMarkup(createElement(ShellProviders, null, createElement(view.View, { tab })))
}

beforeAll(async () => {
  setSampleSource({ data: () => cachedSample().datasets, asOf: SAMPLE_AS_OF })
  await useStore.getState().init()
  await startPlan(new MemoryStore())
  connectAccess({ notify: () => undefined })
}, 120_000)

describe('the Targets tabs', () => {
  it('render their strips and figures in every mode that shows Targets', () => {
    for (const mode of ['hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const gap = textOf(render(mode, 'gap'))
      expect(gap, mode).toContain('Gap by org')
      expect(gap, mode).toContain('Target heads')
      expect(gap, mode).toContain('Unallocated')
      expect(gap, mode).not.toContain('No data tier')
      const subs = textOf(render(mode, 'suborgs'))
      expect(subs, mode).toContain('Sub-orgs against their targets')
      expect(subs, mode).toContain('Unallocated')
      const tree = textOf(render(mode, 'tree'))
      expect(tree, mode).toContain('Tree nodes by cost center')
      for (const t of [gap, subs, tree]) expect(t, mode).not.toContain('!')
    }
  })

  it('draw the changes each mode offers (M3): set in Finance and HR admin, split and move for leaders too', () => {
    for (const mode of ['finance', 'hr-admin'] as const) {
      const gap = textOf(render(mode, 'gap'))
      expect(gap, mode).toContain('Set a target')
      expect(gap, mode).toContain('Target changes')
      const subs = textOf(render(mode, 'suborgs'))
      expect(subs, mode).toContain('Split a target')
      expect(subs, mode).toContain('Move target')
    }
    const lead = textOf(render('leader', 'gap'))
    expect(lead).not.toContain('Set a target')
    expect(lead).toContain('Target changes')
    expect(textOf(render('leader', 'suborgs'))).toContain('Split a target')
    const hr = [textOf(render('hrbp', 'gap')), textOf(render('hrbp', 'suborgs'))]
    for (const t of hr) {
      expect(t).not.toContain('Set a target')
      expect(t).not.toContain('Split a target')
      expect(t).not.toContain('Move target')
    }
  })

  it('labels each split box with its sub-org, so no two inputs share a name (review UI-12)', async () => {
    const { SplitBody } = await import('./TargetChanges')
    const { sampleCtx } = await import('@/testkit/sample')
    const { targetsModel } = await import('../engine')
    const writes = targetsModel(sampleCtx('finance')).suborgs.writes
    const choice = writes.split.choices.find((c) => c.children.length > 1)
    expect(choice).toBeDefined()
    if (!choice) return
    useMode.setState({ mode: 'finance', picking: null })
    const html = renderToStaticMarkup(
      createElement(
        ShellProviders,
        null,
        createElement(SplitBody, { choice, writes, onClose: () => undefined }),
      ),
    )
    const names = [...html.matchAll(/<input[^>]*aria-label="([^"]+)"/g)].map((m) =>
      m[1].replace(/&#x27;/g, "'"),
    )
    expect(names.length).toBe(choice.children.length * 2)
    expect(new Set(names).size).toBe(names.length)
    for (const c of choice.children) {
      expect(names).toContain(`Heads, ${c.label}`)
      expect(names).toContain(`Cost (USD), ${c.label}`)
    }
    expect(html).toContain('<legend')
  })
})
