/**
 * The What if view's model (docs/PLAN.md 9.1, 9.4, 10.6, 11.5, C29; M3 freeze). Its one tab, Levers,
 * shows the lever list beside a result strip of exactly three KPIs (`whatif.delta.heads`,
 * `whatif.delta.cost`, `whatif.delta.gap`) plus one `requests.trade.ratio` for each trade lever, each
 * with a `calc` under the difference rule (7.2 rule 5: the cost change is a band figure while only
 * band-estimate amounts differ, and a guarded difference once an HRIS or offer amount differs); no
 * Readout. Results are Working with the levers against Working without them, never against the
 * comparison (plan/engine/whatif.ts `whatIf`).
 *
 * The levers are unsaved and live in session memory (./session.ts), so they are the model's input:
 * `whatifModel(ctx, levers)` is one model per context and levers array (cached), and the folder
 * tab's headline reads the session's levers when none are given. What the levers may act on: Planned
 * seats and Open seats with no accepted offer in scope (an accepted offer is never offered as a lever
 * target: ACCEPTED_OFFER_TEXT), requests and freezes; the trade lever's pickers are Requests > New's
 * (the same tradable list).
 *
 * Readings taken here (whatif builder, M3):
 *  - A What if is for the Acting as person's scope, never narrowed by the filters: the HRBP's unit,
 *    the leader's org (their seats and every seat below), the whole company in Finance and HR admin.
 *    The session keys levers by the same scope (`viewScopeKey`), so the results and the levers
 *    always belong to one view.
 *  - The year is the shown version's fiscal year (the as-of date's with none), always that year's
 *    Working, as Targets reads asks. Heads are counted at the scope's target date: the unit's target
 *    for an HRBP, the leader's own org's target (Targets' `ownTargetOf`), the year's end for the
 *    company, whose target is the sum of the year's unit targets. No target: the gap change reads
 *    "—" with the reason (the engine's 0 is not shown as a gap that holds).
 *  - Pending requests count as Targets counts them: only those the Acting as person may see
 *    (8.4 rule 6), by their head effect and band effect on each side.
 *  - The cost change in a rounded mode (HRBP, Leader) shows only as a band figure: once an HRIS or
 *    offer amount differs it reads "—" (a difference of two rounded totals would need the atoms'
 *    full totals, which no lever moves), "Shows in Finance mode." when it has 5 or more contributors.
 *    The levers never touch a Filled seat or an accepted offer, so on any data the app makes it is a
 *    band figure.
 *  - With no lever the results read 0 (nothing differs, so nothing is revealed), and the engine is
 *    not run.
 *  - "Turn into requests" is previewed by running the write path's own action on the plan state
 *    without saving (src/plan/actions/whatif.ts `turnLeversIntoRequests`, pure): the draft count and
 *    any refusal are exactly what the button would give; the notes for skipped levers are the
 *    engine's (FREEZE_LEVER_NOTE for a freeze lever).
 *  - Manager mode (`view:whatif` hidden) and a mode with no Acting as pick get an empty model with the
 *    reason: no KPI, lever, seat, quote or picker.
 *  - M4 (M3 known gap 6): a trade lever's row carries its quote's notes in the request card's words
 *    (`tradeNote`, src/views/requests/engine/quoteCard.ts `quoteNotes`): "Rates can change until FY28
 *    locks." on Working rates and each give seat whose open req is at Interviewing. The quote is the
 *    write path's (`tradeQuoteOf`), which reads the seats' open reqs and names a pending request only
 *    to a viewer who sees it in full (PV-9).
 *
 * Frozen in the M2 freeze as a placeholder; extended in the M3 freeze (docs/CONTRACTS-M3.md). The
 * whatif builder filled the bodies and added fields, never renaming or retyping these.
 */
import { actionContextOf, actionEnvOf } from '@/app/write/context'
import type { Kpi } from '@/components/types'
import { differenceNote, type GuardedDifference, guardedDifference } from '@/cost/differences'
import { SHOWS_IN_FINANCE_NOTE } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf } from '@/data/fiscal'
import type { ISODate, Level } from '@/data/schema'
import { scopeInSentence } from '@/data/scope'
import { fmt, fmtDelta, plural } from '@/lib/format'
import { heldSeatRefusal } from '@/plan/actions/shared'
import { turnLeversIntoRequests } from '@/plan/actions/whatif'
import { asks, targetKindOf } from '@/plan/engine/targets'
import type { TradeQuote } from '@/plan/engine/trade'
import {
  type Lever,
  leverSeatsOfYear,
  readingDateOf,
  turnIntoRequests,
  type WhatIfResult,
  whatIf,
} from '@/plan/engine/whatif'
import type { OrgMatch } from '@/plan/types'
import { viewScopeKey } from '@/views/data/engine/sharedFile'
import { quoteNotes } from '@/views/requests/engine/quoteCard'
import { ID as REQUESTS_ID } from '@/views/requests/metrics'
import { ownTargetOf, type Prep, prepare, seatLabel, targetLabel } from '@/views/targets/engine/base'
import { dateOfTarget, fieldOrg, leaderOrg, yearEnd } from '@/views/targets/engine/working'
import type { FigureData, Headline, TabModel } from '../../types'
import { ID } from '../metrics'
import { type CardFrame, costCard, gapCard, headsCard, type LeverPart, tradeCard } from './cards'
import { WHATIF_FIGURES } from './figures'
import { pickersOf, type WhatIfPickers } from './pickers'
import { leversFor, NO_LEVERS } from './session'
import { BECOMES, leverLabel, tradeRateNote } from './words'

export type { Lever } from '@/plan/engine/whatif'
export type { CreditRow, OrgOption, TradeGiveRow, WhatIfPickers } from './pickers'
export { LEVER_KIND_LABEL, LEVER_KINDS } from './words'

/** One lever in the list, as words (no amount: a lever's cost shows in the result strip only). */
export interface LeverRow {
  /** Its index in the session's levers. */
  index: number
  kind: Lever['kind']
  /** "Defer P-2201's start to 1 Feb 2027", "Freeze Platform Engineering from 1 Nov 2026". */
  label: string
  /** Why the lever does not apply (whatif.ts `refused`), or null. */
  refused: string | null
  /** Added by the builder: its number in the list (index + 1). */
  n: number
  /** Added by the builder: what "Turn into requests" makes of it ("Start date", "Elimination", ...). */
  becomes: string
  /**
   * Added in M4 (M3 known gap 6): a trade lever's notes besides its blocks, the request card's
   * sentences joined with a space ("Rates can change until FY28 locks.", "REQ-4185 on P-2554 is
   * interviewing. ..."); null for any other lever and for a trade with none.
   */
  tradeNote: string | null
}

/** A seat a lever may act on (Planned, or Open with no accepted offer), in scope. */
export interface LeverSeatRow {
  positionId: string
  title: string | null
  level: Level
  location: string
  status: 'Planned' | 'Open'
  startDate: ISODate | null
  managerPositionId: string | null
}

/** A trade lever's quote, by its lever index. */
export interface LeverTrade {
  lever: number
  quote: TradeQuote
}

/** What the person may do here, and why not. */
export interface WhatIfCan {
  /** Add and change levers (`action:whatif.use`). */
  use: boolean
  useWhy: string | null
  /** "Turn into requests" shows (`action:whatif.turn-into-requests`). */
  turnInto: boolean
  turnIntoWhy: string | null
}

/** Who and what the What if is for. */
export interface WhatIfScope {
  /** "Silicon Engineering", the leader's org, or the company. */
  label: string
  fiscalYear: string
  /** Heads are counted on this date (the target's date, else the year's end). */
  targetDate: ISODate
  /** "Silicon Engineering" (the target row), or null with no target. */
  targetLabel: string | null
  /** The session key the levers are kept under (`viewScopeKey`). */
  key: string | null
  /**
   * The scope as the tab's opening line reads it: "What if for the whole company, FY27 Working"
   * (src/data/scope.ts `scopeInSentence`, M3 review UI-14), or "What if for Silicon Engineering, ...".
   */
  sentence: string
}

/** "What if for the whole company, FY27 Working": a scope label inside a sentence (UI-14). */
export const whatIfSentence = (label: string, fiscalYear: string): string =>
  `What if for ${scopeInSentence(label)}${fiscalYear ? `, ${fiscalYear} Working` : ''}`

/** What if > Levers: the result strip (three KPIs plus one trade rate per trade lever) and the levers. */
export interface WhatIfLevers extends TabModel {
  levers: FigureData<LeverRow>
  /** The seats a lever may name (the defer, cancel, shift, level and location pickers). */
  seats: FigureData<LeverSeatRow>
  trades: readonly LeverTrade[]
  /** "Turn into requests": how many drafts it would make and the notes for levers it skips; null where the mode hides it (Finance). */
  turnInto: {
    drafts: number
    skipped: readonly string[]
    /** Added by the builder: why the button would refuse (the action's own sentence), else null. */
    refused?: string | null
  } | null
  /** Added by the builder: why the view shows nothing (Manager mode, no Acting as pick), else null. */
  hidden: string | null
  /** Added by the builder: what the person may do. */
  can: WhatIfCan
  /** Added by the builder: who and what the What if is for. */
  scope: WhatIfScope
  /** Added by the builder: what the lever pickers offer (empty where the view is hidden). */
  pickers: WhatIfPickers
}

export interface WhatIfModel {
  levers: WhatIfLevers
}

/* ───────────── the scope ───────────── */

interface ScopeFacts {
  label: string
  org: OrgMatch
  inScope: (positionId: string) => boolean
  target: { heads: number; cost: number | null; label: string } | null
  targetDate: ISODate
}

/** The org the What if is for (see the module comment). */
function scopeOf(p: Prep): ScopeFacts {
  const ctx = p.ctx
  const scope = ctx.access.scope
  const fyEnd = yearEnd(p.fiscalYear)
  const positions = ctx.all.positions
  if (scope?.kind === 'unit') {
    const org = fieldOrg(positions, 'unit', scope.unit, null)
    const t = p.targets.find((x) => targetKindOf(x) === 'unit' && x.businessUnit === scope.unit) ?? null
    return {
      label: scope.unit,
      org: org.match,
      inScope: (id) => org.positionIds.has(id) || scope.positionIds.has(id),
      target: t ? { heads: t.targetHeads, cost: t.targetCost ?? null, label: targetLabel(p, t) } : null,
      targetDate: t ? dateOfTarget(t) : fyEnd,
    }
  }
  if (scope?.kind === 'tree') {
    const roots = [...scope.rootPositionIds].sort()
    const orgs = roots.map((r) => leaderOrg(positions, r))
    const t = roots.length === 1 ? ownTargetOf(p, roots[0]) : null
    return {
      label: ctx.scopeLabel,
      org: (place, on) => orgs.some((o) => o.match(place, on)),
      inScope: (id) => scope.positionIds.has(id) || orgs.some((o) => o.positionIds.has(id)),
      target: t ? { heads: t.targetHeads, cost: t.targetCost ?? null, label: targetLabel(p, t) } : null,
      targetDate: t ? dateOfTarget(t) : fyEnd,
    }
  }
  const units = p.targets.filter((x) => targetKindOf(x) === 'unit')
  const costs = units.map((x) => x.targetCost ?? null)
  return {
    label: ctx.scopeLabel,
    org: () => true,
    inScope: () => true,
    target: units.length
      ? {
          heads: units.reduce((n, x) => n + x.targetHeads, 0),
          cost: costs.every((c) => c != null) ? (costs as number[]).reduce((a, b) => a + b, 0) : null,
          label: `the ${plural(units.length, 'unit target')}`,
        }
      : null,
    targetDate: fyEnd,
  }
}

/* ───────────── the model ───────────── */

const NO_RESULT: WhatIfResult = {
  deltaHeads: 0,
  deltaCost: 0,
  deltaGap: 0,
  bandOnly: true,
  contributors: [],
  trades: [],
  refused: [],
}

const EMPTY_PICKERS: WhatIfPickers = {
  levels: [],
  locations: [],
  orgs: [],
  give: [],
  giveNote: null,
  credits: [],
  firstStart: '',
  fyStart: '',
  fyEnd: '',
}

const cache = new WeakMap<AnalyticsContext, WeakMap<readonly Lever[], WhatIfModel>>()

/** The What if view's model for a context and the session's levers (none: an empty What if). */
export function whatifModel(ctx: AnalyticsContext, levers: readonly Lever[] = NO_LEVERS): WhatIfModel {
  const list = levers.length ? levers : NO_LEVERS
  let byLevers = cache.get(ctx)
  if (!byLevers) {
    byLevers = new WeakMap()
    cache.set(ctx, byLevers)
  }
  const hit = byLevers.get(list)
  if (hit) return hit
  const model = { levers: leversTab(ctx, list) }
  byLevers.set(list, model)
  return model
}

/** The decision's sentence for a hidden or limited surface, else null. */
const howOf = (ctx: AnalyticsContext, surface: string): string | null => {
  const d = ctx.access.decide(surface)
  return d.access === 'shown' ? null : (d.how ?? null)
}

/** Why the view shows nothing in this context, else null. */
function hiddenWhy(ctx: AnalyticsContext): string | null {
  if (!ctx.access.can('view:whatif')) return howOf(ctx, 'view:whatif') ?? 'What if is not shown in this mode.'
  if (ctx.access.unset) return 'What if shows for the scope of the person you act as. Pick who you act as.'
  return null
}

const figure = <Row extends object>(
  id: string,
  metric: string,
  title: string,
  rows: readonly Row[],
  columns: FigureData<Row>['columns'],
  empty: string | null,
  uses: FigureData<Row>['uses'],
  extra: Partial<FigureData<Row>> = {},
): FigureData<Row> => ({ id, metric, title, rows, columns, empty, uses, ...extra })

const LEVER_COLUMNS: FigureData<LeverRow>['columns'] = [
  { key: 'n', label: '#', format: 'int', width: 4 },
  { key: 'label', label: 'Lever', format: 'text' },
  { key: 'becomes', label: 'Turn into requests makes', format: 'text' },
  { key: 'refused', label: 'Note', format: 'text' },
  { key: 'tradeNote', label: 'Trade note', format: 'text' },
]

const SEAT_COLUMNS: FigureData<LeverSeatRow>['columns'] = [
  { key: 'positionId', label: 'Position', format: 'text' },
  { key: 'title', label: 'Title', format: 'text', freeText: true },
  { key: 'level', label: 'Level', format: 'text' },
  { key: 'location', label: 'Location', format: 'text' },
  { key: 'status', label: 'Status', format: 'text' },
  { key: 'startDate', label: 'Planned start', format: 'date' },
  { key: 'managerPositionId', label: 'Manager position', format: 'text' },
]

/** The hidden model: the reason, and nothing else. */
function hiddenTab(ctx: AnalyticsContext, why: string): WhatIfLevers {
  return {
    kpis: [],
    levers: figure(WHATIF_FIGURES.levers, ID.deltaHeads, 'Levers', [], LEVER_COLUMNS, why, []),
    seats: figure(WHATIF_FIGURES.seats, ID.deltaHeads, 'Seats a lever can change', [], SEAT_COLUMNS, why, []),
    trades: [],
    turnInto: null,
    hidden: why,
    can: { use: false, useWhy: why, turnInto: false, turnIntoWhy: why },
    scope: {
      label: ctx.scopeLabel,
      fiscalYear: '',
      targetDate: '',
      targetLabel: null,
      key: null,
      sentence: whatIfSentence(ctx.scopeLabel, ''),
    },
    pickers: EMPTY_PICKERS,
  }
}

/** A seat counts as costed (a Filled seat or an accepted offer) on the reading date or the as-of date. */
const costedOf =
  (p: Prep, on: ISODate) =>
  (id: string): boolean => {
    const s = p.actx.seatOn(id, on) ?? p.actx.seatOn(id, p.ctx.asOf)
    return !!s && (s.status === 'Filled' || s.acceptedOffer)
  }

/** The cost change under the guard (see the module comment). */
export function costDifference(p: Prep, r: WhatIfResult, on: ISODate): GuardedDifference {
  const ctx = p.ctx
  const mode = ctx.guard.mode
  const min = ctx.guard.rules.minContributors
  if (r.bandOnly)
    return guardedDifference(r.deltaCost, 0, min, { bandOnly: true, bandShown: p.bandShown, mode })
  const costed = new Set(r.contributors.filter(costedOf(p, on)))
  if (mode === 'rounded')
    return {
      value: null,
      contributors: costed.size,
      band: false,
      reason: costed.size < min ? differenceNote(min) : SHOWS_IN_FINANCE_NOTE,
    }
  return guardedDifference(r.deltaCost, costed, min, { mode })
}

/** A quote as the mode shows it: band amounts only where band estimates show (`cost:band`). */
function shownQuote(q: TradeQuote, bandShown: boolean): TradeQuote {
  if (bandShown) return q
  const strip = (l: TradeQuote['give'][number]) => ({ ...l, bandUsd: null })
  return {
    ...q,
    give: q.give.map(strip),
    get: q.get.map(strip),
    // Number fields the type requires; 0 here means "not shown", and no hidden mode reads them.
    getBandUsd: 0,
    rates: { ...q.rates, standardHeadUsd: 0 },
  }
}

function leversTab(ctx: AnalyticsContext, levers: readonly Lever[]): WhatIfLevers {
  const why = hiddenWhy(ctx)
  if (why) return hiddenTab(ctx, why)
  const p = prepare(ctx)
  const sc = scopeOf(p)
  const env = actionEnvOf(ctx)
  const fiscalYear = p.fiscalYear
  const readOn = readingDateOf(fiscalYear, p.actx)
  const input = (ls: readonly Lever[]) => ({
    levers: ls,
    org: sc.org,
    fiscalYear,
    targetDate: sc.targetDate,
    target: sc.target ? { heads: sc.target.heads, cost: sc.target.cost } : null,
    requests: p.pending,
    ctx: p.actx,
    quote: (ask: Parameters<typeof env.quote>[0]) => env.quote(ask),
  })
  const run = (ls: readonly Lever[]): WhatIfResult => (ls.length ? whatIf(input(ls)) : NO_RESULT)
  const r = run(levers)
  const orgLabel = (id: string) => seatLabel(p, id)
  const labels = levers.map((l) => leverLabel(l, orgLabel))
  const refusedOf = new Map<number, string[]>()
  for (const x of r.refused) refusedOf.set(x.lever, [...(refusedOf.get(x.lever) ?? []), x.text])
  /** The lever changes something: not refused, or a shift refused for only some of its seats. */
  const applies = (i: number): boolean => {
    const refused = refusedOf.get(i)
    if (!refused) return true
    const l = levers[i]
    return l.kind === 'shift' && refused.length < l.positionIds.length
  }
  const applied = levers.filter((_, i) => applies(i)).length

  const frame: CardFrame = {
    fiscalYear,
    scopeLabel: sc.label,
    targetDate: sc.targetDate,
    uses: p.uses,
  }
  const g = costDifference(p, r, readOn)
  /** Each lever's part of the cost change: the results up to it, less those before it. */
  const parts = (): LeverPart[] => {
    const out: LeverPart[] = []
    let before = 0
    levers.forEach((_, i) => {
      if (!applies(i)) return
      const upTo = run(levers.slice(0, i + 1)).deltaCost
      out.push({ label: labels[i], usd: upTo - before })
      before = upTo
    })
    return out
  }
  const noTarget = `There is no ${fiscalYear} target for ${sc.label}, so there is no gap to change.`
  const heads: Kpi = {
    id: 'whatif-delta-heads',
    metricId: ID.deltaHeads,
    label: 'Heads change',
    value: r.deltaHeads,
    format: 'int',
    note: `At ${fmt(sc.targetDate, 'date')}, ${plural(applied, 'lever')} applied`,
    definition: p.definition(ID.deltaHeads),
    formula: 'Heads with the levers − heads without them.',
    calc: () => {
      const before = asks(sc.org, sc.targetDate, p.pending, p.actx).heads
      return headsCard(frame, before, r.deltaHeads, applied, p.pending.length)
    },
    uses: p.uses(ID.deltaHeads),
  }
  const cost: Kpi = {
    id: 'whatif-delta-cost',
    metricId: ID.deltaCost,
    label: 'Cost change',
    value: g.value,
    format: 'money',
    ...(g.value == null
      ? { suppressed: true, suppressedNote: g.reason ?? differenceNote(ctx.guard.rules.minContributors) }
      : { note: g.band ? 'Band estimate, in-year from each change' : 'Cost with the levers − without them' }),
    definition: p.definition(ID.deltaCost),
    formula: 'Loaded cost with the levers − loaded cost without them, levers at band estimate.',
    calc: () => costCard(frame, g, parts),
    uses: p.uses(ID.deltaCost),
  }
  const gapValue = sc.target ? r.deltaGap : null
  const gap: Kpi = {
    id: 'whatif-delta-gap',
    metricId: ID.deltaGap,
    label: 'Gap change',
    value: gapValue,
    format: 'int',
    goodDirection: null,
    note: sc.target ? `Against ${sc.target.label}` : noTarget,
    definition: p.definition(ID.deltaGap),
    formula: 'Gap with the levers − gap without them.',
    calc: () =>
      gapCard(
        frame,
        sc.target ? { heads: sc.target.heads, label: sc.target.label } : null,
        r.deltaHeads,
        gapValue,
        noTarget,
      ),
    uses: p.uses(ID.deltaGap),
  }
  const trades: LeverTrade[] = r.trades.map((t) => ({
    lever: t.lever,
    quote: shownQuote(t.quote, p.bandShown),
  }))
  const tradeKpis: Kpi[] = trades.map((t) => {
    const lever = levers[t.lever]
    const ask = lever?.kind === 'trade' ? lever.ask : null
    const q = t.quote
    const one = ask ? q.get.find((l) => Math.abs(l.fte - ask.get.fte) < 1e-9) : undefined
    const wantBp = one?.weightBp ?? null
    const value = q.ok && wantBp != null && wantBp > 0 ? q.ratio : null
    return {
      id: `whatif-trade-ratio-${t.lever}`,
      metricId: REQUESTS_ID.tradeRatio,
      label: `Trade rate, lever ${t.lever + 1}`,
      value,
      format: 'num2',
      ...(value == null
        ? { suppressed: true, suppressedNote: q.blocks[0]?.text ?? 'This trade cannot be quoted.' }
        : {
            note: tradeRateNote(q),
          }),
      definition: p.definition(REQUESTS_ID.tradeRatio),
      formula: '(Σ weight of the seats given + credit used) ÷ weight of one wanted seat.',
      calc: () => tradeCard(frame, t.lever, labels[t.lever] ?? '', q, wantBp),
      uses: p.uses(REQUESTS_ID.tradeRatio),
    }
  })

  /* the lever list and the seats */
  const quoteOf = new Map(trades.map((t) => [t.lever, t.quote]))
  const tradeNoteOf = (l: Lever, i: number): string | null => {
    const q = quoteOf.get(i)
    if (l.kind !== 'trade' || !q) return null
    const notes = quoteNotes(q, fiscalYearOf(l.ask.get.start))
    return notes.length ? notes.join(' ') : null
  }
  const leverRows: LeverRow[] = levers.map((l, i) => ({
    index: i,
    n: i + 1,
    kind: l.kind,
    label: labels[i],
    refused: refusedOf.get(i)?.join(' ') ?? null,
    becomes: BECOMES[l.kind],
    tradeNote: tradeNoteOf(l, i),
  }))
  // A receiving seat an approved internal move holds reads Open until HRIS shows the move (R31): it is
  // nobody's to change, so What if does not offer it (review SC-6, core's `heldSeatRefusal`).
  const actx = ctx.plan ? actionContextOf(ctx, { readOnly: false, at: `${ctx.asOf}T00:00:00.000Z` }) : null
  const held = (id: string) => !!actx && heldSeatRefusal(actx, id) !== null
  const seatRows: LeverSeatRow[] = leverSeatsOfYear(fiscalYear, p.actx, sc.org)
    .filter((s) => !held(s.positionId))
    .map((s) => ({
      positionId: s.positionId,
      title: p.latest.get(s.positionId)?.title ?? null,
      level: s.seat.level,
      location: s.seat.location,
      status: s.status as LeverSeatRow['status'],
      startDate: s.start,
      managerPositionId: s.place.managerPositionId,
    }))

  /* what the person may do */
  const use = ctx.access.can('action:whatif.use')
  const turn = ctx.access.can('action:whatif.turn-into-requests')
  const can: WhatIfCan = {
    use,
    useWhy: use ? null : howOf(ctx, 'action:whatif.use'),
    turnInto: turn,
    turnIntoWhy: turn ? null : howOf(ctx, 'action:whatif.turn-into-requests'),
  }

  let pickers: WhatIfPickers | null = null
  const tab: WhatIfLevers = {
    kpis: [heads, cost, gap, ...tradeKpis],
    levers: figure(
      WHATIF_FIGURES.levers,
      ID.deltaHeads,
      'Levers',
      leverRows,
      LEVER_COLUMNS,
      leverRows.length ? null : 'No levers yet. Add one to see what it changes.',
      p.uses(ID.deltaHeads),
      {
        subtitle: `${sc.label}, ${fiscalYear} Working`,
        note: 'Levers stay in this browser tab until you clear them or reload. They are never saved.',
      },
    ),
    seats: figure(
      WHATIF_FIGURES.seats,
      ID.deltaHeads,
      'Seats a lever can change',
      seatRows,
      SEAT_COLUMNS,
      seatRows.length
        ? null
        : `${sc.label} has no Planned seat and no Open seat without an accepted offer in ${fiscalYear}.`,
      p.uses(ID.deltaHeads),
      {
        subtitle: `Planned seats and Open seats with no accepted offer, ${sc.label}`,
        note: 'Seats with an accepted offer are never offered: their start date and terms come from the recruiting system.',
      },
    ),
    trades,
    turnInto: turn ? turnPreview(ctx, levers, env) : null,
    hidden: null,
    can,
    get scope(): WhatIfScope {
      return {
        label: sc.label,
        fiscalYear,
        targetDate: sc.targetDate,
        targetLabel: sc.target?.label ?? null,
        key: scopeKeyOfView(ctx),
        sentence: whatIfSentence(sc.label, fiscalYear),
      }
    },
    get pickers(): WhatIfPickers {
      pickers ??= pickersOf({ p, org: sc.org, inScope: sc.inScope, env })
      return pickers
    },
  }
  return tab
}

/** What "Turn into requests" would do now (see the module comment). */
function turnPreview(
  ctx: AnalyticsContext,
  levers: readonly Lever[],
  env: ReturnType<typeof actionEnvOf>,
): NonNullable<WhatIfLevers['turnInto']> {
  if (!levers.length) return { drafts: 0, skipped: [], refused: null }
  const at = `${ctx.asOf}T00:00:00.000Z`
  const made = turnIntoRequests(levers, {
    requesterId: ctx.access.actingAs?.personId ?? '',
    at,
    newRequestId: (n) => env.ids.request(n),
    ctx: env.asks,
  })
  const skipped = made.skipped.map((s) => `Lever ${s.lever + 1}: ${s.text}`)
  if (!ctx.plan) return { drafts: made.drafts.length, skipped, refused: null }
  const res = turnLeversIntoRequests(ctx.plan, actionContextOf(ctx, { readOnly: false, at }), { levers })
  return res.ok
    ? { drafts: res.audit.length, skipped, refused: null }
    : { drafts: 0, skipped, refused: res.refused }
}

/* ───────────── the folder tab ───────────── */

const keyMemo = new WeakMap<AnalyticsContext, string | null>()

/** The view's session key, once per context. */
export function scopeKeyOfView(ctx: AnalyticsContext): string | null {
  if (keyMemo.has(ctx)) return keyMemo.get(ctx) ?? null
  const k = viewScopeKey(ctx)
  keyMemo.set(ctx, k)
  return k
}

/**
 * The folder tab's number: the heads change the levers make (`whatif.delta.heads`, 9.1), for the
 * given levers or the session's. Reading taken (whatif builder): with none given it reads the
 * session's levers for this view's scope (`leversFor(viewScopeKey(ctx))`), so the tab and the view
 * never disagree after a change of Acting as.
 */
export function whatifHeadline(ctx: AnalyticsContext, levers?: readonly Lever[]): Headline {
  const label = 'heads change from levers'
  const uses = ctx.metrics.usesOf(ID.deltaHeads)
  if (hiddenWhy(ctx)) return { value: '—', label, metricId: ID.deltaHeads, uses }
  const list = levers ?? leversFor(scopeKeyOfView(ctx))
  if (!list.length) return { value: fmtDelta(0, 'int'), label, metricId: ID.deltaHeads, uses }
  const k = whatifModel(ctx, list).levers.kpis.find((x) => x.metricId === ID.deltaHeads)
  return { value: fmtDelta(k?.value ?? null, 'int'), label, metricId: ID.deltaHeads, uses }
}
