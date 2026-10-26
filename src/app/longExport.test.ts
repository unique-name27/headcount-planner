/**
 * The Export menu's long CSV and control totals (./longExport.ts): written through the one writer of
 * long CSVs and load files, so HR admin's file with Show pay amounts on starts "Contains individual
 * pay" (D-PAYFILES, review EX-1) and Finance's file and its workbook's Summary carry the component
 * control totals of each unit and the company where the guard shows the split (review SB-1).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { INDIVIDUAL_PAY_LINE } from '@/lib/export/exportHeader'
import { figureMeta } from '@/testkit/crawl'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, sampleCtx } from '@/testkit/sample'
import { componentTotalLines, longCsvOf, longFileText } from '@/views/finance/engine/longCsv'
import { viewByKey } from '@/views/registry'
import { menuControlTotals, menuLongCsv } from './longExport'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

beforeAll(() => {
  leakSample()
}, 120_000)

const firstLine = (text: string) => text.replace(/^\uFEFF/, '').split('\r\n')[0]

describe('the Export menu’s long CSV (review EX-1, SB-1)', () => {
  it('starts "Contains individual pay" with Show pay amounts on, and never otherwise', () => {
    const plan = viewByKey.get('plan') ?? null
    for (const [mode, showPay, pay] of [
      ['hr-admin', true, true],
      ['hr-admin', false, false],
      ['finance', false, false],
    ] as const) {
      const ctx = sampleCtx(mode, { showPay })
      const model = longCsvOf(ctx, { source: 'version' })
      const file = menuLongCsv(model, figureMeta(ctx, plan, 'overview'))
      if (!file) throw new Error(`${mode}: no file`)
      expect(firstLine(file.text) === INDIVIDUAL_PAY_LINE, `${mode} ${showPay}`).toBe(pay)
      expect(file.text.includes('individual pay'), `${mode} ${showPay}`).toBe(pay)
      expect(file.name).toBe('headcount-planner-plan-long-2026-09-30.csv')
    }
  })

  it('carries Finance’s component control totals in the file and on the Summary', () => {
    const ctx = sampleCtx('finance')
    const model = longCsvOf(ctx, { source: 'version' })
    const lines = componentTotalLines(model.componentTotals)
    expect(lines.length).toBeGreaterThan(0)
    const meta = figureMeta(ctx, viewByKey.get('plan') ?? null, 'overview')
    const file = menuLongCsv(model, meta)
    for (const line of lines) expect(file?.text).toContain(line)
    expect(file?.text).toBe(
      longFileText(model.rows, model.plan ? { ...meta, plan: model.plan } : meta, {
        mode: model.mode,
        totals: model.totals,
        components: model.componentTotals,
        individualPay: false,
      }),
    )
    expect(menuControlTotals(model)).toEqual({
      mode: model.mode,
      totals: model.totals,
      componentLines: lines,
    })
    // A rounded mode has no split, and an empty model no totals.
    const hrbp = longCsvOf(sampleCtx('hrbp'), { source: 'version' })
    expect(menuControlTotals(hrbp)?.componentLines).toBeUndefined()
    expect(menuControlTotals({ ...hrbp, empty: 'No version to read.' })).toBeUndefined()
  })

  it('is what the menu writes: ExportMenu reads ./longExport, not the plain long CSV writer', () => {
    const src = readFileSync(fileURLToPath(new URL('./ExportMenu.tsx', import.meta.url)), 'utf8')
    expect(src).toContain("import('./longExport')")
    expect(src).toContain('menuLongCsv(')
    expect(src).toContain('menuControlTotals(')
    expect(src).not.toContain('downloadLongCsv(')
  })
})
