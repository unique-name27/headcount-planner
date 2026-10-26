/**
 * Finance (docs/PLAN.md 9.1 and 9.4): Versions, Assumptions (with its Trade rates part), Freezes,
 * Reconcile and Export. From M3 each tab's changes bar runs its actions (locks,
 * reopens, closes, assumption and FX edits, freezes, Mark reviewed) through the write hook; from M4
 * Export writes the FP&A load file (./ui/Export.tsx, ./engine/loadFile.ts).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md): the key, label, tabs and datasets are data; the
 * views-2 builder filled `View` with the tab components (`ui/`), each of which renders the model.
 * Assumptions has parts: the shell hands it the whole address ("assumptions:trade-rates").
 */
import { EmptyState } from '@/components'
import { useAnalytics } from '@/data/context'
import { DATASET_KEYS } from '@/data/schema'
import type { ViewDef } from '../types'
import { financeHeadline } from './engine'
import { financeActions } from './engine/actions'
import { Assumptions } from './ui/Assumptions'
import { Export } from './ui/Export'
import { Freezes } from './ui/Freezes'
import { Reconcile } from './ui/Reconcile'
import { Versions } from './ui/Versions'

function View({ tab }: { tab: string }) {
  const ctx = useAnalytics()
  const [key, part] = tab.split(':')
  if (ctx.access.unset)
    return <EmptyState title="Pick who you act as" body="Finance shows once you pick who you act as." />
  switch (key) {
    case 'assumptions':
      return <Assumptions part={part ?? null} />
    case 'freezes':
      return <Freezes />
    case 'reconcile':
      return <Reconcile />
    case 'export':
      return <Export />
    default:
      return <Versions />
  }
}

export const view: ViewDef = {
  key: 'finance',
  label: 'Finance',
  tabs: [
    { key: 'versions', label: 'Versions' },
    { key: 'assumptions', label: 'Assumptions', parts: true },
    { key: 'freezes', label: 'Freezes' },
    { key: 'reconcile', label: 'Reconcile' },
    { key: 'export', label: 'Export' },
  ],
  View,
  headline: financeHeadline,
  datasets: [...DATASET_KEYS],
  actions: financeActions,
}
