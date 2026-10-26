/**
 * A trade's quote over the analytics context (docs/PLAN.md 11.2 to 11.5): the trade engine
 * (src/plan/engine/trade.ts `tradeQuote`) at the plan of record's locked rates for the get seats'
 * fiscal year (Working's for a year with no lock, "Rates can change until FY28 locks"), the seats as
 * the Working plan holds them on the as-of date, the giving org's credit derived from the requests in
 * force, and the freezes in force. One computation for the write path (`ActionEnv.quote`, and through
 * it Requests > New's quote card and What if's trade lever) and routing's leader threshold (a quote's
 * `getBandUsd`). Pure. An addition to the M3 freeze's files (core).
 *
 * Readings taken here (core, M3):
 *  - The giving org with none given is the lowest manager position whose tree holds every give seat
 *    on the as-of date (11.2), walking each seat's managers by its latest row.
 *  - `exceptRequestId` leaves that request out of the pending ones (a trade re-quoted at submit or at
 *    an approval step is not blocked by its own give seats, and its own credit stays its own).
 *
 * M4 (M3 known gap 6, CONTRACTS-M3 8.4): the quote reads each give seat's open req (`openReq`) and
 * whether the viewer sees a request in full (`requestShown`), so every surface that shows a quote
 * (Requests > New, the request cards, What if's trade lever) reads the engine's Interviewing warning
 * and "Rates can change until FY28 locks." from the quote itself:
 *  - A seat's open req is read as Requests' card has read it since M3 (views/requests/engine/quoteCard.ts
 *    `interviewingOf`): of the seat's reqs whose status is Open, the latest opened at Interviewing,
 *    else the latest opened.
 *  - `requestShown` is the context's Acting as person's 8.4 rule 6 (`requestView` is 'full') unless
 *    the caller passes one, so a pending-request block names the request only to a viewer who sees it
 *    in full and reads "another pending request" to everyone else (PV-9).
 */
import { requestView, viewerOf } from '@/access/visibility'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf } from '@/data/fiscal'
import { tradeSeatsOn } from '@/data/sample/trades'
import type { ReqRow } from '@/data/schema'
import { freezeOn } from '@/plan/engine/freeze'
import {
  creditBalance,
  type TradeAsk,
  type TradeQuote,
  type TradeSeat,
  tradeQuote,
} from '@/plan/engine/trade'
import { planOfRecord, workingOf } from '@/plan/engine/versions'
import type { HcRequest } from '@/plan/types'
import { inTreeOf, latestRows, ratesFor, workingFrame } from '@/views/targets/engine/working'
import { effectiveRequests } from './expiry'

/** The positions above a seat by the latest rows, nearest first. */
function managersAbove(ctx: Pick<AnalyticsContext, 'all'>, id: string): string[] {
  const latest = latestRows(ctx.all.positions)
  const out: string[] = []
  const seen = new Set<string>([id])
  let cur = latest.get(id)?.managerPositionId ?? null
  while (cur && !seen.has(cur)) {
    out.push(cur)
    seen.add(cur)
    cur = latest.get(cur)?.managerPositionId ?? null
  }
  return out
}

/** The lowest manager position whose tree holds every seat (11.2), or null. */
export function giveOrgOf(ctx: Pick<AnalyticsContext, 'all'>, ids: readonly string[]): string | null {
  if (!ids.length) return null
  const chains = ids.map((id) => managersAbove(ctx, id))
  for (const m of chains[0]) if (chains.every((c) => c.includes(m))) return m
  return null
}

/** A quote that cannot be priced: no version holds the year's trade rates. */
function unpriced(ask: TradeAsk, text: string): TradeQuote {
  return {
    ok: false,
    blocks: [{ code: 'no-band', text }],
    give: [],
    get: [],
    giveOrgPositionId: ask.giveOrgPositionId ?? '',
    giveBp: 0,
    getBp: 0,
    creditBp: 0,
    maxSeats: 0,
    ratio: 0,
    headsDelta: 0,
    inYearBp: 0,
    getBandUsd: 0,
    rates: { version: '', lockHash: null, standardHeadUsd: 0 },
  }
}

/** The requests a quote reads: every request in force, less one when re-quoting it. */
export const quoteRequests = (ctx: AnalyticsContext, exceptRequestId?: string): readonly HcRequest[] => {
  // D-EXPIRY (SC-3): an expired trade holds no seat and no credit, so it reads Expired here.
  const all = effectiveRequests(ctx)
  return exceptRequestId ? all.filter((r) => r.requestId !== exceptRequestId) : all
}

type OpenReq = NonNullable<TradeSeat['openReq']>

const openReqsMemo = new WeakMap<readonly ReqRow[], ReadonlyMap<string, OpenReq>>()

/** Each seat's open req, by position (see the module comment), once per reqs list. */
export function openReqsOf(reqs: readonly ReqRow[]): ReadonlyMap<string, OpenReq> {
  const hit = openReqsMemo.get(reqs)
  if (hit) return hit
  const best = new Map<string, ReqRow>()
  const rank = (r: ReqRow): number => (r.stage === 'Interviewing' ? 1 : 0)
  for (const r of reqs) {
    if (!r.positionId || r.status !== 'Open') continue
    const cur = best.get(r.positionId)
    if (!cur || rank(r) > rank(cur) || (rank(r) === rank(cur) && r.openedDate > cur.openedDate))
      best.set(r.positionId, r)
  }
  const out = new Map<string, OpenReq>()
  for (const [id, r] of best) out.set(id, { reqId: r.reqId, stage: r.stage ?? null })
  openReqsMemo.set(reqs, out)
  return out
}

/** Whether the context's Acting as person sees a request in full (8.4 rule 6), by its ID. */
function shownInFullOf(
  ctx: AnalyticsContext,
  requests: readonly HcRequest[],
): (requestId: string) => boolean {
  let byId: ReadonlyMap<string, HcRequest> | null = null
  return (id) => {
    byId ??= new Map(requests.map((r) => [r.requestId, r]))
    const r = byId.get(id)
    return !!r && requestView(r, viewerOf(ctx)) === 'full'
  }
}

/**
 * A trade's quote (see the module comment). `inScope` marks the give seats the viewer may trade;
 * `requestShown` is the context's viewer's full view of a request when not given.
 */
export function tradeQuoteOf(
  ctx: AnalyticsContext,
  ask: TradeAsk,
  opts: {
    exceptRequestId?: string
    inScope?: (positionId: string) => boolean
    requestShown?: (requestId: string) => boolean
  } = {},
): TradeQuote {
  const year = fiscalYearOf(ask.get.start)
  const version = planOfRecord(ctx.versions, year) ?? workingOf(ctx.versions, year)
  if (!version) return unpriced(ask, `There are no trade rates for ${year} yet.`)
  const rates = ratesFor(ctx.all, version)
  const requests = quoteRequests(ctx, opts.exceptRequestId)
  const seats = tradeSeatsOn(ctx.all, ctx.asOf, ask.give, requests)
  const reqs = openReqsOf(ctx.all.reqs)
  for (const [id, s] of seats)
    seats.set(id, {
      ...s,
      ...(opts.inScope ? { inScope: opts.inScope(id) } : {}),
      openReq: reqs.get(id) ?? null,
    })
  const frame = workingFrame(ctx, year)
  const inTree = inTreeOf(ctx.all.positions)
  const latest = latestRows(ctx.all.positions)
  return tradeQuote(ask, seats, rates, {
    requestShown: opts.requestShown ?? shownInFullOf(ctx, requests),
    asOf: ctx.asOf,
    firstOpenMonth: frame.firstOpenMonth,
    proration: version.proration,
    creditBalanceBp: (org) => creditBalance(requests, org, year),
    giveOrgOf: (ids) => giveOrgOf(ctx, ids),
    freezeOn: (org, on) => {
      const m = latest.get(org)
      if (!m) return null
      const f = freezeOn(
        ctx.all.freezes,
        {
          positionId: null,
          managerPositionId: org,
          businessUnit: m.businessUnit,
          department: m.department ?? null,
          costCenter: m.costCenter,
        },
        on,
        inTree,
      )
      return f ? { freezeId: f.freezeId } : null
    },
  })
}
