/**
 * The help engine's pure parts (the template app's help/engine.test.ts, with HCP's pages): the link
 * markup, where the tour popover goes at 1440 and 375 px, what this browser remembers, the address a
 * problem report carries and the report's text.
 */
import { describe, expect, it } from 'vitest'
import { APP_NAME } from '@/app/brand'
import pkg from '../../package.json'
import { pageLabels } from './diagnosticInput'
import { type DiagnosticInput, diagnosticText, safeAddress } from './diagnostics'
import { articleText, linksIn, parseInline, plainText } from './markup'
import { DEFAULT_PREFS, parsePrefs, withCompleted, withDismissed } from './store'
import { moved, placePopover, tourKey } from './tour/place'
import { APP_VERSION } from './whatsNew'

describe('inline markup', () => {
  it('splits text into runs and links of every kind', () => {
    const parts = parseInline('See [Data tiers](article:data-tiers) and [Openings](route:plan.openings).')
    expect(parts).toEqual([
      { text: 'See ' },
      { link: { kind: 'article', target: 'data-tiers', label: 'Data tiers' } },
      { text: ' and ' },
      { link: { kind: 'route', target: 'plan.openings', label: 'Openings' } },
      { text: '.' },
    ])
    expect(plainText('A [b](tour:x) c')).toBe('A b c')
    expect(linksIn('[Approved heads](metric:plan.heads.approved) [x](settings:display)')).toEqual([
      { kind: 'metric', target: 'plan.heads.approved', label: 'Approved heads' },
      { kind: 'settings', target: 'display', label: 'x' },
    ])
  })

  it('leaves unknown kinds as plain text, and reads a Data room address whole', () => {
    expect(parseInline('[x](mailto:a)')).toEqual([{ text: '[x](mailto:a)' }])
    expect(linksIn('[Definitions](route:data.metrics/plan.heads.approved)')).toEqual([
      { kind: 'route', target: 'data.metrics/plan.heads.approved', label: 'Definitions' },
    ])
  })

  it('article text holds the title, summary and body without link syntax', () => {
    const t = articleText({
      id: 'x',
      group: 'start',
      title: 'Title',
      summary: 'Sum',
      body: [{ p: 'Go to [Data room](route:data).' }, { ul: ['One', 'Two'] }],
    })
    expect(t).toBe('Title\nSum\nGo to Data room.\nOne\nTwo')
  })
})

describe('placePopover', () => {
  const view = { width: 1440, height: 900 }
  const pop = { width: 360, height: 180 }

  it('centers a step without a target', () => {
    expect(placePopover(null, pop, view)).toEqual({ top: 360, left: 540, side: 'center' })
  })

  it('goes on the preferred side when it fits, at 1440 px', () => {
    const t = { top: 100, left: 600, width: 200, height: 40 }
    expect(placePopover(t, pop, view, 'bottom')).toEqual({ top: 156, left: 520, side: 'bottom' })
    // No room above: falls to the next side that fits.
    expect(placePopover(t, pop, view, 'top').side).toBe('bottom')
    expect(placePopover(t, pop, view, 'right')).toMatchObject({ side: 'right', left: 816 })
    expect(placePopover(t, pop, view, 'left')).toMatchObject({ side: 'left', left: 600 - 16 - 360 })
  })

  it('stays inside the screen edges', () => {
    const t = { top: 100, left: 1400, width: 30, height: 30 }
    expect(placePopover(t, pop, view, 'bottom').left).toBe(1440 - 360 - 16)
    expect(placePopover({ top: 100, left: 0, width: 30, height: 30 }, pop, view, 'bottom').left).toBe(16)
  })

  it('docks to the edge away from the target at 375 px', () => {
    const phone = { width: 375, height: 812 }
    expect(placePopover({ top: 600, left: 10, width: 300, height: 100 }, pop, phone)).toEqual({
      top: 16,
      left: 16,
      side: 'dock-top',
    })
    expect(placePopover({ top: 50, left: 10, width: 300, height: 100 }, pop, phone)).toEqual({
      top: 812 - 180 - 16,
      left: 16,
      side: 'dock-bottom',
    })
    // A preferred side does not stop the dock on a phone.
    expect(placePopover({ top: 50, left: 10, width: 300, height: 100 }, pop, phone, 'right').side).toBe(
      'dock-bottom',
    )
    // Without a target it is centered, on a phone too.
    expect(placePopover(null, { width: 343, height: 180 }, phone).side).toBe('center')
  })

  it('sits in the lower corner when the target fills the screen', () => {
    const p = placePopover({ top: -200, left: 0, width: 1440, height: 2000 }, pop, view, 'bottom')
    expect(p).toEqual({ top: 900 - 180 - 16, left: 1440 - 360 - 16, side: 'corner' })
  })

  it('moved and tourKey', () => {
    expect(moved(null, null)).toBe(false)
    expect(moved(null, { top: 0, left: 0, width: 1, height: 1 })).toBe(true)
    expect(moved({ top: 0, left: 0, width: 1, height: 1 }, { top: 0.2, left: 0, width: 1, height: 1 })).toBe(
      false,
    )
    expect(moved({ top: 0, left: 0, width: 1, height: 1 }, { top: 2, left: 0, width: 1, height: 1 })).toBe(
      true,
    )
    expect(tourKey('ArrowRight')).toBe(1)
    expect(tourKey('ArrowLeft')).toBe(-1)
    expect(tourKey('Escape')).toBe('end')
    expect(tourKey('Esc')).toBe('end')
    expect(tourKey('Enter')).toBeNull()
  })
})

describe('remembered help prefs (hcp:help)', () => {
  it('reads what was saved and ignores anything else', () => {
    expect(parsePrefs(null)).toEqual({ completed: [], welcomeDismissed: [] })
    expect(parsePrefs('not json')).toBe(DEFAULT_PREFS)
    expect(parsePrefs('[1,2]')).toBe(DEFAULT_PREFS)
    expect(parsePrefs('null')).toBe(DEFAULT_PREFS)
    expect(
      parsePrefs('{"completed":["a","a",3],"welcomeDismissed":["finance","finance","nope",7,"hr-admin"]}'),
    ).toEqual({ completed: ['a'], welcomeDismissed: ['finance', 'hr-admin'] })
    // The template app's shape (a boolean) reads as nothing dismissed.
    expect(parsePrefs('{"welcomeDismissed":true}').welcomeDismissed).toEqual([])
  })

  it('marks a tour finished once, and a line dismissed once', () => {
    const p = { completed: ['a'], welcomeDismissed: [] }
    expect(withCompleted(p, 'a')).toBe(p)
    expect(withCompleted(p, 'b').completed).toEqual(['a', 'b'])
    const d = withDismissed(p, 'leader')
    expect(d.welcomeDismissed).toEqual(['leader'])
    expect(withDismissed(d, 'leader')).toBe(d)
    expect(parsePrefs(JSON.stringify(d))).toEqual(d)
  })
})

describe('report a problem: the address and the text', () => {
  it('keeps a view, a tab, a tab part, a metric and a dataset panel, and cuts everything else', () => {
    expect(safeAddress('#plan.openings')).toBe('#plan.openings')
    expect(safeAddress('plan.openings')).toBe('#plan.openings')
    expect(safeAddress('#finance.assumptions:trade-rates')).toBe('#finance.assumptions:trade-rates')
    expect(safeAddress('#data.metrics/plan.heads.approved')).toBe('#data.metrics/plan.heads.approved')
    expect(safeAddress('#data.positions-raw')).toBe('#data.positions-raw')
    expect(safeAddress('#data.lists/department')).toBe('#data.lists/department')
    expect(safeAddress('#data.quality')).toBe('#data.quality')
    expect(safeAddress('#actions')).toBe('#actions')
    expect(safeAddress('')).toBe('#')
    expect(safeAddress('#')).toBe('#')
  })

  it('never carries a record ID, a name or the scope after "?"', () => {
    // The scope holds leader position IDs, departments, versions and values from the data.
    expect(safeAddress('#plan.openings?leader=P10234&dept=Design+Verification')).toBe('#plan.openings')
    expect(safeAddress('#actions?leader=P10234')).toBe('#actions')
    expect(safeAddress('#data.metrics/plan.heads.approved?ver=FY27-working')).toBe(
      '#data.metrics/plan.heads.approved',
    )
    // A record ID where a tab or a part goes is cut.
    expect(safeAddress('#requests.mine:R-NG7-0012')).toBe('#requests.mine')
    expect(safeAddress('#plan.P10234')).toBe('#plan')
    expect(safeAddress('#plan.positions/P10234')).toBe('#plan.positions')
    expect(safeAddress('#data.lists/department:Design Verification')).toBe('#data.lists')
    expect(safeAddress('#data.metrics/Jane Doe')).toBe('#data.metrics')
    expect(safeAddress('#data.E10053')).toBe('#data')
    // Something that is not a page is not named.
    expect(safeAddress('#E10053')).toBe('#')
    expect(safeAddress('#Jane Doe.plan')).toBe('#')
  })

  it('names pages the way the app does', () => {
    expect(pageLabels('data', 'quality')).toEqual({ view: 'Data room', tab: 'Data quality' })
    expect(pageLabels('data', 'metrics/plan.heads.approved')).toEqual({
      view: 'Data room',
      tab: 'Metric definitions',
    })
    expect(pageLabels('data', '')).toEqual({ view: 'Data room', tab: 'Datasets' })
    expect(pageLabels('actions', '')).toEqual({ view: 'Action center', tab: null })
    expect(pageLabels('audit', '')).toEqual({ view: 'Audit', tab: null })
    expect(pageLabels('plan', 'openings')).toEqual({ view: 'Plan', tab: 'Openings' })
    expect(pageLabels('plan', '')).toEqual({ view: 'Plan', tab: 'Overview' })
    expect(pageLabels('finance', 'assumptions:trade-rates')).toEqual({ view: 'Finance', tab: 'Assumptions' })
    // One-tab views name no tab.
    expect(pageLabels('home', '')).toEqual({ view: 'Home', tab: null })
    expect(pageLabels('whatif', 'levers')).toEqual({ view: 'What if', tab: null })
  })

  const input: DiagnosticInput = {
    modeLine: 'Mode: HRBP (Silicon Engineering)',
    viewLabel: 'Plan',
    tabLabel: 'Openings',
    address: '#plan.openings',
    period: { preset: 'fy', label: 'Fiscal year' },
    planVersion: 'FY27 Working',
    comparison: 'vs FY27 Budget',
    leaderSet: true,
    orgFilters: [
      { label: 'Business unit', count: 0 },
      { label: 'Department', count: 1 },
      { label: 'Location', count: 3 },
    ],
    positionsInScope: 1234,
    standard: 'Everything',
    asOf: '2026-10-31',
    asOfSource: 'sample',
    datasets: [{ label: 'Positions', source: 'sample', rows: 2048, tier: 'bronze' }],
    definitionsChanged: 2,
    switches: [{ label: 'show data quality', on: false }],
    readOnly: true,
    display: 'theme system, text size md, motion system',
    storage: 'available',
    version: APP_VERSION,
    browser: 'Test browser',
    windowSize: '1440 × 900 px',
    at: '2026-10-24T10:00:00.000Z',
  }

  it('lists one fact per line, starting with the app name', () => {
    const text = diagnosticText(input)
    const lines = text.split('\n')
    expect(lines[0]).toBe(`${APP_NAME} problem report`)
    expect(lines[1]).toMatch(/No names, position IDs, request IDs, file names or values from the data/)
    for (const l of [
      'Mode: HRBP (Silicon Engineering)',
      'Page: Plan, Openings (#plan.openings)',
      'Period: Fiscal year (fy)',
      'Version: FY27 Working',
      'Comparison: vs FY27 Budget',
      'Filters: leader set (name left out); department: 1 value; location: 3 values',
      'Positions in scope: 1,234',
      'Data standard: Everything',
      'As of: 2026-10-31 (sample)',
      'Definitions changed from defaults: 2',
      'Session switches: show data quality off',
      'This tab: read only (another tab writes)',
      'Datasets (source, rows, tier):',
      '- Positions: sample, 2,048 rows, bronze',
      `App version: ${APP_VERSION}`,
      'Window: 1440 × 900 px',
    ])
      expect(lines, l).toContain(l)
    expect(lines.at(-1)).toBe('What happened, and what did you expect to see?')
    // The copy rules hold in the report's own words.
    expect(text).not.toMatch(/!|\w\s*—\s*\w/)
  })

  it('leaves out row counts where the mode does not show them, and says when nothing is filtered', () => {
    const text = diagnosticText({
      ...input,
      rowsShown: false,
      leaderSet: false,
      orgFilters: [],
      readOnly: false,
      positionsInScope: null,
      comparison: null,
    })
    expect(text).toContain('Datasets (source, tier):')
    expect(text).toContain('- Positions: sample, bronze')
    expect(text).not.toContain('2,048')
    expect(text).toContain('Filters: none')
    expect(text).toContain('This tab: writes')
    expect(text).not.toContain('Positions in scope')
    expect(text).not.toContain('Comparison:')
  })

  it('reports the version package.json carries', () => {
    expect(APP_VERSION).toBe(pkg.version)
  })
})
