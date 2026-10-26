/**
 * The bridge's shape never reads leave (lead decision C34, PLAN 15.2, on C26: "guard counts, folds,
 * atoms, drills and contributor lists never read leave"), and its transfers step reads 0 (R39).
 *
 * Before C34 a step whose only costed move was an unpaid leave folded into Other changes, and Other
 * changes then pulled in the smallest shown step, so in HRBP and Leader mode a row showed or folded
 * away when one person's leave turned unpaid (M2 report, known gap 3: Yang Xie's and Shao-Wei Chung's
 * orgs, E10247 and E10743). Here a flip of any one leave, or of every leave at once, leaves every
 * bridge's row list, its fold, Other changes and the positions each row counts and lists exactly as
 * they were; every shown step and Other changes holds 0 or 5 or more positions; and a step shows
 * whole in one scope of a mode only where it folds in none. The same holds at a reporting date before
 * the last close for the people hired since it (attack A1, M2 close: their paid twins were missing,
 * so Finance's FX tile read 97 or 98 with one September hire's leave).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { listsInForce } from '@/access/lists'
import { actingAsOptions } from '@/access/scopes'
import type { AnalyticsContext } from '@/data/context'
import { monthEnd } from '@/data/fiscal'
import type { Sample } from '@/data/sample'
import type { ISODate, Month, PositionRow } from '@/data/schema'
import type { Filters } from '@/data/scope'
import { resolveCalc } from '@/drill/calc'
import { resolveDrill } from '@/drill/types'
import { BRIDGE_STEPS, bridge, bridgeSeats } from '@/plan/engine/bridge'
import {
  ctxAs,
  leakSample,
  personaCtx,
  personaOf,
  sampleCtx,
  sampleSources,
  withDatasets,
  withWorker,
} from '@/testkit/sample'
import { type FPrep, prepare } from './base'
import {
  bridgeRows,
  bridgeWindow,
  foldedOf,
  fxEffectOf,
  globalFold,
  LEAVE_MOVABLE,
  OPEN_STEP_CARD_NOTE,
  stepCardNote,
  TRANSFERS_NOTE,
} from './bridge'
import { bridgeKpis } from './kpis'

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

/** The windows a context's bridge figures read: the full year (the rows), and the FX tiles' windows. */
function windowsOf(p: FPrep): [string, readonly Month[]][] {
  const out: [string, readonly Month[]][] = [
    ['fy', p.fyMonths],
    ['ytd', p.ytdMonths],
    ['cost-ytd', p.costYtdMonths],
    ['period', p.windowMonths],
  ]
  return out.filter(([, m]) => m.length > 0)
}

/**
 * Everything a context's bridges show that is not an amount: each row's key, kind and positions (its
 * count and the positions its drill lists), whether it reads a value, its card's labels and which of
 * its inputs read "—"; each window's fold (the parts shown, the parts in Other changes and its count)
 * and whether its FX tile shows.
 */
function shapeOf(ctx: AnalyticsContext): string[] {
  const p = prepare(ctx)
  const b = bridgeRows(p)
  const out = [`empty ${b.empty}`, `note ${b.note}`]
  for (const r of b.rows) {
    let ids = ''
    if (r.drill) {
      const spec = resolveDrill(r.drill) as { rows?: readonly { positionId: string }[] } | null
      ids = (spec?.rows ?? []).map((x) => x.positionId).join(',')
    }
    const card = r.calc ? resolveCalc(r.calc) : null
    const inputs = card?.inputs.map(
      (x) => `${x.label}=${x.value == null ? '—' : x.format === 'int' ? x.value : '$'}`,
    )
    out.push(
      `row ${r.key} ${r.kind} n=${r.contributors} ${r.value == null ? '—' : '$'} [${ids}] ${inputs?.join(';') ?? ''} ${card?.note ?? ''}`,
    )
  }
  for (const [name, months] of windowsOf(p)) {
    const w = bridgeWindow(p, months)
    if (w.reason) {
      out.push(`${name}: ${w.reason}`)
      continue
    }
    const f = foldedOf(p, w, months)
    out.push(`${name} shown ${f.shown.map((x) => `${x.key}:${x.part}:${x.contributors.size}`).join(' ')}`)
    out.push(
      `${name} other ${f.other ? `${f.other.steps.map((x) => x.key).join(' ')} n=${f.other.contributors}` : '-'}`,
    )
    const fx = fxEffectOf(p, months)
    out.push(`${name} fx ${fx.value == null ? '—' : '$'} n=${fx.contributors} ${fx.reason}`)
  }
  return out
}

/** Every leave flag set one way (the people on leave stay on leave). */
const allLeave = (x: Sample, paid: boolean): Sample =>
  withDatasets(x, {
    workers: x.datasets.workers.map((w) => (w.onLeave === true ? { ...w, leavePaid: paid } : w)),
  })

/** A leader's org's positions (the tree and its root seats). */
function treeOf(ctx: AnalyticsContext): Set<string> {
  const sc = ctx.access.scope
  const out = new Set(sc?.positionIds ?? [])
  if (sc?.kind === 'tree') for (const r of sc.rootPositionIds) out.add(r)
  return out
}

/** Where the viewers read: a reporting date (Settings > Data) and, for exact modes, a period. */
interface ViewAt {
  asOf?: ISODate | null
  /** Exact modes only (rounded modes show no bridge under month or custom periods). */
  period?: Pick<Filters, 'period' | 'customStart' | 'customEnd'>
}

/** The contexts the flips are read in: Finance and HR admin (switch off), HRBPs, and leaders. */
function viewers(at: ViewAt = {}): { key: string; ctx: (x: Sample) => AnalyticsContext }[] {
  const units = [...new Set(s.datasets.positions.map((r) => r.businessUnit))].sort()
  const hrbps = new Map<string, string>()
  const env = envOf(personaCtx('hrbp-se'))
  for (const o of actingAsOptions('hrbp', env)) if (o.pick.unit) hrbps.set(o.pick.unit, o.pick.personId)
  const asOfOverride = at.asOf ?? null
  const period = at.period ?? {}
  const out: { key: string; ctx: (x: Sample) => AnalyticsContext }[] = [
    { key: 'finance', ctx: (x) => sampleCtx('finance', { sample: x, asOfOverride, filters: { ...period } }) },
    {
      key: 'hr-admin',
      ctx: (x) => sampleCtx('hr-admin', { sample: x, asOfOverride, filters: { ...period } }),
    },
    ...units.map((u) => ({
      key: `finance ${u}`,
      ctx: (x: Sample) =>
        sampleCtx('finance', { sample: x, asOfOverride, filters: { businessUnit: [u], ...period } }),
    })),
    ...units.map((u) => ({
      key: `hr-admin ${u}`,
      ctx: (x: Sample) =>
        sampleCtx('hr-admin', { sample: x, asOfOverride, filters: { businessUnit: [u], ...period } }),
    })),
  ]
  if (at.period) return out
  for (const [u, id] of hrbps)
    out.push({
      key: `hrbp ${u}`,
      ctx: (x: Sample) => ctxAs('hrbp', id, { sample: x, unit: u, asOfOverride }),
    })
  for (const id of ['E10247', 'E10743', personaOf(s, 'leader-svp-se').employeeId, 'E10001'])
    out.push({ key: `leader ${id}`, ctx: (x) => ctxAs('leader', id, { sample: x, asOfOverride }) })
  return out
}

function envOf(ctx: AnalyticsContext) {
  return {
    positionIndex: ctx.positionIndex,
    asOf: ctx.asOf,
    all: ctx.all,
    lists: listsInForce(null, ctx.all, sampleSources(ctx.all)),
    personas: s.personas,
  }
}

/**
 * The steps whose drivers come from a line's pay (the active fraction, and the reference line's FTE,
 * pay rate and loads), so that a leave alone can move them: written here apart from the engine's
 * `LEAVE_MOVABLE`, which the last case compares with it.
 */
const LEAVE_STEPS: ReadonlySet<string> = new Set(['timing', 'mix', 'payRate', 'assumptionRates'])

/** The latest row of a position. */
const latest = (x: Sample, id: string): PositionRow =>
  x.datasets.positions
    .filter((r) => r.positionId === id)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))
    .at(-1) as PositionRow

const onLeave = () =>
  s.datasets.workers
    .filter((w) => w.workerType === 'Employee' && w.onLeave === true && !!w.positionId && !w.terminationDate)
    .sort((a, b) => (a.employeeId < b.employeeId ? -1 : 1))

describe('a leave flip changes no bridge row (C34)', () => {
  it('flipping every leave to unpaid, and every leave to paid, leaves every bridge’s shape as it was', () => {
    const list = viewers()
    expect(onLeave().filter((w) => w.leavePaid === false).length).toBeGreaterThan(0)
    expect(onLeave().filter((w) => w.leavePaid !== false).length).toBeGreaterThan(5)
    const unpaid = allLeave(s, false)
    const paid = allLeave(s, true)
    let rows = 0
    for (const v of list) {
      const base = shapeOf(v.ctx(s))
      expect(shapeOf(v.ctx(unpaid)), `${v.key}: every leave unpaid`).toEqual(base)
      expect(shapeOf(v.ctx(paid)), `${v.key}: every leave paid`).toEqual(base)
      rows += base.filter((x) => x.startsWith('row ')).length
    }
    // Non-vacuity: the bridges show rows in every kind of scope.
    expect(rows).toBeGreaterThan(list.length * 4)
  }, 300_000)

  it('flipping one leave at a time in Yang Xie’s and Shao-Wei Chung’s orgs moves no row there (known gap 3)', () => {
    let flips = 0
    for (const leader of ['E10247', 'E10743']) {
      const ctx = (x: Sample) => ctxAs('leader', leader, { sample: x })
      const tree = treeOf(ctx(s))
      const people = onLeave().filter((w) => tree.has(w.positionId as string))
      expect(people.length, leader).toBeGreaterThan(0)
      const base = shapeOf(ctx(s))
      for (const w of people) {
        const x = withWorker(s, w.employeeId, { leavePaid: w.leavePaid === false })
        expect(shapeOf(ctx(x)), `${leader}: ${w.employeeId}`).toEqual(base)
        flips++
      }
    }
    expect(flips).toBeGreaterThan(0)
  }, 300_000)
})

/** The last close's month end: a reporting date before it leaves the closed months as they are. */
const lastCloseEnd = (x: Sample): ISODate =>
  monthEnd(
    x.plan.closes
      .map((c) => c.month)
      .sort()
      .at(-1) as Month,
  )

/** People hired after a reporting date and on or before the last close (the forecast prices them from HRIS). */
const hiredSince = (x: Sample, asOf: ISODate) =>
  x.datasets.workers
    .filter((w) => {
      const start = w.assignmentStart || w.hireDate
      return w.workerType === 'Employee' && !!w.positionId && start > asOf && start <= lastCloseEnd(x)
    })
    .sort((a, b) => (a.employeeId < b.employeeId ? -1 : 1))

/** Some people put on leave, paid or unpaid. */
const onLeaveAs = (x: Sample, ids: readonly string[], paid: boolean): Sample =>
  withDatasets(x, {
    workers: x.datasets.workers.map((w) =>
      ids.includes(w.employeeId) ? { ...w, onLeave: true, leavePaid: paid } : w,
    ),
  })

/** Windows after the last close (exact modes read them through the custom period). */
const AFTER_CLOSE: Pick<Filters, 'period' | 'customStart' | 'customEnd'>[] = [
  { period: 'custom', customStart: '2026-10-01', customEnd: '2026-12-31' },
  { period: 'custom', customStart: '2026-11-01', customEnd: '2026-11-30' },
  { period: 'custom', customStart: '2026-10-01', customEnd: '2027-03-31' },
]

/** The FX tile's count of non-USD positions whose cost moves, or null when it reads "—". */
function fxTileCount(ctx: AnalyticsContext): number | null {
  const tile = bridgeKpis(prepare(ctx))[0]
  const card = tile?.calc ? resolveCalc(tile.calc) : null
  const n = card?.inputs.find((x) => x.label === 'Non-USD positions whose cost moves')?.value
  return typeof n === 'number' ? n : null
}

describe('a leave of someone hired since a reporting date before the last close moves no bridge (C34, attack A1)', () => {
  // Before the fix the leave-neutral seats took a twin from the Working version's line context at the
  // reporting date, which does not know these people (the forecast does, from the September close
  // and HRIS), so their unpaid lines stood in for their own twins.
  it('keeps every bridge and FX tile as it was with the people hired since 31 August or 30 June on leave, paid or unpaid', () => {
    let compared = 0
    for (const asOf of ['2026-08-31', '2026-06-30'] as const) {
      const ids = hiredSince(s, asOf).map((w) => w.employeeId)
      expect(ids.length, asOf).toBeGreaterThanOrEqual(asOf === '2026-08-31' ? 9 : 30)
      const paid = onLeaveAs(s, ids, true)
      const unpaid = onLeaveAs(s, ids, false)
      for (const at of [{ asOf }, ...AFTER_CLOSE.map((period) => ({ asOf, period }))] as ViewAt[])
        for (const v of viewers(at)) {
          const ctx = v.ctx(paid)
          if (ctx.access.unset) continue
          expect(shapeOf(v.ctx(unpaid)), `${asOf} ${at.period?.customStart ?? 'fy'} ${v.key}`).toEqual(
            shapeOf(ctx),
          )
          compared++
        }
    }
    expect(compared).toBeGreaterThan(80)
  }, 300_000)

  it('keeps Finance’s FX tile at 98 for windows after the last close with E11729’s leave paid or unpaid', () => {
    const asOf = '2026-08-31'
    const w = hiredSince(s, asOf).find((x) => x.employeeId === 'E11729')
    expect(w?.positionId).toBe('P-1064')
    const samples = new Map([true, false].map((paid) => [paid, onLeaveAs(s, ['E11729'], paid)]))
    for (const period of AFTER_CLOSE)
      for (const [mode, unit, n] of [
        ['finance', null, 98],
        ['finance', 'Silicon Engineering', 58],
        ['hr-admin', null, 98],
        ['hr-admin', 'Silicon Engineering', 58],
      ] as const) {
        const read = (paid: boolean) =>
          fxTileCount(
            sampleCtx(mode, {
              sample: samples.get(paid),
              asOfOverride: asOf,
              filters: { ...period, ...(unit ? { businessUnit: [unit] } : {}) },
            }),
          )
        const key = `${mode} ${unit ?? 'company'} ${period.customStart}..${period.customEnd}`
        expect(read(true), key).toBe(n)
        expect(read(false), key).toBe(n)
      }
  }, 300_000)

  it('keeps the fold when a unit’s months hold exactly 5 non-USD positions that moved, the hire among them', () => {
    // Silicon Engineering's FX-moving seats other than P-1064 (E11729, EUR, hired 14 Sep) and four
    // more lose their holders on 30 September and are eliminated from 1 October, so November to
    // March hold exactly 5. A missing twin dropped P-1064 when the leave was unpaid: 4 positions,
    // and FX folded in every scope (the FX row became a band row and the FX tile read "—").
    const asOf = '2026-08-31'
    const unit = 'Silicon Engineering'
    const p0 = prepare(sampleCtx('finance', { asOfOverride: asOf, filters: { businessUnit: [unit] } }))
    const movers = new Set<string>()
    for (const m of p0.fyMonths.filter((x) => x > '2026-09'))
      for (const id of bridgeWindow(p0, [m]).steps.find((k) => k.key === 'fx')?.contributors ?? [])
        movers.add(id)
    expect(movers.has('P-1064')).toBe(true)
    const gone = [...movers]
      .filter((id) => id !== 'P-1064')
      .sort()
      .slice(4)
    expect(gone.length).toBeGreaterThan(20)
    const workers = s.datasets.workers.map((w) =>
      w.positionId && gone.includes(w.positionId) && w.workerType === 'Employee' && !w.terminationDate
        ? { ...w, terminationDate: '2026-09-30', assignmentEnd: '2026-09-30' }
        : w,
    )
    const ended = gone.map(
      (id): PositionRow => ({ ...latest(s, id), effectiveDate: '2026-10-01', status: 'Eliminated' }),
    )
    const x = withDatasets(s, { workers, positions: [...s.datasets.positions, ...ended] })
    const paid = onLeaveAs(x, ['E11729'], true)
    const unpaid = onLeaveAs(x, ['E11729'], false)
    const counts = (y: Sample) => {
      const p = prepare(
        sampleCtx('finance', { sample: y, asOfOverride: asOf, filters: { businessUnit: [unit] } }),
      )
      return p.fyMonths
        .filter((m) => m > '2026-10')
        .map((m) => bridgeWindow(p, [m]).steps.find((k) => k.key === 'fx')?.contributors.size ?? 0)
    }
    // The construction is on the edge: 5 in each month from November, P-1064 among them.
    expect(counts(paid)).toEqual([5, 5, 5, 5, 5])
    expect(counts(unpaid)).toEqual([5, 5, 5, 5, 5])
    const fold = (y: Sample) => {
      const p = prepare(sampleCtx('finance', { sample: y, asOfOverride: asOf }))
      return [...globalFold(p, p.fyMonths)].sort()
    }
    expect(fold(paid)).not.toContain('fx')
    expect(fold(unpaid)).toEqual(fold(paid))
    let compared = 0
    for (const v of viewers({ asOf })) {
      const ctx = v.ctx(paid)
      if (ctx.access.unset || ctx.guard.mode !== 'exact') continue
      expect(shapeOf(v.ctx(unpaid)), v.key).toEqual(shapeOf(ctx))
      compared++
    }
    expect(compared).toBeGreaterThanOrEqual(12)
  }, 300_000)
})

describe('rule 5 and one fold for every scope (C34)', () => {
  /** Each context's full-year bridge, with its fold. */
  function readings() {
    return viewers().map((v) => {
      const ctx = v.ctx(s)
      const p = prepare(ctx)
      const w = bridgeWindow(p, p.fyMonths)
      return {
        key: v.key,
        ctx,
        p,
        w,
        rows: bridgeRows(p),
        folded: w.reason ? null : foldedOf(p, w, p.fyMonths),
      }
    })
  }

  it('shows every step with 0 or 5 or more positions, Other changes with 5 or more, and closes on the end', () => {
    for (const r of readings()) {
      if (r.rows.empty) continue
      const between = r.rows.rows.slice(1, -1)
      expect(
        between.some((x) => x.key === 'other'),
        `${r.key}: Other changes is a row`,
      ).toBe(true)
      expect(
        between.some((x) => x.key === 'rounding'),
        `${r.key}: nothing is left for Rounding`,
      ).toBe(false)
      for (const x of between) {
        if (x.contributors == null) continue
        expect(x.contributors === 0 || x.contributors >= 5, `${r.key} ${x.key}: ${x.contributors}`).toBe(true)
        if (x.kind === 'other') expect(x.contributors, r.key).toBeGreaterThanOrEqual(5)
        if (x.contributors === 0) expect(x.value, `${r.key} ${x.key}`).toBe(0)
      }
      const cents = (v: number) => Math.round(v * 100)
      const first = r.rows.rows[0].value as number
      const last = r.rows.rows[r.rows.rows.length - 1].value as number
      expect(
        between.reduce((a, x) => a + cents(x.value as number), 0),
        r.key,
      ).toBe(cents(last) - cents(first))
    }
  }, 300_000)

  it('never shows a step whole in one scope of a mode while its costed part is in another’s Other changes', () => {
    const byMode = new Map<string, { key: string; whole: Set<string>; folded: Set<string> }[]>()
    for (const r of readings()) {
      if (!r.folded || r.rows.empty) continue
      const mode = `${r.ctx.guard.mode} ${r.p.comparison?.versionId}`
      const whole = new Set(r.folded.shown.filter((f) => f.part === 'whole').map((f) => f.step.key))
      // A costed part with positions in it, or a step a leave alone could move (C34).
      const folded = new Set(
        (r.folded.other?.steps ?? [])
          .filter((f) => f.contributors.size > 0 || (LEAVE_STEPS.has(f.step.key) && f.step.moves))
          .map((f) => f.step.key),
      )
      const list = byMode.get(mode) ?? []
      list.push({ key: r.key, whole, folded })
      byMode.set(mode, list)
    }
    expect(byMode.size).toBeGreaterThanOrEqual(2)
    let pairs = 0
    for (const list of byMode.values())
      for (const a of list)
        for (const b of list) {
          for (const k of a.whole)
            expect(b.folded.has(k), `${a.key} shows ${k}, ${b.key} folds it`).toBe(false)
          pairs++
        }
    expect(pairs).toBeGreaterThan(50)
  }, 300_000)

  it('decides one fold per mode from the company’s grains, whatever the scope', () => {
    const r = readings()
    // One fold per mode and comparison (Finance reads the Budget, HR admin and the rounded modes the
    // plan of record by default).
    const byMode = new Map<string, [string, string][]>()
    for (const x of r) {
      if (x.w.reason) continue
      const mode = `${x.ctx.guard.mode} ${x.p.comparison?.versionId}`
      const list = byMode.get(mode) ?? []
      list.push([x.key, [...globalFold(x.p, x.p.fyMonths)].sort().join(',')])
      byMode.set(mode, list)
    }
    expect([...byMode.keys()].filter((k) => k.startsWith('exact')).length).toBeGreaterThan(0)
    expect([...byMode.keys()].filter((k) => k.startsWith('rounded')).length).toBeGreaterThan(0)
    for (const [mode, folds] of byMode) {
      expect(folds.length, mode).toBeGreaterThan(mode.startsWith('exact') ? 6 : 3)
      for (const [key, f] of folds) expect(f, `${mode} ${key}`).toBe(folds[0][1])
    }
    // Rounded scopes are unions of atoms, and every costed step but attrition has 1 to 4 positions in
    // some atom: every costed part is in Other changes (attrition, which counts every costed seat's
    // allowance, joins it so that each atom's Other changes holds 5 or more).
    expect([...LEAVE_MOVABLE].sort()).toEqual([...LEAVE_STEPS].sort())
    const rounded = r.find((x) => x.ctx.guard.mode === 'rounded' && !x.w.reason) as (typeof r)[number]
    expect([...globalFold(rounded.p, rounded.p.fyMonths)]).toEqual(
      expect.arrayContaining(['timing', 'attrition', 'mix', 'payRate', 'assumptionRates']),
    )
  }, 300_000)
})

describe('a step’s card reads the bridge as shown (C34)', () => {
  it('starts each whole step’s totals where the waterfall does, so no two cards give a folded part back', () => {
    const cents = (v: number) => Math.round(v * 100)
    let read = 0
    for (const ctx of [
      sampleCtx('finance'),
      sampleCtx('finance', { filters: { businessUnit: ['Operations'] } }),
      sampleCtx('hr-admin'),
      personaCtx('hrbp-se'),
      personaCtx('leader-svp-se'),
    ]) {
      const rows = bridgeRows(prepare(ctx)).rows
      let running = cents(rows[0].value as number)
      for (const r of rows.slice(1, -1)) {
        const card = r.calc ? resolveCalc(r.calc) : null
        const input = (label: string) =>
          (card?.inputs.find((x) => x.label === label)?.value ?? null) as number | null
        const before = input('Total before this step')
        if (r.kind === 'step' && before != null) {
          expect(cents(before), `${ctx.scopeLabel} ${r.key}`).toBe(running)
          expect(cents(input('Total after this step') as number), `${ctx.scopeLabel} ${r.key}`).toBe(
            running + cents(r.value as number),
          )
          read++
        }
        running += cents(r.value as number)
      }
    }
    expect(read).toBeGreaterThan(5)
    // Finance's Position changes shows its band part only (one costed position moved, P-2401 in
    // Operations): Attrition's total before less Timing's total after is that band part, never the
    // step's whole amount.
    const rows = bridgeRows(prepare(sampleCtx('finance'))).rows
    const card = (key: string, label: string) =>
      resolveCalc(rows.find((r) => r.key === key)?.calc as never)?.inputs.find((x) => x.label === label)
        ?.value as number
    const positions = rows.find((r) => r.key === 'positions')
    expect(positions?.contributors).toBeNull()
    expect(cents(card('attrition', 'Total before this step') - card('timing', 'Total after this step'))).toBe(
      cents(positions?.value as number),
    )
  })
})

describe('no two windows’ FX effects less each other read 1 to 4 positions (C34, periods)', () => {
  /**
   * Five of the nine Systems & Software seats whose FX moves lose their holder on the as-of date and
   * are eliminated the day after, so November to March holds 4 of them: the full year and April to
   * October each have 9, and their difference would be the 4 people's FX effect.
   */
  function fourLeft(): { sample: Sample; left: string[] } {
    const p = prepare(sampleCtx('finance', { filters: { businessUnit: ['Systems & Software'] } }))
    const fx = bridgeWindow(p, p.fyMonths).steps.find((x) => x.key === 'fx')
    const movers = [...(fx?.contributors ?? [])].sort()
    expect(movers.length).toBe(9)
    const holders = movers
      .map((id) =>
        s.datasets.workers.find(
          (w) => w.positionId === id && w.workerType === 'Employee' && !w.terminationDate && !w.assignmentEnd,
        ),
      )
      .filter((w): w is NonNullable<typeof w> => !!w)
    const gone = holders.slice(0, 5)
    const left = gone.map((w) => w.employeeId)
    expect(left.length).toBe(5)
    const workers = s.datasets.workers.map((w) =>
      left.includes(w.employeeId) ? { ...w, terminationDate: s.asOf, assignmentEnd: s.asOf } : w,
    )
    const ended = gone.map(
      (w): PositionRow => ({
        ...latest(s, w.positionId as string),
        effectiveDate: '2026-10-01',
        status: 'Eliminated',
      }),
    )
    return { sample: withDatasets(s, { workers, positions: [...s.datasets.positions, ...ended] }), left }
  }

  it('folds FX in every window when a unit holds 1 to 4 non-USD positions that moved in some month', () => {
    const { sample: x } = fourLeft()
    const ss = prepare(sampleCtx('finance', { sample: x, filters: { businessUnit: ['Systems & Software'] } }))
    // October still books the five seats' severance; from November they hold no line.
    const open = ss.fyMonths.filter((m) => m > '2026-10')
    const closed = ss.fyMonths.filter((m) => m <= '2026-10')
    const count = (months: readonly Month[]) =>
      bridgeWindow(ss, months).steps.find((k) => k.key === 'fx')?.contributors.size
    // The attack: two windows of 9 whose difference is a window of 4.
    expect([count(ss.fyMonths), count(closed), count(open)]).toEqual([9, 9, 4])
    for (const months of [ss.fyMonths, closed, open, ss.ytdMonths, ss.fyMonths.slice(0, 3)])
      expect(fxEffectOf(ss, months).value, months.join(',')).toBeNull()
    // One fold for every scope: the company's and every unit's FX folds too.
    const company = prepare(sampleCtx('finance', { sample: x }))
    expect(globalFold(company, company.fyMonths).has('fx')).toBe(true)
    expect(fxEffectOf(company, company.fyMonths).value).toBeNull()
    // Control: on the sample every unit holds 0 or 9 or more in every month, and FX shows.
    const base = prepare(sampleCtx('finance', { filters: { businessUnit: ['Systems & Software'] } }))
    for (const months of [base.fyMonths, closed, open])
      expect(fxEffectOf(base, months).value, months.join(',')).not.toBeNull()
  })
})

describe('the transfers step reads 0 (R39)', () => {
  /** The transfers row of a context's bridge. */
  function transfersOf(ctx: AnalyticsContext) {
    const p = prepare(ctx)
    const w = bridgeWindow(p, p.fyMonths)
    const row = bridgeRows(p).rows.find((r) => r.key === 'transfers')
    const step = w.steps.find((x) => x.key === 'transfers')
    return { row, step, card: row?.calc ? resolveCalc(row.calc) : null }
  }

  /** A Go-to-Market seat held by one person and managing nobody, moved to an Operations manager at its site. */
  function crossUnitMove(): { sample: Sample; positionId: string; from: string; to: string; on: string } {
    const managers = new Set(s.datasets.positions.map((r) => r.managerPositionId).filter(Boolean))
    const held = new Set(
      s.datasets.workers
        .filter((w) => w.workerType === 'Employee' && !w.terminationDate && !w.assignmentEnd && !w.onLeave)
        .map((w) => w.positionId),
    )
    const lock = s.plan.versions
      .filter((v) => v.state === 'locked' && v.fiscalYear === 'FY27')
      .map((v) => (v as { lockedAt: string }).lockedAt.slice(0, 10))
      .sort()
      .at(-1) as string
    const on = '2026-09-01'
    expect(on > lock && on < s.asOf).toBe(true)
    const seat = [...new Set(s.datasets.positions.map((r) => r.positionId))]
      .sort()
      .map((id) => latest(s, id))
      .find(
        (r) =>
          r.businessUnit === 'Go-to-Market' &&
          r.status === 'Filled' &&
          r.location === 'San Jose' &&
          held.has(r.positionId) &&
          !managers.has(r.positionId),
      ) as PositionRow
    const boss = [...managers]
      .map((id) => latest(s, id as string))
      .find((r) => r.businessUnit === 'Operations' && r.location === 'San Jose') as PositionRow
    const peer = s.datasets.positions.find(
      (r) => r.managerPositionId === boss.positionId && r.businessUnit === 'Operations',
    ) as PositionRow
    const moved: PositionRow = {
      ...seat,
      effectiveDate: on,
      businessUnit: 'Operations',
      department: peer.department,
      costCenter: peer.costCenter,
      managerPositionId: boss.positionId,
    }
    return {
      sample: withDatasets(s, { positions: [...s.datasets.positions, moved] }),
      positionId: seat.positionId,
      from: 'Go-to-Market',
      to: 'Operations',
      on,
    }
  }

  it('keeps a Transfers row at 0, with no position and its note, in every mode that shows the bridge', () => {
    const contexts: [string, AnalyticsContext][] = [
      ['finance', sampleCtx('finance')],
      ['finance S&S', sampleCtx('finance', { filters: { businessUnit: ['Systems & Software'] } })],
      ['hr-admin', sampleCtx('hr-admin')],
      ['hr-admin with pay', sampleCtx('hr-admin', { showPay: true })],
      ['hrbp', personaCtx('hrbp-se')],
      ['leader', personaCtx('leader-svp-se')],
    ]
    for (const [key, ctx] of contexts) {
      const t = transfersOf(ctx)
      expect(t.row, key).toBeDefined()
      expect(t.row?.value, key).toBe(0)
      expect(t.row?.contributors, key).toBe(0)
      expect(t.step?.value, key).toBe(0)
      expect(t.step?.contributors.size, key).toBe(0)
      expect(t.card?.note, key).toContain(TRANSFERS_NOTE)
      // With the switch on nothing folds, and the card says so (M4 recheck SA-4-a).
      expect(t.card?.note, key).toContain(key === 'hr-admin with pay' ? OPEN_STEP_CARD_NOTE : stepCardNote(5))
    }
    // Every other step's card keeps the one note (it never says which step folded).
    const p = prepare(sampleCtx('finance'))
    for (const r of bridgeRows(p).rows)
      if (r.kind === 'step' && r.key !== 'transfers')
        expect(resolveCalc(r.calc as never)?.note, r.key).toBe(stepCardNote(5))
  })

  it('reads 0 for the sample’s internal move and position move, in every scope they touch', () => {
    const moves = s.datasets.requests.filter(
      (q) => q.type === 'Transfer' && q.state === 'Approved' && q.transferKind != null,
    )
    expect(moves.map((q) => q.transferKind).sort()).toEqual(['Internal move', 'Position move'])
    let read = 0
    for (const q of moves) {
      const seats = [q.fromPositionId, q.toPositionId, q.positionId].filter((x): x is string => !!x)
      expect(seats.length, q.requestId).toBeGreaterThan(0)
      const unit = latest(s, seats[0]).businessUnit
      const contexts = [
        sampleCtx('finance', { filters: { businessUnit: [unit] } }),
        sampleCtx('hr-admin', { showPay: true, filters: { businessUnit: [unit] } }),
      ]
      // The leaders above each seat, before and after the move (the old manager's and the new one's).
      const managers = new Set(
        s.datasets.positions
          .filter((r) => seats.includes(r.positionId))
          .map((r) => r.managerPositionId)
          .filter((x): x is string => !!x),
      )
      if (q.toManagerPositionId) managers.add(q.toManagerPositionId)
      const env = envOf(personaCtx('hrbp-se'))
      for (const o of actingAsOptions('leader', env)) {
        const ctx = ctxAs('leader', o.pick.personId)
        if (ctx.access.unset) continue
        const tree = treeOf(ctx)
        if (o.company || ![...managers].some((m) => tree.has(m))) continue
        contexts.push(ctx)
      }
      expect(contexts.length, q.requestId).toBeGreaterThan(2)
      for (const ctx of contexts) {
        const t = transfersOf(ctx)
        if (!t.step) continue
        expect(t.step.value, `${q.requestId} ${ctx.scopeLabel}`).toBe(0)
        if (t.row) expect(t.row.value, `${q.requestId} ${ctx.scopeLabel}`).toBe(0)
        read++
      }
    }
    expect(read).toBeGreaterThan(4)
  })

  it('reads 0 for a seat moved from Go-to-Market to Operations after the lock, where the lock-date rows would read it', () => {
    const m = crossUnitMove()
    for (const ctx of [
      sampleCtx('finance', { sample: m.sample }),
      sampleCtx('finance', { sample: m.sample, filters: { businessUnit: [m.from] } }),
      sampleCtx('finance', { sample: m.sample, filters: { businessUnit: [m.to] } }),
      sampleCtx('hr-admin', { sample: m.sample, showPay: true, filters: { businessUnit: [m.from] } }),
      sampleCtx('hr-admin', { sample: m.sample, showPay: true, filters: { businessUnit: [m.to] } }),
    ]) {
      const t = transfersOf(ctx)
      expect(t.step?.value, ctx.scopeLabel).toBe(0)
      expect(t.row?.value, ctx.scopeLabel).toBe(0)
      expect(t.row?.contributors, ctx.scopeLabel).toBe(0)
    }
    // The seat's plan follows it: Operations' bridge starts on the Budget's lines of the seat (R26).
    const ops = prepare(
      sampleCtx('hr-admin', { sample: m.sample, showPay: true, filters: { businessUnit: [m.to] } }),
    )
    const before = prepare(sampleCtx('hr-admin', { showPay: true, filters: { businessUnit: [m.to] } }))
    expect(bridgeWindow(ops, ops.fyMonths).start).toBeGreaterThan(
      bridgeWindow(before, before.fyMonths).start as number,
    )
    // Control: the bridge engine's own option, each side read by its row on its own date, puts the
    // move in the transfers step for both units.
    const v = ops.comparison
    const fc = ops.run?.detail
    if (v?.state !== 'locked' || !fc) throw new Error('no locked comparison or forecast')
    for (const unit of [m.from, m.to]) {
      const b = bridge({
        fiscalYear: 'FY27',
        comparison: { versionId: v.versionId, label: v.name, fiscalYear: 'FY27' },
        yearHasLockedVersion: true,
        months: ops.fyMonths,
        seats: bridgeSeats({
          comparison: v,
          forecast: fc,
          positions: m.sample.datasets.positions,
          scope: (place) => place.businessUnit === unit,
          months: ops.fyMonths,
        }),
      })
      if (b.kind !== 'ok') throw new Error('no bridge')
      const step = b.steps[BRIDGE_STEPS.indexOf('transfers')]
      expect(step.contributors, unit).toContain(m.positionId)
      expect(Math.abs(step.amount), unit).toBeGreaterThan(1_000)
    }
  })
})
