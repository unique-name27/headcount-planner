/**
 * The Audit page after writes (docs/PLAN.md 10.7, 8.4 rules 6 and 7, 9.4; M3), with the entries the
 * write path appends (src/app/write/scenario.testkit.ts over the sample, each step acted by its own
 * person) and hand-built ones for the kinds a scenario does not reach cheaply:
 *
 *  - HR admin reads "Chain checks out (n entries)" over the whole log, with every chain field;
 *  - every other mode reads "n entries", counted over the rows it can see (the KPI opens exactly
 *    them), and no row carries `seq`, `prevHash` or `hash`; Manager mode (the page hidden) keeps only
 *    its own requests' rows;
 *  - the page's KPI and figure read no dataset field (entries are plan state, B4);
 *  - outside HR admin, Import requests' counts and a month close's number of back-dated adjustments
 *    read "changed", a cycle's ranked order lists only the requests the viewer may see, and a
 *    reconciliation review of a person keeps to the scope; HR admin reads each as written (control).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CHANGED } from '@/access/visibility'
import { chainOk, deciderOf, scenario, type Who } from '@/app/write/scenario.testkit'
import type { Sample } from '@/data/sample'
import { sampleRequestFilesOf } from '@/data/sample/raw/sampleFiles'
import { resolveDrill } from '@/drill/types'
import { CHAIN_NOTE, entryCountText } from '@/plan/audit/chain'
import type { AuditEntry, AuditRow } from '@/plan/types'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { auditDraft, auditLog, ctxAs, leakSample, personaCtx, personaOf, sampleCtx } from '@/testkit/sample'
import { importRequestsPreview } from '@/views/data/engine/workspace'
import { auditModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

/** A request ID in a notice: the sample's ("R-1035"), or a new one under the workspace's tag ("R-K7QM-1371", D-ID). */
const idOf = (text: string): string => /R-(?:[0-9A-HJKMNP-TV-Z]{4}-)?\d+/.exec(text)?.[0] ?? ''
const CHAIN_KEYS = ['seq', 'prevHash', 'hash'] as const

describe('the Audit page after a request is drafted, submitted and approved', () => {
  it('counts "n entries" over the rows each mode sees; only HR admin reads the chain', async () => {
    const sc = scenario()
    const a = personaOf(s, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const draft = await sc.run(mgr, 'createRequest', {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-01-04',
      reasonCode: 'Growth',
      jobTitle: 'Account Executive',
    })
    const id = idOf(draft.outcome.ok ? draft.outcome.notice : '')
    expect((await sc.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const req = await sc.request(id)
    const hrbp = deciderOf(s, req as never)
    expect((await sc.run(hrbp, 'approveRequest', { requestId: id })).outcome.ok).toBe(true)
    const log = await sc.log()
    expect(log.length).toBeGreaterThan(3)
    expect(chainOk(log)).toBe(true)

    // HR admin: every entry, with the chain, and the chain checks out.
    const admin = auditModel(
      await sc.ctx({ mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }),
    )
    expect(admin.entries.rows).toHaveLength(log.length)
    expect(admin.chainStatus).toBe(`Chain checks out (${entryCountText(log.length)})`)
    expect([admin.chainOk, admin.chainNote]).toEqual([true, CHAIN_NOTE])
    expect(admin.chainNote).toBe('Each entry carries a checksum of the one before it, so damage shows.')
    for (const k of CHAIN_KEYS) expect(k in admin.entries.rows[0]).toBe(true)

    // Every other mode: "n entries" over its own rows, never a chain field.
    const viewers: Who[] = [
      mgr,
      hrbp,
      { mode: 'leader', personId: (req?.steps[1]?.approverId as string) ?? '' },
      { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId },
    ]
    for (const who of viewers) {
      const m = auditModel(await sc.ctx(who))
      const n = m.entries.rows.length
      expect(n, who.mode).toBeGreaterThan(0)
      expect(n, who.mode).toBeLessThanOrEqual(log.length)
      expect(m.chainStatus, who.mode).toBe(entryCountText(n))
      expect([m.chainOk, m.chainNote], who.mode).toEqual([null, null])
      expect(m.kpis[0].value, who.mode).toBe(n)
      expect(resolveDrill(m.kpis[0].drill)?.rows, who.mode).toHaveLength(n)
      for (const row of m.entries.rows)
        for (const k of CHAIN_KEYS) expect(k in row, `${who.mode} ${k}`).toBe(false)
      expect(
        m.entries.rows.every((r) => r.id === id || r.object !== 'request'),
        who.mode,
      ).toBe(true)
    }
    // Manager mode keeps only its own request's rows; another manager sees none of them.
    const own = auditModel(await sc.ctx(mgr)).entries.rows
    expect(own.every((r) => r.object === 'request' && r.id === id)).toBe(true)
    const b = personaOf(s, 'manager-b')
    const other = auditModel(await sc.ctx({ mode: 'manager', personId: b.employeeId })).entries.rows
    expect(other.filter((r) => r.id === id)).toEqual([])
    // B4: audit entries are plan state; the KPI and the figure read no dataset field.
    expect([admin.kpis[0].uses, admin.entries.uses]).toEqual([[], []])
  }, 300_000)
})

describe('counts and IDs the viewer may not see', () => {
  it('reads Import requests’ counts as "changed" outside HR admin', async () => {
    const sc = scenario()
    const adminWho: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const files = importRequestsPreview(await sc.ctx(adminWho), sampleRequestFilesOf(s).named).files
    expect((await sc.run(adminWho, 'importRequests', { files })).outcome.ok).toBe(true)
    const entryOf = (rows: readonly AuditRow[]) => rows.find((r) => r.field === 'requests merged')
    const admin = entryOf(auditModel(await sc.ctx(adminWho)).entries.rows)
    expect(admin?.new).toEqual({ merged: 14, files: 6, conflicts: 2, skipped: 0 })
    for (const key of ['hrbp-se', 'leader-svp-se', 'finance-fpa'] as const) {
      const p = personaOf(s, key)
      const who: Who = {
        mode: p.mode,
        personId: p.employeeId,
        ...(key === 'hrbp-se' ? { unit: 'Silicon Engineering' } : {}),
      }
      const row = entryOf(auditModel(await sc.ctx(who)).entries.rows)
      expect(row, key).toBeTruthy()
      expect([row?.new, row?.old], key).toEqual([CHANGED, null])
    }
  }, 300_000)

  it('reads a close’s adjustment count as "changed", lists only visible requests in a ranked order, scopes a review', () => {
    const hrbpCtx = personaCtx('hrbp-se')
    const elim = s.planted.managerCElimination
    const seRequest = s.datasets.requests.find((r) => r.businessUnit === 'Silicon Engineering')
      ?.requestId as string
    const outside = s.datasets.workers.find(
      (w) => w.positionId && !hrbpCtx.access.scope?.positionIds.has(w.positionId) && !w.terminationDate,
    )?.employeeId as string
    const inside = s.datasets.workers.find(
      (w) => w.positionId && hrbpCtx.access.scope?.positionIds.has(w.positionId) && !w.terminationDate,
    )?.employeeId as string
    const log: AuditEntry[] = auditLog([
      auditDraft({ object: 'close', id: '2026-10', field: 'adjustments', new: 3, mode: 'finance' }),
      auditDraft({
        object: 'cycle',
        id: 'cycle-fy28',
        field: 'order Operations',
        old: null,
        new: [elim, seRequest],
      }),
      auditDraft({
        object: 'workspace',
        id: outside,
        field: 'reviewed',
        new: 'not-in-plan',
        mode: 'finance',
      }),
      auditDraft({ object: 'workspace', id: inside, field: 'reviewed', new: 'not-in-plan', mode: 'finance' }),
    ])
    const rows = (ctx: ReturnType<typeof sampleCtx>) => auditModel(ctx).entries.rows
    const hrbp = rows(personaCtx('hrbp-se', { audit: log }))
    expect(hrbp.find((r) => r.field === 'adjustments')?.new).toBe(CHANGED)
    expect(hrbp.find((r) => r.field === 'order Operations')?.new).toEqual([seRequest])
    expect(hrbp.filter((r) => r.field === 'reviewed').map((r) => r.id)).toEqual([inside])
    const finance = rows(personaCtx('finance-fpa', { audit: log }))
    expect(finance.find((r) => r.field === 'adjustments')?.new).toBe(CHANGED)
    // Control: HR admin reads each entry as it was written.
    const admin = rows(sampleCtx('hr-admin', { audit: log }))
    expect(admin.find((r) => r.field === 'adjustments')?.new).toBe(3)
    expect(admin.find((r) => r.field === 'order Operations')?.new).toEqual([elim, seRequest])
    expect(
      admin
        .filter((r) => r.field === 'reviewed')
        .map((r) => r.id)
        .sort(),
    ).toEqual([inside, outside].sort())
    // Manager C never reads any of them (the page is hidden in Manager mode).
    const c = personaOf(s, 'manager-c')
    expect(rows(ctxAs('manager', c.employeeId, { audit: log }))).toEqual([])
  })
})
