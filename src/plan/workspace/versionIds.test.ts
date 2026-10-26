/**
 * Version IDs that carry an amount (M3 known gap 5, ./versionIds.ts): which IDs carry one, the ID a
 * rewrite mints, and a Full file's plan state and datasets with the FY27 Q1 reforecast's ID written
 * as "fy27-q1-reforecast-cut-to-57-1m" everywhere it is named. Replace (no versions here) takes it
 * back to "fy27-q1-reforecast" with every reference and every lock hash intact; Merge maps it to the
 * same version already here, and to a new ID when the version is another.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { hasAmount } from '@/access/visibility'
import type { Sample } from '@/data/sample'
import type { Datasets } from '@/data/schema'
import { requestsOf } from '@/drill/seats'
import { isLocked, verifyLock } from '@/plan/engine/versions'
import type { AnyVersion, LockedVersion, PlanState } from '@/plan/types'
import { leakSample, sampleCtx } from '@/testkit/sample'
import { cleanVersionIds, idAsWords, idHasAmount, mintVersionId } from './versionIds'

const Q1 = 'fy27-q1-reforecast'
const DIRTY = 'fy27-q1-reforecast-cut-to-57-1m'

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

/** A version with another ID, its lines and rows naming it. */
function asId(v: AnyVersion, id: string): AnyVersion {
  if (!isLocked(v)) return { ...v, versionId: id }
  return {
    ...v,
    versionId: id,
    lines: { ...v.lines, versionId: id },
    assumptions: v.assumptions.map((r) => ({ ...r, version: id })),
  }
}

/**
 * The sample's plan state and datasets as a Full file would bring them with the Q1 reforecast's ID
 * carrying an amount: its lines and rows, FY28 Working's parent (a synthetic link, so the parent is
 * checked), an overlay row and a removal naming it, a trade priced on it, and the datasets' rows.
 */
function dirtyFile(): { state: PlanState; datasets: Partial<Datasets> } {
  const q1 = s.plan.versions.find((v) => v.versionId === Q1) as LockedVersion
  const row = { ...q1.assumptions[0], version: DIRTY }
  const trade = requestsOf(sampleCtx('hr-admin', { sample: s })).find((r) => r.requestId === 'R-1040')
  if (!trade?.trade) throw new Error('The sample has no trade R-1040.')
  const state: PlanState = {
    ...s.plan,
    versions: s.plan.versions.map((v) =>
      v.versionId === Q1 ? asId(v, DIRTY) : v.versionId === 'fy28-working' ? { ...v, parentId: DIRTY } : v,
    ),
    overlay: { ...s.plan.overlay, assumptions: [row], removedAssumptions: [{ ...row, key: `${row.key}x` }] },
    requests: [{ ...trade, trade: { ...trade.trade, rateVersion: DIRTY } }],
  }
  const datasets: Partial<Datasets> = {
    assumptions: s.datasets.assumptions.map((r) => (r.version === Q1 ? { ...r, version: DIRTY } : r)),
    requests: s.datasets.requests.map((r) => (r.rateVersion === Q1 ? { ...r, rateVersion: DIRTY } : r)),
  }
  return { state, datasets }
}

const ids = (state: PlanState) => state.versions.map((v) => v.versionId)

describe('which version IDs carry an amount', () => {
  it('reads an ID as written and as words, so a slug of a name with an amount is caught', () => {
    for (const id of [DIRTY, 'fy27-budget-250000', 'fy27-budget-250-000', 'FY27-USD-plan', 'plan-57-1m'])
      expect(idHasAmount(id, hasAmount), id).toBe(true)
    // As written, a dash before digits reads as a code: the words reading is what catches these.
    expect(hasAmount(DIRTY)).toBe(false)
    expect(idAsWords(DIRTY)).toBe('fy27 q1 reforecast cut to 57 1m')
    for (const id of [
      'fy27-budget',
      Q1,
      'fy27-working',
      'fy28-working',
      'fy27-working-2',
      'fy27-q2-reforecast',
      'fy27-q1-reforecast~reopen',
      'fy27-budget-2027',
    ])
      expect(idHasAmount(id, hasAmount), id).toBe(false)
  })

  it('no ID of the sample carries one', () => {
    for (const v of s.plan.versions) expect(idHasAmount(v.versionId, hasAmount), v.versionId).toBe(false)
  })
})

describe('the ID a rewrite or a lock mints', () => {
  it('is the name’s slug, then -2, -3 while taken', () => {
    const v = { name: 'FY27 Q1 Reforecast', fiscalYear: 'FY27', kind: 'reforecast' } as const
    expect(mintVersionId(v, new Set(), hasAmount)).toBe(Q1)
    expect(mintVersionId(v, new Set([Q1]), hasAmount)).toBe(`${Q1}-2`)
    expect(mintVersionId(v, new Set([Q1, `${Q1}-2`]), hasAmount)).toBe(`${Q1}-3`)
  })

  it('is <fy>-<kind> when the slug reads as an amount or is empty', () => {
    // "FY27-1000 Q2" holds no amount as a name (a code), but its slug reads "fy27 1000 q2".
    expect(hasAmount('FY27-1000 Q2')).toBe(false)
    const basis = { name: 'FY27-1000 Q2', fiscalYear: 'FY27', kind: 'reforecast' } as const
    expect(mintVersionId(basis, new Set(), hasAmount)).toBe('fy27-reforecast')
    expect(mintVersionId({ ...basis, name: '  ' }, new Set(['fy27-reforecast']), hasAmount)).toBe(
      'fy27-reforecast-2',
    )
    expect(
      mintVersionId({ name: 'Plan 57-1M', fiscalYear: 'FY28', kind: 'working' }, new Set(), hasAmount),
    ).toBe('fy28-working')
  })
})

describe('a Full file’s version ID with an amount (gap 5)', () => {
  it('Replace: the ID and every reference to it are rewritten, and every lock still verifies', () => {
    const file = dirtyFile()
    const out = cleanVersionIds(file.state, { hasAmount, datasets: file.datasets })
    expect(out.renamed).toEqual([{ from: DIRTY, to: Q1, name: 'FY27 Q1 Reforecast' }])
    expect(ids(out.state)).toEqual(ids(s.plan))
    for (const v of out.state.versions) expect(idHasAmount(v.versionId, hasAmount), v.versionId).toBe(false)
    // The lock hash leaves IDs out: every lock verifies, with the hash it was locked with.
    for (const v of out.state.versions.filter(isLocked)) {
      expect(verifyLock(v), v.versionId).toBe(true)
      expect(v.hash).toBe(s.plan.versions.find((x) => x.versionId === v.versionId)?.hash)
    }
    const q1 = out.state.versions.find((v) => v.versionId === Q1) as LockedVersion
    expect(q1.lines.versionId).toBe(Q1)
    expect(q1.lines.length).toBe(
      (s.plan.versions.find((v) => v.versionId === Q1) as LockedVersion).lines.length,
    )
    expect(new Set(q1.assumptions.map((r) => r.version))).toEqual(new Set([Q1]))
    expect(out.state.versions.find((v) => v.versionId === 'fy28-working')?.parentId).toBe(Q1)
    expect(out.state.overlay.assumptions.map((r) => r.version)).toEqual([Q1])
    expect(out.state.overlay.removedAssumptions?.map((r) => r.version)).toEqual([Q1])
    expect(out.state.requests[0].trade?.rateVersion).toBe(Q1)
    expect(out.datasets?.assumptions?.filter((r) => r.version === Q1).length).toBe(
      s.datasets.assumptions.filter((r) => r.version === Q1).length,
    )
    expect(out.datasets?.requests?.find((r) => r.requestId === 'R-1040')?.rateVersion).toBe(Q1)
    // Nothing names the old ID any more, anywhere in the state or the datasets.
    const text = JSON.stringify([
      out.state.versions.map((v) => ({ ...v, lines: v.versionId })),
      out.state.overlay,
      out.state.requests,
      out.datasets,
    ])
    expect(text).not.toContain(DIRTY)
    expect(text).not.toContain('57-1m')
    // The rows that never named it are the same objects.
    expect(out.state.versions.find((v) => v.versionId === 'fy27-budget')).toBe(
      file.state.versions.find((v) => v.versionId === 'fy27-budget'),
    )
  })

  it('Merge: the same version already here keeps its ID here; another version gets one of its own', () => {
    const file = dirtyFile()
    const same = cleanVersionIds(file.state, { hasAmount, current: s.plan.versions })
    expect(same.renamed).toEqual([{ from: DIRTY, to: Q1, name: 'FY27 Q1 Reforecast' }])
    expect(ids(same.state)).toEqual(ids(s.plan))
    // Another reforecast under the same name (another hash) never takes this workspace's.
    const other: PlanState = {
      ...file.state,
      versions: file.state.versions.map((v) =>
        v.versionId === DIRTY ? { ...(v as LockedVersion), hash: 'sha256-another' } : v,
      ),
    }
    expect(cleanVersionIds(other, { hasAmount, current: s.plan.versions }).renamed).toEqual([
      { from: DIRTY, to: `${Q1}-2`, name: 'FY27 Q1 Reforecast' },
    ])
    // A reforecast of another name with the same content is another version too.
    const renamed: PlanState = {
      ...file.state,
      versions: file.state.versions.map((v) => (v.versionId === DIRTY ? { ...v, name: 'FY27 Q1 Rerun' } : v)),
    }
    expect(cleanVersionIds(renamed, { hasAmount, current: s.plan.versions }).renamed[0]?.to).toBe(
      'fy27-q1-rerun',
    )
    // A Working of the year is this workspace's Working (a Merge keeps one Working a year).
    const working: PlanState = {
      ...s.plan,
      versions: s.plan.versions.map((v) =>
        v.versionId === 'fy27-working'
          ? asId(v, 'fy27-working-250k')
          : v.parentId === 'fy27-working'
            ? { ...v, parentId: 'fy27-working-250k' }
            : v,
      ),
      overlay: {
        ...s.plan.overlay,
        assumptions: [{ version: 'fy27-working-250k', table: 'fx', org: null, key: 'k', value: 1 }],
      },
    }
    const w = cleanVersionIds(working, { hasAmount, current: s.plan.versions })
    expect(w.renamed).toEqual([{ from: 'fy27-working-250k', to: 'fy27-working', name: 'FY27 Working' }])
    expect(w.state.overlay.assumptions[0].version).toBe('fy27-working')
    // The parent links of the locks follow it.
    for (const v of w.state.versions.filter(isLocked)) expect(v.parentId).toBe('fy27-working')
  })

  it('with no ID that carries an amount, returns the same objects', () => {
    const out = cleanVersionIds(s.plan, { hasAmount, datasets: s.datasets })
    expect(out.state).toBe(s.plan)
    expect(out.datasets).toBe(s.datasets)
    expect(out.renamed).toEqual([])
  })
})
