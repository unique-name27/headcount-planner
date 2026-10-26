/**
 * What if's model on the generated sample (docs/PLAN.md 7.2 rules 5 and 6, 9.1, 10.6, 11.5, 11.8,
 * 16.2; M3 scenarios for the whatif builder), in every mode:
 *  - the result strip: exactly the three `whatif.delta.*` KPIs plus one `requests.trade.ratio` per
 *    trade lever, each with its metric, lineage and a calculation card that adds up;
 *  - deferring one Planned seat shows its band delta in HRBP, Leader and Finance (a band figure, the
 *    hand calculation to the cent), and Manager mode gets no What if at all;
 *  - a difference whose two sides differ in an HRIS or offer amount is guarded (rule 5);
 *  - a freeze lever plus one cancel lever turns into exactly one Elimination draft, the freeze lever
 *    skipped with FREEZE_LEVER_NOTE, previewed by the model and written through the write path;
 *  - a trade lever blocks Filled and accepted-offer seats and shows its rate;
 *  - the levers reset for another Acting as person;
 *  - what each mode must not see: no amount in Manager mode, no Filled or accepted-offer seat
 *    offered as a lever, no seat outside the scope, no amount in any text, no turning into requests
 *    in Finance.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { METRIC_IDS } from '@/access/ids'
import { decide } from '@/access/policy'
import { hasAmount, requestView, viewerOf } from '@/access/visibility'
import { approveAll, chainOk, scenario, type Who } from '@/app/write/scenario.testkit'
import type { Kpi } from '@/components/types'
import { differenceNote } from '@/cost/differences'
import { SHOWS_IN_FINANCE_NOTE } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf, monthsOf } from '@/data/fiscal'
import { SAMPLE_AS_OF, type Sample } from '@/data/sample'
import type { Mode } from '@/data/schema'
import { calcProblems, resolveCalc } from '@/drill/calc'
import { requestsOf, seatStateOf } from '@/drill/seats'
import { addDays } from '@/lib/dates'
import { requestIdInText } from '@/plan/actions/requestIds'
import { inYearFraction } from '@/plan/engine/proration'
import { ACCEPTED_OFFER_TEXT } from '@/plan/engine/requests'
import { creditBalance, FILLED_NOT_TRADED_TEXT, type TradeAsk } from '@/plan/engine/trade'
import {
  FREEZE_LEVER_NOTE,
  type Lever,
  leverSeatsOfYear,
  OUT_OF_SCOPE_TEXT,
  readingDateOf,
  type WhatIfResult,
} from '@/plan/engine/whatif'
import type { HcRequest } from '@/plan/types'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ctxAs, leakSample, personaCtx, personaOf, sampleCtx, withPlanRequests } from '@/testkit/sample'
import { viewScopeKey } from '@/views/data/engine/sharedFile'
import { emptyForm, type NewRequestForm, newRequestPreview } from '@/views/requests/engine/new'
import { OTHER_PENDING_TEXT } from '@/views/requests/engine/quoteCard'
import { ID as REQUESTS_ID } from '@/views/requests/metrics'
import { prepare } from '@/views/targets/engine/base'
import { ID, metrics as whatifMetrics } from '../metrics'
import { costDifference, whatIfSentence, whatifHeadline, whatifModel } from './index'
import { clearLevers, leversFor, setLevers } from './session'
import { tradeRateNote } from './words'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const SE = 'Silicon Engineering'
const SHOWN: readonly Mode[] = ['hrbp', 'leader', 'finance', 'hr-admin']
/** A currency sign or code beside a number: an amount in words. */
const MONEY = /NT\$|[$€£¥₹₪]|\b(?:USD|EUR|GBP|INR|ILS|TWD|CNY|CAD|VND)\b/

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

/** Each mode's persona context (the sample's default picks: the SE HRBP, the SVP of SE, FP&A, HR admin). */
const ctxOf = (mode: Mode): AnalyticsContext => sampleCtx(mode)

/** A Planned seat in Silicon Engineering's scope with a planned start in FY27 after the first open day. */
function plannedSeat(ctx: AnalyticsContext) {
  const p = prepare(ctx)
  const on = readingDateOf(p.fiscalYear, p.actx)
  const seat = leverSeatsOfYear(p.fiscalYear, p.actx, (place) => place.businessUnit === SE).find(
    (x) => x.status === 'Planned' && x.start != null && x.start > on && x.start < '2027-03-01',
  )
  if (!seat) throw new Error('The sample has no Planned SE seat starting in FY27')
  return { p, seat, on }
}

/** Every KPI keeps the view contract: a known metric, lineage, and a card that adds up. */
function checkKpi(k: Kpi, where: string) {
  expect(METRIC_IDS, `${where} ${k.id}`).toContain(k.metricId)
  expect(k.uses?.length, `${where} ${k.id} uses`).toBeGreaterThan(0)
  expect(typeof k.calc, `${where} ${k.id} calc`).toBe('function')
  const card = resolveCalc(k.calc)
  expect(card, `${where} ${k.id} card`).not.toBeNull()
  if (card) {
    expect(calcProblems(card), `${where} ${k.id}`).toEqual([])
    expect(card.value, `${where} ${k.id} card value`).toBe(k.value)
  }
}

/** Every text the model holds: no amount (7.2 rule 6), no "!" and no em dash. */
function texts(m: ReturnType<typeof whatifModel>['levers']): string[] {
  return [
    ...m.kpis.flatMap((k) => [k.label, k.note ?? '', k.suppressedNote ?? '', k.formula ?? '']),
    ...m.levers.rows.flatMap((r) => [r.label, r.refused ?? '', r.becomes, r.tradeNote ?? '']),
    m.levers.note ?? '',
    m.levers.empty ?? '',
    m.seats.note ?? '',
    m.seats.empty ?? '',
    ...(m.turnInto ? [...m.turnInto.skipped, m.turnInto.refused ?? ''] : []),
    m.can.useWhy ?? '',
    m.can.turnIntoWhy ?? '',
    m.pickers.giveNote ?? '',
    ...m.pickers.give.map((g) => g.blocked ?? ''),
  ].filter(Boolean)
}

describe('the result strip (9.1, C29)', () => {
  it('holds exactly the three whatif.delta KPIs, plus one trade rate per trade lever, in every mode that shows What if', () => {
    for (const mode of SHOWN) {
      const ctx = ctxOf(mode)
      const empty = whatifModel(ctx).levers
      expect(
        empty.kpis.map((k) => k.metricId),
        mode,
      ).toEqual([ID.deltaHeads, ID.deltaCost, ID.deltaGap])
      // No lever: nothing differs, so every result reads 0.
      expect(
        empty.kpis.map((k) => k.value),
        mode,
      ).toEqual([0, 0, 0])
      for (const k of empty.kpis) checkKpi(k, `${mode} empty`)
      const { seat } = plannedSeat(ctx)
      const give = empty.pickers.give.find((g) => !g.blocked && g.positionId !== seat.positionId)
      const org = empty.pickers.orgs.find((o) => o.businessUnit === SE)
      expect(give && org, mode).toBeTruthy()
      const trade: TradeAsk = {
        give: [give?.positionId as string],
        creditUsedBp: 0,
        giveOrgPositionId: null,
        get: {
          level: 'P2',
          location: 'Bengaluru',
          fte: 1,
          orgPositionId: org?.positionId as string,
          businessUnit: SE,
          jobFamily: null,
          start: '2027-01-01',
          count: 'max',
          partTimeRest: false,
        },
      }
      const levers: Lever[] = [
        { kind: 'defer', positionId: seat.positionId, to: '2027-03-01' },
        { kind: 'trade', ask: trade },
        { kind: 'trade', ask: { ...trade, get: { ...trade.get, location: 'San Jose', level: 'P3' } } },
      ]
      const m = whatifModel(ctx, levers).levers
      expect(
        m.kpis.map((k) => k.metricId),
        mode,
      ).toEqual([ID.deltaHeads, ID.deltaCost, ID.deltaGap, REQUESTS_ID.tradeRatio, REQUESTS_ID.tradeRatio])
      expect(new Set(m.kpis.map((k) => k.id)).size, mode).toBe(m.kpis.length)
      for (const k of m.kpis) checkKpi(k, mode)
      // The model is cached per context and levers array.
      expect(whatifModel(ctx, levers)).toBe(whatifModel(ctx, levers))
    }
  })
})

describe('deferring one Planned seat (7.2 rule 5, differences.test.ts at the view)', () => {
  it('shows its band delta, to the cent, in HRBP, Leader and Finance, as a band figure', () => {
    for (const mode of ['hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const ctx = ctxOf(mode)
      const { p, seat } = plannedSeat(ctx)
      const to = '2027-03-01'
      const band = p.actx.bandUsd(seat.seat, seat.place) as number
      const months = monthsOf(p.fiscalYear)
      const proration = p.actx.proration
      const expected =
        band *
        (inYearFraction(proration, months, to, null) -
          inYearFraction(proration, months, seat.start as string, null))
      const m = whatifModel(ctx, [{ kind: 'defer', positionId: seat.positionId, to }]).levers
      const cost = m.kpis.find((k) => k.metricId === ID.deltaCost)
      expect(cost?.value, mode).not.toBeNull()
      expect(cost?.value as number, mode).toBeCloseTo(expected, 2)
      expect(cost?.value as number, mode).toBeLessThan(0)
      expect(cost?.suppressed, mode).toBeUndefined()
      // A band figure's card lists the lever's part and adds it up; no count of people.
      const card = resolveCalc(cost?.calc)
      expect(card?.steps.at(-1)?.result as number, mode).toBeCloseTo(expected, 2)
      expect(card?.steps[0].label, mode).toBe(`Lever 1: Defer ${seat.positionId}'s start to 1 Mar 2027`)
      // A start inside the year that moves within it changes no head at the year's end.
      expect(m.kpis.find((k) => k.metricId === ID.deltaHeads)?.value, mode).toBe(0)
    }
  })

  it('gives Manager mode no What if: no KPI, lever, seat, quote or picker, and no amount', () => {
    for (const key of ['manager-a', 'manager-b', 'manager-c'] as const) {
      const ctx = personaCtx(key)
      const { seat } = plannedSeat(sampleCtx('hrbp'))
      const m = whatifModel(ctx, [{ kind: 'defer', positionId: seat.positionId, to: '2027-03-01' }]).levers
      expect(m.hidden, key).toBe(decide('manager', 'view:whatif').how)
      expect(m.kpis, key).toEqual([])
      expect(m.levers.rows, key).toEqual([])
      expect(m.seats.rows, key).toEqual([])
      expect(m.trades, key).toEqual([])
      expect(m.turnInto, key).toBeNull()
      expect(m.pickers.give, key).toEqual([])
      expect(m.pickers.orgs, key).toEqual([])
      expect(m.can.use, key).toBe(false)
      expect(JSON.stringify(m), key).not.toMatch(MONEY)
      expect(whatifHeadline(ctx).value, key).toBe('—')
    }
  })
})

describe('a difference that moves an HRIS or offer amount (7.2 rule 5)', () => {
  it('is guarded: under 5 costed contributors it reads "—" in every mode but HR admin with pay shown', () => {
    const filled = (ctx: AnalyticsContext, n: number) => {
      const p = prepare(ctx)
      const out: string[] = []
      for (const id of p.actx.positionIds) {
        const x = p.actx.seatOn(id, ctx.asOf)
        if (x?.status === 'Filled' && x.place.businessUnit === SE) out.push(id)
        if (out.length === n) break
      }
      return out
    }
    const result = (ids: string[]): WhatIfResult => ({
      deltaHeads: 0,
      deltaCost: 12_345.67,
      deltaGap: 0,
      bandOnly: false,
      contributors: ids,
      trades: [],
      refused: [],
    })
    for (const mode of ['hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const ctx = ctxOf(mode)
      const p = prepare(ctx)
      const few = costDifference(p, result(filled(ctx, 3)), ctx.asOf)
      expect(few.value, mode).toBeNull()
      expect(few.band, mode).toBe(false)
      expect(few.reason, mode).toBe(differenceNote(ctx.guard.rules.minContributors))
      const many = costDifference(p, result(filled(ctx, 6)), ctx.asOf)
      if (ctx.guard.mode === 'rounded') {
        // A rounded mode never shows a non-band difference built from exact amounts.
        expect(many.value, mode).toBeNull()
        expect(many.reason, mode).toBe(SHOWS_IN_FINANCE_NOTE)
      } else {
        expect(many.value, mode).toBe(12_345.67)
        expect(many.contributors, mode).toBe(6)
      }
    }
    const open = sampleCtx('hr-admin', { showPay: true })
    expect(costDifference(prepare(open), result(filled(open, 1)), open.asOf).value).toBe(12_345.67)
    // Band seats never count toward the 5: six Planned seats alone are still under the minimum.
    const ctx = ctxOf('finance')
    const p = prepare(ctx)
    const planned = leverSeatsOfYear(p.fiscalYear, p.actx, () => true)
      .slice(0, 6)
      .map((x) => x.positionId)
    expect(costDifference(p, result(planned), ctx.asOf).value).toBeNull()
  })
})

describe('Turn into requests (10.6, 16.2)', () => {
  it('a freeze lever plus one cancel lever is exactly one Elimination draft, previewed and written', async () => {
    const sc = scenario()
    const hr: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const ctx = await sc.ctx(hr)
    const { seat } = plannedSeat(ctx)
    const levers: Lever[] = [
      { kind: 'freeze', orgPositionId: personaOf(s, 'leader-svp-se').positionId, from: '2026-11-01' },
      { kind: 'cancel', positionId: seat.positionId },
    ]
    const preview = whatifModel(ctx, levers).levers
    expect(preview.turnInto).toEqual({
      drafts: 1,
      skipped: [`Lever 1: ${FREEZE_LEVER_NOTE}`],
      refused: null,
    })
    expect(preview.levers.rows.map((r) => r.becomes)).toEqual([
      'No request: freezes are set by Finance',
      'Elimination',
    ])
    // The freeze lever is still costed in the results.
    const freezeOnly = whatifModel(ctx, [levers[0]]).levers.kpis.find((k) => k.metricId === ID.deltaCost)
    expect(freezeOnly?.value as number).toBeLessThan(0)

    const out = await sc.run(hr, 'turnLeversIntoRequests', { levers })
    expect(out.outcome).toEqual({
      ok: true,
      notice: `1 draft request made for review in Requests > Mine. ${FREEZE_LEVER_NOTE}`,
    })
    const drafts = (await sc.plan()).requests.filter((r) => r.state === 'Draft')
    expect(drafts.map((r) => [r.type, r.positionId, r.requesterId])).toEqual([
      ['Elimination', seat.positionId, hr.personId],
    ])
    expect(out.entries.map((e) => [e.object, e.field, e.new, e.by])).toEqual([
      ['request', 'state', 'Draft', hr.personId],
    ])
    expect(chainOk(await sc.log())).toBe(true)
    // After the write the context rebuilds: the draft is in the plan the model reads.
    const after = await sc.ctx(hr)
    expect(requestsOf(after).some((r) => r.requestId === drafts[0].requestId)).toBe(true)
  }, 120_000)

  it('is not offered in Finance, which keeps the levers and results', () => {
    const ctx = ctxOf('finance')
    const { seat } = plannedSeat(ctx)
    const m = whatifModel(ctx, [{ kind: 'cancel', positionId: seat.positionId }]).levers
    expect(m.turnInto).toBeNull()
    expect(m.can.turnInto).toBe(false)
    expect(m.can.turnIntoWhy).toBe(decide('finance', 'action:whatif.turn-into-requests').how)
    expect(m.can.use).toBe(true)
    expect(m.kpis.find((k) => k.metricId === ID.deltaHeads)?.value).toBe(-1)
  })
})

describe('the trade lever (11.5, 11.8)', () => {
  it('blocks Filled and accepted-offer seats and shows its rate', () => {
    for (const mode of ['hrbp', 'leader', 'hr-admin'] as const) {
      const ctx = ctxOf(mode)
      const p = prepare(ctx)
      const empty = whatifModel(ctx).levers
      const org = empty.pickers.orgs.find((o) => o.businessUnit === SE)?.positionId as string
      const ask = (give: string[]): TradeAsk => ({
        give,
        creditUsedBp: 0,
        giveOrgPositionId: null,
        get: {
          level: 'P2',
          location: 'Bengaluru',
          fte: 1,
          orgPositionId: org,
          businessUnit: SE,
          jobFamily: null,
          start: '2027-01-01',
          count: 'max',
          partTimeRest: false,
        },
      })
      const inSe = (id: string) => p.latest.get(id)?.businessUnit === SE
      const filled = p.actx.positionIds.find(
        (id) => inSe(id) && p.actx.seatOn(id, ctx.asOf)?.status === 'Filled',
      ) as string
      const offer = p.actx.positionIds.find(
        (id) => inSe(id) && p.actx.seatOn(id, ctx.asOf)?.acceptedOffer === true,
      ) as string
      expect(filled && offer, mode).toBeTruthy()
      const tradable = empty.pickers.give.find((g) => !g.blocked)?.positionId as string
      const m = whatifModel(ctx, [
        { kind: 'trade', ask: ask([filled]) },
        { kind: 'trade', ask: ask([offer]) },
        { kind: 'trade', ask: ask([tradable]) },
      ]).levers
      expect(
        m.levers.rows.map((r) => r.refused),
        mode,
      ).toEqual([FILLED_NOT_TRADED_TEXT, ACCEPTED_OFFER_TEXT, null])
      const rates = m.kpis.filter((k) => k.metricId === REQUESTS_ID.tradeRatio)
      expect(
        rates.map((k) => k.suppressedNote ?? null),
        mode,
      ).toEqual([FILLED_NOT_TRADED_TEXT, ACCEPTED_OFFER_TEXT, null])
      expect(rates[0].value, mode).toBeNull()
      expect(rates[2].value, mode).toBe(m.trades[2].quote.ratio)
      expect(rates[2].value as number, mode).toBeGreaterThan(1)
      expect(resolveCalc(rates[2].calc)?.steps.at(-1)?.result, mode).toBe(m.trades[2].quote.ratio)
      // A refused trade changes nothing; the tradable one adds its head effect.
      const heads = m.kpis.find((k) => k.metricId === ID.deltaHeads)?.value
      expect(heads, mode).toBe(m.trades[2].quote.headsDelta)
      // The pickers never offer a Filled seat, and an accepted offer only as blocked, with its reason.
      expect(
        empty.pickers.give.some((g) => g.positionId === filled),
        mode,
      ).toBe(false)
      expect(empty.pickers.give.find((g) => g.positionId === offer)?.blocked ?? null, mode).toBe(
        ACCEPTED_OFFER_TEXT,
      )
      expect(empty.pickers.giveNote, mode).toBe(`Filled seats are not listed. ${FILLED_NOT_TRADED_TEXT}`)
      // Counts read in plain words (14.3, R86; review CP-5): "get 1 seat", never "get 1 seats".
      const q = m.trades[2].quote
      const seats = q.get.length === 1 ? '1 seat' : `${q.get.length} seats`
      expect(rates[2].note, mode).toBe(
        `Give ${(q.giveBp / 10_000).toFixed(2)} standard heads, get ${seats}, ${(q.creditBp / 10_000).toFixed(2)} left as trade credit`,
      )
      expect(resolveCalc(rates[2].calc)?.note, mode).toBe(
        `Get ${seats}, ${(q.creditBp / 10_000).toFixed(2)} standard heads left as trade credit.`,
      )
    }
  })

  it('writes one seat as "1 seat" in the rate note and the card (review CP-5)', () => {
    const note = tradeRateNote({ giveBp: 12_200, creditBp: 2_500, get: [{}] })
    expect(note).toBe('Give 1.22 standard heads, get 1 seat, 0.25 left as trade credit')
    expect(tradeRateNote({ giveBp: 20_000, creditBp: 0, get: [{}, {}] })).toBe(
      'Give 2.00 standard heads, get 2 seats, 0.00 left as trade credit',
    )
  })
})

describe('Heads change is read at the target date (R58, review CP-9)', () => {
  it('defines heads at the scope’s target date, as the engine counts them', () => {
    const def = whatifMetrics.find((m) => m.id === ID.deltaHeads)
    expect(def?.definition).toMatch(/^The change the levers make to heads at the scope’s target date/)
    expect(def?.definition).not.toMatch(/at the fiscal year end:/)
    expect(def?.window).toBe(whatifMetrics.find((m) => m.id === ID.deltaGap)?.window)
  })
})

describe('accepted offers are never a lever target (C23)', () => {
  it('are not offered as seats, and a lever naming one is refused, for every accepted offer in scope', () => {
    for (const mode of ['hrbp', 'hr-admin'] as const) {
      const ctx = ctxOf(mode)
      const p = prepare(ctx)
      const on = readingDateOf(p.fiscalYear, p.actx)
      const offers = p.actx.positionIds.filter((id) => {
        const x = p.actx.seatOn(id, on)
        return x?.acceptedOffer === true && (mode === 'hr-admin' || x.place.businessUnit === SE)
      })
      expect(offers.length, mode).toBeGreaterThan(0)
      const m = whatifModel(ctx).levers
      const offered = new Set(m.seats.rows.map((r) => r.positionId))
      for (const id of offers) expect(offered.has(id), `${mode} ${id}`).toBe(false)
      const levers: Lever[] = offers.flatMap((id): Lever[] => [
        { kind: 'defer', positionId: id, to: '2027-03-01' },
        { kind: 'cancel', positionId: id },
        { kind: 'level', positionId: id, level: 'P5' },
        { kind: 'location', positionId: id, location: 'Munich' },
      ])
      const r = whatifModel(ctx, levers).levers
      expect(new Set(r.levers.rows.map((x) => x.refused)), mode).toEqual(new Set([ACCEPTED_OFFER_TEXT]))
      expect(
        r.kpis.map((k) => k.value),
        mode,
      ).toEqual([0, 0, 0])
    }
  })
})

describe('the levers belong to one view (session memory)', () => {
  it('reset for another Acting as person, and the folder tab follows the view’s own levers', () => {
    clearLevers()
    const svp = personaCtx('leader-svp-se')
    const director = personaCtx('leader-dv-director')
    const { seat } = plannedSeat(svp)
    const levers: Lever[] = [{ kind: 'cancel', positionId: seat.positionId }]
    setLevers(viewScopeKey(svp), levers)
    expect(leversFor(viewScopeKey(svp))).toEqual(levers)
    expect(leversFor(viewScopeKey(director))).toEqual([])
    expect(whatifHeadline(svp).value).toBe('−1')
    expect(whatifHeadline(director).value).toBe('±0')
    // The same person in another mode is another view too.
    const asHrbp = ctxAs('hrbp', personaOf(s, 'leader-svp-se').employeeId, { unit: SE })
    expect(leversFor(viewScopeKey(asHrbp))).toEqual([])
    clearLevers()
    expect(whatifHeadline(svp).value).toBe('±0')
  })
})

describe('what each mode must not see', () => {
  it('offers only in-scope Planned seats and Open seats with no accepted offer, and refuses the rest', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const ctx = ctxOf(mode)
      const p = prepare(ctx)
      const on = readingDateOf(p.fiscalYear, p.actx)
      const m = whatifModel(ctx).levers
      expect(m.seats.rows.length, mode).toBeGreaterThan(0)
      for (const r of m.seats.rows) {
        const x = p.actx.seatOn(r.positionId, on) ?? p.actx.seatOn(r.positionId, '2027-03-31')
        expect(['Planned', 'Open'], `${mode} ${r.positionId}`).toContain(x?.status)
        expect(x?.acceptedOffer, `${mode} ${r.positionId}`).toBe(false)
        expect(p.latest.get(r.positionId)?.businessUnit, `${mode} ${r.positionId}`).toBe(SE)
      }
      // No seat row and no picker row carries an amount field.
      for (const r of m.seats.rows) for (const v of Object.values(r)) expect(typeof v).not.toBe('number')
      // A Planned seat in another unit is refused as outside the scope.
      const other = leverSeatsOfYear(
        p.fiscalYear,
        p.actx,
        (place) => place.businessUnit === 'Go-to-Market',
      )[0]
      const r = whatifModel(ctx, [{ kind: 'cancel', positionId: other.positionId }]).levers
      expect(r.levers.rows[0].refused, mode).toBe(OUT_OF_SCOPE_TEXT)
      expect(
        r.kpis.map((k) => k.value),
        mode,
      ).toEqual([0, 0, 0])
    }
  })

  it('writes no amount into any text, and no "!" or em dash, in any mode', () => {
    for (const mode of SHOWN) {
      const ctx = ctxOf(mode)
      const { seat } = plannedSeat(ctx)
      const org = whatifModel(ctx).levers.pickers.orgs[0].positionId
      const m = whatifModel(ctx, [
        { kind: 'defer', positionId: seat.positionId, to: '2027-03-01' },
        { kind: 'shift', positionIds: [seat.positionId, 'P-NONE'], months: 2 },
        { kind: 'level', positionId: seat.positionId, level: 'P5' },
        { kind: 'location', positionId: seat.positionId, location: 'Munich' },
        { kind: 'freeze', orgPositionId: org, from: '2026-12-01' },
      ]).levers
      for (const t of texts(m)) {
        expect(hasAmount(t), `${mode}: ${t}`).toBe(false)
        expect(t, mode).not.toContain('!')
        expect(t, mode).not.toContain('—')
      }
      expect(m.levers.rows.map((r) => r.refused)).toEqual([
        null,
        'P-NONE: There is no seat P-NONE in this plan.',
        null,
        null,
        null,
      ])
    }
  })

  it('shows a band figure in HRBP and Leader mode only as one: never a non-band exact amount', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const ctx = ctxOf(mode)
      const { seat } = plannedSeat(ctx)
      const m = whatifModel(ctx, [{ kind: 'cancel', positionId: seat.positionId }]).levers
      const cost = m.kpis.find((k) => k.metricId === ID.deltaCost)
      const card = resolveCalc(cost?.calc)
      expect(card?.note, mode).toContain('Only band estimates change')
      // Trade quotes carry their band estimates where band estimates show, and only there.
      expect(ctx.access.can('cost:band'), mode).toBe(true)
    }
  })
})

describe('the scope inside the opening sentence (review UI-14)', () => {
  it('reads "the whole company" in a sentence, and an org by its name', () => {
    expect(whatIfSentence('Whole company', 'FY27')).toBe('What if for the whole company, FY27 Working')
    expect(whatIfSentence('Whole company except Sales', 'FY27')).toBe(
      'What if for the whole company except Sales, FY27 Working',
    )
    expect(whatIfSentence(SE, 'FY27')).toBe('What if for Silicon Engineering, FY27 Working')
    const finance = whatifModel(sampleCtx('finance')).levers.scope
    expect(finance.sentence).toBe(`What if for the whole company, ${finance.fiscalYear} Working`)
    expect(finance.sentence).not.toContain('Whole company')
    const hrbp = whatifModel(personaCtx('hrbp-se')).levers.scope
    expect(hrbp.sentence).toBe(`What if for ${hrbp.label}, ${hrbp.fiscalYear} Working`)
  })
})

describe('trade credit an expired trade held (review SC-3, D-EXPIRY)', () => {
  it('is free again in the pickers: an expired request reserves nothing', () => {
    const all = requestsOf(sampleCtx('hr-admin'))
    const trade = all.find((r) => r.type === 'Trade' && r.trade) as HcRequest
    const t = trade.trade as NonNullable<HcRequest['trade']>
    const org = t.giveOrgPositionId as string
    const year = fiscalYearOf(trade.startDate as string)
    // An approved trade that earned 420 bp for the giving org, and a trade that spent it, sent back
    // and idle for more than 60 days.
    const idle = `${addDays(SAMPLE_AS_OF, -61)}T09:00:00.000Z`
    const earned: HcRequest = {
      ...trade,
      requestId: 'R-EARN-1',
      state: 'Approved',
      trade: { ...t, creditBp: 420 },
    }
    const spent: HcRequest = {
      ...trade,
      requestId: 'R-EXP-1',
      state: 'Sent back',
      updatedAt: idle,
      submittedAt: idle,
      cycleId: null,
      trade: { ...t, creditBp: 0, creditUsedBp: 420 },
    }
    const ctx = sampleCtx('hr-admin', { sample: withPlanRequests(s, [earned, spent]) })
    // Stored, the spent trade still reads Sent back and holds the 420 bp.
    expect(creditBalance(requestsOf(ctx), org, year)).toBe(0)
    // Read on the as-of date it is Expired, so the org holds its 420 bp again.
    const credit = whatifModel(ctx).levers.pickers.credits.find((x) => x.positionId === org)
    expect(credit?.bp).toBe(420)
  })
})

describe('a seat an approved internal move holds (review SC-6)', () => {
  it('is not offered as a seat a lever can change once the move is approved', async () => {
    const sc = scenario()
    const hr: Who = { mode: 'hrbp', personId: 'E10140', unit: 'Operations' }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const seatsOf = async () => whatifModel(await sc.ctx(admin)).levers.seats.rows.map((r) => r.positionId)
    expect(await seatsOf()).toContain('P-2485')
    const made = await sc.run(hr, 'processTransfer', {
      kind: 'internal',
      personId: 'E10531',
      fromPositionId: 'P-1903',
      toPositionId: 'P-2485',
      effectiveDate: '2026-11-02',
      moveBudget: false,
      reasonCode: 'Restructure',
    } as never)
    expect(made.outcome.ok).toBe(true)
    const id = /R-[0-9A-Z-]+\d/.exec(made.outcome.ok ? made.outcome.notice : '')?.[0] as string
    expect((await sc.run(hr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    // Pending, the seat is still the receiving unit's to plan.
    expect(await seatsOf()).toContain('P-2485')
    const steps = await approveAll(sc, id)
    expect(steps.every((x) => x.outcome.ok)).toBe(true)
    expect((await sc.request(id))?.state).toBe('Approved')
    expect(await seatsOf()).not.toContain('P-2485')
    // A trade lever's give list names it blocked, with the move.
    const give = whatifModel(await sc.ctx(admin)).levers.pickers.give.find((g) => g.positionId === 'P-2485')
    expect(give?.blocked ?? '').toMatch(/held for .*an approved transfer/)
  }, 300_000)
})

describe('the trade lever’s notes, as the request card reads them (M3 known gap 6)', () => {
  /** A trade of P-2554 (its req REQ-4185 is at Interviewing) for P1 seats under its own manager. */
  const ask = (ctx: AnalyticsContext, start: string): TradeAsk => {
    const seat = seatStateOf(ctx, 'P-2554')
    if (!seat) throw new Error('The sample has no seat P-2554.')
    return {
      give: ['P-2554'],
      creditUsedBp: 0,
      giveOrgPositionId: null,
      get: {
        level: 'P1',
        location: seat.position.location,
        fte: 1,
        orgPositionId: seat.position.managerPositionId ?? '',
        businessUnit: seat.position.businessUnit,
        jobFamily: null,
        start,
        count: 'max',
        partTimeRest: false,
      },
    }
  }
  /** Requests > New's form for the same trade. */
  const formOf = (a: TradeAsk): NewRequestForm => {
    const form: NewRequestForm = {
      ...emptyForm('Trade'),
      reasonCode: 'Level mix' as never,
      managerPositionId: a.get.orgPositionId,
      level: a.get.level,
      location: a.get.location,
      fte: 1,
      startDate: a.get.start,
    }
    form.trade = { ...(form.trade as NonNullable<NewRequestForm['trade']>), give: [...a.give] }
    return form
  }
  const WARNING = 'REQ-4185 on P-2554 is interviewing. Trading the seat leaves the req open as imported.'

  it('shows the Interviewing warning, and the rates note on FY28 Working rates, in the card’s words', () => {
    const ctx = ctxOf('hr-admin')
    const fy27 = ask(ctx, '2027-01-04')
    const fy28 = ask(ctx, '2027-06-07')
    const { seat } = plannedSeat(ctx)
    const m = whatifModel(ctx, [
      { kind: 'trade', ask: fy27 },
      { kind: 'trade', ask: fy28 },
      { kind: 'defer', positionId: seat.positionId, to: '2027-03-01' },
    ]).levers
    expect(m.levers.rows.map((r) => r.tradeNote)).toEqual([
      WARNING,
      `Rates can change until FY28 locks. ${WARNING}`,
      null,
    ])
    expect(m.trades.map((t) => t.quote.warnings?.map((w) => w.reqId))).toEqual([['REQ-4185'], ['REQ-4185']])
    // Requests > New's card for the same trades reads the same sentences.
    const card27 = newRequestPreview(ctx, formOf(fy27)).quote?.lines ?? []
    const card28 = newRequestPreview(ctx, formOf(fy28)).quote?.lines ?? []
    expect(card27).toContain(WARNING)
    expect(card27.some((l) => l.startsWith('Rates can change'))).toBe(false)
    expect(card28).toEqual(expect.arrayContaining(['Rates can change until FY28 locks.', WARNING]))
    expect(card27.filter((l) => l === WARNING)).toHaveLength(1)
    // The table, the copied scenario and every mode's text keep the rules.
    expect(m.levers.columns.map((c) => c.key)).toContain('tradeNote')
    for (const t of texts(m)) expect(hasAmount(t), t).toBe(false)
  })

  it('names a pending request in a give seat’s block only to a viewer who sees it in full (PV-9)', () => {
    let named = 0
    for (const mode of SHOWN) {
      const ctx = ctxOf(mode)
      const viewer = viewerOf(ctx)
      const pending = whatifModel(ctx).levers.pickers.give.filter((g) =>
        g.blocked?.includes('pending request'),
      )
      for (const g of pending) {
        const id = requestIdInText(g.blocked ?? '')
        if (!id) {
          expect(g.blocked, `${mode} ${g.positionId}`).toBe(OTHER_PENDING_TEXT)
          continue
        }
        named++
        const req = requestsOf(ctx).find((r) => r.requestId === id)
        expect(req && requestView(req, viewer), `${mode} ${g.positionId}`).toBe('full')
      }
    }
    // HR admin sees every request in full, so the check is not vacuous.
    expect(named).toBeGreaterThan(0)
  })
})
