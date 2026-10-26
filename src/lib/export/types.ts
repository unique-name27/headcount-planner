import type { Column } from '@/charts/types'
import type { Tier } from '@/data/quality/tier'

/** One table to export: a figure's rows, a detail list, or a sheet of a view workbook. */
export interface ExportTable {
  /** Sheet name (sanitized on write) and file-name seed. */
  name: string
  title?: string
  subtitle?: string
  /** Footnote printed under the title block, e.g. "62 reqs filled". */
  note?: string
  columns: readonly Column[]
  rows: readonly Record<string, unknown>[]
  /** The table's data tier, stated in the title block with the data standard. */
  tier?: Tier | null
  /** The rows are the reason the data standard holds the figure back, not its data. */
  withheld?: boolean
  /**
   * Why an empty amount cell is empty when its row does not say (`WHY_KEY`): the guard's reason or
   * note, written in the `Why` column (docs/PLAN.md 14.1 item 2, `withSuppressedFlag`). M4 freeze.
   */
  suppressedWhy?: string
}

export interface ExportOptions {
  /** Pay amount columns (`pay: true`) are dropped unless this is on. */
  showPay: boolean
  /**
   * Cost total columns (`cost: true`) are dropped unless this is on (`ctx.showCost`: every mode
   * but Manager). Follows `showPay` when not given.
   */
  showCost?: boolean
  /** Band estimate columns (`band: true`) are dropped unless this is on; follows `showCost` when not given. */
  showBand?: boolean
  /** File name without extension; defaults to `fileStem(meta, name)`. */
  fileName?: string
}
