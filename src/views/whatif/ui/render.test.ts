/**
 * What if > Levers renders on the sample in every mode (React markup through renderToStaticMarkup
 * inside the shell's providers, the node environment, as src/app/shell.test.ts does): the result
 * strip, the lever list, the lever form and the seats in the modes that show What if, with "Turn into
 * requests" where the mode may use it and the policy's sentence where it may not (Finance); Manager
 * mode gets the policy's reason and no amount. The markup carries no exclamation mark and no em dash
 * joining words, and every figure names its metric in the source.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StateCreator, StoreApi } from 'zustand/vanilla'
import type { AnalyticsContext } from '@/data/context'
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
const { decide } = await import('@/access/policy')
const { cachedSample, SAMPLE_AS_OF } = await import('@/data/sample')
const { MemoryStore } = await import('@/plan/store/memoryStore')
const { startPlan } = await import('@/app/planState')
const { ShellProviders } = await import('@/app/providers')
const { FREEZE_LEVER_NOTE } = await import('@/plan/engine/whatif')
const { useAnalytics } = await import('@/data/context')
const { view } = await import('../index')
const { clearLevers, setLevers } = await import('../engine/session')
const { scopeKeyOfView, whatifModel } = await import('../engine')

type Mode = 'manager' | 'hrbp' | 'leader' | 'finance' | 'hr-admin'

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')

function render(mode: Mode): string {
  useMode.setState({ mode, picking: null })
  return textOf(
    renderToStaticMarkup(createElement(ShellProviders, null, createElement(view.View, { tab: 'levers' }))),
  )
}

/** The analytics context the shell's providers give a view in a mode. */
function contextIn(mode: Mode): AnalyticsContext {
  useMode.setState({ mode, picking: null })
  let ctx: AnalyticsContext | null = null
  function Capture() {
    ctx = useAnalytics()
    return null
  }
  renderToStaticMarkup(createElement(ShellProviders, null, createElement(Capture)))
  if (!ctx) throw new Error('No context')
  return ctx
}

const MONEY = /[$€£¥₹₪]\s?\d|\b\d[\d,.]*\s?(USD|EUR|INR|ILS|CAD|TWD|CNY|VND)\b/

beforeAll(async () => {
  setSampleSource({ data: () => cachedSample().datasets, asOf: SAMPLE_AS_OF })
  await useStore.getState().init()
  await startPlan(new MemoryStore())
  connectAccess({ notify: () => undefined })
}, 120_000)

afterEach(() => clearLevers())

describe('What if > Levers', () => {
  it('renders the strip, the levers, the form and the seats in every mode that shows What if', () => {
    for (const mode of ['hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const t = render(mode)
      for (const part of ['Results', 'Heads change', 'Cost change', 'Gap change', 'Levers', 'Add a lever'])
        expect(t, `${mode} ${part}`).toContain(part)
      expect(t, mode).toContain('Seats a lever can change')
      expect(t, mode).toContain('No levers yet. Add one to see what it changes.')
      expect(t, mode).not.toContain('!')
      expect(t, mode).not.toMatch(/\w—\w/)
      expect(t, mode).not.toContain('not part of this build')
      if (mode === 'finance') {
        expect(t).toContain(decide('finance', 'action:whatif.turn-into-requests').how)
        expect(t).not.toContain('Turn into requests ')
      } else expect(t, mode).toContain('Turn into requests')
    }
  })

  it('shows the session’s levers for this view, with what Turn into requests makes of them', () => {
    const ctx = contextIn('hrbp')
    const m = whatifModel(ctx).levers
    const seat = m.seats.rows.find((r) => r.status === 'Planned') ?? m.seats.rows[0]
    const org = m.pickers.orgs[0]
    setLevers(scopeKeyOfView(ctx), [
      { kind: 'freeze', orgPositionId: org.positionId, from: '2026-12-01' },
      { kind: 'cancel', positionId: seat.positionId },
    ])
    const t = render('hrbp')
    expect(t).toContain(`Cancel ${seat.positionId}`)
    expect(t).toContain('Turn into requests makes: Elimination')
    expect(t).toContain('Makes 1 draft request for review in Requests > Mine.')
    expect(t).toContain(FREEZE_LEVER_NOTE)
    expect(t).toContain('Copy scenario')
    // Another mode is another view: its What if starts empty.
    expect(render('leader')).toContain('No levers yet.')
  })

  it('gives Manager mode the policy’s reason and no amount', () => {
    const t = render('manager')
    expect(t).toContain(decide('manager', 'view:whatif').how)
    expect(t).not.toContain('Heads change')
    expect(t).not.toMatch(MONEY)
  })
})

describe('the source', () => {
  it('names a metric and an id on every figure', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url))
    let figures = 0
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx'))) {
      const text = readFileSync(join(dir, f), 'utf8')
      for (const m of text.matchAll(/<Figure\b/g)) {
        const head = text.slice(m.index, (m.index ?? 0) + 400)
        expect(head, f).toMatch(/metric=\{/)
        expect(head, f).toMatch(/\bid=\{WHATIF_FIGURES\./)
        figures++
      }
      expect(text, f).not.toContain('notBuilt')
    }
    expect(figures).toBe(2)
  })
})
