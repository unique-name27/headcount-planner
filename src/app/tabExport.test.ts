/**
 * A tab's own export options (./tabExport.ts, review RP-1): a heads-only tab (Plan > Hiring, Plan >
 * Recruiting summary) carries no long CSV control totals in any mode, HR admin with Show pay amounts
 * on included, while a cost tab (Plan > Overview) keeps them wherever the mode shows the long CSV.
 * The Export menu builds its tab files with these very functions (a source check), and so does the
 * leak crawl (src/testkit/crawl.ts `tabDeck`, `tabWorkbook`), whose files the recruiting leak test
 * scans slide by slide (src/access/leaks.recruiting.slow.test.ts). Before the fix the menu passed the
 * long CSV's control totals to every tab, so the recruiting deck's About slide read "loaded ... USD".
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HEADS_ONLY_TABS, VIEW_TABS } from '@/access/ids'
import type { ViewControlTotals } from '@/lib/export/view'
import { sampleCtx } from '@/testkit/sample'
import { VIEWS } from '@/views/registry'
import { exportMetaOf, isHeadsOnlyTab, tabExportOptions, tabTakesControlTotals } from './tabExport'

const plan = VIEWS.find((v) => v.key === 'plan')
if (!plan) throw new Error('No Plan view.')

/** Control totals as the long CSV states them (one month, loaded cost). */
const TOTALS = {
  mode: 'exact',
  totals: [{ period: '2026-04', heads: 1440, fte: 1430.73, loaded: 20650014.68, currency: 'USD' }],
  componentLines: ['Whole company, by component: base 16,147,516.05 USD'],
} as unknown as ViewControlTotals

const READERS = [
  ['manager', sampleCtx('manager')],
  ['hrbp', sampleCtx('hrbp')],
  ['leader', sampleCtx('leader')],
  ['finance', sampleCtx('finance')],
  ['hr-admin', sampleCtx('hr-admin')],
  ['hr-admin with pay amounts', sampleCtx('hr-admin', { showPay: true })],
] as const

describe('heads-only tabs (review RP-1)', () => {
  it('are Plan > Hiring and Plan > Recruiting summary, both Plan tabs', () => {
    expect(HEADS_ONLY_TABS).toEqual([
      { view: 'plan', tab: 'hiring' },
      { view: 'plan', tab: 'recruiting' },
    ])
    for (const t of HEADS_ONLY_TABS) expect(VIEW_TABS[t.view].map((x) => x.key)).toContain(t.tab)
    expect(isHeadsOnlyTab('plan', 'overview')).toBe(false)
  })

  it.each(READERS)('carry no control totals in their own files (%s)', (_, ctx) => {
    for (const tab of ['hiring', 'recruiting']) {
      expect(tabTakesControlTotals(ctx, plan, tab), tab).toBe(false)
      const { meta, opts } = tabExportOptions(ctx, plan, tab, TOTALS)
      expect(opts.controlTotals, tab).toBeUndefined()
      expect(JSON.stringify(opts)).not.toMatch(/USD|loaded|component/)
      // The header is the menu's: the tab's label, the mode and its scope.
      expect(meta).toEqual(exportMetaOf(ctx, plan, plan.tabs.find((t) => t.key === tab)?.label))
      expect(meta.tab).toBe(tab === 'hiring' ? 'Hiring' : 'Recruiting summary')
    }
  })

  it.each(READERS)('control: a cost tab keeps them where the mode shows the long CSV (%s)', (_, ctx) => {
    const can = ctx.access.can('action:export.long-csv')
    expect(tabTakesControlTotals(ctx, plan, 'overview')).toBe(can)
    expect(tabExportOptions(ctx, plan, 'overview', TOTALS).opts.controlTotals).toBe(TOTALS)
  })

  it('are what the Export menu writes a tab with', () => {
    const src = readFileSync(fileURLToPath(new URL('./ExportMenu.tsx', import.meta.url)), 'utf8')
    const runTab = src.slice(src.indexOf('const runTab'), src.indexOf('const runView'))
    expect(runTab).toContain('tabTakesControlTotals(ctx, view, tab) ? controlTotalsFor()')
    expect(runTab).toContain('tabExportOptions(ctx, view, tab, controlTotals)')
    expect(runTab).not.toMatch(/\.\.\.opts, controlTotals/)
  })

  it('count a deck’s figures by their slides in the menu’s toasts, the tab’s and the whole view’s (finish audit AF-4)', () => {
    const src = readFileSync(fileURLToPath(new URL('./ExportMenu.tsx', import.meta.url)), 'utf8')
    const runTab = src.slice(src.indexOf('const runTab'), src.indexOf('const runView'))
    const runView = src.slice(src.indexOf('const runView'), src.indexOf('const runLong'))
    expect(runTab).toContain('tabExportDone({')
    expect(runTab).toContain('deckFigures: lib.deckEntries(lib.viewEntries(figures)).length')
    expect(runTab).not.toMatch(/plural\(/)
    expect(runView).toContain('deckFigures: lib.deckEntries(lib.viewEntries(groups)).length')
  })
})
