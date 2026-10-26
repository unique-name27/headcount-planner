/**
 * The Requests view's tabs, the Action center and the Audit page render on the sample in the modes
 * that show them (React markup through renderToStaticMarkup inside the shell's providers, the node
 * environment, as src/app/shell.test.ts does): each draws its strip and tables, its figures name
 * their metrics in the source, the markup carries no exclamation mark and no em dash joining words,
 * and Manager mode's markup carries no amount.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
const { ActionCenter } = await import('@/views/actions')
const { AuditPage } = await import('@/views/audit')

type Mode = 'manager' | 'hrbp' | 'leader' | 'finance' | 'hr-admin'

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')

function render(mode: Mode, node: ReturnType<typeof createElement>): string {
  useMode.setState({ mode, picking: null })
  return textOf(renderToStaticMarkup(createElement(ShellProviders, null, node)))
}

const MONEY = /[$€£¥₹₪]\s?\d|\b\d[\d,.]*\s?(USD|EUR|INR|ILS|CAD|TWD|CNY|VND)\b/

beforeAll(async () => {
  setSampleSource({ data: () => cachedSample().datasets, asOf: SAMPLE_AS_OF })
  await useStore.getState().init()
  await startPlan(new MemoryStore())
  connectAccess({ notify: () => undefined })
}, 120_000)

describe('the Requests tabs', () => {
  it('render their strips and lists in every mode that shows them', () => {
    for (const mode of ['manager', 'hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const tabs =
        mode === 'manager'
          ? ['mine', 'approvals', 'cycle', 'new']
          : mode === 'finance'
            ? ['queue', 'mine', 'approvals', 'cycle']
            : ['queue', 'mine', 'approvals', 'cycle', 'new']
      for (const tab of tabs) {
        const t = render(mode, createElement(view.View, { tab }))
        expect(t.length, `${mode} ${tab}`).toBeGreaterThan(40)
        expect(t, `${mode} ${tab}`).not.toContain('!')
        // A table's missing value reads "—" between cells; no word is ever joined to another by one.
        expect(t, `${mode} ${tab}`).not.toMatch(/\w—\w/)
        if (mode === 'manager') expect(t, `${mode} ${tab}`).not.toMatch(MONEY)
      }
    }
    const queue = render('hrbp', createElement(view.View, { tab: 'queue' }))
    expect(queue).toContain('Requests in progress')
    expect(queue).toContain('Managers not submitted')
    const cycle = render('hrbp', createElement(view.View, { tab: 'cycle' }))
    expect(cycle).toContain('FY28 planning cycle')
    expect(cycle).toContain('after the 40th ranked head')
    expect(cycle).toContain('Copy note')
    const mgr = render('manager', createElement(view.View, { tab: 'cycle' }))
    expect(mgr).not.toContain('Copy note')
    expect(mgr).not.toContain('cut line falls')
  })

  it('point New to the lists the mode shows, never a hidden Queue or "every request on file"', () => {
    const mgr = render('manager', createElement(view.View, { tab: 'new' }))
    expect(mgr).toContain('Mine and Approvals list the requests this mode shows.')
    expect(mgr).not.toContain('Queue')
    expect(mgr).not.toContain('every request on file')
    for (const mode of ['hrbp', 'leader', 'hr-admin'] as const) {
      const t = render(mode, createElement(view.View, { tab: 'new' }))
      expect(t, mode).toContain('Mine, Approvals and the Queue list the requests this mode shows.')
      expect(t, mode).not.toContain('every request on file')
    }
  })
})

describe('the Action center and the Audit page', () => {
  it('render in every mode', () => {
    for (const mode of ['manager', 'hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const actions = render(mode, createElement(ActionCenter))
      expect(actions, mode).toContain('Action center')
      expect(actions, mode).not.toContain('!')
      expect(actions, mode).not.toMatch(MONEY)
      if (mode === 'hr-admin') expect(actions).toContain('Open items from every view')
      else expect(actions, mode).toContain('Needs attention')
      if (mode === 'manager') continue
      const audit = render(mode, createElement(AuditPage))
      expect(audit, mode).toContain('Audit')
      expect(audit, mode).not.toContain('!')
      if (mode === 'hr-admin') expect(audit).toMatch(/Chain checks out \(\d+ entr(y|ies)\)/)
      else expect(audit, mode).not.toContain('Chain checks out')
    }
  })
})

describe('the source', () => {
  it('names a metric on every figure, writing ids and metrics out', () => {
    const roots = ['../../requests/ui', '../../actions/ui', '../../audit/ui'].map((p) =>
      fileURLToPath(new URL(p, import.meta.url)),
    )
    let figures = 0
    for (const dir of roots)
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx'))) {
        const text = readFileSync(join(dir, f), 'utf8')
        for (const m of text.matchAll(/<Figure\b/g)) {
          const head = text.slice(m.index, (m.index ?? 0) + 700)
          expect(head, `${f}`).toMatch(/metric=\{/)
          expect(head, `${f}`).toMatch(/\bid=/)
          figures++
        }
        expect(text, f).not.toMatch(/<Figure\s+\{\.\.\./)
      }
    expect(figures).toBeGreaterThanOrEqual(12)
  })
})

describe('Requests > New (M3)', () => {
  it('draws the form, the chain figure and the seats in every mode that raises requests', () => {
    for (const mode of ['manager', 'hrbp', 'leader', 'hr-admin'] as const) {
      const t = render(mode, createElement(view.View, { tab: 'new' }))
      expect(t, mode).toContain('New request')
      expect(t, mode).toContain('Approval chain')
      expect(t, mode).toContain('Seats you can name')
      expect(t, mode).toContain('Save draft')
      expect(t, mode).toContain('Do not include pay, performance or health details.')
      expect(t, mode).not.toContain('!')
      if (mode === 'manager') {
        expect(t).not.toMatch(MONEY)
        expect(t).toContain('Transfer: Transfers are processed by HRBPs.')
      }
    }
    // Finance raises no request: the tab says so and names its lists.
    const fin = render('finance', createElement(view.View, { tab: 'new' }))
    expect(fin).toContain('New requests are not raised in this mode')
    expect(fin).not.toContain('Save draft')
  })

  it('puts Import requests and Export requests in the Queue header where the mode offers them', () => {
    const hrbp = render('hrbp', createElement(view.View, { tab: 'queue' }))
    expect(hrbp).toContain('Import requests')
    expect(hrbp).toContain('Export requests')
    const mine = render('manager', createElement(view.View, { tab: 'mine' }))
    expect(mine).toContain('Export requests')
    expect(mine).not.toContain('Import requests')
  })
})

describe('the write controls on Approvals and Cycle (M3)', () => {
  it('draws the decisions on a card waiting on you, and the cycle controls by mode', () => {
    const leader = render('leader', createElement(view.View, { tab: 'approvals' }))
    expect(leader).toContain('Approve')
    expect(leader).toContain('Send back')
    expect(leader).toContain('Gap after approval for Silicon Engineering')
    const hrbp = render('hrbp', createElement(view.View, { tab: 'cycle' }))
    expect(hrbp).toContain('Silicon Engineering: rank and cut')
    expect(hrbp).toContain('Cut line')
    expect(hrbp).toContain('Save ranking')
    const fin = render('finance', createElement(view.View, { tab: 'cycle' }))
    expect(fin).toContain('Move the cycle to HRBP review')
    const mgr = render('manager', createElement(view.View, { tab: 'cycle' }))
    expect(mgr).not.toContain('Cut line')
    expect(mgr).not.toContain('rank and cut')
  })
})

const { StageBar } = await import('./Cycle')
const { ConflictChoices } = await import('./RequestFiles')
const { RadioChoice } = await import('./form')
const { headsCount } = await import('../engine')

describe('the M3 review’s fixes in the markup', () => {
  const markup = (mode: Mode, node: ReturnType<typeof createElement>): string => {
    useMode.setState({ mode, picking: null })
    return renderToStaticMarkup(createElement(ShellProviders, null, node))
  }

  it('the cut line sits in a list item of a list of list items, so moving it keeps the list whole (UI-4)', () => {
    const html = markup('hrbp', createElement(view.View, { tab: 'cycle' }))
    const list =
      /<ol[^>]*aria-label="Silicon Engineering ranked asks"[^>]*>([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? ''
    expect(list.startsWith('<li')).toBe(true)
    const handle = list.indexOf('Cut line: drag it')
    expect(handle).toBeGreaterThan(0)
    expect(list.lastIndexOf('<li', handle)).toBeGreaterThanOrEqual(0)
    expect(html).toMatch(/aria-live="polite"[^>]*>Above the line: 40 heads/)
  })

  it('a forced comment audience is a disabled group (UI-5)', () => {
    const html = markup(
      'hrbp',
      createElement(RadioChoice, {
        legend: 'Who sees it',
        value: 'approvers',
        disabled: true,
        onChange: () => undefined,
        options: [
          { value: 'everyone', label: 'Everyone on the request' },
          { value: 'approvers', label: 'Approvers only' },
        ],
      }),
    )
    expect(html).toMatch(/<fieldset disabled=""/)
    expect(html.match(/<input[^>]*disabled=""/g)?.length).toBe(2)
    expect(html).toMatch(/<legend[^>]*>Who sees it<\/legend>/)
  })

  it('the return stage has a label, and the lock says why it waits (UI-12, D-CYCLE)', () => {
    const html = markup(
      'finance',
      createElement(StageBar, {
        controls: {
          cycleId: 'cycle-fy28',
          stage: 'Finance review',
          finish: [],
          lock: true,
          lockWaiting:
            "Lock the FY28 cycle once these asks have their manager's decision: 3 asks with 2 managers.",
          returnTo: ['Open for asks'],
          units: [],
          mine: null,
          dates: null,
        },
      }),
    )
    const id = /<label for="([^"]+)"[^>]*>Return the cycle to<\/label>/.exec(html)?.[1]
    expect(id).toBeTruthy()
    expect(html).toContain(`<select id="${id}"`)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Lock the cycle<\/button>/)
    expect(textOf(html)).toContain(
      "Lock the FY28 cycle once these asks have their manager's decision: 3 asks with 2 managers.",
    )
  })

  it('Import requests’ conflicts start at "Decide later", from the rows the importer may read (UI-7, PV-8)', () => {
    const html = markup(
      'hr-admin',
      createElement(ConflictChoices, {
        conflicts: [
          {
            requestId: 'R-1040',
            type: 'Trade',
            title: null,
            here: null,
            inFile: null,
            what: 'Both copies changed since the last import.',
            choosable: true,
          },
          {
            requestId: 'R-1034',
            type: 'New role',
            title: null,
            here: null,
            inFile: null,
            what: 'This request ID is another request in this workspace.',
            choosable: false,
          },
        ],
        choices: {},
        onChoose: () => undefined,
      }),
    )
    const radios = html.match(/<label[^>]*><input[^>]*>[^<]*/g) ?? []
    expect(radios.map((r) => r.replace(/<[^>]+>/g, '').replace(/&#x27;|’/g, "'"))).toEqual([
      'Decide later',
      "Keep this workspace's copy",
      "Take the file's copy",
    ])
    expect(radios[0]).toMatch(/checked=""/)
    expect(radios.slice(1).every((r) => !r.includes('checked'))).toBe(true)
    expect(textOf(html)).toContain('Both copies changed since the last import.')
    // One that cannot merge is listed with why, and offers no choice.
    expect(textOf(html)).toContain('Cannot merge: R-1034: New role')
    expect(html).not.toContain('Which copy of R-1034')
  })

  it('counts of heads read "1 head" and "−1 head" (UI-9)', () => {
    expect(headsCount(1)).toBe('1 head')
    expect(headsCount(-1)).toBe('−1 head')
    expect(headsCount(40)).toBe('40 heads')
    const cycle = render('hrbp', createElement(view.View, { tab: 'cycle' }))
    expect(cycle).not.toMatch(/\b1 heads\b/)
  })

  it('the on-behalf hint fits the mode, and an empty Mine has no pick note (UI-14)', () => {
    const admin = render('hr-admin', createElement(view.View, { tab: 'new' }))
    expect(admin).not.toContain('An HRBP can submit for a manager.')
    const fin = render('finance', createElement(view.View, { tab: 'mine' }))
    if (fin.includes('You have raised no request in this scope.'))
      expect(fin).not.toContain('Pick a request to open it below.')
  })
})
