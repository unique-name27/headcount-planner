/**
 * The `tree` scope (docs/PLAN.md 8.2): a Manager's team or a Leader's org, the positions strictly
 * below the Acting as person's own seats through `managerPositionId`, as of the as-of date. The own
 * seats and everything above them are never in it (R23: nothing about a manager's own seat can reach
 * them, Manager C). A seat that starts after the as-of date is in the tree when the manager it is
 * placed under is (the data layer's `placementRows`, as the filters place it). Pure.
 */
import { type AtomIndex, atomOf, isUnionOfAtoms } from '@/cost/atoms'
import type { Datasets, ISODate, PositionRow } from '@/data/schema'
import { type PositionIndex, subtreeIds } from '@/data/scope'
import { orgOf, teamOf } from '../copy'
import { NOBODY } from './nobody'
import { holdingsOn, placementsOf } from './people'
import type { SubOrg, TreeScope } from './types'
import { scopeValues } from './values'

export interface TreeInput {
  index: PositionIndex
  all: Datasets
  asOf: ISODate
  personId: string
  /** The name the pick carries; the roster's name wins when the data has one. */
  name: string
  /** The cost atoms every rounded figure reads (the last close's index), for the sub-orgs' rows. */
  atoms: AtomIndex | null
  /** "Priya Raman's team" or "Dana Ito's org". */
  kind: 'manager' | 'leader'
}

/** Every position below a root (the root included): its subtree, and later seats placed under it. */
function below(root: string, index: PositionIndex, place: ReadonlyMap<string, PositionRow>): Set<string> {
  const inIndex = subtreeIds(index, root)
  const out = new Set(inIndex)
  for (const [id, row] of place) {
    if (index.byId.has(id)) continue
    const seen = new Set<string>([id])
    let cur = row.managerPositionId ?? null
    while (cur && !seen.has(cur)) {
      if (index.byId.has(cur)) {
        if (inIndex.has(cur)) out.add(id)
        break
      }
      seen.add(cur)
      cur = place.get(cur)?.managerPositionId ?? null
    }
  }
  return out
}

/** "Design Verification (Dana Ito)": a sub-org's row, by its head seat and who holds it. */
function subOrgLabel(row: PositionRow | undefined, holder: string | null): string {
  const base = row?.department || row?.title || row?.positionId || ''
  return `${base} (${holder ?? 'vacant'})`
}

/**
 * The cost atoms a set of positions is a whole union of, or null when it cuts one (7.3a). Eliminated
 * seats hold no cost and are left out of the test.
 */
export function unionAtoms(
  ids: ReadonlySet<string>,
  atoms: AtomIndex | null,
  managerOf: (id: string) => string | null,
  eliminated: (id: string) => boolean,
): readonly string[] | null {
  if (!atoms) return null
  const live = new Set([...ids].filter((id) => !eliminated(id)))
  if (!isUnionOfAtoms(live, atoms, managerOf)) return null
  const touched = new Set<string>()
  for (const id of live) {
    const a = atomOf(id, atoms, managerOf)
    if (a !== null) touched.add(a)
  }
  return [...touched].sort()
}

/** The tree a person's seats hold; null when they hold no seat in the index on the as-of date. */
export function treeScope(input: TreeInput): TreeScope | null {
  const { index, all, asOf, personId } = input
  const held = holdingsOn(all.workers, asOf)
  const roots = (held.seatsOf.get(personId) ?? []).filter((id) => index.byId.has(id))
  if (!roots.length) return null
  const place = placementsOf(all.positions, index)
  const rootSet = new Set(roots)
  const positionIds = new Set<string>()
  for (const r of roots) for (const id of below(r, index, place)) if (!rootSet.has(id)) positionIds.add(id)
  const managerOf = (id: string): string | null =>
    (index.byId.get(id) ?? place.get(id))?.managerPositionId ?? null
  const eliminated = (id: string): boolean => index.byId.get(id)?.status === 'Eliminated'
  const name = held.nameOf.get(personId) || input.name || personId

  // People in those seats, current and former, and not-in-plan reports of someone in the tree.
  const personIds = new Set<string>()
  for (const id of positionIds) for (const p of held.everHeld.get(id) ?? []) personIds.add(p)
  const inTreeOrRoot = (seat: string) => positionIds.has(seat) || rootSet.has(seat)
  for (const w of all.workers) {
    if (w?.positionId || !w?.employeeId || !w.managerId) continue
    if ((held.seatsOf.get(w.managerId) ?? []).some(inTreeOrRoot)) personIds.add(w.employeeId)
  }
  personIds.delete(personId)

  const subOrgs: SubOrg[] = []
  for (const r of roots)
    for (const child of index.children.get(r) ?? []) {
      if (rootSet.has(child.positionId)) continue
      const ids = below(child.positionId, index, place)
      for (const id of ids) if (rootSet.has(id)) ids.delete(id)
      const holder = held.holderOf.get(child.positionId)
      subOrgs.push({
        positionId: child.positionId,
        label: subOrgLabel(child, holder ? (held.nameOf.get(holder) ?? holder) : null),
        positionIds: ids,
        atoms: unionAtoms(ids, input.atoms, managerOf, eliminated),
      })
    }

  let size = 0
  for (const [p, seats] of held.seatsOf) if (p !== personId && seats.some((s) => positionIds.has(s))) size++

  return {
    kind: 'tree',
    rootPersonId: personId,
    rootName: name,
    rootPositionIds: rootSet,
    positionIds,
    personIds,
    subOrgs,
    size,
    label: input.kind === 'manager' ? teamOf(name) : orgOf(name),
    ...valuesOf(positionIds, place),
  }
}

/** `values` for a scope's positions, when it has any (an empty tree carries none). */
const valuesOf = (ids: ReadonlySet<string>, place: ReadonlyMap<string, PositionRow>) => {
  const values = scopeValues(ids, place)
  return values ? { values } : {}
}

const empties = new Map<string, TreeScope>()

/**
 * A tree that holds nobody: no pick yet, or one the loaded data no longer has. Its scope is empty,
 * never the whole company; the clamp pins the leader filter to `NOBODY`.
 */
export function emptyTreeScope(personId: string | null | undefined): TreeScope {
  const id = personId || NOBODY
  let s = empties.get(id)
  if (!s) {
    s = {
      kind: 'tree',
      rootPersonId: id,
      rootName: '',
      rootPositionIds: new Set(),
      positionIds: new Set(),
      personIds: new Set(),
      subOrgs: [],
      size: 0,
      label: '',
    }
    empties.set(id, s)
  }
  return s
}

/** The seat is the tree's root or inside it (the leader filter's allowed values). */
export const treeHas = (s: TreeScope, positionId: string): boolean =>
  s.rootPositionIds.has(positionId) || s.positionIds.has(positionId)
