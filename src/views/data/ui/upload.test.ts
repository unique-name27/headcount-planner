/**
 * Replacing a dataset with your own file (./upload.ts): a CSV export of the freeze log is read, its
 * vendor headers mapped, its rows applied with the import log, and what the store keeps with the new
 * version (source, sheet, mapping, options, issues) built for review; a file missing a required
 * column says which. Nothing is stored by preparing.
 */
import { describe, expect, it, vi } from 'vitest'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { prepareImport, replaceArgs } from './upload'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const fileOf = (name: string, text: string) => ({
  name,
  arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer,
})

describe('preparing an import', () => {
  it('maps a freeze log’s columns and applies its rows, ready for review', async () => {
    const csv = [
      'Freeze Ref,Business Unit,Frozen From,Frozen Until,Backfills Permitted,Rationale',
      'FRZ-1,Corporate,2026-08-01,,N,Cost hold',
      'FRZ-2,Operations,2026-09-01,2026-12-31,Y,Site move',
    ].join('\n')
    const p = await prepareImport(fileOf('freezes.csv', csv), 'freezes', [])
    expect(p.missingRequired).toEqual([])
    expect(p.mapping.freezeId.header).toBe('Freeze Ref')
    expect(p.mapping.businessUnit.header).toBe('Business Unit')
    expect(p.result.rows).toHaveLength(2)
    expect(p.result.rows[0]).toMatchObject({
      freezeId: 'FRZ-1',
      businessUnit: 'Corporate',
      startDate: '2026-08-01',
    })
    const { meta, extra } = replaceArgs(p, new Date('2026-10-21T12:00:00.000Z'))
    expect(meta).toMatchObject({ fileName: 'freezes.csv', importedAt: '2026-10-21T12:00:00.000Z' })
    expect(extra.raw).toBe(p.sheet)
    expect(extra.mapping).toBe(p.mapping)
    expect(extra.rowsIn).toBe(2)
  })

  it('names the required fields a file has no column for', async () => {
    const p = await prepareImport(fileOf('freezes.csv', 'Rationale\nCost hold'), 'freezes', [])
    expect(p.missingRequired.length).toBeGreaterThan(0)
    expect(p.missingRequired).toContain('Freeze ID')
  })
})
