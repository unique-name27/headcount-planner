/**
 * The sample's baseline (lead browser finding B9): the baseline id names the whole generated sample,
 * so a plan state stored against an earlier build of the sample is set aside with a notice, never
 * laid over the new one, and the first write on the new sample keeps it aside with its audit log
 * (to save as a Full file) and starts the new sample's log afresh.
 *
 * Two generator versions: the sample as generated now, and the same generator with one change to
 * what it makes (R-1007's last update a day later, the kind of change the M3 fixes made to the
 * sample's requests while the Budget's lock hash stayed the same).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { type Sample, sampleBaselineId } from '@/data/sample/generate'
import { PLANTED, starterSample } from '@/data/sample/raw'
import { EARLIER_SAMPLE_FILE_TEXT } from '@/plan/actions/copy'
import { mergeWorkspace, replaceWorkspace } from '@/plan/actions/workspace'
import { verifyChain } from '@/plan/audit/chain'
import { emptyPlanState, MemoryStore } from '@/plan/store/memoryStore'
import type { AuditEntry, PlanState } from '@/plan/types'
import { memoryIdbEntries, resetMemoryIdb } from '@/testkit/memoryIdb'
import { leakSample, personaOf, pickOf, picksWith, requestOf, sampleCtx } from '@/testkit/sample'
import { earlierSampleFile, fullFile, importPreview } from '@/views/data/engine/workspace'
import {
  auditInForce,
  clearAside,
  earlierSampleOf,
  keepAside,
  planInForce,
  readAside,
  readAsides,
  type SetAside,
  setAsideOf,
  storedFor,
  usePlan,
} from './planState'
import { actionContextOf } from './write/context'
import { runAction } from './write/run'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))

let s: Sample
/** The second generator version's plan state: the same seeded plan over its own datasets. */
let v2: PlanState
let mgrCtx: AnalyticsContext

const AT = '2026-09-30T10:00:00.000Z'

beforeAll(() => {
  s = leakSample()
  const datasets = {
    ...s.datasets,
    requests: s.datasets.requests.map((r) =>
      r.requestId === 'R-1007' ? { ...r, updatedAt: '2026-06-11' } : r,
    ),
  }
  v2 = { ...s.plan, baselineId: sampleBaselineId(datasets, s.plan) }
  mgrCtx = sampleCtx('manager', { picks: picksWith(s, 'manager', pickOf(personaOf(s, 'manager-a'))) })
}, 120_000)

/** A plan state stored on the first generator's sample: one changed request, two audit entries. */
async function storedOnV1(): Promise<{
  store: MemoryStore
  stored: PlanState
  audit: readonly AuditEntry[]
}> {
  const changed = { ...requestOf(s, 'R-1007'), state: 'Withdrawn' as const }
  const store = new MemoryStore({
    initial: { ...emptyPlanState(s.plan.baselineId), requests: [changed] },
    deps: { now: () => AT },
  })
  const by = { personId: personaOf(s, 'hr-admin').employeeId, name: 'HR admin', mode: 'hr-admin' as const }
  for (const field of ['state', 'note'])
    await store.appendAudit({
      at: AT,
      by: by.personId,
      byName: by.name,
      mode: by.mode,
      object: 'request',
      id: 'R-1007',
      field,
      old: null,
      new: 'Withdrawn',
      effectiveDate: null,
      comment: null,
      commentAudience: null,
    })
  return { store, stored: await store.load(), audit: await store.listAudit() }
}

describe('the sample baseline id (B9)', () => {
  it('names the whole generated sample: two generator versions give two ids, though the Budget did not change', () => {
    expect(s.plan.baselineId).toMatch(/^northgate-[0-9a-f]{12}$/)
    expect(s.plan.baselineId).toBe(sampleBaselineId(s.datasets, s.plan))
    expect(v2.baselineId).toMatch(/^northgate-[0-9a-f]{12}$/)
    expect(v2.baselineId).not.toBe(s.plan.baselineId)
    // The id it replaces read the Budget's lock hash only, which both versions share.
    const budgetOnly = `northgate-${s.locks.budget.hash.slice(7, 19)}`
    expect(s.plan.baselineId).not.toBe(budgetOnly)
    // Its own field is not part of what it names.
    expect(sampleBaselineId(s.datasets, { ...s.plan, baselineId: 'x' } as PlanState)).toBe(s.plan.baselineId)
  })

  it('sets a state stored on the earlier sample aside: never laid over the new one, its log not shown', async () => {
    const { stored, audit } = await storedOnV1()
    expect(stored.baselineId).toBe(s.plan.baselineId)
    // On the first generator's sample the overlay is in force.
    expect(planInForce(stored, s.plan).requests.find((r) => r.requestId === 'R-1007')?.state).toBe(
      'Withdrawn',
    )
    expect(auditInForce(stored, audit, s.plan)).toBe(audit)
    expect(setAsideOf(stored, audit, s.plan)).toBeNull()
    // On the second, the new sample's plan exactly, and the earlier state is offered to save.
    expect(planInForce(stored, v2)).toBe(planInForce(null, v2))
    expect(planInForce(stored, v2).requests).toEqual([])
    expect(auditInForce(stored, audit, v2)).toEqual([])
    const aside = setAsideOf(stored, audit, v2)
    expect(aside).toEqual({ baselineId: s.plan.baselineId, state: stored, audit, at: null })
    expect(earlierSampleOf({ stored, audit, aside: null }, v2)).toEqual(aside)
    // Not on your own data, and not for an empty state.
    expect(setAsideOf(stored, audit, null)).toBeNull()
    expect(setAsideOf(emptyPlanState(s.plan.baselineId), [], v2)).toBeNull()
  })

  it('keeps it aside with its log on the first write, and starts the new sample’s log afresh', async () => {
    const { store, stored, audit } = await storedOnV1()
    const kept: { aside: SetAside; at: string }[] = []
    const out = await runAction(
      {
        store,
        ctx: mgrCtx,
        sample: v2,
        now: () => AT,
        aside: () => setAsideOf(stored, audit, v2),
        keepAside: async (aside, at) => void kept.push({ aside, at }),
      },
      'createRequest',
      {
        type: 'New role',
        managerPositionId: personaOf(s, 'manager-a').positionId,
        level: 'P3',
        location: 'San Jose',
        fte: 1,
        startDate: '2027-01-04',
        reasonCode: 'Growth',
      },
    )
    expect(out.ok).toBe(true)
    // The earlier state and both its entries are kept, before anything replaced them.
    expect(kept).toHaveLength(1)
    expect(kept[0].at).toBe(AT)
    expect(kept[0].aside.state.requests.map((r) => [r.requestId, r.state])).toEqual([['R-1007', 'Withdrawn']])
    expect(kept[0].aside.audit.map((e) => e.seq)).toEqual([1, 2])
    // The store now holds the new sample's overlay only, and a log of this write alone.
    const now = await store.load()
    expect(now.baselineId).toBe(v2.baselineId)
    expect(now.requests.map((r) => r.state)).toEqual(['Draft'])
    const log = await store.listAudit()
    expect(log.map((e) => [e.seq, e.object, e.field])).toEqual([[1, 'request', 'state']])
    expect(verifyChain(log).ok).toBe(true)
    expect(setAsideOf(now, log, v2)).toBeNull()
    expect(planInForce(now, v2).requests.map((r) => r.state)).toEqual(['Draft'])
    // A write on this sample's own overlay keeps nothing aside.
    const again = await runAction(
      { store, ctx: mgrCtx, sample: v2, now: () => AT, aside: () => setAsideOf(now, log, v2) },
      'createRequest',
      {
        type: 'New role',
        managerPositionId: personaOf(s, 'manager-a').positionId,
        level: 'P3',
        location: 'San Jose',
        fte: 1,
        startDate: '2027-01-11',
        reasonCode: 'Growth',
      },
    )
    expect(again.ok).toBe(true)
    expect((await store.listAudit()).map((e) => e.seq)).toEqual([1, 2])
    expect(storedFor(planInForce(await store.load(), v2), v2).baselineId).toBe(v2.baselineId)
  })

  it('keeps the set-aside copy at hcp:plan-aside:<baseline> until it is removed', async () => {
    resetMemoryIdb()
    const { stored, audit } = await storedOnV1()
    expect(await readAside()).toBeNull()
    const aside = setAsideOf(stored, audit, v2) as SetAside
    await keepAside(aside, AT)
    const back = await readAside()
    expect(back).toEqual({ ...aside, audit: [...audit], at: AT })
    // Kept copies are offered on the sample once the stored state has moved on.
    expect(earlierSampleOf({ stored: emptyPlanState(v2.baselineId), audit: [], aside: back }, v2)).toEqual(
      back,
    )
    expect(earlierSampleOf({ stored: null, audit: [], aside: back }, null)).toBeNull()
    expect(memoryIdbEntries().has(`hcp:plan-aside:${s.plan.baselineId}`)).toBe(true)
    usePlan.setState({ aside: back })
    await clearAside(aside.baselineId)
    expect(await readAside()).toBeNull()
    expect(usePlan.getState().aside).toBeNull()
  })

  it('keeps one copy per earlier sample: a second change of the sample never overwrites the first', async () => {
    resetMemoryIdb()
    // Changes on the first generator's sample, set aside on the second's ...
    const { stored, audit } = await storedOnV1()
    await keepAside(setAsideOf(stored, audit, v2) as SetAside, AT)
    // ... then changes on the second generator's sample, set aside on a third's.
    const onV2 = {
      ...emptyPlanState(v2.baselineId),
      requests: [{ ...requestOf(s, 'R-1038'), state: 'Withdrawn' as const }],
    }
    const v3 = { ...v2, baselineId: 'northgate-0123456789ab' }
    const later = '2026-10-01T10:00:00.000Z'
    await keepAside(setAsideOf(onV2, [], v3) as SetAside, later)
    const kept = await readAsides()
    expect(kept.map((k) => [k.baselineId, k.at])).toEqual([
      [v2.baselineId, later],
      [s.plan.baselineId, AT],
    ])
    expect(kept[1].state.requests.map((r) => r.requestId)).toEqual(['R-1007'])
    // The latest is offered first; removing it offers the other, still whole.
    expect((await readAside())?.baselineId).toBe(v2.baselineId)
    await clearAside(v2.baselineId as string)
    expect(usePlan.getState().aside?.baselineId).toBe(s.plan.baselineId)
    expect(usePlan.getState().aside?.audit.map((e) => e.seq)).toEqual([1, 2])
    await clearAside(s.plan.baselineId as string)
    expect(await readAsides()).toEqual([])
    expect(usePlan.getState().aside).toBeNull()
  })
})

describe('the baseline id covers what the app shows (M4 recheck B9-b)', () => {
  it('reads the raw extracts’ planted rows: a change to one planted request alone gives another id', () => {
    // The app shows the planted rows of the four raw datasets (starterSample), not the clean ones.
    const shown = starterSample(s.datasets).data
    expect(shown.requests).not.toEqual(s.datasets.requests)
    expect(shown.reqs).not.toEqual(s.datasets.reqs)
    // A build whose planted extract changes one request row, and nothing the generator makes.
    const plantedV2 = {
      ...PLANTED,
      requests: (base: Sample['datasets']) =>
        PLANTED.requests(base).map((r, i) => (i === 3 ? { ...r, updatedAt: '2026-06-12' } : r)),
    }
    expect(plantedV2.requests(s.datasets)).not.toEqual(PLANTED.requests(s.datasets))
    const id = sampleBaselineId(s.datasets, s.plan, plantedV2)
    expect(id).toMatch(/^northgate-[0-9a-f]{12}$/)
    expect(id).not.toBe(s.plan.baselineId)
    // The same for the requisitions extract; the generated sample's own id reads the planted rows.
    const reqsV2 = {
      ...PLANTED,
      reqs: (base: Sample['datasets']) =>
        PLANTED.reqs(base).map((r, i) => (i === 0 ? { ...r, recruiter: 'Someone else' } : r)),
    }
    expect(sampleBaselineId(s.datasets, s.plan, reqsV2)).not.toBe(s.plan.baselineId)
    expect(sampleBaselineId(s.datasets, s.plan, PLANTED)).toBe(s.plan.baselineId)
  })
})

describe('a file made on an earlier sample is never laid over the new one (M4 recheck B9-a)', () => {
  /** HR admin with the switch on, on the second generator's sample, and the earlier sample's Full file. */
  async function onV2() {
    const datasets = {
      ...s.datasets,
      requests: s.datasets.requests.map((r) =>
        r.requestId === 'R-1007' ? { ...r, updatedAt: '2026-06-11' } : r,
      ),
    }
    const sNew: Sample = { ...s, datasets, plan: v2 }
    const { stored, audit } = await storedOnV1()
    const aside = setAsideOf(stored, audit, v2) as SetAside
    const ctx = sampleCtx('hr-admin', { sample: sNew, showPay: true })
    const file = earlierSampleFile(ctx, aside, AT)
    if (!file.ok) throw new Error(file.refused)
    return { ctx, text: file.out.text, aside }
  }

  it('Replace and Merge refuse the "Changes on the earlier sample" file, and the preview says so', async () => {
    const { ctx, text } = await onV2()
    expect(ctx.plan?.baselineId).toBe(v2.baselineId)
    const pv = importPreview(ctx, text, text.length)
    if (!pv.ok) throw new Error(pv.reason)
    // The file holds the earlier sample's state and no datasets.
    expect(pv.file.body.plan.kind === 'full' && pv.file.body.plan.state.baselineId).toBe(s.plan.baselineId)
    expect(pv.file.body.datasets ?? {}).toEqual({})
    expect(pv.replaceRefused).toBe(EARLIER_SAMPLE_FILE_TEXT)
    expect(pv.mergeRefused).toBe(EARLIER_SAMPLE_FILE_TEXT)
    const actx = actionContextOf(ctx, { readOnly: false, at: AT })
    const state = ctx.plan as PlanState
    for (const act of [replaceWorkspace, mergeWorkspace]) {
      const out = act(state, actx, { file: pv.file })
      expect(out.ok, act.name).toBe(false)
      if (!out.ok) expect(out.refused, act.name).toBe(EARLIER_SAMPLE_FILE_TEXT)
    }
    // The new sample's plan stays in force: R-1007 is the new sample's copy, not the earlier state's.
    expect(planInForce(state, v2).requests.find((r) => r.requestId === 'R-1007')?.state).not.toBe('Withdrawn')
  })

  it('takes it on the sample it was made on, and takes a Full file with its own datasets anywhere', async () => {
    const { text, aside } = await onV2()
    // On the first generator's sample the same file replaces as any Full file does.
    const onV1 = sampleCtx('hr-admin', { showPay: true })
    expect(onV1.plan?.baselineId).toBe(aside.baselineId)
    const pv = importPreview(onV1, text, text.length)
    if (!pv.ok) throw new Error(pv.reason)
    expect(pv.replaceRefused).toBeNull()
    expect(pv.mergeRefused).toBeNull()
    const out = replaceWorkspace(onV1.plan as PlanState, actionContextOf(onV1, { readOnly: false, at: AT }), {
      file: pv.file,
    })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.next.baselineId).toBe(s.plan.baselineId)
      expect(planInForce(out.next, s.plan).requests.find((r) => r.requestId === 'R-1007')?.state).toBe(
        'Withdrawn',
      )
    }
    // A Full file that carries its datasets is your own data wherever it is opened.
    const full = fullFile(onV1, AT)
    if (!full.ok) throw new Error(full.refused)
    const { ctx } = await onV2()
    const fpv = importPreview(ctx, full.out.text, full.out.text.length)
    if (!fpv.ok) throw new Error(fpv.reason)
    expect(fpv.replaceRefused).toBeNull()
    const rep = replaceWorkspace(ctx.plan as PlanState, actionContextOf(ctx, { readOnly: false, at: AT }), {
      file: fpv.file,
    })
    expect(rep.ok).toBe(true)
    if (rep.ok) expect(rep.next.baselineId).toBeNull()
  })
})
