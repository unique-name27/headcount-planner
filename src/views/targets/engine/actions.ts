/**
 * The Targets view's Action center item (docs/PLAN.md 9.6): a sub-org whose asks at its target date
 * are above its heads target, or whose guarded asks cost is above its cost target (7.2 rule 8; heads
 * only for a sub-org that is not a whole union of atoms or whose cost would read "—"). Produced from
 * the same rows as the Leader's My list gap (`targetsModel(ctx).suborgs`); closes when the sub-org's
 * gap is 0 or more in every leg compared; `what` gives the heads gap or says "over its cost target",
 * never an amount. Owner: the leader of the parent org.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); the views-2 builder filled `targetsActions`.
 *
 * Readings taken here: the leader of the parent org is the holder of the parent's head seat (the
 * Leader's own seat in a tree scope; a unit with several top seats has no one holder, so its item
 * waits on "the unit's leader" with no employee ID); the item names the sub-org's head seat as its
 * place, so the scope test reads it; it is due on the sub-org's target date.
 */
import type { ItemKind } from '@/access/ids'
import type { AnalyticsContext } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { plural } from '@/lib/format'
import type { ActionItem } from '../../types'
import { ID } from '../metrics'
import { prepare } from './base'
import { seatsDrill } from './gap'
import { targetsModel } from './index'
import { subOrgFactsOf } from './suborgs'

/** The item kinds this view raises (every one in src/access/ids.ts `ITEM_KINDS`). */
export const TARGETS_ITEM_KINDS = ['targets:suborg-over'] as const satisfies readonly ItemKind[]

/** The Targets view's open items for the Action center. */
export function targetsActions(ctx: AnalyticsContext): ActionItem[] {
  // A mode that hides the view lists none of its items (src/access/items.ts `itemShown`): skip the work.
  if (!ctx.access.can('view:targets') || ctx.access.unset) return []
  const p = prepare(ctx)
  const out: ActionItem[] = []
  for (const row of targetsModel(ctx).suborgs.rows.rows) {
    if (!row.over) continue
    const head = row.parentKey.startsWith('tree:') ? row.parentKey.slice(5) : null
    const ownerId = head ? (p.holderIdOf(head) ?? null) : null
    const ownerName =
      (ownerId && p.nameOf(ownerId)) || (head ? 'The parent org’s leader' : 'The unit’s leader')
    const seat = p.latest.get(row.positionId)
    const overHeads = row.gapHeads != null && row.gapHeads < 0
    const what = overHeads
      ? `${row.label} asks ${plural(-(row.gapHeads as number), 'head')} more than its target`
      : `${row.label} is over its cost target`
    out.push({
      id: `targets:suborg-over:${row.positionId}`,
      ownerRole: 'leader',
      ownerId,
      ownerName,
      due: row.targetDate,
      severity: 'warning',
      what,
      subject: { kind: 'positions', id: row.positionId, label: row.label },
      view: 'targets',
      tab: 'suborgs',
      drill: () => seatsDrill(p, `Working seats, ${row.label}`, subOrgFactsOf(row)?.parts.seats ?? []),
      note: `Compared at ${formatDate(row.targetDate)}${row.overCost ? ', in heads and against its cost target' : ', in heads'}.`,
      uses: p.uses(ID.gapHeads),
      kind: 'Sub-org over target',
      matter: `suborg:${row.positionId}`,
      fingerprint: `${row.asksHeads}|${row.targetHeads ?? ''}|${row.overCost ? 1 : 0}`,
      closesWhen: 'Closes when the sub-org’s gap is 0 or more in every leg compared',
      place: {
        positionId: row.positionId,
        businessUnit: seat?.businessUnit ?? null,
        department: seat?.department ?? null,
        costCenter: seat?.costCenter ?? null,
        location: seat?.location ?? null,
        legalEntity: seat?.legalEntity ?? null,
      },
    })
  }
  return out
}
