/**
 * What the app reads from the lists about people and seats: which levels are leader seats (the
 * "Director+" rule and its override in the Levels list), each unit's HR business partner (the
 * Units list's HRBP column) and the people of each role (the Roles list). Pure.
 */
import { isLeaderLevel, LEVELS, type Level, splitIds } from '../schema'
import type { Role } from './defs'
import type { EffectiveLists } from './types'

/**
 * The levels whose seats are leader seats: Director (M2) and above, unless the Levels list says
 * otherwise for a level (Leader seats Yes or No). A seat's own `leaderLevel` still wins over this.
 */
export function leaderLevels(lists: EffectiveLists): ReadonlySet<Level> {
  const marks = new Map<string, unknown>()
  for (const v of lists.level.values) marks.set(v.value, v.attrs?.leader)
  return new Set(
    LEVELS.filter((l) => {
      const mark = marks.get(l)
      return mark === 'Yes' ? true : mark === 'No' ? false : isLeaderLevel(l)
    }),
  )
}

/** Each business unit's HR business partner (an employee ID), for units that name one. */
export function unitHrbps(lists: EffectiveLists): ReadonlyMap<string, string> {
  const out = new Map<string, string>()
  for (const v of lists.businessUnit.values) {
    const id = v.attrs?.hrbp
    if (!v.retired && typeof id === 'string' && id.trim()) out.set(v.value, id.trim())
  }
  return out
}

/** The people (employee IDs) of a role, in the order the Roles list names them. */
export function rolePeople(lists: EffectiveLists, role: Role): string[] {
  const v = lists.role.values.find((x) => x.value === role)
  const people = v?.attrs?.people
  return typeof people === 'string' ? splitIds(people) : []
}
