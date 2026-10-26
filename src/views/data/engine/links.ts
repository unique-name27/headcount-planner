/**
 * Addresses inside the Data room, carried in the route's tab (`#data.<tab>`; docs/PLAN.md 9.1):
 *
 *   #data                       Datasets
 *   #data.positions             Datasets, with Positions open on its default panel
 *   #data.positions-raw         … on its Raw panel (raw, mapping, quality, certify)
 *   #data.quality               Data quality
 *   #data.metrics               Metric definitions
 *   #data.metrics/plan.heads.approved   … at one metric
 *   #data.lists                 Lists
 *   #data.lists/department      … at one list
 *   #data.workspace             Workspace
 *
 * src/app/datasetFocus.ts writes `#data.<dataset>-<panel>`. Pure, so the parsing is unit-tested.
 */
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'

export type DataTab = 'datasets' | 'quality' | 'metrics' | 'lists' | 'workspace'
export type DatasetPanel = 'raw' | 'mapping' | 'quality' | 'certify'

/** The order the panels are listed in: the way data comes in, raw first. */
export const DATASET_PANELS: readonly DatasetPanel[] = ['raw', 'mapping', 'quality', 'certify']

export const PANEL_LABEL: Readonly<Record<DatasetPanel, string>> = {
  raw: 'Raw',
  mapping: 'Mapping',
  quality: 'Quality',
  certify: 'Certify',
}

/** The panel a dataset opens on: its fill rates, checks and tier. */
export const DEFAULT_PANEL: DatasetPanel = 'quality'

export interface DataRoute {
  tab: DataTab
  /** The dataset to open, when the address names one. */
  dataset: DatasetKey | null
  panel: DatasetPanel | null
  /** The metric Metric definitions opens at, or the list Lists opens at. */
  item: string | null
}

const TABS: readonly DataTab[] = ['datasets', 'quality', 'metrics', 'lists', 'workspace']
const isDataset = (s: string): s is DatasetKey => (DATASET_KEYS as readonly string[]).includes(s)
const isPanel = (s: string): s is DatasetPanel => (DATASET_PANELS as readonly string[]).includes(s)

/** Read the route's tab. Unknown addresses land on Datasets. */
export function parseDataTab(tab: string | null | undefined): DataRoute {
  const t = (tab ?? '').trim()
  for (const sub of TABS) {
    if (t === sub) return { tab: sub, dataset: null, panel: null, item: null }
    if (t.startsWith(`${sub}/`) || t.startsWith(`${sub}:`))
      return { tab: sub, dataset: null, panel: null, item: t.slice(sub.length + 1) || null }
  }
  const [key, panel] = t.split('-')
  if (key && isDataset(key))
    return { tab: 'datasets', dataset: key, panel: panel && isPanel(panel) ? panel : null, item: null }
  return { tab: 'datasets', dataset: null, panel: null, item: null }
}

/** The route tab of one dataset's panel: "positions-quality". */
export const datasetTab = (key: DatasetKey, panel?: DatasetPanel | null): string =>
  panel ? `${key}-${panel}` : key

/** The route tab of a Data room tab ('' for Datasets), with an item ("metrics/plan.heads.approved"). */
export const tabRoute = (tab: DataTab, item?: string | null): string =>
  tab === 'datasets' ? '' : item ? `${tab}/${item}` : tab
