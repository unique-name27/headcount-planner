/**
 * Money and person-level rules in items (the template app's privacy.test.ts, adapted to HCP; docs/PLAN.md
 * 7.2 rule 6, 8.4 and 9.6): no item's `what`, `note`, subject or owner holds an amount, with pay
 * amounts on or off, in any mode; an item carries no amount and the list's export has no amount
 * column; a request hidden from the viewer (rule 3, Manager C's own seat) raises no item, no count and
 * no row anywhere, while HR admin's control lists it; a limited request (rule 2) raises an item for
 * nobody but its own approver and never names its requester.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { MODES, type Mode } from '@/access/modes'
import { VIEWS } from '@/views/registry'
import { requestsModel } from '@/views/requests/engine'
import { requestsActions } from '@/views/requests/engine/actions'
import { type Collected, collectUncached } from './collect'
import { groupByOwner } from './group'
import { composeNote } from './note'
import { picksOf, sampleCtx, sampleOnce } from './roleKit'
import { EXPORT_COLUMNS, exportRows } from './rows'

/** A money amount in text: a currency sign or code beside a number. */
const MONEY =
  /[$€£¥₹₩₪]\s?\d|\d[\d,.]*\s?(USD|EUR|GBP|INR|TWD|CNY|RMB|JPY|KRW|SGD|VND|ILS|CAD|MXN|CHF)\b|\b(USD|EUR|GBP|INR|TWD|CNY|JPY|KRW|SGD|VND|ILS|CAD)\s?\d/

describe('no money in item text', () => {
  const runs: { mode: Mode; pay: boolean; c: Collected }[] = []
  beforeAll(() => {
    for (const mode of MODES)
      for (const pay of [false, true]) {
        const ctx = sampleCtx(mode, { showPay: pay })
        runs.push({ mode, pay, c: collectUncached(ctx, VIEWS) })
      }
  }, 600_000)

  it('keeps every amount out of what, note, subject and owner, switch on or off, in every mode', () => {
    let items = 0
    for (const { mode, pay, c } of runs)
      for (const a of c.items) {
        const at = `${mode} ${pay} ${a.id}`
        expect(a.item.what, at).not.toMatch(MONEY)
        expect(a.item.note ?? '', at).not.toMatch(MONEY)
        expect(a.item.subject.label, at).not.toMatch(MONEY)
        expect(a.ownerName, at).not.toMatch(MONEY)
        expect(Object.keys(a.item), at).not.toContain('amount')
        items++
      }
    expect(items).toBeGreaterThan(0)
  })

  it('exports the list with no amount column', () => {
    for (const c of EXPORT_COLUMNS) {
      expect(c.pay, c.key).toBeFalsy()
      expect(c.cost, c.key).toBeFalsy()
      expect(c.band, c.key).toBeFalsy()
    }
    const admin = runs.find((r) => r.mode === 'hr-admin' && r.pay)!.c
    expect(JSON.stringify(exportRows(admin.items, '2026-09-30'))).not.toMatch(MONEY)
  })

  it('writes Copy note without an amount', () => {
    for (const { mode, pay, c } of runs)
      for (const g of groupByOwner(c.items, '2026-09-30'))
        for (const b of g.owners) {
          const text = composeNote({ name: b.name, isTeam: b.isTeam }, b.items, '2026-09-30')
          expect(text, `${mode} ${pay} ${b.name}`).not.toMatch(MONEY)
        }
  })
})

describe('person-level rules (8.4)', () => {
  /** Manager C's own seat is in a confidential Elimination raised by their manager (13.3). */
  const elimination = () => {
    const s = sampleOnce()
    const c = s.personas.find((p) => p.key === 'manager-c')!
    const req = s.datasets.requests.find((r) => r.type === 'Elimination' && r.positionId === c.positionId)!
    return { c, req }
  }

  it("raises nothing about Manager C's own seat in Manager mode, while HR admin's control lists it", () => {
    const { c, req } = elimination()
    expect(req.confidential).toBe(true)
    const picks = { ...picksOf(), manager: { personId: c.employeeId, name: c.name } }
    const ctx = sampleCtx('manager', { picks })
    expect(ctx.access.actingAs?.personId).toBe(c.employeeId)
    const items = collectUncached(ctx, VIEWS).items
    const text = JSON.stringify(
      items.map((a) => [a.id, a.item.what, a.item.subject, a.item.place, a.ownerName]),
    )
    expect(text).not.toContain(req.requestId)
    // The seat shows only as the place of Manager C's own team items (their ranked asks), never as a subject.
    for (const a of items) expect(a.item.subject.id ?? '', a.id).not.toBe(c.positionId)
    const m = requestsModel(ctx)
    const all = [...m.queue.rows.rows, ...m.mine.rows.rows, ...m.approvals.rows.rows]
    expect(all.some((r) => r.requestId === req.requestId)).toBe(false)
    // No count moves: Manager C's model and items are the same with the elimination removed.
    const s = sampleOnce()
    const without = {
      ...s,
      datasets: { ...s.datasets, requests: s.datasets.requests.filter((r) => r !== req) },
    }
    const other = sampleCtx('manager', { picks, sample: without })
    expect(JSON.stringify(requestsModel(other))).toBe(JSON.stringify(m))
    expect(JSON.stringify(requestsActions(other))).toBe(JSON.stringify(requestsActions(ctx)))
    // The control: HR admin lists the elimination's waiting step.
    const admin = requestsActions(sampleCtx('hr-admin'))
    expect(admin.some((i) => i.id.endsWith(`:${req.requestId}`))).toBe(true)
  })

  it('raises an item about a limited request only for its own approver, never naming the requester', () => {
    for (const mode of ['leader', 'finance'] as const) {
      const ctx = sampleCtx(mode)
      const m = requestsModel(ctx)
      const limited = new Set(m.queue.rows.rows.filter((r) => r.view === 'limited').map((r) => r.requestId))
      const me = ctx.access.actingAs?.personId
      for (const i of requestsActions(ctx)) {
        const id = i.subject.id
        if (!id || !limited.has(id)) continue
        expect(i.approverId, `${mode} ${i.id}`).toBe(me)
        expect(i.requesterId ?? null, `${mode} ${i.id}`).toBeNull()
      }
      // Limited rows carry no person, reason or date (requestRecord): the lists show them as such.
      for (const r of m.queue.rows.rows.filter((x) => x.view === 'limited')) {
        expect(r.requesterName, r.requestId).toBeNull()
        expect(r.approverName, r.requestId).toBeNull()
        expect(r.reasonCode, r.requestId).toBeNull()
        expect(r.startDate, r.requestId).toBeNull()
        expect(r.bandEstimateUsd, r.requestId).toBeNull()
      }
    }
  })
})
