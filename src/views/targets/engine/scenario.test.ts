/**
 * Targets walked through the write path (docs/PLAN.md 6.9, 8.3, 9.4, 10.5; docs/CONTRACTS-M3.md 3,
 * finance-ui): Finance sets Silicon Engineering's FY27 target from the Gap tab's model and the change
 * shows in Target changes as each mode may read it (a cost reads "changed" outside HR admin); the
 * unit's SVP splits the target into sub-org targets inside the envelope, moves target between two
 * sub-orgs, and is refused past the envelope, which Finance may go past. Every input comes from the
 * models' `writes`; after each flow the audit chain verifies and each entry is signed by the step's
 * Acting as person.
 */
import { describe, expect, it } from 'vitest'
import { chainOk, scenario, type Who } from '@/app/write/scenario.testkit'
import type { TargetRow } from '@/data/schema'
import { PAST_ENVELOPE_TEXT, SPLIT_SAVED_NOTICE, TARGET_SAVED_NOTICE } from '@/plan/actions/copy'
import { personaOf } from '@/testkit/sample'
import { targetsModel } from './index'
import { splitChildrenOf } from './writes'

const SE = 'Silicon Engineering'

describe('Targets: set, split and move (6.9, 10.5)', () => {
  it('Finance sets a target; the SVP splits and moves inside the envelope; past it needs Finance', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const svp = personaOf(s, 'leader-svp-se')
    const lead: Who = { mode: 'leader', personId: svp.employeeId }
    const hr: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }

    // Finance sets the unit's heads, then its cost, from the model's row.
    let gap = targetsModel(await sc.ctx(fin)).gap
    const unit = gap.writes.rows.find(
      (r) => r.row.businessUnit === SE && !r.row.leaderPositionId && !r.row.department,
    )
    expect(unit).toBeDefined()
    const row = unit?.row as TargetRow
    const set = await sc.run(fin, 'setTarget', { row: { ...row, targetHeads: row.targetHeads + 4 } })
    expect(set.outcome).toEqual({ ok: true, notice: TARGET_SAVED_NOTICE })
    expect(set.entries.every((e) => e.by === fin.personId && e.object === 'target')).toBe(true)
    const cost = await sc.run(fin, 'setTarget', {
      row: { ...row, targetHeads: row.targetHeads + 4, targetCost: (row.targetCost ?? 0) + 250_000 },
    })
    expect(cost.outcome.ok).toBe(true)
    gap = targetsModel(await sc.ctx(fin)).gap
    expect(gap.rows.rows.find((r) => r.org === SE)?.targetHeads).toBe(row.targetHeads + 4)
    const changes = gap.changes.rows
    expect(changes.map((c) => [c.org, c.fieldLabel, c.oldText, c.newText, c.byName])).toEqual([
      [SE, 'Target cost', 'changed', 'changed', personaOf(s, 'finance-fpa').name],
      [
        SE,
        'Target heads',
        String(row.targetHeads),
        String(row.targetHeads + 4),
        personaOf(s, 'finance-fpa').name,
      ],
    ])
    // HR admin reads the cost change's amounts; the unit's HRBP reads it as Finance does.
    const adminChanges = targetsModel(await sc.ctx(admin)).gap.changes.rows
    expect(adminChanges.find((c) => c.fieldLabel === 'Target cost')?.newText).not.toBe('changed')
    const hrChanges = targetsModel(await sc.ctx(hr)).gap.changes.rows
    expect(hrChanges.map((c) => [c.fieldLabel, c.newText])).toEqual([
      ['Target cost', 'changed'],
      ['Target heads', String(row.targetHeads + 4)],
    ])

    // The SVP splits from the model's choice: two sub-orgs, inside the envelope.
    let subs = targetsModel(await sc.ctx(lead)).suborgs
    const choice = subs.writes.split.choices.find((c) => c.parentLeaderPositionId === svp.positionId)
    expect(choice?.envelopeHeads).toBe(row.targetHeads + 4)
    const [a, b] = choice?.children ?? []
    const inside = [a, b].map((c) => ({
      leaderPositionId: c.leaderPositionId,
      targetHeads: 100,
      targetCost: null,
    }))
    const split = await sc.run(lead, 'splitTarget', {
      fiscalYear: 'FY27',
      parentLeaderPositionId: svp.positionId,
      children: inside,
    })
    expect(split.outcome).toEqual({ ok: true, notice: SPLIT_SAVED_NOTICE })
    expect(split.entries.every((e) => e.by === lead.personId)).toBe(true)
    subs = targetsModel(await sc.ctx(lead)).suborgs
    const heads = (id: string) => subs.rows.rows.find((r) => r.positionId === id)?.targetHeads
    expect([heads(a.leaderPositionId), heads(b.leaderPositionId)]).toEqual([100, 100])
    expect(
      subs.writes.split.choices
        .find((c) => c.parentLeaderPositionId === svp.positionId)
        ?.children.slice(0, 2)
        .map((c) => c.targetHeads),
    ).toEqual([100, 100])

    // Move 10 heads between them; the parent's total stays.
    const move = await sc.run(lead, 'moveTarget', {
      fiscalYear: 'FY27',
      fromLeaderPositionId: a.leaderPositionId,
      toLeaderPositionId: b.leaderPositionId,
      heads: 10,
      cost: null,
    })
    expect(move.outcome.ok).toBe(true)
    subs = targetsModel(await sc.ctx(lead)).suborgs
    expect([heads(a.leaderPositionId), heads(b.leaderPositionId)]).toEqual([90, 110])

    // Past the envelope: refused for the leader, allowed for Finance (target.exception).
    const past = [a, b].map((c) => ({
      leaderPositionId: c.leaderPositionId,
      targetHeads: 400,
      targetCost: null,
    }))
    const input = { fiscalYear: 'FY27' as const, parentLeaderPositionId: svp.positionId, children: past }
    expect((await sc.run(lead, 'splitTarget', input)).outcome).toEqual({
      ok: false,
      refused: PAST_ENVELOPE_TEXT,
    })
    expect(targetsModel(await sc.ctx(fin)).suborgs.writes.pastEnvelope).toBe(true)
    expect((await sc.run(fin, 'splitTarget', input)).outcome.ok).toBe(true)

    // Finance reads the leader's changes in Target changes, signed with the leader's name.
    const finChanges = targetsModel(await sc.ctx(fin)).gap.changes.rows
    const byLeader = finChanges.filter((c) => c.byName === svp.name)
    expect(byLeader.length).toBeGreaterThanOrEqual(4)
    expect(byLeader.every((c) => c.modeLabel === 'Leader' && c.fieldLabel === 'Target heads')).toBe(true)
    // The leader reads its org's rows' changes too; a target's cost always reads "changed" there.
    const leadChanges = targetsModel(await sc.ctx(lead)).gap.changes.rows
    expect(leadChanges.length).toBeGreaterThan(0)
    for (const c of leadChanges.filter((x) => x.fieldLabel === 'Target cost'))
      expect(c.newText).toBe('changed')
    expect(chainOk(await sc.log())).toBe(true)
  }, 240_000)

  it('a Leader’s heads-only split keeps every sub-org’s exact cost target (review UI-2)', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const lead: Who = { mode: 'leader', personId: personaOf(s, 'leader-svp-se').employeeId }
    // Finance splits the SVP's target with exact costs no rounded box can show.
    const fChoice = targetsModel(await sc.ctx(fin)).suborgs.writes.split.choices.find((c) =>
      c.parentLabel.startsWith(SE),
    )
    const kids = fChoice?.children ?? []
    expect(kids.length).toBeGreaterThan(1)
    const exact = kids.map((k, i) => ({
      leaderPositionId: k.leaderPositionId,
      targetHeads: 50 + i,
      targetCost: 5_123_456 + i * 1_000,
    }))
    const split = await sc.run(fin, 'splitTarget', {
      fiscalYear: 'FY27',
      parentLeaderPositionId: fChoice?.parentLeaderPositionId as string,
      children: exact,
    })
    expect(split.outcome.ok).toBe(true)
    // The SVP changes one sub-org's heads only, from its form's boxes (costs shown rounded down).
    const w = targetsModel(await sc.ctx(lead)).suborgs.writes
    const choice = w.split.choices[0]
    const heads = Object.fromEntries(
      choice.children.map((c) => [c.leaderPositionId, String(c.targetHeads ?? 0)]),
    )
    const costs = Object.fromEntries(
      choice.children.map((c) => [c.leaderPositionId, String(c.targetCostUsd ?? '')]),
    )
    heads[exact[0].leaderPositionId] = '49'
    const out = await sc.run(lead, 'splitTarget', {
      fiscalYear: w.fiscalYear,
      parentLeaderPositionId: choice.parentLeaderPositionId,
      children: splitChildrenOf(choice, w, heads, costs, new Set()),
    })
    expect(out.outcome.ok).toBe(true)
    expect(out.entries.map((e) => e.field)).toEqual(['targetHeads'])
    const stored = (await sc.plan()).overlay.targets
    for (const c of exact)
      expect(
        stored.find((t) => t.leaderPositionId === c.leaderPositionId)?.targetCost,
        c.leaderPositionId,
      ).toBe(c.targetCost)
    expect(stored.find((t) => t.leaderPositionId === exact[0].leaderPositionId)?.targetHeads).toBe(49)
    expect(chainOk(await sc.log())).toBe(true)
  }, 240_000)
})
