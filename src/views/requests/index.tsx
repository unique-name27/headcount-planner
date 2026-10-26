/**
 * Requests (docs/PLAN.md 9.1 and 9.4): Queue, New, Mine, Approvals and Cycle. The lists with the
 * chain preview, the tracker and the cycle's cut line (M2), and from M3 the writes: drafting and
 * submitting every type on New, deciding a step on Approvals, Import and Export requests on the Queue
 * and Mine, and on Cycle opening the cycle, its dates, ranking, the cut line, finishing a stage,
 * locking and returning, each through the write hook.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md): the key, label, tabs and datasets are data. The
 * views-3 builder replaced the `View` stub with the tab components (`ui/`).
 */
import type { ViewDef } from '../types'
import { requestsHeadline } from './engine'
import { requestsActions } from './engine/actions'
import { Approvals } from './ui/Approvals'
import { Cycle } from './ui/Cycle'
import { Mine } from './ui/Mine'
import { NewRequest } from './ui/New'
import { Queue } from './ui/Queue'

function View({ tab }: { tab: string }) {
  switch (tab) {
    case 'new':
      return <NewRequest />
    case 'mine':
      return <Mine />
    case 'approvals':
      return <Approvals />
    case 'cycle':
      return <Cycle />
    default:
      return <Queue />
  }
}

export const view: ViewDef = {
  key: 'requests',
  label: 'Requests',
  tabs: [
    { key: 'queue', label: 'Queue' },
    { key: 'new', label: 'New' },
    { key: 'mine', label: 'Mine' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'cycle', label: 'Cycle' },
  ],
  View,
  headline: requestsHeadline,
  datasets: ['requests', 'positions', 'targets', 'freezes', 'assumptions'],
  actions: requestsActions,
}
