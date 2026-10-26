/**
 * Who each mode can act as (docs/PLAN.md 8.2), and the seat rules the scopes share. Pure.
 *
 * - Manager: anyone who holds a position that is another position's `managerPositionId` (any team
 *   size, so Manager C and the team-of-3 manager qualify).
 * - Leader: holders of leader seats: Director (M2) and above, or a level the Levels list marks as a
 *   leader seat, unless the seat's own `leaderLevel` says otherwise; never an Eliminated seat. The
 *   CEO, CFO and CHRO see the company (`company: true`).
 * - HRBP: the Units list's HRBP column, one row per unit.
 * - Finance and HR admin: the people on the Roles list's role, else every active employee.
 *
 * Rows list the sample's default persona for the mode first (13.3), then its other personas, then
 * the largest scope first (a company-wide leader before every org), then by name.
 */
import { leaderLevels, rolePeople, unitHrbps } from '@/data/lists/roles'
import type { EffectiveLists } from '@/data/lists/types'
import type { Persona } from '@/data/sample'
import { isLeaderLevel, LEVELS, type Level, type Mode, type PositionRow } from '@/data/schema'
import { type PositionIndex, subtreeIds } from '@/data/scope'
import type { ActingAs } from '../modes'
import { holdingsOn } from './people'

/** The levels whose seats are leader seats: the Levels list's marks, else Director (M2) and above. */
export function leaderLevelSet(lists: EffectiveLists | null | undefined): ReadonlySet<Level> {
  return lists ? leaderLevels(lists) : new Set(LEVELS.filter(isLeaderLevel))
}

/** A leader seat (8.2): by its own mark, else by its level; never an Eliminated seat. */
export const isLeaderSeat = (row: PositionRow, levels: ReadonlySet<Level>): boolean =>
  row.status !== 'Eliminated' &&
  (row.leaderLevel === true || (row.leaderLevel !== false && levels.has(row.level)))

/** Titles of the seats whose holders see the company in Leader mode (the CEO, CFO and CHRO). */
const COMPANY_TITLE = /\b(chief (executive|financial|people|human resources|hr) officer|ceo|cfo|chro|cpo)\b/i

const companyMemo = new WeakMap<PositionIndex, ReadonlySet<string>>()

/**
 * The seats whose holders see the whole company in Leader mode (8.2 names the CEO, CFO and CHRO).
 * Reading taken: the top of the position tree (a seat with no manager in the index), and the seats
 * whose title names the chief executive, financial or people (human resources) officer.
 */
export function companyLeaderSeats(index: PositionIndex): ReadonlySet<string> {
  let hit = companyMemo.get(index)
  if (!hit) {
    const out = new Set<string>()
    for (const [id, row] of index.byId) {
      if (row.status === 'Eliminated') continue
      const top =
        !row.managerPositionId || row.managerPositionId === id || !index.byId.has(row.managerPositionId)
      if (top || (row.title && COMPANY_TITLE.test(row.title))) out.add(id)
    }
    hit = out
    companyMemo.set(index, hit)
  }
  return hit
}

/** One row of the Acting as picker (./index.ts `ActingAsOption`). */
export interface PickRow {
  pick: ActingAs
  line: string
  company: boolean
  persona: boolean
  /** For ordering: the scope's size. */
  size: number
}

export interface PickEnv {
  index: PositionIndex
  workers: Parameters<typeof holdingsOn>[0]
  asOf: string
  lists: EffectiveLists | null
  companyLeaders: ReadonlySet<string>
  personas: readonly Persona[]
}

const seatLine = (row: PositionRow | undefined): string =>
  [row?.title, row?.department].filter((x): x is string => !!x).join(', ')

const people = (n: number): string => `${n.toLocaleString('en-US')} ${n === 1 ? 'person' : 'people'}`

/** The rows a mode's picker lists (see the module comment). */
export function pickRows(mode: Mode, env: PickEnv): PickRow[] {
  const held = holdingsOn(env.workers, env.asOf)
  const nameOf = (id: string) => held.nameOf.get(id) ?? id
  const personaIds = new Set(env.personas.filter((p) => p.mode === mode).map((p) => p.employeeId))
  const defaultIds = new Set(
    env.personas.filter((p) => p.mode === mode && p.isDefault).map((p) => p.employeeId),
  )
  /** The mode's default persona first, then its other personas, then everyone else. */
  const rank = (r: PickRow) => (defaultIds.has(r.pick.personId) ? 0 : r.persona ? 1 : 2)
  const rows: PickRow[] = []
  const seatsIn = (id: string) => (held.seatsOf.get(id) ?? []).filter((s) => env.index.byId.has(s))
  switch (mode) {
    case 'manager': {
      for (const [person] of held.seatsOf) {
        const seats = seatsIn(person).filter((s) => (env.index.children.get(s)?.length ?? 0) > 0)
        if (!seats.length) continue
        let size = 0
        for (const s of seats) size += subtreeIds(env.index, s).size - 1
        rows.push({
          pick: { personId: person, name: nameOf(person) },
          line: seatLine(env.index.byId.get(seats[0])),
          company: false,
          persona: personaIds.has(person),
          size,
        })
      }
      break
    }
    case 'leader': {
      const levels = leaderLevelSet(env.lists)
      for (const [person] of held.seatsOf) {
        const seats = seatsIn(person).filter((s) =>
          isLeaderSeat(env.index.byId.get(s) as PositionRow, levels),
        )
        if (!seats.length) continue
        const company = seats.some((s) => env.companyLeaders.has(s))
        let size = 0
        for (const s of seats) size += subtreeIds(env.index, s).size - 1
        rows.push({
          pick: { personId: person, name: nameOf(person) },
          line: company
            ? `${seatLine(env.index.byId.get(seats[0]))} · whole company`
            : seatLine(env.index.byId.get(seats[0])),
          company,
          persona: personaIds.has(person),
          size: company ? Number.MAX_SAFE_INTEGER : size,
        })
      }
      break
    }
    case 'hrbp': {
      if (!env.lists) break
      const unitSize = new Map<string, number>()
      for (const [, seats] of held.seatsOf) {
        const unit = env.index.byId.get(seats[0] ?? '')?.businessUnit
        if (unit) unitSize.set(unit, (unitSize.get(unit) ?? 0) + 1)
      }
      for (const [unit, person] of unitHrbps(env.lists)) {
        const n = unitSize.get(unit) ?? 0
        rows.push({
          pick: { personId: person, name: nameOf(person), unit },
          line: `${unit} · ${people(n)}`,
          company: false,
          persona: personaIds.has(person),
          size: n,
        })
      }
      break
    }
    default: {
      const role = mode === 'finance' ? 'Finance' : 'HR admin'
      const named = env.lists ? rolePeople(env.lists, role) : []
      const ids = named.length ? named : [...held.active]
      for (const person of ids)
        rows.push({
          pick: { personId: person, name: nameOf(person) },
          line: seatLine(env.index.byId.get(seatsIn(person)[0] ?? '')),
          company: false,
          persona: personaIds.has(person),
          size: 0,
        })
    }
  }
  rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.size - a.size ||
      a.pick.name.localeCompare(b.pick.name) ||
      (a.pick.unit ?? '').localeCompare(b.pick.unit ?? ''),
  )
  return rows
}
