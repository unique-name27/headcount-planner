/**
 * An approved Elimination ends the seat for good (docs/PLAN.md 10.1, 15.1 R34; M2-REPORT close-out
 * known gap 3): the Eliminated row starts the day after the last day, and every row of the seat dated
 * after it is written Eliminated too, as applyTrade does for a give seat, so a later planned change
 * (a level change, a new start) never brings the seat back in Working.
 */
import { describe, expect, it } from 'vitest'
import type { PositionRow } from '@/data/schema'
import type { PositionChange, WorkingPlan } from '../types'
import { assignment, hcRequest, positionRow } from './fixtures/common'
import { applyApproval } from './requests'
import { seatHistories, seatOn } from './versions'

const ROWS: PositionRow[] = [
  positionRow('P-GTM-MGR', { effectiveDate: '2025-04-01', level: 'M1' }),
  // An Open seat with a planned level change on 1 Jan 2027 and a later move of its start.
  positionRow('P-OPEN', {
    status: 'Open',
    managerPositionId: 'P-GTM-MGR',
    startDate: '2026-12-01',
    openedDate: '2026-08-01',
  }),
  positionRow('P-OPEN', {
    effectiveDate: '2027-01-01',
    status: 'Open',
    level: 'P4',
    managerPositionId: 'P-GTM-MGR',
    startDate: '2027-02-01',
    openedDate: '2026-08-01',
  }),
  positionRow('P-OPEN', {
    effectiveDate: '2027-03-01',
    status: 'Planned',
    level: 'P4',
    managerPositionId: 'P-GTM-MGR',
    startDate: '2027-04-01',
  }),
  // A Filled seat with a later dated row (a planned location move).
  positionRow('P-FILLED', { managerPositionId: 'P-GTM-MGR' }),
  positionRow('P-FILLED', {
    effectiveDate: '2027-02-01',
    managerPositionId: 'P-GTM-MGR',
    location: 'Munich',
  }),
]

const WORKING: WorkingPlan = {
  versionId: 'fy27-working',
  positions: ROWS,
  assignments: [assignment('E1110', 'P-GTM-MGR', '2025-04-01'), assignment('E-F', 'P-FILLED', '2024-01-01')],
  newPositionId: (requestId, n) => `${requestId}-${n}`,
  placeOf: () => null,
  actor: { personId: 'E9001', name: 'Go-to-Market HRBP', mode: 'hrbp' },
}

const changesOf = (positionId: string, lastDay: string): PositionChange[] =>
  applyApproval(
    hcRequest('R-EL', { type: 'Elimination', state: 'In review', positionId, startDate: lastDay }),
    WORKING,
    '2026-10-05',
  ).flatMap((e) => (e.kind === 'position' ? [e.change] : []))

/** The seat in Working after the approval: the rows as imported, with the approval's rows laid over them. */
function seatAfter(positionId: string, changes: readonly PositionChange[], on: string) {
  const key = (r: PositionRow) => `${r.positionId}|${r.effectiveDate}`
  const over = new Map(changes.map((c) => [key(c.row), c.row]))
  const rows = ROWS.map((r) => over.get(key(r)) ?? r)
  for (const c of changes) if (!ROWS.some((r) => key(r) === key(c.row))) rows.push(c.row)
  const seat = seatHistories({
    positions: rows,
    assignments: WORKING.assignments,
    reqs: [],
    requests: [],
  }).get(positionId)
  return seat ? seatOn(seat, on) : null
}

describe('an approved Elimination with later dated rows', () => {
  it('writes the Eliminated row from the day after the last day, and every later row Eliminated', () => {
    const changes = changesOf('P-OPEN', '2026-11-30')
    expect(
      changes.map((c) => [c.kind, c.row.effectiveDate, c.row.status, c.row.endDate, c.row.endReason]),
    ).toEqual([
      ['eliminated', '2026-12-01', 'Eliminated', '2026-11-30', 'Eliminated'],
      ['eliminated', '2027-01-01', 'Eliminated', '2026-11-30', 'Eliminated'],
      ['eliminated', '2027-03-01', 'Eliminated', '2026-11-30', 'Eliminated'],
    ])
    for (const c of changes) expect(c.row.sourceRequestId).toBe('R-EL')
  })

  it('leaves the seat Eliminated in Working on every later date, through the later rows', () => {
    const changes = changesOf('P-OPEN', '2026-11-30')
    expect(seatAfter('P-OPEN', changes, '2026-11-30')?.status).toBe('Open')
    for (const on of ['2026-12-01', '2027-01-15', '2027-03-15', '2027-09-30'])
      expect(seatAfter('P-OPEN', changes, on)?.status, on).toBe('Eliminated')
    // Without the rewrite, the 1 Jan 2027 row would bring the seat back as Open (control).
    const firstOnly = changes.slice(0, 1)
    expect(seatAfter('P-OPEN', firstOnly, '2027-01-15')?.status).toBe('Open')
  })

  it('ends a Filled seat for good too: its holder is out from the next day, the later row never returns', () => {
    const changes = changesOf('P-FILLED', '2026-12-31')
    expect(changes.map((c) => [c.row.effectiveDate, c.row.status])).toEqual([
      ['2027-01-01', 'Eliminated'],
      ['2027-02-01', 'Eliminated'],
    ])
    expect(seatAfter('P-FILLED', changes, '2026-12-31')?.status).toBe('Filled')
    expect(seatAfter('P-FILLED', changes, '2027-02-15')?.status).toBe('Eliminated')
    expect(seatAfter('P-FILLED', changes, '2027-02-15')?.holderIds).toEqual([])
  })
})
