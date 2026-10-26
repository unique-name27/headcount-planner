/**
 * What if (docs/PLAN.md 9.1 and 10.6): one tab, Levers. Shown in HRBP, Leader and HR admin; Finance
 * sees the levers and results but does not turn them into requests; hidden in Manager mode (the
 * policy decides it, `view:whatif`).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md): the key, label, tabs and datasets are data; the
 * whatif builder filled `View` with the tab component (`ui/`), which renders the model.
 */
import { EmptyState } from '@/components'
import { useAnalytics } from '@/data/context'
import type { ViewDef } from '../types'
import { whatifHeadline } from './engine'
import { Levers } from './ui/Levers'

function View(_props: { tab: string }) {
  const ctx = useAnalytics()
  if (ctx.access.unset)
    return (
      <EmptyState
        title="Pick who you act as"
        body="What if shows for the unit or org of the person you act as."
      />
    )
  return <Levers />
}

export const view: ViewDef = {
  key: 'whatif',
  label: 'What if',
  tabs: [{ key: 'levers', label: 'Levers' }],
  View,
  headline: whatifHeadline,
  datasets: ['positions', 'assumptions', 'targets', 'freezes', 'requests'],
}
