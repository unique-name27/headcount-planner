/**
 * My team on the sample (docs/PLAN.md 6.9, 9.3, 13.3 and 16.1): the three sample managers' allocations
 * and budget status words (Manager A, a Sales manager in Munich with 7 Filled seats, an Open seat, the
 * planted Munich P4 and a pending New role; Manager B with 3 Filled and 2 Open seats; Manager C fully
 * staffed, whose own seat is in a confidential Elimination), the hero's split adding up, the seven
 * key figures in 9.3's order each with its metric, fields and records or card, every count equal to
 * the rows its drill opens, every row inside the tree, no amount in any word the page carries, and
 * Manager C's page identical with and without the elimination of C's own seat (8.4 rule 3). Beside
 * the hero, Plan > Hiring's Open to hire tile for the tree (9.7): the tab's own tile, labelled
 * "Open to hire, FY27", with its note, and none outside a tree.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { inScope } from '@/access/records'
import type { Sample } from '@/data/sample'
import { calcProblems, resolveCalc } from '@/drill/calc'
import { resolveDrill } from '@/drill/types'
import type { Seen } from '@/testkit/crawl'
import { amountHits } from '@/testkit/leaks'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { OPEN_TO_HIRE_NOTE, planHiringModel } from '@/views/plan/engine/hiringTab'
import { ID as PLAN } from '@/views/plan/metrics'
import type { HeroModel } from '../../types'
import { ALLOCATION_CHANGE_FIELDS, ID } from '../metrics'
import { type TeamFacts, teamFacts } from './facts'
import { TEAM_FIGURES, TEAM_HIRING, TEAM_KEY_METRICS } from './figures'
import { type TeamModel, teamHeadline, teamModel } from './index'
import { sampleContext, teamSample } from './testkit'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let sample: Sample
const models: Record<'a' | 'b' | 'c', TeamModel> = {} as never
const ctxs: Record<'a' | 'b' | 'c', ReturnType<typeof sampleContext>> = {} as never
/** The engine inputs, read straight from `teamFacts` (the model carries only what the page shows). */
const facts: Record<'a' | 'b' | 'c', TeamFacts> = {} as never

beforeAll(() => {
  sample = teamSample()
  for (const k of ['a', 'b', 'c'] as const) {
    ctxs[k] = sampleContext('manager', { persona: `manager-${k}` })
    models[k] = teamModel(ctxs[k])
    facts[k] = teamFacts(ctxs[k])
  }
}, 120_000)

const tileOf = (m: TeamModel, metricId: string) => m.kpis.find((k) => k.metricId === metricId)

/** Money in any string the page carries: a currency sign or code, or a grouped number (7.6). */
const MONEY = /[$€£¥₹₪]|NT\$|\b(USD|EUR|INR|ILS|TWD|CNY|VND|CAD)\b|\b\d{1,3}(,\d{3})+\b/

/** Every string a model holds, functions resolved (drills and cards built). */
function strings(v: unknown, out: string[] = [], seen = new Set<unknown>()): string[] {
  if (v == null || seen.has(v)) return out
  if (typeof v === 'string') out.push(v)
  else if (typeof v === 'function') {
    try {
      strings((v as () => unknown)(), out, seen)
    } catch {
      /* a function needing arguments (a column's drill) is read through its rows elsewhere */
    }
  } else if (typeof v === 'object') {
    seen.add(v)
    for (const x of Object.values(v as Record<string, unknown>)) strings(x, out, seen)
  }
  return out
}

describe('the sample managers (docs/PLAN.md 13.3)', () => {
  it('Manager A: 9 seats (7 Filled, 1 Open, the planted Munich P4 Planned), 1 pending New role, On track', () => {
    const m = models.a
    const a = facts.a.allocation
    expect([a.heads, a.filled, a.open, a.planned]).toEqual([9, 7, 1, 1])
    expect([a.leftToFill, a.requested, a.leftToRequest]).toEqual([2, 0, 1])
    expect(facts.a.seats.planned.map((p) => p.positionId)).toEqual([sample.planted.munichP4.positionId])
    expect(facts.a.seats.open.map((p) => p.positionId)).toEqual([sample.planted.managerAOpen])
    expect(facts.a.pending.map((r) => r.requestId)).toEqual([sample.planted.managerANewRole])
    expect(tileOf(m, ID.requestsPending)?.value).toBe(1)
    // The New role adds 1 head from Feb 2027: 7 staffed + 1 stays within 9.
    expect(facts.a.effects).toEqual([
      expect.objectContaining({ requestId: sample.planted.managerANewRole, month: '2027-02', heads: 1 }),
    ])
    expect(facts.a.status?.status).toBe('On track')
    expect(facts.a.status?.text).toBe('On track')
    expect(tileOf(m, ID.budgetStatus)?.value as unknown).toBe('On track')
  })

  it('Manager B: 3 Filled and 2 Open seats, On track', () => {
    const a = facts.b.allocation
    expect([a.heads, a.filled, a.open, a.planned, a.leftToFill]).toEqual([5, 3, 2, 0, 2])
    expect(facts.b.seats.open.map((p) => p.positionId).sort()).toEqual(
      [...sample.planted.managerBOpen].sort(),
    )
    expect(facts.b.status?.text).toBe('On track')
  })

  it('Manager C: fully staffed, so At risk within 2% (R32 read literally)', () => {
    const a = facts.c.allocation
    expect([a.heads, a.filled, a.open, a.planned]).toEqual([7, 7, 0, 0])
    expect(facts.c.status).toMatchObject({ status: 'At risk', rule: 'within' })
    expect(facts.c.status?.text).toBe('At risk: your band cost is within 2% of your allocation')
    expect(tileOf(models.c, ID.budgetStatus)?.note).toBe('Your band cost is within 2% of your allocation')
  })

  it('keeps every row it shows inside the tree (the scope test)', () => {
    for (const k of ['a', 'b', 'c'] as const) {
      const ctx = ctxs[k]
      for (const r of models[k].tracker.rows)
        expect(inScope('requests', r, ctx), `${k} ${r.requestId}`).toBe(true)
      for (const t of [...models[k].kpis, models[k].hero]) {
        const spec = resolveDrill(t.drill)
        if (!spec) continue
        for (const row of spec.rows) expect(inScope(spec.kind, row, ctx), `${k} ${spec.title}`).toBe(true)
      }
    }
  })

  it('never puts the manager’s own seat or anything above it in the tree', () => {
    for (const k of ['a', 'b', 'c'] as const) {
      const scope = facts[k].scope
      expect(scope, k).not.toBeNull()
      const roots = scope?.rootPositionIds ?? new Set()
      for (const p of facts[k].seats.all) expect(roots.has(p.positionId), k).toBe(false)
      for (const p of facts[k].seats.all) expect(scope?.positionIds.has(p.positionId), k).toBe(true)
    }
  })
})

describe('the hero and key figures (docs/PLAN.md 9.3)', () => {
  const hero = (k: 'a' | 'b' | 'c'): HeroModel => models[k].hero

  it('Left to fill splits into Open, requested and left to request, adding up to it', () => {
    for (const k of ['a', 'b', 'c'] as const) {
      const h = hero(k)
      expect(h.id).toBe(TEAM_FIGURES.hero)
      expect(h.metric).toBe(ID.allocationLeftToFill)
      expect(h.parts.map((p) => p.key)).toEqual(['open', 'requested', 'left-to-request'])
      expect(
        h.parts.reduce((n, p) => n + p.count, 0),
        k,
      ).toBe(h.value)
      expect(resolveDrill(h.drill)?.rows.length, k).toBe(h.value)
      for (const p of h.parts) expect(resolveDrill(p.drill)?.rows.length, `${k} ${p.key}`).toBe(p.count)
    }
  })

  it('are the seven tiles in strip order, each with its metric, fields and records or card', () => {
    for (const k of ['a', 'b', 'c'] as const) {
      const m = models[k]
      expect(m.kpis.map((t) => t.metricId)).toEqual([...TEAM_KEY_METRICS])
      expect(new Set(m.kpis.map((t) => t.id)).size).toBe(m.kpis.length)
      for (const t of m.kpis) {
        expect(t.uses?.length, t.id).toBeGreaterThan(0)
        expect(!!t.drill || !!t.calc, t.id).toBe(true)
        expect(t.definition, t.id).toBe(ctxs[k].metrics.def(t.metricId as string)?.definition)
        // A "vs" figure names its comparison; My team's tiles compare with nothing but the allocation.
        if (t.delta != null) expect(t.deltaLabel, t.id).toMatch(/^vs /)
      }
    }
  })

  it('open exactly the records they count', () => {
    for (const k of ['a', 'b', 'c'] as const)
      for (const t of models[k].kpis) {
        if (!t.drill || typeof t.value !== 'number') continue
        expect(resolveDrill(t.drill)?.rows.length, `${k} ${t.id}`).toBe(t.value)
      }
  })

  it('give budget status a card of heads and words whose last step is its value', () => {
    for (const k of ['a', 'b', 'c'] as const) {
      const card = resolveCalc(tileOf(models[k], ID.budgetStatus)?.calc)
      expect(card, k).not.toBeNull()
      if (!card) continue
      expect(calcProblems(card), k).toEqual([])
      for (const s of strings(card)) expect(s, k).not.toMatch(MONEY)
      for (const i of card.inputs) expect(['int', 'pct', 'text'], i.label).toContain(i.format)
    }
  })

  it('note the allocation in standard heads (11.5) and never set status by them', () => {
    const m = models.a
    expect(m.standardHeads).not.toBeNull()
    expect(tileOf(m, ID.allocationHeads)?.note).toBe(
      `9 heads, ${(m.standardHeads ?? 0).toFixed(2)} standard heads`,
    )
  })

  it('give the folder tab left to fill in heads', () => {
    expect(teamHeadline(ctxs.a)).toMatchObject({
      value: '2',
      label: 'left to fill',
      metricId: ID.allocationLeftToFill,
    })
  })
})

describe('My list and the month figure', () => {
  it('track only requests for the tree the manager may see, the pending one waiting on its step', () => {
    const rows = models.a.tracker.rows as unknown as readonly (Record<string, unknown> & {
      requestId: string
    })[]
    expect(rows.length).toBe(facts.a.requests.length)
    const pending = rows.find((r) => r.requestId === sample.planted.managerANewRole)
    expect(pending?.state).toBe('Submitted')
    expect(String(pending?.step)).toMatch(/review \(step \d of \d\)$/)
    for (const r of rows) expect(r.view).toBe('full')
    for (const c of models.a.tracker.columns) expect(c.pay || c.cost || c.band, c.key).toBeFalsy()
  })

  it('draw staffed heads to fiscal year end against the allocation, pending requests from their month', () => {
    const rows = models.a.headsVsAllocation.rows
    expect(rows[0].month).toBe('2026-09')
    expect(rows.at(-1)?.month).toBe('2027-03')
    for (const r of rows) {
      expect(r.allocation).toBe(9)
      expect(r.withPending - r.staffed).toBe(r.month >= '2027-02' ? 1 : 0)
    }
  })
})

/**
 * Every value a model holds, read whole (no key skipped, typed arrays as numbers), as the leak
 * scanner reads a crawl: the model is the contract, so whatever it carries is what a later surface,
 * file or debug export would show.
 */
function rawSeen(v: unknown, where = 'team', out: Seen[] = [], seen = new Set<object>()): Seen[] {
  // A null holds no amount (a record's "—" cell, such as a request's band estimate in Manager mode).
  if (typeof v === 'function' || v === undefined || v === null) return out
  if (typeof v !== 'object') {
    out.push({ where, value: v as Seen['value'], tag: { in: 'team model' } })
    return out
  }
  if (seen.has(v)) return out
  seen.add(v)
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    Array.from(v as unknown as ArrayLike<number>).forEach((x, i) => {
      rawSeen(x, `${where}[${i}]`, out, seen)
    })
    return out
  }
  if (v instanceof Set || v instanceof Map) {
    let i = 0
    for (const x of v instanceof Map ? v.entries() : v.values()) rawSeen(x, `${where}[${i++}]`, out, seen)
    return out
  }
  if (Array.isArray(v))
    v.forEach((x, i) => {
      rawSeen(x, `${where}[${i}]`, out, seen)
    })
  else for (const [k, x] of Object.entries(v)) rawSeen(x, `${where}.${k}`, out, seen)
  return out
}

describe('lineage: each heads figure lists only the fields it reads (B3)', () => {
  /** The datasets a lineage reads. */
  const datasets = (uses: readonly string[]) => [...new Set(uses.map((r) => r.split('.')[0]))].sort()
  const partOf = (m: TeamModel, key: string) => m.hero.parts.find((p) => p.key === key)

  it('the allocation’s figures read seats, the rows approvals wrote and who sits in them, no request (known gap 6)', () => {
    const heads = [ID.allocationHeads, ID.allocationFilled, ID.allocationOpen, ID.allocationPlanned]
    for (const k of ['a', 'b', 'c'] as const) {
      const m = models[k]
      const figures = [
        { id: 'hero', uses: m.hero.uses ?? [] },
        { id: 'hero drill', uses: resolveDrill(m.hero.drill)?.uses ?? [] },
        { id: 'hero open', uses: resolveDrill(partOf(m, 'open')?.drill)?.uses ?? [] },
        ...heads.flatMap((id) => [
          { id, uses: tileOf(m, id)?.uses ?? [] },
          { id: `${id} drill`, uses: resolveDrill(tileOf(m, id)?.drill)?.uses ?? [] },
        ]),
        { id: ID.tradeStandardHeads, uses: ctxs[k].metrics.usesOf(ID.tradeStandardHeads) },
      ]
      for (const f of figures) {
        expect(f.uses.length, `${k} ${f.id}`).toBeGreaterThan(0)
        expect(
          f.uses.filter((r) => r.startsWith('requests.')),
          `${k} ${f.id}`,
        ).toEqual([])
        expect(f.uses, `${k} ${f.id}`).toEqual(expect.arrayContaining([...ALLOCATION_CHANGE_FIELDS]))
        const read = datasets(f.uses).filter((d) => d !== 'assumptions')
        expect(['positions', 'workers'], `${k} ${f.id}`).toEqual(expect.arrayContaining(read))
      }
      expect(datasets(tileOf(m, ID.allocationHeads)?.uses ?? []), k).toEqual(['positions'])
      expect(datasets(m.hero.uses ?? []), k).toEqual(['positions', 'workers'])
    }
  })

  it('the request-driven figures read the requests and who may see them', () => {
    const m = models.a
    for (const id of [ID.requestsPending, ID.allocationLeftToRequest, ID.budgetStatus]) {
      expect(tileOf(m, id)?.uses, id).toContain('requests.managerPositionId')
      expect(tileOf(m, id)?.uses, id).toContain('requests.steps')
    }
    // The hero's requested and left-to-request parts read reqs and pending Start recruiting requests.
    for (const key of ['requested', 'left-to-request']) {
      const used = resolveDrill(partOf(m, key)?.drill)?.uses ?? []
      expect(used, key).toEqual(expect.arrayContaining(['reqs.reqId', 'requests.type', 'requests.state']))
    }
  })
})

describe('what My team’s model carries (RM-5)', () => {
  it('holds only what the page shows: no plan of record, no band cost, read whole', () => {
    for (const k of ['a', 'b', 'c'] as const) {
      const m = models[k]
      expect(Object.keys(m).sort(), k).toEqual(
        [
          'headsVsAllocation',
          'hero',
          'hrbpChanges',
          'kpis',
          'openToHire',
          'standardHeads',
          'tracker',
          'tradeCredit',
        ].sort(),
      )
      expect(amountHits(rawSeen(m)), k).toEqual([])
      const text = JSON.stringify(m)
      for (const key of ['planOfRecord', 'bandCost', 'assumptions', 'rates', 'lines'])
        expect(text, `${k} ${key}`).not.toContain(`"${key}":`)
    }
  })

  it('control: the engine inputs it is built from hold the band cost the page never shows', () => {
    expect(amountHits(rawSeen(facts.a)).length).toBeGreaterThan(0)
  })
})

describe('no amount on My team (docs/PLAN.md 7.6)', () => {
  it('carries no currency sign, code or grouped number in any word, drill or card', () => {
    for (const k of ['a', 'b', 'c'] as const) {
      for (const s of strings(models[k])) expect(s, k).not.toMatch(MONEY)
      for (const rows of [models[k].tracker.rows, models[k].headsVsAllocation.rows])
        for (const s of strings(rows)) expect(s, k).not.toMatch(MONEY)
    }
  })
})

describe('Manager C and the confidential Elimination of C’s own seat (8.4 rule 3)', () => {
  it('shows the same page with and without it', () => {
    const id = sample.planted.managerCElimination
    const without: Sample = {
      ...sample,
      datasets: { ...sample.datasets, requests: sample.datasets.requests.filter((r) => r.requestId !== id) },
      plan: { ...sample.plan, requests: sample.plan.requests.filter((r) => r.requestId !== id) },
    }
    const other = teamModel(sampleContext('manager', { persona: 'manager-c', sample: without }))
    const view = (m: TeamModel) =>
      JSON.stringify({
        hero: {
          ...m.hero,
          drill: resolveDrill(m.hero.drill)?.rows.map((p) => (p as { positionId?: string }).positionId),
        },
        kpis: m.kpis.map((t) => ({
          ...t,
          drill: resolveDrill(t.drill)?.rows.length,
          calc: resolveCalc(t.calc),
        })),
        tracker: m.tracker.rows,
        months: m.headsVsAllocation.rows,
        credit: m.tradeCredit,
        openToHire: m.openToHire && {
          ...m.openToHire,
          drill: resolveDrill(m.openToHire.drill)?.rows.length,
          calc: resolveCalc(m.openToHire.calc),
        },
      })
    expect(view(other)).toBe(view(models.c))
    expect(facts.c.requests.map((r) => r.requestId)).not.toContain(id)
  })
})

describe('outside a manager’s tree', () => {
  it('shows no allocation and says why, never the company', () => {
    const m = teamModel(sampleContext('hr-admin'))
    expect(m.hero.value).toBeNull()
    expect(m.hero.reason).toMatch(/Acting as/)
    expect(m.kpis.map((t) => t.value)).toEqual([null, null, null, null, null, null, null])
    expect(m.tracker.rows).toEqual([])
    expect(m.openToHire).toBeNull()
  })
})

describe('Open to hire beside the hero (docs/PLAN.md 9.7 Homes)', () => {
  it('is Plan > Hiring’s own tile for the tree, labelled "Open to hire, FY27", opening Plan > Hiring', () => {
    for (const k of ['a', 'b', 'c'] as const) {
      const own = planHiringModel(ctxs[k]).kpis.find((t) => t.metricId === PLAN.hiringOpen)
      const t = models[k].openToHire
      expect(own, k).toBeDefined()
      expect(t?.metricId, k).toBe(TEAM_HIRING.metricId)
      expect(t?.label, k).toBe('Open to hire, FY27')
      expect(t?.link, k).toEqual({ view: 'plan', tab: 'hiring', label: 'Plan, Hiring' })
      // The tab's number, records or card and fields, never recomputed here.
      expect([t?.value, t?.format, t?.uses], k).toEqual([own?.value, own?.format, own?.uses])
      expect(resolveDrill(t?.drill)?.rows.length, k).toBe(resolveDrill(own?.drill)?.rows.length)
      expect(!!t?.drill || !!t?.calc, k).toBe(true)
      expect(t?.note?.endsWith(OPEN_TO_HIRE_NOTE), k).toBe(true)
      expect(t?.uses?.length, k).toBeGreaterThan(0)
    }
  })

  it('stays out of the seven key figures, and the hero stays Left to fill', () => {
    for (const k of ['a', 'b', 'c'] as const) {
      expect(
        models[k].kpis.map((t) => t.metricId),
        k,
      ).toEqual(TEAM_KEY_METRICS)
      expect(models[k].hero.metric, k).toBe(ID.allocationLeftToFill)
    }
  })
})
