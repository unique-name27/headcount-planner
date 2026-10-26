/**
 * Leave (docs/PLAN.md 7.2 rule 1, 7.7, C25, C26, 16.1): no leave field, count or note in any Manager
 * or Finance crawl, every export as written included (workbooks, decks, the long CSV and the load
 * file, M4); flipping one `leavePaid` from true to false inside a 5-head cost center, a
 * 5-person atom and a Finance row of 5 or more, and adding a back-dated unpaid leave in a closed
 * month, leaves every Finance, HRBP and Leader crawl equal apart from totals already shown at 5 or
 * more (guard states, "Hidden" notes, Other (k) labels, left-out counts, drill row ids and Finance >
 * Versions included). The contributor count and list of every row never move (review RR-1: bridge
 * lists are leave-neutral), and row lists compare strictly: no row, tile or value comes or goes
 * (lead decision C34: the bridge's shape never reads leave; before it, a step whose only costed move
 * was a leave folded into Other changes and pulled a shown step in, so a leader's bridge gained
 * Other changes and lost Attrition). Every bridge Acting as can reach, at every period, keeps its
 * rows, fold, Other changes and positions under every leave flipped at once either way and under each
 * leave flipped on its own; at a reporting date before the last close (31 August, September closed)
 * the same holds with the people hired since put on leave, paid or unpaid, together and one at a time,
 * for windows after the close too (attack A1: their paid twins were missing). Finance's "each unit
 * left out" scopes include the other units, since Finance clears an exclude, and every scope is
 * checked to keep the unit filter it asks for (attack A2). Under a sweep of includes and excludes on
 * each filter dimension at 31 Aug and 30 Sep 2026 no HRBP or Leader persona shows a leave number under a filter or a
 * non-default period, and every class of people defined by all shown leave sets holds 0 or 5 or more
 * people on leave. Controls: HR admin with pay amounts shown reads leave; counts under free filters,
 * as the template app showed them (5 or more under any filter), find a class of 1. PLAN 16.1 names
 * Munich's P6; the generated sample has one person on leave in Munich, so the control searches every
 * unit (and the company) with one level or location left out for two shown counts one person apart.
 *
 * The `plan.leave.onLeave` tile (Plan > Overview, HRBP and Leader mode, src/access/leaveScopes.ts) is
 * crawled under filters and periods, with a control that the crawl finds its number at the default;
 * `leaveFit` and `leaveShown`, which the tile reads, are swept directly.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { monthEnd } from '@/data/fiscal'
import type { Sample } from '@/data/sample'
import type { ISODate, Month } from '@/data/schema'
import { type Filters, LIST_DIMENSIONS } from '@/data/scope'
import { resolveCalc } from '@/drill/calc'
import { resolveDrill } from '@/drill/types'
import { type Crawl, crawl, crawlAll, type Seen } from '@/testkit/crawl'
import { keysOf } from '@/testkit/leaks'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { badMoves, bySurface, changesOf, moveRulesFor } from '@/testkit/moves'
import { type LeaveChange, leaveChanges } from '@/testkit/perturbations'
import {
  ctxAs,
  leakSample,
  personaCtx,
  pinClock,
  sampleCtx,
  sampleSources,
  seatViewerContexts,
  unpinClock,
  withDatasets,
  withWorker,
} from '@/testkit/sample'
import { prepare as prepareForecast } from '@/views/forecast/engine/base'
import { bridgeKpis, fxYtdTile } from '@/views/forecast/engine/kpis'
import { bridgeFigure } from '@/views/forecast/engine/overview'
import { LEAVE_FIT_NOTE, type LeaveScope, leaveFit, leaveShown } from './leave'
import { listsInForce } from './lists'
import { NO_PICKS } from './modes'
import { actingAsOptions, type ScopeEnv, type ScopeLock, scopeFor } from './scopes'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  pinClock()
  s = leakSample()
}, 120_000)
afterAll(() => unpinClock())

/* ───────────── no leave in Manager and Finance ───────────── */

const LEAVE_KEY = /^(onLeave|leavePaid|leave|leaveState|unpaidLeave)$/
const LEAVE_WORDS = /\b(on leave|unpaid leave|paid leave|leave of absence)\b/i

/** What in a crawl is leave data: a leave key or column, the leave metric, its note, or a leave word in a value. */
function leaveHits(c: Crawl): string[] {
  const out: string[] = []
  for (const x of c.seen) {
    const at = x.where
    if (keysOf(at).some((k) => LEAVE_KEY.test(k))) out.push(`leave key at ${at}`)
    if (/plan\.leave\./.test(at) || /plan\.leave\./.test(x.tag.in)) out.push(`leave metric at ${at}`)
    // Glossary and formula definitions describe the guard ("on leave or not"); they hold no one's leave.
    if (/^(glossary|formulas|help)/.test(at)) continue
    const text = typeof x.value === 'string' ? x.value : ''
    if (text.includes(LEAVE_FIT_NOTE)) out.push(`leave note at ${at}`)
    if (LEAVE_WORDS.test(text)) out.push(`leave word at ${at}: ${text.slice(0, 80)}`)
  }
  return out
}

describe('no leave field, count or note in Manager or Finance mode (7.7)', () => {
  it('holds none in any Manager or Finance persona crawl, on-leave reports included', () => {
    const b = s.personas.find((p) => p.key === 'manager-b')
    const team = s.datasets.positions
      .filter((p) => p.managerPositionId === b?.positionId)
      .map((p) => p.positionId)
    // Non-vacuity: Manager B's team holds a person on leave.
    expect(s.datasets.workers.some((w) => w.onLeave === true && team.includes(w.positionId ?? ''))).toBe(true)
    for (const key of ['manager-a', 'manager-b', 'manager-c', 'finance-fpa'] as const) {
      const c = crawl(personaCtx(key), { recordExports: 'text' })
      expect(c.errors, key).toEqual([])
      expect(leaveHits(c).slice(0, 5), key).toEqual([])
      // The long CSV with its control totals, and in Finance the load file (M4).
      expect(
        c.seen.some((x) => x.where.startsWith('export long-csv version/r ')),
        key,
      ).toBe(true)
      expect(
        c.seen.some((x) => x.where.startsWith('file load-file')),
        key,
      ).toBe(key === 'finance-fpa')
    }
  }, 600_000)

  it('holds none in the files every view writes: workbooks, whole-view workbooks and decks (M4)', async () => {
    for (const key of ['manager-b', 'finance-fpa'] as const) {
      // The figures' own files as written (each tab's workbook, each view's whole-view workbook and
      // deck); the records behind them are read above.
      const c = await crawlAll(personaCtx(key), { drills: false, cards: false, texts: false, pages: false })
      expect(c.errors, key).toEqual([])
      expect(leaveHits(c).slice(0, 5), key).toEqual([])
      for (const part of ['workbook view ', 'deck '])
        expect(
          c.seen.some((x) => x.where.startsWith(part)),
          `${key} ${part}`,
        ).toBe(true)
    }
  }, 600_000)

  it('control: HR admin with pay amounts shown reads leave', () => {
    const c = crawl(sampleCtx('hr-admin', { showPay: true }), {
      views: ['plan'],
      pages: false,
      help: false,
      files: false,
    })
    expect(leaveHits(c).length).toBeGreaterThan(0)
  }, 300_000)
})

/* ───────────── a leave flip moves no one's figure ───────────── */

describe('a leave change moves only totals already shown at 5 or more (C26)', () => {
  /** 16.1's four leave changes (src/testkit/perturbations.ts, which Plan > Hiring's leak test reads too). */
  const changes = (): LeaveChange[] => leaveChanges(s)

  it('finds the four changes 16.1 names', () => {
    const list = changes()
    expect(list.length).toBe(4)
    expect(list[0].what).toMatch(/ 5-head cost center/)
  })

  it('control: HR admin with pay amounts shown sees each change', () => {
    for (const ch of changes()) {
      const admin = (x: Sample) =>
        crawl(sampleCtx('hr-admin', { sample: x, showPay: true }), {
          views: ['plan', 'finance'],
          pages: false,
          help: false,
          files: false,
          texts: false,
          cards: 0,
          cardsOf: [ch.positionId],
          focus: 'money',
        })
      expect(changesOf(admin(s).seen, admin(ch.sample).seen).length, ch.what).toBeGreaterThan(0)
    }
  }, 600_000)

  it('leaves every Finance, HRBP and Leader crawl equal apart from shown totals', () => {
    const baselines = new Map<string, Crawl>()
    const problems: string[] = []
    let compared = 0
    for (const ch of changes())
      for (const v of seatViewerContexts(s, ch.positionId)) {
        let base = baselines.get(v.key)
        if (!base) {
          base = crawl(v.ctx(s), { focus: 'money' })
          baselines.set(v.key, base)
        }
        const ctx = v.ctx(ch.sample)
        const after = crawl(ctx, { focus: 'money' })
        compared++
        // Contributor counts and lists, and row lists, compare strictly: a leave flip moves amounts
        // only (RR-1, C34).
        const rules = { ...moveRulesFor(ctx), strictContributors: true, strictRows: true }
        for (const line of badMoves(changesOf(base.seen, after.seen), rules, {
          before: base.seen,
          after: after.seen,
        }))
          problems.push(`${ch.what} | ${v.key} | ${line}`)
      }
    expect(bySurface(problems).slice(0, 60).join('\n')).toBe('')
    expect(compared).toBe(12)
  }, 1_200_000)
})

/* ───────────── every bridge's shape under leave flips (C34) ───────────── */

describe('a leave flip changes no bridge row in any scope Acting as reaches, at any period (C34)', () => {
  /**
   * What a bridge shows that is not an amount: each row's key, kind, positions (count and the drill's
   * list), whether it reads a value, its card's labels and which of its inputs read "—"; the FX tile
   * and the FX effect YTD tile, shown or "—", with their reasons and counts.
   */
  function bridgeShape(ctx: AnalyticsContext): string[] {
    const p = prepareForecast(ctx)
    const fig = bridgeFigure(p)
    const out = [`empty ${fig.empty}`, `note ${fig.note}`]
    for (const r of fig.rows) {
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
    for (const k of [...bridgeKpis(p), fxYtdTile(p)]) {
      if (!k) continue
      const card = k.calc ? resolveCalc(k.calc) : null
      const inputs = card?.inputs.map((x) => `${x.label}=${x.value == null ? '—' : x.value}`)
      out.push(
        `tile ${k.id} ${k.value == null ? '—' : '$'} ${k.suppressedNote ?? ''} ${inputs?.join(';') ?? ''}`,
      )
    }
    return out
  }

  /** Where a scope is read: a period (and its custom window) and a reporting date (Settings > Data). */
  type At = Pick<Partial<Filters>, 'customStart' | 'customEnd'> & {
    period: Filters['period']
    asOf?: ISODate | null
  }

  type ScopeMaker = {
    key: string
    /** The business-unit filter the scope asks for (null: none), which its context must keep. */
    units: { list: string[]; mode: 'include' | 'exclude' } | null
    ctx: (x: Sample, at: At) => AnalyticsContext
  }

  /** A context's period filters and reporting date. */
  const atOf = (at: At) => ({
    filters: { period: at.period, customStart: at.customStart ?? null, customEnd: at.customEnd ?? null },
    asOfOverride: at.asOf ?? null,
  })

  /**
   * Every bridge Acting as and the unit filters reach: Finance and HR admin by unit and with each unit
   * left out, every HRBP and Leader pick. Finance keeps include filters only (src/access/scopes/
   * clamp.ts), so its "each unit left out" is every other unit included; HR admin keeps the exclude
   * (attack A2: a Finance exclude was cleared, and those scopes were the company bridge again).
   */
  function scopes(): ScopeMaker[] {
    const units = [...new Set(s.datasets.positions.map((r) => r.businessUnit))].sort()
    const out: ScopeMaker[] = []
    for (const mode of ['finance', 'hr-admin'] as const) {
      out.push({
        key: mode,
        units: null,
        ctx: (x, at) => {
          const { filters, asOfOverride } = atOf(at)
          return sampleCtx(mode, { sample: x, filters, asOfOverride })
        },
      })
      for (const u of units) {
        out.push({
          key: `${mode} ${u}`,
          units: { list: [u], mode: 'include' },
          ctx: (x, at) => {
            const { filters, asOfOverride } = atOf(at)
            return sampleCtx(mode, { sample: x, filters: { ...filters, businessUnit: [u] }, asOfOverride })
          },
        })
        const rest = units.filter((v) => v !== u)
        const left: ScopeMaker['units'] =
          mode === 'finance' ? { list: rest, mode: 'include' } : { list: [u], mode: 'exclude' }
        out.push({
          key: `${mode} all but ${u}`,
          units: left,
          ctx: (x, at) => {
            const { filters, asOfOverride } = atOf(at)
            return sampleCtx(mode, {
              sample: x,
              filters: {
                ...filters,
                businessUnit: left.list,
                ...(left.mode === 'exclude' ? { modes: { businessUnit: 'exclude' as const } } : {}),
              },
              asOfOverride,
            })
          },
        })
      }
    }
    const ctx = personaCtx('hrbp-se')
    const env: ScopeEnv = {
      positionIndex: ctx.positionIndex,
      asOf: ctx.asOf,
      all: ctx.all,
      lists: listsInForce(null, ctx.all, sampleSources(ctx.all)),
      personas: s.personas,
    }
    for (const mode of ['hrbp', 'leader'] as const)
      for (const o of actingAsOptions(mode, env)) {
        const { personId, unit } = o.pick
        out.push({
          key: `${mode} ${personId} ${unit ?? ''}`,
          units: null,
          ctx: (x, at) => {
            const { filters, asOfOverride } = atOf(at)
            return ctxAs(mode, personId, { sample: x, filters, asOfOverride, ...(unit ? { unit } : {}) })
          },
        })
      }
    return out
  }

  it('reads each Finance and HR admin scope with the unit filter it asks for, never the company again (attack A2)', () => {
    const list = scopes()
    const company = new Map<string, number>()
    let kept = 0
    for (const sc of list) {
      if (!sc.units) continue
      const ctx = sc.ctx(s, { period: 'fy' })
      expect(ctx.filters.businessUnit, sc.key).toEqual(sc.units.list)
      expect(ctx.filters.modes?.businessUnit ?? 'include', sc.key).toBe(sc.units.mode)
      // Not the company's bridge again: it starts on another total.
      const mode = ctx.mode
      if (!company.has(mode)) {
        const all = list.find((x) => x.key === mode)?.ctx(s, { period: 'fy' }) as AnalyticsContext
        company.set(mode, bridgeFigure(prepareForecast(all)).rows[0]?.value as number)
      }
      const start = bridgeFigure(prepareForecast(ctx)).rows[0]?.value
      expect(start, sc.key).not.toBe(company.get(mode))
      kept++
    }
    // Each unit, and each unit left out, in Finance and in HR admin.
    expect(kept).toBe(4 * new Set(s.datasets.positions.map((r) => r.businessUnit)).size)
    // Control: Finance clears a unit exclude, so a scope asking for one would read the company.
    const cleared = sampleCtx('finance', {
      filters: { businessUnit: ['Corporate'], modes: { businessUnit: 'exclude' } },
    })
    expect(cleared.filters.businessUnit).toEqual([])
  }, 600_000)

  const leaves = () =>
    s.datasets.workers
      .filter((w) => w.workerType === 'Employee' && w.onLeave === true && !!w.positionId)
      .sort((a, b) => (a.employeeId < b.employeeId ? -1 : 1))

  it('keeps every bridge as it was with every leave unpaid and with every leave paid, at every period', () => {
    const list = scopes()
    expect(list.filter((x) => x.key.startsWith('leader')).length).toBeGreaterThan(30)
    const all = (paid: boolean) =>
      withDatasets(s, {
        workers: s.datasets.workers.map((w) => (w.onLeave === true ? { ...w, leavePaid: paid } : w)),
      })
    const flipped = [
      ['every leave unpaid', all(false)],
      ['every leave paid', all(true)],
    ] as const
    const problems: string[] = []
    let rows = 0
    for (const period of ['fy', 'ytd', 'qtd', 'month'] as const)
      for (const sc of list) {
        const ctx = sc.ctx(s, { period })
        if (ctx.access.unset) continue
        const base = bridgeShape(ctx)
        rows += base.filter((x) => x.startsWith('row ')).length
        for (const [what, x] of flipped) {
          const after = bridgeShape(sc.ctx(x, { period }))
          if (JSON.stringify(after) !== JSON.stringify(base))
            problems.push(`${what} | ${sc.key} ${period}: ${firstDiff(base, after)}`)
        }
      }
    expect(problems.slice(0, 20).join('\n')).toBe('')
    // Non-vacuity: hundreds of rows, in every kind of scope.
    expect(rows).toBeGreaterThan(1_000)
  }, 1_800_000)

  it('keeps every bridge as it was with any one leave flipped, either way', () => {
    const list = scopes()
    const people = leaves()
    expect(people.filter((w) => w.leavePaid === false).length).toBeGreaterThan(0)
    expect(people.length).toBeGreaterThan(10)
    const base = new Map<string, string[]>()
    for (const sc of list) {
      const ctx = sc.ctx(s, { period: 'fy' })
      if (!ctx.access.unset) base.set(sc.key, bridgeShape(ctx))
    }
    const problems: string[] = []
    let compared = 0
    for (const w of people) {
      const x = withWorker(s, w.employeeId, { leavePaid: w.leavePaid === false })
      for (const sc of list) {
        const b = base.get(sc.key)
        if (!b) continue
        const after = bridgeShape(sc.ctx(x, { period: 'fy' }))
        compared++
        if (JSON.stringify(after) !== JSON.stringify(b))
          problems.push(`${w.employeeId} | ${sc.key}: ${firstDiff(b, after)}`)
      }
    }
    expect(problems.slice(0, 20).join('\n')).toBe('')
    expect(compared).toBeGreaterThan(1_000)
  }, 1_800_000)

  /**
   * Attack A1 (M2 close): with the reporting date before the last close (31 August, September
   * closed), the forecast prices the people hired in September from HRIS, but the twins the
   * leave-neutral seats were priced from did not know them, so their unpaid lines stood in for their
   * own twins: the FX tile's count read 97 or 98 with one hire's leave, and a unit whose months held
   * exactly 5 movers folded FX everywhere.
   */
  describe('at a reporting date before the last close (attack A1)', () => {
    const asOf: ISODate = '2026-08-31'
    const PERIODS: At[] = [
      { period: 'fy', asOf },
      { period: 'ytd', asOf },
      { period: 'qtd', asOf },
      { period: 'month', asOf },
      { period: 'custom', customStart: '2026-10-01', customEnd: '2026-12-31', asOf },
      { period: 'custom', customStart: '2026-11-01', customEnd: '2026-11-30', asOf },
    ]
    /** The people hired after the reporting date and on or before the last close. */
    const hired = () => {
      const lastClose = monthEnd(
        s.plan.closes
          .map((c) => c.month)
          .sort()
          .at(-1) as Month,
      )
      return s.datasets.workers
        .filter((w) => {
          const start = w.assignmentStart || w.hireDate
          return w.workerType === 'Employee' && !!w.positionId && start > asOf && start <= lastClose
        })
        .map((w) => w.employeeId)
        .sort()
    }
    const onLeaveAs = (ids: readonly string[], paid: boolean): Sample =>
      withDatasets(s, {
        workers: s.datasets.workers.map((w) =>
          ids.includes(w.employeeId) ? { ...w, onLeave: true, leavePaid: paid } : w,
        ),
      })
    const label = (at: At) => (at.period === 'custom' ? `${at.customStart}..${at.customEnd}` : at.period)

    it('keeps every bridge as it was with the people hired since on leave, and with every leave flipped, either way', () => {
      const ids = hired()
      expect(ids.length).toBeGreaterThanOrEqual(9)
      const all = (paid: boolean) =>
        withDatasets(s, {
          workers: s.datasets.workers.map((w) => (w.onLeave === true ? { ...w, leavePaid: paid } : w)),
        })
      const pairs = [
        ['the people hired since on leave', onLeaveAs(ids, true), onLeaveAs(ids, false)],
        ['every leave', all(true), all(false)],
      ] as const
      const problems: string[] = []
      let rows = 0
      for (const at of PERIODS)
        for (const sc of scopes())
          for (const [what, paid, unpaid] of pairs) {
            const ctx = sc.ctx(paid, at)
            if (ctx.access.unset) continue
            const a = bridgeShape(ctx)
            const b = bridgeShape(sc.ctx(unpaid, at))
            rows += a.filter((x) => x.startsWith('row ')).length
            if (JSON.stringify(a) !== JSON.stringify(b))
              problems.push(`${what} | ${sc.key} ${label(at)}: ${firstDiff(a, b)}`)
          }
      expect(problems.slice(0, 20).join('\n')).toBe('')
      expect(rows).toBeGreaterThan(1_000)
    }, 1_800_000)

    it('keeps every bridge as it was with any one person hired since on leave, paid or unpaid', () => {
      const ids = hired()
      expect(ids).toContain('E11729')
      const list = scopes()
      const problems: string[] = []
      let compared = 0
      for (const id of ids) {
        const paid = onLeaveAs([id], true)
        const unpaid = onLeaveAs([id], false)
        for (const at of [PERIODS[0], PERIODS[4]])
          for (const sc of list) {
            const ctx = sc.ctx(paid, at)
            if (ctx.access.unset) continue
            const a = bridgeShape(ctx)
            const b = bridgeShape(sc.ctx(unpaid, at))
            compared++
            if (JSON.stringify(a) !== JSON.stringify(b))
              problems.push(`${id} | ${sc.key} ${label(at)}: ${firstDiff(a, b)}`)
          }
      }
      expect(problems.slice(0, 20).join('\n')).toBe('')
      expect(compared).toBeGreaterThan(1_000)
      // Non-vacuity: Finance's FX tile counts E11729's seat (P-1064, EUR) after the last close.
      const tile = bridgeKpis(prepareForecast(list[0].ctx(onLeaveAs(['E11729'], false), PERIODS[4])))[0]
      const card = tile?.calc ? resolveCalc(tile.calc) : null
      expect(card?.inputs.find((x) => x.label === 'Non-USD positions whose cost moves')?.value).toBe(98)
    }, 1_800_000)
  })
})

/** The first line two shapes differ in, for failure messages. */
function firstDiff(a: readonly string[], b: readonly string[]): string {
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if (a[i] !== b[i]) return `${(a[i] ?? '(none)').slice(0, 160)} -> ${(b[i] ?? '(none)').slice(0, 160)}`
  return ''
}

/* ───────────── leave counts under filters and periods ───────────── */

/** Every HRBP and Leader scope at a date, as leave scopes (a company leader: the company). */
function leaveScopes(ctx: AnalyticsContext): LeaveScope[] {
  const env: ScopeEnv = {
    positionIndex: ctx.positionIndex,
    asOf: ctx.asOf,
    all: ctx.all,
    lists: listsInForce(null, ctx.all, sampleSources(ctx.all)),
    personas: s.personas,
  }
  const everyone = new Set(ctx.all.workers.map((w) => w.employeeId))
  const out = new Map<string, LeaveScope>()
  for (const mode of ['hrbp', 'leader'] as const)
    for (const o of actingAsOptions(mode, env)) {
      const r = scopeFor(mode, { ...NO_PICKS, [mode]: o.pick }, env)
      if (r.unset) continue
      const sc = r.scope
      const key = !sc
        ? 'company'
        : sc.kind === 'unit'
          ? `unit:${sc.unit}`
          : `tree:${[...sc.rootPositionIds].sort().join('+')}`
      if (!out.has(key)) out.set(key, { key, personIds: sc ? sc.personIds : everyone })
    }
  return [...out.values()]
}

/** The people on leave on a date (an active assignment whose row says on leave), from the rows. */
const onLeaveOn = (ctx: AnalyticsContext): Set<string> =>
  new Set(
    ctx.all.workers
      .filter(
        (w) =>
          w.onLeave === true &&
          (w.assignmentStart || w.hireDate) <= ctx.asOf &&
          !(w.assignmentEnd && w.assignmentEnd < ctx.asOf) &&
          !(w.terminationDate && w.terminationDate < ctx.asOf),
      )
      .map((w) => w.employeeId),
  )

/** Each class of people on leave: the shown sets that hold them, and how many. */
function classes(
  sets: readonly { key: string; people: ReadonlySet<string> }[],
  leave: ReadonlySet<string>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const id of leave) {
    const sig = sets
      .filter((x) => x.people.has(id))
      .map((x) => x.key)
      .join('|')
    if (sig) out.set(sig, (out.get(sig) ?? 0) + 1)
  }
  return out
}

/** A value of a filter dimension inside a scope: its unit, the first seat's department, cost center, ... */
function dimValue(
  ctx: AnalyticsContext,
  dim: (typeof LIST_DIMENSIONS)[number],
  scope: ScopeLock | null,
): string {
  const inside = [...ctx.positionIndex.byId.values()].find(
    (p) => !scope || scope.positionIds.has(p.positionId),
  )
  const w = ctx.all.workers.find((x) => x.positionId === inside?.positionId)
  switch (dim) {
    case 'businessUnit':
      return scope?.kind === 'unit' ? scope.unit : (inside?.businessUnit ?? 'Operations')
    case 'department':
      return inside?.department ?? 'Supply Chain'
    case 'costCenter':
      return inside?.costCenter ?? '1320-SJC'
    case 'location':
      return inside?.location ?? 'Munich'
    case 'level':
      return inside?.level ?? 'P4'
    case 'legalEntity':
      return inside?.legalEntity ?? w?.legalEntity ?? 'Northgate Semiconductor Inc.'
    default:
      return dim === 'currency' ? 'EUR' : 'Germany'
  }
}

describe('leave counts show only for whole scopes at the as-of date (7.7)', () => {
  const DATES = ['2026-08-31', '2026-09-30'] as const

  it('reads "—" under every filter and every non-default period', () => {
    let swept = 0
    for (const asOf of DATES) {
      const ctx = sampleCtx('hr-admin', { asOfOverride: asOf })
      for (const key of ['hrbp-se', 'leader-svp-se', 'leader-dv-director', 'leader-cfo'] as const) {
        const scope = personaCtx(key, { asOfOverride: asOf }).access.scope
        expect(leaveFit({ ...ctx.filters }, 'fy', scope), `${key} ${asOf}: the default`).toBeNull()
        for (const period of ['ytd', 'qtd', 'month', 'custom'] as const)
          expect(leaveFit(ctx.filters, period, scope), `${key} ${period}`).toBe(LEAVE_FIT_NOTE)
        for (const dim of LIST_DIMENSIONS) {
          const value = dimValue(ctx, dim, scope)
          for (const mode of ['include', 'exclude'] as const) {
            const f = { ...ctx.filters, [dim]: [value], modes: { [dim]: mode } }
            const pinned =
              dim === 'businessUnit' && mode === 'include' && scope?.kind === 'unit' && value === scope.unit
            if (!pinned) expect(leaveFit(f, 'fy', scope), `${key} ${dim} ${mode}`).toBe(LEAVE_FIT_NOTE)
            swept++
          }
        }
        expect(
          leaveFit({ ...ctx.filters, leaderId: 'P-1001', modes: { leaderId: 'exclude' } }, 'fy', scope),
        ).toBe(LEAVE_FIT_NOTE)
      }
    }
    expect(swept).toBeGreaterThan(100)
  })

  it('shows no leave number in an HRBP or Leader crawl under a filter or a period', () => {
    const number = (x: Seen) =>
      /plan\.leave\.onLeave/.test(x.tag.in) &&
      typeof x.value === 'number' &&
      !/glossary|formulas/.test(x.where)
    let crawled = 0
    for (const key of ['hrbp-se', 'leader-svp-se'] as const)
      for (const filters of [
        { location: ['Munich'] },
        { level: ['P6'], modes: { level: 'exclude' as const } },
        { period: 'qtd' as const },
      ]) {
        const c = crawl(personaCtx(key, { filters }), {
          views: ['plan', 'home'],
          cards: false,
          pages: false,
          files: false,
        })
        expect(
          c.seen.filter(number).map((x) => x.where),
          `${key} ${JSON.stringify(filters)}`,
        ).toEqual([])
        crawled += c.seen.length
      }
    expect(crawled).toBeGreaterThan(10_000)
    // Control: with no filter and the default period, the crawl reads the count (so it would see one).
    for (const key of ['hrbp-se', 'leader-svp-se'] as const) {
      const c = crawl(personaCtx(key), { views: ['plan'], cards: false, pages: false, files: false })
      expect(c.seen.filter(number).length, key).toBeGreaterThan(0)
    }
  }, 600_000)

  it('keeps every class of people across the shown leave sets at 0 or 5 or more, at both closes', () => {
    for (const asOf of DATES) {
      const ctx = sampleCtx('hr-admin', { asOfOverride: asOf })
      const scopes = leaveScopes(ctx)
      expect(scopes.length, asOf).toBeGreaterThan(20)
      const min = 5
      const shown = leaveShown(scopes, ctx.asOf, { workers: ctx.all.workers, min })
      const leave = onLeaveOn(ctx)
      // Non-vacuity: some scope's count shows, and some scope is held back.
      expect(shown.size, asOf).toBeGreaterThan(0)
      expect(shown.size, asOf).toBeLessThan(scopes.length)
      const sets = scopes.filter((x) => shown.has(x.key)).map((x) => ({ key: x.key, people: x.personIds }))
      for (const [sig, n] of classes(sets, leave)) expect(n >= min, `${asOf}: ${sig} holds ${n}`).toBe(true)
    }
  })

  it('control: counts under free filters, as the template app showed them, find a class of 1', () => {
    const ctx = sampleCtx('hr-admin')
    const leave = onLeaveOn(ctx)
    const rows = ctx.all.workers.filter((w) => leave.has(w.employeeId) && w.workerType === 'Employee')
    const min = 5
    // Each count of 5 or more under a unit (or the company), and under the same with one level or
    // location left out: two shown counts whose difference is one person on leave.
    const groups: [string, (w: (typeof rows)[number]) => boolean][] = [
      ['company', () => true],
      ...[...new Set(rows.map((w) => w.businessUnit ?? ''))].map(
        (u): [string, (w: (typeof rows)[number]) => boolean] => [u, (w) => w.businessUnit === u],
      ),
    ]
    const found: string[] = []
    for (const [name, inGroup] of groups) {
      const all = new Set(rows.filter(inGroup).map((w) => w.employeeId))
      if (all.size < min) continue
      for (const dim of ['level', 'location'] as const)
        for (const v of new Set(rows.map((w) => w[dim] ?? ''))) {
          const rest = new Set(rows.filter((w) => inGroup(w) && w[dim] !== v).map((w) => w.employeeId))
          if (rest.size < min) continue
          const sizes = [
            ...classes(
              [
                { key: 'all', people: all },
                { key: 'rest', people: rest },
              ],
              leave,
            ).values(),
          ]
          if (sizes.includes(1)) found.push(`${name} without ${dim} ${v}`)
        }
    }
    expect(found.length).toBeGreaterThan(0)
  })
})
