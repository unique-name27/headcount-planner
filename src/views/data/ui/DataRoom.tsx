/**
 * The Data room (`#data`; docs/PLAN.md 9.1, the template app's Data room): HR admin's home, five
 * tabs. Datasets shows what is loaded, each dataset's tier and its Raw, Mapping, Quality and Certify
 * panels. Data quality tells the quality story across the plan. Metric definitions is the dictionary
 * of every number, each one editable. Lists holds the official lists the data is checked against.
 * Workspace holds the workspace files (the write path's). Every number comes from `dataModel`; the
 * page shows counts, never a value of a row.
 */
import { useEffect, useMemo } from 'react'
import { clearDatasetFocus, useDatasetFocus } from '@/app/datasetFocus'
import { PageHeader } from '@/app/ViewHeader'
import { goTo } from '@/components/navigation'
import { useAnalytics } from '@/data/context'
import { DATA_ROOM_TABS, dataModel } from '../engine'
import { datasetTab, parseDataTab } from '../engine/links'
import { MetricsTab } from '../metrics/MetricsTab'
import { DatasetsTab } from './DatasetsTab'
import { ListsTab } from './ListsTab'
import { QualityTab } from './QualityTab'
import { WorkspaceTab } from './WorkspaceTab'

const PAGE = { key: 'data' as const, label: 'Data room', tabs: DATA_ROOM_TABS }

/** Requests to show a dataset (tier badges anywhere) open it here, then are cleared. */
function useDatasetRequests() {
  const { key, panel, nonce } = useDatasetFocus()
  useEffect(() => {
    if (!key || !nonce) return
    goTo('data', datasetTab(key, panel))
    clearDatasetFocus()
  }, [key, panel, nonce])
}

export function DataRoom({ tab }: { tab: string }) {
  const ctx = useAnalytics()
  const route = parseDataTab(tab)
  const model = useMemo(() => dataModel(ctx), [ctx])
  useDatasetRequests()
  return (
    <>
      <PageHeader page={PAGE} tab={route.tab} />
      <p className="mt-3 text-small text-ink-2">{model.datasets.summary.text}</p>
      <div id="data-room-body" role="tabpanel" aria-labelledby={`subtab-data-${route.tab}`} className="pt-5">
        {route.tab === 'datasets' && <DatasetsTab model={model} route={route} />}
        {route.tab === 'quality' && <QualityTab model={model} />}
        {route.tab === 'metrics' && <MetricsTab model={model} selected={route.item} />}
        {route.tab === 'lists' && <ListsTab model={model} selected={route.item} />}
        {route.tab === 'workspace' && <WorkspaceTab model={model} />}
      </div>
    </>
  )
}
