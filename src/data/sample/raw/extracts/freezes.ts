/**
 * Finance's hiring freeze log (docs/PLAN.md 13.5): a reference column ("Freeze Ref"), dates as
 * 01-Aug-2026, backfills as Y / N and the reason as "Rationale". Every value reads back exactly, so
 * the rows the import yields are the clean ones.
 */
import type { Datasets, FreezeRow } from '../../../schema'
import type { RawExtract } from '../extract'
import { type Column, dMonY, toAoa, yn } from '../format'
import { FILES } from '../plan'

/** The rows the import yields: the clean freezes. */
export const freezesPlanted = (base: Datasets): FreezeRow[] => base.freezes

export function freezesExtract(base: Datasets): RawExtract<'freezes'> {
  const columns: Column<FreezeRow>[] = [
    { header: 'Freeze Ref', cell: (r) => r.freezeId },
    { header: 'Business Unit', cell: (r) => r.businessUnit },
    { header: 'Department', cell: (r) => r.department ?? null },
    { header: 'Cost Center', cell: (r) => r.costCenter ?? null },
    { header: 'Leader Position ID', cell: (r) => r.leaderPositionId ?? null },
    { header: 'Frozen From', cell: (r) => dMonY(r.startDate) },
    { header: 'Frozen Until', cell: (r) => dMonY(r.endDate) },
    { header: 'Backfills Permitted', cell: (r) => yn(r.allowBackfill ?? false) },
    { header: 'Rationale', cell: (r) => r.reason ?? null },
  ]
  return { dataset: 'freezes', ...FILES.freezes, aoa: toAoa(base.freezes, columns) }
}
