/**
 * What the Export menu (./ExportMenu.tsx) writes from finance-export's long CSV model
 * (src/views/finance/engine/longCsv.ts `longCsvOf`, the same guarded model as the screen), kept
 * here so it is tested without a browser and loaded through `import()` with the model, as before.
 *
 *  - `menuControlTotals`: the long CSV's control totals for a workbook's Summary and a deck's About
 *    slide, then Finance's component control totals for each unit and the company where the guard
 *    shows the split (C33 (b); `componentTotalLines`, M4 review SB-1); none when the model is empty.
 *  - `menuLongCsv`: the long CSV through the one writer every long CSV and load file uses
 *    (`longFileText`): the header from the rows' own plan facts, the control totals and the component
 *    control totals, and with Show pay amounts on (the open guard) "Contains individual pay" as its
 *    first line (lead decision D-PAYFILES, review EX-1), as the unsuppressed load file says it;
 *    `headcount-planner-<view>-long-<as-of>.csv`.
 */
import type { ExportMeta } from '@/charts/types'
import { fileStem } from '@/lib/export/names'
import type { ViewControlTotals } from '@/lib/export/view'
import { componentTotalLines, type LongCsvModel, longFileText } from '@/views/finance/engine/longCsv'

type Model = Pick<LongCsvModel, 'empty' | 'mode' | 'totals' | 'componentTotals' | 'rows' | 'plan'>

/** The control totals a view's workbook and deck state (see the module comment). */
export function menuControlTotals(model: Model): ViewControlTotals | undefined {
  if (model.empty) return undefined
  const componentLines = componentTotalLines(model.componentTotals)
  return { mode: model.mode, totals: model.totals, ...(componentLines.length ? { componentLines } : {}) }
}

/** The long CSV's text and file name (see the module comment); null when the model has no rows to write. */
export function menuLongCsv(model: Model, meta: ExportMeta): { text: string; name: string } | null {
  if (model.empty) return null
  // The header states the version and rate set the rows read (on the forecast, the Working
  // forecast), so its lines match every row's.
  const fileMeta = model.plan ? { ...meta, plan: model.plan } : meta
  const text = longFileText(model.rows, fileMeta, {
    mode: model.mode,
    totals: model.totals,
    components: model.componentTotals,
    individualPay: model.mode === 'open',
  })
  return { text, name: `${fileStem(fileMeta, 'long')}.csv` }
}
