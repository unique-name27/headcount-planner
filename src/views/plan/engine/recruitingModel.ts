/**
 * Plan > Recruiting summary's model (docs/PLAN.md 9.8, change C38), built by `planRecruitingModel`
 * (./recruitingTab.ts) from Plan > Hiring's reading of the context (./hiringModel.ts `hiringBuiltOf`):
 * the seven numbers, heads and hiring by month, by quarter ahead, and where hiring happened. Heads
 * only, in every mode.
 *
 * Every count Plan > Hiring also shows is counted the same way and opens the same records: approved
 * heads A(FY end), current heads H, open to hire O(FY end), future starts S (signed offers), moves in
 * M, projected attrition E (known and modeled exits) and the 3-month hire pace. The approved heads and
 * current heads tiles open a calculation card of this tab's that lists Plan > Hiring's records for
 * that cell (current heads uses Plan > Hiring's own card in Manager mode when someone is not in plan).
 * Projected starts, projected heads and the gap to approved heads are this tab's own. Projected
 * starts are the same forecast's starts on Open and Planned seats with no signed offer, each at its
 * fill rate, plus its modeled backfills (./hiringData.ts `projectedStartsOf`), over the months E reads
 * (month-ends after the as-of date, up to the day), so projected heads at a quarter end are
 * H + S(q) + M(q) + projected starts − E(q) with every term the quarter table's.
 *
 * Readings taken here (the recruiting summary build, 27 Oct 2026):
 *  - Projected heads add the moves in (C37) as well as the future starts: the summary's line is what
 *    the heads will be, and a move in is a head the HRIS does not count yet. Its term shows only when
 *    a move in is due, as on Plan > Hiring.
 *  - The months ahead run from the first month-end after the as-of date to the fiscal year end, each
 *    month the difference of the projection at its end and at the month before's, so they add up to
 *    the quarter table and to the seven numbers exactly.
 *  - Approved heads, the chart's reference line, is A at the fiscal year end on every month.
 *  - Where hiring happened ranks Plan > Hiring's C37 sub-totals by hires (then by name) and opens the
 *    same hires; places beyond the top 5 are counted as "and n more".
 *  - A year that is over (its last quarter is history) shows no quarter ahead and no projection, as
 *    Plan > Hiring reads "FY27 is over"; the projected starts tile reads "—" and its card says so.
 *
 * Readings its build review took (27 Oct 2026, ./recruitingReview.test.ts):
 *  - An opening the forecast dates in a closed month (an Open seat past its time to fill starts on a
 *    month-end as-of date) is a projected start of the first month ahead, where the forecast counts
 *    its heads from; an opening on a seat an approved internal move takes is none, since the move is
 *    that seat's head (./hiringData.ts `projectedStartsOf`, `withoutTaken`).
 *  - By quarter ahead holds the quarters Plan > Hiring reads as ahead that end after the as-of date
 *    (with no close, the quarter ending on the as-of date has nothing ahead), so the months ahead add
 *    up to every row.
 *  - With no Working forecast there is no projection: projected starts, projected heads and the gap
 *    read "—", and projected attrition (Plan > Hiring's E, the known exits alone then) says so.
 *  - Open to hire's note names the moves in when a quarter ahead holds one, as its formula does.
 *  - Where hiring happened breaks a tie in hires by Plan > Hiring's own order ("No location" last).
 *
 * Readings its fix review took (27 Oct 2026, ./recruitingFixes.test.ts; review ids in brackets):
 *  - On a month-end as-of date before that month is closed, the as-of month has ended: an opening
 *    the forecast dates in it counts in the first month ahead [RN-1], and the chart shows the month
 *    as ended, with its HRIS hires and exits and its heads, not as a month ahead.
 *  - Projected heads take three more terms, each shown only when not 0, so they reach what the
 *    forecast counts: people in current heads whose last day is the as-of date are out from the first
 *    month ahead [RN-3]; a signed offer past its start date that the HRIS has not recorded is in from
 *    the first month ahead, named apart and never a future start [RN-2]; a pre-hire the HRIS holds
 *    on a seat with no signed offer is in from its hire date [RN-4]. Plan > Hiring's S, M, O and E
 *    stay as they are.
 *  - The month that holds a mid-month as-of date shows its actual hires and exits to the as-of date
 *    under its months-ahead parts, so its exits are Plan > Hiring's velocity exits of the month and
 *    its bars net to the line's step [RU-5].
 *  - The fiscal year end cards are titled by their day ("Projected starts by 31 Mar 2027"), and the
 *    flow tiles of a year that does not hold the as-of date name the span ("to FY28 end") [RN-5,
 *    RU-10]. The rate under projected attrition is Plan > Hiring's, over 12 closed months [RN-6].
 *  - Approved heads and current heads open calculation cards like the other five tiles [RS-1]; in a
 *    year that is over, projected starts and projected attrition read 0 with a card that says so,
 *    approved heads "—" with one too [RU-7].
 *  - Expected exits are "projected attrition" everywhere on the tab [RU-12, RS-5]; a gap that rounds
 *    to 0.0 reads "On approved heads" [RU-15]; a tie at the top-5 cut is named on the more line [RN-7].
 *
 * Readings its finish audit took (28 Oct 2026; ids in brackets):
 *  - The chart draws the rare terms as segments of the month they ride on, so every month ahead's
 *    drawn bars net to the line's step [AF-1]. A last day on a mid-month as-of date is one of that
 *    month's exits to date (Plan > Hiring's velocity counts every last day of the month), so that
 *    month's last days term leaves it out; the quarter table, which starts from current heads, keeps
 *    it.
 *  - Projected heads equal the run's heads at every month end from an as-of date on or after the last
 *    close. With the as-of date before it (31 Aug 2026, September closed) the summary's months ahead
 *    are the run's flows month by month, while the run's own heads sit below its flows from October:
 *    an open item of the forecast's, recorded in PLAN R134 [AF-2].
 *  - A pre-hire's seat still counts in open to hire, as a lagging offer's does under H24: Plan >
 *    Hiring's O(q) = A − H − S − M is unchanged, so A = H + O + S + M holds with that seat in O [AF-3].
 */
import { kpisInMode } from '@/access/numbers'
import type { Column, DeckNumber } from '@/charts/types'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { monthEnd, monthKey, shiftMonth } from '@/data/fiscal'
import type { ISODate, Month } from '@/data/schema'
import { type CalcSpec, calcInput, calcStep } from '@/drill/calc'
import { asOfLine, subtitleOf } from '@/drill/subtitle'
import { addDays, formatDate, formatMonthShort } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import {
  acceptedBy,
  type ExpectedExits,
  expectedExits,
  type HiringQuarter,
  movesBy,
  PACE_MONTHS,
} from '@/plan/engine/hiring'
import type { Position } from '@/plan/types'
import type { FigureData } from '../../types'
import { ID } from '../metrics'
import { monthLabel } from './base'
import { activeOn } from './core'
import { tagKpis } from './drillUses'
import { PLAN_FIGURES } from './figures'
import type { HiringPersonRow } from './hiringData'
import { eventRows, seatsDrill } from './hiringDrills'
import {
  type Built,
  card,
  cellOf,
  exitSeatsDrill,
  exitsCard,
  forecastMonthsTo,
  futureStartsCard,
  futureStartsOpens,
  headsSplitNote,
  hiringBuiltOf,
  knownInputs,
  monthRows,
  movesOpens,
  NOTHING,
  noSeatNote,
  type Opens,
  openCard,
  paceCard,
  peopleCount,
  plain,
  quarterEndLabel,
  quarterSpan,
  SOURCE,
  seatsOutOf,
  yearOverCard,
  yearOverText,
} from './hiringModel'
import { type HiringRecentRow, planHiringModel, QUARTER_KEYS, type QuarterKey } from './hiringTab'
import { FIGURE } from './lineage'
import {
  FUTURE_STARTS_NOTE,
  gapText,
  KNOWN_EXITS_ONLY_NOTE,
  NO_FORECAST_NOTE,
  type PlanRecruiting,
  PROJECTED_STARTS_NOTE,
  RECRUITING_KPIS,
  type RecruitingKpiId,
  type RecruitingMonthRow,
  type RecruitingQuarterRow,
  type RecruitingWhereRow,
  WHERE_TOP,
  type WhereTie,
} from './recruitingTab'

const PROJECTED_SOURCE =
  'The Working forecast’s starts on Open and Planned seats and its modeled backfills, in heads'
const PROJECTED_NOTE =
  'A model (6.7): each Open or Planned seat with no signed offer starts after its time to fill at its fill rate, and modeled exits reopen seats as backfills. A signed offer is never a projected start: it is a future start.'
const num1 = (v: number | null | undefined) => fmt(v, 'num1')

/* ───────────── projections ───────────── */

/** The forecast's projected starts from the as-of date to a day, over the months E reads. */
interface Projection {
  months: readonly Month[]
  openings: number
  backfills: number
  total: number
  /** By seat: its starts at their fill rate and its backfills. */
  seats: ReadonlyMap<string, number>
}

function projectedTo(b: Built, end: ISODate): Projection {
  const months = forecastMonthsTo(b, end)
  let openings = 0
  let backfills = 0
  const seats = new Map<string, number>()
  for (const m of months) {
    const p = b.h.projected?.get(m)
    if (!p) continue
    openings += p.openings
    backfills += p.backfills
    for (const [id, v] of p.seats) seats.set(id, (seats.get(id) ?? 0) + v)
  }
  return { months, openings, backfills, total: openings + backfills, seats }
}

/** People in current heads whose last day is the as-of date (review RN-3): in H, out of every later day. */
const leavingMemo = new WeakMap<Built, readonly HiringPersonRow[]>()
function leavingOnAsOf(b: Built): readonly HiringPersonRow[] {
  let hit = leavingMemo.get(b)
  if (!hit) {
    hit = [...b.h.current.values()]
      .filter((x) => x.row.terminationDate === b.ctx.asOf)
      .sort((x, y) => (x.personId < y.personId ? -1 : x.personId > y.personId ? 1 : 0))
    leavingMemo.set(b, hit)
  }
  return hit
}

/**
 * Signed offers whose start date is on or before the as-of date and that no HRIS row has started
 * (HRIS lag, review RN-2): in no future start (S counts starts after the as-of date, H24) and in no
 * projected start, while the forecast counts each as a head from its first projected month.
 */
function pastStartOf(b: Built): string[] {
  const out = new Set<string>()
  for (const o of b.h.input.offers) if (o.startDate <= b.ctx.asOf) out.add(o.reqId)
  return [...out].sort()
}

/**
 * Everything heads reach by a day: Plan > Hiring's S, M and E to it, the projected starts, and the
 * rare terms the forecast counts too (a last day on the as-of date, a signed offer past its start
 * date, a pre-hire), each 0 on the as-of date itself.
 */
interface HeadsAhead {
  end: ISODate
  current: number
  futureIds: readonly string[]
  moveIds: readonly string[]
  /** People in current heads whose last day is the as-of date (RN-3), once the day is after it. */
  leavingIds: readonly string[]
  /** Signed offers past their start date, not in the HRIS yet (RN-2), once the day is after the as-of date. */
  lateIds: readonly string[]
  /** Pre-hires in the HRIS starting by the day (RN-4). */
  preHireIds: readonly string[]
  projected: Projection
  exits: ExpectedExits
  /**
   * current − last days on the as-of date + future starts + late offers + pre-hires + moves in +
   * projected starts − projected attrition; null with no Working forecast.
   */
  heads: number | null
}

function headsAheadTo(b: Built, end: ISODate): HeadsAhead {
  const input = b.h.input
  const after = end > input.asOf
  const futureIds = acceptedBy(input.offers, input.asOf, end)
  const moveIds = movesBy(input.moves, input.asOf, end)
  const leavingIds = after ? leavingOnAsOf(b).map((x) => x.personId) : []
  const lateIds = after ? pastStartOf(b) : []
  const preHireIds = [...b.h.preHires.values()]
    .filter((x) => x.start <= end)
    .map((x) => x.id)
    .sort()
  const projected = projectedTo(b, end)
  const exits = expectedExits(input.exits, input.forecast, input.asOf, end)
  const current = b.r.table.heads.total
  const signed = futureIds.length + lateIds.length + preHireIds.length + moveIds.length
  return {
    end,
    current,
    futureIds,
    moveIds,
    leavingIds,
    lateIds,
    preHireIds,
    projected,
    exits,
    // No Working forecast, no projection: its starts and modeled exits are not known.
    heads: b.h.projected ? current - leavingIds.length + signed + projected.total - exits.total : null,
  }
}

/* ───────────── cards ───────────── */

function projectedCard(b: Built, end: ISODate, title: string, subtitle?: string): CalcSpec {
  const p = projectedTo(b, end)
  const span = p.months.length
    ? `${monthLabel(p.months[0])} to ${monthLabel(p.months[p.months.length - 1])}`
    : 'No open forecast month'
  const ids = [...p.seats.keys()].sort()
  const none = !b.h.projected
  return card(b, {
    title,
    ...(subtitle ? { subtitle } : {}),
    metricId: ID.recruitingProjectedStarts,
    value: none ? null : p.total,
    format: 'num1',
    inputs: [
      calcInput(
        `Starts on Open and Planned seats at their fill rate, ${span}`,
        none ? null : p.openings,
        'num2',
        PROJECTED_SOURCE,
      ),
      calcInput(`Modeled backfills, ${span}`, none ? null : p.backfills, 'num2', PROJECTED_SOURCE),
    ],
    steps: none
      ? [calcStep(NO_FORECAST_NOTE, 'No forecast to read', null, 'num1')]
      : [
          calcStep(
            'Projected starts = starts on Open and Planned seats + modeled backfills',
            `${plain(p.openings, 2)} + ${plain(p.backfills, 2)}`,
            p.total,
            'num1',
          ),
        ],
    rows: ids.length
      ? seatsDrill(b.h, title, ids, {
          weight: (pos: Position) => p.seats.get(pos.positionId) ?? 0,
          note: 'Each seat counts as its starts at their fill rate and its backfills in the months.',
          noun: ['seat', 'seats'],
          uses: b.uses(FIGURE.recruitingProjected),
        })
      : null,
    note: none ? `${NO_FORECAST_NOTE}: projected starts show once there is one.` : PROJECTED_NOTE,
    uses: b.uses(FIGURE.recruitingProjected),
  })
}

type FieldRefs = ReturnType<Built['uses']>

/**
 * A tile's card when the year shown is over (H23): nothing is left to come in it, so projected starts
 * and projected attrition read 0 (review RU-7), and approved heads "—" (no year end ahead to reach).
 */
function overCard(
  b: Built,
  spec: {
    title: string
    metricId: string
    value: 0 | null
    format: 'int' | 'num1'
    what: string
    uses: FieldRefs
  },
): CalcSpec {
  const fy = b.r.table.fiscalYear
  return card(b, {
    title: spec.title,
    metricId: spec.metricId,
    value: spec.value,
    format: spec.format,
    inputs: [calcInput(`Quarters of ${fy} still ahead`, 0, 'int', 'The calendar')],
    steps: [
      calcStep(
        `${yearOverText(fy)}: ${spec.what}`,
        spec.value == null ? 'Nothing left to reach' : 'Nothing left to come',
        spec.value,
        spec.format,
      ),
    ],
    note: `${yearOverText(fy)}. Pick a later fiscal year to see what is ahead.`,
    uses: spec.uses,
  })
}

/** Approved heads at the year end (R1 to A(FY end)), listing the seats (review RS-1). */
function approvedCard(b: Built, title: string): CalcSpec {
  const q = b.end
  const seats = b.h.input.seats.length
  const out = seatsOutOf(b, q)
  const day = formatDate(b.h.fyEnd)
  const rest = seats - out.ended - out.late - (q.approved ?? 0)
  const terms: { label: string; input: string; value: number }[] = [
    ...(out.ended
      ? [
          {
            label: 'seats an approved change ends',
            input: `Seats an approved change ends by ${day}`,
            value: out.ended,
          },
        ]
      : []),
    ...(out.late
      ? [
          {
            label: 'seats starting after the year end',
            input: `Seats whose signed offer or move in starts after ${day}`,
            value: out.late,
          },
        ]
      : []),
    ...(rest > 0
      ? [
          {
            label: 'seats with no head day by then',
            input: `Seats whose first head day is after ${day}`,
            value: rest,
          },
        ]
      : []),
  ]
  const drill = cellOf(b, 'approved', q).drill
  return card(b, {
    title,
    metricId: ID.hiringApprovedByQuarter,
    value: q.approved,
    format: 'int',
    inputs: [
      calcInput('Approved seats on the as-of date (R1)', seats, 'int', SOURCE.seats),
      ...terms.map((t) => calcInput(t.input, t.value, 'int', SOURCE.seats)),
    ],
    steps: [
      calcStep(
        `Approved heads = approved seats${terms.map((t) => ` − ${t.label}`).join('')}`,
        `${plain(seats)}${terms.map((t) => ` − ${plain(t.value)}`).join('')}`,
        q.approved,
        'int',
      ),
    ],
    rows: drill ? drill() : null,
    note: 'Approved seats whose first head day is on or before the year end and that are still approved heads then.',
    uses: b.uses(FIGURE.hiringSeats),
  })
}

/** Current heads with their split (9.7), listing the people or their seats as the mode allows (review RS-1). */
function currentCard(b: Built, opens: Opens): CalcSpec {
  // Manager mode with someone not in plan: Plan > Hiring's own card, which counts them in words.
  if (!opens.drill && opens.calc) return opens.calc()
  const H = b.r.table.heads
  const parts: [string, string, number][] = [
    ['People in approved seats', 'in approved seats', H.inApprovedSeats],
    ['People not in plan (they count against approved heads)', 'not in plan', H.notInPlan],
  ]
  if (H.elsewhere)
    parts.push([
      'People in seats that are not approved heads',
      'in seats that are not approved heads',
      H.elsewhere,
    ])
  return card(b, {
    title: 'Current heads',
    metricId: ID.hiringCurrentHeads,
    value: H.total,
    format: 'int',
    inputs: parts.map(([label, , v]) => calcInput(label, v, 'int', SOURCE.people)),
    steps: [
      calcStep(
        `Current heads = people ${parts.map(([, w]) => w).join(' + ')}`,
        parts.map(([, , v]) => plain(v)).join(' + '),
        H.total,
        'int',
      ),
    ],
    rows: opens.drill ? opens.drill() : null,
    note: headsSplitNote(b),
    uses: b.uses(FIGURE.hiringHeads),
  })
}

/** One term of projected heads after current heads: its sign, its words in the step, its value and decimals. */
interface HeadsTerm {
  sign: '+' | '−'
  words: string
  value: number
  digits: number
}

/** Projected heads' terms after current heads, the rare ones only when not 0. */
function headsTerms(x: HeadsAhead): HeadsTerm[] {
  const t = (sign: HeadsTerm['sign'], words: string, value: number, digits = 0): HeadsTerm => ({
    sign,
    words,
    value,
    digits,
  })
  return [
    ...(x.leavingIds.length ? [t('−', 'last days on the as-of date', x.leavingIds.length)] : []),
    t('+', 'future starts', x.futureIds.length),
    ...(x.lateIds.length ? [t('+', 'signed offers past their start date', x.lateIds.length)] : []),
    ...(x.preHireIds.length ? [t('+', 'pre-hires', x.preHireIds.length)] : []),
    ...(x.moveIds.length ? [t('+', 'moves in', x.moveIds.length)] : []),
    t('+', 'projected starts', x.projected.total, 2),
    t('−', 'projected attrition', x.exits.total, 2),
  ]
}

/** "Current heads + future starts (+ moves in) + projected starts − projected attrition", with the rare terms when not 0. */
function headsCard(b: Built, x: HeadsAhead, title: string, subtitle?: string): CalcSpec {
  const model = x.heads != null
  const opt = (n: number, label: string, source: string) => (n ? [calcInput(label, n, 'int', source)] : [])
  const terms = headsTerms(x)
  return card(b, {
    title,
    ...(subtitle ? { subtitle } : {}),
    metricId: ID.recruitingProjectedHeads,
    value: x.heads,
    format: 'num1',
    inputs: [
      calcInput('Current heads', x.current, 'int', SOURCE.people),
      ...opt(x.leavingIds.length, `Of them, last day on ${b.asOfLabel} (not counted after it)`, SOURCE.hris),
      calcInput('Future starts by then (signed offers)', x.futureIds.length, 'int', SOURCE.offers),
      ...opt(x.lateIds.length, 'Signed offers past their start date, not in the HRIS yet', SOURCE.offers),
      ...opt(x.preHireIds.length, 'Pre-hires in the HRIS by then (no signed offer on the seat)', SOURCE.hris),
      ...opt(x.moveIds.length, 'Moves in by then', SOURCE.moves),
      calcInput(
        'Projected starts by then (model)',
        model ? x.projected.total : null,
        'num2',
        PROJECTED_SOURCE,
      ),
      calcInput(
        model
          ? 'Projected attrition by then (known and modeled exits)'
          : 'Projected attrition by then (known exits only)',
        x.exits.total,
        'num2',
        SOURCE.forecast,
      ),
    ],
    steps: model
      ? [
          calcStep(
            `Projected heads = current heads${terms.map((t) => ` ${t.sign} ${t.words}`).join('')}`,
            `${plain(x.current)}${terms.map((t) => ` ${t.sign} ${plain(t.value, t.digits)}`).join('')}`,
            x.heads,
            'num1',
          ),
        ]
      : [calcStep(NO_FORECAST_NOTE, 'No forecast to read', null, 'num1')],
    note: model
      ? 'Projected starts and modeled exits are a model, so projected heads carry decimals; future starts and moves in are whole people.'
      : `${NO_FORECAST_NOTE}: projected heads show once there is one, since its projected starts and modeled exits are part of them.`,
    uses: b.uses(FIGURE.recruitingHeads),
  })
}

function gapCard(b: Built, q: HiringQuarter, x: HeadsAhead): CalcSpec {
  const gap = q.approved == null || x.heads == null ? null : x.heads - q.approved
  const words = gap == null ? null : gapText(gap)
  return card(b, {
    title: `Gap to approved heads at ${quarterEndLabel(q)}`,
    metricId: ID.recruitingGap,
    value: gap,
    format: 'num1',
    inputs: [
      calcInput('Projected heads at the quarter end', x.heads, 'num2', SOURCE.forecast),
      calcInput('Approved heads by the quarter end', q.approved, 'int', SOURCE.seats),
    ],
    steps:
      x.heads == null
        ? [calcStep(NO_FORECAST_NOTE, 'No projected heads to compare', null, 'num1')]
        : [
            calcStep(
              'Gap = projected heads − approved heads',
              `${plain(x.heads, 2)} − ${plain(q.approved)}`,
              gap,
              'num1',
            ),
          ],
    ...(words ? { note: `${words}. Below 0 is short of approved heads; above 0 is over.` } : {}),
    uses: b.uses(FIGURE.recruitingQuarters),
  })
}

/** A month ahead's projected attrition: known last days after the as-of date in the month, and its modeled exits. */
function monthExitsCard(b: Built, m: Month, value: number, subtitle: string): CalcSpec {
  const first = `${m}-01` as ISODate
  const from = b.ctx.asOf >= first ? addDays(b.ctx.asOf, 1) : first
  const known = eventRows(b.h.exits, b.h.input.exits, from, monthEnd(m))
  const f = b.h.input.forecast.find((x) => x.month === m)
  const noSeat = noSeatNote(known)
  return card(b, {
    title: `Projected attrition, ${monthLabel(m)}`,
    subtitle,
    metricId: ID.hiringExpectedExits,
    value,
    format: 'num1',
    inputs: [
      calcInput('Known exits', known.length, 'int', SOURCE.hris),
      ...knownInputs(known),
      calcInput('Modeled exits', f?.modeledExits ?? null, 'num2', SOURCE.forecast),
    ],
    steps: [
      calcStep(
        'Projected attrition = known exits + modeled exits',
        `${plain(known.length)} + ${plain(f?.modeledExits, 2)}`,
        value,
        'num1',
      ),
    ],
    rows: exitSeatsDrill(b, `Projected attrition, ${monthLabel(m)}`, known, f ? [m] : []),
    ...(noSeat ? { note: noSeat } : {}),
    uses: b.uses(FIGURE.hiringExits),
  })
}

/* ───────────── the seven numbers ───────────── */

const kpiDef = (id: RecruitingKpiId) => {
  const d = RECRUITING_KPIS.find((k) => k.id === id)
  if (!d) throw new Error(`No recruiting tile ${id}`)
  return d
}

/** "Q1 FY28, Apr to Jun" when the year shown does not hold the as-of date (review RU-10), else "Q3, Oct to Dec". */
const quarterRowLabel = (b: Built, q: HiringQuarter): string =>
  b.otherYear
    ? `${q.label} ${b.r.table.fiscalYear}, ${formatMonthShort(q.start)} to ${formatMonthShort(q.end)}`
    : quarterSpan(q)

function kpisOf(b: Built, fyEnd: HeadsAhead | null): Kpi[] {
  const t = b.r.table
  const v = b.r.velocity.paces
  const end = b.end
  const fy = t.fiscalYear
  const over = yearOverText(fy)
  const text = (id: string) => b.h.p.text(id)
  const goodOf = (id: string) => b.ctx.metrics.def(id)?.goodDirection ?? null
  const tile = (
    id: RecruitingKpiId,
    rest: Omit<Kpi, 'id' | 'metricId' | 'label' | 'tab' | 'definition' | 'goodDirection'> & {
      label?: string
    },
  ): Kpi => {
    const d = kpiDef(id)
    return {
      id: d.id,
      metricId: d.metricId,
      label: rest.label ?? d.label,
      tab: 'recruiting',
      definition: text(d.metricId),
      goodDirection: goodOf(d.metricId),
      ...rest,
    }
  }
  const fyEndLabel = formatDate(b.h.fyEnd)
  // The flow tiles of a year that does not hold the as-of date count from the as-of date (RU-10).
  const toEnd = (label: string) => (b.otherYear && !b.over ? `${label} to ${fy} end` : label)
  // Current heads open as in a quarter ahead (the as-of date's heads), also in a year that is over.
  const currentOpens = cellOf(b, 'current', { ...end, kind: 'ahead' })
  const [short, long] = PACE_MONTHS
  const last3 = b.pace.months.length ? b.pace.hires : null
  const tiles: Kpi[] = [
    tile('recruiting-approved', {
      label: `Approved heads, ${fy}`,
      value: b.over ? null : end.approved,
      format: 'int',
      note: b.over ? over : `By ${fyEndLabel}`,
      formula: b.over
        ? `${over}.`
        : `Approved seats whose first head day is by ${fyEndLabel} and that are still approved heads then.`,
      // A card in every year (review RS-1): the seats it counts, or why a year that is over has none.
      // No drill on the tile: the strip opens a tile's records before its card, and the card lists them.
      calc: () =>
        b.over
          ? overCard(b, {
              title: `Approved heads, ${fy}`,
              metricId: ID.hiringApprovedByQuarter,
              value: null,
              format: 'int',
              what: 'no year end is left to reach',
              uses: b.uses(FIGURE.hiringSeats),
            })
          : approvedCard(b, `Approved heads by ${fyEndLabel}`),
      calcWhenEmpty: true,
      uses: b.uses(FIGURE.hiringSeats),
    }),
    tile('recruiting-current', {
      value: t.heads.total,
      format: 'int',
      note: `On ${b.asOfLabel}`,
      formula: 'Employees in the HRIS on the as-of date, in scope, people not in plan included.',
      calc: () => currentCard(b, currentOpens),
      uses: b.uses(FIGURE.hiringHeads),
    }),
    tile('recruiting-open', {
      label: `Open to hire, ${fy}`,
      value: t.openFyEnd,
      format: 'int',
      note: b.over
        ? over
        : t.openFyEnd < 0
          ? `Over by ${Math.abs(t.openFyEnd)}`
          : t.movesToCome
            ? 'Approved − current − future starts − moves in'
            : 'Approved − current − future starts',
      formula: b.over
        ? `${over}: nothing is left to hire in it.`
        : `${plural(end.approved ?? 0, 'head')} approved by ${fyEndLabel} − ${plural(t.heads.total, 'head')} now − ${plural(t.acceptedToCome, 'future start')}${t.movesToCome ? ` − ${plural(t.movesToCome, 'move in', 'moves in')}` : ''} by then.`,
      calc: () =>
        b.over
          ? yearOverCard(b, ID.hiringOpen, `Open to hire, ${fy}`)
          : openCard(b, end, `Open to hire, ${fy}`),
      uses: b.uses(FIGURE.hiringOpen),
    }),
    tile('recruiting-future', {
      label: toEnd('Future starts'),
      value: t.acceptedToCome,
      format: 'int',
      note: b.over ? over : FUTURE_STARTS_NOTE,
      formula: b.over
        ? `${over}: no start is left to come in it.`
        : `Signed offers on approved seats starting after ${b.asOfLabel} and by ${fyEndLabel}.`,
      calc: () =>
        b.over
          ? yearOverCard(b, ID.hiringAcceptedStarts, 'Future starts')
          : futureStartsCard(b, end.acceptedIds, 'Future starts'),
      uses: b.uses(FIGURE.hiringAccepted),
    }),
    tile('recruiting-projected', {
      label: toEnd('Projected starts'),
      // A year that is over has no start left to come: 0, as its card says (RU-7).
      value: b.over ? 0 : !b.h.projected ? null : (fyEnd?.projected.total ?? 0),
      format: 'num1',
      note: b.over ? over : b.h.projected ? PROJECTED_STARTS_NOTE : NO_FORECAST_NOTE,
      formula: b.over
        ? `${over}: no start is left to come in it.`
        : `The forecast’s starts on Open and Planned seats with no signed offer, at their fill rate, plus modeled backfills, from ${b.asOfLabel} to ${fyEndLabel}. A model, never a signed offer.`,
      calc: () =>
        b.over
          ? overCard(b, {
              title: `Projected starts, ${fy}`,
              metricId: ID.recruitingProjectedStarts,
              value: 0,
              format: 'num1',
              what: 'no start is left to come in it',
              uses: b.uses(FIGURE.recruitingProjected),
            })
          : projectedCard(b, b.h.fyEnd, `Projected starts by ${fyEndLabel}`),
      calcWhenEmpty: true,
      uses: b.uses(FIGURE.recruitingProjected),
    }),
    tile('recruiting-attrition', {
      label: toEnd('Projected attrition'),
      value: b.over ? 0 : (end.expectedExits?.total ?? null),
      format: 'num1',
      note: b.over
        ? over
        : !b.h.flows
          ? KNOWN_EXITS_ONLY_NOTE
          : v.attrition == null
            ? 'Attrition (heads) needs 12 closed months'
            : // Plan > Hiring's own words: the trailing rate, not the projection's (review RN-6).
              `Attrition (heads) ${fmt(v.attrition, 'pct')} over 12 closed months`,
      formula: b.over
        ? `${over}.`
        : b.h.flows
          ? `Known exits and modeled exits from ${b.asOfLabel} to ${fyEndLabel}.`
          : `Known exits from ${b.asOfLabel} to ${fyEndLabel}.`,
      calc: () =>
        b.over
          ? overCard(b, {
              title: `Projected attrition, ${fy}`,
              metricId: ID.hiringExpectedExits,
              value: 0,
              format: 'num1',
              what: 'no exit is left to come in it',
              uses: b.uses(FIGURE.hiringExits),
            })
          : exitsCard(b, end, `Projected attrition by ${fyEndLabel}`),
      calcWhenEmpty: true,
      uses: b.uses(FIGURE.hiringExits),
    }),
    tile('recruiting-velocity', {
      label: 'Hiring velocity',
      value: v.hires3,
      format: 'num1',
      // What the value does not say already (review RU-9): the 3-month pace is in the formula.
      note:
        v.hires3 == null
          ? `The ${short}-month pace needs ${short} closed months`
          : `${v.hires6 == null ? `the ${long}-month pace needs ${long} closed months` : `${long}-month pace ${num1(v.hires6)}`}; ${plural(last3 ?? 0, 'hire')} in 3 months`.replace(
              /^t/,
              'T',
            ),
      formula:
        v.hires3 == null
          ? 'Hires a month over the last 3 closed months (the 3-month pace); it needs 3 closed months.'
          : `Hires a month over the last 3 closed months (the 3-month pace): ${b.pace.hires} ÷ 3.`,
      calc: () => paceCard(b, 'hires'),
      calcWhenEmpty: true,
      uses: b.uses(FIGURE.hiringHires),
    }),
  ]
  return tagKpis(kpisInMode(b.ctx.access, tiles))
}

/** The tiles as text: value, label and note, before the data standard's gates (the screen applies them). */
function deckNumbersOf(kpis: readonly Kpi[]): DeckNumber[] {
  return kpis.map((k) => ({
    label: k.label,
    value: k.value == null ? '—' : fmt(k.value, k.format),
    ...(k.note ? { note: k.note } : {}),
  }))
}

/* ───────────── heads and hiring by month ───────────── */

/** The months ahead: from the first month-end after the as-of date to the year end. */
function monthsAhead(b: Built): Month[] {
  if (b.over) return []
  const out: Month[] = []
  let m = monthKey(b.ctx.asOf)
  if (monthEnd(m) <= b.ctx.asOf) m = shiftMonth(m, 1)
  const last = monthKey(b.h.fyEnd)
  for (; m <= last; m = shiftMonth(m, 1)) out.push(m)
  return out
}

/**
 * The months after the last closed one that ended on or before the as-of date (a month-end as-of
 * date before its close, review RN-1): read from the HRIS, as Plan > Hiring reads a quarter that is
 * over but not closed (V8). None before the first close.
 */
function monthsEnded(b: Built, lastClosed: Month | null): Month[] {
  if (!lastClosed) return []
  const out: Month[] = []
  for (let m = shiftMonth(lastClosed, 1); monthEnd(m) <= b.ctx.asOf; m = shiftMonth(m, 1)) out.push(m)
  return out
}

/** The scope's heads at an ended month's end: current heads on the as-of date, else the employees active then. */
function endedHeads(b: Built, m: Month): HiringPersonRow[] {
  const end = monthEnd(m)
  if (end === b.ctx.asOf) return [...b.h.current.values()]
  const out: HiringPersonRow[] = []
  for (const [personId, e] of activeOn(b.h.p.scope, end))
    out.push({ personId, positionId: e.assignment.positionId ?? null, row: e.worker })
  return out
}

function monthsFigure(b: Built): FigureData<RecruitingMonthRow> {
  const actual = b.r.velocity.months.filter((m) => m.kind === 'actual')
  const headsAt = new Map(b.h.input.headsAt.map((h) => [h.month, h.heads]))
  const approved = b.over ? null : b.end.approved
  const ahead = monthsAhead(b)
  const ended = monthsEnded(b, actual.at(-1)?.month ?? null)
  const endedPeople = new Map(ended.map((m) => [m, endedHeads(b, m)]))
  const reach = new Map<Month, HeadsAhead>()
  for (const m of ahead) reach.set(m, headsAheadTo(b, monthEnd(m)))
  const start = headsAheadTo(b, b.ctx.asOf)
  const prevOf = (i: number) => (i === 0 ? start : (reach.get(ahead[i - 1]) as HeadsAhead))
  // The month that holds a mid-month as-of date: its actual hires and exits to the as-of date (RU-5).
  const partial = ahead[0] && monthKey(b.ctx.asOf) === ahead[0] ? ahead[0] : null
  const toDate = (which: 'hires' | 'exits', m: Month): HiringPersonRow[] =>
    eventRows(
      which === 'hires' ? b.h.hires : b.h.exits,
      which === 'hires' ? b.h.input.hires : b.h.input.exits,
      `${m}-01` as ISODate,
      b.ctx.asOf,
    )
  const asOfShort = formatDate(b.ctx.asOf).replace(/ \d{4}$/, '')
  const idsIn = (i: number, pick: (x: HeadsAhead) => readonly string[]) => {
    const before = new Set(pick(prevOf(i)))
    return pick(reach.get(ahead[i]) as HeadsAhead).filter((id) => !before.has(id))
  }
  // A last day on the as-of date is already one of that month's exits to date: its month counts it
  // there, not again as a last day, so its bars net to the line's step (finish audit AF-1).
  const exitedToDate = new Set(partial ? toDate('exits', partial).map((x) => x.personId) : [])
  const leavingIn = (i: number) => idsIn(i, (y) => y.leavingIds).filter((id) => !exitedToDate.has(id))
  const none = {
    futureStarts: null,
    movesIn: null,
    leaving: null,
    pastStart: null,
    preHires: null,
    projectedStarts: null,
    projectedExits: null,
    projectedHeads: null,
  }
  const rows: RecruitingMonthRow[] = [
    ...actual.map(
      (m): RecruitingMonthRow => ({
        month: m.month,
        label: monthLabel(m.month),
        kind: 'actual',
        kindText: 'Closed',
        hires: m.hires,
        exits: m.exits,
        heads: headsAt.get(m.month) ?? null,
        ...none,
        approved,
      }),
    ),
    ...ended.map(
      (m): RecruitingMonthRow => ({
        month: m,
        label: monthLabel(m),
        kind: 'ended',
        kindText: 'Ended, not closed',
        hires: monthRows(b, 'hires', m).length,
        exits: monthRows(b, 'exits', m).length,
        heads: endedPeople.get(m)?.length ?? null,
        ...none,
        approved,
      }),
    ),
    ...ahead.map((m, i): RecruitingMonthRow => {
      const x = reach.get(m) as HeadsAhead
      const p = prevOf(i)
      const isPartial = m === partial
      return {
        month: m,
        label: monthLabel(m),
        kind: 'ahead',
        kindText: isPartial ? `Actual to ${asOfShort}, then ahead` : 'Ahead',
        hires: isPartial ? toDate('hires', m).length : null,
        exits: isPartial ? toDate('exits', m).length : null,
        heads: null,
        futureStarts: x.futureIds.length - p.futureIds.length,
        movesIn: x.moveIds.length - p.moveIds.length,
        leaving: leavingIn(i).length,
        pastStart: x.lateIds.length - p.lateIds.length,
        preHires: x.preHireIds.length - p.preHireIds.length,
        projectedStarts: b.h.projected ? x.projected.total - p.projected.total : null,
        projectedExits: x.exits.total - p.exits.total,
        projectedHeads: x.heads,
        approved,
      }
    }),
  ]
  const anyOf = (key: keyof RecruitingMonthRow) => rows.some((r) => ((r[key] as number | null) ?? 0) !== 0)
  const byMonth = new Map(actual.map((m) => [m.month, m]))
  const sub = (r: RecruitingMonthRow) => subtitleOf(r.label, b.ctx.scopeLabel)
  const indexOf = (r: RecruitingMonthRow) => ahead.indexOf(r.month)
  const hiresOpens = (
    r: RecruitingMonthRow,
    people: HiringPersonRow[],
    value: number | null,
    title: string,
  ) =>
    peopleCount(b, {
      title,
      seatTitle: title.replace(/^Hires/, 'Seats filled by hires'),
      people,
      value,
      metricId: ID.hiringHiresByMonth,
      subtitle: sub(r),
      note: 'Employees hired into a seat in scope; internal moves and transfers are not hires.',
      uses: b.uses(FIGURE.hiringHires),
    })
  const exitsOpens = (
    r: RecruitingMonthRow,
    people: HiringPersonRow[],
    value: number | null,
    title: string,
  ) =>
    peopleCount(b, {
      title,
      seatTitle: title.replace(/^Exits/, 'Seats left by exits'),
      people,
      value,
      metricId: ID.hiringExitsByMonth,
      subtitle: sub(r),
      note: 'Employees whose last day falls in the month, from a seat in scope; a move is not an exit.',
      uses: b.uses(FIGURE.hiringLeavers),
    })
  const headsOpens = (r: RecruitingMonthRow, people: readonly HiringPersonRow[]) =>
    peopleCount(b, {
      title: `Heads at ${formatDate(monthEnd(r.month))}`,
      seatTitle: `Seats of the heads at ${formatDate(monthEnd(r.month))}`,
      people,
      value: r.heads,
      metricId: ID.hiringCurrentHeads,
      subtitle: asOfLine(monthEnd(r.month), b.ctx.scopeLabel),
      uses: b.uses(FIGURE.hiringHeads),
    })
  const opensOf = (r: RecruitingMonthRow, key: string): Opens => {
    if (r.kind === 'actual') {
      const m = byMonth.get(r.month)
      if (!m) return NOTHING
      if (key === 'hires') return hiresOpens(r, monthRows(b, 'hires', r.month), m.hires, `Hires, ${r.label}`)
      if (key === 'exits') return exitsOpens(r, monthRows(b, 'exits', r.month), m.exits, `Exits, ${r.label}`)
      if (key === 'heads' && r.heads != null) return headsOpens(r, b.h.headsAt.get(r.month) ?? [])
      return NOTHING
    }
    if (r.kind === 'ended') {
      if (key === 'hires') return hiresOpens(r, monthRows(b, 'hires', r.month), r.hires, `Hires, ${r.label}`)
      if (key === 'exits') return exitsOpens(r, monthRows(b, 'exits', r.month), r.exits, `Exits, ${r.label}`)
      if (key === 'heads') return headsOpens(r, endedPeople.get(r.month) ?? [])
      return NOTHING
    }
    const i = indexOf(r)
    if (i < 0) return NOTHING
    const x = reach.get(r.month) as HeadsAhead
    switch (key) {
      case 'hires':
        return r.month === partial
          ? hiresOpens(r, toDate('hires', r.month), r.hires, `Hires, ${r.label} to ${asOfShort}`)
          : NOTHING
      case 'exits':
        return r.month === partial
          ? exitsOpens(r, toDate('exits', r.month), r.exits, `Exits, ${r.label} to ${asOfShort}`)
          : NOTHING
      case 'futureStarts':
        return futureStartsOpens(
          b,
          idsIn(i, (y) => y.futureIds),
          `Future starts, ${r.label}`,
          sub(r),
        )
      case 'movesIn':
        return movesOpens(
          b,
          idsIn(i, (y) => y.moveIds),
          `Moves in, ${r.label}`,
        )
      case 'pastStart':
        return futureStartsOpens(
          b,
          idsIn(i, (y) => y.lateIds),
          `Signed offers past their start date, ${r.label}`,
          sub(r),
        )
      case 'preHires': {
        const ids = new Set(idsIn(i, (y) => y.preHireIds))
        const people = [...b.h.preHires.values()]
          .filter((p) => ids.has(p.id))
          .map((p) => ({ personId: p.personId, positionId: p.positionId, row: p.row }))
        return hiresOpens(r, people, r.preHires, `Hires, pre-hires in the HRIS, ${r.label}`)
      }
      case 'leaving': {
        const ids = new Set(leavingIn(i))
        const people = leavingOnAsOf(b).filter((p) => ids.has(p.personId))
        return exitsOpens(r, people, r.leaving, `Exits, last day on ${b.asOfLabel}`)
      }
      case 'projectedStarts':
        return {
          drill: null,
          calc: () => monthProjectedCard(b, r.month, sub(r)),
        }
      case 'projectedExits':
        return { drill: null, calc: () => monthExitsCard(b, r.month, r.projectedExits ?? 0, sub(r)) }
      case 'projectedHeads':
        return {
          drill: null,
          calc: () => headsCard(b, x, `Projected heads at ${formatDate(monthEnd(r.month))}`, sub(r)),
        }
      default:
        return NOTHING
    }
  }
  const col = (
    key: keyof RecruitingMonthRow & string,
    label: string,
    format: 'int' | 'num1',
  ): Column<RecruitingMonthRow> => ({
    key,
    label,
    format,
    align: 'right',
    drill: (r) => (r[key] == null ? null : opensOf(r, key).drill),
    calc: (r) => {
      if (r[key] == null) return null
      const o = opensOf(r, key)
      return o.drill ? null : o.calc
    },
  })
  const fy = b.r.table.fiscalYear
  const fyEndLabel = formatDate(b.h.fyEnd)
  const columns: Column<RecruitingMonthRow>[] = [
    { key: 'label', label: 'Month', sortValue: (r) => r.month },
    { key: 'kindText', label: 'Closed or ahead', format: 'text' },
    col('hires', 'Hires', 'int'),
    col('exits', 'Exits', 'int'),
    col('heads', 'Heads at month end', 'int'),
    col('futureStarts', 'Future starts (signed offers)', 'int'),
    ...(anyOf('movesIn') ? [col('movesIn', 'Moves in', 'int')] : []),
    ...(anyOf('pastStart') ? [col('pastStart', 'Signed offers past their start date', 'int')] : []),
    ...(anyOf('preHires') ? [col('preHires', 'Pre-hires in the HRIS', 'int')] : []),
    ...(anyOf('leaving') ? [col('leaving', `Last day on ${b.asOfLabel}`, 'int')] : []),
    col('projectedStarts', 'Projected starts (model)', 'num1'),
    col('projectedExits', 'Projected attrition', 'num1'),
    col('projectedHeads', 'Projected heads', 'num1'),
    // Dated: the line is the year end's approved heads on every month (review RU-3).
    { key: 'approved', label: `Approved heads by ${fyEndLabel}`, format: 'int', align: 'right' },
  ]
  const closedPart = actual.length
    ? `Hires, exits and heads in the last ${actual.length} closed months${ended.length ? ` and the ${plural(ended.length, 'month')} ended since` : ''}`
    : ''
  const aheadPart = `the future starts (signed offers) and projected starts (model), projected attrition and projected heads to the end of ${fy}, against approved heads by ${fyEndLabel}`
  return {
    id: PLAN_FIGURES.recruitingMonths,
    metric: ID.recruitingProjectedHeads,
    title: 'Heads and hiring by month',
    subtitle: b.over
      ? // A year that is over draws its closed months only (review RU-7).
        `${closedPart || 'No closed month'}. ${yearOverText(fy)}. Heads only.`
      : closedPart
        ? `${closedPart}, then ${aheadPart}. Heads only.`
        : `${aheadPart.replace(/^the/, 'The')}. Heads only.`,
    rows,
    columns,
    note: b.h.projected
      ? null
      : `${NO_FORECAST_NOTE}: projected starts and modeled exits show once there is one.`,
    empty: rows.length ? null : 'No closed month or month ahead to show.',
    uses: b.uses(FIGURE.recruitingMonths),
  }
}

/** A month ahead's projected starts: the projection at its end less at the month before's end. */
function monthProjectedCard(b: Built, m: Month, subtitle: string): CalcSpec {
  const p = b.h.projected?.get(m)
  const title = `Projected starts, ${monthLabel(m)}`
  const ids = p ? [...p.seats.keys()].sort() : []
  const value = b.h.projected ? (p ? p.openings + p.backfills : 0) : null
  return card(b, {
    title,
    subtitle,
    metricId: ID.recruitingProjectedStarts,
    value,
    format: 'num1',
    inputs: [
      calcInput(
        'Starts on Open and Planned seats at their fill rate',
        p?.openings ?? (value == null ? null : 0),
        'num2',
        PROJECTED_SOURCE,
      ),
      calcInput('Modeled backfills', p?.backfills ?? (value == null ? null : 0), 'num2', PROJECTED_SOURCE),
    ],
    steps:
      value == null
        ? [calcStep(NO_FORECAST_NOTE, 'No forecast to read', null, 'num1')]
        : [
            calcStep(
              'Projected starts = starts on Open and Planned seats + modeled backfills',
              `${plain(p?.openings ?? 0, 2)} + ${plain(p?.backfills ?? 0, 2)}`,
              value,
              'num1',
            ),
          ],
    rows: ids.length
      ? seatsDrill(b.h, title, ids, {
          weight: (pos: Position) => p?.seats.get(pos.positionId) ?? 0,
          note: 'Each seat counts as its starts at their fill rate and its backfills in the month.',
          noun: ['seat', 'seats'],
          uses: b.uses(FIGURE.recruitingProjected),
        })
      : null,
    note: PROJECTED_NOTE,
    uses: b.uses(FIGURE.recruitingProjected),
  })
}

/* ───────────── by quarter ahead ───────────── */

function quartersFigure(b: Built): FigureData<RecruitingQuarterRow> {
  const quarters = b.r.table.quarters
  const ahead = quarters
    .map((q, i) => ({ q, key: QUARTER_KEYS[i] as QuarterKey }))
    // A quarter Plan > Hiring reads as ahead that ends on the as-of date (no close) has nothing ahead.
    .filter((x) => x.q.kind === 'ahead' && x.q.end > b.ctx.asOf)
  const reach = new Map<QuarterKey, HeadsAhead>(ahead.map((x) => [x.key, headsAheadTo(b, x.q.end)]))
  const rows: RecruitingQuarterRow[] = ahead.map(({ q, key }) => {
    const x = reach.get(key) as HeadsAhead
    const gap = q.approved == null || x.heads == null ? null : x.heads - q.approved
    return {
      key,
      label: quarterRowLabel(b, q),
      approved: q.approved,
      futureStarts: q.accepted,
      movesIn: q.movesIn,
      leaving: x.leavingIds.length,
      pastStart: x.lateIds.length,
      preHires: x.preHireIds.length,
      projectedStarts: b.h.projected ? x.projected.total : null,
      projectedExits: q.expectedExits?.total ?? null,
      projectedHeads: x.heads,
      gap,
      gapNote: gap == null ? null : gapText(gap),
    }
  })
  const anyOf = (key: keyof RecruitingQuarterRow) => rows.some((r) => ((r[key] as number | null) ?? 0) !== 0)
  const anyMoves = anyOf('movesIn')
  const qOf = (r: RecruitingQuarterRow) => quarters[QUARTER_KEYS.indexOf(r.key)]
  const opensOf = (r: RecruitingQuarterRow, key: string): Opens => {
    const q = qOf(r)
    const x = reach.get(r.key)
    if (!q || !x) return NOTHING
    const sub = subtitleOf(quarterRowLabel(b, q), b.ctx.scopeLabel)
    switch (key) {
      case 'approved':
        return cellOf(b, 'approved', q)
      case 'futureStarts':
        return cellOf(b, 'accepted', q)
      case 'movesIn':
        return cellOf(b, 'moves', q)
      case 'pastStart':
        return futureStartsOpens(
          b,
          x.lateIds,
          `Signed offers past their start date, by ${quarterEndLabel(q)}`,
          sub,
        )
      case 'preHires': {
        const ids = new Set(x.preHireIds)
        const people = [...b.h.preHires.values()]
          .filter((p) => ids.has(p.id))
          .map((p) => ({ personId: p.personId, positionId: p.positionId, row: p.row }))
        return peopleCount(b, {
          title: `Hires, pre-hires in the HRIS by ${quarterEndLabel(q)}`,
          seatTitle: `Seats filled by pre-hires by ${quarterEndLabel(q)}`,
          people,
          value: r.preHires,
          metricId: ID.hiringHiresByMonth,
          subtitle: sub,
          uses: b.uses(FIGURE.hiringHires),
        })
      }
      case 'leaving':
        return peopleCount(b, {
          title: `Exits, last day on ${b.asOfLabel}`,
          seatTitle: `Seats left by exits on ${b.asOfLabel}`,
          people: [...leavingOnAsOf(b)],
          value: r.leaving,
          metricId: ID.hiringExitsByMonth,
          subtitle: sub,
          uses: b.uses(FIGURE.hiringLeavers),
        })
      case 'projectedStarts':
        return {
          drill: null,
          calc: () => projectedCard(b, q.end, `Projected starts by ${quarterEndLabel(q)}`, sub),
        }
      case 'projectedExits':
        return { drill: null, calc: () => exitsCard(b, q, `Projected attrition by ${quarterEndLabel(q)}`) }
      case 'projectedHeads':
        return { drill: null, calc: () => headsCard(b, x, `Projected heads at ${quarterEndLabel(q)}`, sub) }
      case 'gap':
        return { drill: null, calc: () => gapCard(b, q, x) }
      default:
        return NOTHING
    }
  }
  const col = (
    key: keyof RecruitingQuarterRow & string,
    label: string,
    format: 'int' | 'num1',
  ): Column<RecruitingQuarterRow> => ({
    key,
    label,
    format,
    align: 'right',
    drill: (r) => (r[key] == null ? null : opensOf(r, key).drill),
    calc: (r) => {
      if (r[key] == null) return null
      const o = opensOf(r, key)
      return o.drill ? null : o.calc
    },
  })
  const columns: Column<RecruitingQuarterRow>[] = [
    { key: 'label', label: 'Quarter' },
    col('approved', 'Approved heads by quarter end', 'int'),
    col('futureStarts', 'Future starts (signed offers)', 'int'),
    ...(anyMoves ? [col('movesIn', 'Moves in', 'int')] : []),
    ...(anyOf('pastStart') ? [col('pastStart', 'Signed offers past their start date', 'int')] : []),
    ...(anyOf('preHires') ? [col('preHires', 'Pre-hires in the HRIS', 'int')] : []),
    ...(anyOf('leaving') ? [col('leaving', `Last day on ${b.asOfLabel}`, 'int')] : []),
    col('projectedStarts', 'Projected starts (model)', 'num1'),
    col('projectedExits', 'Projected attrition', 'num1'),
    col('projectedHeads', 'Projected heads at quarter end', 'num1'),
    col('gap', 'Gap to approved', 'num1'),
    { key: 'gapNote', label: 'Short or over', format: 'text' },
  ]
  const fy = b.r.table.fiscalYear
  const H = b.r.table.heads.total
  return {
    id: PLAN_FIGURES.recruitingQuarters,
    metric: ID.recruitingGap,
    title: 'By quarter ahead',
    // No quarter left (a year that is over): no span to name, and no note under the empty text (RU-7).
    subtitle: rows.length
      ? `From ${b.asOfLabel} to each quarter end of ${fy}: approved heads, the future starts (signed offers), projected starts (model) and projected attrition due by then, and projected heads against approved. Heads only.`
      : `Each quarter ahead of ${fy}: approved heads, future starts, projected starts, projected attrition and projected heads. Heads only.`,
    rows,
    columns,
    note: rows.length
      ? `${anyMoves ? 'Future starts, moves in and projected attrition are Plan > Hiring’s' : 'Future starts and projected attrition are Plan > Hiring’s'}; projected starts are the forecast’s model. Projected heads begin at current heads, ${plural(H, 'head')} on ${b.asOfLabel}; the parts are rounded to one decimal, so they can be 0.1 off the total.`
      : null,
    empty: rows.length ? null : `Every quarter of ${fy} is over.`,
    uses: b.uses(FIGURE.recruitingQuarters),
  }
}

/* ───────────── where hiring happened ───────────── */

/**
 * One kind of Plan > Hiring's sub-totals with a hire, ranked by hires; a tie keeps that table's order
 * (names alphabetically, "No location" and "No department" last, C37's F6). The sort is stable.
 */
export function rankWhere(
  rows: readonly HiringRecentRow[],
  kind: 'location' | 'department',
): HiringRecentRow[] {
  return rows.filter((r) => r.kind === kind && r.total > 0).sort((x, y) => y.total - x.total)
}

/** The places beyond the top 5 with as many hires as the fifth (review RN-7); null when none ties at the cut. */
export function whereTieOf(ranked: readonly HiringRecentRow[]): WhereTie | null {
  if (ranked.length <= WHERE_TOP) return null
  const fifth = ranked[WHERE_TOP - 1].total
  const tied = ranked.slice(WHERE_TOP).filter((r) => r.total === fifth).length
  return tied ? { tied, hires: fifth } : null
}

function whereFigure(
  b: Built,
  recent: FigureData<HiringRecentRow>,
): {
  figure: FigureData<RecruitingWhereRow>
  more: { locations: number; departments: number }
  ties: { locations: WhereTie | null; departments: WhereTie | null }
} {
  const bySource = new Map<string, HiringRecentRow>()
  const locations = rankWhere(recent.rows, 'location')
  const departments = rankWhere(recent.rows, 'department')
  const rowOf = (r: HiringRecentRow, kind: 'location' | 'department'): RecruitingWhereRow => {
    bySource.set(r.key, r)
    return {
      key: r.key,
      kind,
      kindText: kind === 'location' ? 'Location' : 'Department',
      name: kind === 'location' ? r.location : r.department,
      hires: r.total,
      perMonth: r.perMonth,
    }
  }
  const rows = [
    ...locations.slice(0, WHERE_TOP).map((r) => rowOf(r, 'location')),
    ...departments.slice(0, WHERE_TOP).map((r) => rowOf(r, 'department')),
  ]
  const totalCol = recent.columns.find((c) => c.key === 'total')
  const perMonthCol = recent.columns.find((c) => c.key === 'perMonth')
  const columns: Column<RecruitingWhereRow>[] = [
    { key: 'kindText', label: 'Location or department', format: 'text' },
    { key: 'name', label: 'Name' },
    {
      key: 'hires',
      label: 'Hires, last 3 months',
      format: 'int',
      align: 'right',
      drill: (r) => {
        const s = bySource.get(r.key)
        return s && totalCol?.drill ? totalCol.drill(s) : null
      },
      calc: (r) => {
        const s = bySource.get(r.key)
        return s && totalCol?.calc ? totalCol.calc(s) : null
      },
    },
    {
      key: 'perMonth',
      label: 'Hires per month',
      format: 'num1',
      align: 'right',
      calc: (r) => {
        const s = bySource.get(r.key)
        return s && perMonthCol?.calc ? perMonthCol.calc(s) : null
      },
    },
  ]
  const more = {
    locations: Math.max(0, locations.length - WHERE_TOP),
    departments: Math.max(0, departments.length - WHERE_TOP),
  }
  const ties = { locations: whereTieOf(locations), departments: whereTieOf(departments) }
  const months = planHiringModel(b.ctx).recentMonths
  const span = months.length ? `${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}` : ''
  return {
    figure: {
      id: PLAN_FIGURES.recruitingWhere,
      metric: ID.hiringRecentHires,
      title: 'Where hiring happened',
      subtitle: months.length
        ? `The top ${WHERE_TOP} locations and departments by hires in ${span}, from Plan > Hiring’s table of hires by location and department. Heads only.`
        : `The top ${WHERE_TOP} locations and departments by hires over the last 3 closed months. Heads only.`,
      rows: recent.empty ? [] : rows,
      columns,
      note: null,
      empty: recent.empty ?? (rows.length ? null : `No hire in ${span}.`),
      uses: b.uses(FIGURE.hiringRecent),
    },
    more,
    ties,
  }
}

/* ───────────── the model ───────────── */

/** Plan > Recruiting summary's model for a context (uncached; `planRecruitingModel` caches it). */
export function computeRecruiting(ctx: AnalyticsContext): PlanRecruiting {
  const b = hiringBuiltOf(ctx)
  const hiring = planHiringModel(ctx)
  const fyEnd = b.over ? null : headsAheadTo(b, b.h.fyEnd)
  const kpis = kpisOf(b, fyEnd)
  const where = whereFigure(b, hiring.recent)
  return {
    fiscalYear: b.r.table.fiscalYear,
    kpis,
    months: monthsFigure(b),
    quarters: quartersFigure(b),
    where: where.figure,
    whereMore: where.more,
    whereTies: where.ties,
    deckNumbers: deckNumbersOf(kpis),
  }
}

/** The projection to a day, for the consistency tests: Plan > Hiring's S, M and E to it, and the projected starts. */
export function recruitingProjectionOf(
  ctx: AnalyticsContext,
  end: ISODate,
): {
  heads: number | null
  projected: number
  future: number
  moves: number
  exits: number
  leaving: number
  late: number
  preHires: number
} {
  const x = headsAheadTo(hiringBuiltOf(ctx), end)
  return {
    heads: x.heads,
    projected: x.projected.total,
    future: x.futureIds.length,
    moves: x.moveIds.length,
    exits: x.exits.total,
    leaving: x.leavingIds.length,
    late: x.lateIds.length,
    preHires: x.preHireIds.length,
  }
}
