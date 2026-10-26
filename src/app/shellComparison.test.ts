/**
 * What the shell says about the version, the comparison and who the mode acts as, on the sample
 * through the shell's providers (the M2 review: UI-2, UI-3 and UI-4):
 *
 * - picking another fiscal year's version (FY28 Working) moves the view header's window to that year,
 *   and the export header names it;
 * - under a target comparison, a key figure that names the comparison but has no change shows "—",
 *   the comparison and the PLAN 9.2 reason ("FY28 has no locked version yet.");
 * - the Acting as dialog lists the sample's persona first, tagged "Sample persona".
 */
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StateCreator, StoreApi } from 'zustand/vanilla'
import { MemoryStorage } from '@/testkit/memoryStorage'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
/** Server rendering reads a store's live state here (as in shell.test.ts). */
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
const { MemoryStore } = await import('@/plan/store/memoryStore')
const { useAnalytics } = await import('@/data/context')
const { viewByKey } = await import('@/views/registry')
const { planModel } = await import('@/views/plan/engine')
const { KpiStrip } = await import('@/components/KpiStrip')
const { startPlan } = await import('./planState')
const { ShellProviders } = await import('./providers')
const { ViewHeader } = await import('./ViewHeader')
const { PickerBody } = await import('./ActingAsPicker')
const { planHeaderOf } = await import('./exportMeta')
const { PERSONA_TAG } = await import('./copy')

type Mode = 'manager' | 'hrbp' | 'leader' | 'finance' | 'hr-admin'
type Ctx = ReturnType<typeof useAnalytics>

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

function render(mode: Mode, node: ReactNode): string {
  useMode.setState({ mode, picking: null })
  return renderToStaticMarkup(createElement(ShellProviders, null, node))
}

function ctxIn(mode: Mode): Ctx {
  let out: Ctx | null = null
  function Probe() {
    out = useAnalytics()
    return null
  }
  render(mode, createElement(Probe))
  if (!out) throw new Error('no context')
  return out
}

beforeAll(async () => {
  setSampleSource({ data: () => cachedSample().datasets, asOf: SAMPLE_AS_OF })
  await useStore.getState().init()
  await startPlan(new MemoryStore())
  connectAccess({ notify: () => undefined })
}, 120_000)

afterEach(() => {
  useStore.getState().setPicks({ version: null, compare: null })
})

describe("the header follows the shown version's fiscal year (UI-3)", () => {
  it('reads FY28 for FY28 Working, in the scope line and the export header', () => {
    const plan = viewByKey.get('plan')
    if (!plan) throw new Error('no Plan view')
    for (const mode of ['hrbp', 'finance', 'hr-admin'] as const) {
      const fy27 = textOf(render(mode, createElement(ViewHeader, { view: plan, tab: 'overview' })))
      expect(fy27, mode).toContain('1 Apr 2026 – 31 Mar 2027')
      useStore.getState().setPicks({ version: 'fy28-working', compare: null })
      const fy28 = textOf(render(mode, createElement(ViewHeader, { view: plan, tab: 'overview' })))
      expect(fy28, mode).toContain('1 Apr 2027 – 31 Mar 2028')
      expect(fy28, mode).not.toContain('1 Apr 2026 – 31 Mar 2027')
      expect(fy28, mode).toContain('FY28 Working')
      expect(planHeaderOf(ctxIn(mode)).filters, mode).toMatch(/period: FY28$/)
      useStore.getState().setPicks({ version: null, compare: null })
    }
  })
})

describe('a key figure with a target comparison says why it has no change (UI-2)', () => {
  it('shows "—", the comparison and the PLAN 9.2 reason on Plan > Overview', () => {
    for (const mode of ['hrbp', 'leader', 'manager'] as const) {
      useStore.getState().setPicks({ version: 'fy28-working', compare: null })
      const ctx = ctxIn(mode)
      expect(ctx.compare.kind, mode).toBe('target')
      const kpis = mode === 'manager' ? planModel(ctx).openings.kpis : planModel(ctx).overview.kpis
      const empty = kpis.filter((k) => k.deltaLabel && k.delta == null && !k.suppressed)
      expect(empty.length, mode).toBeGreaterThan(0)
      const text = textOf(render(mode, createElement(KpiStrip, { kpis })))
      expect(text, mode).toContain('— vs FY28 target')
      expect(text, mode).toContain('FY28 has no locked version yet.')
    }
    useStore.getState().setPicks({ version: null, compare: 'target' })
    const fy27 = textOf(
      render('hrbp', createElement(KpiStrip, { kpis: planModel(ctxIn('hrbp')).overview.kpis })),
    )
    expect(fy27).toContain('— vs FY27 target')
    expect(fy27).toContain('A target has no monthly plan. Pick a version to compare.')
  })
})

describe('the Acting as dialog (UI-4)', () => {
  it("lists the sample's persona first, tagged as the persona, in every mode", () => {
    const modes: Mode[] = ['manager', 'hrbp', 'leader', 'finance', 'hr-admin']
    for (const mode of modes) {
      const html = render(mode, createElement(PickerBody, { mode, onDone: () => undefined }))
      const options = [
        ...html.matchAll(/role="option"[\s\S]*?(?=role="option"|<\/div><\/div><div class="flex flex-col)/g),
      ].map((m) => textOf(m[0]))
      expect(options.length, mode).toBeGreaterThan(0)
      // The mode's default persona (13.3), the pick every mode starts on with the sample.
      const p = cachedSample().personas.find((x) => x.mode === mode && x.isDefault)
      expect(p, mode).toBeTruthy()
      expect(options[0], mode).toContain(PERSONA_TAG)
      expect(options[0], mode).toContain(p?.name ?? '')
    }
  })
})
