/**
 * The Audit page's model (docs/PLAN.md 8.4 rule 7, 9.4, 10.7) over a hand-built log on the sample:
 *
 *  - HR admin sees every entry with its chain fields, "Chain checks out (n entries)", and a changed
 *    entry breaks the chain;
 *  - every other mode sees `AuditRow`s (no `seq`, `prevHash` or `hash`), "n entries" counted over the
 *    rows it can see, pay and cost values as "changed", and its scope only;
 *  - rule 3: Manager C never sees an entry of the elimination of their own seat; rule 2: Finance sees
 *    only that request's state, with "Requester" for the person; rule 5: an approvers-only comment
 *    with an amount never reaches Manager mode;
 *  - the page's filters narrow the rows by record type, record, person and dates, and the count that
 *    follows them comes from the engine (`auditShown`) and opens exactly the rows kept.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { resolveDrill } from '@/drill/types'
import { appendEntry } from '@/plan/audit/chain'
import { cycleTransition } from '@/plan/engine/cycle'
import type { AuditDraft, AuditEntry } from '@/plan/types'
import { picksOf, sampleCtx, sampleOnce } from '@/views/actions/engine/roleKit'
import {
  type AuditFilters,
  type AuditListRow,
  auditModel,
  auditShown,
  filterAuditRows,
  isFilteringAudit,
  NO_AUDIT_FILTERS,
} from './index'

let log: AuditEntry[]
let eliminationId: string

function draft(over: Partial<AuditDraft>): AuditDraft {
  return {
    at: '2026-09-20T10:00',
    by: 'E10974',
    byName: 'Minh Tri Vu',
    mode: 'hr-admin',
    object: 'request',
    id: 'R-1038',
    field: 'state',
    old: 'Draft',
    new: 'Submitted',
    effectiveDate: null,
    comment: null,
    commentAudience: null,
    ...over,
  }
}

beforeAll(() => {
  const s = sampleOnce()
  const c = s.personas.find((p) => p.key === 'manager-c')!
  eliminationId = s.datasets.requests.find(
    (r) => r.type === 'Elimination' && r.positionId === c.positionId,
  )!.requestId
  const drafts: AuditDraft[] = [
    draft({
      id: eliminationId,
      at: '2026-09-14T13:49',
      by: 'E10334',
      byName: 'Someone',
      field: 'state',
      old: 'Submitted',
      new: 'In review',
    }),
    draft({ id: eliminationId, at: '2026-09-14T13:50', field: 'reasonCode', old: null, new: 'Restructure' }),
    draft({ object: 'position', id: 'P-2052', at: '2026-09-15T09:00', field: 'level', old: 'M1', new: 'M2' }),
    draft({
      id: 'R-1038',
      at: '2026-09-22T16:05',
      by: 'E10626',
      byName: 'Sebastian Wagner',
      mode: 'manager',
      comment: 'Fits the plan at $95k',
      commentAudience: 'approvers',
    }),
    draft({
      object: 'assumption',
      id: 'band|P4|Munich|FY27',
      at: '2026-09-25T09:00',
      field: 'band',
      old: 110_000,
      new: 113_300,
    }),
    draft({
      object: 'cycle',
      id: 'cycle-fy28',
      at: '2026-09-15T09:00',
      field: 'stage',
      old: null,
      new: 'Open for asks',
    }),
    draft({
      object: 'target',
      id: 'FY28|Silicon Engineering|||',
      at: '2026-09-26T09:00',
      field: 'targetHeads',
      old: 640,
      new: 644,
    }),
  ]
  log = []
  for (const d of drafts) log.push(appendEntry(log.at(-1) ?? null, d))
}, 120_000)

describe('HR admin', () => {
  it('sees every entry with its chain fields, newest first, and the chain checks out', () => {
    const m = auditModel(sampleCtx('hr-admin', { audit: log }))
    expect(m.entries.rows).toHaveLength(7)
    expect(m.chainOk).toBe(true)
    expect(m.chainStatus).toBe('Chain checks out (7 entries)')
    expect(m.chainNote).toBe('Each entry carries a checksum of the one before it, so damage shows.')
    expect(m.entries.columns[0].key).toBe('sequence')
    const ats = m.entries.rows.map((r) => r.at)
    expect([...ats].sort().reverse()).toEqual(ats)
    expect((m.entries.rows[0] as AuditEntry).hash).toMatch(/^sha256-/)
    expect(resolveDrill(m.kpis[0].drill)?.rows).toHaveLength(7)
  })

  it('finds a changed entry', () => {
    const changed = log.map((e, i) => (i === 2 ? { ...e, new: 'E1' } : e))
    const m = auditModel(sampleCtx('hr-admin', { audit: changed }))
    expect(m.chainOk).toBe(false)
    expect(m.chainStatus).toBe('The chain breaks at entry 3.')
  })
})

describe('every other mode', () => {
  it('sees rows with no chain fields, counted as "n entries", pay and cost values as "changed"', () => {
    for (const mode of ['hrbp', 'leader', 'finance', 'manager'] as const) {
      const m = auditModel(sampleCtx(mode, { audit: log }))
      expect(m.chainOk, mode).toBeNull()
      expect(m.chainNote, mode).toBeNull()
      const n = m.entries.rows.length
      expect(m.chainStatus, mode).toBe(`${n} ${n === 1 ? 'entry' : 'entries'}`)
      expect(m.kpis[0].value, mode).toBe(n)
      expect(
        m.entries.columns.map((c) => c.key),
        mode,
      ).not.toContain('sequence')
      for (const r of m.entries.rows) {
        for (const k of ['seq', 'prevHash', 'hash']) expect(Object.keys(r), `${mode} ${k}`).not.toContain(k)
        if (r.field === 'band') expect([r.old, r.new], mode).toEqual(['changed', 'changed'])
      }
    }
  })

  it('keeps to the scope: the HRBP sees its unit and the company entries, not another unit’s', () => {
    const m = auditModel(sampleCtx('hrbp', { audit: log }))
    const ids = m.entries.rows.map((r) => `${r.object}:${r.id}`)
    expect(ids).toContain('target:FY28|Silicon Engineering|||')
    expect(ids).toContain('cycle:cycle-fy28')
    expect(ids).not.toContain('position:P-2052')
    expect(ids).not.toContain('request:R-1038')
  })

  it('never shows Manager C an entry of the elimination of their own seat (rule 3)', () => {
    const s = sampleOnce()
    const c = s.personas.find((p) => p.key === 'manager-c')!
    const picks = { ...picksOf(), manager: { personId: c.employeeId, name: c.name } }
    const m = auditModel(sampleCtx('manager', { picks, audit: log }))
    expect(m.entries.rows.some((r) => r.id === eliminationId)).toBe(false)
  })

  it('shows Finance only the state of a limited request, with the person as "Requester" (rule 2)', () => {
    const m = auditModel(sampleCtx('finance', { audit: log }))
    const rows = m.entries.rows.filter((r) => r.id === eliminationId)
    expect(rows.map((r) => r.field)).toEqual(['state'])
    expect(rows[0]).toMatchObject({
      by: 'Requester',
      byName: 'Requester',
      comment: null,
      effectiveDate: null,
    })
  })

  it('never brings an approvers-only comment with an amount to Manager mode (rule 5)', () => {
    const m = auditModel(sampleCtx('manager', { audit: log }))
    const row = m.entries.rows.find((r) => r.id === 'R-1038')
    expect(row).toBeDefined()
    expect(row?.comment).toBeNull()
    expect(JSON.stringify(m.entries.rows)).not.toContain('$95k')
  })

  it('shows nobody’s rows while the pick is to be made', () => {
    const picks = { ...picksOf(), hrbp: null }
    const m = auditModel(sampleCtx('hrbp', { picks, audit: log }))
    expect(m.entries.rows).toEqual([])
    expect(m.entries.empty).toMatch(/Pick who you act as/)
  })
})

describe('Manager mode (the Audit page hidden): only what the position card and requests show', () => {
  let managerLog: AuditEntry[]
  let treeSeat: string
  beforeAll(() => {
    const s = sampleOnce()
    treeSeat = s.planted.managerAOpen
    const cycle = s.plan.cycles.find((c) => c.cycleId === 'cycle-fy28') ?? null
    const cut = cycleTransition(
      cycle,
      { kind: 'cut', businessUnit: 'Silicon Engineering', afterHeads: 40 } as never,
      { personId: 'E10513', name: 'An HRBP', mode: 'hrbp' } as never,
      '2026-09-27T09:00',
    )
    const cutDrafts = 'audit' in cut ? cut.audit : []
    expect(cutDrafts.length).toBeGreaterThan(0)
    const drafts: AuditDraft[] = [
      draft({
        object: 'assumption',
        id: 'fy27-working|band|P3|A|FY27',
        field: 'value',
        old: 95_000,
        new: 98_000,
        mode: 'finance',
      }),
      draft({
        object: 'assumption',
        id: 'fy27-working|attrition|Silicon Engineering',
        field: 'value',
        old: 0.08,
        new: 0.11,
        mode: 'finance',
      }),
      ...cutDrafts,
      draft({
        object: 'version',
        id: 'fy27-q1-reforecast',
        field: 'state',
        old: 'working',
        new: 'locked',
        mode: 'finance',
      }),
      draft({
        object: 'freeze',
        id: s.datasets.freezes[0].freezeId,
        field: 'endDate',
        old: null,
        new: '2026-12-31',
        mode: 'finance',
      }),
      draft({ object: 'close', id: '2026-09', field: 'state', old: null, new: 'closed', mode: 'finance' }),
      draft({
        object: 'position',
        id: treeSeat,
        at: '2026-09-28T10:00',
        field: 'plannedStart',
        old: '2026-11-01',
        new: '2027-01-04',
        mode: 'hrbp',
      }),
      draft({
        object: 'position',
        id: treeSeat,
        at: '2026-09-28T10:01',
        field: 'bandEstimate',
        old: 95_000,
        new: 98_000,
        mode: 'hrbp',
      }),
      draft({
        object: 'position',
        id: treeSeat,
        at: '2026-09-28T10:02',
        field: 'note',
        old: null,
        new: 'Moved, EUR 4,000 more',
        mode: 'hrbp',
      }),
    ]
    managerLog = [...log]
    for (const d of drafts) managerLog.push(appendEntry(managerLog.at(-1) ?? null, d))
  })

  it('keeps the tree’s own position and request entries, and nothing about assumptions, targets, cycles, versions, closes, freezes or other units', () => {
    const ctx = sampleCtx('manager', { audit: managerLog })
    expect(ctx.access.can('page:audit')).toBe(false)
    const rows = auditModel(ctx).entries.rows
    expect(new Set(rows.map((r) => r.object))).toEqual(new Set(['position', 'request']))
    const scope = ctx.access.scope
    for (const r of rows) if (r.object === 'position') expect(scope?.positionIds.has(r.id), r.id).toBe(true)
    expect(rows.map((r) => r.id)).toContain('R-1038')
    expect(rows.filter((r) => r.id === treeSeat).map((r) => r.field)).toEqual([
      'note',
      'bandEstimate',
      'plannedStart',
    ])
    // The manager's own seat is never in the tree (8.2).
    expect(rows.some((r) => r.id === 'P-2052')).toBe(false)
    const text = JSON.stringify(rows)
    for (const needle of [
      '98000',
      '95000',
      '113300',
      'cutLine',
      'afterHeads',
      'Silicon Engineering',
      '4,000',
    ])
      expect(text, needle).not.toContain(needle)
  })

  it('reads every amount-like old or new value as "changed", whatever the field is called', () => {
    const rows = auditModel(sampleCtx('manager', { audit: managerLog })).entries.rows
    const of = (field: string) => rows.find((r) => r.id === treeSeat && r.field === field)
    expect([of('bandEstimate')?.old, of('bandEstimate')?.new]).toEqual(['changed', 'changed'])
    expect((of('bandEstimate') as AuditListRow | undefined)?.newText).toBe('changed')
    expect(of('note')?.new).toBe('changed')
    // Dates are not amounts.
    expect([of('plannedStart')?.old, of('plannedStart')?.new]).toEqual(['2026-11-01', '2027-01-04'])
  })

  it('control: the HRBP still sees the company’s entries the page shows', () => {
    const ids = auditModel(sampleCtx('hrbp', { audit: managerLog })).entries.rows.map(
      (r) => `${r.object}:${r.id}`,
    )
    expect(ids).toContain('cycle:cycle-fy28')
    expect(ids).toContain('version:fy27-q1-reforecast')
  })
})

describe('filters', () => {
  it('narrow the rows by record type, person and dates', () => {
    const m = auditModel(sampleCtx('hr-admin', { audit: log }))
    const rows = m.entries.rows
    expect(filterAuditRows(rows, NO_AUDIT_FILTERS)).toHaveLength(7)
    expect(filterAuditRows(rows, { ...NO_AUDIT_FILTERS, objects: ['request'] })).toHaveLength(3)
    expect(filterAuditRows(rows, { ...NO_AUDIT_FILTERS, people: ['Sebastian Wagner'] })).toHaveLength(1)
    expect(filterAuditRows(rows, { ...NO_AUDIT_FILTERS, from: '2026-09-22', to: '2026-09-25' })).toHaveLength(
      2,
    )
    expect(m.options.objects.map((o) => o.value)).toEqual([
      'position',
      'request',
      'assumption',
      'target',
      'cycle',
    ])
    expect(m.options.first).toBe('2026-09-14')
    expect(m.options.last).toBe('2026-09-26')
  })

  it('narrow by the record, any case, and a blank record keeps every row', () => {
    const rows = auditModel(sampleCtx('hr-admin', { audit: log })).entries.rows
    expect(filterAuditRows(rows, { ...NO_AUDIT_FILTERS, record: 'p-2052' }).map((r) => r.id)).toEqual([
      'P-2052',
    ])
    expect(filterAuditRows(rows, { ...NO_AUDIT_FILTERS, record: '  ' })).toHaveLength(7)
    expect(isFilteringAudit({ ...NO_AUDIT_FILTERS, record: '  ' })).toBe(false)
    expect(isFilteringAudit({ ...NO_AUDIT_FILTERS, record: 'R-' })).toBe(true)
  })

  it('give the count that follows them from the engine, opening exactly the rows kept', () => {
    for (const mode of ['hr-admin', 'hrbp', 'finance'] as const) {
      const ctx = sampleCtx(mode, { audit: log })
      const m = auditModel(ctx)
      // With no filter the page shows the model's own figure and KPI.
      const plain = auditShown(ctx, NO_AUDIT_FILTERS)
      expect(plain.filtering, mode).toBe(false)
      expect(plain.kpis, mode).toBe(m.kpis)
      expect(plain.entries, mode).toBe(m.entries)
      const f: AuditFilters = { ...NO_AUDIT_FILTERS, objects: ['request', 'cycle'] }
      const s = auditShown(ctx, f)
      const kept = filterAuditRows(m.entries.rows, f)
      expect(s.filtering, mode).toBe(true)
      expect(s.entries.rows, mode).toEqual(kept)
      expect(s.kpis[0].value, mode).toBe(kept.length)
      expect(resolveDrill(s.kpis[0].drill)?.rows, mode).toEqual(kept)
      expect(s.kpis[0].note, mode).toMatch(/^Of \d+ entr(y|ies)$/)
      expect(s.entries.subtitle, mode).toContain(`${kept.length} of ${m.entries.rows.length}`)
      // The chain status stays the model's: the filters never change what the check reads.
      expect(m.chainStatus, mode).toBe(auditModel(ctx).chainStatus)
      // Cached per context and filters.
      expect(auditShown(ctx, { ...f, objects: ['cycle', 'request'] }), mode).toBe(s)
    }
    const none = auditShown(sampleCtx('hr-admin', { audit: log }), { ...NO_AUDIT_FILTERS, record: 'nothing' })
    expect(none.entries.rows).toEqual([])
    expect(none.kpis[0].value).toBe(0)
    expect(none.entries.empty).toBe('No entry matches these filters. Clear a filter to see more.')
  })
})
