/**
 * Finance's targets as the planning tool exports them (docs/PLAN.md 13.5): fiscal years written the
 * tool's two ways ("FY 2027" on the FY27 lines, "2027/28" on the FY28 lines from the newer template),
 * headcount as "HC EOP" and cost as "Total Personnel Expense", with the org columns the tool always
 * writes (blank for a unit's own target). FP&A confirmed the mapping. Every value reads back exactly,
 * so the rows the import yields are the clean ones.
 */
import type { Datasets, TargetRow } from '../../../schema'
import type { RawExtract } from '../extract'
import { type Column, mdy, toAoa } from '../format'
import { FILES } from '../plan'

/** "FY 2027" for FY27; "2027/28" for FY28 (the newer template). */
const yearText = (fy: string) => {
  const end = 2000 + +fy.slice(2)
  return fy === 'FY27' ? `FY ${end}` : `${end - 1}/${String(end).slice(2)}`
}

/** The rows the import yields: the clean targets. */
export const targetsPlanted = (base: Datasets): TargetRow[] => base.targets

export function targetsExtract(base: Datasets): RawExtract<'targets'> {
  const columns: Column<TargetRow>[] = [
    { header: 'Fiscal Year', cell: (r) => yearText(r.fiscalYear) },
    { header: 'Period End', cell: (r) => mdy(r.targetDate) },
    { header: 'Business Unit', cell: (r) => r.businessUnit },
    { header: 'Department', cell: (r) => r.department ?? null },
    { header: 'Cost Center', cell: (r) => r.costCenter ?? null },
    { header: 'Leader Position Number', cell: (r) => r.leaderPositionId ?? null },
    { header: 'HC EOP', cell: (r) => r.targetHeads },
    { header: 'Total Personnel Expense', cell: (r) => r.targetCost ?? null },
  ]
  return { dataset: 'targets', ...FILES.targets, aoa: toAoa(base.targets, columns) }
}
