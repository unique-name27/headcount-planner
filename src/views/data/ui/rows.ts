/**
 * A dataset's rows as drill records, for the manifest's row counts and the field drills: positions
 * as positions, requests as the viewer's records (8.4), the others as they were loaded. Comp rows
 * carry one person's pay and have no drill kind: their count opens nothing. Pure.
 */
import { requestView, viewerOf } from '@/access/visibility'
import type { AnalyticsContext } from '@/data/context'
import { type DatasetKey, datasetDef } from '@/data/schema'
import { requestRecord } from '@/drill/requestRecord'
import { workerNames } from '@/drill/seats'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { fromRow } from '@/plan/engine/requests'
import { toPosition } from '@/plan/engine/versions'

/** The rows at `indexes` of a dataset (every row when not given), or null for comp. */
export function datasetRowsSpec(
  ctx: AnalyticsContext,
  key: DatasetKey,
  indexes?: readonly number[],
  title?: string,
): DrillSpec | null {
  const all = ctx.all
  const pick = <T>(list: readonly T[]): T[] =>
    indexes ? indexes.map((i) => list[i]).filter((x) => x != null) : [...list]
  const name = title ?? `${datasetDef(key).label} as loaded`
  switch (key) {
    case 'positions':
      return drillSpec({ kind: 'positions', title: name, rows: pick(all.positions).map(toPosition) })
    case 'workers':
      return drillSpec({ kind: 'workers', title: name, rows: pick(all.workers) })
    case 'reqs':
      return drillSpec({ kind: 'reqs', title: name, rows: pick(all.reqs) })
    case 'targets':
      return drillSpec({ kind: 'targets', title: name, rows: pick(all.targets) })
    case 'freezes':
      return drillSpec({ kind: 'freezes', title: name, rows: pick(all.freezes) })
    case 'assumptions':
      return drillSpec({ kind: 'assumptions', title: name, rows: pick(all.assumptions) })
    case 'requests': {
      const viewer = viewerOf(ctx)
      const names = workerNames(ctx)
      const rows = pick(all.requests)
        .map(fromRow)
        .filter((r) => requestView(r, viewer) !== 'none')
        .map((r) => requestRecord(r, { viewer, asOf: ctx.asOf, nameOf: (id) => names.get(id) ?? null }))
        .filter((r): r is NonNullable<typeof r> => r != null)
      return drillSpec({ kind: 'requests', title: name, rows })
    }
    default:
      return null
  }
}
