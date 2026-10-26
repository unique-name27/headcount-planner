/**
 * What each scope does to every dataset (docs/PLAN.md 8.2 and 16.2; the template app's
 * scopes/context.test), through `buildContext` on the sample with the default clamp (the Acting as
 * picks held over the lists in force): every row of every dataset in `ctx.data` is inside the scope
 * (tree: positions strictly below the root seats, never the root or above; unit: the business unit);
 * `ctx.all` is untouched; `isCompany` is false; a missing or gone pick holds nobody, never the
 * company; a CEO, CFO or CHRO pick sees the company; the records guard agrees with the data; and the
 * comparison is resolved per mode (FY28 Working: the FY28 target in all five modes; FY27: Finance's
 * Budget, the plan of record elsewhere).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import {
  cachedSample,
  FY27_BUDGET,
  FY27_Q1_REFORECAST,
  FY28_WORKING,
  SAMPLE_AS_OF,
  type Sample,
} from '@/data/sample'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { writeBlock } from '../context'
import { PICK_BEFORE_CHANGES } from '../copy'
import { type ActingAs, MODES, type Mode, type ModePicks, NO_PICKS, PAY_OF } from '../modes'
import { findingsInMode, kpisInMode } from '../numbers'
import { samplePicks } from '../store'
import { managerText } from '../visibility'
import { inScope, personInScope, positionInScope, rowsInScope } from './records'
import type { TreeScope, UnitScope } from './types'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const SE = 'Silicon Engineering'
let sample: Sample
let sources: Record<DatasetKey, SourceMeta>
let picks: ModePicks
let admin: AnalyticsContext

const persona = (key: string) => sample.personas.find((p) => p.key === key)!
const pickOf = (key: string): ActingAs => ({ personId: persona(key).employeeId, name: persona(key).name })

function ctxFor(
  mode: Mode,
  actingAs: ModePicks = picks,
  extra: { filters?: Partial<Filters>; showPay?: boolean; version?: string | null } = {},
): AnalyticsContext {
  return buildContext({
    data: sample.datasets,
    sources,
    filters: { ...DEFAULT_FILTERS, ...extra.filters },
    asOfOverride: null,
    today: SAMPLE_AS_OF,
    mode,
    actingAs,
    versions: sample.plan.versions,
    picks: { version: extra.version ?? null, compare: null },
    ...(extra.showPay != null ? { showPay: extra.showPay } : {}),
  })
}

beforeAll(() => {
  sample = cachedSample()
  sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: sample.datasets[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
  picks = samplePicks(sample.personas)
  admin = ctxFor('hr-admin')
}, 60_000)

/**
 * `all` is never narrowed. In Manager mode the position rows read their titles and job families
 * through `managerText` (M4 review EX-3, src/data/context.tsx `positionsIn`): every row is still
 * there, in order, with every other field as imported; every other dataset is the same object.
 */
function expectAllUntouched(ctx: AnalyticsContext): void {
  for (const k of DATASET_KEYS) {
    if (k === 'positions' && ctx.mode === 'manager') continue
    expect(ctx.all[k], k).toBe(admin.all[k])
  }
  if (ctx.mode !== 'manager') return
  const mine = ctx.all.positions
  const theirs = admin.all.positions
  expect(mine.length).toBe(theirs.length)
  theirs.forEach((p, i) => {
    const washed = {
      ...p,
      title: p.title ? managerText(p.title, { mode: 'manager' }) : p.title,
      jobFamily: p.jobFamily ? managerText(p.jobFamily, { mode: 'manager' }) : p.jobFamily,
    }
    expect(mine[i], p.positionId).toEqual(washed)
  })
}

/** Every row of every dataset in `ctx.data` is inside the context's scope. */
function expectEveryRowInScope(ctx: AnalyticsContext): void {
  const d = ctx.data
  for (const p of d.positions) expect(positionInScope(p.positionId, ctx.access), p.positionId).toBe(true)
  for (const w of d.workers) expect(inScope('workers', w, ctx), w.employeeId).toBe(true)
  for (const c of d.comp) expect(personInScope(c.employeeId, ctx.access), c.employeeId).toBe(true)
  for (const r of d.reqs) expect(inScope('reqs', r, ctx), r.reqId).toBe(true)
  for (const r of d.requests) expect(inScope('requests', r, ctx), r.requestId).toBe(true)
  for (const t of d.targets) expect(inScope('targets', t, ctx), JSON.stringify(t)).toBe(true)
  for (const f of d.freezes) expect(inScope('freezes', f, ctx), f.freezeId).toBe(true)
  expect(d.assumptions).toBe(admin.all.assumptions)
}

describe('tree (Manager and Leader)', () => {
  const cases: [string, Mode, string][] = [
    ['Manager A', 'manager', 'manager-a'],
    ['Manager B', 'manager', 'manager-b'],
    ['Manager C', 'manager', 'manager-c'],
    ['the SVP of Silicon Engineering', 'leader', 'leader-svp-se'],
    ['the Design Verification director', 'leader', 'leader-dv-director'],
  ]
  for (const [who, mode, key] of cases)
    it(`keeps every row inside ${who}'s tree, and nothing about their own seat`, () => {
      const ctx = ctxFor(mode, { ...NO_PICKS, [mode]: pickOf(key) })
      const s = ctx.access.scope as TreeScope
      expect(s.kind).toBe('tree')
      expect(ctx.access.unset).toBe(false)
      expect(ctx.isCompany).toBe(false)
      expect(ctx.scopeLabel).toBe(s.label)
      expect(s.rootPositionIds.has(persona(key).positionId)).toBe(true)
      expect(s.positionIds.has(persona(key).positionId)).toBe(false)
      expect(ctx.data.positions.length).toBeGreaterThan(0)
      expectEveryRowInScope(ctx)
      // Nothing about the root seat or the person acting reaches the data.
      for (const p of ctx.data.positions) expect(s.rootPositionIds.has(p.positionId)).toBe(false)
      for (const w of ctx.data.workers) expect(w.employeeId).not.toBe(persona(key).employeeId)
      for (const c of ctx.data.comp) expect(c.employeeId).not.toBe(persona(key).employeeId)
      for (const r of ctx.data.requests) {
        expect(r.positionId ?? '', r.requestId).not.toBe(persona(key).positionId)
        expect(r.fromPositionId ?? '', r.requestId).not.toBe(persona(key).positionId)
      }
      // The filters hold the root seat, include only.
      expect(s.rootPositionIds.has(ctx.filters.leaderId ?? '')).toBe(true)
      expectAllUntouched(ctx)
    })

  it("leaves Manager C's own elimination out of Manager C's data", () => {
    const ctx = ctxFor('manager', { ...NO_PICKS, manager: pickOf('manager-c') })
    expect(ctx.data.requests.map((r) => r.requestId)).not.toContain(sample.planted.managerCElimination)
    expect(admin.data.requests.map((r) => r.requestId)).toContain(sample.planted.managerCElimination)
  })

  it('gives the sub-orgs of an org with their cost atoms where they are whole unions', () => {
    const ctx = ctxFor('leader', { ...NO_PICKS, leader: pickOf('leader-svp-se') })
    const s = ctx.access.scope as TreeScope
    expect(s.subOrgs.length).toBeGreaterThan(1)
    for (const o of s.subOrgs) {
      expect(s.positionIds.has(o.positionId)).toBe(true)
      for (const id of o.positionIds) expect(s.positionIds.has(id)).toBe(true)
      expect(o.label).toMatch(/\(.+\)$/)
    }
    // VPs and directors head leader seats, so their sub-orgs are unions of atoms (7.3a).
    expect(s.subOrgs.some((o) => (o.atoms?.length ?? 0) > 0)).toBe(true)
  })

  it('narrows inside the tree and says so on the scope line', () => {
    const base = ctxFor('leader', { ...NO_PICKS, leader: pickOf('leader-svp-se') })
    const c = ctxFor(
      'leader',
      { ...NO_PICKS, leader: pickOf('leader-svp-se') },
      { filters: { location: ['Bengaluru'] } },
    )
    expect(c.scopeLabel).toBe(`${(base.access.scope as TreeScope).label}, Bengaluru`)
    expect(c.data.positions.length).toBeLessThan(base.data.positions.length)
    expectEveryRowInScope(c)
    // A link for a leader outside the org opens inside it.
    const outside = ctxFor(
      'leader',
      { ...NO_PICKS, leader: pickOf('leader-svp-se') },
      { filters: { leaderId: persona('finance-fpa').positionId } },
    )
    expect(outside.filters.leaderId).toBe(base.filters.leaderId)
  })

  it('shows the company to the CFO', () => {
    const ctx = ctxFor('leader', { ...NO_PICKS, leader: pickOf('leader-cfo') })
    expect(ctx.access.scope).toBeNull()
    expect(ctx.access.unset).toBe(false)
    expect(ctx.isCompany).toBe(true)
    expect(ctx.data.positions).toBe(admin.all.positions)
  })
})

describe('unit (HRBP)', () => {
  it('holds the unit through the pinned filter and keeps every row inside it', () => {
    const ctx = ctxFor('hrbp')
    const s = ctx.access.scope as UnitScope
    expect(s).toMatchObject({ kind: 'unit', unit: SE, label: SE })
    expect(ctx.filters.businessUnit).toEqual([SE])
    expect(ctx.scopeLabel).toBe(SE)
    expect(ctx.data.positions.length).toBeGreaterThan(500)
    expectEveryRowInScope(ctx)
    for (const w of ctx.data.workers) if (!w.positionId) expect(w.businessUnit).toBe(SE)
    expectAllUntouched(ctx)
  })

  it("holds each unit for that unit's HRBP", () => {
    const units = [...new Set(admin.all.positions.map((p) => p.businessUnit))]
    expect(units.length).toBe(6)
    for (const [unit, idx] of sample.world.hrbp) {
      const person = sample.world.people[idx]
      const ctx = ctxFor('hrbp', { ...NO_PICKS, hrbp: { personId: person.id, name: person.name, unit } })
      expect(ctx.access.unset, unit).toBe(false)
      expect((ctx.access.scope as UnitScope).unit, unit).toBe(unit)
      expectEveryRowInScope(ctx)
    }
  })

  it("holds another unit's request that touches the unit, for the receiving HRBP", () => {
    const id = sample.planted.crossUnitMove
    const row = admin.all.requests.find((r) => r.requestId === id)!
    const to = admin.positionIndex.byId.get(row.toPositionId ?? '')!
    expect(to.businessUnit).not.toBe(row.businessUnit)
    const hrbp = sample.world.people[sample.world.hrbp.get(to.businessUnit)!]
    const pick = { personId: hrbp.id, name: hrbp.name, unit: to.businessUnit }
    const ctx = ctxFor('hrbp', { ...NO_PICKS, hrbp: pick })
    expect(ctx.data.requests.map((r) => r.requestId)).toContain(id)
    expectEveryRowInScope(ctx)
    // A narrower filter keeps exactly its own rows.
    const narrow = ctxFor('hrbp', { ...NO_PICKS, hrbp: pick }, { filters: { location: ['Hsinchu'] } })
    expect(narrow.data.requests.map((r) => r.requestId)).not.toContain(id)
  })

  it('narrows inside the unit and says so on the scope line', () => {
    const c = ctxFor('hrbp', picks, { filters: { location: ['Munich'], modes: { location: 'exclude' } } })
    expect(c.scopeLabel).toBe(`${SE}, not Munich`)
    for (const p of c.data.positions) expect(p.location).not.toBe('Munich')
    expect(ctxFor('hrbp', picks, { filters: { businessUnit: ['Corporate'] } }).filters.businessUnit).toEqual([
      SE,
    ])
  })
})

describe('a pick that is missing or gone holds nobody, never the whole company', () => {
  const nobody: ActingAs = { personId: 'E99999', name: 'Nobody Here' }
  const cases: [string, Mode, () => ActingAs | null, string][] = [
    ['no manager', 'manager', () => null, 'No manager picked'],
    ['a manager not in the data', 'manager', () => nobody, 'No manager picked'],
    // Someone who holds a seat nobody reports to is not a manager.
    ['someone nobody reports to', 'manager', () => pickOf('hr-admin'), 'No manager picked'],
    ['no leader', 'leader', () => null, 'No leader picked'],
    ['a manager below Director', 'leader', () => pickOf('manager-b'), 'No leader picked'],
    ['no HRBP', 'hrbp', () => null, 'No HRBP picked'],
    [
      'a unit not in the data',
      'hrbp',
      () => ({ ...pickOf('hrbp-se'), unit: 'Quantum Division' }),
      'No HRBP picked',
    ],
    // The Units list names someone else as Corporate's HRBP.
    ["another unit's HRBP", 'hrbp', () => ({ ...pickOf('hrbp-se'), unit: 'Corporate' }), 'No HRBP picked'],
  ]
  for (const [name, mode, pick, label] of cases)
    it(`${mode}: ${name}`, () => {
      const c = ctxFor(mode, { ...NO_PICKS, [mode]: pick() })
      expect(c.access.unset).toBe(true)
      expect(c.scopeLabel).toBe(label)
      expect(c.isCompany).toBe(false)
      expect(c.data.positions).toEqual([])
      expect(c.data.workers).toEqual([])
      expect(c.data.requests).toEqual([])
      expect(c.data.reqs).toEqual([])
      expectAllUntouched(c)
    })

  it('lets Finance and HR admin read the company without a pick', () => {
    for (const mode of ['finance', 'hr-admin'] as const) {
      const c = ctxFor(mode, NO_PICKS)
      expect(c.access.unset, mode).toBe(false)
      expect(c.access.scope, mode).toBeNull()
      expect(c.access.actingAs, mode).toBeNull()
      expect(c.data.positions.length, mode).toBe(admin.all.positions.length)
    }
  })
})

describe('the records guard keeps to every scope', () => {
  it('agrees with the data, and lets everything through without a scope', () => {
    for (const c of [ctxFor('hrbp'), ctxFor('manager'), ctxFor('leader')]) {
      const s = c.access.scope!
      const spec = { kind: 'positions' as const, rows: admin.all.positions }
      const { rows, leftOut } = rowsInScope(spec, c)
      expect(rows.length + leftOut).toBe(admin.all.positions.length)
      expect(leftOut).toBeGreaterThan(0)
      for (const r of rows) expect(s.positionIds.has(r.positionId)).toBe(true)
      for (const r of admin.all.requests)
        if (c.data.requests.includes(r)) expect(inScope('requests', r, c), r.requestId).toBe(true)
      expect(inScope('costGroups', {}, c)).toBe(true)
      expect(inScope('assumptions', admin.all.assumptions[0], c)).toBe(true)
    }
    const spec = { kind: 'positions' as const, rows: admin.all.positions }
    expect(rowsInScope(spec, admin)).toEqual({ rows: admin.all.positions, leftOut: 0 })
    expect(positionInScope('anything', admin.access)).toBe(true)
    expect(personInScope('anyone', admin.access)).toBe(true)
  })

  it("keeps a unit's own target in the tree of the unit's one top seat, and in no other tree", () => {
    const unitRows = admin.all.targets.filter((t) => !t.leaderPositionId && !t.costCenter && !t.department)
    expect(unitRows.some((t) => t.businessUnit === SE)).toBe(true)
    // The SVP's seat is Silicon Engineering's one top seat: its target is the SVP's org's (Targets and
    // Forecast show it), so the Target heads drill opens it.
    const svp = ctxFor('leader', { ...NO_PICKS, leader: pickOf('leader-svp-se') })
    for (const t of unitRows)
      expect(inScope('targets', t, svp), JSON.stringify(t)).toBe(t.businessUnit === SE)
    const dv = ctxFor('leader', { ...NO_PICKS, leader: pickOf('leader-dv-director') })
    for (const t of unitRows) expect(inScope('targets', t, dv), JSON.stringify(t)).toBe(false)
    const mgr = ctxFor('manager', { ...NO_PICKS, manager: pickOf('manager-a') })
    for (const t of unitRows) expect(inScope('targets', t, mgr), JSON.stringify(t)).toBe(false)
  })
})

describe('pay and the comparison per mode in the context', () => {
  it('sets showPay only in HR admin with the switch on, and showCost everywhere but Manager', () => {
    for (const mode of MODES)
      for (const on of [false, true]) {
        const c = ctxFor(mode, picks, { showPay: on })
        expect(c.showPay, `${mode} ${on}`).toBe(PAY_OF[mode] === 'switch' && on)
        expect(c.showCost, `${mode} ${on}`).toBe(mode !== 'manager')
        expect(c.access.pay, mode).toBe(PAY_OF[mode])
        expect(c.access.actingAs, mode).toEqual(picks[mode])
      }
  })

  it('compares FY28 Working with the FY28 target in all five modes, and FY27 with Budget in Finance', () => {
    for (const mode of MODES) {
      const fy28 = ctxFor(mode, picks, { version: FY28_WORKING })
      expect(fy28.compare, mode).toEqual({ kind: 'target', fiscalYear: 'FY28', label: 'FY28 target' })
      const fy27 = ctxFor(mode)
      expect(fy27.compare.kind, mode).toBe('version')
      expect(fy27.compare.kind === 'version' && fy27.compare.versionId, mode).toBe(
        mode === 'finance' ? FY27_BUDGET : FY27_Q1_REFORECAST,
      )
    }
  })
})

describe('writes, KPIs and findings in a mode', () => {
  it('refuses changes until the mode has a usable Acting as pick', () => {
    for (const mode of MODES) {
      expect(writeBlock(ctxFor(mode, NO_PICKS).access), mode).toBe(PICK_BEFORE_CHANGES)
      expect(writeBlock(ctxFor(mode).access), mode).toBeNull()
    }
    const gone = ctxFor('manager', { ...NO_PICKS, manager: { personId: 'E99999', name: 'Nobody Here' } })
    expect(writeBlock(gone.access)).toBe(PICK_BEFORE_CHANGES)
  })

  it('drops KPIs and findings whose metric the mode hides, and keeps finding positions to the scope', () => {
    const mgr = ctxFor('manager')
    const s = mgr.access.scope as TreeScope
    const inside = [...s.positionIds][0]
    const kpis = [{ metricId: 'plan.cost.loaded' }, { metricId: 'plan.heads.approved' }, {}]
    expect(kpisInMode(mgr.access, kpis)).toEqual([{ metricId: 'plan.heads.approved' }, {}])
    expect(kpisInMode(admin.access, kpis)).toEqual(kpis)
    const findings = [
      { metricId: 'forecast.cost.fullYear', positions: [] },
      {
        metricId: 'plan.openings.pastStart',
        positions: [{ positionId: inside }, { positionId: [...s.rootPositionIds][0] }, { positionId: 'P-0' }],
        positionsTotal: 3,
      },
    ]
    expect(findingsInMode(mgr.access, findings)).toEqual([
      { metricId: 'plan.openings.pastStart', positions: [{ positionId: inside }], positionsTotal: 1 },
    ])
    expect(findingsInMode(admin.access, findings)).toEqual(findings)
    expect(findingsInMode(null, findings)).toEqual(findings)
  })
})
