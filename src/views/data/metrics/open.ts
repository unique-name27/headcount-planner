/**
 * "Edit definition": open Metric definitions at one metric (`#data.metrics/<id>`). Whatever sheet is
 * open (the drill panel, Settings) closes first, as when a tier badge opens a dataset.
 */
import { closeSettings } from '@/app/settings/store'
import { goTo, routeHash } from '@/components/navigation'
import { useDrillStore } from '@/drill/store'
import { tabRoute } from '../engine/links'

/** The link to a metric in the dictionary, for an `href`: "#data.metrics/plan.heads.approved". */
export const metricHref = (metricId: string): string => routeHash('data', tabRoute('metrics', metricId))

/** Open the dictionary at one metric. */
export function openMetricDefinition(metricId: string): void {
  useDrillStore.getState().close()
  closeSettings()
  goTo('data', tabRoute('metrics', metricId))
}
