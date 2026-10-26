/**
 * The views that raise Action center items, as the homes and My team hand them to the Action center
 * (src/views/actions/engine `actionsModel`): each folder-tab view's key, label, tabs and datasets,
 * with the `actions` of the four views that have them (Plan, Requests, Targets, Finance; docs/PLAN.md
 * 9.6). Homes and My team raise none of their own.
 *
 * Built from the views' engines, never from src/views/registry.ts: the registry imports the Home view
 * and My team, so reading it back from here would be an import cycle (the import rules). A view's
 * datasets are the ones that name it in `usedBy` (src/data/schema.ts); src/views/registry.test.ts
 * keeps this list equal to the registry's views. Pure data.
 */
import { VIEW_TABS } from '@/access/ids'
import type { AnalyticsContext } from '@/data/context'
import { DATASETS, VIEW_KEYS, VIEW_LABEL, type ViewKey } from '@/data/schema'
import type { ViewSource } from '@/views/actions/engine'
import { financeActions } from '@/views/finance/engine/actions'
import { planActions } from '@/views/plan/engine/actions'
import { requestsActions } from '@/views/requests/engine/actions'
import { targetsActions } from '@/views/targets/engine/actions'
import type { ActionItem } from '../../types'

/** Each view's items, for the views that raise them. */
const ACTIONS: Readonly<Partial<Record<ViewKey, (ctx: AnalyticsContext) => ActionItem[]>>> = {
  plan: planActions,
  requests: requestsActions,
  targets: targetsActions,
  finance: financeActions,
}

/** Every folder-tab view as an item source, in folder-tab order. */
export const ITEM_SOURCES: readonly ViewSource[] = VIEW_KEYS.map((key) => {
  const actions = ACTIONS[key]
  return {
    key,
    label: VIEW_LABEL[key],
    tabs: VIEW_TABS[key],
    datasets: DATASETS.filter((d) => d.usedBy.includes(key)).map((d) => d.key),
    ...(actions ? { actions } : {}),
  }
})
