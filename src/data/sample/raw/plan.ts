/**
 * Where each sample dataset starts (docs/PLAN.md 13.5): which ones arrive as raw extracts, whose
 * mapping someone already confirmed, and which ones the data owner certified, with what note and
 * control totals.
 *
 * - Gold (certified rows from the systems of record): positions (Finance and HRIS), workers (HRIS;
 *   certified headcount 1,456), comp (Total rewards), assumptions (Finance).
 * - Silver (raw extracts, mapping confirmed): reqs (the ATS job report), targets (the planning
 *   tool's export), freezes (Finance's freeze log).
 * - Bronze (a raw extract, mapping not confirmed): requests (one messy spreadsheet in the Data
 *   room, not the Import requests files).
 */
import type { ControlMetricId } from '../../quality/types'
import type { DatasetKey } from '../../schema'

/** 'none': a dataset the sample has no rows for loads as No data. */
export type StartTier = 'gold' | 'silver' | 'bronze' | 'none'

/** The tier each dataset loads at. */
export const SAMPLE_TIERS: Record<DatasetKey, StartTier> = {
  positions: 'gold',
  workers: 'gold',
  comp: 'gold',
  reqs: 'silver',
  requests: 'bronze',
  targets: 'silver',
  freezes: 'silver',
  assumptions: 'gold',
}

/** Datasets that arrive as raw extracts and run through the importer on load. */
export const RAW_DATASETS = ['reqs', 'targets', 'freezes', 'requests'] as const
export type RawDataset = (typeof RAW_DATASETS)[number]

/** The file and sheet each raw extract arrives as. */
export const FILES: Record<RawDataset, { fileName: string; sheetName: string }> = {
  reqs: { fileName: 'ATS job report.csv', sheetName: 'ATS job report' },
  targets: { fileName: 'FY27 FY28 headcount targets.xlsx', sheetName: 'HC targets' },
  freezes: { fileName: 'Hiring freeze log.xlsx', sheetName: 'Freezes' },
  requests: { fileName: 'Headcount requests tracker.xlsx', sheetName: 'Requests' },
}

/** When each raw extract was loaded (the morning of the as-of date). */
export const IMPORTED_AT: Record<RawDataset, string> = {
  reqs: '2026-09-30T07:20:00.000Z',
  targets: '2026-09-30T07:45:00.000Z',
  freezes: '2026-09-30T07:50:00.000Z',
  requests: '2026-09-30T08:10:00.000Z',
}

/** Who reviewed the mapping of each silver dataset, and when (gold ones are certified below). */
export const CONFIRMED: Partial<Record<DatasetKey, { by: string; at: string }>> = {
  reqs: { by: 'Talent acquisition operations', at: '2026-09-30T09:05:00.000Z' },
  targets: { by: 'FP&A', at: '2026-09-30T09:20:00.000Z' },
  freezes: { by: 'FP&A', at: '2026-09-30T09:25:00.000Z' },
}

export interface StarterTotal {
  label: string
  metric: ControlMetricId
  /** Round the expected value to this step, the way a report states it (1 = exact). */
  roundTo: number
}

export interface StarterCertification {
  by: string
  at: string
  note: string
  controlTotals: StarterTotal[]
}

/** The data owners' certifications of the gold datasets. */
export const CERTIFIED: Partial<Record<DatasetKey, StarterCertification>> = {
  positions: {
    by: 'Finance and HRIS',
    at: '2026-09-30T15:30:00.000Z',
    note: 'Position control file for 30 Sep 2026, agreed between FP&A and the HRIS team.',
    controlTotals: [
      { label: 'Position rows in the control file', metric: 'rows', roundTo: 1 },
      { label: 'Filled positions per the control file', metric: 'filledPositions', roundTo: 1 },
    ],
  },
  workers: {
    by: 'HRIS team',
    at: '2026-09-30T16:00:00.000Z',
    note: 'Headcount reconciles to the HRIS headcount report for 30 Sep 2026.',
    controlTotals: [{ label: 'Headcount per the HRIS report', metric: 'activeHeadcount', roundTo: 1 }],
  },
  comp: {
    by: 'Total rewards',
    at: '2026-09-30T17:00:00.000Z',
    note: 'Reconciles to the September 2026 payroll register.',
    controlTotals: [
      { label: 'Pay rows on the payroll register', metric: 'rows', roundTo: 1 },
      { label: 'Total base in USD per payroll', metric: 'totalBaseUsd', roundTo: 1000 },
    ],
  },
  assumptions: {
    by: 'FP&A',
    at: '2026-09-30T17:30:00.000Z',
    note: 'Bands, loads, FX and drivers for the FY27 Budget, Q1 Reforecast, FY27 Working and FY28 Working.',
    controlTotals: [{ label: 'Assumption rows in the planning model', metric: 'rows', roundTo: 1 }],
  },
}
