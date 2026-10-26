/**
 * Free text in outputs (docs/PLAN.md 14.1 item 8, 8.4 rule 5): in Manager mode, and in an Export for
 * a manager file, every free-text column (`freeText: true`: change, send-back, reject and exception
 * reasons, audit comments, version names) reads through `managerText` in every writer, so an amount
 * typed into text never reaches a Manager output; elsewhere the text is written as it is.
 */
import { describe, expect, it, vi } from 'vitest'
import { managerExportLine } from '@/access/copy'
import { MODES } from '@/access/modes'
import { managerText } from '@/access/visibility'
import type { Column, ExportMeta } from '@/charts/types'
import { amountsIn } from '@/testkit/leaks'
import { toTsv } from './clipboard'
import { downloadCsv, toCsv } from './csv'
import { guardedText, guardFreeText, textViewerOf } from './freeText'
import type { ExportTable } from './types'
import { slideTable } from './view'
import { buildWorkbook } from './xlsx'

const saved = vi.hoisted(() => [] as { name: string; blob: Blob }[])
vi.mock('./download', async (orig) => ({
  ...(await orig<typeof import('./download')>()),
  downloadBlob: (blob: Blob, name: string) => {
    saved.push({ blob, name })
  },
}))

const REASON = 'Raise the offer to $182,000 to close the candidate'
const columns: Column[] = [
  { key: 'request', label: 'Request' },
  { key: 'reason', label: 'Reason', freeText: true },
  { key: 'notes', label: 'Comments', freeText: true },
  { key: 'title', label: 'Job title' },
]
const table: ExportTable = {
  name: 'Requests',
  columns,
  rows: [
    { request: 'R-1025', reason: REASON, notes: ['Fine', 'Budget is 95k'], title: 'Senior engineer' },
    { request: 'R-1026', reason: 'Backfill for a leaver', notes: [], title: 'Analyst' },
  ],
}
const MANAGER = { mode: 'manager' as const }

describe('guardedText and guardFreeText', () => {
  it('reads text through managerText in Manager mode only', () => {
    expect(guardedText(REASON, MANAGER)).toBe(managerText(REASON, MANAGER))
    expect(guardedText(REASON, MANAGER)).not.toBe(REASON)
    expect(amountsIn(guardedText(REASON, MANAGER))).toEqual([])
    for (const mode of MODES.filter((m) => m !== 'manager'))
      expect(guardedText(REASON, { mode })).toBe(REASON)
  })

  it('guards only the free-text columns, lists of comments item by item', () => {
    const g = guardFreeText(table, MANAGER)
    expect(g.rows[0].reason).toBe(managerText(REASON, MANAGER))
    expect(g.rows[0].notes).toEqual(['Fine', managerText('Budget is 95k', MANAGER)])
    expect(g.rows[0].title).toBe('Senior engineer')
    // A row with nothing to change is kept as it is.
    expect(g.rows[1]).toBe(table.rows[1])
    expect(guardFreeText(table, { mode: 'hrbp' })).toBe(table)
    expect(
      guardFreeText({ ...table, columns: columns.map((c) => ({ ...c, freeText: false })) }, MANAGER).rows,
    ).toBe(table.rows)
  })

  it('reads the viewer from the meta: its mode, or the Manager mode line', () => {
    expect(textViewerOf({ mode: 'finance' })).toEqual({ mode: 'finance' })
    expect(textViewerOf({ modeLine: managerExportLine('Priya Raman') })).toEqual(MANAGER)
    expect(textViewerOf({ modeLine: 'Made in Manager mode.' })).toEqual(MANAGER)
    expect(textViewerOf({ modeLine: 'Made in HRBP mode for Silicon Engineering.' })).toBeNull()
    expect(textViewerOf(null)).toBeNull()
  })
})

describe('every writer guards free text for a Manager reader', () => {
  const meta: ExportMeta = {
    view: 'Requests',
    scope: "Priya Raman's team",
    window: 'FY27',
    asOf: '2026-09-30',
    isSample: true,
    company: 'Northgate Semiconductor',
    modeLine: managerExportLine('Priya Raman'),
    mode: 'manager',
  }
  const money = { showPay: false, showCost: false }

  it('CSV, the clipboard, Excel and slide tables', async () => {
    const texts: string[] = []
    texts.push(toCsv(table, { ...money, viewer: MANAGER }))
    saved.length = 0
    downloadCsv(table, meta, money)
    texts.push(await saved[0].blob.text())
    texts.push(toTsv(table, { ...money, viewer: MANAGER }))
    const wb = await buildWorkbook([table], meta, money)
    wb.getWorksheet('Requests')!.eachRow((row) => {
      row.eachCell((c) => {
        texts.push(String(c.value ?? ''))
      })
    })
    texts.push(...slideTable(table, { pay: false, cost: false }, meta).text.flat())
    const all = texts.join('\n')
    expect(all).not.toContain('182,000')
    expect(all).not.toContain('95k')
    expect(all).toContain(managerText(REASON, MANAGER))
    // The same writers outside Manager mode write the text as it is.
    expect(toCsv(table, { ...money, viewer: { mode: 'hr-admin' } })).toContain('182,000')
  })
})
