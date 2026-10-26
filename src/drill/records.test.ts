/**
 * The records table (docs/PLAN.md 8.3 and 9.5): every HCP kind renders; rows open their position;
 * empty columns drop; a view's extra column replaces a standard one; money columns carry exactly
 * one flag, and the policy's column lists (`PAY_COLUMNS`, `BAND_COLUMNS`, `COMPONENT_COLUMNS`,
 * `LEAVE_COLUMNS`) name real columns with the right flag; per-position amounts never reach a row
 * without the switch; a weighted drill adds its "Counts as" column; requests arrive shaped for the
 * viewer (8.4), so a limited one names nobody and a Backfill never names the leaver.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { BAND_COLUMNS, COMPONENT_COLUMNS, DRILL_KINDS, LEAVE_COLUMNS, PAY_COLUMNS } from '@/access/ids'
import type { Viewer } from '@/access/visibility'
import type { CostRow } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import { toAssignments } from '@/plan/engine/heads'
import { planLineRows } from '@/plan/engine/lineTable'
import { toPosition } from '@/plan/engine/versions'
import type { AuditRow, HcRequest, LockedVersion, PlanLine, Position } from '@/plan/types'
import {
  buildDrillTable,
  DRILLS_KEY,
  drillNoun,
  drillTableHint,
  modeHiddenColumns,
  POSITION_KEY,
  RECORD_KINDS,
  rowPosition,
  standardColumns,
  WEIGHT_KEY,
} from './records'
import { subPositions } from './related'
import { requestRecords } from './requestRecord'
import { requestsOf } from './seats'
import { drillContext, drillSample } from './testkit'
import { type DrillKind, drillSpec, resolveDrill } from './types'

// The person-level rules are the access layer's; here a stand-in: a limited view for eliminations.
vi.mock('@/access/visibility', async (orig) => ({
  ...(await orig<typeof import('@/access/visibility')>()),
  requestView: (req: HcRequest) => (req.type === 'Elimination' ? 'limited' : 'full'),
}))

let ctx: AnalyticsContext
let positions: Position[]
let lines: PlanLine[]

beforeAll(() => {
  ctx = drillContext('hr-admin')
  positions = [...ctx.positionIndex.byId.values()].map(toPosition)
  const budget = drillSample().plan.versions.find((v): v is LockedVersion => v.state === 'locked')
  lines = budget ? [...planLineRows(budget.lines)].slice(0, 40) : []
}, 120_000)

const viewer = { mode: 'hr-admin', personId: null } as unknown as Viewer

const audit: AuditRow = {
  at: '2026-09-12T10:00:00.000Z',
  by: 'E10077',
  byName: 'Avery Lin',
  mode: 'hrbp',
  object: 'position',
  id: 'P-1042',
  field: 'startDate',
  old: '2027-01-01',
  new: '2027-03-01',
  effectiveDate: '2026-09-12',
  comment: 'Moved to March',
  commentAudience: null,
}

const costRow: CostRow = {
  key: 'Silicon Engineering',
  label: 'Silicon Engineering',
  isOther: false,
  folded: 0,
  costed: 412,
  amounts: { base: 60, bonus: 6, burden: 9, benefits: 3, oneTime: 1, vacancy: -2, equity: 4, loaded: 77 },
  bandUsd: 23,
  totalUsd: 100,
  perHeadUsd: 0.2,
  hidden: false,
  componentsHidden: false,
  reason: null,
  positionIds: [],
}

/** A few records of every kind, from the sample where it has them. */
function recordsOf(kind: DrillKind): unknown[] {
  const s = drillSample()
  switch (kind) {
    case 'positions':
      return positions.slice(0, 25)
    case 'planLines':
      return lines
    case 'assignments':
      return toAssignments(s.datasets.workers).slice(0, 25)
    case 'workers':
    case 'reqs':
    case 'targets':
    case 'freezes':
    case 'assumptions':
      return (s.datasets[kind] as unknown[]).slice(0, 25)
    case 'requests':
      return requestRecords(requestsOf(ctx).slice(0, 25), { viewer, asOf: ctx.asOf, nameOf: () => 'Someone' })
    case 'versions':
      return [...s.plan.versions]
    case 'adjustments':
      return [
        {
          id: 'ADJ-1',
          postedIn: '2026-10',
          forMonth: '2026-09',
          positionId: positions[0].positionId,
          kind: 'hire',
          delta: {} as never,
          reason: 'Back-dated hire',
        },
      ]
    case 'audit':
      return [audit]
    case 'exceptions':
      return [
        {
          id: 'not-in-plan:E1',
          kind: 'not-in-plan',
          positionId: null,
          employeeId: 'E1',
          detail: 'An active employee holds no position.',
        },
      ]
    case 'costGroups':
      return [costRow]
    case 'actionItems':
      return [
        {
          id: 'plan:past-start:P-1',
          severity: 'warning',
          severityLabel: 'Watch',
          what: 'An opening is past its target start',
          subject: positions[0].positionId,
          positionId: positions[0].positionId,
          subjectDrill: null,
          ownerGroup: 'Managers',
          owner: 'Priya Raman',
          due: '2026-10-05',
          dueText: 'Due in 5 d',
          from: 'Plan · Openings',
          status: 'Open',
        },
      ]
    case 'actionOwners':
      return [
        {
          owner: 'Priya Raman',
          ownerGroup: 'Managers',
          personId: null,
          items: 3,
          overdue: 1,
          critical: 0,
          itemsDrill: null,
        },
      ]
  }
}

describe('drill tables', () => {
  it('knows exactly the access layer’s drill kinds', () => {
    expect([...RECORD_KINDS].sort()).toEqual([...DRILL_KINDS].sort())
  })

  it('renders every record kind without throwing', () => {
    for (const kind of DRILL_KINDS) {
      const rows = recordsOf(kind)
      expect(rows.length, kind).toBeGreaterThan(0)
      const t = buildDrillTable({ kind, title: kind, rows } as never, ctx)
      expect(t.rows, kind).toHaveLength(rows.length)
      expect(t.columns.length, kind).toBeGreaterThan(1)
    }
  })

  it('lists positions with their derived status, holder and a key that opens the position', () => {
    const filled = positions.find((p) =>
      ctx.all.workers.some((w) => w.positionId === p.positionId && !w.terminationDate),
    )
    expect(filled).toBeDefined()
    const t = buildDrillTable(drillSpec({ kind: 'positions', title: 'One', rows: [filled as Position] }), ctx)
    const r = t.rows[0]
    expect(r[POSITION_KEY]).toBe(filled?.positionId)
    expect(r.status).toBe('Filled')
    expect(typeof r.holder).toBe('string')
    expect(rowPosition(ctx, r)).toBe(filled?.positionId)
    expect(drillNoun('positions', 1)).toBe('1 position')
    expect(drillNoun('positions', 1_204)).toBe('1,204 positions')
    expect(drillNoun('audit', 2)).toBe('2 audit entries')
  })

  it('links a position’s sub-positions, and the count equals the list', () => {
    const boss = positions.find((p) => subPositions(ctx, p.positionId).length >= 3) as Position
    const t = buildDrillTable(drillSpec({ kind: 'positions', title: 'Boss', rows: [boss] }), ctx)
    const r = t.rows[0]
    expect(r.subPositions).toBe(subPositions(ctx, boss.positionId).length)
    const drills = r[DRILLS_KEY] as Record<string, () => unknown>
    const spec = resolveDrill(drills.subPositions as never)
    expect(spec?.rows).toHaveLength(r.subPositions as number)
    expect(t.columns.find((c) => c.key === 'subPositions')?.drill).toBeDefined()
    // A list with nobody under anyone drops the tree columns.
    const leaf = positions.find((p) => subPositions(ctx, p.positionId).length === 0) as Position
    const l = buildDrillTable(drillSpec({ kind: 'positions', title: 'Leaf', rows: [leaf] }), ctx)
    expect(l.columns.map((c) => c.key)).not.toContain('subPositions')
  })

  it('drops standard columns that are empty for every row', () => {
    const open = positions.filter((p) => p.status !== 'Eliminated').slice(0, 10)
    const t = buildDrillTable(drillSpec({ kind: 'positions', title: 'Open', rows: open }), ctx)
    expect(t.columns.map((c) => c.key)).not.toContain('costAnnual')
    expect(t.columns.map((c) => c.key)).not.toContain('bandEstimate')
  })

  it('lets a view’s extra column replace a standard one, and adds others', () => {
    const rows = positions.slice(0, 3)
    const t = buildDrillTable(
      drillSpec({
        kind: 'positions',
        title: 'Priced',
        rows,
        extra: {
          columns: [
            { key: 'bandEstimate', label: 'Band estimate (USD)', format: 'moneyFull', band: true },
            { key: 'waiting', label: 'Days waiting', format: 'days' },
          ],
          values: () => ({ bandEstimate: 150_000, waiting: 7 }),
        },
      }),
      ctx,
    )
    expect(t.columns.filter((c) => c.key === 'bandEstimate')).toHaveLength(1)
    expect(t.rows[0]).toMatchObject({ bandEstimate: 150_000, waiting: 7 })
  })

  it('adds a "Counts as" column to a weighted drill', () => {
    const rows = positions.slice(0, 4)
    const t = buildDrillTable(
      drillSpec({ kind: 'positions', title: 'Weighted', rows, weight: () => 0.5 }),
      ctx,
    )
    expect(t.columns.at(-1)).toMatchObject({ key: WEIGHT_KEY, label: 'Counts as' })
    expect(t.rows.reduce((s, r) => s + (r[WEIGHT_KEY] as number), 0)).toBe(2)
  })
})

describe('money columns', () => {
  const col = (ref: string) => {
    const dot = ref.indexOf('.')
    return standardColumns(ref.slice(0, dot) as DrillKind).find((c) => c.key === ref.slice(dot + 1))
  }

  it('the policy’s column lists name real columns with the right flag', () => {
    for (const ref of PAY_COLUMNS) expect(col(ref)?.pay, ref).toBe(true)
    for (const ref of BAND_COLUMNS) expect(col(ref)?.band, ref).toBe(true)
    for (const ref of COMPONENT_COLUMNS) expect(col(ref)?.cost, ref).toBe(true)
    for (const ref of LEAVE_COLUMNS) expect(col(ref)?.pay, ref).toBe(true)
  })

  it('gives every money column exactly one flag', () => {
    for (const kind of DRILL_KINDS)
      for (const c of standardColumns(kind)) {
        const flags = [c.pay, c.cost, c.band].filter(Boolean).length
        expect(flags, `${kind}.${c.key}`).toBeLessThanOrEqual(1)
        if (c.format === 'money' || c.format === 'moneyFull') expect(flags, `${kind}.${c.key}`).toBe(1)
      }
  })

  it('never puts a per-position amount in a row without the switch', () => {
    const off = buildDrillTable(drillSpec({ kind: 'planLines', title: 'Lines', rows: lines }), ctx)
    for (const r of off.rows)
      for (const k of PAY_COLUMNS.filter((c) => c.startsWith('planLines.')))
        expect(r[k.slice(10)]).toBeUndefined()
    const on = buildDrillTable(
      drillSpec({ kind: 'planLines', title: 'Lines', rows: lines }),
      drillContext('hr-admin', { showPay: true }),
    )
    expect(on.rows.some((r) => typeof r.usdLoaded === 'number')).toBe(true)
    // The reqs' offer amounts too.
    const reqs = drillSample()
      .datasets.reqs.filter((r) => r.offerBase != null)
      .slice(0, 5)
    const t = buildDrillTable(drillSpec({ kind: 'reqs', title: 'Offers', rows: reqs }), ctx)
    expect(t.rows.every((r) => r.offerBase === undefined || r.offerBase === null)).toBe(true)
    expect(t.rows.every((r) => r.offerAcceptedDate !== undefined)).toBe(true)
  })

  it('drops band and cost columns from rows where cost does not show (Manager mode)', () => {
    const manager = drillContext('manager')
    expect(manager.showCost).toBe(false)
    const t = buildDrillTable(
      drillSpec({
        kind: 'costGroups',
        title: 'Cost',
        rows: [costRow],
      }),
      manager,
    )
    expect(t.rows[0].totalUsd).toBeUndefined()
    expect(t.rows[0].bandUsd).toBeUndefined()
    expect(t.rows[0].costed).toBe(412)
  })

  it('leaves out a column the mode hides, a view’s extra column with that key too', () => {
    const access = { hidden: ['column:positions.bandEstimate'] }
    const hrbp = drillContext('hrbp', { access })
    expect(modeHiddenColumns('positions', hrbp.access).has('bandEstimate')).toBe(true)
    const t = buildDrillTable(
      drillSpec({
        kind: 'positions',
        title: 'Priced',
        rows: positions.slice(0, 2),
        extra: {
          columns: [{ key: 'bandEstimate', label: 'Band estimate (USD)', band: true }],
          values: () => ({ bandEstimate: 150_000 }),
        },
      }),
      hrbp,
    )
    expect(t.columns.map((c) => c.key)).not.toContain('bandEstimate')
    expect(t.rows[0].bandEstimate).toBeUndefined()
  })
})

describe('requests', () => {
  it('a limited request names no requester and carries no reason, date or estimate', () => {
    const elimination = requestsOf(ctx).find((r) => r.type === 'Elimination') as HcRequest
    expect(elimination).toBeDefined()
    const [rec] = requestRecords([elimination], {
      viewer,
      asOf: ctx.asOf,
      nameOf: () => 'Someone',
      bandOf: () => 1,
    })
    expect(rec.view).toBe('limited')
    const t = buildDrillTable(drillSpec({ kind: 'requests', title: 'Limited', rows: [rec] }), ctx)
    expect(t.rows[0]).toMatchObject({ requester: null, reason: null, startDate: null, bandEstimate: null })
    expect(t.columns.map((c) => c.key)).not.toContain('requester')
  })

  it('a Backfill names the seat, never the leaver', () => {
    const backfill = requestsOf(ctx).find((r) => r.type === 'Backfill') as HcRequest
    const [rec] = requestRecords([backfill], { viewer, asOf: ctx.asOf, nameOf: (id) => `Name of ${id}` })
    const t = buildDrillTable(drillSpec({ kind: 'requests', title: 'Backfills', rows: [rec] }), ctx)
    const r = t.rows[0]
    expect(r.positionId).toBe(backfill.positionId)
    // The only names are the requester's and the approver's: no leaver field exists (rule 4).
    const allowed = new Set([
      `Name of ${backfill.requesterId}`,
      ...backfill.steps.map((s) => `Name of ${s.approverId}`),
    ])
    const names = Object.values(r).filter(
      (v): v is string => typeof v === 'string' && v.startsWith('Name of'),
    )
    expect(names.length).toBeGreaterThan(0)
    for (const v of names) expect(allowed.has(v), v).toBe(true)
    expect(r.moving).toBeNull()
  })
})

describe('drillTableHint', () => {
  it('says what a row opens and when counts open their own records', () => {
    expect(drillTableHint('positions', { rowsOpen: true, cellsOpen: true })).toBe(
      'Select a row to open the position. Underlined counts open their own records.',
    )
    expect(drillTableHint('costGroups', { rowsOpen: true, cellsOpen: false })).toBeNull()
    expect(drillTableHint('assumptions', { rowsOpen: false, cellsOpen: false })).toBeNull()
  })
})
