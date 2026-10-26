/**
 * The records panel and the position card in every mode (docs/PLAN.md 8.2, 8.3, 8.4 and 9.5): a
 * number whose kind the mode does not list is plain text; rows outside the scope are counted in one
 * line; a position outside the scope is the limited card; names follow the mode's holder column;
 * Manager mode shows no amount, Finance and the rounded modes no per-position amount; audit rows on
 * a card come from `auditView`; the panel's own copy keeps the copy rules. The scopes and the
 * person-level rules are the access layer's: here they are stand-ins that keep to the contract.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { BANNED_MODE_WORDS } from '@/access/copy'
import { DRILL_KINDS } from '@/access/ids'
import { MODES } from '@/access/modes'
import type { ScopeLock, UnitScope } from '@/access/scopes/types'
import type { AnalyticsContext } from '@/data/context'
import { toPosition } from '@/plan/engine/versions'
import type { AuditEntry, Position } from '@/plan/types'
import { kindHiddenLine, payAmountsNote, recordsOutsideLine } from './guard'
import { ALL_DRILL_KINDS, drillTarget, listsEveryKind } from './kinds'
import { positionCardModel } from './position'
import { buildDrillTable, rowPosition } from './records'
import { drillContext } from './testkit'
import { drillSpec } from './types'

vi.mock('@/access/records', async (orig) => ({
  ...(await orig<typeof import('@/access/records')>()),
  positionInScope: (id: string | null | undefined, access: { scope?: ScopeLock | null } | null | undefined) =>
    !access?.scope || (!!id && access.scope.positionIds.has(id)),
}))
vi.mock('@/access/visibility', async (orig) => ({
  ...(await orig<typeof import('@/access/visibility')>()),
  viewerOf: (ctx: AnalyticsContext) => ({ mode: ctx.access.mode, personId: null }),
  requestView: () => 'full',
  // Outside HR admin an audit row carries no seq, prevHash or hash (8.4 rule 7).
  auditView: (e: AuditEntry, viewer: { mode: string }) => {
    if (viewer.mode === 'hr-admin') return e
    const { seq: _s, prevHash: _p, hash: _h, ...row } = e
    return row
  },
}))

let hr: AnalyticsContext
let positions: Position[]
let unit: UnitScope

beforeAll(() => {
  hr = drillContext('hr-admin')
  positions = [...hr.positionIndex.byId.values()].map(toPosition)
  const se = positions.filter((p) => p.businessUnit === 'Silicon Engineering')
  unit = {
    kind: 'unit',
    unit: 'Silicon Engineering',
    positionIds: new Set(se.map((p) => p.positionId)),
    personIds: new Set(),
    otherDepartments: new Set(),
    leaderPositionIds: new Set(),
    size: se.length,
    label: 'Silicon Engineering',
  }
}, 120_000)

describe('drill kinds per mode', () => {
  it('knows every kind the access layer decides', () => {
    expect([...ALL_DRILL_KINDS]).toEqual([...DRILL_KINDS])
  })

  it('a number whose kind the mode does not list is plain text; a listed one opens', () => {
    const finance = drillContext('finance', { access: { hidden: ['drill:assignments', 'drill:workers'] } })
    expect(listsEveryKind(finance.access)).toBe(false)
    const people = drillSpec({ kind: 'workers', title: 'People', rows: [] })
    const seats = drillSpec({ kind: 'positions', title: 'Seats', rows: [] })
    expect(drillTarget(finance.access, people)).toBeNull()
    expect(drillTarget(finance.access, () => people)).toBeNull()
    expect(drillTarget(finance.access, () => seats)).toEqual(seats)
    // HR admin lists every kind: the source stays lazy.
    const lazy = () => people
    expect(drillTarget(hr.access, lazy)).toBe(lazy)
    // A source that throws stays a button (it fails on click, never while the page renders).
    const broken = () => {
      throw new Error('boom')
    }
    expect(drillTarget(finance.access, broken)).toBe(broken)
  })

  it('says what is left out, in plain words with no mode word the copy rules ban', () => {
    const hrbp = drillContext('hrbp', { access: { scope: unit } })
    expect(recordsOutsideLine(hrbp.access, 12)).toBe('12 records outside Silicon Engineering are not listed.')
    expect(recordsOutsideLine(hrbp.access, 1)).toBe('1 record outside Silicon Engineering is not listed.')
    expect(recordsOutsideLine(hrbp.access, 0)).toBeNull()
    expect(recordsOutsideLine(hr.access, 12)).toBeNull()
    const unset = drillContext('manager', { access: { unset: true } })
    expect(recordsOutsideLine(unset.access, 3)).toBe('3 records are not listed until a manager is picked.')
    const lines: string[] = []
    for (const mode of MODES) {
      const c = drillContext(mode, { access: mode === 'hr-admin' ? {} : { hidden: ['pay:switch'] } })
      lines.push(kindHiddenLine(c.access), payAmountsNote(c.access))
    }
    expect(kindHiddenLine(drillContext('finance').access)).toBe(
      'These records are not shown in Finance mode.',
    )
    for (const line of lines) {
      expect(line).not.toMatch(/—|!/)
      for (const w of BANNED_MODE_WORDS) expect(line.toLowerCase(), line).not.toContain(w)
    }
  })
})

describe('rows and positions per mode', () => {
  it('opens only positions inside the scope', () => {
    const hrbp = drillContext('hrbp', { access: { scope: unit } })
    const inside = positions.find((p) => unit.positionIds.has(p.positionId)) as Position
    const outside = positions.find((p) => !unit.positionIds.has(p.positionId)) as Position
    const t = buildDrillTable(drillSpec({ kind: 'positions', title: 'Mixed', rows: [inside, outside] }), hrbp)
    expect(rowPosition(hrbp, t.rows[0])).toBe(inside.positionId)
    expect(rowPosition(hrbp, t.rows[1])).toBeNull()
    // Without a scope every position opens.
    expect(rowPosition(hr, t.rows[1])).toBe(outside.positionId)
  })

  it('a position outside the scope is the limited card: its ID, title and one line', () => {
    const hrbp = drillContext('hrbp', { access: { scope: unit } })
    const outside = positions.find((p) => !unit.positionIds.has(p.positionId) && p.title) as Position
    const card = positionCardModel(hrbp, outside.positionId)
    expect(card).toMatchObject({
      outside: true,
      outsideLine: 'Outside Silicon Engineering.',
      title: outside.title,
      holder: null,
      history: [],
      holders: [],
      requests: [],
      audit: [],
      reqs: 0,
    })
    const full = positionCardModel(
      hrbp,
      positions.find((p) => unit.positionIds.has(p.positionId))?.positionId as string,
    )
    expect(full.outside).toBe(false)
    expect(full.history.length).toBeGreaterThan(0)
  })

  it('names holders unless the mode hides the holder column', () => {
    const filled = positions.find((p) => positionCardModel(hr, p.positionId).holder) as Position
    expect(positionCardModel(hr, filled.positionId).holder).toEqual(expect.any(String))
    const hidden = drillContext('finance', { access: { hidden: ['column:positions.holder'] } })
    const card = positionCardModel(hidden, filled.positionId)
    expect(card.holder).toBeNull()
    expect(card.holders.every((h) => h.name === null)).toBe(true)
    const t = buildDrillTable(drillSpec({ kind: 'positions', title: 'One', rows: [filled] }), hidden)
    expect(t.columns.map((c) => c.key)).not.toContain('holder')
    expect(t.rows[0].holder).toBeUndefined()
  })

  it('Manager mode: no amount column of any kind, and no amount in a row', () => {
    const manager = drillContext('manager')
    const rows = positions.slice(0, 3)
    const t = buildDrillTable(
      drillSpec({
        kind: 'positions',
        title: 'Team',
        rows,
        extra: {
          columns: [
            { key: 'bandEstimate', label: 'Band estimate (USD)', format: 'moneyFull', band: true },
            { key: 'costAnnual', label: 'Annual cost (USD)', format: 'moneyFull', pay: true },
          ],
          values: () => ({ bandEstimate: 150_000, costAnnual: 182_000 }),
        },
      }),
      manager,
    )
    for (const r of t.rows) {
      expect(r.bandEstimate).toBeUndefined()
      expect(r.costAnnual).toBeUndefined()
    }
    expect(JSON.stringify(t.rows)).not.toMatch(/150000|182000/)
  })

  it('Finance and the rounded modes: no per-position amount, band estimates stay', () => {
    for (const mode of ['finance', 'hrbp', 'leader'] as const) {
      const c = drillContext(mode)
      const t = buildDrillTable(
        drillSpec({
          kind: 'positions',
          title: 'Openings',
          rows: positions.slice(0, 2),
          extra: {
            columns: [
              { key: 'bandEstimate', label: 'Band estimate (USD)', format: 'moneyFull', band: true },
              { key: 'costAnnual', label: 'Annual cost (USD)', format: 'moneyFull', pay: true },
            ],
            values: () => ({ bandEstimate: 150_000, costAnnual: 182_000 }),
          },
        }),
        c,
      )
      expect(t.rows[0].bandEstimate, mode).toBe(150_000)
      expect(t.rows[0].costAnnual, mode).toBeUndefined()
    }
    // HR admin with the switch on sees the per-position amount.
    const on = drillContext('hr-admin', { showPay: true })
    const t = buildDrillTable(
      drillSpec({
        kind: 'positions',
        title: 'Priced',
        rows: positions.slice(0, 1),
        extra: {
          columns: [{ key: 'costAnnual', label: 'Annual cost (USD)', format: 'moneyFull', pay: true }],
          values: () => ({ costAnnual: 182_000 }),
        },
      }),
      on,
    )
    expect(t.rows[0].costAnnual).toBe(182_000)
  })

  it('a card’s audit rows carry no chain fields outside HR admin', () => {
    const seat = positions[0].positionId
    const entry: AuditEntry = {
      seq: 7,
      at: '2026-09-12T10:00:00.000Z',
      by: 'E1',
      byName: 'Avery Lin',
      mode: 'hrbp',
      object: 'position',
      id: seat,
      field: 'startDate',
      old: '2027-01-01',
      new: '2027-03-01',
      effectiveDate: '2026-09-12',
      comment: null,
      commentAudience: null,
      prevHash: 'sha256-a',
      hash: 'sha256-b',
    }
    const admin = positionCardModel({ ...hr, audit: [entry] }, seat)
    expect(admin.audit[0]).toMatchObject({ seq: 7, hash: 'sha256-b' })
    const hrbp = drillContext('hrbp')
    const row = positionCardModel({ ...hrbp, audit: [entry] }, seat).audit[0]
    expect(row).toBeDefined()
    expect(Object.keys(row)).not.toContain('seq')
    expect(Object.keys(row)).not.toContain('prevHash')
    expect(Object.keys(row)).not.toContain('hash')
  })
})
