/**
 * What if's levers in words (docs/PLAN.md 10.6, 11.5): each lever's line in the lever list, and the
 * request "Turn into requests" makes of it. No amount ever appears here (7.2 rule 6): a lever's cost
 * shows in the result strip only, and a trade's size is in seats and standard heads.
 */
import { formatDate } from '@/lib/dates'
import { plural } from '@/lib/format'
import { standardHeads } from '@/plan/engine/trade'
import type { Lever } from '@/plan/engine/whatif'

/** What each lever kind is called in the picker. */
export const LEVER_KIND_LABEL: Readonly<Record<Lever['kind'], string>> = {
  defer: 'Defer a start',
  cancel: 'Cancel an Open or Planned seat',
  shift: 'Shift starts',
  level: 'Change level',
  location: 'Change location',
  freeze: 'Freeze a sub-org',
  trade: 'Trade',
}

/** The lever kinds in the picker's order (10.6). */
export const LEVER_KINDS: readonly Lever['kind'][] = [
  'defer',
  'cancel',
  'shift',
  'level',
  'location',
  'freeze',
  'trade',
]

/** The request "Turn into requests" makes of a lever (10.6), or why it makes none. */
export const BECOMES: Readonly<Record<Lever['kind'], string>> = {
  defer: 'Start date',
  cancel: 'Elimination',
  shift: 'Start date',
  level: 'Level change',
  location: 'Location change',
  freeze: 'No request: freezes are set by Finance',
  trade: 'Trade',
}

const months = (n: number): string => plural(Math.abs(n), 'month')

/**
 * One lever as words: "Defer P-2201's start to 1 Feb 2027", "Freeze Platform Engineering (Dana Ito)
 * from 1 Nov 2026". `orgLabel` names a sub-org by its head seat.
 */
export function leverLabel(lever: Lever, orgLabel: (positionId: string) => string): string {
  switch (lever.kind) {
    case 'defer':
      return `Defer ${lever.positionId}'s start to ${formatDate(lever.to)}`
    case 'cancel':
      return `Cancel ${lever.positionId}`
    case 'shift': {
      const ids = lever.positionIds
      const what = ids.length === 1 ? `${ids[0]}'s start` : `${plural(ids.length, 'start')}`
      if (lever.months === 0) return `Shift ${what} by 0 months`
      return lever.months > 0
        ? `Shift ${what} later by ${months(lever.months)}`
        : `Bring ${what} forward by ${months(lever.months)}`
    }
    case 'level':
      return `Change ${lever.positionId}'s level to ${lever.level}`
    case 'location':
      return `Move ${lever.positionId} to ${lever.location}`
    case 'freeze':
      return `Freeze ${orgLabel(lever.orgPositionId)} from ${formatDate(lever.from)}`
    case 'trade': {
      const a = lever.ask
      const give = a.give.length === 1 ? a.give[0] : plural(a.give.length, 'seat')
      const credit = a.creditUsedBp > 0 ? `${standardHeads(a.creditUsedBp)} standard heads of credit` : ''
      const gave = [a.give.length ? give : '', credit].filter(Boolean).join(' and ') || 'nothing'
      const count = a.get.count === 'max' ? 'as many' : String(a.get.count)
      const seats = a.get.count === 1 ? 'seat' : 'seats'
      const fte = a.get.fte === 1 ? '' : ` at ${a.get.fte} FTE`
      return `Trade ${gave} for ${count} ${a.get.level} ${a.get.location} ${seats}${fte} in ${orgLabel(a.get.orgPositionId)} from ${formatDate(a.get.start)}`
    }
  }
}

/**
 * A trade lever's rate tile note, counts in plain words (14.3, R86; M4 review CP-5): "Give 1.22
 * standard heads, get 1 seat, 0.25 left as trade credit".
 */
export const tradeRateNote = (q: { giveBp: number; creditBp: number; get: readonly unknown[] }): string =>
  `Give ${standardHeads(q.giveBp)} standard heads, get ${plural(q.get.length, 'seat')}, ${standardHeads(q.creditBp)} left as trade credit`
