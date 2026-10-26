/**
 * The Acting as dialog's rows (docs/PLAN.md 8.2 and 13.3): who the mode can act as over the data
 * loaded now and the lists in force, the sample's persona first while the sample is loaded, then
 * the largest scope first (src/access/scopes `actingAsOptions`). Pure.
 */
import { listsInForce } from '@/access/lists'
import type { Mode } from '@/access/modes'
import { type ActingAsOption, actingAsOptions } from '@/access/scopes'
import type { AnalyticsContext } from '@/data/context'
import type { ListsState } from '@/data/lists/types'
import { cachedSample } from '@/data/sample'
import { onSample } from '@/data/store'

/** The rows for a mode; `saved` is Settings > Official lists (null: none saved). */
export function actingAsRows(
  mode: Mode,
  ctx: Pick<AnalyticsContext, 'positionIndex' | 'asOf' | 'all' | 'sources'>,
  saved: ListsState | null,
): readonly ActingAsOption[] {
  return actingAsOptions(mode, {
    positionIndex: ctx.positionIndex,
    asOf: ctx.asOf,
    all: ctx.all,
    lists: listsInForce(saved, ctx.all, ctx.sources),
    // The sample's personas lead the list (and carry the "Sample persona" tag) while it is loaded.
    personas: onSample(ctx.sources) ? cachedSample().personas : null,
  })
}
