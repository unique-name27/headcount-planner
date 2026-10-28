/**
 * The Plan view's tabs render on the sample in every mode (React markup through
 * renderToStaticMarkup inside the shell's providers, in the node environment, as
 * src/app/shell.test.ts does): each tab draws its key figures and figures, and the markup carries
 * no exclamation mark and, in Manager mode, no amount at all; the Working edit and transfer buttons
 * show in HRBP and HR admin mode only (M3) (the copy rules on the model's words are
 * src/views/plan/engine/lineage.test.ts's; a table's empty cell reads the placeholder "—").
 * Plan > Recruiting summary (docs/PLAN.md 9.8, change C38) renders in every mode, Manager C's and HR
 * admin's with Show pay amounts on among them: its seven tiles, the chart, the quarter table and
 * where hiring happened, "Future starts" and "Projected starts" always apart, and heads only.
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
const { RECRUITING_KPIS } = await import('../engine/recruitingTab')
const { RECRUITING_FIGURE_IDS } = await import('@/access/ids')
const { pickOf, sampleCtx } = await import('../engine/fixtures')
const { planRecruitingModel } = await import('../engine/recruitingTab')
const { kpiValueText } = await import('@/components/kpiModel')
const { ARIA_LABEL } = await import('./RecruitingMonthsChart')

type Mode = 'manager' | 'hrbp' | 'leader' | 'finance' | 'hr-admin'

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
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

/* ───────────── Plan > Recruiting summary (docs/PLAN.md 9.8, change C38) ───────────── */

/** An amount, or a pay, cost, band, offer or fee word: none may reach the tab in any mode. */
const AMOUNT =
  /[$€£¥₹₪]\s?\d|\b(?:USD|EUR|ILS|INR|GBP|salary|salaries|sign-on|signing bonus|agency fees?|offer amounts?|band estimates?|loaded cost|base pay|bonus|compensation)\b/i
/** A leave fact (exits are terminations, never leave; on-leave people are never split out). */
const LEAVE = /\bon leave\b|\bleave of absence\b|\bparental leave\b|\bleaves?\b/i
/** The two kinds of start joined into one label ("Future and projected starts", "Future/projected"). */
const ONE_LABEL = /\b(?:future|projected)\s*(?:and|or|&|\/|\+)\s*(?:future|projected)\b/i
/** A count of 1 with a plural noun ("1 hires"), against the plain-count rule. */
const ONE_PLURAL =
  /(?<![\d.,])1 (?:hires|heads|starts|exits|locations|departments|seats|people|months|offers)\b/
/** An em dash between words; the lone "—" of an empty cell is the screen's placeholder. */
const EM_DASH_WORDS = /\w—\w|\w — \w/

/** The KPI strip's tiles, in markup order: each tile's metric and the value it shows. */
function stripOf(html: string): { metrics: string[]; values: string[] } {
  const at = html.indexOf('aria-label="Key figures"')
  const strip = at < 0 ? '' : html.slice(at, html.indexOf('</section>', at))
  const metrics = [...strip.matchAll(/data-metric="([^"]+)"/g)].map((m) => m[1])
  const values = [...strip.matchAll(/data-tour="kpi-value"/g)].map(
    (m) => /^[^>]*>(?:\s*<[^>]+>)*\s*([^<]+)</.exec(strip.slice(m.index))?.[1]?.trim() ?? '',
  )
  return { metrics, values }
}

type Recruiting = ReturnType<typeof planRecruitingModel>

/** The tab's own checks in a mode: what every mode shows and what none may show. */
function checkRecruiting(label: string, html: string, model: Recruiting) {
  const text = textOf(html)
  // The three figures by their tour targets, and the strip (the tab's fourth figure) with its seven tiles.
  for (const id of RECRUITING_FIGURE_IDS.filter((x) => x !== 'plan-recruiting-kpis'))
    expect(html, `${label} ${id}`).toContain(`data-tour="figure-${id}"`)
  expect(html, label).toContain('data-tour="kpi-strip"')
  const strip = stripOf(html)
  expect(strip.metrics, label).toEqual(RECRUITING_KPIS.map((k) => k.metricId))
  // Each tile shows the model's own value, as the tile prints it.
  expect(strip.values, label).toEqual(model.kpis.map((k) => kpiValueText(k)))
  // A phone shows all seven: no tile folds away behind "Show all 7".
  const at = html.indexOf('aria-label="Key figures"')
  const stripHtml = html.slice(at, html.indexOf('</section>', at))
  expect(stripHtml, label).not.toContain('max-md:hidden')
  expect(stripHtml, label).not.toMatch(/Show all \d/)
  for (const words of [
    'Approved heads, FY27',
    'Current heads',
    'Open to hire, FY27',
    'Projected attrition',
    'Hiring velocity',
    'Heads and hiring by month',
    'By quarter ahead',
    'Where hiring happened',
  ])
    expect(text, `${label}: ${words}`).toContain(words)
  // "Future starts" and "Projected starts" are two tiles, two legend keys and two columns, never one label.
  expect(html, label).toContain('aria-label="About Future starts"')
  expect(html, label).toContain('aria-label="About Projected starts"')
  expect(html, label).toMatch(/Future starts \(signed offers\)<\/li>/)
  expect(html, label).toMatch(/Projected starts \(model\)<\/li>/)
  expect(html, label).toMatch(/Projected heads<\/li>/)
  // Dated: the line is the year end's approved heads (review RU-3).
  expect(html, label).toMatch(/Approved heads by \d{1,2} [A-Z][a-z]{2} \d{4}<\/li>/)
  expect(text, label).not.toMatch(ONE_LABEL)
  expect(html, label).not.toMatch(
    />\s*(?:Starts|Total starts|All starts|Expected starts|Accepted starts)\s*</,
  )
  // The chart and the lists name themselves for the keyboard; none is a bare "Chart." (review HU-6).
  expect(html, label).toContain(`aria-label="${ARIA_LABEL}. Arrow keys move through the data."`)
  expect(html, label).not.toMatch(/aria-label="Chart\./)
  // The quarter table: the quarters ahead and the gap to approved heads, in words.
  for (const row of model.quarters.rows) expect(text, `${label} ${row.label}`).toContain(row.label)
  expect(text, label).toContain('Gap to approved')
  // Where hiring happened: the two lists, "and n more" and the way to the full table; or why not.
  if (model.where.rows.length) {
    expect(html, label).toContain(
      'aria-label="Locations: hires in the last 3 months. Arrow keys move through the data."',
    )
    expect(html, label).toContain(
      'aria-label="Departments: hires in the last 3 months. Arrow keys move through the data."',
    )
    expect(text, label).toContain('See every location and department in Plan > Hiring')
    const more = model.whereMore
    if (more.locations)
      expect(text, label).toContain(
        `and ${more.locations} more ${more.locations === 1 ? 'location' : 'locations'}`,
      )
    if (more.departments)
      expect(text, label).toContain(
        `and ${more.departments} more ${more.departments === 1 ? 'department' : 'departments'}`,
      )
    expect(text, label).not.toMatch(/and 0 more/)
  } else {
    expect(text, label).toContain(model.where.empty ?? '')
    expect(text, label).not.toContain('See every location and department')
  }
  // Copy: no exclamation mark, no em dash between words, plain counts.
  expect(text, label).not.toContain('!')
  expect(text, label).not.toMatch(EM_DASH_WORDS)
  expect(text, label).not.toMatch(ONE_PLURAL)
  // Heads only: no amount and no pay, cost, band, offer or fee word; no leave fact.
  expect(text, label).not.toMatch(AMOUNT)
  expect(html, label).not.toMatch(AMOUNT)
  expect(text, label).not.toMatch(LEAVE)
}

describe('Plan > Recruiting summary', () => {
  it('renders in every mode: the seven tiles, the chart, the quarter table and where hiring happened, heads only', () => {
    for (const mode of ['manager', 'hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const html = markup(mode, 'recruiting')
      checkRecruiting(mode, html, planRecruitingModel(sampleCtx(mode)))
    }
  })

  it('shows all seven tiles on a phone; control: Plan > Hiring folds past four', () => {
    for (const mode of ['hrbp', 'manager'] as const) {
      const strip = (tab: string) => {
        const html = markup(mode, tab)
        const at = html.indexOf('aria-label="Key figures"')
        return html.slice(at, html.indexOf('</section>', at))
      }
      expect(strip('recruiting'), mode).not.toContain('max-md:hidden')
      const hiring = strip('hiring')
      expect(hiring, mode).toContain('max-md:hidden')
      expect(hiring, mode).toMatch(/Show all \d+/)
    }
  })

  it('says where hiring happened, or why not: Manager A had no hire in the last 3 months', () => {
    expect(render('manager', 'recruiting')).toContain('No hire in Jul 2026 to Sep 2026.')
    // A unit with hires: its top places and how many more there are.
    const unit = render('hrbp', 'recruiting')
    for (const words of [
      'Locations',
      'Departments',
      'and 1 more department, 1 tied with the fifth at 1 hire',
    ])
      expect(unit).toContain(words)
    // A tie at the top-5 cut is named on the more line (review RN-7).
    const company = render('finance', 'recruiting')
    for (const words of [
      'and 4 more locations, 1 tied with the fifth at 3 hires',
      'and 11 more departments, 2 tied with the fifth at 3 hires',
    ])
      expect(company).toContain(words)
  })

  it('renders for Manager C over the tree below the seat: nothing about the seat or above (8.4)', () => {
    const was = useMode.getState().actingAs.manager
    try {
      useMode.getState().choose('manager', pickOf('manager-c'))
      const html = markup('manager', 'recruiting')
      checkRecruiting('manager-c', html, planRecruitingModel(sampleCtx('manager', { persona: 'manager-c' })))
      const me = cachedSample().personas.find((p) => p.key === 'manager-c')
      expect(me).toBeDefined()
      // The manager's own seat and name appear nowhere on the tab.
      expect(html).not.toContain(me?.positionId ?? '')
      expect(textOf(html)).not.toContain(me?.name ?? '')
    } finally {
      if (was) useMode.getState().choose('manager', was)
    }
  })

  it('renders the same for HR admin with Show pay amounts on: no amount reaches the tab', () => {
    const off = markup('hr-admin', 'recruiting')
    try {
      useStore.getState().setShowPay(true)
      const on = markup('hr-admin', 'recruiting')
      checkRecruiting('hr-admin with pay', on, planRecruitingModel(sampleCtx('hr-admin', { showPay: true })))
      // The switch changes nothing on a heads-only tab.
      expect(textOf(on)).toBe(textOf(off))
    } finally {
      useStore.getState().setShowPay(false)
    }
  })
})
