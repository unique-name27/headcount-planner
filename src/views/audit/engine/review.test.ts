/**
 * The Audit page after the M3 review (docs/PLAN.md 9.4, 10.7, 14.3; findings B7, UI-14, IN-10, PV-5):
 *
 *  - a chain of steps reads with role words and names ("HRBP Zhiwei Zhou, Leader ..."), never
 *    employee IDs, on the page, in its export rows and in a Shareable file; a person field reads the
 *    person's name; a limited view still holds no name (8.4 rule 7);
 *  - the Field column reads each field in words ("Manager seat", "Step 3"), never a raw id;
 *  - values read in plain words (a record's parts, a list's items, Yes and No);
 *  - HR admin's chain check reads the log against the plan state's chain head, so a lost tail shows
 *    as "The chain breaks at entry n.";
 *  - an approval's position entries belong to its request through the request's own entries with the
 *    same `at`, however the request changed later.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Sample } from '@/data/sample'
import { workerNames } from '@/drill/seats'
import { AUDIT_FIELDS } from '@/plan/audit/fields'
import { fromRow } from '@/plan/engine/requests'
import type { AuditEntry, HcRequest } from '@/plan/types'
import { MemoryStorage } from '@/testkit/memoryStorage'
import {
  auditDraft,
  auditLog,
  ctxAs,
  leakSample,
  PINNED_AT,
  personaCtx,
  sampleCtx,
  withPlan,
} from '@/testkit/sample'
import { shareableFile } from '@/views/data/engine/workspace'
import { type AuditListRow, auditModel, requestOfEntry, valueText } from './index'
import { chainWithNames, FIELD_LABEL, fieldLabel } from './labels'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
let r1038: HcRequest
let chain: string
beforeAll(() => {
  s = leakSample()
  r1038 = fromRow(s.datasets.requests.find((r) => r.requestId === 'R-1038') as never)
  chain = r1038.steps.map((x) => `${x.role} ${x.approverId}`).join(', ')
}, 120_000)

describe('names, not employee IDs, in audit values (B7)', () => {
  it('reads a chain of steps as role words and names on the page and in a Shareable file', () => {
    expect(chain).toMatch(/^hrbp E\d+, leader E\d+, finance E\d+$/)
    const names = workerNames(sampleCtx('hr-admin'))
    const named = r1038.steps
      .map(
        (x) =>
          `${{ hrbp: 'HRBP', leader: 'Leader', finance: 'Finance', manager: 'Manager' }[x.role]} ${names.get(x.approverId)}`,
      )
      .join(', ')
    const log = auditLog([
      auditDraft({ object: 'request', id: 'R-1038', field: 'steps', old: null, new: chain, mode: 'manager' }),
      auditDraft({
        object: 'request',
        id: 'R-1038',
        field: 'submittedById',
        old: null,
        new: r1038.requesterId,
      }),
    ])
    const hrbpId = r1038.steps.find((x) => x.role === 'hrbp')?.approverId as string
    for (const ctx of [
      sampleCtx('hr-admin', { audit: log }),
      ctxAs('hrbp', hrbpId, { audit: log, unit: r1038.businessUnit }),
    ]) {
      const rows = auditModel(ctx).entries.rows as unknown as AuditListRow[]
      const steps = rows.find((r) => r.field === 'steps')
      expect(steps?.new, ctx.mode).toBe(named)
      expect(steps?.newText, ctx.mode).toBe(named)
      expect(steps?.fieldLabel, ctx.mode).toBe('Approval steps')
      expect(JSON.stringify(rows), ctx.mode).not.toMatch(/\bE1\d{4}\b/)
      const by = rows.find((r) => r.field === 'submittedById')
      expect(by?.new, ctx.mode).toBe(names.get(r1038.requesterId))
    }
    // The file carries the page's rows: names, never the IDs.
    const file = shareableFile(sampleCtx('hr-admin', { audit: log }), PINNED_AT)
    if (!file.ok) throw new Error(file.refused)
    const plan = file.out.file.body.plan
    if (plan.kind !== 'shareable') throw new Error('not shareable')
    expect(plan.audit.find((r) => r.field === 'steps')?.new).toBe(named)
    expect(file.out.text).not.toContain(chain)
  })

  it('leaves a named chain as it is, and keeps an ID the data does not name', () => {
    const nameOf = (id: string) => (id === 'E1' ? 'Dana Ito' : null)
    expect(chainWithNames('hrbp E1, leader E2', nameOf)).toBe('HRBP Dana Ito, Leader E2')
    expect(chainWithNames('HRBP Dana Ito, Leader E2', nameOf)).toBe('HRBP Dana Ito, Leader E2')
  })
})

describe('fields and values in words (UI-14)', () => {
  it('labels every field the write path writes, in sentence case, and the patterns', () => {
    for (const [object, def] of Object.entries(AUDIT_FIELDS))
      for (const f of def.fields) {
        if (f.includes('<')) continue
        expect(FIELD_LABEL[f], `${object}.${f}`).toBeTruthy()
        expect(FIELD_LABEL[f][0], f).toBe(FIELD_LABEL[f][0].toUpperCase())
        expect(FIELD_LABEL[f].slice(1), f).not.toMatch(/[A-Z][a-z]/)
      }
    expect(fieldLabel('managerPositionId')).toBe('Manager seat')
    expect(fieldLabel('step 3')).toBe('Step 3')
    expect(fieldLabel('cutLine Silicon Engineering')).toBe('Cut line, Silicon Engineering')
    expect(fieldLabel('order Operations')).toBe('Ranked order, Operations')
    expect(fieldLabel('someNewField')).toBe('Some new field')
  })

  it('shows the Field column in words and values in plain words', () => {
    const log = auditLog([
      auditDraft({ object: 'position', id: 'P-1001', field: 'managerPositionId', old: 'P-1', new: 'P-2' }),
    ])
    const m = auditModel(sampleCtx('hr-admin', { audit: log }))
    const field = m.entries.columns.find((c) => c.label === 'Field')
    expect(field?.key).toBe('fieldLabel')
    expect((m.entries.rows[0] as unknown as { fieldLabel: string }).fieldLabel).toBe('Manager seat')
    expect(valueText({ merged: 14, files: 6 })).toBe('merged 14, files 6')
    expect(valueText(['R-1035', 'R-1040'])).toBe('R-1035, R-1040')
    expect(valueText(true)).toBe('Yes')
    expect(valueText(false)).toBe('No')
    expect(valueText({ savedAt: '2026-10-13T10:00', kind: 'full' })).toBe(
      'saved at 2026-10-13T10:00, kind full',
    )
  })
})

describe('a lost tail of the log shows in HR admin (IN-10)', () => {
  it('breaks the chain where the plan state says the log should go on', () => {
    const log = auditLog(
      [1, 2, 3, 4, 5].map((n) => auditDraft({ object: 'request', id: `R-${n}`, field: 'state' })),
    )
    const head = { seq: 5, hash: log[4].hash }
    const whole = auditModel(sampleCtx('hr-admin', { audit: log, sample: withPlan(s, { auditHead: head }) }))
    expect([whole.chainOk, whole.chainStatus]).toEqual([true, 'Chain checks out (5 entries)'])
    // The last chunk lost two entries: what is left still links, but the head says there were five.
    const cut = auditModel(
      sampleCtx('hr-admin', { audit: log.slice(0, 3), sample: withPlan(s, { auditHead: head }) }),
    )
    expect([cut.chainOk, cut.chainStatus]).toEqual([false, 'The chain breaks at entry 4.'])
    // Outside HR admin the page counts rows and reads no chain.
    const hrbp = auditModel(
      personaCtx('hrbp-se', { audit: log.slice(0, 3), sample: withPlan(s, { auditHead: head }) }),
    )
    expect(hrbp.chainOk).toBeNull()
  })
})

describe('an approval’s position entries belong to its request by their shared `at` (PV-5)', () => {
  it('links a position entry to the request entry written with it, after the request changed', () => {
    // A pending Elimination: no position row of the sample's own carries its ID yet.
    const made = new Set(s.datasets.positions.map((p) => p.sourceRequestId).filter(Boolean))
    for (const p of s.plan.overlay.positions) if (p.sourceRequestId) made.add(p.sourceRequestId)
    const elim = fromRow(
      s.datasets.requests.find(
        (r) =>
          r.type === 'Elimination' &&
          (r.state === 'Submitted' || r.state === 'In review') &&
          !made.has(r.requestId),
      ) as never,
    )
    const seat = elim.positionId as string
    // The approval's entries share one `at`; the request changed again later (a comment).
    const at = '2026-09-30T09:00:00.000Z'
    const later = { ...elim, updatedAt: '2026-09-30T10:30:00.000Z' }
    const entries: AuditEntry[] = auditLog([
      auditDraft({
        at,
        object: 'request',
        id: elim.requestId,
        field: 'state',
        old: 'In review',
        new: 'Approved',
      }),
      auditDraft({ at, object: 'position', id: seat, field: 'status', old: 'Filled', new: 'Eliminated' }),
      auditDraft({
        at: '2026-09-30T09:05:00.000Z',
        object: 'position',
        id: seat,
        field: 'title',
        old: 'A',
        new: 'B',
      }),
    ])
    const of = requestOfEntry(sampleCtx('hr-admin'), [later], entries)
    expect(of(entries[1])?.requestId).toBe(elim.requestId)
    // A seat edit at another time is the seat's own.
    expect(of(entries[2])).toBeNull()
    // Without the log, the old minute rule cannot link it.
    expect(requestOfEntry(sampleCtx('hr-admin'), [later])(entries[1])).toBeNull()
  })
})
