/**
 * Cost atoms (docs/PLAN.md 7.3a, change C20): fixtures AT1 and AT2, and the stored index fixed until
 * the next close.
 */
import { describe, expect, it } from 'vitest'
import type { PositionRow } from '@/data/schema'
import { AT1, AT2 } from '@/plan/engine/fixtures/atoms'
import { hcRequest } from '@/plan/engine/fixtures/common'
import { applyApproval } from '@/plan/engine/requests'
import { applyTransfer } from '@/plan/engine/transfer'
import type { WorkingPlan } from '@/plan/types'
import { atomIndex, atomOf, isUnionOfAtoms, leaderSeats } from './atoms'

const managerOf = (id: string): string | null =>
  id === AT1.newSeat.positionId ? AT1.newSeat.managerPositionId : null

describe('AT1: a director’s org, a VP’s own staff, an SVP’s own staff', () => {
  it('finds the leader seats', () => {
    expect([...leaderSeats(AT1.positions, AT1.closeDate)].sort()).toEqual([...AT1.leaderSeats])
  })

  it('builds the atoms at the close', () => {
    const index = atomIndex(AT1.positions, AT1.closeDate)
    expect(index.closeDate).toBe(AT1.closeDate)
    const got = Object.fromEntries(index.atoms.map((a) => [a.atomId, [...a.positionIds].sort()]))
    expect(got).toEqual(AT1.atoms)
    for (const a of index.atoms) expect(a.kind).toBe('leader')
  })

  it('places each position, and none for an eliminated seat', () => {
    const index = atomIndex(AT1.positions, AT1.closeDate)
    for (const { positionId, expected } of AT1.atomOf)
      expect(atomOf(positionId, index), positionId).toBe(expected)
  })

  it("a new Planned seat takes its manager's atom", () => {
    const index = atomIndex(AT1.positions, AT1.closeDate)
    expect(atomOf(AT1.newSeat.positionId, index, managerOf)).toBe(AT1.newSeat.expected)
  })

  it('tells unions of atoms from rows that cut one', () => {
    const index = atomIndex(AT1.positions, AT1.closeDate)
    for (const { set, expected } of AT1.unions)
      expect(isUnionOfAtoms(new Set(set), index), set.join(',')).toBe(expected)
  })

  it('keeps the stored index when a seat is raised to M2 after the close; the next close moves it', () => {
    const stored = atomIndex(AT1.positions, AT1.closeDate)
    expect(atomOf(AT1.raised.row.positionId, stored)).toBe(AT1.raised.storedAtom)
    const next = atomIndex([...AT1.positions, AT1.raised.row], AT1.raised.nextClose)
    expect(atomOf(AT1.raised.row.positionId, next)).toBe(AT1.raised.nextAtom)
  })

  it('a seat marked as a leader in Lists heads its own atom', () => {
    const index = atomIndex(AT1.positions, AT1.closeDate, new Set(AT1.listed.leaders))
    expect(atomOf('A-IC1', index)).toBe(AT1.listed.atomOfIc1)
    expect(atomOf('A-DIR-IC', index)).toBe(AT1.listed.atomOfDirIc)
  })
})

describe('AT2: with no leader seats, atoms fall back to the department, then the unit', () => {
  it('places each position', () => {
    const index = atomIndex(AT2.positions, AT2.closeDate)
    for (const { positionId, expected } of AT2.atomOf)
      expect(atomOf(positionId, index), positionId).toBe(expected)
  })
})

describe('the stored index is fixed until the next close (7.3a, C20)', () => {
  const plan: WorkingPlan = {
    versionId: 'fy27-working',
    positions: AT1.positions,
    assignments: [],
    newPositionId: (requestId, n) => `${requestId}-${n}`,
    placeOf: () => ({
      businessUnit: 'Silicon Engineering',
      department: 'Design Verification',
      costCenter: '1130-SJC',
      legalEntity: 'Northgate Semiconductor Inc.',
    }),
    actor: { personId: 'E9002', name: 'Silicon Engineering HRBP', mode: 'hrbp' },
  }
  // An in-unit position move approved in HRBP mode: A-IC1 from the manager to the director.
  const move = applyTransfer(
    hcRequest('R-MOVE', {
      type: 'Transfer',
      state: 'Approved',
      businessUnit: 'Silicon Engineering',
      positionId: 'A-IC1',
      transfer: {
        kind: 'position',
        personId: 'E-IC1',
        fromPositionId: 'A-IC1',
        toManagerPositionId: 'A-DIR',
        toPositionId: null,
        effectiveDate: '2026-10-10',
        moveBudget: false,
      },
    }),
    plan,
    '2026-10-05',
  )
  // An approved Level change raising the Filled seat A-IC2 to M2.
  const level = applyApproval(
    hcRequest('R-LVL', {
      type: 'Level change',
      state: 'Approved',
      positionId: 'A-IC2',
      level: 'M2',
      startDate: '2026-10-10',
    }),
    plan,
    '2026-10-05',
  )
  const after: PositionRow[] = [
    ...AT1.positions,
    // A position.edit raising the Open manager seat to M2.
    AT1.raised.row,
    ...move.positions.map((c) => c.row),
    ...level.flatMap((e) => (e.kind === 'position' ? [e.change.row] : [])),
  ]

  it('a raise to M2 on an Open seat, an in-unit move and a Level change on a Filled seat leave every stored atom unchanged', () => {
    const stored = atomIndex(AT1.positions, AT1.closeDate)
    const snapshot = structuredClone(stored)
    expect(move.positions).toHaveLength(1)
    expect(level).toHaveLength(1)
    for (const p of after)
      expect(atomOf(p.positionId, stored), p.positionId).toBe(atomOf(p.positionId, snapshot))
    expect(stored).toEqual(snapshot)
    expect(atomOf('A-IC1', stored)).toBe('A-DIR')
    expect(atomOf('A-IC2', stored)).toBe('A-DIR')
    expect(atomOf('A-MGR-OPEN', stored)).toBe('A-DIR')
  })

  it('the next close partitions again: the raised seats head atoms of their own', () => {
    const next = atomIndex(after, '2026-10-31')
    expect(atomOf('A-MGR-OPEN', next)).toBe('A-MGR-OPEN')
    expect(atomOf('A-IC2', next)).toBe('A-IC2')
    expect(atomOf('A-IC1', next)).toBe('A-DIR')
  })
})
