/**
 * Outside HR admin, nothing derived from one Filled salary or one accepted offer shows per position
 * (docs/PLAN.md 7.2 rules 1 to 4, 7.4, 16.1). One at a time: each Filled seat's `baseSalary` in
 * Manager B's team and in story 8's 1550-HSZ; the `offerBase`, `signOnBonus`, `relocation` and
 * `agencyFee` of each of story 2's 6 Hsinchu offers, of story 4's honored Corporate offer and of one
 * accepted offer in an HRBP atom (Manager B's Open seat); one eliminated Filled seat's `baseSalary`
 * (its severance); and a back-dated comp row in a closed month. Each time the HRBP, Leader and
 * Finance crawls (clock pinned; Finance > Versions, its drills, every export and the Shareable file
 * included) equal their baselines apart from what the guard lets move: totals over 5 or more costed
 * people (whole-step rounded totals in HRBP and Leader), differences with 5 or more contributors and
 * their contributor lists. A one-time or severance change moves no component cell. The HR admin
 * control with pay amounts shown must differ, and no Shareable file holds a per-position amount.
 *
 * The crawls read every amount (`focus: 'money'`): amounts cell by cell, every other cell of a
 * records list as a digest, so a status word, flag, count, chain step or row list that moved still
 * shows. From M4 they also read the long CSV of the version shown and of the forecast row by row
 * (each amount with its cell's costed people), its control totals, and Finance's FP&A load file, the
 * whole company's (src/testkit/crawl.ts `longExports`), so a file row moves only as its 5 or more
 * costed people's total does.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { siteByLocation } from '@/data/schema'
import type { Adjustment } from '@/plan/types'
import { type Crawl, crawl } from '@/testkit/crawl'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { badMoves, bySurface, changesOf, moveRulesFor } from '@/testkit/moves'
import { PAY_DELTA, type Perturbation, positionPerturbations } from '@/testkit/perturbations'
import {
  ctxAs,
  leakSample,
  personaOf,
  pinClock,
  sampleCtx,
  seatViewerContexts,
  unpinClock,
  withBackDatedComp,
  withSalaryDelta,
} from '@/testkit/sample'
import { placementOf, shownLines, versionLinesOf } from '@/views/plan/engine/core'
import { foldsOf as planFoldsOf } from '@/views/plan/engine/guarded'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  pinClock()
  s = leakSample()
}, 120_000)
afterAll(() => unpinClock())

/** A change of pay big enough to move every total it is in, in local currency (src/testkit/perturbations.ts). */
const DELTA = PAY_DELTA

/** 16.1's per-position amount changes (src/testkit/perturbations.ts, which Plan > Hiring's leak test reads too). */
const perturbations = (): Perturbation[] => positionPerturbations(s)

/** The crawl a test compares: every amount, every other value as itself or as a digest. */
const read = (ctx: AnalyticsContext): Crawl => crawl(ctx, { focus: 'money' })

describe('one Filled salary or one accepted offer, per position (16.1)', () => {
  it('lists the perturbations 16.1 names', () => {
    const list = perturbations()
    // 3 + 3 salaries, 8 offers x 4 fields, the severance and the back-dated row.
    expect(list.length).toBe(3 + 3 + 8 * 4 + 1 + 1)
  })

  it('moves only what the guard lets move in HRBP, Leader and Finance', () => {
    const baselines = new Map<string, Crawl>()
    const problems: string[] = []
    let moved = 0
    let compared = 0
    let fileMoves = 0
    for (const p of perturbations()) {
      const changed = p.sample()
      for (const v of seatViewerContexts(s, p.positionId)) {
        let base = baselines.get(v.key)
        if (!base) {
          base = read(v.ctx(s))
          expect(base.errors, v.key).toEqual([])
          baselines.set(v.key, base)
        }
        const ctx = v.ctx(changed)
        const after = read(ctx)
        const changes = changesOf(base.seen, after.seen)
        moved += changes.length
        fileMoves += changes.filter((c) => c.where.startsWith('file load-file/r ')).length
        compared++
        for (const line of badMoves(changes, moveRulesFor(ctx, p.oneTime), {
          before: base.seen,
          after: after.seen,
        }))
          problems.push(`${p.what} | ${v.key} | ${line}`)
      }
    }
    expect(bySurface(problems).slice(0, 60).join('\n')).toBe('')
    // Non-vacuity: every perturbation was crawled in three modes, and totals did move.
    expect(compared).toBe(perturbations().length * 3)
    expect(moved).toBeGreaterThan(perturbations().length)
    // M4: the crawls read the long CSV in every mode and the load file in Finance, row by row, and
    // the load file's rows moved with some perturbation (a 5+ cell's total).
    for (const [key, c] of baselines) {
      expect(
        c.seen.some((x) => x.where.startsWith('export long-csv version/r ')),
        key,
      ).toBe(true)
      expect(
        c.seen.some((x) => x.where.startsWith('file load-file/r ')),
        key,
      ).toBe(key.startsWith('finance'))
    }
    expect(fileMoves, 'load file amounts that moved').toBeGreaterThan(0)
  }, 1_800_000)

  it('control: HR admin with pay amounts shown sees every change, on the seat card', () => {
    // The plan view with no cards, and the perturbed seat's position card: with pay amounts shown the
    // card lists its holder's pay or its req's offer, sign-on, relocation and agency fee.
    const admin = (x: Sample, seat: string) =>
      crawl(sampleCtx('hr-admin', { sample: x, showPay: true }), {
        views: ['plan'],
        pages: false,
        help: false,
        files: false,
        texts: false,
        cards: 0,
        cardsOf: [seat],
        focus: 'money',
      })
    const bases = new Map<string, ReturnType<typeof admin>>()
    const list = perturbations()
    const unseen: string[] = []
    for (const p of list) {
      let base = bases.get(p.positionId)
      if (!base) {
        base = admin(s, p.positionId)
        bases.set(p.positionId, base)
      }
      if (!changesOf(base.seen, admin(p.sample(), p.positionId).seen).length) unseen.push(p.what)
    }
    // Every change shows with pay amounts on but the severance, which booked in a closed month.
    expect(unseen.filter((w) => !/severance/.test(w))).toEqual([])
  }, 900_000)
})

describe('Finance at one as-of date under C33 (reviews RF-2 to RF-5)', () => {
  /** A 1110-SJC holder (a shown cost center in both folds), hired before the year. */
  const holder = () => {
    const ctx = sampleCtx('finance', { sample: s })
    const place = placementOf(ctx)
    const w = s.datasets.workers.find(
      (x) =>
        x.workerType === 'Employee' &&
        !!x.positionId &&
        place.get(x.positionId)?.costCenter === '1110-SJC' &&
        x.hireDate < '2026-01-01' &&
        !x.terminationDate &&
        !x.assignmentEnd,
    )
    if (!w?.positionId) throw new Error('No 1110-SJC holder.')
    const row = place.get(w.positionId) as NonNullable<ReturnType<typeof place.get>>
    const country = siteByLocation.get(row.location)?.country as string
    return { w, positionId: w.positionId, unit: row.businessUnit, country }
  }
  const finance = (x: Sample, filters = {}) => sampleCtx('finance', { sample: x, filters })
  /** The money values that moved, as after − before. */
  const movedMoney = (a: Crawl, b: Crawl): { where: string; d: number }[] =>
    changesOf(a.seen, b.seen)
      .filter(
        (c) =>
          (c.after ?? c.before)?.tag.money &&
          typeof c.before?.value === 'number' &&
          typeof c.after?.value === 'number',
      )
      .map((c) => ({ where: c.where, d: (c.after?.value as number) - (c.before?.value as number) }))

  it('no shown figure, or difference of two, gives a back-dated raise’s closed months (RF-4)', () => {
    const h = holder()
    const raised = withBackDatedComp(s, h.w.employeeId, '2026-07-01', 12_000)
    // What reading the closed months from Working's own lines would give away: the raise in July to
    // September, which the closes (made before it was entered) do not hold.
    const fy = (x: Sample, own: boolean) => {
      const ctx = finance(x)
      const v = ctx.version
      if (!v) throw new Error('No Working version.')
      const lines = own ? versionLinesOf(ctx, v) : shownLines(ctx, v)
      return lines.filter((l) => l.positionId === h.positionId).reduce((t, l) => t + l.usd.loaded, 0)
    }
    const closedPart = fy(raised, true) - fy(s, true) - (fy(raised, false) - fy(s, false))
    expect(Math.abs(closedPart)).toBeGreaterThan(100)
    const a = read(finance(s))
    const b = read(finance(raised))
    const moved = movedMoney(a, b)
    expect(moved.length).toBeGreaterThan(0)
    const deltas = [...new Set(moved.map((m) => Math.round(m.d * 100)))]
    const target = Math.round(closedPart * 100)
    const near = (x: number) => Math.abs(Math.abs(x) - Math.abs(target)) <= 1
    const hits: string[] = []
    for (const m of moved) if (near(Math.round(m.d * 100))) hits.push(m.where)
    for (let i = 0; i < deltas.length; i++)
      for (let j = i + 1; j < deltas.length; j++)
        if (near(deltas[i] - deltas[j])) hits.push(`${deltas[i] / 100} − ${deltas[j] / 100}`)
    expect(hits.slice(0, 5)).toEqual([])
  }, 300_000)

  it('moves no amount under a multi-center or a country-by-units filter (RF-2, RF-5)', () => {
    const h = holder()
    const paid = withSalaryDelta(s, h.w.employeeId, DELTA)
    const folds = planFoldsOf(finance(s), finance(s).version)
    const shown = [...(folds?.get(h.unit)?.shown ?? [])]
    const other = shown.find((cc) => cc !== '1110-SJC')
    expect(other).toBeDefined()
    const otherUnit = [...(folds?.keys() ?? [])].find((u) => u !== h.unit) as string
    const contexts = [
      { costCenter: ['1110-SJC', other as string] },
      { costCenter: shown },
      { country: [h.country], businessUnit: [h.unit, otherUnit] },
    ]
    for (const filters of contexts) {
      const moved = movedMoney(read(finance(s, filters)), read(finance(paid, filters)))
      expect(
        moved.slice(0, 5).map((m) => m.where),
        JSON.stringify(filters),
      ).toEqual([])
    }
    // Control: with no filter the unit's totals move.
    expect(movedMoney(read(finance(s)), read(finance(paid))).length).toBeGreaterThan(0)
  }, 300_000)

  /**
   * One back-dated Other HRIS change (RF-3). Posted into its month (docs/PLAN.md 6.6, the spec's
   * "back-dated changes post as adjustments"; lead decision D-SPEC, review SA-2), it is that person's
   * cost in a closed month, so it may move what one person's pay moves there and nothing else: totals
   * over 5 or more costed people and differences with 5 or more contributors, the rule every
   * perturbation above is held to (whole units and shown cost centers, its seat's fold). Of the
   * adjustment itself nothing shows: Finance > Versions lists no row, count, amount or note for one
   * Other HRIS change (6.6, C33 (d)). Under a cost-center or country filter cost reads "—" (C33 (a)),
   * so nothing moves at all.
   */
  it('shows one person’s back-dated Other HRIS change only inside totals over 5 or more (RF-3, SA-2)', () => {
    const h = holder()
    const z = { base: 0, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0 }
    const adjustment: Adjustment = {
      id: `adj-${h.w.employeeId}`,
      postedIn: '2026-09',
      forMonth: '2026-07',
      positionId: h.positionId,
      kind: 'other',
      delta: {
        employeeId: h.w.employeeId,
        positionId: h.positionId,
        month: '2026-07',
        heads: 0,
        fte: 0,
        active: 0,
        currency: 'USD',
        rate: 1,
        local: { ...z, base: 2_345.67 },
        usd: { ...z, base: 2_345.67, equity: 0, loaded: 2_345.67 },
        leave: 'none',
      },
      reason: 'Other HRIS change',
    }
    const planted: Sample = { ...s, plan: { ...s.plan, adjustments: [...s.plan.adjustments, adjustment] } }
    let posted: number[] = []
    for (const filters of [
      {},
      { businessUnit: [h.unit] },
      { costCenter: ['1110-SJC'] },
      { country: [h.country] },
    ]) {
      const label = JSON.stringify(filters)
      const ctx = finance(planted, filters)
      const a = read(finance(s, filters))
      const b = read(ctx)
      expect(b.errors, label).toEqual([])
      const changes = changesOf(a.seen, b.seen)
      const problems = badMoves(changes, moveRulesFor(ctx), { before: a.seen, after: b.seen }).map(
        (line) => `RF-3 | ${label} | ${line}`,
      )
      expect(bySurface(problems).slice(0, 20).join('\n'), label).toBe('')
      expect(
        changes
          .filter((c) => /adjustment/i.test(c.where))
          .slice(0, 5)
          .map((c) => c.where),
        label,
      ).toEqual([])
      if ('costCenter' in filters || 'country' in filters)
        expect(
          changes.slice(0, 5).map((c) => c.where),
          label,
        ).toEqual([])
      if (!Object.keys(filters).length)
        posted = movedMoney(a, b)
          .filter((m) => m.where === 'view plan/tab overview.kpis/tile cost-ytd.value')
          .map((m) => Math.round(m.d * 100) / 100)
    }
    // Non-vacuous: posted in a closed month, it is in the year to date's actual, to the cent (SA-2).
    expect(posted).toEqual([2_345.67])
    // Control: HR admin with pay amounts shown reads it.
    const admin = (x: Sample) =>
      crawl(sampleCtx('hr-admin', { sample: x, showPay: true }), {
        views: ['finance'],
        pages: false,
        help: false,
        files: false,
        texts: false,
        cards: false,
        focus: 'money',
      })
    expect(changesOf(admin(s).seen, admin(planted).seen).length).toBeGreaterThan(0)
  }, 300_000)
})

describe('no per-position amount in a Shareable file (16.1)', () => {
  const MONEY_KEY = /^(usd|local|loaded|base|delta)$/

  it('holds no per-position money key and no Filled seat row with an amount', () => {
    const filled = new Set(
      s.datasets.workers
        .filter((w) => w.workerType === 'Employee' && w.positionId && !w.assignmentEnd && !w.terminationDate)
        .map((w) => w.positionId as string),
    )
    let rows = 0
    for (const key of ['hrbp-se', 'leader-svp-se', 'leader-dv-director', 'finance-fpa'] as const) {
      const p = personaOf(s, key)
      const ctx = ctxAs(p.mode, p.employeeId, {
        sample: s,
        ...(key === 'hrbp-se' ? { unit: 'Silicon Engineering' } : {}),
      })
      const c = crawl(ctx, { cards: false, recordExports: 'digest' })
      const text = c.seen.find((x) => x.where === 'file shareable')?.value as string
      expect(typeof text, key).toBe('string')
      const json = JSON.parse(text) as { body: { plan: Record<string, unknown> } }
      const keys: string[] = []
      const walk = (v: unknown, at: string): void => {
        if (Array.isArray(v)) {
          for (const [i, x] of v.entries()) walk(x, `${at}[${i}]`)
        } else if (v && typeof v === 'object')
          for (const [k, x] of Object.entries(v)) {
            if (MONEY_KEY.test(k)) keys.push(`${at}.${k}`)
            walk(x, `${at}.${k}`)
          }
      }
      walk(json.body.plan, 'plan')
      expect(keys.slice(0, 5), key).toEqual([])
      const models = (json.body.plan.models ?? {}) as Record<
        string,
        { columns: { key: string; money: boolean; band: boolean }[]; rows: Record<string, unknown>[] }
      >
      for (const [id, f] of Object.entries(models)) {
        const money = f.columns.filter((col) => col.money && !col.band).map((col) => col.key)
        for (const r of f.rows) {
          rows++
          const seat = typeof r.positionId === 'string' ? r.positionId : null
          if (seat && filled.has(seat))
            for (const m of money) expect(r[m] ?? null, `${key} ${id} ${seat}.${m}`).toBeNull()
        }
      }
    }
    expect(rows).toBeGreaterThan(100)
  }, 600_000)
})
