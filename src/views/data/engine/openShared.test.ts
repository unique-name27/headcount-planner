/**
 * "Open a shared file" and "Export for a manager" (docs/PLAN.md 5.5, 8.4, C30, 16.1 Manager C (b) and
 * (c), M2 review RM-3), with the app's own writers (./workspace.ts):
 *
 *  - an HRBP Shareable made with the confidential Elimination of Manager C's seat, opened in Manager
 *    mode acting as C (and as the manager below C), shows no ID, count, comment, audit row or amount
 *    of it: the view is the same as for the file made without it, under the note for a file made in
 *    another mode; the HRBP who made it reads it all (control);
 *  - a namesake manager opening another team's Shareable sees none of its figures, seats or requests,
 *    though the two teams share one label; the manager it was made for sees its figures (control);
 *  - Export for a manager for C gives byte-equal files with and without the Elimination, clean of
 *    amounts, and C opening one in Manager mode sees its figures (made for C's own view);
 *  - files that do not open say so: a damaged one ("Nothing was opened.") and a Full file;
 *  - an HRBP's Shareable with Manager C's approved Elimination and a later comment, opened on a
 *    workspace that holds no approval (review PV-5): the seat's position entries stay limited for
 *    Finance and an off-chain Leader, and out for Manager C; the HRBP reads them in full;
 *  - the same when the approval came into the HRBP's workspace by Import requests or by HR admin's
 *    Merge of a Full file (M3 recheck, D-MERGE): the import writes the request's own entry beside
 *    the seat's, so an opener reads the seat's entries as the request allows.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { MODE_LABEL } from '@/access/modes'
import { planInForce } from '@/app/planState'
import { approveAll, hrbpUnitOf, scenario, type Who } from '@/app/write/scenario.testkit'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { fromRow } from '@/plan/engine/requests'
import type { AuditEntry, HcRequest } from '@/plan/types'
import { FIGURES_NOT_HERE_NOTE, managerForeignNote } from '@/plan/workspace/shared'
import { DAMAGED_TEXT } from '@/plan/workspace/validate'
import { amountsIn } from '@/testkit/leaks'
import { MemoryStorage } from '@/testkit/memoryStorage'
import {
  auditDraft,
  auditLog,
  ctxAs,
  leakSample,
  PINNED_AT,
  personaCtx,
  personaOf,
  requestsOfPerson,
  sampleCtx,
  withoutRequest,
  withPlanRequests,
  withWorker,
} from '@/testkit/sample'
import {
  FULL_NOT_OPENED_ADMIN_TEXT,
  FULL_NOT_OPENED_TEXT,
  forManagerFile,
  fullFile,
  managersForExport,
  openSharedFile,
  readFile,
  requestsFile,
  type SharedFileView,
  shareableFile,
} from './workspace'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

const textOf = (r: ReturnType<typeof shareableFile>): string => {
  if (!r.ok) throw new Error(r.refused)
  return r.out.text
}
const open = (ctx: AnalyticsContext, text: string): SharedFileView => {
  const r = openSharedFile(ctx, text, text.length)
  if (!r.ok) throw new Error(r.reason)
  return r.view
}
/** Every string a view holds, for the scans. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) for (const x of v) strings(x, out)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out)
  return out
}
const holds = (v: unknown, needle: string) => JSON.stringify(v).includes(needle)

describe('an HRBP Shareable opened in Manager mode acting as Manager C (16.1 (b))', () => {
  const elimId = () => s.planted.managerCElimination

  /** The sample with comments and an audit entry on the Elimination, and without it. */
  function pair() {
    const elim = fromRow(s.datasets.requests.find((r) => r.requestId === elimId()) as never)
    const hrbp = elim.steps.find((x) => x.role === 'hrbp')?.approverId as string
    const withComments: HcRequest = {
      ...elim,
      comments: [
        {
          id: 'ws-e1',
          at: `${s.asOf}T08:00:00.000Z`,
          by: elim.requesterId,
          mode: 'manager',
          text: 'Seat goes with the reorg',
          audience: 'everyone',
        },
        {
          id: 'ws-e2',
          at: `${s.asOf}T08:10:00.000Z`,
          by: hrbp,
          mode: 'hrbp',
          text: 'Severance near €140,000',
          audience: 'approvers',
        },
      ],
    }
    const audit: AuditEntry[] = auditLog([
      auditDraft({
        object: 'request',
        id: elimId(),
        field: 'state',
        old: 'Submitted',
        new: 'In review',
        by: hrbp,
        mode: 'hrbp',
        comment: 'Seat goes with the reorg',
        commentAudience: 'everyone',
      }),
    ])
    const withIt = withPlanRequests(s, [withComments])
    const without = withoutRequest(withIt, elimId(), audit)
    return { withIt, audit, without: without.sample, auditWithout: without.audit, elim, hrbp }
  }

  it('shows nothing of the Elimination: the same view as the file made without it', () => {
    const p = pair()
    const unit = p.elim.businessUnit
    const fileOf = (x: Sample, audit: readonly AuditEntry[]) =>
      textOf(shareableFile(ctxAs('hrbp', p.hrbp, { sample: x, audit, unit }), PINNED_AT))
    const withFile = fileOf(p.withIt, p.audit)
    const withoutFile = fileOf(p.without, p.auditWithout)
    // Control: the HRBP's file carries the Elimination, its comments and its audit row.
    expect(withFile).toContain(elimId())
    expect(withFile).toContain('Severance near')
    expect(withFile).not.toBe(withoutFile)
    const c = personaOf(s, 'manager-c')
    const below = s.datasets.workers.find(
      (w) =>
        w.positionId &&
        s.datasets.positions.some((q) => q.managerPositionId === w.positionId) &&
        s.datasets.positions.some(
          (q) => q.positionId === w.positionId && q.managerPositionId === c.positionId,
        ),
    )?.employeeId as string
    expect(below).toBeTruthy()
    for (const who of [c.employeeId, below]) {
      const asWho = ctxAs('manager', who, { sample: p.without, audit: p.auditWithout })
      const a = open(asWho, withFile)
      const b = open(asWho, withoutFile)
      expect(JSON.stringify(a), who).toBe(JSON.stringify(b))
      expect(holds(a, elimId()), who).toBe(false)
      for (const word of ['Severance', 'reorg']) expect(holds(a, word), `${who} ${word}`).toBe(false)
      expect(
        strings(a).flatMap((t) => amountsIn(t)),
        who,
      ).toEqual([])
      expect([a.figuresShown, a.figures, a.madeIn], who).toEqual([false, null, 'hrbp'])
      expect(a.note).toBe(managerForeignNote(MODE_LABEL.hrbp))
      expect(a.note).toBe(
        'This file was made in HRBP mode and holds more than Manager mode shows. Ask for one made for your team.',
      )
    }
    // Control: the HRBP who made it reads the Elimination, its comments and its audit row.
    const asHrbp = ctxAs('hrbp', p.hrbp, { sample: p.without, audit: p.auditWithout, unit })
    const own = open(asHrbp, withFile)
    expect(own.requests.some((r) => r.requestId === elimId())).toBe(true)
    expect(own.comments.map((x) => x.comment.text)).toContain('Severance near €140,000')
    expect(own.audit.some((r) => r.id === elimId())).toBe(true)
    expect(JSON.stringify(own)).not.toBe(JSON.stringify(open(asHrbp, withoutFile)))
    expect([own.figuresShown, own.note]).toEqual([true, null])
    expect(Object.keys(own.figures ?? {}).length).toBeGreaterThan(3)
  }, 300_000)

  it('gives byte-equal Export for a manager files for C, clean of amounts, that C reads in full (16.1 (c))', () => {
    const p = pair()
    const unit = p.elim.businessUnit
    const c = personaOf(s, 'manager-c')
    const fileOf = (x: Sample, audit: readonly AuditEntry[]) => {
      const hrbp = ctxAs('hrbp', p.hrbp, { sample: x, audit, unit })
      expect(managersForExport(hrbp).map((m) => m.personId)).toContain(c.employeeId)
      return textOf(forManagerFile(hrbp, c.employeeId, PINNED_AT))
    }
    const a = fileOf(p.withIt, p.audit)
    const b = fileOf(p.without, p.auditWithout)
    expect(a).toBe(b)
    expect(a).not.toContain(elimId())
    expect(strings(JSON.parse(a).body).flatMap((t) => amountsIn(t))).toEqual([])
    const asC = ctxAs('manager', c.employeeId, { sample: p.withIt, audit: p.audit })
    const seen = open(asC, a)
    expect([seen.madeIn, seen.figuresShown, seen.note]).toEqual(['manager', true, null])
    expect(Object.keys(seen.figures ?? {}).length).toBeGreaterThan(0)
    expect(holds(seen, elimId())).toBe(false)
  }, 300_000)
})

describe('a namesake manager opens another team’s Shareable (review RM-3)', () => {
  it('shows none of its figures, seats or requests; the manager it was made for sees them', () => {
    const a = personaOf(s, 'manager-a')
    const b = personaOf(s, 'manager-b')
    const name = s.datasets.workers.find((w) => w.employeeId === a.employeeId)?.name as string
    const twin = withWorker(s, b.employeeId, { name })
    const asA = ctxAs('manager', a.employeeId, { sample: twin })
    const asB = ctxAs('manager', b.employeeId, { sample: twin })
    expect(asB.scopeLabel).toBe(asA.scopeLabel)
    const fileA = textOf(shareableFile(asA, PINNED_AT))
    const onlyA = [...(asA.access.scope?.positionIds ?? [])].filter(
      (id) => !asB.access.scope?.positionIds.has(id),
    )
    const requestsOfA = requestsOfPerson(twin, a.employeeId).map((r) => r.requestId)
    expect(onlyA.length).toBeGreaterThan(0)
    expect(requestsOfA.length).toBeGreaterThan(0)
    const opened = open(asB, fileA)
    expect([opened.figuresShown, opened.figures, opened.note]).toEqual([false, null, FIGURES_NOT_HERE_NOTE])
    for (const id of [...onlyA, ...requestsOfA]) expect(holds(opened, `"${id}"`), id).toBe(false)
    // Control: the manager the file was made for reads its figures and seats.
    const own = open(asA, fileA)
    expect(own.figuresShown).toBe(true)
    expect(Object.keys(own.figures ?? {}).length).toBeGreaterThan(0)
    expect(onlyA.some((id) => holds(own, `"${id}"`))).toBe(true)
    expect(own.requests.some((r) => requestsOfA.includes(r.requestId))).toBe(true)
  }, 300_000)
})

describe('files that open to read, and files that do not', () => {
  it('reads a Requests file with no word about figures, and refuses a damaged or Full file', () => {
    const a = personaOf(s, 'manager-a')
    const asA = ctxAs('manager', a.employeeId)
    const req = textOf(requestsFile(asA, PINNED_AT))
    const seen = open(asA, req)
    expect([seen.kind, seen.figuresShown, seen.note]).toEqual(['requests', false, null])
    expect(seen.requests.length).toBeGreaterThan(0)
    // The HRBP opening the manager's Requests file: rows as the HRBP's own rules show them.
    const hrbp = sampleCtx('hrbp')
    expect(open(hrbp, req).note).toBeNull()
    const raw = JSON.parse(req)
    raw.body.plan.requests[0].jobTitle = 'Changed by hand'
    const damaged = JSON.stringify(raw)
    const r = openSharedFile(asA, damaged, damaged.length)
    expect(r).toEqual({
      ok: false,
      reason: DAMAGED_TEXT.replace('Nothing was imported.', 'Nothing was opened.'),
    })
    const full = fullFile(sampleCtx('hr-admin', { showPay: true }), PINNED_AT)
    if (!full.ok) throw new Error(full.refused)
    expect(openSharedFile(asA, full.out.text, full.out.text.length)).toEqual({
      ok: false,
      reason: FULL_NOT_OPENED_TEXT,
    })
    expect(openSharedFile(sampleCtx('hr-admin'), full.out.text, full.out.text.length)).toEqual({
      ok: false,
      reason: FULL_NOT_OPENED_ADMIN_TEXT,
    })
  }, 300_000)
})

describe('a Shareable opened on another workspace after a later comment (review PV-5)', () => {
  it('keeps every position entry of a limited Elimination limited, or out, for every opener', async () => {
    const sc = scenario()
    const c = personaOf(s, 'manager-c')
    const elim = s.planted.managerCElimination
    const steps = await approveAll(sc, elim)
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.every((x) => x.outcome.ok)).toBe(true)
    const req = await sc.request(elim)
    const hrbpId = req?.steps.find((x) => x.role === 'hrbp')?.approverId as string
    const hrbp: Who = { mode: 'hrbp', personId: hrbpId, unit: req?.businessUnit }
    // A later comment moves the request's updatedAt past its approval's entries.
    const later = await sc.run(hrbp, 'commentOnRequest', {
      requestId: elim,
      text: 'Payroll has the last day',
      audience: 'everyone',
    })
    expect(later.outcome.ok).toBe(true)
    const text = textOf(shareableFile(await sc.ctx(hrbp), PINNED_AT))
    // The HRBP who made it reads the seat's rows in full (control).
    const own = open(await sc.ctx(hrbp), text).audit.filter((r) => r.id === c.positionId)
    expect(own.some((r) => r.field === 'endDate' && r.effectiveDate !== null)).toBe(true)
    // Opened on the plain sample, which holds no approval: Finance and an off-chain Leader read the
    // Elimination as limited (state, seat, title, level, org; "Approver"; no date), never more.
    const LIMITED = new Set([
      'state',
      'status',
      'positionId',
      'title',
      'jobTitle',
      'level',
      'businessUnit',
      'department',
    ])
    for (const key of ['finance-fpa', 'leader-cfo'] as const) {
      const v = open(personaCtx(key), text)
      const rows = v.audit.filter((r) => r.id === c.positionId || r.id === elim)
      for (const r of rows) {
        expect(LIMITED.has(r.field), `${key} ${r.field}`).toBe(true)
        expect(['Approver', 'Requester'], `${key} ${r.byName}`).toContain(r.byName)
        expect(r.effectiveDate, key).toBeNull()
      }
      expect(
        rows.some((r) => r.field === 'endDate' || r.field === 'endReason'),
        key,
      ).toBe(false)
    }
    // Manager C reads nothing of it.
    expect(
      open(ctxAs('manager', c.employeeId), text).audit.filter((r) => r.id === c.positionId || r.id === elim),
    ).toEqual([])
  }, 300_000)
})

describe('a Shareable opened on another workspace after an imported approval (M3 recheck, PV-5)', () => {
  const LIMITED = new Set([
    'state',
    'status',
    'positionId',
    'title',
    'jobTitle',
    'level',
    'businessUnit',
    'department',
  ])

  /**
   * Finance and an off-chain Leader read the seat's and the request's entries limited (and some of the
   * seat's when `seatRows`), Manager C none.
   */
  function expectLimited(text: string, seat: string, id: string, seatRows: boolean) {
    const c = personaOf(s, 'manager-c')
    for (const key of ['finance-fpa', 'leader-cfo'] as const) {
      const v = open(personaCtx(key, { sample: s }), text)
      expect(v.requests.find((r) => r.requestId === id)?.view, key).toBe('limited')
      const rows = v.audit.filter((r) => r.id === seat || r.id === id)
      if (seatRows)
        expect(
          rows.some((r) => r.id === seat),
          key,
        ).toBe(true)
      for (const r of rows) {
        expect(LIMITED.has(r.field), `${key} ${r.field}`).toBe(true)
        expect(['Approver', 'Requester'], `${key} ${r.byName}`).toContain(r.byName)
        expect(r.effectiveDate, key).toBeNull()
        expect(r.comment, key).toBeNull()
      }
    }
    expect(
      open(ctxAs('manager', c.employeeId, { sample: s }), text).audit.filter(
        (r) => r.id === seat || r.id === id,
      ),
    ).toEqual([])
  }

  it('after Import requests, and after a Full file Merge', async () => {
    const elim = s.planted.managerCElimination
    const one = scenario({ idTag: 'AAAA' })
    const steps = await approveAll(one, elim)
    expect(steps.every((x) => x.outcome.ok)).toBe(true)
    const approved = (await one.request(elim)) as HcRequest
    const seat = approved.positionId as string
    const hrbpId = approved.steps.find((x) => x.role === 'hrbp')?.approverId as string
    const hrbp: Who = { mode: 'hrbp', personId: hrbpId, unit: hrbpUnitOf(s)(hrbpId) }

    // Import requests: the HRBP brings workspace one's approval into workspace two.
    const two = scenario({ idTag: 'BBBB' })
    const imp = await two.run(hrbp, 'importRequests', {
      files: [
        { name: 'ops.hcplan.json', kind: 'requests', requests: (await one.plan()).requests, skipped: 0 },
      ],
    })
    expect(imp.outcome.ok).toBe(true)
    // The import writes the request's own entry at the seat entries' moment.
    const own = imp.entries.find((e) => e.object === 'request' && e.id === elim)
    expect(own?.field).toBe('state')
    expect(
      imp.entries.filter((e) => e.object === 'position' && e.id === seat).every((e) => e.at === own?.at),
    ).toBe(true)
    expectLimited(textOf(shareableFile(await two.ctx(hrbp), PINNED_AT)), seat, elim, true)

    // HR admin's Merge of workspace one's Full file into a third workspace.
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const payCtx = async (sc: typeof one) =>
      sampleCtx('hr-admin', {
        sample: { ...s, plan: planInForce(await sc.harness.store.load(), s.plan) },
        audit: await sc.log(),
        showPay: true,
      })
    const full = fullFile(await payCtx(one), PINNED_AT)
    if (!full.ok) throw new Error(full.refused)
    const three = scenario({ idTag: 'CCCC' })
    const read = readFile(await payCtx(three), full.out.text, full.out.text.length)
    if (!read.ok) throw new Error(read.reason)
    const merged = await three.run(admin, 'mergeWorkspace', { file: read.file })
    expect(merged.outcome.ok).toBe(true)
    // The Full file's overlay carries the approval's rows, so the Merge writes no seat entry of its own.
    expectLimited(textOf(shareableFile(await three.ctx(hrbp), PINNED_AT)), seat, elim, false)
  }, 600_000)
})
