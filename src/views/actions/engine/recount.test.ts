/**
 * The Requests view's item kinds recounted from raw rows (the template app's recount.test.ts,
 * rewritten for HCP's kinds; docs/PLAN.md 9.6 and 13.4): on the sample, whole company, HR admin.
 *
 *  - approve and waiting: every pending request with an entered, undecided step; waiting once the step
 *    has waited the setting's 5 days, approve before;
 *  - sent-back: every request in state Sent back;
 *  - not-submitted: in the HRBP's unit, exactly story 6's four Silicon Engineering managers;
 *  - backfill-new-position: exactly story 3's four Systems & Software Backfills; both backfill flags
 *    recounted from raw rows (a seat's Employee exits, its first row, its unit and department's
 *    exits), with a Backfill added on a seat with no exit and one on a seat with an exit;
 *  - trade-credit-lapse: none on the sample (its only trade is pending and uses no credit); once that
 *    trade is approved, one item for the giving org, owned by its holder (the nearest held seat above
 *    when it is vacant), with no amount, on that manager's Needs attention and the HRBP's Waiting on
 *    others.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { itemKindOf, lensOf, roleItems } from '@/access/items'
import { holdingsOn, upward } from '@/access/scopes/people'
import { fiscalYearOf, fyRange } from '@/data/fiscal'
import { PENDING_REQUEST_STATES, type RequestRow } from '@/data/schema'
import { daysBetween } from '@/lib/dates'
import { fromRow } from '@/plan/engine/requests'
import { requestsActions } from '@/views/requests/engine/actions'
import type { ActionItem } from '@/views/types'
import { modeCtx, sampleCtx, sampleOnce } from './roleKit'

/** A money amount in text: a currency sign or code beside a number. */
const MONEY = /[$€£¥₹₩₪]\s?\d|\d[\d,.]*\s?(USD|EUR|GBP|INR|TWD|CNY|JPY|KRW|SGD|VND|ILS|CAD)\b/

let items: ActionItem[]
let rows: RequestRow[]
const byKind = (kind: string) => items.filter((i) => i.id.startsWith(`requests:${kind}:`))
const tail = (id: string) => id.split(':').slice(2).join(':')

beforeAll(() => {
  items = requestsActions(modeCtx('hr-admin'))
  rows = [...sampleOnce().datasets.requests]
}, 120_000)

describe('recounts from raw rows', () => {
  it('approve and waiting: every pending request with an entered, undecided step', () => {
    const asOf = sampleOnce().asOf
    const approve: string[] = []
    const waiting: string[] = []
    for (const r of rows.map(fromRow)) {
      if (!PENDING_REQUEST_STATES.includes(r.state)) continue
      const step = r.steps.find((s) => s.enteredAt && !s.decision)
      if (!step?.enteredAt) continue
      const days = daysBetween(step.enteredAt.slice(0, 10), asOf)
      ;(days >= 5 ? waiting : approve).push(r.requestId)
    }
    expect(
      byKind('approve')
        .map((i) => tail(i.id))
        .sort(),
    ).toEqual(approve.sort())
    expect(
      byKind('waiting')
        .map((i) => tail(i.id))
        .sort(),
    ).toEqual(waiting.sort())
    expect(waiting.length).toBeGreaterThan(0)
    for (const i of [...byKind('approve'), ...byKind('waiting')]) {
      expect(i.snoozeOnly, i.id).toBe(true)
      expect(i.matter, i.id).toBe(`request:${tail(i.id)}`)
      expect(i.approverId, i.id).toBe(i.ownerId)
    }
  })

  it('sent-back: every request sent back, owned by its requester', () => {
    const sent = rows.filter((r) => r.state === 'Sent back')
    expect(
      byKind('sent-back')
        .map((i) => tail(i.id))
        .sort(),
    ).toEqual(sent.map((r) => r.requestId).sort())
    for (const i of byKind('sent-back')) {
      const r = sent.find((x) => x.requestId === tail(i.id))
      expect(i.ownerId, i.id).toBe(r?.requesterId)
    }
  })

  it("not-submitted: story 6's four Silicon Engineering managers in the HRBP's unit", () => {
    const hrbp = requestsActions(modeCtx('hrbp'))
    const ids = hrbp.filter((i) => i.id.startsWith('requests:not-submitted:')).map((i) => i.ownerId)
    expect(ids.sort()).toEqual([...sampleOnce().story.notSubmitted].sort())
  })

  it("backfill-new-position: story 3's four Systems & Software Backfills, no other unit's", () => {
    const flagged = byKind('backfill-new-position')
    expect(flagged.map((i) => tail(i.id)).sort()).toEqual(['R-1025', 'R-1028', 'R-1032', 'R-1036'])
    for (const i of flagged) expect(i.place.businessUnit, i.id).toBe('Systems & Software')
  })

  it('trade-credit-lapse: none, since no approved trade holds credit', () => {
    expect(byKind('trade-credit-lapse')).toEqual([])
    const trades = rows.filter((r) => r.type === 'Trade')
    expect(trades.every((r) => r.state !== 'Approved' && r.state !== 'Approved with changes')).toBe(true)
  })

  it('both backfill flags, recounted from the seats, workers and positions', () => {
    const s = sampleOnce()
    const d = s.datasets
    // A seat's known exits: the end of each Employee assignment on it (the earlier of its two ends).
    const exits = new Map<string, string[]>()
    for (const w of d.workers) {
      if (!w.positionId || (w.workerType || 'Employee') !== 'Employee') continue
      const ends = [w.assignmentEnd, w.terminationDate].filter((x): x is string => !!x).sort()
      if (!ends.length) continue
      exits.set(w.positionId, [...(exits.get(w.positionId) ?? []), ends[0]])
    }
    const first = new Map<string, string>()
    const org = new Map<string, { at: string; org: string }>()
    for (const p of d.positions) {
      const was = first.get(p.positionId)
      if (!was || p.effectiveDate < was) first.set(p.positionId, p.effectiveDate)
      const cur = org.get(p.positionId)
      if (!cur || p.effectiveDate >= cur.at)
        org.set(p.positionId, { at: p.effectiveDate, org: `${p.businessUnit}|${p.department ?? ''}` })
    }
    const recount = (seat: string): string | null => {
      if (exits.get(seat)?.length) return null
      const made = first.get(seat)
      const near = [...exits].some(
        ([id, list]) =>
          org.get(id)?.org === org.get(seat)?.org &&
          !!made &&
          list.some((e) => Math.abs(daysBetween(e, made)) <= 30),
      )
      return near ? 'backfill-new-position' : 'backfill-no-exit'
    }
    // Two more pending Backfills: on a seat with no exit and none near its creation, and on a seat
    // with an exit (no flag).
    const template = d.requests.find((r) => r.requestId === 'R-1025') as RequestRow
    const inUnit = (id: string) => !!org.get(id)?.org.startsWith('Systems & Software|')
    const noExit = [...first.keys()].find((id) => inUnit(id) && recount(id) === 'backfill-no-exit')
    const withExit = [...exits.keys()].find(inUnit)
    expect(noExit).toBeDefined()
    expect(withExit).toBeDefined()
    const extra: RequestRow[] = [
      { ...template, requestId: 'R-9001', positionId: noExit as string },
      { ...template, requestId: 'R-9002', positionId: withExit as string },
    ]
    const requests = [...d.requests, ...extra]
    const ctx = sampleCtx('hr-admin', { sample: { ...s, datasets: { ...d, requests } } })
    const got = requestsActions(ctx).filter((i) => i.id.startsWith('requests:backfill-'))
    const want = requests
      .filter((r) => r.type === 'Backfill' && PENDING_REQUEST_STATES.includes(r.state) && r.positionId)
      .map((r) => [r.requestId, recount(r.positionId as string)] as const)
      .filter(([, flag]) => flag)
      .map(([id, flag]) => `requests:${flag}:${id}`)
      .sort()
    expect(got.map((i) => i.id).sort()).toEqual(want)
    expect(want).toContain('requests:backfill-no-exit:R-9001')
    expect(want.some((id) => id.endsWith(':R-9002'))).toBe(false)
    for (const i of got) {
      expect(i.ownerRole, i.id).toBe('hrbp')
      expect(i.what, i.id).not.toMatch(MONEY)
      expect(i.closesWhen, i.id).toBeTruthy()
    }
  })

  it('trade-credit-lapse: one item for the giving org once a trade with credit is approved', () => {
    const s = sampleOnce()
    const d = s.datasets
    const fy = fiscalYearOf(s.asOf)
    const holder = holdingsOn(d.workers, s.asOf).holderOf
    const trade = d.requests.find((r) => r.type === 'Trade') as RequestRow
    const approve = (r: RequestRow, giveOrg: string): RequestRow => ({
      ...r,
      state: 'Approved',
      startDate: fyRange(fy).end,
      giveOrgPositionId: giveOrg,
      steps: (r.steps ?? []).map((st) => ({ ...st, decision: 'Approved', at: st.at ?? '2026-09-25' })),
    })
    const run = (giveOrg: string) => {
      const requests = d.requests.map((r) => (r.requestId === trade.requestId ? approve(r, giveOrg) : r))
      const ctx = sampleCtx('hr-admin', { sample: { ...s, datasets: { ...d, requests } } })
      return requestsActions(ctx).filter((i) => itemKindOf(i.id) === 'requests:trade-credit-lapse')
    }
    // The trade's own giving org, held: its holder owns the item.
    const org = trade.giveOrgPositionId as string
    expect(holder.has(org)).toBe(true)
    const [item, ...more] = run(org)
    expect(more).toEqual([])
    expect(item.id).toBe(`requests:trade-credit-lapse:${org}:${fy}`)
    expect(item.ownerId).toBe(holder.get(org))
    expect(item.ownerRole).toBe('manager')
    expect(item.due).toBe(fyRange(fy).end)
    expect(item.fingerprint).toBe(String(trade.creditBp))
    expect(item.place.positionId).toBe(org)
    expect(`${item.what} ${item.note ?? ''}`).not.toMatch(MONEY)
    expect(item.what).toMatch(/standard heads held by .+ lapses when FY\d\d closes$/)
    // 9.6: the manager's Needs attention, the HRBP's Waiting on others.
    const routed = [{ item, ownerId: item.ownerId ?? null, ownerName: item.ownerName }]
    const me = { id: item.ownerId as string, name: item.ownerName }
    expect(roleItems(routed, { mode: 'manager', me, asOf: s.asOf }).needs).toHaveLength(1)
    expect(roleItems(routed, lensOf(modeCtx('hrbp').access, s.asOf)).waiting).toHaveLength(1)
    // A vacant giving org: the nearest held seat above owns it.
    const index = modeCtx('hr-admin').positionIndex
    const vacant = d.positions.find(
      (p) => p.status === 'Open' && !holder.has(p.positionId) && !!p.managerPositionId,
    )?.positionId as string
    expect(vacant).toBeDefined()
    const above = upward(vacant, index).find((id) => holder.has(id)) as string
    const [v] = run(vacant)
    expect(v.id).toBe(`requests:trade-credit-lapse:${vacant}:${fy}`)
    expect(v.ownerId).toBe(holder.get(above))
  })

  it('names every item by its kind, view and record', () => {
    for (const i of items) expect(i.id, i.id).toMatch(/^requests:[a-z-]+:[A-Za-z0-9:-]+$/)
  })
})
