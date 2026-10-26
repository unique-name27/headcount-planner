/**
 * "Changed by your HRBP" per mode and person (docs/PLAN.md 9.4, 8.4 rules 3, 5 and 7): over a planted
 * audit log of HRBP Working edits (one in Manager A's team, one on Manager C's own seat, one in
 * Silicon Engineering, and one whose reason arrived with an amount through an import), each viewer
 * reads exactly the notes of the seats in their scope, worded for them: Manager A reads "Changed by
 * your HRBP: ..." on their team's seat with the amount read "an amount"; Manager C and the manager
 * below C read nothing about C's own seat; the Silicon Engineering HRBP and its SVP read only their
 * unit's seat; Finance and HR admin read every note. No note text ever holds an amount, and in
 * Manager mode no reason does either.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { hasAmount, requestView, viewerOf } from '@/access/visibility'
import { approveAll, hrbpUnitOf, scenario, type Who } from '@/app/write/scenario.testkit'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { seatStateOf } from '@/drill/seats'
import { appendEntry } from '@/plan/audit/chain'
import type { AuditDraft, AuditEntry, HcRequest } from '@/plan/types'
import type { Seen } from '@/testkit/crawl'
import { amountHits } from '@/testkit/leaks'
import { ctxAs, leakSample, personaOf, sampleCtx } from '@/testkit/sample'
import { viewAuditRows } from '@/views/audit/engine'
import { teamModel } from '@/views/team/engine'
import { planModel } from '.'
import { changedByHrbp } from './edits'
import { changeWords, hrbpNotesBySeat } from './notes'

let s: Sample
let log: AuditEntry[]
let seats: { a: string; c: string; se: string }
let below: string

const AT1 = '2026-09-30T10:00:00.000Z'
const AT2 = '2026-09-30T11:00:00.000Z'
const AT3 = '2026-09-30T12:00:00.000Z'

function draft(
  id: string,
  field: string,
  old: unknown,
  value: unknown,
  comment: string,
  at: string,
): AuditDraft {
  const hr = personaOf(s, 'hrbp-se')
  return {
    at,
    by: hr.employeeId,
    byName: hr.name,
    mode: 'hrbp',
    object: 'position',
    id,
    field,
    old,
    new: value,
    effectiveDate: '2026-09-30',
    comment,
    commentAudience: null,
  }
}

beforeAll(() => {
  s = leakSample()
  const a = personaOf(s, 'manager-a')
  const c = personaOf(s, 'manager-c')
  const aCtx = ctxAs('manager', a.employeeId)
  const tree = aCtx.access.scope?.kind === 'tree' ? [...aCtx.access.scope.positionIds].sort() : []
  const aSeat = tree.find((id) => {
    const st = seatStateOf(aCtx, id)
    return st?.status === 'Open' || st?.status === 'Planned'
  }) as string
  const seSeat = s.datasets.positions.find(
    (r) => r.businessUnit === 'Silicon Engineering' && r.status === 'Planned',
  )?.positionId as string
  below = s.datasets.workers.find((w) => {
    const seat = s.datasets.positions.find(
      (q) =>
        q.managerPositionId === c.positionId &&
        s.datasets.positions.some((r) => r.managerPositionId === q.positionId),
    )?.positionId
    return w.positionId === seat && !w.assignmentEnd
  })?.employeeId as string
  seats = { a: aSeat, c: c.positionId, se: seSeat }
  const drafts = [
    draft(aSeat, 'startDate', '2027-01-11', '2027-03-08', 'Hiring plan moved to spring', AT1),
    draft(aSeat, 'level', 'P3', 'P4', 'Hiring plan moved to spring', AT1),
    draft(c.positionId, 'status', 'Open', 'On hold', 'Held for the reorganization', AT2),
    draft(seSeat, 'fte', 1, 0.5, 'Part-time role', AT2),
    // A reason that arrived through Import requests or a Merge, past the entry rule (8.4 rule 5).
    draft(aSeat, 'location', 'Austin', 'San Jose', 'Saves $40,000 a year', AT3),
    // Not a seat edit's field: no note.
    draft(aSeat, 'openedDate', null, '2026-09-30', 'Hiring plan moved to spring', AT3),
  ]
  log = []
  for (const d of drafts) log.push(appendEntry(log.at(-1) ?? null, d))
  expect(aSeat && seSeat && below).toBeTruthy()
}, 120_000)

/** Every value a model holds, as the leak scanner reads a crawl. */
function seenOf(v: unknown, where: string, out: Seen[] = []): Seen[] {
  if (typeof v === 'function' || v === undefined || v === null) return out
  if (typeof v !== 'object') {
    out.push({ where, value: v as Seen['value'], tag: { in: where } })
    return out
  }
  if (Array.isArray(v))
    v.forEach((x, i) => {
      seenOf(x, `${where}[${i}]`, out)
    })
  else for (const [k, x] of Object.entries(v)) seenOf(x, `${where}.${k}`, out)
  return out
}

const seatsWithNotes = (ctx: AnalyticsContext) => [...hrbpNotesBySeat(ctx).keys()].sort()

describe('who reads which note', () => {
  it('Manager A reads their team’s seat only, worded for them, the amount read "an amount"', () => {
    const ctx = ctxAs('manager', personaOf(s, 'manager-a').employeeId, { audit: log })
    expect(seatsWithNotes(ctx)).toEqual([seats.a])
    const notes = changedByHrbp(ctx, seats.a)
    expect(notes.map((n) => n.text)).toEqual([
      'Changed by your HRBP: location moved from Austin to San Jose',
      'Changed by your HRBP: start moved from Jan to Mar and level changed from P3 to P4',
    ])
    expect(notes[0].reason).toContain('an amount')
    for (const n of notes) expect(hasAmount(`${n.text} ${n.reason ?? ''}`), n.text).toBe(false)
    // On the seat in Plan > Positions, and in My team, with nothing that reads as an amount.
    const row = planModel(ctx).positions.grid.rows.find((r) => r.positionId === seats.a)
    expect(row?.hrbpNote).toBe(notes[0].text)
    const team = teamModel(ctx)
    expect(team.hrbpChanges.rows.map((r) => r.positionId)).toEqual([seats.a, seats.a])
    expect(amountHits(seenOf(team.hrbpChanges, 'team hrbp changes'))).toEqual([])
    expect(amountHits(seenOf(planModel(ctx).positions.changes, 'plan changes'))).toEqual([])
  })

  it('Manager C and the manager below C read nothing about C’s own seat (8.4 rule 3, R23)', () => {
    for (const personId of [personaOf(s, 'manager-c').employeeId, below]) {
      const ctx = ctxAs('manager', personId, { audit: log })
      expect(seatsWithNotes(ctx), personId).not.toContain(seats.c)
      expect(changedByHrbp(ctx, seats.c), personId).toEqual([])
      expect(
        teamModel(ctx).hrbpChanges.rows.some((r) => r.positionId === seats.c),
        personId,
      ).toBe(false)
      expect(JSON.stringify(teamModel(ctx).hrbpChanges)).not.toContain('reorganization')
    }
  })

  it('the HRBP and the SVP of Silicon Engineering read their unit’s seat only, worded for a reader', () => {
    for (const ctx of [
      sampleCtx('hrbp', { audit: log }),
      ctxAs('leader', personaOf(s, 'leader-svp-se').employeeId, { audit: log }),
    ]) {
      expect(seatsWithNotes(ctx), ctx.mode).toEqual([seats.se])
      expect(changedByHrbp(ctx, seats.se).map((n) => [n.text, n.reason])).toEqual([
        ['Changed by the HRBP: FTE changed from 1 to 0.5', 'Part-time role'],
      ])
    }
  })

  it('Finance and HR admin read every note; HR admin reads the reason as written', () => {
    for (const mode of ['finance', 'hr-admin'] as const) {
      const ctx = sampleCtx(mode, { audit: log })
      expect(seatsWithNotes(ctx), mode).toEqual([seats.a, seats.c, seats.se].sort())
    }
    const admin = sampleCtx('hr-admin', { audit: log })
    expect(changedByHrbp(admin, seats.a)[0].reason).toBe('Saves $40,000 a year')
    expect(changedByHrbp(admin, seats.c)[0].text).toBe('Changed by the HRBP: put on hold')
  })

  it('reads nothing without an HRBP edit', () => {
    const ctx = ctxAs('manager', personaOf(s, 'manager-a').employeeId)
    expect(hrbpNotesBySeat(ctx).size).toBe(0)
    expect(teamModel(ctx).hrbpChanges.rows).toEqual([])
    expect(teamModel(ctx).hrbpChanges.empty).toBe('Your HRBP has not changed any of your seats.')
  })
})

describe('the words of a change', () => {
  it('names months inside a year, months and years across years, days inside a month', () => {
    expect(changeWords('startDate', '2027-01-11', '2027-03-08')).toBe('start moved from Jan to Mar')
    expect(changeWords('startDate', '2026-12-01', '2027-02-01')).toBe('start moved from Dec 2026 to Feb 2027')
    expect(changeWords('startDate', '2027-01-03', '2027-01-17')).toBe('start moved from 3 Jan to 17 Jan')
    expect(changeWords('startDate', null, '2027-01-17')).toBe('start set to 17 Jan 2027')
    expect(changeWords('status', 'On hold', 'Open')).toBe('taken off hold')
    expect(changeWords('status', 'Planned', 'Open')).toBe('opened for recruiting')
    expect(changeWords('costCenter', '1220-SJC', '1220-AUS')).toBeNull()
  })
})

describe('a note follows its request: an imported approval (D-MERGE, PV-5, M3 verify)', () => {
  it('Finance and the CFO read the confidential Elimination’s seat note as the Audit page does, no approver named', async () => {
    // Manager C's confidential Elimination is approved in one workspace; the Operations HRBP imports
    // it in another, so its seat entries are the HRBP's (mode 'hrbp'), with a comment naming the
    // approver and the file, and the request's own entry at the same `at` (the file's stamps differ).
    const elim = s.planted.managerCElimination
    const one = scenario({ idTag: 'AAAA' })
    expect((await approveAll(one, elim)).every((x) => x.outcome.ok)).toBe(true)
    const approved = (await one.request(elim)) as HcRequest
    const seat = approved.positionId as string
    const hrbpId = approved.steps.find((x) => x.role === 'hrbp')?.approverId as string
    const hrbp: Who = { mode: 'hrbp', personId: hrbpId, unit: hrbpUnitOf(s)(hrbpId) }
    // The import runs on a later wall-clock day (R47): no minute of it matches the file's stamps.
    const two = scenario({ idTag: 'BBBB', start: '2026-10-24T15:00:00.000Z' })
    const files = [
      {
        name: 'ops.hcplan.json',
        kind: 'requests' as const,
        requests: (await one.plan()).requests,
        skipped: 0,
      },
    ]
    expect((await two.run(hrbp, 'importRequests', { files })).outcome.ok).toBe(true)
    const log2 = await two.log()
    const entry = log2.find((e) => e.object === 'position' && e.id === seat && e.field === 'status')
    expect(entry?.mode).toBe('hrbp')
    expect(entry?.comment).toContain('Approved in the file ops.hcplan.json')
    const approverNames = approved.steps.map(
      (x) => s.datasets.workers.find((w) => w.employeeId === x.approverId)?.name,
    )
    for (const key of ['finance-fpa', 'leader-cfo'] as const) {
      const p = personaOf(s, key)
      const ctx = await two.ctx({ mode: p.mode, personId: p.employeeId })
      expect(requestView(approved, viewerOf(ctx)), key).toBe('limited')
      const rows = viewAuditRows(ctx, log2).filter((r) => r.object === 'position' && r.id === seat)
      expect(
        rows.every((r) => r.comment == null),
        key,
      ).toBe(true)
      for (const n of hrbpNotesBySeat(ctx).get(seat) ?? []) {
        expect(n.reason, key).toBeNull()
        for (const name of approverNames) if (name) expect(n.text, key).not.toContain(name)
      }
    }
    // Control: HR admin reads the note with its reason.
    const admin = await two.ctx({ mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId })
    expect((hrbpNotesBySeat(admin).get(seat) ?? []).some((n) => n.reason?.includes('ops.hcplan.json'))).toBe(
      true,
    )
  }, 300_000)
})
