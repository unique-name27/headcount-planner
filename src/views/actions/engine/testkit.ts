/**
 * Hand-built fixtures for the Action center engine tests (the template app's testkit.ts): a small
 * org, contexts over it in HR admin, items and fake views that hand them over. Not imported by the app.
 *
 *   P-1 Lena Ortiz (E1), Silicon Engineering
 *   ├─ P-2 Sam Lee (E2)
 *   │  └─ P-3 to P-8 (E3 to E8)
 *   └─ P-9 Rita Rao (E9)
 *   P-10 Tom Fox (E10), Go-to-Market
 */
import { type ActingAs, NO_PICKS } from '@/access/modes'
import { type AnalyticsContext, buildContext } from '@/data/context'
import type { DataStandard } from '@/data/quality/tier'
import {
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  emptyDatasets,
  type ISODate,
  type Mode,
  type PositionRow,
  type WorkerRow,
} from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { MetricsApi } from '@/metrics/types'
import type { ActionItem } from '@/views/types'
import type { OpenAction, ViewSource } from './collect'
import { markKeyOf } from './marks'

export const AS_OF: ISODate = '2026-09-30'

function pos(positionId: string, managerPositionId: string | null, bu = 'Silicon Engineering'): PositionRow {
  return {
    positionId,
    effectiveDate: '2025-04-01',
    status: 'Filled',
    title: 'Engineer',
    level: 'P3',
    businessUnit: bu,
    department: 'Design Verification',
    costCenter: '1130-SJC',
    location: 'San Jose',
    managerPositionId,
    workerType: 'Employee',
    fte: 1,
  }
}

function worker(employeeId: string, name: string, positionId: string): WorkerRow {
  return { employeeId, name, positionId, hireDate: '2020-01-06', workerType: 'Employee' }
}

export const POSITIONS: PositionRow[] = [
  pos('P-1', null),
  pos('P-2', 'P-1'),
  ...[3, 4, 5, 6, 7, 8].map((n) => pos(`P-${n}`, 'P-2')),
  pos('P-9', 'P-1'),
  pos('P-10', null, 'Go-to-Market'),
]

export const WORKERS: WorkerRow[] = [
  worker('E1', 'Lena Ortiz', 'P-1'),
  worker('E2', 'Sam Lee', 'P-2'),
  ...[3, 4, 5, 6, 7, 8].map((n) => worker(`E${n}`, `Person ${n}`, `P-${n}`)),
  worker('E9', 'Rita Rao', 'P-9'),
  worker('E10', 'Tom Fox', 'P-10'),
]

const sources = (data: Datasets) =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind: 'upload', rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

/** The small org in a mode (HR admin by default), at the fixtures' as-of date. */
export function ctxOf(
  opts: {
    filters?: Partial<Filters>
    standard?: DataStandard
    metrics?: MetricsApi
    mode?: Mode
    picks?: Partial<Record<Mode, ActingAs | null>>
  } = {},
): AnalyticsContext {
  const data: Datasets = { ...emptyDatasets(), positions: POSITIONS, workers: WORKERS }
  return buildContext({
    data,
    sources: sources(data),
    filters: { ...DEFAULT_FILTERS, ...opts.filters },
    asOfOverride: AS_OF,
    mode: opts.mode ?? 'hr-admin',
    actingAs: { ...NO_PICKS, ...opts.picks },
    showPay: false,
    ...(opts.standard ? { standard: opts.standard } : {}),
    ...(opts.metrics ? { metrics: opts.metrics } : {}),
  })
}

let seq = 0
/** An item about a position, owned by Sam Lee, due on the as-of date (a Plan item by default). */
export function item(patch: Partial<ActionItem> = {}): ActionItem {
  seq++
  return {
    id: `plan:past-start:T${seq}`,
    ownerRole: 'manager',
    ownerId: 'E2',
    ownerName: 'Sam Lee',
    due: AS_OF,
    severity: 'warning',
    what: `Item ${seq} is open`,
    subject: { kind: 'positions', id: 'P-3', label: 'P-3 Engineer' },
    view: 'plan',
    tab: 'openings',
    note: 'Could you take a look this week?',
    uses: ['positions.positionId', 'positions.status'],
    place: { positionId: 'P-3', businessUnit: 'Silicon Engineering', department: 'Design Verification' },
    ...patch,
  }
}

/** A view that hands over fixed items. */
export function source(
  key: ViewSource['key'],
  label: string,
  items: ActionItem[] | ((ctx: AnalyticsContext) => ActionItem[]),
): ViewSource {
  return {
    key,
    label,
    tabs: [
      { key: 'openings', label: 'Openings' },
      { key: 'approvals', label: 'Approvals' },
      { key: 'queue', label: 'Queue' },
      { key: 'mine', label: 'Mine' },
      { key: 'cycle', label: 'Cycle' },
    ],
    datasets: ['positions'],
    actions: typeof items === 'function' ? items : () => items,
  }
}

/** An OpenAction without a context, for pure helpers (filters, groups, notes). */
export function open(patch: Partial<ActionItem> = {}, extra: Partial<OpenAction> = {}): OpenAction {
  const i = item(patch)
  return {
    item: i,
    id: i.id,
    markKey: markKeyOf(i.id),
    role: i.ownerRole,
    roleLabel: 'Managers',
    ownerKey: i.ownerId ? `id:${i.ownerId}` : `name:${i.ownerName.toLowerCase()}`,
    ownerId: i.ownerId ?? null,
    ownerName: i.ownerName,
    viewLabel: 'Plan',
    tabLabel: 'Openings',
    from: 'Plan · Openings',
    requesterId: i.requesterId ?? null,
    approverId: i.approverId ?? null,
    isTeam: false,
    positionId: i.place.positionId,
    below: null,
    alsoFrom: [],
    ...extra,
  }
}
