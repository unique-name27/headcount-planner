/**
 * Plan > Hiring's model (docs/PLAN.md 9.7, change C36), built by `planHiringModel` (./hiringTab.ts)
 * from the engine (src/plan/engine/hiring.ts `hiringOf`) over the context's input (./hiringData.ts):
 * the six key figures, open to hire by quarter (the table and its small bar chart), hiring velocity
 * with its pace note, and the readout. Heads only, in every mode.
 *
 * Counted numbers drill to exactly their rows (./hiringDrills.ts: seats, people where the mode lists
 * them and else the seats they hold, accepted offers with dates only); formulas and modeled numbers
 * (open to hire, new to hire, expected exits, to reach plan, the paces, attrition, months to close)
 * open a calculation card whose last step is the value. The six tiles open their cards, as 9.7's
 * screen asks; a counted card lists its records too.
 *
 * Readings taken here (the tab builder, hiring wave):
 *  - "Over by n" sits beside a negative open to hire (cells, bars and the headline's note); the value
 *    stays the number, so exports and sorting read it, and nothing reads it as a target.
 *  - A pace card lists the hires (or exits) of its 3 closed months, each counting as 1/3, so the
 *    records add up to the pace; a forecast month's starts list the seats the forecast starts, each
 *    counting as its probability; expected exits list the seats, each counting as its known exit
 *    and its modeled exits.
 *  - In Manager mode no exit or hire date shows beside a seat (`workers.hireDate` and
 *    `workers.terminationDate` are hidden there): findings name the seats, never the day.
 *  - The readout raises, by severity then in this order, at most 3: exits outpacing hires over the
 *    last 3 closed months; open to hire not closing at the 3-month pace, or closing after the fiscal
 *    year end; the first quarter ahead behind its needed pace by half a hire a month or more (less is
 *    the rounding of modeled exits on a small team); openings past their target start (Plan >
 *    Openings' own list); and open to hire below 0 at the year end.
 *  - Card expressions write their numbers ungrouped ("1610 − 1456 − 22"), so a company's count never
 *    reads as an amount; prose puts the count word after a grouped number ("1,610 heads").
 *
 * Readings the review fixes took (25 Oct 2026, docs/CONTRACTS-HIRING.md 5.2):
 *  - The seat view's note and card step name only the terms that are not 0, each in its own words,
 *    so the numbers in "138 open seats less 6 people not in plan and 1 person in a seat that ends by
 *    the quarter end" always work out to open to hire (V1); the O(q) card names the seats an approved
 *    change ends before the quarter end and those whose accepted start is after the year end (V6).
 *  - To reach plan below 0 reads "Over by 0.8"; hires needed shows 0 with "Nothing to hire" there
 *    (the engine's value stays below 0), and "Backfills only" where nothing is open and the gap is
 *    under half a hire a month (V7, V18).
 *  - A year whose last quarter is over reads "FY27 is over" on its open and accepted tiles, with
 *    cards ending at 0; a quarter over with a month not closed reads "(ended)" (V8).
 *  - With no 3 closed months, the paces and months to close say the pace needs them, and never that
 *    exits outrun hires (V9); these tiles open their cards with no value (`calcWhenEmpty`, V16).
 *  - Accepted starts with a move into the scope among them open a card, since a move holds no req
 *    (V5); a finding in a year that does not hold the as-of date names the year (V4).
 *  - Hires and exits are read by event (person and day), so a rehire's stints list apart (V3).
 */
import { findingsInMode, kpisInMode } from '@/access/numbers'
import type { Column } from '@/charts/types'
import type { Finding, FindingPosition, Kpi, Severity } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf, monthEnd } from '@/data/fiscal'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { ISODate, Month } from '@/data/schema'
import { type CalcInput, type CalcSpec, type CalcStep, calcInput, calcStep } from '@/drill/calc'
import { asOfLine, subtitleOf } from '@/drill/subtitle'
import type { DrillSpec } from '@/drill/types'
import { addDays, formatDate, formatMonthShort } from '@/lib/dates'
import { DASH, type Format, fmt, MINUS, plural } from '@/lib/format'
import {
  firstHeadDay,
  type HiringMonth,
  type HiringQuarter,
  type HiringResult,
  type HiringSeatView,
  hiringOf,
  PACE_EPSILON,
  PACE_MONTHS,
  TRAILING_MONTHS,
} from '@/plan/engine/hiring'
import type { Position } from '@/plan/types'
import type { FigureData } from '../../types'
import { ID } from '../metrics'
import { monthLabel } from './base'
import { positionsFor } from './drill'
import { tagFindings, tagKpis } from './drillUses'
import { PLAN_FIGURES } from './figures'
import { type HiringPersonRow, type HiringPrep, hiringPrepOf, isMoveIn } from './hiringData'
import { eventRows, listsPeople, offersDrill, peopleDrill, peopleOf, seatsDrill } from './hiringDrills'
import {
  behindByGap,
  HIRING_KPIS,
  HIRING_ROWS,
  HISTORY_NOTE,
  type HiringOpenRow,
  type HiringQuarterRow,
  type HiringRowKey,
  type HiringVelocityRow,
  hiringOpenLabel,
  NOT_CLOSING_TEXT,
  ON_PACE_TEXT,
  overByText,
  type PlanHiring,
  QUARTER_KEYS,
  type QuarterKey,
} from './hiringTab'
import { FIGURE } from './lineage'
import { openingsOf } from './openings'

/* ───────────── copy ───────────── */

/** Hires needed per month when to reach plan is 0 or less. */
export const NOTHING_TO_HIRE_TEXT = 'Nothing to hire'
/**
 * Hires needed per month where nothing is open to hire and the gap to the 3-month pace is under half
 * a hire a month: the backfills that modeled exits make on a small team, not a gap (review HU-10).
 */
export const BACKFILLS_ONLY_TEXT = 'Backfills only'
/** A pace that has fewer closed months than its window (H8). */
export const PACE_NEEDS_TEXT = 'The pace needs 3 closed months'
/** A closed quarter's column label: "Q1, Apr to Jun (closed)". */
export const closedLabel = (label: string): string => `${label} (closed)`
/** A quarter that is over with a month not closed yet: "Q3, Oct to Dec (ended)" (review HN-8, HU-3). */
export const endedLabel = (label: string): string => `${label} (ended)`
/** The table's note when a quarter that is over has no close (its heads come from the HRIS). */
export const ENDED_NOTE =
  'Closed and ended quarters show actual heads at the quarter end and the quarter’s hires and exits. An ended quarter has a month not closed yet, so its heads come from the HRIS.'
/** The table's note when a history quarter has no heads at its end. */
export const NO_HEADS_NOTE = 'Heads at a quarter end show once its months are closed.'
/** The tiles' note for a fiscal year whose last quarter is over: "FY27 is over". */
export const yearOverText = (fy: string): string => `${fy} is over`
/** The pace card's records: each one a third of the pace. */
const PACE_RECORDS_NOTE = 'Each counts as 1/3: the pace is a monthly average over 3 closed months.'

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }
const LIST_CAP = 50
/** The readout names a quarter behind its needed pace from half a hire a month (less is a rounding of modeled exits). */
const BEHIND_FINDING = 0.5

/* ───────────── shared reading ───────────── */

interface Built {
  h: HiringPrep
  r: HiringResult
  ctx: AnalyticsContext
  /** "30 Sep 2026". */
  asOfLabel: string
  /** The closed months the paces read, oldest first, and their hires and exits. */
  pace: { months: readonly HiringMonth[]; hires: number; exits: number }
  /** The last quarter (the year end) and its open to hire. */
  end: HiringQuarter
  /** The year shown is over: its last quarter is history (H23). */
  over: boolean
  /** The year shown does not hold the as-of date: findings name it ("Q1 FY28 end"). */
  otherYear: boolean
  uses: (...groups: readonly (readonly FieldRef[])[]) => FieldRef[]
}

const quarterEndLabel = (q: HiringQuarter) => `${q.label} end (${formatDate(q.end)})`
/** "Over by 0.8": a to reach plan below 0 at one decimal, never "Over by 0.0". */
const overByNum1 = (v: number): string => {
  const shown = fmt(Math.abs(v), 'num1')
  return `Over by ${shown === fmt(0, 'num1') ? 'less than 0.1' : shown}`
}
/** "Q3, Oct to Dec". */
const quarterSpan = (q: HiringQuarter) =>
  `${q.label}, ${formatMonthShort(q.start)} to ${formatMonthShort(q.end)}`
const num1 = (v: number | null | undefined) => fmt(v, 'num1')
/** A number as an expression writes it: no grouping, so a count of 1,000 or more never reads as an amount. */
const plain = (v: number | null | undefined, digits = 0): string =>
  v == null ? DASH : `${v < 0 ? MINUS : ''}${Math.abs(v).toFixed(digits)}`

/** The quarter before one, or null for the first. */
const previousOf = (b: Built, q: HiringQuarter): HiringQuarter | null =>
  b.r.table.quarters.find((x) => x.quarter === q.quarter - 1) ?? null

/* ───────────── cards ───────────── */

function card(
  b: Built,
  spec: {
    title: string
    subtitle?: string
    metricId: string
    value: number | null
    format: Format
    inputs: CalcInput[]
    steps: CalcStep[]
    rows?: DrillSpec | null
    comparison?: { label: string; value: number | null }
    note?: string
    uses: readonly FieldRef[]
  },
): CalcSpec {
  return {
    title: spec.title,
    subtitle: spec.subtitle ?? asOfLine(b.ctx.asOf, b.ctx.scopeLabel),
    metricId: spec.metricId,
    value: spec.value,
    format: spec.format,
    inputs: spec.inputs,
    steps: spec.steps,
    ...(spec.rows ? { rows: spec.rows } : {}),
    ...(spec.comparison ? { comparison: spec.comparison } : {}),
    ...(spec.note ? { note: spec.note } : {}),
    uses: spec.uses,
  }
}

const SOURCE = {
  seats: 'Approved seats in Working, in scope',
  people: 'Employees in the HRIS on the as-of date, in scope',
  offers: 'Reqs at Offer accepted, not started (dates only)',
  forecast: 'The Working forecast, in heads',
  hris: 'Hire dates and last days in the HRIS, in scope',
} as const

/** "a, b and c". */
const andList = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/** One term of the seat view that is not 0: its sign, count, words for a note, step label and input. */
interface SeatTerm {
  sign: '−' | '+'
  value: number
  words: string
  label: string
  input: string
}

/**
 * The seat view's terms that are not 0 (`HiringSeatView`), each with its own words (review HN-1,
 * HU-11, HU-13): on clean data only people not in plan, so the note reads "138 open seats less 6
 * people not in plan" and the step "138 − 6".
 */
function seatTerms(sv: HiringSeatView): SeatTerm[] {
  const out: SeatTerm[] = []
  const less = (value: number, words: string, label: string, input: string) => {
    if (value > 0) out.push({ sign: '−', value, words, label, input })
  }
  less(
    sv.notInPlan,
    `${plural(sv.notInPlan, 'person', 'people')} not in plan`,
    'people not in plan',
    'People not in plan (they count against approved heads)',
  )
  less(
    sv.elsewhere,
    `${plural(sv.elsewhere, 'person', 'people')} in a seat that is not an approved head`,
    'people in seats that are not approved heads',
    'People in seats that are not approved heads (a seat an approved move holds)',
  )
  less(
    sv.inEndedSeats,
    `${plural(sv.inEndedSeats, 'person', 'people')} in a seat that ends by the quarter end`,
    'people in seats that end',
    'People in seats that stop being approved heads by the quarter end',
  )
  less(
    sv.otherStarts,
    `${plural(sv.otherStarts, 'accepted start')} on a seat that is not open`,
    'accepted starts on seats that are not open',
    'Accepted starts on seats that are not open (a Filled seat, or one that ends)',
  )
  if (sv.rest > 0)
    out.push({
      sign: '+',
      value: sv.rest,
      words: `${plural(sv.rest, 'Filled seat')} with no current head on it`,
      label: 'Filled seats with no current head',
      input: 'Filled seats with no current head on them (a move or a start the HRIS has not recorded)',
    })
  else if (sv.rest < 0)
    less(
      -sv.rest,
      `${plural(-sv.rest, 'second holder or offer', 'second holders or offers')} on one seat`,
      'second holders or offers on one seat',
      'Second holders or offers on one seat',
    )
  return out
}

/** The seat view as a note: "138 open seats less 6 people not in plan", "2 open seats", "No open seat". */
export function seatViewNote(sv: HiringSeatView | null | undefined, openSeats: number): string {
  const head = openSeats === 0 ? 'No open seat' : plural(openSeats, 'open seat')
  const terms = sv ? seatTerms(sv) : []
  const minus = terms.filter((t) => t.sign === '−').map((t) => t.words)
  const plus = terms.filter((t) => t.sign === '+').map((t) => t.words)
  let text = head
  if (minus.length) text += ` less ${andList(minus)}`
  if (plus.length) text += `${minus.length ? ',' : ''} plus ${andList(plus)}`
  return text
}

/** Seats in scope an approved change ends before a quarter end (out of A(q), H2), or whose accepted start is after the year end (H22). */
function seatsOutOf(b: Built, q: HiringQuarter): { ended: number; late: number } {
  let ended = 0
  let late = 0
  for (const seat of b.h.input.seats) {
    if (seat.acceptedStart && seat.acceptedStart > b.h.fyEnd) late++
    else if (
      seat.lastApprovedDay != null &&
      seat.lastApprovedDay < q.end &&
      firstHeadDay(seat, b.ctx.asOf) <= q.end
    )
      ended++
  }
  return { ended, late }
}

/** Accepted starts that are moves into the scope, not offers (review HN-5). */
const movesIn = (ids: readonly string[]): number => ids.filter((id) => isMoveIn(id)).length

/** Open to hire at a quarter end: approved heads − current heads − accepted starts, with the seat view. */
function openCard(b: Built, q: HiringQuarter, title = `Open to hire by ${quarterEndLabel(q)}`): CalcSpec {
  const t = b.r.table
  const H = t.heads
  const value = q.open
  const sv = q.seatView ?? null
  const terms = sv ? seatTerms(sv) : []
  const exact = value != null && q.openSeats === value && value > 0
  const out = seatsOutOf(b, q)
  const moves = movesIn(q.acceptedIds)
  const dateOf = formatDate(q.end)
  return card(b, {
    title,
    metricId: q === b.end ? ID.hiringOpen : ID.hiringOpenByQuarter,
    value,
    format: 'int',
    inputs: [
      calcInput('Approved heads by the quarter end', q.approved, 'int', SOURCE.seats),
      ...(out.ended
        ? [
            calcInput(
              `Seats an approved change ends by ${dateOf} (not counted)`,
              out.ended,
              'int',
              SOURCE.seats,
            ),
          ]
        : []),
      ...(out.late && q === b.end
        ? [
            calcInput(
              `Seats whose accepted start is after ${formatDate(b.h.fyEnd)} (not counted)`,
              out.late,
              'int',
              SOURCE.offers,
            ),
          ]
        : []),
      calcInput('Current heads', H.total, 'int', SOURCE.people),
      calcInput('People in approved seats', H.inApprovedSeats, 'int', SOURCE.people),
      calcInput('Accepted starts by the quarter end', q.accepted, 'int', SOURCE.offers),
      ...(moves ? [calcInput('Moves in among them (not offers)', moves, 'int', SOURCE.seats)] : []),
      calcInput('Seat view: open seats with no accepted start', q.openSeats, 'int', SOURCE.seats),
      ...terms.map((x) => calcInput(x.input, x.value, 'int', SOURCE.people)),
    ],
    steps: [
      ...(sv
        ? [
            calcStep(
              `Seat view = open seats${terms.map((x) => ` ${x.sign} ${x.label}`).join('')}`,
              `${plain(sv.openSeats)}${terms.map((x) => ` ${x.sign} ${plain(x.value)}`).join('')}`,
              terms.reduce((a, x) => a + (x.sign === '+' ? x.value : -x.value), sv.openSeats),
              'int',
            ),
          ]
        : []),
      calcStep(
        'Open to hire = approved heads − current heads − accepted starts',
        `${plain(q.approved)} − ${plain(H.total)} − ${plain(q.accepted)}`,
        value,
        'int',
      ),
    ],
    rows: exact ? seatsDrill(b.h, `Open seats by ${quarterEndLabel(q)}`, q.openSeatIds) : null,
    note:
      value != null && value < 0
        ? `${overByText(value)}: current heads and accepted starts are above approved heads. It is not a hiring target.`
        : `The seat view: ${seatViewNote(sv, q.openSeats ?? 0)
            .replace(/^No open seat/, 'no open seat')
            .replace(/^(\d[\d,]* open seats?)/, '$1 with no accepted start')}.`,
    uses: b.uses(FIGURE.hiringOpen),
  })
}

/** The headline's card when the year shown is over (H23): nothing is left to hire in it. */
function yearOverCard(b: Built, metricId: string, title: string): CalcSpec {
  const fy = b.r.table.fiscalYear
  return card(b, {
    title,
    metricId,
    value: 0,
    format: 'int',
    inputs: [calcInput(`Quarters of ${fy} still ahead`, 0, 'int', 'The calendar')],
    steps: [calcStep(`${yearOverText(fy)}: nothing is left to hire in it`, 'Nothing left to hire', 0, 'int')],
    note: `${yearOverText(fy)}. Pick a later fiscal year to see what is left to hire.`,
    uses: b.uses(FIGURE.hiringOpen),
  })
}

function newCard(b: Built, q: HiringQuarter): CalcSpec {
  const prev = previousOf(b, q)
  const first = !prev || prev.kind === 'history'
  const from = b.r.table.openBefore ?? { on: b.ctx.asOf, open: b.r.table.openNow }
  const fromNow = from.on === b.ctx.asOf
  const before = first ? from.open : prev.open
  return card(b, {
    title: `New to hire in ${quarterSpan(q)}`,
    metricId: ID.hiringNewByQuarter,
    value: q.newToHire,
    format: 'int',
    inputs: [
      calcInput(`Open to hire by ${quarterEndLabel(q)}`, q.open, 'int', SOURCE.seats),
      first
        ? fromNow
          ? calcInput('Open to hire now (approved heads now − current heads)', before, 'int', SOURCE.seats)
          : calcInput(
              `Open to hire on ${formatDate(from.on)}, the day before the quarter (approved heads then − current heads − accepted starts by then)`,
              before,
              'int',
              SOURCE.seats,
            )
        : calcInput(
            `Open to hire by ${prev ? quarterEndLabel(prev) : 'the quarter before'}`,
            before,
            'int',
            SOURCE.seats,
          ),
    ],
    steps: [
      calcStep(
        first
          ? fromNow
            ? 'New to hire = open to hire by the quarter end − open to hire now'
            : 'New to hire = open to hire by the quarter end − on the day before it starts'
          : 'New to hire = open to hire by this quarter end − by the one before',
        `${plain(q.open)} − ${plain(before)}`,
        q.newToHire,
        'int',
      ),
    ],
    ...(first && !fromNow
      ? {
          note: `What comes due in the quarter. Open to hire before it, from now to ${formatDate(from.on)}, is ${plural(before ?? 0, 'head')}.`,
        }
      : {}),
    uses: b.uses(FIGURE.hiringOpen),
  })
}

/** The months of the forecast whose month-end falls after the as-of date and on or before a day. */
function forecastMonthsTo(b: Built, end: ISODate): Month[] {
  return b.h.input.forecast
    .filter((f) => monthEnd(f.month) > b.ctx.asOf && monthEnd(f.month) <= end)
    .map((f) => f.month)
}

/** The known exits from the as-of date to a day, as rows (each stint its own, HN-3). */
const knownExitRows = (b: Built, end: ISODate): HiringPersonRow[] =>
  eventRows(b.h.exits, b.h.input.exits, addDays(b.ctx.asOf, 1), end)

/** The exits dated in a month, as rows. */
const monthRows = (b: Built, which: 'hires' | 'exits', m: Month): HiringPersonRow[] =>
  eventRows(
    which === 'hires' ? b.h.hires : b.h.exits,
    which === 'hires' ? b.h.input.hires : b.h.input.exits,
    `${m}-01`,
    monthEnd(m),
  )

/**
 * The seats behind expected exits: each known exit's seat counts 1, each seat its modeled exits. Null
 * when a known exit holds no seat (a person not in plan): its card then counts them in words.
 */
function exitSeatsDrill(
  b: Built,
  title: string,
  known: readonly HiringPersonRow[],
  months: readonly Month[],
) {
  if (known.some((x) => !x.positionId)) return null
  const w = new Map<string, number>()
  for (const x of known) if (x.positionId) w.set(x.positionId, (w.get(x.positionId) ?? 0) + 1)
  for (const m of months)
    for (const [id, v] of b.h.flows?.get(m)?.exitSeats ?? []) w.set(id, (w.get(id) ?? 0) + v)
  const ids = [...w.keys()].sort()
  return seatsDrill(b.h, title, ids, {
    weight: (pos: Position) => w.get(pos.positionId) ?? 0,
    note: 'Each seat counts as its known exit and its modeled exits in the months.',
    noun: ['seat', 'seats'],
  })
}

/** The known exits' inputs beyond the HRIS last days: seats an approved change ends, moves out, people not in plan. */
function knownInputs(known: readonly HiringPersonRow[]): CalcInput[] {
  const n = (kind: HiringPersonRow['kind']) => known.filter((x) => x.kind === kind).length
  const out: CalcInput[] = []
  const add = (label: string, v: number, source: string) => {
    if (v) out.push(calcInput(label, v, 'int', source))
  }
  add('Of which in a seat an approved Elimination or Trade ends', n('seat-ends'), SOURCE.seats)
  add('Of which moving out of the scope', n('move-out'), SOURCE.hris)
  add('Of which people not in plan (no seat, no modeled exit)', n('not-in-plan'), SOURCE.people)
  return out
}

/** A note on the known exits that hold no seat to list. */
const noSeatNote = (known: readonly HiringPersonRow[]): string | null => {
  const n = known.filter((x) => !x.positionId).length
  return n
    ? `${plural(n, 'person', 'people')} not in plan ${n === 1 ? 'is' : 'are'} among the known exits and ${n === 1 ? 'holds' : 'hold'} no seat to list.`
    : null
}

function exitsCard(b: Built, q: HiringQuarter): CalcSpec {
  const e = q.expectedExits
  const months = forecastMonthsTo(b, q.end)
  const known = knownExitRows(b, q.end)
  const span = months.length
    ? `${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}`
    : 'No open forecast month'
  const noSeat = noSeatNote(known)
  return card(b, {
    title: `Expected exits by ${quarterEndLabel(q)}`,
    metricId: ID.hiringExpectedExits,
    value: e?.total ?? null,
    format: 'num1',
    inputs: [
      calcInput('Known exits (last days already known)', e?.known ?? null, 'int', SOURCE.hris),
      ...knownInputs(known),
      calcInput(`Modeled exits, ${span}`, e?.modeled ?? null, 'num2', SOURCE.forecast),
    ],
    steps: [
      calcStep(
        'Expected exits = known + modeled',
        `${plain(e?.known)} + ${plain(e?.modeled, 2)}`,
        e?.total ?? null,
        'num1',
      ),
    ],
    rows: e ? exitSeatsDrill(b, `Expected exits by ${quarterEndLabel(q)}`, known, months) : null,
    note: [noSeat, 'Modeled exits are exact here; the table rounds them to one decimal.']
      .filter(Boolean)
      .join(' '),
    uses: b.uses(FIGURE.hiringExits),
  })
}

function toReachCard(b: Built, q: HiringQuarter): CalcSpec {
  const over = q.toReachPlan != null && q.toReachPlan < -PACE_EPSILON
  return card(b, {
    title: `To hire to reach plan by ${quarterEndLabel(q)}`,
    metricId: ID.hiringToReachPlan,
    value: q.toReachPlan,
    format: 'num1',
    inputs: [
      calcInput('Open to hire by the quarter end', q.open, 'int', SOURCE.seats),
      calcInput('Expected exits by the quarter end', q.expectedExits?.total ?? null, 'num2', SOURCE.forecast),
    ],
    steps: [
      calcStep(
        'To reach plan = open to hire + expected exits',
        `${plain(q.open)} + ${plain(q.expectedExits?.total, 2)}`,
        q.toReachPlan,
        'num1',
      ),
    ],
    note: over
      ? `${overByNum1(q.toReachPlan as number)}: current heads and accepted starts stay above approved heads after the expected exits. It is not a hiring target.`
      : 'The expected exits are the backfills it takes to stay at approved heads.',
    uses: b.uses(FIGURE.hiringOpen, FIGURE.hiringExits),
  })
}

/** "On pace", "Behind by 0.7 a month", "Backfills only" or "Nothing to hire". */
function paceWords(q: HiringQuarter): string | null {
  switch (q.paceStatus) {
    case 'on-pace':
      return ON_PACE_TEXT
    case 'behind':
      // Nothing open to hire and a gap under half a hire a month: the modeled backfills of a small team (HU-10).
      return (q.open ?? 0) <= 0 && (q.behindBy ?? 0) < BEHIND_FINDING
        ? BACKFILLS_ONLY_TEXT
        : behindByGap(q.behindBy ?? 0)
    case 'nothing-to-hire':
      return NOTHING_TO_HIRE_TEXT
    default:
      return null
  }
}

/** Hires needed per month as the table shows it: 0 when there is nothing to hire (the engine's value can be below 0, H24). */
const neededShown = (q: HiringQuarter): number | null =>
  q.neededPace == null ? null : q.paceStatus === 'nothing-to-hire' ? 0 : q.neededPace

function neededCard(b: Built, q: HiringQuarter): CalcSpec {
  const pace3 = b.r.velocity.paces.hires3
  const words = paceWords(q)
  const shown = neededShown(q)
  return card(b, {
    title: `Hires needed per month to reach plan by ${quarterEndLabel(q)}`,
    metricId: ID.hiringNeededPace,
    value: shown,
    format: 'num1',
    inputs: [
      calcInput('To hire to reach plan', q.toReachPlan, 'num2', SOURCE.seats),
      calcInput(`Month-ends from ${b.asOfLabel} to the quarter end`, q.monthsLeft, 'int', 'The calendar'),
      calcInput('Hiring pace (last 3 closed months)', pace3, 'num2', SOURCE.hris),
    ],
    steps:
      q.neededPace == null
        ? [calcStep('No month-end is left before the quarter end', 'No month left', null, 'num1')]
        : q.paceStatus === 'nothing-to-hire'
          ? [
              calcStep(
                'To reach plan is 0 or below: nothing to hire',
                `${plain(q.toReachPlan, 2)} to reach plan`,
                0,
                'num1',
              ),
            ]
          : [
              calcStep(
                'Hires needed per month = to reach plan ÷ months left',
                `${plain(q.toReachPlan, 2)} ÷ ${plain(q.monthsLeft)}`,
                q.neededPace,
                'num1',
              ),
            ],
    comparison: { label: 'Hiring pace, last 3 closed months', value: pace3 },
    ...(words
      ? {
          note:
            words === ON_PACE_TEXT
              ? `${words}: the 3-month hiring pace meets it.`
              : words === BACKFILLS_ONLY_TEXT
                ? `${words}: nothing is open to hire, and the gap to the 3-month pace is the modeled exits’ backfills.`
                : `${words}.`,
        }
      : {}),
    uses: b.uses(FIGURE.hiringOpen, FIGURE.hiringExits, FIGURE.hiringFlows),
  })
}

/* ───────────── people behind the counts ───────────── */

const headsAtEnd = (b: Built, q: HiringQuarter): readonly HiringPersonRow[] =>
  b.h.headsAt.get(q.end.slice(0, 7) as Month) ?? []

/** What a number opens, built on click: its records, else its calculation card. */
interface Opens {
  drill: (() => DrillSpec | null) | null
  calc: (() => CalcSpec) | null
}

const NOTHING: Opens = { drill: null, calc: null }

/** A count of people: its records, or (Manager mode, someone with no seat) a card that counts them. */
function peopleCount(
  b: Built,
  spec: {
    title: string
    seatTitle: string
    people: readonly HiringPersonRow[]
    value: number | null
    metricId: string
    subtitle?: string
    note?: string
    uses: readonly FieldRef[]
  },
): Opens {
  if (listsPeople(b.h) || spec.people.every((x) => x.positionId))
    return {
      drill: () =>
        peopleDrill(b.h, spec.title, spec.people, {
          seatTitle: spec.seatTitle,
          ...(spec.subtitle ? { subtitle: spec.subtitle } : {}),
          ...(spec.note ? { note: spec.note } : {}),
          uses: spec.uses,
        }),
      calc: null,
    }
  const inSeats = spec.people.filter((x) => x.positionId).length
  return {
    drill: null,
    calc: () =>
      card(b, {
        title: spec.title,
        ...(spec.subtitle ? { subtitle: spec.subtitle } : {}),
        metricId: spec.metricId,
        value: spec.value,
        format: 'int',
        inputs: [
          calcInput('People in seats in scope', inSeats, 'int', SOURCE.people),
          calcInput('People not in plan', spec.people.length - inSeats, 'int', SOURCE.people),
        ],
        steps: [
          calcStep(
            'People counted',
            `${plain(inSeats)} + ${plain(spec.people.length - inSeats)}`,
            spec.value,
            'int',
          ),
        ],
        note: `${spec.note ? `${spec.note} ` : ''}People are not listed in this mode, and people not in plan hold no seat to list.`,
        uses: spec.uses,
      }),
  }
}

/** Current heads' split as a note (9.7: "Shown with its split"): "1,450 heads in approved seats and 6 people not in plan." (review HU-12). */
function headsSplitNote(b: Built): string {
  const H = b.r.table.heads
  // A count word after every number, so a company-wide count never reads as an amount (T10).
  const parts = [
    `${plural(H.inApprovedSeats, 'head')} in approved seats`,
    `${plural(H.notInPlan, 'person', 'people')} not in plan`,
  ]
  if (H.elsewhere)
    parts.push(`${plural(H.elsewhere, 'person', 'people')} in seats that are not approved heads`)
  return `${andList(parts)}.`
}

/** Accepted starts: their reqs (dates only), or a card when moves in are among them (they hold no req, HN-5). */
function acceptedOpens(b: Built, ids: readonly string[], title: string): Opens {
  const moves = movesIn(ids)
  const offerIds = ids.filter((id) => !isMoveIn(id))
  if (!moves)
    return {
      drill: () => offersDrill(b.h, title, offerIds, { uses: b.uses(FIGURE.hiringAccepted) }),
      calc: null,
    }
  return { drill: null, calc: () => acceptedCard(b, ids, title, ID.hiringAcceptedStarts) }
}

/** The accepted starts card: accepted offers, plus moves into the scope that have not started (HN-5). */
function acceptedCard(b: Built, ids: readonly string[], title: string, metricId: string): CalcSpec {
  const moves = movesIn(ids)
  const offerIds = ids.filter((id) => !isMoveIn(id))
  const offers = offerIds.length
  const word = (n: number) => (n === 1 ? 'offer' : 'offers')
  return card(b, {
    title,
    metricId,
    value: ids.length,
    format: 'int',
    inputs: [
      calcInput('Accepted offers', offers, 'int', SOURCE.offers),
      ...(moves
        ? [
            calcInput(
              'Moves in (an internal move into a seat in scope, not started)',
              moves,
              'int',
              SOURCE.seats,
            ),
          ]
        : []),
    ],
    steps: [
      calcStep(
        moves ? 'Accepted starts = accepted offers + moves in' : 'Accepted starts',
        moves
          ? `${plain(offers)} ${word(offers)} + ${plain(moves)} ${moves === 1 ? 'move' : 'moves'}`
          : `${plain(offers)} ${word(offers)}`,
        ids.length,
        'int',
      ),
    ],
    ...(moves ? {} : { rows: offersDrill(b.h, title, offerIds, { uses: b.uses(FIGURE.hiringAccepted) }) }),
    note: moves
      ? 'Only the dates show: an offer’s terms come from the recruiting system. A move in holds no req, so the card counts it.'
      : 'Only the dates show: an offer’s terms come from the recruiting system.',
    uses: b.uses(FIGURE.hiringAccepted),
  })
}

/* ───────────── the quarter table ───────────── */

/** A cell's records or card, by row and quarter. */
function cellOf(b: Built, key: HiringRowKey, q: HiringQuarter): Opens {
  const none = NOTHING
  const sub = subtitleOf(quarterSpan(q), b.ctx.scopeLabel)
  const t = b.r.table
  if (q.kind === 'history') {
    switch (key) {
      case 'current':
        return peopleCount(b, {
          title: `Heads at ${quarterEndLabel(q)}`,
          seatTitle: `Seats of the actual heads at ${quarterEndLabel(q)}`,
          people: headsAtEnd(b, q),
          value: q.actualHeads,
          metricId: ID.hiringCurrentHeads,
          subtitle: asOfLine(q.end, b.ctx.scopeLabel),
          uses: b.uses(FIGURE.hiringHeads),
        })
      case 'hires':
        return peopleCount(b, {
          title: `Hires in ${quarterSpan(q)}`,
          seatTitle: `Seats filled by hires in ${quarterSpan(q)}`,
          people: eventRows(b.h.hires, b.h.input.hires, q.start, q.end),
          value: q.hires,
          metricId: ID.hiringHiresByMonth,
          subtitle: sub,
          note: 'Employees hired into a seat in scope; internal moves and transfers are not hires.',
          uses: b.uses(FIGURE.hiringHires),
        })
      case 'exitsActual':
        return peopleCount(b, {
          title: `Exits in ${quarterSpan(q)}`,
          seatTitle: `Seats left by exits in ${quarterSpan(q)}`,
          people: eventRows(b.h.exits, b.h.input.exits, q.start, q.end),
          value: q.exits,
          metricId: ID.hiringExitsByMonth,
          subtitle: sub,
          note: 'Employees whose last day falls in the quarter, from a seat in scope; a move is not an exit.',
          uses: b.uses(FIGURE.hiringLeavers),
        })
      default:
        return none
    }
  }
  switch (key) {
    case 'approved':
      return {
        drill: () =>
          seatsDrill(b.h, `Approved heads by ${quarterEndLabel(q)}`, q.approvedIds, {
            note: 'Approved seats whose first head day is on or before the quarter end and that are still approved heads then.',
            uses: b.uses(FIGURE.hiringSeats),
          }),
        calc: null,
      }
    case 'current':
      return peopleCount(b, {
        title: 'Current heads',
        seatTitle: 'Seats of the current heads',
        people: peopleOf(b.h.current, t.heads.personIds),
        value: t.heads.total,
        metricId: ID.hiringCurrentHeads,
        note: headsSplitNote(b),
        uses: b.uses(FIGURE.hiringHeads),
      })
    case 'accepted':
      return acceptedOpens(b, q.acceptedIds, `Accepted starts by ${quarterEndLabel(q)}`)
    case 'open':
      return { drill: null, calc: () => openCard(b, q) }
    case 'new':
      return { drill: null, calc: () => newCard(b, q) }
    case 'exits':
      return { drill: null, calc: () => exitsCard(b, q) }
    case 'toReach':
      return { drill: null, calc: () => toReachCard(b, q) }
    case 'needed':
      return { drill: null, calc: () => neededCard(b, q) }
    default:
      return none
  }
}

function aheadValue(b: Built, key: HiringRowKey, q: HiringQuarter): number | null {
  switch (key) {
    case 'approved':
      return q.approved
    case 'current':
      return b.r.table.heads.total
    case 'accepted':
      return q.accepted
    case 'open':
      return q.open
    case 'new':
      return q.newToHire
    case 'exits':
      return q.expectedExits?.total ?? null
    case 'toReach':
      return q.toReachPlan
    case 'needed':
      return neededShown(q)
    default:
      return null
  }
}

function historyValue(key: HiringRowKey, q: HiringQuarter): number | null {
  switch (key) {
    case 'current':
      return q.actualHeads
    case 'hires':
      return q.hires
    case 'exitsActual':
      return q.exits
    default:
      return null
  }
}

/**
 * One row's note per quarter: "Over by 1" on a negative open to hire, "Over by 0.8" on a negative to
 * reach plan (never a hiring target, review HN-7), the pace words on hires needed.
 */
function notesOf(key: HiringRowKey, q: HiringQuarter, value: number | null): string | null {
  if (q.kind !== 'ahead') return null
  if (key === 'open') return value != null && value < 0 ? overByText(value) : null
  if (key === 'toReach') return value != null && value < -PACE_EPSILON ? overByNum1(value) : null
  if (key === 'needed') return paceWords(q)
  return null
}

/** A quarter's column label: "Q3, Oct to Dec", "Q1, Apr to Jun (closed)" or "Q3, Oct to Dec (ended)". */
export const quarterColumnLabel = (q: HiringQuarter): string =>
  q.kind === 'history'
    ? q.closed === false
      ? endedLabel(quarterSpan(q))
      : closedLabel(quarterSpan(q))
    : quarterSpan(q)

/** The table's note on its history quarters (closed, ended, heads missing). */
function historyNote(quarters: readonly HiringQuarter[]): string | null {
  const history = quarters.filter((q) => q.kind === 'history')
  if (!history.length) return null
  const base = history.some((q) => q.closed === false) ? ENDED_NOTE : HISTORY_NOTE
  return history.some((q) => q.actualHeads == null) ? `${base} ${NO_HEADS_NOTE}` : base
}

/**
 * The quarter table: one measure per row (`HIRING_ROWS`), a cell per quarter, the cell notes, and
 * `notesText` (the notes as one text for tables and exports: "Q2: Over by 1. Q4: On pace.").
 */
function quarterTable(b: Built): FigureData<HiringQuarterRow> {
  const quarters = b.r.table.quarters
  const qOf = new Map<QuarterKey, HiringQuarter>(quarters.map((q, i) => [QUARTER_KEYS[i], q]))
  const rows: HiringQuarterRow[] = HIRING_ROWS.map((def) => {
    const cells: Record<QuarterKey, number | null> = { q1: null, q2: null, q3: null, q4: null }
    const notes: Partial<Record<QuarterKey, string>> = {}
    for (const k of QUARTER_KEYS) {
      const q = qOf.get(k)
      if (!q) continue
      const v =
        q.kind === 'ahead'
          ? def.ahead
            ? aheadValue(b, def.key, q)
            : null
          : def.history
            ? historyValue(def.key, q)
            : null
      cells[k] = v
      const n = notesOf(def.key, q, v)
      if (n) notes[k] = n
    }
    const notesText = QUARTER_KEYS.filter((k) => notes[k])
      .map((k) => `${qOf.get(k)?.label}: ${notes[k]}`)
      .join('. ')
    return {
      key: def.key,
      label: def.label,
      metric: def.metric,
      format: def.format,
      ...cells,
      notes,
      notesText: notesText ? `${notesText}.` : '',
    }
  })
  const cellFor = (k: QuarterKey) => (r: HiringQuarterRow) => {
    const q = qOf.get(k)
    if (!q || r[k] == null) return null
    return q
  }
  const columns: Column<HiringQuarterRow>[] = [
    { key: 'label', label: 'Measure' },
    ...QUARTER_KEYS.map((k): Column<HiringQuarterRow> => {
      const q = qOf.get(k)
      const label = q ? quarterColumnLabel(q) : k
      return {
        key: k,
        label,
        format: (r: HiringQuarterRow) => r.format,
        align: 'right',
        drill: (r: HiringQuarterRow) => {
          const qq = cellFor(k)(r)
          return qq ? cellOf(b, r.key, qq).drill : null
        },
        calc: (r: HiringQuarterRow) => {
          const qq = cellFor(k)(r)
          if (!qq) return null
          const c = cellOf(b, r.key, qq)
          return c.drill ? null : c.calc
        },
      }
    }),
    { key: 'notesText', label: 'Notes', format: 'text' },
  ]
  return {
    id: PLAN_FIGURES.hiringQuarters,
    metric: ID.hiringOpenByQuarter,
    title: 'Open to hire by quarter',
    subtitle: `Approved heads by each quarter end of ${b.r.table.fiscalYear}, less current heads on ${b.asOfLabel} and the accepted starts due by then. Heads only.`,
    rows,
    columns,
    note: historyNote(quarters),
    empty: quarters.length ? null : 'No quarter to show.',
    uses: b.uses(FIGURE.hiringQuarters),
  }
}

/* ───────────── open to hire by quarter (the small chart) ───────────── */

function openByQuarter(b: Built): FigureData<HiringOpenRow> {
  const rows: HiringOpenRow[] = b.r.table.quarters.map((q, i) => ({
    key: QUARTER_KEYS[i],
    label: q.label,
    kind: q.kind,
    open: q.kind === 'ahead' ? q.open : null,
    note:
      q.kind === 'history'
        ? q.closed === false
          ? 'Ended quarter'
          : 'Closed quarter'
        : q.open != null && q.open < 0
          ? overByText(q.open)
          : null,
  }))
  const qOf = (r: HiringOpenRow) => b.r.table.quarters[QUARTER_KEYS.indexOf(r.key)]
  const columns: Column<HiringOpenRow>[] = [
    { key: 'label', label: 'Quarter' },
    {
      key: 'open',
      label: 'Open to hire',
      format: 'int',
      calc: (r) => {
        const q = qOf(r)
        return q && q.kind === 'ahead' ? () => openCard(b, q) : null
      },
    },
    { key: 'note', label: 'Note', format: 'text' },
  ]
  const ahead = rows.filter((r) => r.kind === 'ahead')
  return {
    id: PLAN_FIGURES.hiringOpen,
    metric: ID.hiringOpenByQuarter,
    title: 'Open to hire at each quarter end',
    subtitle: `${b.r.table.fiscalYear}, quarters ahead. Below 0 reads "Over by" and is not a hiring target.`,
    rows,
    columns,
    note: null,
    empty: ahead.length ? null : `Every quarter of ${b.r.table.fiscalYear} is over.`,
    uses: b.uses(FIGURE.hiringOpen),
  }
}

/* ───────────── velocity ───────────── */

function forecastStartsDrill(b: Built, m: Month, title: string) {
  const seats = b.h.flows?.get(m)?.startSeats
  if (!seats?.size) return null
  return seatsDrill(b.h, title, [...seats.keys()].sort(), {
    weight: (pos: Position) => seats.get(pos.positionId) ?? 0,
    note: 'Each seat counts as its probability to start in the month; an accepted offer counts 1.',
    noun: ['seat', 'seats'],
  })
}

function velocityFigure(b: Built): FigureData<HiringVelocityRow> {
  const months = b.r.velocity.months
  const rows: (HiringVelocityRow & { kindText: string })[] = months.map((m) => ({
    month: m.month,
    label: monthLabel(m.month),
    kind: m.kind,
    hires: m.hires,
    exits: m.exits,
    net: m.net,
    kindText: m.kind === 'actual' ? 'Actual' : 'Forecast',
  }))
  const byMonth = new Map(months.map((m) => [m.month, m]))
  const fmtOf = (r: HiringVelocityRow): Format => (r.kind === 'actual' ? 'int' : 'num1')
  const sub = (r: HiringVelocityRow) => subtitleOf(r.label, b.ctx.scopeLabel)
  const actualCount = (r: HiringVelocityRow, which: 'hires' | 'exits'): Opens => {
    const m = byMonth.get(r.month)
    if (!m) return NOTHING
    return which === 'hires'
      ? peopleCount(b, {
          title: `Hires, ${r.label}`,
          seatTitle: `Seats filled by hires, ${r.label}`,
          people: monthRows(b, 'hires', m.month),
          value: m.hires,
          metricId: ID.hiringHiresByMonth,
          subtitle: sub(r),
          note: 'Employees hired into a seat in scope; internal moves and transfers are not hires.',
          uses: b.uses(FIGURE.hiringHires),
        })
      : peopleCount(b, {
          title: `Exits, ${r.label}`,
          seatTitle: `Seats left by exits, ${r.label}`,
          people: monthRows(b, 'exits', m.month),
          value: m.exits,
          metricId: ID.hiringExitsByMonth,
          subtitle: sub(r),
          note: 'Employees whose last day falls in the month, from a seat in scope; a move is not an exit.',
          uses: b.uses(FIGURE.hiringLeavers),
        })
  }
  const forecastCard = (r: HiringVelocityRow, which: 'hires' | 'exits' | 'net'): CalcSpec | null => {
    const m = byMonth.get(r.month)
    if (!m) return null
    const f = b.h.input.forecast.find((x) => x.month === r.month)
    if (which === 'hires')
      return card(b, {
        title: `Expected starts, ${r.label}`,
        subtitle: sub(r),
        metricId: ID.hiringHiresByMonth,
        value: m.hires,
        format: 'num1',
        inputs: [
          calcInput('Expected starts (probability-weighted)', f?.starts ?? null, 'num2', SOURCE.forecast),
        ],
        steps: [calcStep('The forecast’s starts in the month', plain(f?.starts, 2), m.hires, 'num1')],
        rows: forecastStartsDrill(b, r.month, `Expected starts, ${r.label}`),
        uses: b.uses(FIGURE.hiringVelocity),
      })
    if (which === 'exits') {
      const known = monthRows(b, 'exits', r.month)
      const noSeat = noSeatNote(known)
      return card(b, {
        title: `Expected exits, ${r.label}`,
        subtitle: sub(r),
        metricId: ID.hiringExitsByMonth,
        value: m.exits,
        format: 'num1',
        inputs: [
          calcInput('Known exits', m.exitIds.length, 'int', SOURCE.hris),
          ...knownInputs(known),
          calcInput('Modeled exits', f?.modeledExits ?? null, 'num2', SOURCE.forecast),
        ],
        steps: [
          calcStep(
            'Expected exits = known + modeled',
            `${plain(m.exitIds.length)} + ${plain(f?.modeledExits, 2)}`,
            m.exits,
            'num1',
          ),
        ],
        rows: exitSeatsDrill(b, `Expected exits, ${r.label}`, known, [r.month]),
        ...(noSeat ? { note: noSeat } : {}),
        uses: b.uses(FIGURE.hiringVelocity),
      })
    }
    return netCard(b, r, m)
  }
  const netCard = (b2: Built, r: HiringVelocityRow, m: HiringMonth): CalcSpec =>
    card(b2, {
      title: `Net hiring, ${r.label}`,
      subtitle: sub(r),
      metricId: ID.hiringNetPace,
      value: m.net,
      format: fmtOf(r),
      inputs: [
        calcInput(
          m.kind === 'actual' ? 'Hires' : 'Expected starts',
          m.hires,
          fmtOf(r),
          m.kind === 'actual' ? SOURCE.hris : SOURCE.forecast,
        ),
        calcInput(
          m.kind === 'actual' ? 'Exits' : 'Expected exits',
          m.exits,
          fmtOf(r),
          m.kind === 'actual' ? SOURCE.hris : SOURCE.forecast,
        ),
      ],
      steps: [
        calcStep(
          'Net = hires − exits',
          `${plain(m.hires, m.kind === 'actual' ? 0 : 2)} − ${plain(m.exits, m.kind === 'actual' ? 0 : 2)}`,
          m.net,
          fmtOf(r),
        ),
      ],
      uses: b2.uses(FIGURE.hiringVelocity),
    })
  const columns: Column<HiringVelocityRow>[] = [
    { key: 'label', label: 'Month', sortValue: (r) => r.month },
    { key: 'kindText', label: 'Actual or forecast', format: 'text' },
    ...(['hires', 'exits'] as const).map(
      (which): Column<HiringVelocityRow> => ({
        key: which,
        label: which === 'hires' ? 'Hires (expected starts ahead)' : 'Exits (expected ahead)',
        format: fmtOf,
        drill: (r) => (r.kind === 'actual' ? actualCount(r, which).drill : null),
        calc: (r) => {
          if (r.kind !== 'actual') return () => forecastCard(r, which)
          const c = actualCount(r, which)
          return c.drill ? null : c.calc
        },
      }),
    ),
    {
      key: 'net',
      label: 'Net',
      format: fmtOf,
      calc: (r) => {
        const m = byMonth.get(r.month)
        return m ? () => netCard(b, r, m) : null
      },
    },
  ]
  const actual = months.filter((m) => m.kind === 'actual')
  return {
    id: PLAN_FIGURES.hiringVelocity,
    metric: ID.hiringPace,
    title: 'Hiring velocity',
    subtitle: actual.length
      ? `Hires and exits in each of the last ${TRAILING_MONTHS} closed months, then the forecast’s expected starts and exits to the end of ${b.r.table.fiscalYear}. Heads only.`
      : `The forecast’s expected starts and exits to the end of ${b.r.table.fiscalYear}, until a month is closed. Heads only.`,
    rows,
    columns,
    note: actual.length ? null : 'No closed month yet.',
    empty: months.length ? null : 'No closed or forecast month to show.',
    uses: b.uses(FIGURE.hiringVelocity),
  }
}

/** The note under the velocity chart: the 3- and 6-month paces and attrition, in heads. */
function paceNoteOf(b: Built): string | null {
  const v = b.r.velocity.paces
  const parts: string[] = []
  const [short, long] = PACE_MONTHS
  parts.push(
    v.hires3 == null
      ? `The ${short}-month pace needs ${short} closed months.`
      : `${short}-month pace: ${num1(v.hires3)} hires and ${num1(v.exits3)} exits a month, net ${num1(v.net3)}.`,
  )
  parts.push(
    v.hires6 == null
      ? `The ${long}-month pace needs ${long} closed months.`
      : `${long}-month pace: ${num1(v.hires6)} hires and ${num1(v.exits6)} exits a month, net ${num1(v.net6)}.`,
  )
  parts.push(
    v.attrition == null
      ? `Attrition (heads) needs ${TRAILING_MONTHS} closed months with heads at each month-end.`
      : `Attrition (heads): ${fmt(v.attrition, 'pct')}, ${plural(v.exits12 ?? 0, 'exit')} over the last ${TRAILING_MONTHS} closed months against ${num1(v.averageHeads12)} heads on average.`,
  )
  return parts.join(' ')
}

/* ───────────── key figures ───────────── */

function paceCard(b: Built, which: 'hires' | 'exits'): CalcSpec {
  const v = b.r.velocity.paces
  const value = which === 'hires' ? v.hires3 : v.exits3
  const ms = b.pace.months
  const counts = ms.map((m) => (which === 'hires' ? m.hires : m.exits))
  const people = ms.flatMap((m) => monthRows(b, which, m.month))
  const name = which === 'hires' ? 'Hires' : 'Exits'
  const span = ms.length ? `${monthLabel(ms[0].month)} to ${monthLabel(ms[ms.length - 1].month)}` : ''
  const rows =
    value != null && people.length
      ? peopleDrill(b.h, `${name}, ${span}`, people, {
          seatTitle: `Seats ${which === 'hires' ? 'filled by hires' : 'left by exits'}, ${span}`,
          subtitle: subtitleOf(span, b.ctx.scopeLabel),
          note: PACE_RECORDS_NOTE,
          each: 1 / PACE_MONTHS[0],
          uses: b.uses(which === 'hires' ? FIGURE.hiringHires : FIGURE.hiringLeavers),
        })
      : null
  return card(b, {
    title: `${name} per month, ${PACE_MONTHS[0]}-month pace`,
    metricId: which === 'hires' ? ID.hiringPace : ID.hiringExitPace,
    value,
    format: 'num1',
    inputs: ms.map((m) =>
      calcInput(
        `${name} in ${monthLabel(m.month)}`,
        which === 'hires' ? m.hires : m.exits,
        'int',
        SOURCE.hris,
      ),
    ),
    steps:
      value == null
        ? [
            calcStep(
              `The pace needs ${PACE_MONTHS[0]} closed months`,
              'Not enough closed months',
              null,
              'num1',
            ),
          ]
        : [
            calcStep(
              `${name} per month = their sum ÷ ${PACE_MONTHS[0]}`,
              `(${counts.join(' + ')}) ÷ ${PACE_MONTHS[0]}`,
              value,
              'num1',
            ),
          ],
    ...(rows ? { rows } : {}),
    note:
      (which === 'hires' ? v.hires6 : v.exits6) == null
        ? `The ${PACE_MONTHS[1]}-month pace needs ${PACE_MONTHS[1]} closed months.`
        : `${PACE_MONTHS[1]}-month pace: ${num1(which === 'hires' ? v.hires6 : v.exits6)} a month.`,
    uses: b.uses(which === 'hires' ? FIGURE.hiringHires : FIGURE.hiringLeavers),
  })
}

function netCardKpi(b: Built): CalcSpec {
  const v = b.r.velocity.paces
  return card(b, {
    title: 'Net hiring pace',
    metricId: ID.hiringNetPace,
    value: v.net3,
    format: 'num1',
    inputs: [
      calcInput(
        `Hires in the last ${PACE_MONTHS[0]} closed months`,
        b.pace.months.length ? b.pace.hires : null,
        'int',
        SOURCE.hris,
      ),
      calcInput(
        `Exits in the last ${PACE_MONTHS[0]} closed months`,
        b.pace.months.length ? b.pace.exits : null,
        'int',
        SOURCE.hris,
      ),
    ],
    steps:
      v.net3 == null
        ? [
            calcStep(
              `The pace needs ${PACE_MONTHS[0]} closed months`,
              'Not enough closed months',
              null,
              'num1',
            ),
          ]
        : [
            calcStep(
              `Net hiring pace = (hires − exits) ÷ ${PACE_MONTHS[0]}`,
              `(${b.pace.hires} − ${b.pace.exits}) ÷ ${PACE_MONTHS[0]}`,
              v.net3,
              'num1',
            ),
          ],
    note:
      v.net6 == null
        ? `The ${PACE_MONTHS[1]}-month pace needs ${PACE_MONTHS[1]} closed months.`
        : `${PACE_MONTHS[1]}-month net pace: ${num1(v.net6)} a month.`,
    uses: b.uses(FIGURE.hiringFlows),
  })
}

function monthsToCloseCard(b: Built): CalcSpec {
  const mtc = b.r.monthsToClose
  const open = b.r.table.openFyEnd
  const v = b.r.velocity.paces
  const steps: CalcStep[] =
    open <= 0
      ? [calcStep('Nothing is open to hire this fiscal year', `${plain(open)} open to hire`, 0, 'num1')]
      : v.net3 == null
        ? [calcStep(PACE_NEEDS_TEXT, 'Not enough closed months', null, 'num1')]
        : mtc.closing
          ? [
              calcStep(
                'Months to close = open to hire ÷ net hiring pace',
                `${plain(open)} ÷ ((${b.pace.hires} − ${b.pace.exits}) ÷ ${PACE_MONTHS[0]})`,
                mtc.months,
                'num1',
              ),
            ]
          : [calcStep('Not closing at this pace', 'Exits match or outrun hires', null, 'num1')]
  return card(b, {
    title: 'Months to close at this pace',
    metricId: ID.hiringMonthsToClose,
    value: mtc.closing ? mtc.months : null,
    format: 'num1',
    inputs: [
      calcInput(`Open to hire, ${b.r.table.fiscalYear}`, open, 'int', SOURCE.seats),
      calcInput('Net hiring pace (last 3 closed months)', v.net3, 'num2', SOURCE.hris),
    ],
    steps,
    ...(open > 0 && !mtc.closing ? { note: v.net3 == null ? `${PACE_NEEDS_TEXT}.` : NOT_CLOSING_TEXT } : {}),
    uses: b.uses(FIGURE.hiringMonthsToClose),
  })
}

const kpiDef = (id: (typeof HIRING_KPIS)[number]['id']) => {
  const d = HIRING_KPIS.find((k) => k.id === id)
  if (!d) throw new Error(`No hiring tile ${id}`)
  return d
}

function kpisOf(b: Built): Kpi[] {
  const t = b.r.table
  const v = b.r.velocity.paces
  const mtc = b.r.monthsToClose
  const text = (id: string) => b.h.p.text(id)
  const goodOf = (id: string) => b.ctx.metrics.def(id)?.goodDirection ?? null
  const end = b.end
  const tile = (
    id: (typeof HIRING_KPIS)[number]['id'],
    rest: Omit<Kpi, 'id' | 'metricId' | 'label' | 'tab' | 'definition' | 'goodDirection'> & {
      label?: string
    },
  ): Kpi => {
    const d = kpiDef(id)
    return {
      id: d.id,
      metricId: d.metricId,
      label: rest.label ?? d.label,
      tab: 'hiring',
      definition: text(d.metricId),
      goodDirection: goodOf(d.metricId),
      ...rest,
    }
  }
  const open = t.openFyEnd
  const fyEndLabel = formatDate(b.h.fyEnd)
  const fy = t.fiscalYear
  const over = yearOverText(fy)
  const moves = movesIn(end.acceptedIds)
  const offers = end.acceptedIds.length - moves
  const startsText = moves
    ? `${plural(offers, 'offer')} accepted and ${plural(moves, 'move')} in to start by then`
    : `${plural(t.acceptedToCome, 'offer')} accepted to start by then`
  // A tile whose value is "—" still opens its card, which says why (review HU-8).
  const emptyCard = { calcWhenEmpty: true } as const
  const tiles: Kpi[] = [
    tile('hiring-open', {
      label: hiringOpenLabel(fy),
      value: open,
      format: 'int',
      note: b.over ? over : open < 0 ? overByText(open) : seatViewNote(end.seatView, end.openSeats ?? 0),
      formula: b.over
        ? `${over}: nothing is left to hire in it.`
        : `${plural(end.approved ?? 0, 'head')} approved by ${fyEndLabel} − ${plural(t.heads.total, 'head')} now − ${startsText}.`,
      calc: () =>
        b.over
          ? yearOverCard(b, ID.hiringOpen, `Open to hire, ${fy}`)
          : openCard(b, end, `Open to hire, ${fy}`),
      uses: b.uses(FIGURE.hiringOpen),
    }),
    tile('hiring-accepted', {
      value: t.acceptedToCome,
      format: 'int',
      note: b.over ? over : 'Dates only: terms come from the recruiting system',
      formula: b.over
        ? `${over}: no start is left to come in it.`
        : moves
          ? `Accepted offers on approved seats, and moves into the scope, starting after ${b.asOfLabel} and by ${fyEndLabel}.`
          : `Accepted offers on approved seats starting after ${b.asOfLabel} and by ${fyEndLabel}.`,
      calc: () =>
        b.over
          ? yearOverCard(b, ID.hiringAcceptedStarts, 'Accepted starts to come')
          : acceptedCard(b, end.acceptedIds, 'Accepted starts to come', ID.hiringAcceptedStarts),
      uses: b.uses(FIGURE.hiringAccepted),
    }),
    tile('hiring-pace', {
      value: v.hires3,
      format: 'num1',
      note:
        v.hires3 == null
          ? `The 3-month pace needs 3 closed months`
          : v.hires6 == null
            ? 'The 6-month pace needs 6 closed months'
            : `6-month pace: ${num1(v.hires6)}`,
      formula:
        v.hires3 == null
          ? 'Hires in the last 3 closed months ÷ 3; it needs 3 closed months.'
          : `Hires in the last 3 closed months ÷ 3: ${b.pace.hires} ÷ 3.`,
      calc: () => paceCard(b, 'hires'),
      ...emptyCard,
      uses: b.uses(FIGURE.hiringHires),
    }),
    tile('hiring-exit-pace', {
      value: v.exits3,
      format: 'num1',
      note:
        v.exits3 == null
          ? `The 3-month pace needs 3 closed months`
          : v.exits6 == null
            ? 'The 6-month pace needs 6 closed months'
            : `6-month pace: ${num1(v.exits6)}`,
      formula:
        v.exits3 == null
          ? 'Exits in the last 3 closed months ÷ 3; it needs 3 closed months.'
          : `Exits in the last 3 closed months ÷ 3: ${b.pace.exits} ÷ 3.`,
      calc: () => paceCard(b, 'exits'),
      ...emptyCard,
      uses: b.uses(FIGURE.hiringLeavers),
    }),
    tile('hiring-net-pace', {
      value: v.net3,
      format: 'num1',
      note:
        v.attrition == null
          ? 'Attrition (heads) needs 12 closed months'
          : `Attrition (heads) ${fmt(v.attrition, 'pct')} over 12 closed months`,
      formula: 'Hiring pace − exit pace, over the last 3 closed months.',
      calc: () => netCardKpi(b),
      ...emptyCard,
      uses: b.uses(FIGURE.hiringFlows),
    }),
    tile('hiring-months-to-close', {
      value: mtc.closing ? mtc.months : null,
      format: 'num1',
      note: b.over
        ? over
        : open <= 0
          ? 'Nothing open to hire this fiscal year'
          : v.net3 == null
            ? PACE_NEEDS_TEXT
            : mtc.closing
              ? `${plural(open, 'head')} open at ${num1(v.net3)} net hires a month`
              : NOT_CLOSING_TEXT,
      formula: 'Open to hire this fiscal year ÷ the net hiring pace, while the net pace is above 0.',
      calc: () => monthsToCloseCard(b),
      ...emptyCard,
      uses: b.uses(FIGURE.hiringMonthsToClose),
    }),
  ]
  return tagKpis(kpisInMode(b.ctx.access, tiles))
}

/* ───────────── readout ───────────── */

function seatList(b: Built, ids: readonly string[], note: (id: string) => string): FindingPosition[] {
  return positionsFor(b.h.p, ids.slice(0, LIST_CAP)).map((pos) => ({
    positionId: pos.positionId,
    title: pos.title ?? pos.positionId,
    note: note(pos.positionId),
  }))
}

function findingsOf(b: Built): Finding[] {
  const t = b.r.table
  const v = b.r.velocity.paces
  const mtc = b.r.monthsToClose
  const out: Finding[] = []
  const span = b.pace.months.length
    ? `${monthLabel(b.pace.months[0].month)} to ${monthLabel(b.pace.months[b.pace.months.length - 1].month)}`
    : ''

  // Exits outpace hires over the last 3 closed months.
  if (v.net3 != null && v.net3 < 0) {
    const people = b.pace.months.flatMap((m) => monthRows(b, 'exits', m.month))
    const seats = [...new Set(people.map((x) => x.positionId).filter((x): x is string => !!x))].sort()
    out.push({
      id: 'hiring-exits-outpace',
      metricId: ID.hiringNetPace,
      severity: 'warning',
      title: 'Exits outpace hires over the last 3 closed months.',
      detail: `${num1(v.exits3)} exits a month against ${num1(v.hires3)} hires, ${span}.`,
      positions: seatList(b, seats, () => 'Exit in the last 3 closed months'),
      positionsTotal: seats.length,
      drill: () =>
        peopleDrill(b.h, `Exits, ${span}`, people, {
          seatTitle: `Seats left by exits, ${span}`,
          subtitle: subtitleOf(span, b.ctx.scopeLabel),
        }),
      tab: 'hiring',
      uses: b.uses(FIGURE.hiringLeavers),
    })
  }

  // Open to hire not closing at this pace, or closing after the year end.
  const open = t.openFyEnd
  const left = b.end.kind === 'ahead' ? (b.end.monthsLeft ?? 0) : 0
  if (open > 0 && !mtc.closing && v.net3 != null)
    out.push({
      id: 'hiring-not-closing',
      metricId: ID.hiringMonthsToClose,
      severity: 'warning',
      title: `Open to hire for ${t.fiscalYear} is not closing at the 3-month pace.`,
      detail: `${plural(open, 'head')} open to hire. ${NOT_CLOSING_TEXT}`,
      calc: () => monthsToCloseCard(b),
      tab: 'hiring',
      uses: b.uses(FIGURE.hiringMonthsToClose),
    })
  else if (open > 0 && mtc.closing && mtc.months > left)
    out.push({
      id: 'hiring-closes-late',
      metricId: ID.hiringMonthsToClose,
      severity: 'warning',
      title: `At the 3-month pace, open to hire closes in ${num1(mtc.months)} months, after ${t.fiscalYear} end.`,
      detail: `${plural(open, 'head')} open to hire at ${num1(v.net3)} net hires a month, with ${plural(left, 'month-end')} left in ${t.fiscalYear}.`,
      calc: () => monthsToCloseCard(b),
      tab: 'hiring',
      uses: b.uses(FIGURE.hiringMonthsToClose),
    })

  // The first quarter ahead behind its needed pace.
  const behind = t.quarters.find(
    (q) => q.kind === 'ahead' && q.paceStatus === 'behind' && (q.behindBy ?? 0) >= BEHIND_FINDING,
  )
  // A year that does not hold the as-of date is named: "Q1 FY28 end" (review HU-9).
  const behindLabel = b.otherYear ? `${behind?.label} ${t.fiscalYear}` : behind?.label
  if (behind)
    out.push({
      id: `hiring-behind-${behind.label.toLowerCase()}`,
      metricId: ID.hiringNeededPace,
      severity: 'warning',
      title: `Reaching plan by ${behindLabel} end takes ${num1(behind.neededPace)} hires a month, against a 3-month pace of ${num1(v.hires3)}.`,
      detail: `${behindByGap(behind.behindBy ?? 0)}: to reach plan takes ${num1(behind.toReachPlan)} heads over ${plural(behind.monthsLeft ?? 0, 'month-end')}.`,
      calc: () => neededCard(b, behind),
      tab: 'hiring',
      uses: b.uses(FIGURE.hiringOpen, FIGURE.hiringExits, FIGURE.hiringFlows),
    })

  // Openings past their target start (Plan > Openings' own list).
  const past = openingsOf(b.h.p).pastStart
  if (past.length) {
    const ids = past.map((o) => o.positionId)
    const target = new Map(past.map((o) => [o.positionId, o.targetStart]))
    out.push({
      id: 'hiring-past-start',
      metricId: ID.openingsPastStart,
      severity: past.length >= 3 ? 'warning' : 'info',
      title: `${plural(past.length, 'opening is', 'openings are')} past ${past.length === 1 ? 'its' : 'their'} target start.`,
      detail: `Open and Planned seats whose target start is before ${b.asOfLabel}.`,
      positions: seatList(b, ids, (id) => `Target start ${formatDate(target.get(id) ?? null)}`),
      positionsTotal: ids.length,
      drill: () => seatsDrill(b.h, 'Openings past target start', ids, { uses: b.uses(FIGURE.pastStart) }),
      tab: 'openings',
      uses: b.uses(FIGURE.pastStart),
    })
  }

  // Over plan at the year end.
  if (open < 0)
    out.push({
      id: 'hiring-over',
      metricId: ID.hiringOpen,
      severity: 'info',
      title: `${overByText(open)} at ${t.fiscalYear} end: current heads and accepted starts are above approved heads.`,
      detail:
        'It is not a hiring target. People not in plan and accepted starts count against approved heads.',
      calc: () => openCard(b, b.end, `Open to hire, ${t.fiscalYear}`),
      tab: 'hiring',
      uses: b.uses(FIGURE.hiringOpen),
    })

  const ranked = out
    .map((f, i) => ({ f, i }))
    .sort((a, b2) => RANK[a.f.severity] - RANK[b2.f.severity] || a.i - b2.i)
    .slice(0, 3)
    .map((x) => x.f)
  return tagFindings(findingsInMode(b.ctx.access, ranked))
}

/* ───────────── the model ───────────── */

/** Plan > Hiring's model for a context (uncached; `planHiringModel` caches it). */
export function computeHiring(ctx: AnalyticsContext): PlanHiring {
  const h = hiringPrepOf(ctx)
  const r = hiringOf(h.input)
  const actual = r.velocity.months.filter((m) => m.kind === 'actual')
  const paceMonths = actual.length >= PACE_MONTHS[0] ? actual.slice(-PACE_MONTHS[0]) : []
  const end = r.table.quarters[r.table.quarters.length - 1]
  const b: Built = {
    h,
    r,
    ctx,
    asOfLabel: formatDate(ctx.asOf),
    pace: {
      months: paceMonths,
      hires: paceMonths.reduce((s, m) => s + m.hires, 0),
      exits: paceMonths.reduce((s, m) => s + m.exits, 0),
    },
    end,
    over: end.kind === 'history',
    otherYear: fiscalYearOf(ctx.asOf) !== r.table.fiscalYear,
    uses: h.p.uses,
  }
  return {
    fiscalYear: r.table.fiscalYear,
    kpis: kpisOf(b),
    findings: findingsOf(b),
    quarters: quarterTable(b),
    openByQuarter: openByQuarter(b),
    velocity: velocityFigure(b),
    paceNote: paceNoteOf(b),
  }
}
