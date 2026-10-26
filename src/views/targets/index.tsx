/**
 * Targets (docs/PLAN.md 9.1 and 9.4): Gap, Sub-org targets and Tree × cost center. From M3, Gap sets
 * targets and lists their changes, and Sub-org targets splits and moves them, through the write hook.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md): the key, label, tabs and datasets are data; the
 * views-2 builder filled `View` with the tab components (`ui/`), each of which renders the model.
 */
import { EmptyState } from '@/components'
import { useAnalytics } from '@/data/context'
import type { ViewDef } from '../types'
import { targetsHeadline } from './engine'
import { targetsActions } from './engine/actions'
import { Gap } from './ui/Gap'
import { SubOrgs } from './ui/SubOrgs'
import { Tree } from './ui/Tree'

function View({ tab }: { tab: string }) {
  const ctx = useAnalytics()
  if (ctx.access.unset)
    return (
      <EmptyState title="Pick who you act as" body="Targets show for the org of the person you act as." />
    )
  if (tab === 'tree') return <Tree />
  if (!ctx.all.targets.length)
    return (
      <EmptyState
        title="No targets loaded"
        body="Targets come from Finance's planning tool. Gap and sub-org targets show once a targets file is imported."
      />
    )
  if (tab === 'suborgs') return <SubOrgs />
  return <Gap />
}

export const view: ViewDef = {
  key: 'targets',
  label: 'Targets',
  tabs: [
    { key: 'gap', label: 'Gap' },
    { key: 'suborgs', label: 'Sub-org targets' },
    { key: 'tree', label: 'Tree × cost center' },
  ],
  View,
  headline: targetsHeadline,
  datasets: ['targets', 'positions', 'requests', 'assumptions'],
  actions: targetsActions,
}
