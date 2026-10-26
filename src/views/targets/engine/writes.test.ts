/**
 * Targets' write side as each mode's model holds it (docs/PLAN.md 6.9, 8.3, 9.4; M3): Finance and HR
 * admin set targets (the rows as stored, exact cost included) and may split or move past a sub-org's
 * envelope; a Leader splits and moves inside its org only, its sub-org choices the action's own
 * (`ActionEnv.subOrgsOf`) and every target cost it is shown rounded down to the cost step; HRBP and
 * Manager are offered nothing. What a mode must not see: no HRBP, Leader or Manager writes model
 * holds a target's exact cost.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { actionEnvOf } from '@/app/write/context'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { isRoundedCostTo } from '@/lib/costRounding'
import { leakSample, personaCtx, sampleCtx } from '@/testkit/sample'
import { prepare } from './base'
import { targetsModel } from './index'
import { parentsOf } from './suborgs'
import { splitChildrenOf, subOrgsOf } from './writes'

const SE = 'Silicon Engineering'

describe('Targets’ write side per mode', () => {
  let s: Sample
  let fin: AnalyticsContext
  let admin: AnalyticsContext
  let lead: AnalyticsContext
  let hrbp: AnalyticsContext
  let mgr: AnalyticsContext
  beforeAll(() => {
    s = leakSample()
    fin = sampleCtx('finance')
    admin = sampleCtx('hr-admin')
    lead = personaCtx('leader-svp-se')
    hrbp = sampleCtx('hrbp')
    mgr = sampleCtx('manager')
  }, 120_000)

  it('Finance and HR admin set targets: the year’s rows as stored, and every org a new one may name', () => {
    for (const c of [fin, admin]) {
      const w = targetsModel(c).gap.writes
      expect(w.access.shown).toBe(true)
      expect(w.fiscalYear).toBe('FY27')
      const unit = w.rows.find(
        (r) => r.row.businessUnit === SE && !r.row.leaderPositionId && !r.row.department,
      )
      const stored = s.datasets.targets.find(
        (t) =>
          t.fiscalYear === 'FY27' &&
          t.businessUnit === SE &&
          !t.leaderPositionId &&
          !t.department &&
          !t.costCenter,
      )
      expect(unit?.row).toEqual(stored)
      expect(w.orgs.some((o) => o.kind === 'leader')).toBe(true)
      expect(w.yearEnd).toBe('2027-03-31')
    }
  })

  it('the sub-orgs a split names are the action’s, for every parent of the tab', () => {
    for (const c of [fin, lead]) {
      const p = prepare(c)
      const env = actionEnvOf(c)
      const parents = parentsOf(p).filter((x) => x.key.startsWith('tree:'))
      expect(parents.length).toBeGreaterThan(0)
      for (const x of parents) {
        const seat = x.key.slice(5)
        // The form offers exactly the sub-orgs the action takes: both read `subOrgSeatsOf` (UI-8).
        expect([...env.subOrgsOf(seat)], seat).toEqual(subOrgsOf(p, seat))
      }
    }
  })

  it('a parent’s sub-orgs and its envelope cover the same org: never another unit’s seats (UI-8)', () => {
    for (const c of [fin, admin]) {
      const p = prepare(c)
      const choices = targetsModel(c).suborgs.writes.split.choices
      expect(choices.length).toBeGreaterThan(0)
      for (const x of choices) {
        const unit = p.latest.get(x.parentLeaderPositionId)?.businessUnit
        for (const k of x.children)
          expect(p.latest.get(k.leaderPositionId)?.businessUnit, `${x.parentLabel} ${k.label}`).toBe(unit)
      }
      // The CEO's seat heads Executive Office: its 7-head unit target is never split into the unit heads.
      const ceo = choices.find((x) => x.parentLabel.startsWith('Executive Office'))
      for (const k of ceo?.children ?? [])
        expect(p.latest.get(k.leaderPositionId)?.businessUnit, k.label).toBe('Executive Office')
      expect(choices.some((x) => x.children.some((k) => k.leaderPositionId === 'P-1002'))).toBe(false)
    }
  })

  it('a split sends a cost only for the cost boxes changed: a heads-only change keeps every cost target (UI-2)', () => {
    const w = targetsModel(lead).suborgs.writes
    const svp = w.split.choices[0]
    const [a, b] = svp.children
    const heads = Object.fromEntries(
      svp.children.map((c) => [c.leaderPositionId, String(c.targetHeads ?? 0)]),
    )
    const costs = Object.fromEntries(
      svp.children.map((c) => [c.leaderPositionId, String(c.targetCostUsd ?? '')]),
    )
    heads[a.leaderPositionId] = String(Number(heads[a.leaderPositionId]) + 1)
    // Leader mode: the boxes hold rounded-down values, so an untouched box sends no cost.
    const kept = splitChildrenOf(svp, w, heads, costs, new Set())
    expect(kept.length).toBe(svp.children.length)
    for (const c of kept) expect('targetCost' in c, c.leaderPositionId).toBe(false)
    expect(kept.find((c) => c.leaderPositionId === a.leaderPositionId)?.targetHeads).toBe(
      (a.targetHeads ?? 0) + 1,
    )
    // A changed box sends its value; a box emptied removes the cost target.
    costs[b.leaderPositionId] = '1234567'
    costs[a.leaderPositionId] = ''
    const set = splitChildrenOf(svp, w, heads, costs, new Set([a.leaderPositionId, b.leaderPositionId]))
    expect(set.find((c) => c.leaderPositionId === b.leaderPositionId)?.targetCost).toBe(1_234_567)
    expect(set.find((c) => c.leaderPositionId === a.leaderPositionId)?.targetCost).toBeNull()
    // Exact modes send the stored value back for an untouched box.
    const f = targetsModel(fin).suborgs.writes
    const se = f.split.choices.find((c) => c.parentLeaderPositionId === svp.parentLeaderPositionId) ?? svp
    const fHeads = Object.fromEntries(
      se.children.map((c) => [c.leaderPositionId, String(c.targetHeads ?? 0)]),
    )
    const exact = splitChildrenOf(se, f, fHeads, {}, new Set())
    for (const c of exact)
      expect(c.targetCost, c.leaderPositionId).toBe(
        se.children.find((k) => k.leaderPositionId === c.leaderPositionId)?.targetCostUsd,
      )
  })

  it('labels a sub-org by the parents’ rule: its department only when it heads that one (UI-13)', () => {
    const svp = targetsModel(lead).suborgs.writes.split.choices[0]
    const labels = svp.children.map((k) => k.label)
    // The SVP's VPs head several departments each: their titles, never one department's name.
    expect(labels.some((l) => l.startsWith('Architecture ('))).toBe(false)
    expect(labels).toContain('Vice President, Architecture and Digital Design (Rahul Kamaraj)')
  })

  it('a Leader splits and moves inside its envelope, with target costs rounded down; Finance may go past', () => {
    const w = targetsModel(lead).suborgs.writes
    expect(w.split.access.shown).toBe(true)
    expect(w.move.access.shown).toBe(true)
    expect(w.pastEnvelope).toBe(false)
    expect(w.costRounded).toBe(true)
    expect(w.split.choices.length).toBeGreaterThan(0)
    const svp = w.split.choices[0]
    expect(svp.children.length).toBeGreaterThan(1)
    const step = lead.guard.rules.floorUsd
    for (const c of w.split.choices) {
      if (c.envelopeCostUsd != null) expect(isRoundedCostTo(c.envelopeCostUsd, step)).toBe(true)
      for (const k of c.children)
        if (k.targetCostUsd != null) expect(isRoundedCostTo(k.targetCostUsd, step), k.label).toBe(true)
    }
    // Leaders never set a target, so the set form holds no row (and no exact cost).
    expect(targetsModel(lead).gap.writes.access.shown).toBe(false)
    expect(targetsModel(lead).gap.writes.rows).toEqual([])
    const f = targetsModel(fin).suborgs.writes
    expect(f.pastEnvelope).toBe(true)
    expect(f.costRounded).toBe(false)
  })

  it('HRBP and Manager are offered nothing', () => {
    for (const c of [hrbp, mgr]) {
      const m = targetsModel(c)
      expect(m.gap.writes.access.shown).toBe(false)
      expect(m.gap.writes.rows).toEqual([])
      expect(m.gap.writes.orgs).toEqual([])
      expect(m.suborgs.writes.split.choices).toEqual([])
      expect(m.suborgs.writes.move.choices).toEqual([])
    }
  })

  it('what a mode must not see: no target’s exact cost in an HRBP, Leader or Manager writes model', () => {
    const step = fin.guard.rules.floorUsd
    const exact = s.datasets.targets
      .map((t) => t.targetCost)
      .filter((v): v is number => v != null && !isRoundedCostTo(v, step))
    expect(exact.length).toBeGreaterThan(0)
    for (const c of [hrbp, lead, mgr]) {
      const m = targetsModel(c)
      const text = JSON.stringify({
        gap: m.gap.writes,
        suborgs: m.suborgs.writes,
        changes: m.gap.changes.rows,
      })
      for (const v of exact) expect(text.includes(String(v)), `${c.mode} ${v}`).toBe(false)
    }
  })

  it('target changes: none recorded on the sample, an empty table with its words', () => {
    const g = targetsModel(fin).gap.changes
    expect(g.id).toBe('targets-changes')
    expect(g.rows).toEqual([])
    expect(g.empty).toBe('No target has been changed in the app yet.')
  })
})
