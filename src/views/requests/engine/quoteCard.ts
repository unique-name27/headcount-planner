/**
 * A trade's quote card (docs/PLAN.md 11.5, 11.6): the sentences Requests > New, Mine and Approvals
 * show for a quote, in weights and heads only ("Give 1 P5 San Jose (1.92). Get 8 P3 Bengaluru (1.81).
 * Credit 0.11 standard heads. Heads +7. In FY27 this saves 0.35 standard heads (start dates)."), the
 * blocks with their seats, and the USD band estimates only where `cost:band` shows (never in Manager
 * mode: "Managers see heads and standard heads, never amounts."). Weights are basis points of a
 * standard head (`ui:trade-weights`, every mode); no sentence holds an amount. Pure.
 *
 * Readings taken here (requests-ui, M3):
 *  - Seats are grouped by level, location and FTE in the order they come ("1 P4 Munich and 1 P4
 *    Munich at 0.8 FTE"); the weight in brackets is the group's whole weight, the credit used is its
 *    own clause ("and 0.11 standard heads of trade credit").
 *  - Heads are the quote's `headsDelta` ("Heads +7", "Heads −7", "Heads 0"); a given On hold seat adds
 *    "The On hold seat you give was not counted in your heads."
 *  - The in-year sentence reads |inYearBp| ÷ 10,000 to 2 decimals as "saves" when negative and
 *    "costs" when positive; a quote that moves nothing in-year says so.
 *  - A quote priced from a year whose Working is not locked (no lock hash) adds "Rates can change
 *    until <year> locks." (11.2): pending trades of that year are re-quoted at each approval step.
 *  - A give seat whose open req is at Interviewing adds a warning naming the req and the seat
 *    (11.4: the req stays open as imported once the seat is traded).
 *  - A seat already in a pending request names that request only where the viewer sees it in full;
 *    otherwise "another pending request" (8.4 rule 6: no ID of a request the viewer cannot see).
 *
 * M4 (M3 known gap 6): the app's quote (src/app/write/quote.ts `tradeQuoteOf`) now carries the
 * engine's Interviewing warnings and rates note, in this card's words (trade.ts `interviewingText`,
 * `ratesChangeText`), so the card reads them from the quote (`quoteNotes`) and What if's trade lever
 * reads the same sentences. `QuoteCardInput.interviewing` stays for a quote made without the seats'
 * reqs; a seat named by both is named once.
 */
import type { AnalyticsContext } from '@/data/context'
import type { FiscalYear } from '@/data/schema'
import { MINUS } from '@/lib/format'
import { SH_BP } from '@/plan/engine/band'
import {
  interviewingText,
  ratesChangeText,
  standardHeads,
  type TradeLine,
  type TradeQuote,
} from '@/plan/engine/trade'
import type { TradeQuoteCard } from './new'

/** "1 P5 San Jose", "6 P3 Bengaluru", "1 P4 Munich at 0.8 FTE". */
function groupLabel(n: number, l: Pick<TradeLine, 'level' | 'location' | 'fte'>): string {
  return `${n} ${l.level} ${l.location}${l.fte === 1 ? '' : ` at ${l.fte} FTE`}`
}

/** Seat lines grouped by level, location and FTE, in order: "1 P5 San Jose and 2 P4 Munich". */
export function seatGroups(lines: readonly Pick<TradeLine, 'level' | 'location' | 'fte'>[]): string {
  const groups: { line: Pick<TradeLine, 'level' | 'location' | 'fte'>; n: number }[] = []
  for (const l of lines) {
    const g = groups.find(
      (x) => x.line.level === l.level && x.line.location === l.location && x.line.fte === l.fte,
    )
    if (g) g.n++
    else groups.push({ line: l, n: 1 })
  }
  const parts = groups.map((g) => groupLabel(g.n, g.line))
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/** "Heads +7", "Heads −7", "Heads 0". */
export const headsText = (n: number): string =>
  `Heads ${n > 0 ? `+${n}` : n < 0 ? `${MINUS}${Math.abs(n)}` : '0'}`

/** "In FY27 this saves 0.35 standard heads (start dates)." */
export function inYearText(year: FiscalYear, inYearBp: number): string {
  const shown = standardHeads(Math.abs(inYearBp))
  if (!/[1-9]/.test(shown)) return `In ${year} this neither saves nor costs standard heads (start dates).`
  return `In ${year} this ${inYearBp < 0 ? 'saves' : 'costs'} ${shown} standard heads (start dates).`
}

const sumBp = (lines: readonly TradeLine[]): number => lines.reduce((n, l) => n + (l.weightBp ?? 0), 0)

/** What the card reads besides the quote. */
export interface QuoteCardInput {
  /** The fiscal year of the get seats' start (the in-year sentence). */
  year: FiscalYear
  /** Trade credit the ask uses, in basis points. */
  creditUsedBp: number
  /** `cost:band` shows (every mode but Manager). */
  bandShown: boolean
  /** The given seats that are On hold (not approved heads). */
  onHoldGiven: number
  /** The give seats whose open req is at Interviewing (`interviewingOf`). */
  interviewing?: readonly { positionId: string; reqId: string }[]
  /** Whether the viewer sees a request in full (a pending request's ID shows only then); every ID when not given. */
  requestShown?: (requestId: string) => boolean
}

/** A pending-request block's text without the ID of a request the viewer cannot see. */
export const OTHER_PENDING_TEXT = 'This seat is already in another pending request.'

/** The request a pending-request block names (trade.ts: "This seat is already in pending request R-1040."). */
const PENDING_ID = /pending request (\S+?)\.?$/

/** A block's text as the viewer reads it (see the module comment). */
export function blockText(
  b: { code: string; text: string },
  requestShown?: (requestId: string) => boolean,
): string {
  if (b.code !== 'pending-request' || !requestShown) return b.text
  const id = PENDING_ID.exec(b.text)?.[1]
  return id && requestShown(id) ? b.text : OTHER_PENDING_TEXT
}

/** The give seats whose open req is at Interviewing, from the loaded reqs (one per seat, the latest). */
export function interviewingOf(
  ctx: Pick<AnalyticsContext, 'all'>,
  give: readonly string[],
): { positionId: string; reqId: string }[] {
  const seats = new Set(give)
  const out = new Map<string, { positionId: string; reqId: string; opened: string }>()
  for (const r of ctx.all.reqs) {
    if (!r.positionId || !seats.has(r.positionId) || r.status !== 'Open' || r.stage !== 'Interviewing')
      continue
    const cur = out.get(r.positionId)
    if (!cur || r.openedDate > cur.opened)
      out.set(r.positionId, { positionId: r.positionId, reqId: r.reqId, opened: r.openedDate })
  }
  return give.flatMap((id) => {
    const hit = out.get(id)
    return hit ? [{ positionId: hit.positionId, reqId: hit.reqId }] : []
  })
}

/**
 * A quote's notes besides its blocks, in the card's words and order (11.2, 11.4): "Rates can change
 * until FY28 locks." for a quote with get seats priced on a Working version's rates, then each give
 * seat whose open req is at Interviewing, from the quote's warnings and `interviewing`, once each.
 * The request card and What if's trade lever both read these (M3 known gap 6).
 */
export function quoteNotes(
  q: TradeQuote,
  year: FiscalYear,
  interviewing: readonly { positionId: string; reqId: string }[] = [],
): string[] {
  const out: string[] = []
  if (q.get.length) {
    // The engine's note when the quote carries one; a quote made before it derives the same sentence.
    const rates =
      q.ratesNote !== undefined
        ? q.ratesNote
        : q.rates.lockHash == null && q.rates.version
          ? ratesChangeText(year)
          : null
    if (rates) out.push(rates)
  }
  const named = new Set<string>()
  for (const w of [...(q.warnings ?? []), ...interviewing]) {
    if (named.has(w.positionId)) continue
    named.add(w.positionId)
    out.push(interviewingText(w.reqId, w.positionId))
  }
  return out
}

/** The card for a quote (see the module comment). */
export function quoteCard(q: TradeQuote, input: QuoteCardInput): TradeQuoteCard {
  const lines: string[] = []
  const giveSeatBp = sumBp(q.give)
  if (q.give.length || input.creditUsedBp > 0) {
    const seats = q.give.length ? `${seatGroups(q.give)} (${standardHeads(giveSeatBp)})` : ''
    const credit =
      input.creditUsedBp > 0 ? `${standardHeads(input.creditUsedBp)} standard heads of trade credit` : ''
    lines.push(`Give ${[seats, credit].filter(Boolean).join(' and ')}.`)
  }
  if (q.get.length) {
    lines.push(`Get ${seatGroups(q.get)} (${standardHeads(q.getBp)}).`)
    lines.push(
      q.creditBp > 0
        ? `Credit ${standardHeads(q.creditBp)} standard heads.`
        : 'No trade credit is left over.',
    )
    lines.push(`${headsText(q.headsDelta)}.`)
    lines.push(inYearText(input.year, q.inYearBp))
    if (input.onHoldGiven === 1) lines.push('The On hold seat you give was not counted in your heads.')
    else if (input.onHoldGiven > 1) lines.push('The On hold seats you give were not counted in your heads.')
  }
  lines.push(...quoteNotes(q, input.year, input.interviewing))
  const giveUsd = q.give.reduce((n, l) => n + (l.bandUsd ?? 0), 0)
  return {
    ok: q.ok,
    lines,
    blocks: q.blocks.map((b) => {
      const text = blockText(b, input.requestShown)
      return b.positionId ? { positionId: b.positionId, text } : { text }
    }),
    maxSeats: q.maxSeats,
    ratio: q.ratio,
    giveBp: q.giveBp,
    getBp: q.getBp,
    creditBp: q.creditBp,
    headsDelta: q.headsDelta,
    // Left out as a key where band estimates are hidden (Manager mode, 7.6).
    ...(input.bandShown ? { bandUsd: { give: giveUsd, get: q.getBandUsd } } : {}),
  }
}

/** "You can get 8 (8.49)": the most whole seats, and the rate to 2 decimals. */
export const canGetText = (card: Pick<TradeQuoteCard, 'maxSeats' | 'ratio'>): string =>
  `You can get ${card.maxSeats} (${card.ratio.toFixed(2)})`

/** "Use trade credit (0.11)". */
export const creditText = (bp: number): string => `Use trade credit (${(bp / SH_BP).toFixed(2)})`
