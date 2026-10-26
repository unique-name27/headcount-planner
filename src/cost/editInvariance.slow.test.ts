/**
 * No input a rounded mode can change moves a cost atom's filled part (docs/PLAN.md 7.2 rule 3, 7.3(d),
 * 16.1). The filled part depends only on HRIS, ATS and Finance-owned inputs; seat edits, pending
 * requests, approvals on Open or Planned seats, trades, What if levers and the HRBP's operational
 * assumptions change band estimates only. So the LP of costLp.slow.test.ts, which holds inputs fixed,
 * sees every state these inputs reach.
 *
 * For each sample HRBP and Leader persona (the Silicon Engineering HRBP; the SVP of Silicon
 * Engineering, the CFO and a Design Verification director), every input that mode can change is
 * applied to a copy of the sample, on the seats in the persona's scope:
 *  - HRBP `position.edit` on every Open seat with no accepted offer and every Planned seat of the
 *    unit, in Working (a dated row on the as-of date): start, level, location, FTE and On hold, each
 *    on its own;
 *  - an approved Start recruiting on every Planned seat and an approved Start date on every Open and
 *    Planned seat (src/plan/engine/requests.ts `applyApproval`). Start recruiting approved on the
 *    as-of date moves no amount at all (6.3 costs Open and Planned seats alike, and 6.7 starts a seat
 *    opened that day where it starts a Planned one), so its effect is checked by the seats' status;
 *    approved 40 days before the as-of date (fixture F3's state) it moves band parts;
 *  - a Trade of two of the scope's Planned seats for seats under their manager (`applyApproval`);
 *  - every pending request in the personas' scopes withdrawn, then every one moved a month later
 *    (requests enter asks at band estimate only, 6.9), and every one that changes no Filled or
 *    accepted-offer seat approved (all four personas' at once: each persona's are a part of them);
 *  - each What if lever on the scope's seats (src/plan/engine/whatif.ts: its results are band figures
 *    with no Filled contributor; What if writes no line);
 *  - HRBP only, the unit's operational assumptions in FY27 Working: fill rate and backfill % from 0.05
 *    to 1.0 in steps of 0.05, time to fill from 0 to 360 days in steps of 30, and the backfill lag
 *    from 0 to 12 months (the allowed ranges, read here: PLAN 5.2 gives none), the four set together
 *    at 20 points that between them take every value.
 * After each, every atom's exact filled part (each amount field, to the cent) is the same in every
 * month of every version: Working's own lines and the months it shows, its forecast and its asks, for
 * FY27 and FY28, and the locked versions' lines. The driver sweep reads FY27 Working's forecast
 * alone, and checks once that its drivers move no other version at all. A state reached twice (two
 * personas with the same seats) is checked once.
 *
 * Control: a build that costs the band cohort's modeled exits (net of backfills) at the unit's HRIS
 * average per FTE, in the filled part, moves some atom's filled part under the fill-rate sweep.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ModePicks, NO_PICKS } from '@/access/modes'
import { samplePicks } from '@/access/store'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { fyRange } from '@/data/fiscal'
import { cachedSample, type PersonaKey, SAMPLE_AS_OF, type Sample } from '@/data/sample'
import {
  type AssumptionRow,
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  type FiscalYear,
  type ISODate,
  LEVELS,
  type Level,
  type Mode,
  PENDING_REQUEST_STATES,
  type PositionRow,
} from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { addDays } from '@/lib/dates'
import type * as ForecastEngine from '@/plan/engine/forecast'
import { toAssignments } from '@/plan/engine/heads'
import { applyApproval, fromRow, toRow } from '@/plan/engine/requests'
import { isLocked } from '@/plan/engine/versions'
import { type Lever, whatIf } from '@/plan/engine/whatif'
import type { HcRequest, PlanLine, PositionChange, WorkingPlan } from '@/plan/types'
import { forecastRunOf } from '@/views/forecast/engine/run'
import { managerOfIn, seatOn, shownLines, versionLinesOf } from '@/views/plan/engine/core'
import { asksContextOf, workingFrame, workingLines } from '@/views/targets/engine/working'
import { atomOf } from './atoms'
import { COST_FIELDS, memberIdOf } from './guard'

/* ───────────── the control: band-cohort exits costed at the HRIS average ───────────── */

const ctl = vi.hoisted(() => ({ bandExitsAtHrisAverage: false }))

vi.mock('@/plan/engine/forecast', async (orig) => {
  const m = await orig<typeof ForecastEngine>()
  return {
    ...m,
    forecastDetail: (input: ForecastEngine.ForecastInput) => {
      const out = m.forecastDetail(input)
      if (!ctl.bandExitsAtHrisAverage) return out
      // The unit's HRIS average per FTE-month, from the seat lines of the month.
      const unitOf = new Map<string, string>()
      for (const r of input.positions) unitOf.set(r.positionId, r.businessUnit)
      const avg = new Map<string, { usd: number; fte: number }>()
      for (const l of out.lines) {
        if (m.isCohortLine(l) || l.basis !== 'hris' || !l.positionId) continue
        const k = `${unitOf.get(l.positionId) ?? ''}|${l.month}`
        const a = avg.get(k) ?? { usd: 0, fte: 0 }
        a.usd += l.usd.loaded
        a.fte += l.fte
        avg.set(k, a)
      }
      const lines = out.lines.map((l): PlanLine => {
        if (!m.isCohortLine(l) || l.cohort.part !== 'band') return l
        const a = avg.get(`${l.cohort.businessUnit}|${l.month}`)
        const usd = a?.fte ? (l.fte * a.usd) / a.fte : 0
        return {
          ...l,
          basis: 'hris',
          local: { base: usd / l.rate, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0 },
          usd: {
            base: usd,
            bonus: 0,
            burden: 0,
            benefits: 0,
            oneTime: 0,
            vacancy: 0,
            equity: 0,
            loaded: usd,
          },
        }
      })
      return { ...out, lines }
    },
  }
})

/* ───────────── contexts ───────────── */

const sourcesOf = (data: Datasets): Record<DatasetKey, SourceMeta> =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

function ctxOf(s: Sample, data: Datasets, mode: Mode, picks: ModePicks): AnalyticsContext {
  return buildContext({
    data,
    sources: sourcesOf(data),
    filters: { ...DEFAULT_FILTERS },
    asOfOverride: null,
    today: SAMPLE_AS_OF,
    mode,
    actingAs: picks,
    plan: s.plan,
    picks: { version: null, compare: null },
  })
}

/* ───────────── the filled part of every atom ───────────── */

/** Every amount field by "<part>|<source>", atom and month. */
type Snapshot = Map<string, Map<string, Map<string, number[]>>>

const FIELDS = COST_FIELDS.length

/** A snapshot's group, made when first asked for. */
function groupOf(out: Snapshot, key: string): Map<string, Map<string, number[]>> {
  let g = out.get(key)
  if (!g) {
    g = new Map()
    out.set(key, g)
  }
  return g
}

/** Each source's lines by part, atom and month: every amount field, summed. */
function addLines(
  out: Snapshot,
  source: string,
  lines: Iterable<PlanLine>,
  atom: (l: PlanLine) => string,
): void {
  const filled = groupOf(out, `filled|${source}`)
  const band = groupOf(out, `band|${source}`)
  for (const l of lines) {
    const g = l.basis === 'band' ? band : filled
    const a = atom(l)
    let byMonth = g.get(a)
    if (!byMonth) {
      byMonth = new Map()
      g.set(a, byMonth)
    }
    let v = byMonth.get(l.month)
    if (!v) {
      v = new Array<number>(FIELDS).fill(0)
      byMonth.set(l.month, v)
    }
    for (let i = 0; i < FIELDS; i++) v[i] += l.usd[COST_FIELDS[i]]
  }
}

/** The cells a snapshot holds. */
function cellsIn(snap: Snapshot): number {
  let n = 0
  for (const g of snap.values()) for (const byMonth of g.values()) n += byMonth.size
  return n
}

/**
 * What the inputs may not move: every version's filled part by atom and month (the forecast alone
 * for a driver sweep, and only version `only` when given).
 */
function snapshot(ctx: AnalyticsContext, forecastOnly = false, only: string | null = null): Snapshot {
  const out: Snapshot = new Map()
  const index = ctx.guard.atoms
  const managerOf = managerOfIn(ctx)
  // Each member's atom, worked out once per snapshot.
  const atoms = new Map<string, string>()
  const atom = (l: PlanLine): string => {
    const id = memberIdOf(l)
    let a = atoms.get(id)
    if (a === undefined) {
      a = atomOf(id, index, managerOf) ?? `none:${id}`
      atoms.set(id, a)
    }
    return a
  }
  for (const v of ctx.versions) {
    if (v.state === 'retired' || (only && v.versionId !== only)) continue
    if (isLocked(v)) {
      if (!forecastOnly) addLines(out, `own:${v.versionId}`, versionLinesOf(ctx, v), atom)
      continue
    }
    const run = forecastRunOf(ctx, v)
    if (run) {
      addLines(out, `fc:${v.versionId}`, run.lines, atom)
      addLines(out, `fc-unplaced:${v.versionId}`, run.unplaced, (l) => `cohort:${memberIdOf(l)}`)
    }
    if (forecastOnly) continue
    addLines(out, `own:${v.versionId}`, versionLinesOf(ctx, v), atom)
    addLines(out, `shown:${v.versionId}`, shownLines(ctx, v), atom)
    addLines(out, `asks:${v.versionId}`, workingLines(ctx, workingFrame(ctx, v.fiscalYear)), atom)
  }
  return out
}

/** Where two snapshots' parts differ by more than half a cent. */
function differences(a: Snapshot, b: Snapshot, part: 'filled' | 'band' = 'filled'): string[] {
  const out: string[] = []
  const zero = new Array<number>(FIELDS).fill(0)
  const none = new Map<string, Map<string, number[]>>()
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    if (!key.startsWith(`${part}|`)) continue
    const ga = a.get(key) ?? none
    const gb = b.get(key) ?? none
    for (const atom of new Set([...ga.keys(), ...gb.keys()])) {
      const ma = ga.get(atom) ?? new Map<string, number[]>()
      const mb = gb.get(atom) ?? new Map<string, number[]>()
      for (const month of new Set([...ma.keys(), ...mb.keys()])) {
        const x = ma.get(month) ?? zero
        const y = mb.get(month) ?? zero
        const i = x.findIndex((v, j) => Math.abs(v - y[j]) > 0.005)
        if (i >= 0)
          out.push(`${key}|${atom}|${month} ${COST_FIELDS[i]}: ${x[i].toFixed(2)} → ${y[i].toFixed(2)}`)
      }
    }
  }
  return out
}

/* ───────────── the inputs ───────────── */

interface Scope {
  key: PersonaKey
  mode: Mode
  picks: ModePicks
  /** Positions in scope (the persona's default scope). */
  ids: ReadonlySet<string>
  /** Open seats with no accepted offer, and Planned seats, Employee, on the as-of date. */
  openings: string[]
  planned: string[]
  unit: string | null
}

/** A copy of the datasets with dated position rows added on the as-of date. */
function withRows(data: Datasets, rows: readonly PositionRow[]): Datasets {
  return { ...data, positions: [...data.positions, ...rows] }
}

/** The row in effect on the as-of date. */
function rowOnAsOf(ctx: AnalyticsContext, id: string): PositionRow {
  return seatOn(ctx, id, ctx.asOf)?.position as PositionRow
}

/** A position edit (7.2 rule 3's `position.edit`): a row dated the as-of date over each seat. */
function edited(
  ctx: AnalyticsContext,
  ids: readonly string[],
  over: (r: PositionRow) => Partial<PositionRow>,
): Datasets {
  return withRows(
    ctx.all,
    ids.map((id) => {
      const r = rowOnAsOf(ctx, id)
      return { ...r, ...over(r), effectiveDate: ctx.asOf }
    }),
  )
}

const nextLevel = (l: Level): Level => LEVELS[Math.min(LEVELS.indexOf(l) + 1, LEVELS.length - 1)]

/** The Working plan an approval applies to (the sample's datasets, new seats keyed by the request). */
function workingPlanOf(ctx: AnalyticsContext): WorkingPlan {
  const latest = new Map<string, PositionRow>()
  for (const r of ctx.all.positions) {
    const had = latest.get(r.positionId)
    if (!had || r.effectiveDate >= had.effectiveDate) latest.set(r.positionId, r)
  }
  return {
    versionId: 'fy27-working',
    positions: ctx.all.positions,
    assignments: toAssignments(ctx.all.workers),
    newPositionId: (requestId, n) => `P-NEW-${requestId}-${n}`,
    placeOf: (managerPositionId) => {
      const m = latest.get(managerPositionId)
      return m
        ? {
            businessUnit: m.businessUnit,
            department: m.department ?? null,
            costCenter: m.costCenter,
            legalEntity: m.legalEntity ?? '',
          }
        : null
    },
    actor: { personId: 'edit-invariance', name: 'Edit invariance', mode: 'hr-admin' },
  }
}

/** The datasets with approvals' position effects applied (approved on the as-of date, else `on`). */
function approved(ctx: AnalyticsContext, requests: readonly HcRequest[], on: ISODate = ctx.asOf): Datasets {
  const plan = workingPlanOf(ctx)
  const rows: PositionRow[] = []
  for (const r of requests)
    for (const e of applyApproval(r, plan, on))
      if (e.kind === 'position') rows.push((e.change as PositionChange).row)
  const approvedIds = new Set(requests.map((r) => r.requestId))
  return {
    ...withRows(ctx.all, rows),
    requests: ctx.all.requests.map((row) =>
      approvedIds.has(row.requestId) ? toRow({ ...fromRow(row), state: 'Approved' }) : row,
    ),
  }
}

/** A request on a seat (a template request with its type and seat replaced). */
function requestOn(
  template: HcRequest,
  ctx: AnalyticsContext,
  type: HcRequest['type'],
  id: string,
  n: number,
): HcRequest {
  const r = rowOnAsOf(ctx, id)
  return {
    ...template,
    requestId: `R-EDIT-${type.replace(/\s/g, '')}-${n}`,
    type,
    state: 'Approved',
    positionId: id,
    managerPositionId: r.managerPositionId ?? template.managerPositionId,
    businessUnit: r.businessUnit,
    level: r.level,
    location: r.location,
    fte: r.fte ?? 1,
    startDate: addDays(ctx.asOf, 45),
    trade: null,
  }
}

/** The unit's operational assumption for Working FY27, set to one value. */
function withDriver(
  data: Datasets,
  unit: string,
  table: AssumptionRow['table'],
  keys: readonly string[],
  value: number,
): Datasets {
  const kept = data.assumptions.filter(
    (r) => !(r.version === SWEPT && r.table === table && r.org === unit && keys.includes(r.key)),
  )
  const added = keys.map((key): AssumptionRow => ({ version: SWEPT, table, org: unit, key, value }))
  return { ...data, assumptions: [...kept, ...added] }
}

const sweep = (from: number, to: number, step: number): number[] => {
  const out: number[] = []
  for (let i = 0; from + i * step <= to + 1e-9; i++) out.push(Math.round((from + i * step) * 1e6) / 1e6)
  return out
}

/* ───────────── the test ───────────── */

const PERSONAS: readonly PersonaKey[] = ['hrbp-se', 'leader-svp-se', 'leader-cfo', 'leader-dv-director']

/** The Working version whose operational assumptions the HRBP's sweep sets. */
const SWEPT = 'fy27-working'

/**
 * A copy of the datasets as the change it carries: the rows added or replaced in each dataset (the
 * edits here only add position and assumption rows, and replace request and assumption rows).
 */
function stateKey(base: Datasets, data: Datasets): string {
  const out: string[] = []
  for (const k of DATASET_KEYS) {
    const a = base[k] as readonly object[]
    const b = data[k] as readonly object[]
    if (a === b) continue
    const had = new Set(a)
    const kept = new Set(b)
    const added = b.filter((r) => !had.has(r))
    const removed = a.filter((r) => !kept.has(r)).length
    out.push(`${k}:${removed}:${JSON.stringify(added)}`)
  }
  return out.join('\n')
}

describe('no input HRBP or Leader mode can change moves an atom’s filled part (7.2 rule 3)', () => {
  let sample: Sample
  let base: AnalyticsContext
  let baseline: Snapshot
  let baselineForecast: Snapshot
  const scopes: Scope[] = []
  /** What moved in the current test, inputs that moved no band part either, and every input applied. */
  let moved: string[] = []
  let inert: string[] = []
  const applied: string[] = []
  /** States already checked (what moved), so a context is never kept alive past its check. */
  const checkedStates = new Map<string, { moved: string | null; bandMoved: boolean }>()
  beforeEach(() => {
    moved = []
    inert = []
  })

  /**
   * Applies one input: the filled parts after it must equal the baseline's. The band parts must
   * move (the input took effect), unless `amountless` (an input that moves no amount by the
   * engines' own rules, whose effect the caller checks another way). Returns whether a band part
   * moved, and the context after when the state is new (null for a state checked before).
   */
  const check = (label: string, data: Datasets, forecastOnly = false, amountless = false) => {
    const s = scopes[0]
    applied.push(label)
    // A state already checked (two personas whose seats are the same) is not computed again.
    const key = `${forecastOnly}|${stateKey(sample.datasets, data)}`
    let r = checkedStates.get(key)
    let ctx: AnalyticsContext | null = null
    if (!r) {
      ctx = ctxOf(sample, data, s.mode, s.picks)
      const before = forecastOnly ? baselineForecast : baseline
      const after = snapshot(ctx, forecastOnly, forecastOnly ? SWEPT : null)
      const diff = differences(before, after)
      r = {
        moved: diff.length ? `${diff.length} cells, e.g. ${diff.slice(0, 3).join('; ')}` : null,
        bandMoved: differences(before, after, 'band').length > 0,
      }
      checkedStates.set(key, r)
    }
    if (r.moved) moved.push(`${label}: ${r.moved}`)
    if (!amountless && !r.bandMoved) inert.push(label)
    return { ctx, bandMoved: r.bandMoved }
  }

  beforeAll(() => {
    sample = cachedSample()
    const picks = { ...NO_PICKS, ...samplePicks(sample.personas) }
    for (const key of PERSONAS) {
      const p = sample.personas.find((x) => x.key === key)
      if (!p) throw new Error(`No persona ${key}`)
      const pick =
        p.mode === 'hrbp'
          ? { personId: p.employeeId, name: p.name, unit: /^(.+) HRBP$/.exec(p.label)?.[1] ?? p.businessUnit }
          : { personId: p.employeeId, name: p.name }
      const mine = { ...picks, [p.mode]: pick }
      const ctx = ctxOf(sample, sample.datasets, p.mode, mine)
      const ids = new Set(ctx.data.positions.map((r) => r.positionId))
      const openings: string[] = []
      const planned: string[] = []
      for (const id of ids) {
        const d = seatOn(ctx, id, ctx.asOf)
        if (!d || (d.position.workerType ?? 'Employee') !== 'Employee') continue
        if (d.status === 'Planned') planned.push(id)
        if ((d.status === 'Open' && !d.offer) || d.status === 'Planned') openings.push(id)
      }
      scopes.push({
        key,
        mode: p.mode,
        picks: mine,
        ids,
        openings: openings.sort(),
        planned: planned.sort(),
        unit: 'unit' in pick ? (pick.unit ?? null) : null,
      })
    }
    base = ctxOf(sample, { ...sample.datasets }, scopes[0].mode, scopes[0].picks)
    baseline = snapshot(base)
    baselineForecast = snapshot(base, true, SWEPT)
  }, 900_000)

  it('finds the scopes and seats it edits', () => {
    expect(scopes.map((s) => s.key)).toEqual(PERSONAS)
    for (const s of scopes) expect(s.openings.length, s.key).toBeGreaterThan(0)
    expect(scopes[0].unit).toBe('Silicon Engineering')
    expect(cellsIn(baseline)).toBeGreaterThan(1000)
  })

  it('HRBP seat edits in Working (start, level, location, FTE, On hold) leave every filled part to the cent', () => {
    const s = scopes[0]
    const ctx = ctxOf(sample, sample.datasets, s.mode, s.picks)
    const ids = s.openings
    check(
      'start +60 days',
      edited(ctx, ids, (r) => ({ startDate: addDays(r.startDate ?? ctx.asOf, 60) })),
    )
    check(
      'start to the first of next year',
      edited(ctx, ids, () => ({ startDate: '2027-04-01' })),
    )
    check(
      'level one up',
      edited(ctx, ids, (r) => ({ level: nextLevel(r.level) })),
    )
    check(
      'location',
      edited(ctx, ids, (r) => ({
        location: r.location === 'Bengaluru' ? 'San Jose' : 'Bengaluru',
        legalEntity: null,
      })),
    )
    check(
      'FTE 0.5',
      edited(ctx, ids, () => ({ fte: 0.5 })),
    )
    check(
      'On hold',
      edited(ctx, ids, () => ({ status: 'On hold' })),
    )
    // One seat at a time too, for the first few.
    for (const id of ids.slice(0, 3))
      check(
        `level of ${id}`,
        edited(ctx, [id], (r) => ({ level: nextLevel(r.level) })),
      )
    expect(moved).toEqual([])
    expect(inert).toEqual([])
  }, 900_000)

  it('approved Start recruiting, Start date and Trade on Open and Planned seats leave every filled part', () => {
    const template = sample.datasets.requests.map(fromRow).find((r) => r.type === 'Trade') as HcRequest
    expect(template).toBeDefined()
    const notOpened: string[] = []
    let earlierMoved = 0
    for (const s of scopes) {
      const ctx = ctxOf(sample, sample.datasets, s.mode, s.picks)
      const recruiting = s.planned.map((id, i) => requestOn(template, ctx, 'Start recruiting', id, i))
      // Approved on the as-of date, Start recruiting moves no amount by 6.3 and 6.7: Open and Planned
      // seats are both costed at band from their start, and an Open seat opened that day starts at
      // max(target, as-of + time to fill − 0 days open), a Planned seat's start. So the check that
      // it took effect is the seat's status, not a band part (fixture F3 gives the later effect).
      const { ctx: after } = check(`${s.key} Start recruiting`, approved(ctx, recruiting), false, true)
      // (A state checked before, for another persona with the same seats, was checked then.)
      if (after)
        for (const id of s.planned)
          if (seatOn(after, id, after.asOf)?.status !== 'Open') notOpened.push(`${s.key} ${id}`)
      // The same approvals 40 days before the as-of date (fixture F3's state): the seats have been
      // open for 40 days, which moves starts forward where time to fill is the later bound.
      if (s === scopes[0]) {
        const earlier = approved(ctx, recruiting, addDays(ctx.asOf, -40))
        const label = `${s.key} Start recruiting 40 days before the as-of date`
        if (check(label, earlier, false, true).bandMoved) earlierMoved++
      }
      check(
        `${s.key} Start date`,
        approved(
          ctx,
          s.openings.map((id, i) => ({
            ...requestOn(template, ctx, 'Start date', id, i),
            startDate: '2027-01-15',
          })),
        ),
      )
      // A trade of two Planned seats under one manager, for seats under that manager.
      const byManager = new Map<string, string[]>()
      for (const id of s.planned) {
        const m = rowOnAsOf(ctx, id).managerPositionId ?? ''
        byManager.set(m, [...(byManager.get(m) ?? []), id])
      }
      const pair = [...byManager].find(([, list]) => list.length >= 2)
      const give = pair ? pair[1].slice(0, 2) : s.planned.slice(0, 1)
      if (template.trade && give.length) {
        const r0 = rowOnAsOf(ctx, give[0])
        const trade: HcRequest = {
          ...template,
          requestId: `R-EDIT-TRADE-${s.key}`,
          state: 'Approved',
          positionId: null,
          managerPositionId: r0.managerPositionId ?? template.managerPositionId,
          businessUnit: r0.businessUnit,
          location: r0.location,
          level: r0.level,
          trade: {
            ...template.trade,
            givePositionIds: give,
            giveOrgPositionId: r0.managerPositionId ?? null,
          },
        }
        check(`${s.key} Trade`, approved(ctx, [trade]))
      }
    }
    // Story 9's own trade, approved.
    check('story 9 trade approved', approved(base, [template]))
    expect(moved).toEqual([])
    expect(inert).toEqual([])
    // Start recruiting took effect: every Planned seat is Open on the as-of date, and approved
    // earlier it moves band parts (and still no filled part, above).
    expect(scopes.some((s) => s.planned.length > 0)).toBe(true)
    expect(notOpened).toEqual([])
    expect(earlierMoved).toBeGreaterThan(0)
  }, 900_000)

  it('pending requests withdrawn, moved or approved (when they change no Filled seat) leave every filled part', () => {
    // Every pending request in any persona's scope at once (each persona's are a part of these):
    // withdrawn, moved a month later, and approved where it changes no Filled or accepted-offer seat.
    const ctx = ctxOf(sample, sample.datasets, scopes[0].mode, scopes[0].picks)
    const inScope = (r: HcRequest) =>
      [r.positionId, r.managerPositionId, ...(r.trade?.givePositionIds ?? [])].some(
        (id) => id && scopes.some((s) => s.ids.has(id)),
      )
    const pending = sample.datasets.requests
      .map(fromRow)
      .filter((r) => PENDING_REQUEST_STATES.includes(r.state) && inScope(r))
    expect(pending.length).toBeGreaterThan(0)
    const ids = new Set(pending.map((r) => r.requestId))
    const change = (f: (r: HcRequest) => HcRequest): Datasets => ({
      ...ctx.all,
      requests: ctx.all.requests.map((row) => (ids.has(row.requestId) ? toRow(f(fromRow(row))) : row)),
    })
    check(
      `${pending.length} pending withdrawn`,
      change((r) => ({ ...r, state: 'Withdrawn' })),
    )
    check(
      `${pending.length} pending a month later`,
      change((r) => ({ ...r, startDate: r.startDate ? addDays(r.startDate, 31) : addDays(ctx.asOf, 31) })),
    )
    const filled = (id: string | null) => {
      if (!id) return false
      const d = seatOn(ctx, id, ctx.asOf)
      return d?.status === 'Filled' || !!d?.offer
    }
    const safe = pending.filter(
      (r) =>
        r.type !== 'Transfer' &&
        !(['Elimination', 'Level change', 'Location change', 'Backfill'] as const).some(
          (t) => r.type === t && filled(r.positionId),
        ) &&
        !(r.trade?.givePositionIds ?? []).some(filled),
    )
    expect(safe.length).toBeGreaterThan(0)
    check(`pending approved (${safe.length})`, approved(ctx, safe))
    expect(moved).toEqual([])
  }, 900_000)

  it('every What if lever is a band figure with no Filled contributor', () => {
    const problems: string[] = []
    let levers = 0
    for (const s of scopes) {
      const ctx = ctxOf(sample, sample.datasets, s.mode, s.picks)
      const fy: FiscalYear = 'FY27'
      const frame = workingFrame(ctx, fy)
      const actx = asksContextOf(ctx, frame)
      const pending = ctx.all.requests.map(fromRow).filter((r) => PENDING_REQUEST_STATES.includes(r.state))
      const org = (place: { positionId?: string | null; managerPositionId?: string | null }) =>
        s.ids.has(place.positionId ?? '') || s.ids.has(place.managerPositionId ?? '')
      const run = (lever: Lever, label: string) => {
        levers++
        const r = whatIf({
          levers: [lever],
          org,
          fiscalYear: fy,
          targetDate: fyRange(fy).end,
          target: null,
          requests: pending,
          ctx: actx,
          quote: () => {
            throw new Error('No trade lever here')
          },
        })
        if (!r.bandOnly) problems.push(`${s.key} ${label}: not a band figure`)
        const filled = r.contributors.filter((id) => seatOn(ctx, id, ctx.asOf)?.status === 'Filled')
        if (filled.length) problems.push(`${s.key} ${label}: Filled contributors ${filled.join(', ')}`)
      }
      for (const id of s.openings.slice(0, 12)) {
        const r = rowOnAsOf(ctx, id)
        run({ kind: 'defer', positionId: id, to: '2027-02-01' as ISODate }, `defer ${id}`)
        run({ kind: 'cancel', positionId: id }, `cancel ${id}`)
        run({ kind: 'level', positionId: id, level: nextLevel(r.level) }, `level ${id}`)
        run(
          { kind: 'location', positionId: id, location: r.location === 'Munich' ? 'Haifa' : 'Munich' },
          `location ${id}`,
        )
      }
      run({ kind: 'shift', positionIds: s.openings, months: 2 }, 'shift every opening by 2 months')
      run({ kind: 'shift', positionIds: s.openings, months: -1 }, 'shift every opening back a month')
      const head = [...s.ids].find((id) => seatOn(ctx, id, ctx.asOf)?.status === 'Filled')
      if (head)
        run({ kind: 'freeze', orgPositionId: head, from: '2026-11-01' as ISODate }, `freeze below ${head}`)
    }
    expect(levers).toBeGreaterThan(100)
    expect(problems).toEqual([])
  }, 900_000)

  it('the HRBP’s operational assumptions, swept over their ranges, leave every filled part of the forecast', () => {
    const s = scopes[0]
    const unit = s.unit as string
    const data = sample.datasets
    // Every value of each driver's range, the four set together: fill rate and backfill % from
    // 0.05 to 1.0 in steps of 0.05, time to fill from 0 to 360 days by 30, the lag from 0 to 12
    // months. Point i takes the i-th value of each (each list read round, offset so the drivers do
    // not move in step), so every value is applied and every state is one the HRBP can set.
    const fill = sweep(0.05, 1, 0.05)
    const backfill = sweep(0.05, 1, 0.05)
    const ttf = sweep(0, 360, 30)
    const lag = sweep(0, 12, 1)
    const at = <T>(xs: readonly T[], i: number, offset: number): T => xs[(i + offset) % xs.length]
    const seen = {
      fill: new Set<number>(),
      backfill: new Set<number>(),
      ttf: new Set<number>(),
      lag: new Set<number>(),
    }
    for (let i = 0; i < fill.length; i++) {
      const v = { fill: at(fill, i, 0), backfill: at(backfill, i, 7), ttf: at(ttf, i, 0), lag: at(lag, i, 5) }
      seen.fill.add(v.fill)
      seen.backfill.add(v.backfill)
      seen.ttf.add(v.ttf)
      seen.lag.add(v.lag)
      let d = withDriver(data, unit, 'fillRate', ['*'], v.fill)
      d = withDriver(d, unit, 'backfillRate', ['*'], v.backfill)
      d = withDriver(d, unit, 'timeToFill', LEVELS, v.ttf)
      d = withDriver(d, unit, 'backfillLag', ['*'], v.lag)
      check(
        `drivers: fill rate ${v.fill}, backfill ${v.backfill}, time to fill ${v.ttf}, lag ${v.lag}`,
        d,
        true,
      )
    }
    expect([seen.fill.size, seen.backfill.size, seen.ttf.size, seen.lag.size]).toEqual([20, 20, 13, 13])
    expect(moved).toEqual([])
    // Every state moves the band part (no point sets all four to the sample's own values).
    expect(inert).toEqual([])
    // The sweep reads FY27 Working's forecast alone: its drivers reach no other version. With all
    // four at the far end of their ranges at once, every other version's forecast, both parts, is
    // as it was to the cent, and FY27 Working's filled part too.
    let far = withDriver(data, unit, 'fillRate', ['*'], 0.05)
    far = withDriver(far, unit, 'backfillRate', ['*'], 0.05)
    far = withDriver(far, unit, 'timeToFill', LEVELS, 360)
    far = withDriver(far, unit, 'backfillLag', ['*'], 12)
    const all = snapshot(base, true)
    const after = snapshot(ctxOf(sample, far, s.mode, s.picks), true)
    const elsewhere = (snap: Snapshot): Snapshot =>
      new Map([...snap].filter(([k]) => !k.split('|')[1].endsWith(`:${SWEPT}`)))
    expect([...all.keys()].some((k) => !k.split('|')[1].endsWith(`:${SWEPT}`))).toBe(true)
    expect(differences(elsewhere(all), elsewhere(after), 'filled')).toEqual([])
    expect(differences(elsewhere(all), elsewhere(after), 'band')).toEqual([])
    expect(differences(all, after, 'filled')).toEqual([])
    expect(differences(all, after, 'band').length).toBeGreaterThan(0)
  }, 900_000)

  it('the control: band-cohort exits costed at the HRIS average move the filled part under the fill-rate sweep', () => {
    const s = scopes[0]
    const unit = s.unit as string
    ctl.bandExitsAtHrisAverage = true
    try {
      const at = (v: number) =>
        snapshot(
          ctxOf(sample, withDriver(sample.datasets, unit, 'fillRate', ['*'], v), s.mode, s.picks),
          true,
          SWEPT,
        )
      const diff = differences(at(0.85), at(0.5))
      expect(diff.length).toBeGreaterThan(0)
    } finally {
      ctl.bandExitsAtHrisAverage = false
    }
  }, 900_000)
})
