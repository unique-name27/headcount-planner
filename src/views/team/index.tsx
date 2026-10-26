/**
 * My team (docs/PLAN.md 9.3): Manager mode's home, a folder tab in Manager mode only
 * (src/views/registry.ts `folderViews`). It has no `actions` (9.6): it shows the Action center's
 * split for the mode.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md): the key, label, tabs and datasets are data; the
 * views-4 builder filled `View` (`ui/TeamPage.tsx`).
 */
import type { ViewDef } from '../types'
import { teamHeadline } from './engine'
import { TeamPage } from './ui/TeamPage'

function View(_props: { tab: string }) {
  return <TeamPage />
}

export const view: ViewDef = {
  key: 'team',
  label: 'My team',
  tabs: [{ key: 'overview', label: 'Overview' }],
  View,
  headline: teamHeadline,
  datasets: ['positions', 'workers', 'reqs', 'requests', 'assumptions'],
}
