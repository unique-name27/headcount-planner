/**
 * Version IDs that carry an amount, through the write path (M3 known gap 5; docs/PLAN.md 8.4 rule 5,
 * R81, C35): a Full file whose FY27 Q1 reforecast came under the ID
 * "fy27-q1-reforecast-cut-to-57-1m" (its name holds no amount, so FILE_AMOUNT_TEXT lets it in) is
 * taken by Replace under "fy27-q1-reforecast", every lock hash still verifying, the entry naming the
 * version and its new ID only; Manager mode then reads no amount in any version ID, on screen or in
 * the files it writes; the import preview and a Merge of the same file find the version already
 * here and add none. A
 * lock whose name's slug reads as an amount is minted '<fy>-<kind>'.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { hasAmount } from '@/access/visibility'
import { chainOk, said, scenario, type Who } from '@/app/write/scenario.testkit'
import type { Sample } from '@/data/sample'
import { isLocked, verifyLock } from '@/plan/engine/versions'
import type { AnyVersion, LockedVersion, PlanState, WorkspaceFile } from '@/plan/types'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaOf } from '@/testkit/sample'
import { importPreview, requestsFile, shareableFile } from '@/views/data/engine/workspace'
import { workspaceDiff } from '../workspace/diff'
import { serializeWorkspace, workspaceChecksum } from '../workspace/file'
import { idHasAmount } from '../workspace/versionIds'
import { versionLockedNotice, WORKSPACE_MERGED_NOTICE, WORKSPACE_REPLACED_NOTICE } from './copy'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const Q1 = 'fy27-q1-reforecast'
const DIRTY = 'fy27-q1-reforecast-cut-to-57-1m'
const AT = '2026-09-30T12:00:00.000Z'

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

/** A plan state with the Q1 reforecast under the ID with an amount, its lines and rows naming it. */
function dirtied(state: PlanState): PlanState {
  const as = (v: AnyVersion): AnyVersion =>
    isLocked(v)
      ? {
          ...v,
          versionId: DIRTY,
          lines: { ...v.lines, versionId: DIRTY },
          assumptions: v.assumptions.map((r) => ({ ...r, version: DIRTY })),
        }
      : { ...v, versionId: DIRTY }
  return { ...state, versions: state.versions.map((v) => (v.versionId === Q1 ? as(v) : v)) }
}

/** A Full file of a plan state with an empty log (the sample's state has no audit head). */
const fullFile = (state: PlanState): WorkspaceFile => ({
  format: 'hcplan',
  version: 1,
  kind: 'full',
  notice: 'Contains individual pay',
  savedAt: AT,
  app: 'Headcount Planner',
  mode: 'hr-admin',
  scopeLabel: 'Whole company',
  actingAs: false,
  checksum: 'sha256-x',
  body: { plan: { kind: 'full', state, audit: [] }, lockedVersions: [] },
})

const ids = (state: PlanState) => state.versions.map((v) => v.versionId)

describe('a Full file whose version ID carries an amount (M3 known gap 5)', () => {
  it('Replace rewrites it, every lock verifies, Manager mode reads no amount, and a Merge adds no version', async () => {
    const sc = scenario({ idTag: 'GAPF' })
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const before = await sc.plan()
    const hashes = new Map(before.versions.map((v) => [v.versionId, v.hash]))
    const file = fullFile(dirtied(before))
    expect(ids(file.body.plan.kind === 'full' ? file.body.plan.state : before)).toContain(DIRTY)

    const out = await sc.run(admin, 'replaceWorkspace', { file })
    expect(out.outcome).toEqual({ ok: true, notice: WORKSPACE_REPLACED_NOTICE })
    const plan = await sc.plan()
    expect(ids(plan)).toEqual(ids(before))
    for (const v of plan.versions) {
      expect(idHasAmount(v.versionId, hasAmount), v.versionId).toBe(false)
      expect(v.hash, v.versionId).toBe(hashes.get(v.versionId))
      if (isLocked(v)) expect(verifyLock(v), v.versionId).toBe(true)
    }
    const q1 = plan.versions.find((v) => v.versionId === Q1) as LockedVersion
    expect(q1.lines.versionId).toBe(Q1)
    expect(new Set(q1.assumptions.map((r) => r.version))).toEqual(new Set([Q1]))
    // The entry names the version and its new ID, never the ID it came with.
    expect(out.entries.map((e) => [e.object, e.field])).toEqual([['workspace', 'replaced']])
    expect(out.entries[0].new).toMatchObject({
      versionIdsRewritten: [{ name: 'FY27 Q1 Reforecast', versionId: Q1 }],
    })
    expect(JSON.stringify(out.entries)).not.toContain(DIRTY)

    // Manager mode: the versions and every file it writes carry no amount in an ID.
    const mgr: Who = { mode: 'manager', personId: personaOf(s, 'manager-a').employeeId }
    const ctx = await sc.ctx(mgr)
    expect(ctx.versions.map((v) => v.versionId)).toContain(Q1)
    expect(ctx.versions.some((v) => idHasAmount(v.versionId, hasAmount))).toBe(false)
    const shareable = shareableFile(ctx, AT)
    const requests = requestsFile(ctx, AT)
    if (!shareable.ok || !requests.ok) throw new Error('Manager mode saves both files.')
    for (const text of [shareable.out.text, requests.out.text]) {
      expect(text).not.toContain(DIRTY)
      expect(text).not.toContain('57-1m')
    }
    expect(shareable.out.text).toContain(`"${Q1}"`)

    // The import preview reads the file as Merge does: the reforecast is already here, so it lists
    // no new version (with the ID left as it came, it would list the file's reforecast as added).
    const signed = { ...file, checksum: workspaceChecksum(file.body) }
    const text = serializeWorkspace(signed)
    const preview = importPreview(await sc.ctx(admin), text, text.length)
    if (!preview.ok) throw new Error(preview.reason)
    expect(preview.diff.plan.versions.added).toEqual([])
    const raw = workspaceDiff({ datasets: s.datasets, plan, audit: [] }, signed)
    expect(raw.plan.versions.added.map((v) => v.versionId)).toEqual([DIRTY])

    // A Merge of the same file finds the reforecast already here: no second one.
    const merged = await sc.run(admin, 'mergeWorkspace', { file })
    expect(merged.outcome).toEqual({ ok: true, notice: WORKSPACE_MERGED_NOTICE })
    const after = await sc.plan()
    expect(ids(after)).toEqual(ids(before))
    expect(after.versions.filter((v) => v.kind === 'reforecast')).toHaveLength(1)
    expect(merged.entries[0].new).toMatchObject({
      versionIdsRewritten: [{ name: 'FY27 Q1 Reforecast', versionId: Q1 }],
    })
    expect(chainOk(await sc.log())).toBe(true)
  }, 300_000)

  it('control: a file whose IDs carry no amount is taken as it is, and its entry lists no rewrite', async () => {
    const sc = scenario({ idTag: 'GAPC' })
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const before = await sc.plan()
    const out = await sc.run(admin, 'replaceWorkspace', { file: fullFile(before) })
    expect(said(out.outcome)).toBe(WORKSPACE_REPLACED_NOTICE)
    expect(ids(await sc.plan())).toEqual(ids(before))
    expect(out.entries[0].new).not.toHaveProperty('versionIdsRewritten')
  }, 300_000)
})

describe('a lock whose name’s slug reads as an amount (M3 known gap 5)', () => {
  it('is minted <fy>-<kind>, so no ID the app mints is one a Merge would rewrite', async () => {
    const sc = scenario({ idTag: 'GAPL' })
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    // "FY27-1000 Q2" holds no amount as a name (a code), but its slug reads "fy27 1000 q2".
    const name = 'FY27-1000 Q2'
    expect(hasAmount(name)).toBe(false)
    const lock = await sc.run(fin, 'lockVersion', {
      workingId: 'fy27-working',
      as: { kind: 'reforecast', name },
    })
    expect(lock.outcome).toEqual({ ok: true, notice: versionLockedNotice(name) })
    expect(lock.entries.map((e) => [e.object, e.id, e.field])).toEqual([
      ['version', 'fy27-reforecast', 'locked'],
    ])
    const v = (await sc.plan()).versions.find((x) => x.versionId === 'fy27-reforecast') as LockedVersion
    expect(v).toMatchObject({ name, kind: 'reforecast', state: 'locked' })
    expect(verifyLock(v)).toBe(true)
    // A clean name keeps its slug, as before.
    const q2 = await sc.run(fin, 'lockVersion', {
      workingId: 'fy27-working',
      as: { kind: 'reforecast', name: 'FY27 Q2 Reforecast' },
    })
    expect(q2.entries.map((e) => e.id)).toEqual(['fy27-q2-reforecast'])
  }, 300_000)
})
