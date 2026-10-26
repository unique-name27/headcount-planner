/**
 * The masthead's pages (docs/PLAN.md 9.1): the Data room (HR admin's home), the Action center and
 * Audit. They are not folder tabs and not ViewDefs; the shell mounts each with its own error
 * boundary, figure registry and current-view context, and the Action center with the filter row
 * (the template app's App.tsx `ActionsPage`).
 *
 * Their bodies are their builders' (src/views/data, src/views/actions, src/views/audit), read only
 * through each page's own index module: the Data room and Audit draw their own header, and the
 * Action center its title and lists.
 */
import type { ComponentType } from 'react'
import { DATA_TABS } from '@/access/ids'
import { DATASET_KEYS, type DatasetKey, PAGE_LABEL, type PageKey } from '@/data/schema'
import { ActionCenter } from '@/views/actions'
import { AuditPage } from '@/views/audit'
import { Page as DataRoom } from '@/views/data'
import type { ViewTab } from '@/views/types'

export interface PageDef {
  key: PageKey
  label: string
  /** Sub-tabs; the first is the default (the Data room's, `DATA_TABS`). */
  tabs: readonly ViewTab[]
  /** The datasets it reads (tiers, the records panel's fallback). */
  datasets: readonly DatasetKey[]
  /** The filter row shows above it. */
  filters: boolean
  /** The page's body. */
  Page: ComponentType<{ tab: string }>
}

/** The Action center and Audit take no tab: each is one page. */
const ActionsBody: ComponentType<{ tab: string }> = () => <ActionCenter />
const AuditBody: ComponentType<{ tab: string }> = () => <AuditPage />

export const PAGES: Readonly<Record<PageKey, PageDef>> = {
  data: {
    key: 'data',
    label: PAGE_LABEL.data,
    tabs: DATA_TABS,
    datasets: DATASET_KEYS,
    filters: false,
    Page: DataRoom,
  },
  actions: {
    key: 'actions',
    label: PAGE_LABEL.actions,
    tabs: [],
    datasets: DATASET_KEYS,
    filters: true,
    Page: ActionsBody,
  },
  audit: {
    key: 'audit',
    label: PAGE_LABEL.audit,
    tabs: [],
    // Audit entries are plan state, not dataset rows: the page takes no dataset tier (B4).
    datasets: [],
    filters: false,
    Page: AuditBody,
  },
}
