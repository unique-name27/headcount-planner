/**
 * The workspace files as the views make and read them (docs/PLAN.md 5.5, 8.3, 8.4, C30), per mode on
 * the sample, from the guarded models only:
 *
 *  - Export Shareable in every mode: the header names the mode and the view's scope identity, the
 *    file reads back, it holds the requests the view shows (a limited one cut to its seat), audit
 *    rows with no chain field, and the figures the mode shows; Manager-mode files hold no amount and
 *    no amount-like key;
 *  - Export requests: only requests whose view is 'full' for the exporter;
 *  - Export for a manager: the managers each mode may name (HRBP: the unit; Leader: the org, never
 *    the Leader's own seat; HR admin: everyone), refused in Manager and Finance mode with the
 *    policy's sentence, and a file made exactly as Manager mode acting as that manager;
 *  - the Full file: HR admin with Show pay amounts on only, "Contains individual pay" on its first
 *    line, under the 150 MB limit for Full files (C35) and still read back after two more locks,
 *    reading back with its diff and its audit log's chain check;
 *  - Import's refusals with their sentences (size, checksum, newer version, foreign format, a file
 *    that is not Full, the hash mismatch), and Replace and Merge through the write path, each one
 *    'workspace' entry signed by HR admin;
 *  - D-PAYFILES (review EX-2): a Shareable saved in HR admin with Show pay amounts on is the switch-off
 *    file byte for byte, with no pay column and no group under 5, and its save says so;
 *  - D-MODELINE (review CP-2): every Manager-mode file (own Shareable and Requests, Export for a
 *    manager from HRBP, Leader and HR admin) names the acting manager on its first line, and the
 *    line reads back only as written;
 *  - B9: the plan state set aside when the sample changed saves as a Full file.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { managerExportLine } from '@/access/copy'
import { decide } from '@/access/policy'
import { inScope } from '@/access/records'
import { requestView, viewerOf } from '@/access/visibility'
import { chainOk, scenario, type Who } from '@/app/write/scenario.testkit'
import type { AnalyticsContext } from '@/data/context'
import type { PersonaKey, Sample } from '@/data/sample'
import { requestsOf as requestsInForce } from '@/drill/seats'
import { WORKSPACE_MERGED_NOTICE, WORKSPACE_REPLACED_NOTICE } from '@/plan/actions/copy'
import { verifyClose } from '@/plan/engine/close'
import { isLocked, verifyLock } from '@/plan/engine/versions'
import type { HcRequest, WorkspaceFile } from '@/plan/types'
import {
  FULL_FILE_NOTICE,
  MAX_FULL_FILE_BYTES,
  MAX_WORKSPACE_BYTES,
  PERSONAL_FIELDS,
  WORKSPACE_EXTENSION,
  workspaceChecksum,
} from '@/plan/workspace/file'
import {
  brokenPartText,
  DAMAGED_TEXT,
  FOREIGN_TEXT,
  FULL_TOO_LARGE_TEXT,
  hashMismatchText,
  NEWER_TEXT,
  TOO_LARGE_TEXT,
} from '@/plan/workspace/validate'
import { amountsIn, isAmountKey } from '@/testkit/leaks'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ctxAs, leakSample, PINNED_AT, personaCtx, personaOf, sampleCtx } from '@/testkit/sample'
import { viewScopeKey } from './sharedFile'
import {
  EARLIER_SAMPLE_LABEL,
  earlierSampleFile,
  type FileResult,
  FULL_NEEDS_PAY_TEXT,
  fileModeLine,
  forManagerFile,
  fullFile,
  IMPORT_FULL_ONLY_TEXT,
  importPreview,
  MANAGER_NOT_LISTED_TEXT,
  managersForExport,
  openSharedFile,
  readFile,
  requestsFile,
  SHAREABLE_PAY_OFF_TEXT,
  savedNote,
  shareableFile,
} from './workspace'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

/** One context per persona and one Shareable file per context, shared by the cases below. */
const contexts = new Map<string, AnalyticsContext>()
const ctxOf = (key: PersonaKey): AnalyticsContext => {
  let c = contexts.get(key)
  if (!c) {
    c = personaCtx(key)
    contexts.set(key, c)
  }
  return c
}
const shareables = new Map<AnalyticsContext, FileResult>()
const shareableOf = (ctx: AnalyticsContext): FileResult => {
  let r = shareables.get(ctx)
  if (!r) {
    r = shareableFile(ctx, PINNED_AT)
    shareables.set(ctx, r)
  }
  return r
}

/** A figure snapshot's column flags (`money`, `band`, `pay`): descriptors, not values. */
const COLUMN_FLAG = /\.columns\[\d+\]\.(money|band|pay)$/

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

/** Every key and string of a value, with where it sits. */
function walk(v: unknown, path: string, out: { keys: string[]; strings: [string, string][] }) {
  if (typeof v === 'string') out.strings.push([path, v])
  else if (Array.isArray(v)) for (const [i, x] of v.entries()) walk(x, `${path}[${i}]`, out)
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.keys.push(`${path}.${k}`)
      walk(x, `${path}.${k}`, out)
    }
  return out
}

const lastKey = (p: string) => p.slice(p.lastIndexOf('.') + 1)
const parsed = (text: string) => JSON.parse(text) as WorkspaceFile & { body: { plan: Record<string, Json> } }
const PERSONAS = ['manager-a', 'hrbp-se', 'leader-svp-se', 'finance-fpa', 'hr-admin'] as const

describe('Export Shareable (export.shareable, every mode)', () => {
  it('writes what each mode’s view shows, under its scope identity, and reads back', () => {
    for (const key of PERSONAS) {
      const ctx = ctxOf(key)
      const r = shareableOf(ctx)
      expect(r.ok, key).toBe(true)
      if (!r.ok) continue
      const f = r.out.file
      expect([f.kind, f.mode, f.scopeLabel, f.actingAs], key).toEqual([
        'shareable',
        ctx.access.mode,
        ctx.scopeLabel,
        true,
      ])
      expect(f.scopeKey, key).toBe(viewScopeKey(ctx))
      // Only a Manager-mode file says something on saving: its mode line (D-MODELINE).
      expect(r.out.notice, key).toBe(key === 'manager-a' ? (f.modeLine ?? 'none') : null)
      expect(r.out.name.endsWith(WORKSPACE_EXTENSION)).toBe(true)
      expect(readFile(ctx, r.out.text, r.out.text.length).ok, key).toBe(true)
      const plan = f.body.plan
      if (plan.kind !== 'shareable') throw new Error('not a Shareable slice')
      // Figures: only what the mode shows, as on screen.
      expect(Object.keys(plan.models).length, key).toBeGreaterThan(3)
      for (const id of Object.keys(plan.models))
        expect(ctx.access.can(`figure:${id}`), `${key} ${id}`).toBe(true)
      // Requests: inside the scope and visible; a limited one cut to its seat.
      const viewer = viewerOf(ctx)
      const all = new Map(requestsInForce(ctx).map((q) => [q.requestId, q]))
      expect(plan.requests.length, key).toBeGreaterThan(0)
      for (const q of plan.requests) {
        const real = all.get(q.requestId) as HcRequest
        expect(inScope('requests', real, ctx), `${key} ${q.requestId}`).toBe(true)
        const view = requestView(real, viewer)
        expect(view, `${key} ${q.requestId}`).not.toBe('none')
        if (view === 'limited') expect([q.requesterId, q.comments, q.steps]).toEqual(['', [], []])
      }
      // Audit rows never carry a chain field, in any mode (a Shareable file holds rows).
      for (const row of plan.audit) for (const k of ['seq', 'prevHash', 'hash']) expect(k in row).toBe(false)
      // No pay or leave field outside the figures (the writer refuses one; checked again here).
      const { models: _m, ...rest } = plan
      const seen = walk(rest, 'plan', { keys: [], strings: [] })
      expect(
        seen.keys.filter((k) => PERSONAL_FIELDS.has(lastKey(k))),
        key,
      ).toEqual([])
    }
  }, 300_000)

  it('holds no amount and no amount-like key in Manager mode, Shareable and Requests alike', () => {
    for (const key of ['manager-a', 'manager-b', 'manager-c'] as const) {
      const ctx = ctxOf(key)
      for (const r of [shareableOf(ctx), requestsFile(ctx, PINNED_AT)]) {
        if (!r.ok) throw new Error(r.refused)
        const json = parsed(r.out.text)
        const seen = walk(json.body, 'body', { keys: [], strings: [] })
        expect(
          seen.strings.flatMap(([p, t]) => amountsIn(t).map((a) => `${p}: ${a}`)),
          `${key} ${json.kind}`,
        ).toEqual([])
        expect(
          seen.keys.filter((k) => !COLUMN_FLAG.test(k) && isAmountKey(lastKey(k))),
          `${key} ${json.kind}`,
        ).toEqual([])
        expect(r.out.text).not.toMatch(/[$€₹₪₫]/)
        // No figure in a Manager file keeps an amount column.
        if (json.body.plan.kind === 'shareable')
          for (const [id, m] of Object.entries(json.body.plan.models as Record<string, Json>))
            for (const c of (m as { columns: { money: boolean; pay: boolean; band: boolean }[] }).columns)
              expect([c.money, c.pay, c.band], `${key} ${id}`).toEqual([false, false, false])
      }
    }
  }, 300_000)

  it('control: Finance’s file carries amounts the Manager files never do', () => {
    const r = shareableOf(ctxOf('finance-fpa'))
    if (!r.ok) throw new Error(r.refused)
    const plan = r.out.file.body.plan
    if (plan.kind !== 'shareable') throw new Error('not a Shareable slice')
    const moneyColumns = Object.values(plan.models).flatMap((m) =>
      ((m as { columns: { money: boolean }[] }).columns ?? []).filter((c) => c.money),
    )
    expect(moneyColumns.length).toBeGreaterThan(0)
  }, 120_000)
})

describe('Export requests (export.requests, every mode)', () => {
  it('holds only the requests whose view is full for the exporter, with no chain or pay field', () => {
    for (const key of PERSONAS) {
      const ctx = ctxOf(key)
      const r = requestsFile(ctx, PINNED_AT)
      if (!r.ok) throw new Error(r.refused)
      const plan = r.out.file.body.plan
      if (plan.kind !== 'requests') throw new Error('not a Requests slice')
      const viewer = viewerOf(ctx)
      const all = new Map(requestsInForce(ctx).map((q) => [q.requestId, q]))
      const full = [...all.values()].filter((q) => requestView(q, viewer) === 'full')
      expect(
        plan.requests.map((q) => q.requestId),
        key,
      ).toEqual(full.map((q) => q.requestId))
      expect(readFile(ctx, r.out.text, r.out.text.length).ok, key).toBe(true)
    }
  }, 120_000)
})

describe('Export for a manager (export.for-manager)', () => {
  it('is not offered in Manager or Finance mode, with the policy’s sentence', () => {
    for (const key of ['manager-a', 'finance-fpa'] as const) {
      const ctx = ctxOf(key)
      expect(managersForExport(ctx), key).toEqual([])
      expect(forManagerFile(ctx, personaOf(s, 'manager-c').employeeId, PINNED_AT), key).toEqual({
        ok: false,
        refused: decide(ctx.access.mode, 'action:export.for-manager').how,
      })
    }
  })

  it('lists the HRBP’s unit, the Leader’s org without the Leader’s own seat, and everyone for HR admin', () => {
    const hrbp = ctxOf('hrbp-se')
    const lead = ctxOf('leader-svp-se')
    const admin = ctxOf('hr-admin')
    const h = managersForExport(hrbp)
    const l = managersForExport(lead)
    const a = managersForExport(admin)
    expect(h.length).toBeGreaterThan(5)
    for (const m of h)
      expect(hrbp.positionIndex.byId.get(m.positionId)?.businessUnit, m.label).toBe('Silicon Engineering')
    const own = personaOf(s, 'leader-svp-se')
    expect(l.length).toBeGreaterThan(5)
    expect(l.map((m) => m.personId)).not.toContain(own.employeeId)
    for (const m of l) expect(lead.access.scope?.positionIds.has(m.positionId), m.label).toBe(true)
    expect(a.length).toBeGreaterThan(h.length)
    for (const m of [...h, ...l]) expect(a.map((x) => x.personId)).toContain(m.personId)
    for (const m of a) {
      expect(m.label).toBe(`${m.name}'s team (${m.positionId})`)
      expect((admin.positionIndex.children.get(m.positionId)?.length ?? 0) > 0).toBe(true)
    }
  })

  it('makes the file exactly as Manager mode acting as the manager makes it, and no other', () => {
    const hrbp = ctxOf('hrbp-se')
    const m = managersForExport(hrbp)[0]
    const r = forManagerFile(hrbp, m.personId, PINNED_AT)
    if (!r.ok) throw new Error(r.refused)
    expect([r.out.file.kind, r.out.file.mode]).toEqual(['shareable', 'manager'])
    const own = shareableFile(ctxAs('manager', m.personId), PINNED_AT)
    if (!own.ok) throw new Error(own.refused)
    expect(r.out.file.scopeKey).toBe(own.out.file.scopeKey)
    expect(r.out.text).toBe(own.out.text)
    // A manager outside the HRBP's unit (Manager A sits in Go-to-Market).
    expect(forManagerFile(hrbp, personaOf(s, 'manager-a').employeeId, PINNED_AT)).toEqual({
      ok: false,
      refused: MANAGER_NOT_LISTED_TEXT,
    })
  }, 120_000)
})

describe('the Full file (export.full, HR admin with Show pay amounts on)', () => {
  let text = ''
  beforeAll(() => {
    const r = fullFile(sampleCtx('hr-admin', { showPay: true }), PINNED_AT)
    if (!r.ok) throw new Error(r.refused)
    text = r.out.text
    expect(r.out.notice).toBe(FULL_FILE_NOTICE)
  }, 120_000)

  it('is refused in every other mode with the policy’s sentence, and with the switch off', () => {
    for (const key of ['manager-a', 'hrbp-se', 'leader-svp-se', 'finance-fpa'] as const) {
      const ctx = ctxOf(key)
      expect(fullFile(ctx, PINNED_AT), key).toEqual({
        ok: false,
        refused: decide(ctx.access.mode, 'action:export.full').how,
      })
    }
    expect(fullFile(sampleCtx('hr-admin'), PINNED_AT)).toEqual({ ok: false, refused: FULL_NEEDS_PAY_TEXT })
  })

  it('says "Contains individual pay" on its first line, stays under the limits and reads back unchanged', () => {
    expect(text.split('\n')[0]).toBe('{ "notice": "Contains individual pay",')
    // C35: line tables by column with amounts in integer cents keep the sample's file near 14 MB.
    expect(text.length).toBeLessThan(MAX_WORKSPACE_BYTES)
    expect(text.length).toBeLessThan(MAX_FULL_FILE_BYTES)
    const ctx = sampleCtx('hr-admin')
    const p = importPreview(ctx, text, text.length)
    if (!p.ok) throw new Error(p.reason)
    expect(p.diff.plan.requests).toEqual({ added: 0, changed: 0, removed: 0 })
    expect(p.diff.plan.versions.added).toEqual([])
    for (const d of p.diff.datasets) expect(d.incoming, d.key).toBe(d.current)
    expect(p.diff.lines.some((l) => l.startsWith('Versions: no new versions'))).toBe(true)
  }, 120_000)

  it('refuses a damaged, newer, foreign, oversized or mismatched file with its sentence', () => {
    const ctx = sampleCtx('hr-admin')
    const edited = (edit: (raw: Record<string, Json>) => void, checksum = false) => {
      const raw = JSON.parse(text) as Record<string, Json>
      edit(raw)
      if (checksum) raw.checksum = workspaceChecksum(raw.body as never)
      return JSON.stringify(raw)
    }
    const reason = (t: string, size = t.length) => {
      const p = importPreview(ctx, t, size)
      return p.ok ? 'ok' : p.reason
    }
    // C35: a Full file reads to 150 MB; a Shareable or Requests file to 25 MB.
    expect(reason(text, MAX_WORKSPACE_BYTES + 1)).toBe('ok')
    expect(reason(text, MAX_FULL_FILE_BYTES + 1)).toBe(FULL_TOO_LARGE_TEXT)
    expect(reason(edited((raw) => ((raw.body as { lockedVersions: Json[] }).lockedVersions = [])))).toBe(
      DAMAGED_TEXT,
    )
    expect(reason(edited((raw) => (raw.version = 2)))).toBe(NEWER_TEXT)
    expect(reason(edited((raw) => (raw.format = 'xlsx')))).toBe(FOREIGN_TEXT)
    // The Budget's hash differs from this workspace's: nothing is imported.
    const mismatched = edited((raw) => {
      const body = raw.body as { lockedVersions: { kind: string; hash: string }[] }
      for (const v of body.lockedVersions) if (v.kind === 'budget') v.hash = `sha256-${'0'.repeat(64)}`
    }, true)
    expect(reason(mismatched)).toBe(hashMismatchText('FY27 Budget'))
    expect(reason(mismatched)).toBe(
      "This file's FY27 Budget does not match this workspace's (hash differs). Nothing was imported.",
    )
    // A Shareable file is not a workspace to replace or merge.
    const shared = shareableOf(ctxOf('hrbp-se'))
    if (!shared.ok) throw new Error(shared.refused)
    expect(reason(shared.out.text)).toBe(IMPORT_FULL_ONLY_TEXT)
    expect(reason(shared.out.text, MAX_WORKSPACE_BYTES + 1)).toBe(TOO_LARGE_TEXT)
    // Outside HR admin Import is not offered.
    const p = importPreview(ctxOf('finance-fpa'), text, text.length)
    expect(p).toEqual({ ok: false, reason: decide('finance', 'action:workspace.import').how })
  }, 120_000)

  it('still imports after two more locks (C35: by column, amounts in cents, 150 MB for a Full file)', async () => {
    const sc = scenario()
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const q2 = await sc.run(fin, 'lockVersion', {
      workingId: 'fy27-working',
      as: { kind: 'reforecast', name: 'FY27 Q2 Reforecast' },
    })
    expect(q2.outcome.ok).toBe(true)
    const fy28 = await sc.run(fin, 'lockVersion', {
      workingId: 'fy28-working',
      as: { kind: 'budget', name: 'FY28 Budget' },
    })
    expect(fy28.outcome.ok).toBe(true)
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const ctx = await sc.ctx(admin)
    const withPay = { ...ctx, showPay: true } as AnalyticsContext
    const r = fullFile(withPay, PINNED_AT)
    if (!r.ok) throw new Error(r.refused)
    const p = importPreview(ctx, r.out.text, new TextEncoder().encode(r.out.text).length)
    if (!p.ok) throw new Error(p.reason)
    expect(p.diff.plan.versions.added).toEqual([])
    expect(p.replaceRefused).toBeNull()
    // Every locked version read back still verifies.
    const plan = p.file.body.plan
    if (plan.kind !== 'full') throw new Error('not full')
    const locked = plan.state.versions.filter(isLocked)
    expect(locked.map((v) => v.name)).toEqual(
      expect.arrayContaining(['FY27 Budget', 'FY27 Q2 Reforecast', 'FY28 Budget']),
    )
    for (const v of locked) expect(verifyLock(v), v.name).toBe(true)
    for (const c of plan.state.closes) expect(verifyClose(c), c.month).toBe(true)
  }, 300_000)

  it("checks the file's audit log: one that does not verify is refused for Replace, named by its first broken link", async () => {
    const sc = scenario()
    const mgr: Who = { mode: 'manager', personId: personaOf(s, 'manager-a').employeeId }
    const made = await sc.run(mgr, 'createRequest', {
      type: 'New role',
      managerPositionId: personaOf(s, 'manager-a').positionId,
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-01-04',
      reasonCode: 'Growth',
      jobTitle: 'Account Executive',
    })
    expect(made.outcome.ok).toBe(true)
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const ctx = await sc.ctx(admin)
    const r = fullFile({ ...ctx, showPay: true } as AnalyticsContext, PINNED_AT)
    if (!r.ok) throw new Error(r.refused)
    const log = await sc.log()
    expect(log.length).toBeGreaterThan(0)
    const fresh = sampleCtx('hr-admin')
    const good = importPreview(fresh, r.out.text, r.out.text.length)
    if (!good.ok) throw new Error(good.reason)
    expect(good.replaceRefused).toBeNull()
    expect(good.diff.audit).toMatchObject({ here: 0, inFile: log.length, check: { ok: true } })
    expect(good.diff.lines.at(-1)).toContain("the file's chain checks out")
    // The same file with its first entry changed (and its checksum made again): Replace is refused.
    const raw = JSON.parse(r.out.text) as Record<string, Json>
    const body = raw.body as { plan: { audit: { byName: string }[] } }
    body.plan.audit[0].byName = 'Someone else'
    raw.checksum = workspaceChecksum(raw.body as never)
    const damaged = JSON.stringify(raw)
    const bad = importPreview(fresh, damaged, damaged.length)
    if (!bad.ok) throw new Error(bad.reason)
    expect(bad.replaceRefused).toBe("This file's audit log breaks at entry 1. Nothing was imported.")
    expect(bad.diff.lines.at(-1)).toBe(
      "Audit log: the file's chain breaks at entry 1, so Replace is refused. Merge keeps this workspace's log.",
    )
  }, 300_000)

  it("Replace puts the file's audit log in place of this one, then adds one entry; Merge keeps this one (C35)", async () => {
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const draft = (who: Who, positionId: string, title: string) => ({
      type: 'New role' as const,
      managerPositionId: positionId,
      level: 'P3' as const,
      location: 'San Jose',
      fte: 1,
      startDate: '2027-01-04',
      reasonCode: 'Growth' as const,
      jobTitle: title,
      who,
    })
    const a = personaOf(s, 'manager-a')
    const b = personaOf(s, 'manager-b')
    // Workspace A: two changes, saved as a Full file.
    const there = scenario()
    const asA: Who = { mode: 'manager', personId: a.employeeId }
    const { who: _a, ...one } = draft(asA, a.positionId, 'Account Executive')
    expect((await there.run(asA, 'createRequest', one)).outcome.ok).toBe(true)
    const { who: _a2, ...two } = draft(asA, a.positionId, 'Sales Engineer')
    expect((await there.run(asA, 'createRequest', two)).outcome.ok).toBe(true)
    const theirLog = await there.log()
    expect(theirLog.length).toBeGreaterThan(1)
    const full = fullFile({ ...(await there.ctx(admin)), showPay: true } as AnalyticsContext, PINNED_AT)
    if (!full.ok) throw new Error(full.refused)
    // Workspace B: a change of its own, then Replace with A's file.
    const here = scenario()
    const asB: Who = { mode: 'manager', personId: b.employeeId }
    const { who: _b, ...mine } = draft(asB, b.positionId, 'Site Engineer')
    expect((await here.run(asB, 'createRequest', mine)).outcome.ok).toBe(true)
    const ownLog = await here.log()
    const read = readFile(await here.ctx(admin), full.out.text, full.out.text.length)
    if (!read.ok) throw new Error(read.reason)
    const replaced = await here.run(admin, 'replaceWorkspace', { file: read.file })
    expect(replaced.outcome).toEqual({ ok: true, notice: WORKSPACE_REPLACED_NOTICE })
    const after = await here.log()
    // The file's log, entry for entry, then one entry for the Replace itself, signed by HR admin.
    expect(after.slice(0, theirLog.length)).toEqual(theirLog)
    expect(after.slice(theirLog.length).map((e) => [e.object, e.field, e.by])).toEqual([
      ['workspace', 'replaced', admin.personId],
    ])
    expect(chainOk(after)).toBe(true)
    expect(after.some((e) => ownLog.some((o) => o.hash === e.hash))).toBe(false)
    // Merge keeps this workspace's log and adds one entry.
    const merge = scenario()
    expect((await merge.run(asB, 'createRequest', mine)).outcome.ok).toBe(true)
    const before = await merge.log()
    const merged = await merge.run(admin, 'mergeWorkspace', { file: read.file })
    expect(merged.outcome).toEqual({ ok: true, notice: WORKSPACE_MERGED_NOTICE })
    const kept = await merge.log()
    expect(kept.slice(0, before.length)).toEqual(before)
    expect(kept.length).toBe(before.length + 1)
  }, 300_000)

  it('replaces and merges through the write path, one workspace entry each, signed by HR admin', async () => {
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const read = readFile(sampleCtx('hr-admin'), text, text.length)
    if (!read.ok) throw new Error(read.reason)
    const merge = scenario()
    const merged = await merge.run(admin, 'mergeWorkspace', { file: read.file })
    expect(merged.outcome).toEqual({ ok: true, notice: WORKSPACE_MERGED_NOTICE })
    expect(merged.entries.map((e) => [e.object, e.field, e.by, e.mode])).toEqual([
      ['workspace', 'merged', admin.personId, 'hr-admin'],
    ])
    expect(chainOk(await merge.log())).toBe(true)
    const replace = scenario()
    const replaced = await replace.run(admin, 'replaceWorkspace', { file: read.file })
    expect(replaced.outcome).toEqual({ ok: true, notice: WORKSPACE_REPLACED_NOTICE })
    expect(replaced.entries.map((e) => [e.object, e.field, e.by])).toEqual([
      ['workspace', 'replaced', admin.personId],
    ])
    expect(chainOk(await replace.log())).toBe(true)
  }, 300_000)
})

describe('D-PAYFILES: a Shareable saved with Show pay amounts on (review EX-2)', () => {
  it('is the switch-off file byte for byte, with no pay column and no group under 5, and says so', () => {
    const on = shareableFile(sampleCtx('hr-admin', { showPay: true }), PINNED_AT)
    const off = shareableFile(sampleCtx('hr-admin'), PINNED_AT)
    if (!on.ok) throw new Error(on.refused)
    if (!off.ok) throw new Error(off.refused)
    expect(on.out.text).toBe(off.out.text)
    expect(on.out.name).toBe(off.out.name)
    expect(on.out.notice).toBe(SHAREABLE_PAY_OFF_TEXT)
    expect(off.out.notice).toBeNull()
    const plan = on.out.file.body.plan
    if (plan.kind !== 'shareable') throw new Error('not a Shareable slice')
    // No per-person amount (the switch-on grid's 'Annual cost' column) and no 1- to 4-person cost
    // center (1520-RDU holds one person, 1550-HSZ three): the switch-off figures hide both.
    const columns = Object.values(plan.models).flatMap(
      (m) => (m as { columns: { key: string; pay: boolean }[] }).columns,
    )
    expect(columns.filter((c) => c.pay)).toEqual([])
    const tree = plan.models['targets-tree-cost-centers'] as unknown as {
      rows: Record<string, unknown>[]
    }
    for (const cc of ['1520-RDU', '1550-HSZ'])
      for (const row of tree.rows.filter((r) => r.costCenter === cc))
        expect(row.costUsd ?? null, cc).toBeNull()
    expect(on.out.text).not.toContain('individual pay')
  }, 300_000)
})

describe('D-MODELINE: Manager-mode files name the mode on their first line (review CP-2)', () => {
  const firstLine = (text: string) => text.split('\n')[0]

  it('Export for a manager carries the Manager line for the chosen manager, from HRBP, Leader and HR admin', () => {
    for (const ctx of [ctxOf('hrbp-se'), ctxOf('leader-svp-se'), sampleCtx('hr-admin')]) {
      const m = managersForExport(ctx)[0]
      const r = forManagerFile(ctx, m.personId, PINNED_AT)
      if (!r.ok) throw new Error(r.refused)
      const line = managerExportLine(m.name)
      expect(r.out.file.modeLine, m.label).toBe(line)
      expect(firstLine(r.out.text)).toBe(`{ "modeLine": ${JSON.stringify(line)},`)
      expect(r.out.notice).toBe(line)
      const back = readFile(ctx, r.out.text, r.out.text.length)
      if (!back.ok) throw new Error(back.reason)
      expect(back.file.modeLine).toBe(line)
    }
  }, 300_000)

  it("a manager's own Shareable and Requests files carry it; no other mode's file does", () => {
    const manager = ctxOf('manager-a')
    const line = managerExportLine(personaOf(s, 'manager-a').name)
    for (const r of [shareableOf(manager), requestsFile(manager, PINNED_AT)]) {
      if (!r.ok) throw new Error(r.refused)
      expect(r.out.file.modeLine).toBe(line)
      expect(firstLine(r.out.text)).toBe(`{ "modeLine": ${JSON.stringify(line)},`)
    }
    for (const key of ['hrbp-se', 'finance-fpa'] as const) {
      const r = requestsFile(ctxOf(key), PINNED_AT)
      if (!r.ok) throw new Error(r.refused)
      expect(r.out.file.modeLine, key).toBeUndefined()
      expect(firstLine(r.out.text), key).toBe('{ "format": "hcplan",')
    }
  }, 300_000)

  it('reads the line back only as written: another text, an amount in it or a line on a non-manager file is refused', () => {
    const manager = ctxOf('manager-a')
    const r = requestsFile(manager, PINNED_AT)
    if (!r.ok) throw new Error(r.refused)
    const line = r.out.file.modeLine as string
    const swap = (to: string) => r.out.text.replace(JSON.stringify(line), JSON.stringify(to))
    const refused = { ok: false, reason: brokenPartText('modeLine') }
    expect(readFile(manager, swap('Made in Finance mode.'), 0)).toEqual(refused)
    expect(
      readFile(
        manager,
        swap("Made in Manager mode for Two million dollars's team. No amounts are included."),
        0,
      ),
    ).toEqual(refused)
    expect(
      readFile(manager, swap("Made in Manager mode for Ann 150000's team. No amounts are included."), 0),
    ).toEqual(refused)
    const finance = requestsFile(ctxOf('finance-fpa'), PINNED_AT)
    if (!finance.ok) throw new Error(finance.refused)
    const planted = finance.out.text.replace(
      '{ "format"',
      `{ "modeLine": ${JSON.stringify(line)},\n  "format"`,
    )
    expect(readFile(manager, planted, 0)).toEqual(refused)
    // Opening a file reads the line through the same check.
    expect(openSharedFile(manager, swap('Made in Finance mode.'), 0).ok).toBe(false)
  }, 300_000)

  it('falls back to "Made in Manager mode." for a name the reader would refuse, so the save still goes', () => {
    const manager = ctxOf('manager-a')
    expect(fileModeLine(manager)).toBe(managerExportLine(personaOf(s, 'manager-a').name))
    for (const name of ['Ann Lee 2', 'A'.repeat(121)]) {
      const access = { ...manager.access, actingAs: { ...(manager.access.actingAs as object), name } }
      expect(fileModeLine({ access } as never), name.slice(0, 12)).toBe('Made in Manager mode.')
      const r = shareableFile({ ...manager, access } as never, PINNED_AT)
      if (!r.ok) throw new Error(r.refused)
      expect(r.out.file.modeLine).toBe('Made in Manager mode.')
    }
    expect(fileModeLine(ctxOf('hrbp-se'))).toBeUndefined()
  }, 300_000)

  it('is said on saving from Requests > Export requests too, as from the Workspace menu', () => {
    const own = requestsFile(ctxOf('manager-a'), PINNED_AT)
    const hrbp = requestsFile(ctxOf('hrbp-se'), PINNED_AT)
    if (!own.ok || !hrbp.ok) throw new Error('no file')
    expect(savedNote(own.out)).toBe(`${own.out.name}. ${own.out.file.modeLine}`)
    expect(savedNote(hrbp.out)).toBe(hrbp.out.name)
    const ui = readFileSync(
      fileURLToPath(new URL('../../requests/ui/RequestFiles.tsx', import.meta.url)),
      'utf8',
    )
    expect(ui).toContain('description: savedNote(r.out)')
  })
})

describe('B9: the plan state set aside when the sample changed', () => {
  it('saves as a Full file in HR admin with Show pay amounts on only, and reads back', () => {
    const state = { ...s.plan, baselineId: 'northgate-earlier00000' }
    const aside = { state, audit: [] }
    expect(earlierSampleFile(sampleCtx('hr-admin'), aside, PINNED_AT)).toEqual({
      ok: false,
      refused: FULL_NEEDS_PAY_TEXT,
    })
    const finance = ctxOf('finance-fpa')
    expect(earlierSampleFile(finance, aside, PINNED_AT)).toEqual({
      ok: false,
      refused: decide('finance', 'action:export.full').how,
    })
    const admin = sampleCtx('hr-admin', { showPay: true })
    const r = earlierSampleFile(admin, aside, PINNED_AT)
    if (!r.ok) throw new Error(r.refused)
    expect(r.out.text.split('\n')[0]).toBe('{ "notice": "Contains individual pay",')
    expect([r.out.file.kind, r.out.file.scopeLabel, r.out.notice]).toEqual([
      'full',
      EARLIER_SAMPLE_LABEL,
      FULL_FILE_NOTICE,
    ])
    expect(r.out.file.body.datasets).toBeUndefined()
    const back = readFile(admin, r.out.text, r.out.text.length)
    if (!back.ok) throw new Error(back.reason)
    expect(back.file.body.plan.kind).toBe('full')
  }, 300_000)
})
