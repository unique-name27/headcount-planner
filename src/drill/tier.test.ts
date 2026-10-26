import { describe, expect, it } from 'vitest'
import { computeQuality } from '@/data/quality/compute'
import { smallCompany } from '@/data/quality/test-fixtures'
import type { DatasetVersion } from '@/data/quality/types'
import { confirmVersion, makeCertification, makeVersion } from '@/data/quality/versions'
import type { Datasets } from '@/data/schema'
import { drillTier } from './tier'

function certify(data: Datasets): DatasetVersion {
  const v = confirmVersion(
    makeVersion({
      dataset: 'positions',
      source: 'upload',
      rows: data.positions,
      versionId: 'positions-v1',
      fileName: 'positions.xlsx',
      importedAt: '2026-10-01T09:00:00.000Z',
    }),
    'Jamie',
    '2026-10-02T10:00:00.000Z',
  )
  const at = '2026-10-03T10:00:00.000Z'
  return {
    ...v,
    certification: makeCertification({
      version: v,
      data,
      asOf: '2026-09-30',
      at,
      input: { by: 'HRIS team' },
    }),
  }
}

describe('drillTier', () => {
  const data = smallCompany()
  // 4 of the 10 Eliminated rows without an end date: the field is bronze on gold positions.
  for (const p of data.positions.filter((x) => x.status === 'Eliminated').slice(0, 4)) p.endDate = null
  const q = computeQuality(data, { positions: certify(data) }, undefined, { asOf: '2026-09-30' })

  it('shows the drilled number’s tier when the spec names its fields', () => {
    const t = drillTier(q, { kind: 'positions', uses: ['positions.status', 'positions.endDate'] })
    expect(t).toMatchObject({ tier: 'bronze', dataset: 'positions', ofDataset: false })
    expect(t.explain).toMatch(/^Bronze: .*End date is 60% filled for eliminated seats/)
  })

  it('falls back to the records’ dataset, and says so', () => {
    expect(drillTier(q, { kind: 'positions' })).toMatchObject({ tier: 'gold', ofDataset: true })
  })

  it('takes the dataset a plan-state kind is built from', () => {
    // Plan lines, versions and exceptions are built from positions; cost groups from pay.
    expect(drillTier(q, { kind: 'planLines' })).toMatchObject({ dataset: 'positions', ofDataset: true })
    expect(drillTier(q, { kind: 'exceptions' })).toMatchObject({ dataset: 'positions' })
    expect(drillTier(q, { kind: 'costGroups' })).toMatchObject({ dataset: 'comp' })
  })
})
