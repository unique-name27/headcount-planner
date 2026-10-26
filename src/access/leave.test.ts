/**
 * Leave views (docs/PLAN.md 7.7, C25 and 16.2): `leaveShown` keeps a scope's count only at 5 or more
 * on leave and drops the smallest offending scope until every class of people across the shown
 * scopes holds 0 or 5 or more on leave; `leaveFit` reads "—" under any filter but the scope's own pin
 * and any period but the default; the `leave:*` decisions follow `LEAVE_OF`.
 */
import { describe, expect, it } from 'vitest'
import type { WorkerRow } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import { LEAVE_FIT_NOTE, LEAVE_OF, type LeaveScope, leaveDecisions, leaveFit, leaveShown } from './leave'
import { MODES } from './modes'
import type { TreeScope, UnitScope } from './scopes/types'

const AS_OF = '2026-09-30'

/** `n` people on leave (or not), with ids from `from`. */
function people(from: number, n: number, onLeave: boolean): WorkerRow[] {
  return Array.from({ length: n }, (_, i) => ({
    employeeId: `E${from + i}`,
    positionId: `P-${from + i}`,
    hireDate: '2020-01-01',
    workerType: 'Employee',
    onLeave,
  }))
}
const ids = (rows: readonly WorkerRow[]) => new Set(rows.map((r) => r.employeeId))
const scope = (key: string, ...groups: (readonly WorkerRow[])[]): LeaveScope => ({
  key,
  personIds: new Set(groups.flatMap((g) => [...ids(g)])),
})

describe('leaveShown', () => {
  it('shows a scope only with 5 or more on leave at the as-of date', () => {
    const a = people(1, 6, true)
    const b = people(100, 4, true)
    const back = people(200, 3, true).map((w) => ({ ...w, assignmentEnd: '2026-09-01' }))
    const shown = leaveShown(
      [scope('unit:A', a), scope('unit:B', b), scope('unit:C', back, people(300, 20, false))],
      AS_OF,
      {
        workers: [...a, ...b, ...back],
        min: 5,
      },
    )
    expect([...shown]).toEqual(['unit:A'])
  })

  it('drops the smallest offending scope until every class holds 0 or 5 or more on leave', () => {
    // An org of 7 on leave inside a unit of 9 on leave: the unit minus the org is 2 people.
    const org = people(1, 7, true)
    const rest = people(100, 2, true)
    const env = { workers: [...org, ...rest], min: 5 }
    const shown = leaveShown([scope('unit:U', org, rest), scope('tree:P-1', org)], AS_OF, env)
    expect([...shown]).toEqual(['unit:U'])
    // With 5 outside the org, both show.
    const more = people(100, 5, true)
    const both = leaveShown([scope('unit:U', org, more), scope('tree:P-1', org)], AS_OF, {
      workers: [...org, ...more],
      min: 5,
    })
    expect([...both].sort()).toEqual(['tree:P-1', 'unit:U'])
    // The minimum is the rule's, never a constant.
    expect([
      ...leaveShown([scope('unit:U', org, more)], AS_OF, { workers: [...org, ...more], min: 13 }),
    ]).toEqual([])
  })
})

describe('leaveFit', () => {
  const f = (patch: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, modes: {}, ...patch })
  const unit: UnitScope = {
    kind: 'unit',
    unit: 'Operations',
    positionIds: new Set(),
    personIds: new Set(),
    otherDepartments: new Set(),
    leaderPositionIds: new Set(),
    size: 0,
    label: 'Operations',
  }
  const tree: TreeScope = {
    kind: 'tree',
    rootPersonId: 'E1',
    rootName: 'Dana Ito',
    rootPositionIds: new Set(['P-1']),
    positionIds: new Set(['P-2']),
    personIds: new Set(),
    subOrgs: [],
    size: 0,
    label: "Dana Ito's org",
  }

  it('shows the count for the whole scope at the default period only', () => {
    expect(leaveFit(f(), 'fy')).toBeNull()
    expect(leaveFit(f({ businessUnit: ['Operations'] }), 'fy', unit)).toBeNull()
    expect(leaveFit(f({ leaderId: 'P-1' }), 'fy', tree)).toBeNull()
    for (const period of ['ytd', 'qtd', 'month', 'custom'] as const)
      expect(leaveFit(f(), period), period).toBe(LEAVE_FIT_NOTE)
  })

  it('reads the note under any other filter, include or exclude', () => {
    for (const patch of [
      { location: ['Munich'] },
      { level: ['P6'] },
      { department: ['Facilities'] },
      { costCenter: ['1550-HSZ'] },
      { legalEntity: ['X'] },
      { country: ['India'] },
      { currency: ['INR'] },
      { leaderId: 'P-2' },
      { location: ['Munich'], modes: { location: 'exclude' as const } },
      { businessUnit: ['Operations'], modes: { businessUnit: 'exclude' as const } },
    ])
      expect(leaveFit(f({ businessUnit: ['Operations'], ...patch }), 'fy', unit), JSON.stringify(patch)).toBe(
        LEAVE_FIT_NOTE,
      )
    expect(leaveFit(f({ leaderId: 'P-1', modes: { leaderId: 'exclude' } }), 'fy', tree)).toBe(LEAVE_FIT_NOTE)
    expect(leaveFit(f({ businessUnit: ['Operations'] }), 'fy')).toBe(LEAVE_FIT_NOTE)
  })
})

describe('leave decisions', () => {
  it('follow the leave view', () => {
    for (const m of MODES) {
      const d = leaveDecisions(m)
      expect(d['leave:counts'].access !== 'hidden', m).toBe(LEAVE_OF[m] !== 'none')
      expect(d['leave:people'].access !== 'hidden', m).toBe(LEAVE_OF[m] === 'switch')
      for (const x of Object.values(d)) if (x.access !== 'shown') expect(x.how, m).toMatch(/^[A-Z].*\.$/)
    }
    expect(leaveDecisions('finance')['leave:counts'].how).toBe('Leave is not shown in this mode.')
  })
})
